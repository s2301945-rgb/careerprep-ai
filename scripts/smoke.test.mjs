import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDeployment } from "./smoke.mjs";

const frontend = "https://frontend.example.test";
const api = "https://api.example.test";

function fakeDeployment({
  frontendHtml,
  allowedOrigin = frontend,
  allowedHeaders = "Authorization, Content-Type",
  readyOrigin = frontend,
}) {
  return async (url, options) => {
    if (url === frontend) return new Response(frontendHtml);

    if (url === `${api}/api/v1/resumes` && options.method === "OPTIONS") {
      assert.equal(options.headers.Origin, frontend);
      assert.equal(options.headers["Access-Control-Request-Method"], "GET");
      assert.equal(options.headers["Access-Control-Request-Headers"], "authorization");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Headers": allowedHeaders,
        },
      });
    }

    if (url === `${api}/ready`) {
      assert.equal(options.headers.Origin, frontend);
      return Response.json({ database: "connected" }, { headers: { "Access-Control-Allow-Origin": readyOrigin } });
    }

    if (url === `${api}/health`) {
      return Response.json({ database: "connected" });
    }

    assert.equal(url, `${api}/api/v1/resumes`);
    return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  };
}

const configuredHtml = `<!doctype html><html lang="en" data-careerprep-api-origin="${api}"></html>`;

test("smoke accepts the expected API origin and browser preflight", async () => {
  await checkDeployment(frontend, api, fakeDeployment({ frontendHtml: configuredHtml }));
});

test("smoke rejects a missing or different API origin even when both hosts are reachable", async () => {
  for (const frontendHtml of ["<html></html>", configuredHtml.replace(api, "https://old-api.example.test")]) {
    await assert.rejects(
      checkDeployment(frontend, api, fakeDeployment({ frontendHtml })),
      /Frontend must be built with NEXT_PUBLIC_API_URL/,
    );
  }
});

test("smoke rejects CORS that blocks the production frontend", async () => {
  await assert.rejects(
    checkDeployment(frontend, api, fakeDeployment({ frontendHtml: configuredHtml, allowedOrigin: "*" })),
    /must allow the exact production frontend origin/,
  );
});

test("smoke rejects a preflight that does not allow authentication", async () => {
  await assert.rejects(
    checkDeployment(frontend, api, fakeDeployment({ frontendHtml: configuredHtml, allowedHeaders: "Content-Type" })),
    /must allow the browser's Authorization header/,
  );
});

test("smoke checks CORS on the actual readiness response", async () => {
  await assert.rejects(
    checkDeployment(frontend, api, fakeDeployment({ frontendHtml: configuredHtml, readyOrigin: "https://old.example.test" })),
    /Browser must be able to read the API readiness response/,
  );
});
