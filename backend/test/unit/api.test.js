import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import { createApp } from "../../src/server.js";
import { ApiError } from "../../src/errors.js";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const ALLOWED_ORIGIN = "https://careerprep.example";

const state = {
  resumes: new Map(),
  storage: new Map(),
  removeFailures: 0,
  lastDownloadPath: null,
  lastUploadPath: null,
  nextId: 1n,
};

const identities = {
  tokenA: { id: "11111111-1111-4111-8111-111111111111", email: "a@example.test", name: "User A" },
  tokenB: { id: "22222222-2222-4222-8222-222222222222", email: "b@example.test", name: "User B" },
};

const auth = {
  async verifyAccessToken(token) {
    const identity = identities[token];
    if (!identity) throw new ApiError(401, "UNAUTHENTICATED", "A valid sign-in session is required.");
    return identity;
  },
};

const repository = {
  async resolveUser(identity) {
    return { id: identity.id === identities.tokenA.id ? "7001" : "7002", email: identity.email, name: identity.name };
  },
  async listResumes(userId, { limit, cursor }) {
    let rows = [...state.resumes.values()].filter((resume) => resume.ownerUserId === userId);
    rows.sort((left, right) => BigInt(right.id) > BigInt(left.id) ? 1 : -1);
    if (cursor) rows = rows.filter((resume) => BigInt(resume.id) < BigInt(cursor.id));
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    return {
      rows: visible,
      hasMore,
      lastCreatedAt: visible.length ? "2026-10-22T00:00:00.000000Z" : null,
    };
  },
  async findResume(userId, resumeId) {
    const resume = state.resumes.get(resumeId);
    return resume?.ownerUserId === userId ? publicResume(resume) : null;
  },
  async findResumeFile(userId, resumeId) {
    const resume = state.resumes.get(resumeId);
    if (resume?.ownerUserId !== userId) return null;
    return { ...publicResume(resume), storage_disk: resume.storageDisk ?? "supabase", storage_path: resume.storagePath };
  },
  async createResume(userId, input) {
    const id = String(state.nextId++);
    const resume = {
      id,
      ownerUserId: userId,
      storagePath: input.storagePath,
      display_title: input.displayTitle,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      file_size_bytes: String(input.fileSizeBytes),
      extraction_status: "pending",
      extraction_error: null,
      extracted_at: null,
      created_at: "2026-10-22T00:00:00.000Z",
      updated_at: "2026-10-22T00:00:00.000Z",
    };
    state.resumes.set(id, resume);
    return publicResume(resume);
  },
  async renameResume(userId, resumeId, displayTitle) {
    const resume = state.resumes.get(resumeId);
    if (resume?.ownerUserId !== userId) return null;
    resume.display_title = displayTitle;
    return publicResume(resume);
  },
  async armUploadCleanup(userId, storagePath) {
    return { id: `upload:${storagePath}`, owner_user_id: userId, storage_path: storagePath, status: "armed" };
  },
  async attachUploadCleanupToResume() {},
  async queueUploadCleanup() {},
  async getCleanupTaskById() { return null; },
  async queueResumeDeletion(userId, resumeId) {
    const resume = state.resumes.get(resumeId);
    if (resume?.ownerUserId !== userId) {
      return state.cleanupTask?.owner_user_id === userId && state.cleanupTask?.resume_id === resumeId
        ? state.cleanupTask
        : null;
    }
    state.resumes.delete(resumeId);
    const task = {
      id: `delete:${resumeId}`,
      owner_user_id: userId,
      resume_id: resumeId,
      storage_disk: "supabase",
      storage_path: resume.storagePath,
      status: "pending",
      attempt_count: "0",
    };
    state.cleanupTask = task;
    return task;
  },
  async claimCleanupTask(taskId) {
    const task = state.cleanupTask;
    if (!task || task.id !== taskId || task.status !== "pending") return null;
    task.status = "processing";
    return task;
  },
  async findResumeByStoragePath(disk, storagePath) {
    return [...state.resumes.values()].find((resume) => resume.storagePath === storagePath)?.id ?? null;
  },
  async completeCleanupTask(taskId) {
    if (state.cleanupTask?.id === taskId) state.cleanupTask.status = "completed";
  },
  async failCleanupTask(taskId, code) {
    if (state.cleanupTask?.id === taskId) {
      state.cleanupTask.status = "pending";
      state.cleanupTask.last_error_code = code;
    }
  },
  async getCleanupTaskById(taskId) {
    return state.cleanupTask?.id === taskId ? state.cleanupTask : null;
  },
};

const storage = {
  async upload(path, buffer) {
    state.lastUploadPath = path;
    state.storage.set(path, Buffer.from(buffer));
  },
  async download(path) {
    state.lastDownloadPath = path;
    const buffer = state.storage.get(path);
    if (!buffer) throw new ApiError(503, "FILE_UNAVAILABLE", "The stored resume is not available.", true);
    return { buffer };
  },
  async remove(path) {
    if (state.removeFailures > 0) {
      state.removeFailures -= 1;
      throw new ApiError(503, "STORAGE_UNAVAILABLE", "Resume file cleanup is still pending.", true);
    }
    state.storage.delete(path);
  },
};

function publicResume(resume) {
  const { ownerUserId, storagePath, ...result } = resume;
  return result;
}

function authHeader(token = "tokenA") {
  return { Authorization: `Bearer ${token}` };
}

async function uploadResume(baseUrl, { token = "tokenA", filename = "Resume.pdf", title = "Resume" } = {}) {
  const form = new FormData();
  form.set("display_title", title);
  form.set("file", new Blob([PDF], { type: "application/pdf" }), filename);
  return fetch(`${baseUrl}/api/v1/resumes`, {
    method: "POST",
    headers: authHeader(token),
    body: form,
  });
}

let server;
let baseUrl;

before(async () => {
  server = createApp({
    config: { allowedOrigins: [ALLOWED_ORIGIN], supabaseUrl: "", supabaseAnonKey: "" },
    repository,
    auth,
    storage,
    aiProbe: { async check() { return { ai: "connected" }; } },
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  state.resumes.clear();
  state.storage.clear();
  state.removeFailures = 0;
  state.lastDownloadPath = null;
  state.lastUploadPath = null;
  state.nextId = 1n;
  state.cleanupTask = null;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("API errors use the documented envelope and protected routes reject missing tokens", async () => {
  const response = await fetch(`${baseUrl}/api/v1/me`, { headers: { Origin: ALLOWED_ORIGIN } });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  const body = await response.json();
  assert.equal(body.error.code, "UNAUTHENTICATED");
  assert.equal(body.error.retryable, false);
  assert.equal(typeof body.error.request_id, "string");
});

test("verified identity resolves to the application profile without accepting an owner field", async () => {
  const response = await fetch(`${baseUrl}/api/v1/me`, { headers: authHeader() });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { id: "7001", email: "a@example.test", name: "User A" } });
});

test("resume upload validates document bytes, returns private metadata, and hides the storage key", async () => {
  const response = await uploadResume(baseUrl, { filename: "../Private Resume.pdf", title: "Primary CV" });
  assert.equal(response.status, 201);
  const { resume } = await response.json();
  assert.equal(resume.display_title, "Primary CV");
  assert.equal(resume.original_filename, "Private Resume.pdf");
  assert.equal(resume.file_size_bytes, String(PDF.length));
  assert.equal(typeof resume.id, "string");
  assert.equal(JSON.stringify(resume).includes(state.lastUploadPath), false);
  assert.match(state.lastUploadPath, /^v1\/[0-9a-f-]{36}$/);
  assert.deepEqual(state.storage.get(state.lastUploadPath), PDF);
});

test("resume pages do not expose another owner's records or the lookahead row", async () => {
  const first = await uploadResume(baseUrl, { title: "First" });
  const firstId = (await first.json()).resume.id;
  const second = await uploadResume(baseUrl, { title: "Second" });
  const secondId = (await second.json()).resume.id;

  const page = await fetch(`${baseUrl}/api/v1/resumes?limit=1`, { headers: authHeader() });
  assert.equal(page.status, 200);
  const pageBody = await page.json();
  assert.equal(pageBody.resumes.length, 1);
  assert.equal(pageBody.resumes[0].id, secondId);
  assert.equal(typeof pageBody.next_cursor, "string");

  const otherUser = await fetch(`${baseUrl}/api/v1/resumes/${secondId}`, { headers: authHeader("tokenB") });
  assert.equal(otherUser.status, 404);
  const nextPage = await fetch(`${baseUrl}/api/v1/resumes?limit=1&cursor=${encodeURIComponent(pageBody.next_cursor)}`, { headers: authHeader() });
  assert.equal(nextPage.status, 200);
  assert.deepEqual((await nextPage.json()).resumes.map((resume) => resume.id), [firstId]);
});

test("rename accepts only display_title and authorized file downloads remain attachments", async () => {
  const uploaded = await uploadResume(baseUrl, { filename: "Original.pdf" });
  const resumeId = (await uploaded.json()).resume.id;

  const rejected = await fetch(`${baseUrl}/api/v1/resumes/${resumeId}`, {
    method: "PATCH",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ display_title: "Renamed", user_id: "7002" }),
  });
  assert.equal(rejected.status, 422);

  const renamed = await fetch(`${baseUrl}/api/v1/resumes/${resumeId}`, {
    method: "PATCH",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ display_title: "Renamed" }),
  });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).resume.display_title, "Renamed");

  const download = await fetch(`${baseUrl}/api/v1/resumes/${resumeId}/file`, { headers: authHeader() });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.match(download.headers.get("content-disposition"), /attachment;.*Original\.pdf/);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.equal(state.lastDownloadPath, state.lastUploadPath);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), PDF);
});

test("file requests refuse legacy storage disks instead of reading a colliding Supabase key", async () => {
  state.resumes.set("998", {
    id: "998",
    ownerUserId: "7001",
    storageDisk: "local",
    storagePath: "v1/same-key",
    display_title: "Legacy",
    original_filename: "legacy.pdf",
    mime_type: "application/pdf",
    file_size_bytes: String(PDF.length),
    extraction_status: "pending",
    extraction_error: null,
    extracted_at: null,
    created_at: "2026-10-22T00:00:00.000Z",
    updated_at: "2026-10-22T00:00:00.000Z",
  });
  state.storage.set("v1/same-key", PDF);

  const response = await fetch(`${baseUrl}/api/v1/resumes/998/file`, { headers: authHeader() });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "FILE_UNAVAILABLE");
  assert.equal(state.lastDownloadPath, null);
});

test("delete returns retryable cleanup status and completes idempotently after storage recovers", async () => {
  const uploaded = await uploadResume(baseUrl, { filename: "Delete Me.pdf" });
  const resumeId = (await uploaded.json()).resume.id;
  const storagePath = state.resumes.get(resumeId).storagePath;
  state.removeFailures = 1;

  const first = await fetch(`${baseUrl}/api/v1/resumes/${resumeId}`, { method: "DELETE", headers: authHeader() });
  assert.equal(first.status, 503);
  const error = await first.json();
  assert.equal(error.error.code, "CLEANUP_PENDING");
  assert.equal(error.error.retryable, true);
  assert.equal(state.resumes.has(resumeId), false);
  assert.equal(state.storage.has(storagePath), true);

  const retry = await fetch(`${baseUrl}/api/v1/resumes/${resumeId}`, { method: "DELETE", headers: authHeader() });
  assert.equal(retry.status, 204);
  assert.equal(state.storage.has(storagePath), false);
});

test("CORS allows only the configured exact origin", async () => {
  const response = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ORIGIN_NOT_ALLOWED");
});

test("chunked JSON bodies larger than the limit return 413 without hanging or resetting the response", async () => {
  const url = new URL(baseUrl);
  const responsePromise = new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: "/api/v1/resumes/1",
      method: "PATCH",
      headers: {
        ...authHeader(),
        "Content-Type": "application/json",
        "Transfer-Encoding": "chunked",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    });
    request.on("error", reject);
    request.write(`{"display_title":"${"x".repeat(1024 * 1024 + 32)}"}`);
    request.end();
  });
  let timeoutId;
  let response;
  try {
    response = await Promise.race([
      responsePromise,
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("oversized request timed out")), 3000); }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, "REQUEST_TOO_LARGE");
});

test("AI probe endpoint requires the same verified user session", async () => {
  const denied = await fetch(`${baseUrl}/ai-test`, { method: "POST" });
  assert.equal(denied.status, 401);
  const allowed = await fetch(`${baseUrl}/ai-test`, { method: "POST", headers: authHeader() });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { ai: "connected" });
});
