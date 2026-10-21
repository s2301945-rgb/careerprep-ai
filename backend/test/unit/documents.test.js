import assert from "node:assert/strict";
import { test } from "node:test";
import { validateResumeFile, MAX_FILE_BYTES } from "../../src/documents.js";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

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
