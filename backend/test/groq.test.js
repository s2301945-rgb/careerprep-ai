import assert from "node:assert/strict";
import test from "node:test";
import { probeGroq } from "../src/groq.js";

test("Groq probe sends a server-side chat request and accepts text", async () => {
  let request;
  const result = await probeGroq({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "AI connection successful" } }] }) };
    },
  });

  assert.equal(result, "AI connection successful");
  assert.equal(request.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer test-key");
  assert.equal(JSON.parse(request.body).model, "openai/gpt-oss-20b");
});

test("Groq probe rejects an unsuccessful provider response", async () => {
  await assert.rejects(
    probeGroq({ apiKey: "test-key", fetchImpl: async () => ({ ok: false, status: 403 }) }),
    /Groq returned 403/,
  );
});

test("Groq probe rejects empty output", async () => {
  await assert.rejects(
    probeGroq({
      apiKey: "test-key",
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: " " } }] }) }),
    }),
    /no usable text/,
  );
});
