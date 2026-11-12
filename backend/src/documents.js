import { ApiError } from "./errors.js";
import yauzl from "yauzl";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 64 * 1024;
export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAX_DOCX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_DOCX_TOTAL_BYTES = 150 * 1024 * 1024;
const REQUIRED_DOCX_ENTRIES = new Set(["[Content_Types].xml", "word/document.xml"]);

export function safeOriginalFilename(input) {
  if (typeof input !== "string") {
    throw new ApiError(422, "VALIDATION_FAILED", "Upload a PDF or DOCX file with a valid filename.");
  }

  const normalized = input.replace(/\\/g, "/").split("/").at(-1) ?? "";
  const filename = normalized
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .normalize("NFC")
    .trim();
  if (!filename || filename === "." || filename === ".." || Array.from(filename).length > 255) {
    throw new ApiError(422, "VALIDATION_FAILED", "Upload a PDF or DOCX file with a valid filename.");
  }
  return filename;
}

function isPdf(buffer) {
  if (buffer.length < 16) return false;
  const header = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
  const trailer = buffer.subarray(Math.max(0, buffer.length - 1024)).toString("latin1");
  return /%PDF-(?:1\.[0-7]|2\.0)/.test(header)
    && trailer.includes("%%EOF")
    && (buffer.includes(Buffer.from(" obj")) || buffer.includes(Buffer.from("/Type /Catalog")));
}

function readZipEntry(zipfile, entry, maxBytes) {
  return new Promise((resolve, reject) => {
    if (entry.uncompressedSize > maxBytes) {
      reject(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document has an unsupported internal structure."));
      return;
    }

    zipfile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed."));
        return;
      }

      const chunks = [];
      let bytes = 0;
      stream.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          stream.destroy(new Error("DOCX entry exceeds validation limit"));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", () => reject(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed.")));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

function inspectDocx(buffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let zipfile;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      zipfile?.close();
      reject(error instanceof ApiError
        ? error
        : new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed."));
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      autoClose: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    }, (error, openedZip) => {
      if (error || !openedZip) {
        fail(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed."));
        return;
      }
      zipfile = openedZip;
      const entries = new Map();
      let totalUncompressedBytes = 0;

      zipfile.on("error", () => fail(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed.")));
      zipfile.on("entry", async (entry) => {
        if (!entry.fileName || entry.fileName.includes("\\") || entry.fileName.startsWith("/")) {
          fail(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed."));
          return;
        }
        totalUncompressedBytes += entry.uncompressedSize;
        if (totalUncompressedBytes > MAX_DOCX_TOTAL_BYTES || entries.has(entry.fileName)) {
          fail(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document has an unsupported internal structure."));
          return;
        }

        if (!REQUIRED_DOCX_ENTRIES.has(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        entries.set(entry.fileName, entry);
        try {
          const content = await readZipEntry(zipfile, entry, MAX_DOCX_ENTRY_BYTES);
          entries.set(entry.fileName, content);
          zipfile.readEntry();
        } catch (entryError) {
          fail(entryError);
        }
      });
      zipfile.on("end", () => {
        if (settled) return;
        const contentTypes = entries.get("[Content_Types].xml");
        const documentXml = entries.get("word/document.xml");
        if (!Buffer.isBuffer(contentTypes) || !Buffer.isBuffer(documentXml)) {
          fail(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is missing required office document parts."));
          return;
        }
        const contentTypesText = contentTypes.toString("utf8");
        const documentText = documentXml.toString("utf8");
        const hasDocumentType = contentTypesText.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml");
        const hasDocumentRoot = /<(?:[A-Za-z_][\w.-]*:)?document(?:\s|>)/.test(documentText);
        if (!hasDocumentType || !hasDocumentRoot) {
          fail(new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed."));
          return;
        }
        succeed(true);
      });
      zipfile.readEntry();
    });
  });
}

export async function validateResumeFile({ filename, clientMimeType, buffer }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(422, "DOCUMENT_INVALID", "The uploaded document is empty or malformed.");
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Resume files must be 10 MiB or smaller.");
  }

  const safeFilename = safeOriginalFilename(filename);
  const extension = safeFilename.slice(safeFilename.lastIndexOf(".")).toLowerCase();
  const providedMime = (clientMimeType ?? "").toLowerCase();
  const acceptedClientTypes = new Set(["", "application/octet-stream", PDF_MIME, DOCX_MIME]);
  if (!acceptedClientTypes.has(providedMime)) {
    throw new ApiError(422, "DOCUMENT_INVALID", "Only PDF and DOCX resume files are supported.");
  }

  if (extension === ".pdf" && (providedMime === "" || providedMime === "application/octet-stream" || providedMime === PDF_MIME)) {
    if (!isPdf(buffer)) {
      throw new ApiError(422, "DOCUMENT_INVALID", "The PDF document is malformed or does not match its filename.");
    }
    return { filename: safeFilename, mimeType: PDF_MIME };
  }

  if (extension === ".docx" && (providedMime === "" || providedMime === "application/octet-stream" || providedMime === DOCX_MIME)) {
    if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
      throw new ApiError(422, "DOCUMENT_INVALID", "The DOCX document is malformed or does not match its filename.");
    }
    await inspectDocx(buffer);
    return { filename: safeFilename, mimeType: DOCX_MIME };
  }

  throw new ApiError(422, "DOCUMENT_INVALID", "The file extension and document format must both be PDF or DOCX.");
}

function decodeXml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name) => {
    if (name === "amp") return "&";
    if (name === "lt") return "<";
    if (name === "gt") return ">";
    if (name === "quot") return '"';
    if (name === "apos") return "'";
    const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function extractDocxText(buffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let zipfile;
    const fail = () => {
      if (settled) return;
      settled = true;
      zipfile?.close();
      reject(new ApiError(422, "TEXT_EXTRACTION_FAILED", "Text could not be extracted from this DOCX document."));
    };
    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      autoClose: true,
      validateEntrySizes: true,
      strictFileNames: true,
    }, (error, openedZip) => {
      if (error || !openedZip) return fail();
      zipfile = openedZip;
      let total = 0;
      zipfile.on("error", fail);
      zipfile.on("entry", (entry) => {
        total += entry.uncompressedSize;
        if (!entry.fileName || entry.fileName.includes("\\") || entry.fileName.startsWith("/")
          || total > MAX_DOCX_TOTAL_BYTES) return fail();
        if (entry.fileName !== "word/document.xml") {
          zipfile.readEntry();
          return;
        }
        if (entry.uncompressedSize > MAX_DOCX_ENTRY_BYTES) return fail();
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail();
          const chunks = [];
          let size = 0;
          stream.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_DOCX_ENTRY_BYTES) stream.destroy(new Error("DOCX text entry is too large"));
            else chunks.push(chunk);
          });
          stream.on("error", fail);
          stream.on("end", () => {
            if (settled) return;
            const xml = Buffer.concat(chunks).toString("utf8");
            const paragraphs = [...xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?p>/g)];
            const text = paragraphs.map(([, paragraph]) => {
              const withBreaks = paragraph
                .replace(/<(?:[A-Za-z_][\w.-]*:)?tab\b[^>]*\/?\s*>/g, "\t")
                .replace(/<(?:[A-Za-z_][\w.-]*:)?br\b[^>]*\/?\s*>/g, " ")
                .replace(/<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t>/g, "$1")
                .replace(/<[^>]+>/g, "");
              return decodeXml(withBreaks).replace(/\s+/g, " ").trim();
            }).filter(Boolean).join("\n").slice(0, 80_000);
            settled = true;
            zipfile.close();
            resolve(text);
          });
        });
      });
      zipfile.on("end", () => {
        if (!settled) fail();
      });
      zipfile.readEntry();
    });
  });
}

export async function extractResumeText({ mimeType, buffer }) {
  let text;
  if (mimeType === DOCX_MIME) {
    text = await extractDocxText(buffer);
  } else if (mimeType === PDF_MIME) {
    try {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdfjsPath = fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
      const standardFontDataUrl = `${path.resolve(path.dirname(pdfjsPath), "../../standard_fonts").replace(/\\/g, "/")}/`;
      const task = getDocument({
        data: new Uint8Array(buffer),
        isEvalSupported: false,
        stopAtErrors: true,
        standardFontDataUrl,
      });
      const pdf = await task.promise;
      if (pdf.numPages > 50) {
        await task.destroy();
        throw new ApiError(422, "DOCUMENT_TOO_COMPLEX", "This resume has more than 50 pages and cannot be processed.");
      }
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        page.cleanup();
      }
      await task.destroy();
      text = pages.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 80_000);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(422, "TEXT_EXTRACTION_FAILED", "Text could not be extracted from this PDF. Scanned image-only PDFs are not supported yet.");
    }
  } else {
    throw new ApiError(422, "DOCUMENT_INVALID", "Only PDF and DOCX resume files can be processed.");
  }

  if (typeof text !== "string" || text.replace(/\s/g, "").length < 30) {
    throw new ApiError(422, "TEXT_EXTRACTION_FAILED", "This file does not contain enough readable text to analyze. Scanned image-only PDFs are not supported yet.");
  }
  return text;
}
