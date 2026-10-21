import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

function baseUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials.`);
  }
  return url.origin;
}

const frontend = baseUrl("SMOKE_FRONTEND_URL");
const api = baseUrl("SMOKE_API_URL");
async function request(url) {
  return fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
}

async function check() {
  const page = await request(frontend);
  assert.equal(page.status, 200, "Frontend must return 200.");
  const health = await request(`${api}/health`);
  assert.equal(health.status, 200, "Database health must return 200.");
  assert.equal((await health.json()).database, "connected", "Database must be connected.");
  const readiness = await request(`${api}/ready`);
  assert.equal(readiness.status, 200, "Private application database must be ready.");
  const protectedRoute = await request(`${api}/api/v1/resumes`);
  assert.equal(protectedRoute.status, 401, "Resume API must reject unauthenticated reads.");
  assert.equal(typeof (await protectedRoute.json()).error?.code, "string");
}

// Hosting services may finish at different times. No provider calls or private data.
let passed = false;
for (let attempt = 1; attempt <= 8; attempt++) {
  try {
    await check();
    passed = true;
    console.log("Frontend, database read and authenticated API boundary passed.");
    break;
  } catch (error) {
    console.error(`Smoke attempt ${attempt}/8: ${error.message}`);
    if (attempt < 8) await delay(10000);
  }
}
if (!passed) process.exitCode = 1;
