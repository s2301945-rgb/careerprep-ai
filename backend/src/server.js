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
import { createResumeAiGuard } from "./resume-ai-guard.js";
import { createJobMatcher } from "./job-match.js";
import { createInterviewAI } from "./interview-ai.js";
import {
  createResumeAI,
  validateResumeProfile,
  PROFILE_SCHEMA_VERSION,
  ANALYSIS_RUBRIC_VERSION,
} from "./resume-ai.js";
import { startCleanupWorker, finishResumeDeletion, cleanupFailureError } from "./cleanup.js";
import { extractResumeText, safeOriginalFilename, validateResumeFile } from "./documents.js";
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
  const retryAfter = error instanceof ApiError ? error.details?.retry_after_seconds : undefined;
  if (Number.isSafeInteger(retryAfter) && retryAfter > 0) {
    response.setHeader("Retry-After", String(retryAfter));
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

function validateJobText(value, label, maximum, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || Array.from(value).length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new ApiError(422, "VALIDATION_FAILED", `${label} must be 1 to ${maximum} characters.`);
  }
  return value.trim();
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
  resumeAI = null,
  jobMatcher = null,
  interviewAI = null,
  rateLimiter = createProbeRateLimiter(),
  resumeAiGuard = createResumeAiGuard(),
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
  const resumeAiService = resumeAI ?? createResumeAI({
    apiKey: config.groqApiKey,
    model: config.groqModel,
    fetchImpl,
  });
  const matchJob = jobMatcher ?? createJobMatcher({
    apiKey: config.groqApiKey,
    model: config.groqModel,
    fetchImpl,
  });
  const interviewService = interviewAI ?? createInterviewAI({
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

      if (url.pathname === "/api/v1/jobs") {
        const identity = await requireIdentity(request, authVerifier);
        const repo = requireRepository(repository);
        const user = await repo.resolveUser(identity);
        if (request.method === "GET") {
          sendJson(request, response, 200, { jobs: await repo.listJobs(user.id) }, corsHeaders, requestId);
          return;
        }
        if (request.method === "POST") {
          const body = await readJsonBody(request);
          assertAllowedKeys(body, ["job_title", "company_name", "description_text"], "Only job title, company name and description may be saved.");
          const job = await repo.createJob(user.id, {
            title: validateJobText(body.job_title, "job_title", 180, true),
            company: validateJobText(body.company_name, "company_name", 180, true),
            description: validateJobText(body.description_text, "description_text", 30000),
          });
          sendJson(request, response, 201, { job }, corsHeaders, requestId);
          return;
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "This method is not supported for jobs.");
      }

      const jobMatchRoute = /^\/api\/v1\/resumes\/([^/]+)\/jobs\/([^/]+)\/match$/.exec(url.pathname);
      if (jobMatchRoute) {
        const identity = await requireIdentity(request, authVerifier);
        const repo = requireRepository(repository);
        const user = await repo.resolveUser(identity);
        const resumeId = parseIdentifier(jobMatchRoute[1]);
        const jobId = parseIdentifier(jobMatchRoute[2]);
        const job = await repo.getJob(user.id, jobId);
        const resume = await repo.findResume(user.id, resumeId);
        if (!job || !resume) throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resume or job was not found.");
        if (request.method === "GET") {
          sendJson(request, response, 200, { match: await repo.latestJobMatch(user.id, resumeId, jobId) }, corsHeaders, requestId);
          return;
        }
        if (request.method === "POST") {
          const context = await repo.getConfirmedResumeContext(user.id, resumeId);
          if (!context || context.profile.review_status !== "confirmed" || !context.sourceText) {
            throw new ApiError(409, "PROFILE_REVIEW_REQUIRED", "Extract and confirm the resume profile before matching a job.");
          }
          const releaseAiSlot = resumeAiGuard.start(user.id);
          let matchId;
          try {
            matchId = await repo.createJobMatchRun(user.id, resumeId, jobId, context.profile.profile_revision);
            if (!matchId) throw new ApiError(409, "PROFILE_REVIEW_REQUIRED", "The resume or job changed. Refresh and try again.");
            const result = await matchJob(job.description_text, context.sourceText);
            const saved = await repo.completeJobMatch(user.id, matchId, result);
            if (!saved) throw new ApiError(409, "MATCH_STATE_CHANGED", "The comparison could not be saved. Try again.", true);
            sendJson(request, response, 201, { match: saved }, corsHeaders, requestId);
            return;
          } catch (error) {
            if (matchId) await repo.failJobMatch(user.id, matchId, /^[A-Z0-9_-]{1,100}$/.test(error?.code ?? "") ? error.code : "AI_FAILED").catch(() => {});
            throw error;
          } finally {
            releaseAiSlot();
          }
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "This method is not supported for job matching.");
      }

      const interviewListRoute = /^\/api\/v1\/resumes\/([^/]+)\/interviews$/.exec(url.pathname);
      if (interviewListRoute) {
        const identity = await requireIdentity(request, authVerifier);
        const repo = requireRepository(repository);
        const user = await repo.resolveUser(identity);
        const resumeId = parseIdentifier(interviewListRoute[1]);
        if (!await repo.findResume(user.id, resumeId)) throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
        if (request.method === "GET") {
          sendJson(request, response, 200, { interviews: await repo.listInterviews(user.id, resumeId) }, corsHeaders, requestId);
          return;
        }
        if (request.method === "POST") {
          const body = await readJsonBody(request);
          assertAllowedKeys(body, ["job_id"], "Only a saved job ID may be supplied.");
          const jobId = body.job_id === null || body.job_id === undefined ? null : parseIdentifier(String(body.job_id));
          if (jobId && !await repo.getJob(user.id, jobId)) throw new ApiError(404, "RESOURCE_NOT_FOUND", "The selected job was not found.");
          const releaseAiSlot = resumeAiGuard.start(user.id);
          let session;
          try {
            session = await repo.createInterviewSession(user.id, resumeId, jobId, 5);
            if (!session) throw new ApiError(409, "PROFILE_REVIEW_REQUIRED", "Confirm an extracted resume profile before starting an interview.");
            const generated = await interviewService.generate(5, session.source_snapshot.resume_text, session.source_snapshot.job_text);
            if (!await repo.saveInterviewQuestions(user.id, session.id, generated.questions, generated)) {
              throw new ApiError(409, "INTERVIEW_STATE_CHANGED", "The interview could not be saved. Try again.", true);
            }
            sendJson(request, response, 201, { interview: await repo.getInterview(user.id, session.id) }, corsHeaders, requestId);
            return;
          } catch (error) {
            if (session) await repo.failInterviewSession(user.id, session.id).catch(() => {});
            throw error;
          } finally { releaseAiSlot(); }
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "This method is not supported for interviews.");
      }

      const interviewRoute = /^\/api\/v1\/interviews\/([^/]+)(?:\/questions\/([^/]+)\/answer)?$/.exec(url.pathname);
      if (interviewRoute) {
        const identity = await requireIdentity(request, authVerifier);
        const repo = requireRepository(repository);
        const user = await repo.resolveUser(identity);
        const sessionId = parseIdentifier(interviewRoute[1]);
        const interview = await repo.getInterview(user.id, sessionId);
        if (!interview) throw new ApiError(404, "INTERVIEW_NOT_FOUND", "The requested interview was not found.");
        if (!interviewRoute[2] && request.method === "GET") {
          sendJson(request, response, 200, { interview }, corsHeaders, requestId);
          return;
        }
        if (interviewRoute[2] && request.method === "POST") {
          const questionId = parseIdentifier(interviewRoute[2]);
          const question = interview.questions.find((entry) => entry.id === questionId);
          if (!question) throw new ApiError(404, "QUESTION_NOT_FOUND", "The interview question was not found.");
          const body = await readJsonBody(request);
          assertAllowedKeys(body, ["answer_text"], "Only answer_text may be submitted.");
          const answerText = validateJobText(body.answer_text, "answer_text", 30000);
          const releaseAiSlot = resumeAiGuard.start(user.id);
          let answerId;
          try {
            answerId = await repo.beginInterviewAnswer(user.id, sessionId, questionId, answerText);
            if (!answerId) throw new ApiError(409, "ANSWER_ALREADY_SUBMITTED", "This answer is already submitted. A failed evaluation can be retried with the same text.");
            const source = await repo.getInterviewContext(user.id, sessionId);
            if (!source) throw new ApiError(409, "INTERVIEW_STATE_CHANGED", "The interview changed. Refresh and try again.");
            const evaluated = await interviewService.evaluate(question, answerText, source);
            if (!await repo.completeInterviewAnswer(user.id, sessionId, questionId, answerId, evaluated)) {
              throw new ApiError(409, "INTERVIEW_STATE_CHANGED", "The answer could not be saved. Refresh and try again.", true);
            }
            sendJson(request, response, 201, { interview: await repo.getInterview(user.id, sessionId) }, corsHeaders, requestId);
            return;
          } catch (error) {
            if (answerId) await repo.failInterviewAnswer(user.id, sessionId, questionId, answerId,
              /^[A-Z0-9_-]{1,100}$/.test(error?.code ?? "") ? error.code : "AI_FAILED").catch(() => {});
            throw error;
          } finally { releaseAiSlot(); }
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "This method is not supported for the interview route.");
      }

      const aiResumeMatch = /^\/api\/v1\/resumes\/([^/]+)\/(extract|profile|analysis)$/.exec(url.pathname);
      if (aiResumeMatch) {
        const identity = await requireIdentity(request, authVerifier);
        const user = await requireRepository(repository).resolveUser(identity);
        const resumeId = parseIdentifier(aiResumeMatch[1]);
        const action = aiResumeMatch[2];
        const repo = requireRepository(repository);

        if (action === "extract" && request.method === "POST") {
          if (!storage) throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Private resume storage is not configured.", true);
          const resume = await repo.findResumeFile(user.id, resumeId);
          if (!resume) throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
          if (resume.storage_disk !== "supabase") {
            throw new ApiError(503, "FILE_UNAVAILABLE", "The stored resume is not available.", true);
          }
          const releaseAiSlot = resumeAiGuard.start(user.id);
          try {
            const object = await storage.download(resume.storage_path);
            const sourceText = await extractResumeText({ mimeType: resume.mime_type, buffer: object.buffer });
            if (!await repo.storeResumeText(user.id, resumeId, sourceText)) {
              throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
            }
            const generated = await resumeAiService.extractProfile(sourceText);
            const profile = await repo.saveExtractedProfile(user.id, resumeId, {
              sourceText,
              profile: generated.result,
              schemaVersion: PROFILE_SCHEMA_VERSION,
              provider: generated.provider,
              model: generated.model,
              promptVersion: generated.promptVersion,
            });
            if (!profile) throw new ApiError(404, "RESUME_NOT_FOUND", "The requested resume was not found.");
            sendJson(request, response, 200, { profile }, corsHeaders, requestId);
            return;
          } catch (error) {
            if (error?.code === "TEXT_EXTRACTION_FAILED" || error?.code === "DOCUMENT_INVALID" || error?.code === "DOCUMENT_TOO_COMPLEX") {
              await repo.failResumeExtraction(user.id, resumeId, error.code).catch(() => {});
            }
            throw error;
          } finally {
            releaseAiSlot();
          }
        }

        if (action === "profile" && request.method === "GET") {
          const profile = await repo.getResumeProfile(user.id, resumeId);
          if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND", "Extract a resume profile before reviewing it.");
          sendJson(request, response, 200, { profile }, corsHeaders, requestId);
          return;
        }

        if (action === "profile" && request.method === "PATCH") {
          const body = await readJsonBody(request);
          assertAllowedKeys(body, ["summary", "skills", "education", "projects", "experience"], "Only the extracted profile fields may be changed.");
          const context = await repo.getConfirmedResumeContext(user.id, resumeId);
          if (!context) throw new ApiError(404, "PROFILE_NOT_FOUND", "Extract a resume profile before reviewing it.");
          const profileInput = {
            summary: body.summary,
            skills: body.skills,
            education: body.education,
            projects: body.projects,
            experience: body.experience,
          };
          let validated;
          try {
            validated = validateResumeProfile(profileInput, context.sourceText);
          } catch (error) {
            if (error?.code === "AI_RESPONSE_INVALID" || error?.code === "AI_EVIDENCE_INVALID") {
              throw new ApiError(422, "VALIDATION_FAILED", "The profile fields or evidence are invalid. Review the extracted details and try again.");
            }
            throw error;
          }
          const profile = await repo.confirmResumeProfile(user.id, resumeId, validated);
          if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND", "Extract a resume profile before reviewing it.");
          sendJson(request, response, 200, { profile }, corsHeaders, requestId);
          return;
        }

        if (action === "analysis" && request.method === "GET") {
          const analysis = await repo.getLatestResumeAnalysis(user.id, resumeId);
          if (!analysis) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "No analysis has been run for this resume.");
          sendJson(request, response, 200, { analysis }, corsHeaders, requestId);
          return;
        }

        if (action === "analysis" && request.method === "POST") {
          const context = await repo.getConfirmedResumeContext(user.id, resumeId);
          if (!context) throw new ApiError(409, "PROFILE_REVIEW_REQUIRED", "Extract and confirm the resume profile before analysis.");
          if (context.profile.review_status !== "confirmed") {
            throw new ApiError(409, "PROFILE_REVIEW_REQUIRED", "Review and confirm the extracted profile before analysis.");
          }
          if (typeof context.sourceText !== "string" || !context.sourceText.trim()) {
            throw new ApiError(409, "EXTRACTION_REQUIRED", "Extract readable resume text before analysis.");
          }
          const releaseAiSlot = resumeAiGuard.start(user.id);
          let analysisId;
          try {
            analysisId = await repo.createResumeAnalysisRun(user.id, resumeId, {
              profile_revision: context.profile.profile_revision,
              profile_schema_version: context.profile.schema_version,
              rubric_version: ANALYSIS_RUBRIC_VERSION,
            });
            if (!analysisId) throw new ApiError(409, "PROFILE_REVIEW_REQUIRED", "Review and confirm the extracted profile before analysis.");
            const generated = await resumeAiService.analyze(context.sourceText, context.profile);
            const analysis = await repo.completeResumeAnalysis(user.id, resumeId, analysisId, {
              result: generated.result,
              provider: generated.provider,
              model: generated.model,
              promptVersion: generated.promptVersion,
              rubricVersion: ANALYSIS_RUBRIC_VERSION,
            });
            if (!analysis) throw new ApiError(409, "ANALYSIS_STATE_CHANGED", "This analysis could not be saved. Try again.", true);
            sendJson(request, response, 201, { analysis }, corsHeaders, requestId);
            return;
          } catch (error) {
            const errorCode = typeof error?.code === "string" && /^[A-Z0-9_-]{1,100}$/.test(error.code)
              ? error.code
              : "AI_FAILED";
            if (analysisId) await repo.failResumeAnalysis(user.id, resumeId, analysisId, errorCode).catch(() => {});
            throw error;
          } finally {
            releaseAiSlot();
          }
        }

        throw new ApiError(405, "METHOD_NOT_ALLOWED", "This method is not supported for the requested resume AI route.");
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
  const resumeAI = createResumeAI({ apiKey: config.groqApiKey, model: config.groqModel });
  const app = createApp({ config, repository, auth, storage, aiProbe, resumeAI, logger });
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
