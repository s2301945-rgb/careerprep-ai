import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

function baseUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials.`);
  }
  return url.origin;
}

export async function checkDeployment(frontend, api, fetchImpl = fetch) {
  const request = (url, options) => fetchImpl(url, {
    signal: AbortSignal.timeout(10000),
    redirect: "error",
    ...options,
  });
  const page = await request(frontend);
  assert.equal(page.status, 200, "Frontend must return 200.");
  const frontendHtml = await page.text();
  const configuredApi = frontendHtml.match(/<html\b[^>]*\sdata-careerprep-api-origin="([^"]+)"/i)?.[1];
  assert.ok(configuredApi === api, "Frontend must be built with NEXT_PUBLIC_API_URL set to the production API origin.");

  const preflight = await request(`${api}/api/v1/resumes`, {
    method: "OPTIONS",
    headers: {
      Origin: frontend,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });
  assert.equal(preflight.status, 204, "API must accept the frontend's browser preflight.");
  assert.equal(preflight.headers.get("access-control-allow-origin"), frontend, "API must allow the exact production frontend origin.");
  const allowedHeaders = preflight.headers.get("access-control-allow-headers")?.toLowerCase().split(/\s*,\s*/);
  assert.ok(allowedHeaders?.includes("authorization"), "API must allow the browser's Authorization header.");

  const health = await request(`${api}/health`);
  assert.equal(health.status, 200, "Database health must return 200.");
  assert.equal((await health.json()).database, "connected", "Database must be connected.");
  const readiness = await request(`${api}/ready`, { headers: { Origin: frontend } });
  assert.equal(readiness.status, 200, "Private application database must be ready.");
  assert.equal(readiness.headers.get("access-control-allow-origin"), frontend, "Browser must be able to read the API readiness response.");
  assert.equal((await readiness.json()).database, "connected", "Readiness must report a connected database.");
  const protectedRoute = await request(`${api}/api/v1/resumes`);
  assert.equal(protectedRoute.status, 401, "Resume API must reject unauthenticated reads.");
  assert.equal(typeof (await protectedRoute.json()).error?.code, "string");
}

async function run() {
  const frontend = baseUrl("SMOKE_FRONTEND_URL");
  const api = baseUrl("SMOKE_API_URL");

  // Hosting services may finish at different times. No provider calls or private data.
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await checkDeployment(frontend, api);
      console.log("Frontend API wiring, CORS, database readiness and sign-in boundary passed.");
      return;
    } catch (error) {
      console.error(`Smoke attempt ${attempt}/8: ${error.message}`);
      if (attempt < 8) await delay(10000);
    }
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
