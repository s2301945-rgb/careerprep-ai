import "./env.js";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { getConfig } from "./env.js";
import { createSupabaseAuth, requireIdentity } from "./auth.js";
import { createPool, createRepository } from "./database.js";
import { createSupabaseStorage } from "./storage.js";
import { createGroqProbe, createProbeRateLimiter } from "./ai.js";
import { startCleanupWorker, finishResumeDeletion, cleanupFailureError } from "./cleanup.js";
import { safeOriginalFilename, validateResumeFile } from "./documents.js";
import { parseResumeMultipart } from "./multipart.js";
import { readBoundedRequestBody } from "./request-body.js";
import { ApiError, sendError } from "./errors.js";

const JSON_BODY_LIMIT = 1024 * 1024;
const MAX_BIGINT = 9223372036854775807n;
const RESUME_BASE_PATH = "/api/v1/resumes";

function normalizedOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function makeCorsHeaders(request, allowedOrigins) {
  const headers = { Vary: "Origin" };
  const origin = request.headers.origin;
  if (!origin) return headers;
  if (!allowedOrigins.includes(origin)) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed.");
  }
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
  headers["Access-Control-Max-Age"] = "600";
  return headers;
}

function sendJson(request, response, status, body, corsHeaders, requestId) {
  if (response.writableEnded) return;
  response.writeHead(status, {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function respondError(request, response, requestId, error, corsHeaders, logger) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (!(error instanceof ApiError)) {
    const safeCode = typeof error?.code === "string" && /^[A-Z0-9_-]{1,50}$/.test(error.code)
      ? error.code
      : "UNCLASSIFIED";
    logger.error?.(JSON.stringify({ request_id: requestId, code: "INTERNAL_ERROR", dependency_code: safeCode }));
  }
  sendError(response, requestId, error, corsHeaders);
}

function parseIdentifier(value) {
  if (!/^\d{1,19}$/.test(value)) {
    throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
  }
  let id;
  try {
    id = BigInt(value);
  } catch {
    throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
  }
  if (id < 1n || id > MAX_BIGINT) {
    throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
  }
  return id.toString();
}

function parseCursor(value) {
  if (!value) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError(400, "INVALID_CURSOR", "The page cursor is invalid.");
  }
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof cursor?.createdAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.createdAt)
      || Number.isNaN(Date.parse(cursor.createdAt))) {
      throw new Error("bad timestamp");
    }
    return { createdAt: cursor.createdAt, id: parseIdentifier(String(cursor.id)) };
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "The page cursor is invalid.");
  }
}

function encodeCursor(createdAt, id) {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

function parseLimit(value) {
  if (value === null) return 20;
  if (!/^\d{1,3}$/.test(value)) {
    throw new ApiError(400, "VALIDATION_FAILED", "Page limit must be between 1 and 100.");
  }
  const limit = Number(value);
  if (limit < 1 || limit > 100) {
    throw new ApiError(400, "VALIDATION_FAILED", "Page limit must be between 1 and 100.");
  }
  return limit;
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "The request must use application/json.");
  }

  const body = await readBoundedRequestBody(request, JSON_BODY_LIMIT, {
    tooLargeError: () => new ApiError(413, "REQUEST_TOO_LARGE", "The request body is too large."),
    invalidError: () => new ApiError(400, "INVALID_JSON", "The request body could not be read."),
  });
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("not an object");
    return parsed;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must be a JSON object.");
  }
}

function validateDisplayTitle(value) {
  if (typeof value !== "string") {
    throw new ApiError(422, "VALIDATION_FAILED", "display_title must be a string.", false, { fields: { display_title: "required" } });
  }
  const title = value.trim();
  const length = Array.from(title).length;
  if (length < 1 || length > 150 || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new ApiError(422, "VALIDATION_FAILED", "display_title must be 1 to 150 characters.", false, { fields: { display_title: "length" } });
  }
  return title;
}

function defaultDisplayTitle(filename) {
  const extension = filename.lastIndexOf(".");
  const title = extension > 0 ? filename.slice(0, extension) : filename;
  return validateDisplayTitle(title);
}

function assertAllowedKeys(value, allowed, message) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ApiError(422, "VALIDATION_FAILED", message);
}

function contentDisposition(filename) {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\;]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function checkHealth({ config, fetchImpl }) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return {
      status: 200,
      body: {
        application: "CareerPrep AI",
        backend: "connected",
        database: "not_configured",
        message: "Supabase connectivity is not configured for this environment.",
      },
    };
  }

  try {
    const response = await fetchImpl(
      `${config.supabaseUrl}/rest/v1/app_config?select=project_name&limit=1`,
      {
        headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("metadata probe failed");
    }
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error("metadata response invalid");
    const projectName = typeof records[0]?.project_name === "string" ? records[0].project_name.slice(0, 150) : "CareerPrep AI";
    return {
      status: 200,
      body: {
        application: projectName,
        backend: "connected",
        database: "connected",
        message: "Project metadata was read successfully from Supabase.",
      },
    };
  } catch {
    return {
      status: 503,
      body: {
        application: "CareerPrep AI",
        backend: "connected",
        database: "error",
        message: "Supabase is configured, but the metadata probe failed.",
      },
    };
  }
}

function requireRepository(repository) {
  if (!repository) {
    throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "The private application database is not configured.", true);
  }
  return repository;
}

export function createApp({
  config = getConfig(),
  repository = null,
  auth = null,
  storage = null,
  aiProbe = null,
  rateLimiter = createProbeRateLimiter(),
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const configuredOrigins = config.allowedOrigins.map(normalizedOrigin).filter(Boolean);
  const authVerifier = auth ?? createSupabaseAuth({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    fetchImpl,
  });
  const groqProbe = aiProbe ?? createGroqProbe({
    apiKey: config.groqApiKey,
    model: config.groqModel,
    fetchImpl,
  });

  return http.createServer(async (request, response) => {
    const requestId = randomUUID();
    let corsHeaders = { Vary: "Origin" };
    try {
      corsHeaders = makeCorsHeaders(request, configuredOrigins);
      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders);
        response.end();
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/") {
        sendJson(request, response, 200, { service: "CareerPrep AI backend", status: "running" }, corsHeaders, requestId);
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        const result = await checkHealth({ config, fetchImpl });
        sendJson(request, response, result.status, result.body, corsHeaders, requestId);
        return;
      }

      if (request.method === "GET" && url.pathname === "/ready") {
        try {
          await requireRepository(repository).pingPrivateSchema();
          sendJson(request, response, 200, { backend: "connected", database: "connected" }, corsHeaders, requestId);
        } catch {
          sendJson(request, response, 503, { backend: "connected", database: "error" }, corsHeaders, requestId);
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/ai-test") {
        const identity = await requireIdentity(request, authVerifier);
        rateLimiter.check(identity.id);
        const result = await groqProbe.check();
        sendJson(request, response, 200, result, corsHeaders, requestId);
        return;
      }

      if (url.pathname === "/api/v1/me" && request.method === "GET") {
        const identity = await requireIdentity(request, authVerifier);
        const user = await requireRepository(repository).resolveUser(identity);
        sendJson(request, response, 200, { user }, corsHeaders, requestId);
        return;
      }

      if (url.pathname === RESUME_BASE_PATH && request.method === "POST") {
        const identity = await requireIdentity(request, authVerifier);
        const user = await requireRepository(repository).resolveUser(identity);
        if (!storage) throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Private resume storage is not configured.", true);

        const parsed = await parseResumeMultipart(request);
        const validated = await validateResumeFile({
          filename: parsed.file.name,
          clientMimeType: parsed.file.mimeType,
          buffer: parsed.file.buffer,
        });
        if (parsed.fields.has("file")) {
          throw new ApiError(422, "VALIDATION_FAILED", "The file must be provided as a file upload.");
        }
        const title = parsed.fields.has("display_title")
          ? validateDisplayTitle(parsed.fields.get("display_title"))
          : defaultDisplayTitle(validated.filename);
        const repo = requireRepository(repository);
        const storagePath = `v1/${randomUUID()}`;
        const cleanupTask = await repo.armUploadCleanup(user.id, storagePath);

        try {
          await storage.upload(storagePath, parsed.file.buffer, validated.mimeType);
        } catch (error) {
          await repo.queueUploadCleanup(cleanupTask.id, "STORAGE_UNAVAILABLE").catch(() => {});
          await finishResumeDeletion(await repo.getCleanupTaskById(cleanupTask.id).catch(() => null), repo, storage).catch(() => false);
          throw error;
        }

        let resume;
        try {
          resume = await repo.createResume(user.id, {
            displayTitle: title,
            originalFilename: validated.filename,
            mimeType: validated.mimeType,
            fileSizeBytes: parsed.file.buffer.length,
            storagePath,
          });
        } catch {
          await repo.queueUploadCleanup(cleanupTask.id, "DATABASE_WRITE_FAILED").catch(() => {});
          const queued = await repo.getCleanupTaskById(cleanupTask.id).catch(() => null);
          await finishResumeDeletion(queued, repo, storage).catch(() => false);
          throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "The resume could not be saved.", true);
        }

        await repo.attachUploadCleanupToResume(cleanupTask.id, resume.id).catch(() => {
          logger.error?.(JSON.stringify({ request_id: requestId, code: "UPLOAD_CLEANUP_GUARD_PENDING" }));
        });
        sendJson(request, response, 201, { resume }, corsHeaders, requestId);
        return;
      }

      if (url.pathname === RESUME_BASE_PATH && request.method === "GET") {
        const identity = await requireIdentity(request, authVerifier);
        const user = await requireRepository(repository).resolveUser(identity);
        const allowedQuery = new Set(["limit", "cursor"]);
        for (const key of url.searchParams.keys()) {
          if (!allowedQuery.has(key) || url.searchParams.getAll(key).length > 1) {
            throw new ApiError(400, "VALIDATION_FAILED", "Only one limit and cursor parameter may be provided.");
          }
        }
        const limit = parseLimit(url.searchParams.get("limit"));
        const cursor = parseCursor(url.searchParams.get("cursor"));
        const page = await requireRepository(repository).listResumes(user.id, { limit, cursor });
        const nextCursor = page.hasMore && page.rows.length
          ? encodeCursor(page.lastCreatedAt, page.rows.at(-1).id)
          : null;
        sendJson(request, response, 200, { resumes: page.rows, next_cursor: nextCursor }, corsHeaders, requestId);
        return;
      }

      const resumeMatch = /^\/api\/v1\/resumes\/([^/]+)(\/file)?$/.exec(url.pathname);
      if (resumeMatch) {
        const identity = await requireIdentity(request, authVerifier);
        const user = await requireRepository(repository).resolveUser(identity);
        const resumeId = parseIdentifier(resumeMatch[1]);
        const isFile = resumeMatch[2] === "/file";
        const repo = requireRepository(repository);

        if (isFile && request.method === "GET") {
          const resume = await repo.findResumeFile(user.id, resumeId);
          if (!resume) throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
          if (resume.storage_disk !== "supabase") {
            throw new ApiError(503, "FILE_UNAVAILABLE", "The stored resume is not available.", true);
          }
          if (!storage) throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Private resume storage is not configured.", true);
          const object = await storage.download(resume.storage_path);
          response.writeHead(200, {
            ...corsHeaders,
            "Content-Type": resume.mime_type,
            "Content-Length": object.buffer.length,
            "Content-Disposition": contentDisposition(safeOriginalFilename(resume.original_filename)),
            "Cache-Control": "private, no-store",
            "X-Request-Id": requestId,
            "X-Content-Type-Options": "nosniff",
          });
          response.end(object.buffer);
          return;
        }

        if (!isFile && request.method === "GET") {
          const resume = await repo.findResume(user.id, resumeId);
          if (!resume) throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
          sendJson(request, response, 200, { resume }, corsHeaders, requestId);
          return;
        }

        if (!isFile && request.method === "PATCH") {
          const body = await readJsonBody(request);
          assertAllowedKeys(body, ["display_title"], "Only display_title may be changed.");
          if (!Object.hasOwn(body, "display_title")) {
            throw new ApiError(422, "VALIDATION_FAILED", "display_title is required.", false, { fields: { display_title: "required" } });
          }
          const title = validateDisplayTitle(body.display_title);
          const resume = await repo.renameResume(user.id, resumeId, title);
          if (!resume) throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
          sendJson(request, response, 200, { resume }, corsHeaders, requestId);
          return;
        }

        if (!isFile && request.method === "DELETE") {
          const task = await repo.queueResumeDeletion(user.id, resumeId);
          if (!task) throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
          const cleaned = await finishResumeDeletion(task, repo, storage);
          if (!cleaned) throw cleanupFailureError();
          response.writeHead(204, {
            ...corsHeaders,
            "Cache-Control": "no-store",
            "X-Request-Id": requestId,
          });
          response.end();
          return;
        }

        throw new ApiError(405, "METHOD_NOT_ALLOWED", "This method is not supported for the requested resume path.");
      }

      if (url.pathname.startsWith("/api/v1/")) {
        throw new ApiError(404, "NOT_FOUND", "The requested API route was not found.");
      }

      sendJson(request, response, 404, { message: "Route not found" }, corsHeaders, requestId);
    } catch (error) {
      respondError(request, response, requestId, error, corsHeaders, logger);
    }
  });
}

export function startBackend({ config = getConfig(), logger = console } = {}) {
  const pool = config.databaseUrl
    ? createPool({
      connectionString: config.databaseUrl,
      sslCaPath: config.databaseSslCa,
      environment: config.environment,
    })
    : null;
  const repository = pool ? createRepository(pool) : null;
  const storage = createSupabaseStorage({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    bucket: config.resumeBucket,
  });
  const auth = createSupabaseAuth({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  });
  const aiProbe = createGroqProbe({ apiKey: config.groqApiKey, model: config.groqModel });
  const app = createApp({ config, repository, auth, storage, aiProbe, logger });
  const stopCleanupWorker = repository ? startCleanupWorker({ repository, storage, logger }) : () => {};
  app.requestTimeout = 30_000;
  app.headersTimeout = 10_000;
  app.keepAliveTimeout = 5_000;
  app.maxHeadersCount = 100;
  app.listen(config.port, "0.0.0.0", () => {
    logger.log?.(`CareerPrep AI backend listening on port ${config.port}`);
  });

  const close = () => new Promise((resolve, reject) => {
    stopCleanupWorker();
    app.close(async (error) => {
      await pool?.end().catch(() => {});
      if (error) reject(error);
      else resolve();
    });
  });

  return { app, pool, repository, close };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  startBackend();
}
