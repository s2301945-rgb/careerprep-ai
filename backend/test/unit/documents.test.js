import assert from "node:assert/strict";
import { test } from "node:test";
import { extractResumeText, validateResumeFile, MAX_FILE_BYTES } from "../../src/documents.js";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [filename, value] of entries) {
    const name = Buffer.from(filename);
    const data = Buffer.from(value);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function textPdf(text) {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document);
}

test("accepts a PDF whose contents match its extension and MIME type", async () => {
  const result = await validateResumeFile({
    filename: "resume.pdf",
    clientMimeType: "application/pdf",
    buffer: PDF,
  });
  assert.deepEqual(result, { filename: "resume.pdf", mimeType: "application/pdf" });
});

test("rejects malformed, mislabeled, and oversized resume files", async () => {
  await assert.rejects(
    validateResumeFile({ filename: "resume.pdf", clientMimeType: "application/pdf", buffer: Buffer.from("not a pdf") }),
    { code: "DOCUMENT_INVALID" },
  );
  await assert.rejects(
    validateResumeFile({ filename: "resume.docx", clientMimeType: "application/pdf", buffer: PDF }),
    { code: "DOCUMENT_INVALID" },
  );
  await assert.rejects(
    validateResumeFile({ filename: "resume.pdf", clientMimeType: "application/pdf", buffer: Buffer.alloc(MAX_FILE_BYTES + 1) }),
    { code: "FILE_TOO_LARGE" },
  );
});

test("reduces client filenames to a safe basename before returning them", async () => {
  const result = await validateResumeFile({
    filename: "C:\\Users\\private\\resume.pdf",
    clientMimeType: "application/pdf",
    buffer: PDF,
  });
  assert.equal(result.filename, "resume.pdf");
});

test("extracts real text from a PDF using the backend parser", async () => {
  const source = "Jamie Cruz has five years of volunteer project coordination experience.";
  const text = await extractResumeText({ mimeType: "application/pdf", buffer: textPdf(source) });
  assert.match(text, /Jamie Cruz/);
  assert.match(text, /volunteer project coordination/);
});

test("extracts paragraph text and XML entities from a DOCX container", async () => {
  const xml = '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Jamie Cruz</w:t></w:r></w:p><w:p><w:r><w:t>Skills: SQL &amp; JavaScript. Built an app for 120 students.</w:t></w:r></w:p></w:body></w:document>';
  const buffer = zipBuffer([
    ["[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ["word/document.xml", xml],
  ]);
  const text = await extractResumeText({
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });
  assert.match(text, /Jamie Cruz/);
  assert.match(text, /SQL & JavaScript/);
  assert.match(text, /120 students/);
});
