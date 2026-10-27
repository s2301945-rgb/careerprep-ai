import assert from "node:assert/strict";
import test from "node:test";
import { createGroqProbe } from "../../src/ai.js";

test("Groq probe reports missing configuration without a network call", async () => {
  const probe = createGroqProbe({ apiKey: "", model: "openai/gpt-oss-20b", fetchImpl: () => { throw new Error("unexpected request"); } });
  assert.equal((await probe.check()).ai, "not_configured");
});

test("Groq probe sends an authenticated chat request", async () => {
  let request;
  const probe = createGroqProbe({
    apiKey: "test-key",
    model: "openai/gpt-oss-20b",
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return new Response(JSON.stringify({ choices: [{ message: { content: "AI connection successful" } }] }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal((await probe.check()).ai, "connected");
  assert.equal(request.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer test-key");
  assert.equal(JSON.parse(request.body).model, "openai/gpt-oss-20b");
});

test("Groq probe rejects an unsuccessful response without exposing the key", async () => {
  const probe = createGroqProbe({
    apiKey: "test-key",
    model: "openai/gpt-oss-20b",
    fetchImpl: async () => new Response("forbidden", { status: 403 }),
  });
  await assert.rejects(probe.check(), (error) => error.code === "AI_PROVIDER_UNAVAILABLE" && !error.message.includes("test-key"));
});
