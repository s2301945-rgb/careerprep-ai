import Busboy from "busboy";
import { Readable } from "node:stream";
import { ApiError } from "./errors.js";
import { readBoundedRequestBody } from "./request-body.js";
import { MAX_FILE_BYTES, MAX_MULTIPART_BYTES } from "./documents.js";

async function readLimitedBody(request, maxBytes) {
  return readBoundedRequestBody(request, maxBytes, {
    tooLargeError: () => new ApiError(413, "REQUEST_TOO_LARGE", "The upload request is too large."),
    invalidError: () => new ApiError(400, "INVALID_REQUEST", "The upload request could not be read."),
  });
}

export async function parseResumeMultipart(request) {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Resume uploads must use multipart/form-data.");
  }

  let body;
  try {
    body = await readLimitedBody(request, MAX_MULTIPART_BYTES);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_REQUEST", "The upload request could not be read.");
  }

  return new Promise((resolve, reject) => {
    let parser;
    let parseError;
    const fields = new Map();
    const files = [];
    const fileTasks = [];
    const fail = (error) => {
      parseError ??= error;
    };

    try {
      parser = Busboy({
        headers: request.headers,
        limits: { fields: 2, files: 1, parts: 3, fieldNameSize: 64, fieldSize: 1024, fileSize: MAX_FILE_BYTES },
      });
    } catch {
      reject(new ApiError(400, "INVALID_MULTIPART", "The multipart upload is malformed."));
      return;
    }

    parser.on("field", (name, value, info) => {
      if (info.nameTruncated || info.valueTruncated || (name !== "display_title" && name !== "file")) {
        fail(new ApiError(422, "VALIDATION_FAILED", "Only a file and optional display_title are accepted."));
      } else if (fields.has(name)) {
        fail(new ApiError(422, "VALIDATION_FAILED", "Each upload field may be provided once."));
      } else {
        fields.set(name, value);
      }
    });

    parser.on("file", (name, stream, info) => {
      if (name !== "file" || files.length > 0) {
        fail(new ApiError(422, "VALIDATION_FAILED", "Upload exactly one file in the file field."));
        stream.resume();
        return;
      }

      let bytes = 0;
      const chunks = [];
      const file = { name: info.filename, mimeType: info.mimeType, buffer: null };
      files.push(file);
      fileTasks.push(new Promise((done) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          done();
        };
        stream.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes <= MAX_FILE_BYTES) chunks.push(chunk);
        });
        stream.on("limit", () => fail(new ApiError(413, "FILE_TOO_LARGE", "Resume files must be 10 MiB or smaller.")));
        stream.on("error", () => {
          fail(new ApiError(400, "INVALID_MULTIPART", "The multipart upload is malformed."));
          finish();
        });
        stream.on("end", () => {
          if (!parseError && bytes <= MAX_FILE_BYTES) file.buffer = Buffer.concat(chunks, bytes);
          finish();
        });
        stream.on("close", finish);
      }));
    });

    parser.on("filesLimit", () => fail(new ApiError(422, "VALIDATION_FAILED", "Upload exactly one file.")));
    parser.on("fieldsLimit", () => fail(new ApiError(422, "VALIDATION_FAILED", "Only a file and optional display_title are accepted.")));
    parser.on("partsLimit", () => fail(new ApiError(422, "VALIDATION_FAILED", "Only a file and optional display_title are accepted.")));
    parser.on("error", () => fail(new ApiError(400, "INVALID_MULTIPART", "The multipart upload is malformed.")));
    parser.on("close", async () => {
      await Promise.all(fileTasks);
      if (parseError) {
        reject(parseError);
      } else if (!files.length || !files[0].buffer) {
        reject(new ApiError(422, "VALIDATION_FAILED", "A resume file is required."));
      } else {
        resolve({ fields, file: files[0] });
      }
    });

    Readable.from([body]).pipe(parser);
  });
}
