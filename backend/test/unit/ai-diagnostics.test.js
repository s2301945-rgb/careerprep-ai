import assert from "node:assert/strict";
import test from "node:test";
import { getAiDiagnostics, readProviderRejection, withAiDiagnostics } from "../../src/ai-diagnostics.js";

const MAX_ERROR_BYTES = 16 * 1024;
const PRIVATE_SENTINEL = "PRIVATE_RESUME_AND_PROVIDER_CONTENT_928471";
const knownRejection = {
  provider_http_status: 400,
  provider_error_code: "json_validate_failed",
  provider_error_type: "invalid_request_error",
};
const unrecognizedRejection = (status = 400) => ({
  provider_http_status: status,
  provider_error_code: "unrecognized",
  provider_error_type: "unrecognized",
});

function rejection(payload, options = {}) {
  return new Response(JSON.stringify(payload), { status: 400, ...options });
}

test("provider rejection diagnostics expose only exact allowlisted identifiers and HTTP status", async () => {
  const diagnostic = await readProviderRejection(rejection({
    error: {
      code: "json_validate_failed",
      type: "invalid_request_error",
      message: PRIVATE_SENTINEL,
      failed_generation: PRIVATE_SENTINEL,
      status: PRIVATE_SENTINEL,
      nested: { code: PRIVATE_SENTINEL, type: PRIVATE_SENTINEL },
    },
    message: PRIVATE_SENTINEL,
    failed_generation: PRIVATE_SENTINEL,
  }));
  assert.deepEqual(diagnostic, knownRejection);
  assert.equal(JSON.stringify(diagnostic).includes(PRIVATE_SENTINEL), false);
});

test("unknown, differently spelled, and nested provider identifiers are discarded", async (t) => {
  const cases = [
    { code: PRIVATE_SENTINEL, type: PRIVATE_SENTINEL },
    { code: "JSON_VALIDATE_FAILED", type: "INVALID_REQUEST_ERROR" },
    { code: "json_validate_failed ", type: " invalid_request_error" },
    { code: { value: PRIVATE_SENTINEL }, type: [PRIVATE_SENTINEL] },
    { nested: { code: "json_validate_failed", type: "invalid_request_error" } },
  ];
  for (const [index, error] of cases.entries()) {
    await t.test(`unrecognized identifier case ${index + 1}`, async () => {
      const diagnostic = await readProviderRejection(rejection({
        error: { ...error, message: PRIVATE_SENTINEL, failed_generation: PRIVATE_SENTINEL },
      }));
      assert.deepEqual(diagnostic, unrecognizedRejection());
      assert.equal(JSON.stringify(diagnostic).includes(PRIVATE_SENTINEL), false);
    });
  }
});

test("a rejection body exactly at the 16 KiB byte limit remains readable", async () => {
  const empty = { error: { code: "json_validate_failed", type: "invalid_request_error", message: "" } };
  const padding = MAX_ERROR_BYTES - Buffer.byteLength(JSON.stringify(empty));
  empty.error.message = "x".repeat(padding);
  const body = JSON.stringify(empty);
  assert.equal(Buffer.byteLength(body), MAX_ERROR_BYTES);
  const diagnostic = await readProviderRejection(new Response(body, {
    status: 400,
    headers: { "content-length": String(MAX_ERROR_BYTES) },
  }));
  assert.deepEqual(diagnostic, knownRejection);
});

test("the streaming rejection limit counts UTF-8 bytes and cancels oversized bodies", async () => {
  const body = JSON.stringify({
    error: { code: "json_validate_failed", type: "invalid_request_error", message: "é".repeat(9000) },
  });
  assert.ok(body.length < MAX_ERROR_BYTES);
  const bytes = Buffer.from(body);
  assert.ok(bytes.byteLength > MAX_ERROR_BYTES);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 10_000));
      controller.enqueue(bytes.subarray(10_000));
    },
    cancel() { cancelled = true; },
  });
  const diagnostic = await readProviderRejection(new Response(stream, { status: 400 }));
  assert.deepEqual(diagnostic, unrecognizedRejection());
  assert.equal(cancelled, true);
});

test("a declared oversized rejection body is cancelled without extracting its content", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from(JSON.stringify({ error: {
        code: "json_validate_failed", type: "invalid_request_error", message: PRIVATE_SENTINEL,
      } })));
    },
    cancel() { cancelled = true; },
  });
  const diagnostic = await readProviderRejection(new Response(stream, {
    status: 400,
    headers: { "content-length": String(MAX_ERROR_BYTES + 1) },
  }));
  assert.deepEqual(diagnostic, unrecognizedRejection());
  assert.equal(cancelled, true);
});

test("malformed or absent rejection bodies retain the provider HTTP status", async (t) => {
  for (const status of [400, 401, 429, 500]) {
    await t.test(`HTTP ${status}`, async () => {
      assert.deepEqual(await readProviderRejection(new Response(`malformed ${PRIVATE_SENTINEL}`, { status })),
        unrecognizedRejection(status));
      assert.deepEqual(await readProviderRejection(new Response(null, { status })),
        unrecognizedRejection(status));
    });
  }
});

test("rejection stream read errors never replace provider HTTP status with a thrown error", async () => {
  const stream = new ReadableStream({
    pull(controller) { controller.error(new Error(PRIVATE_SENTINEL)); },
  });
  assert.deepEqual(await readProviderRejection(new Response(stream, { status: 429 })),
    unrecognizedRejection(429));
});

test("rejection cancellation errors remain best effort for declared and streamed byte limits", async (t) => {
  for (const declared of [true, false]) {
    await t.test(declared ? "declared limit" : "streamed limit", async () => {
      let cancelled = false;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.alloc(MAX_ERROR_BYTES + 1, 120));
        },
        cancel() {
          cancelled = true;
          throw new Error(PRIVATE_SENTINEL);
        },
      });
      const diagnostic = await readProviderRejection(new Response(stream, {
        status: 500,
        ...(declared ? { headers: { "content-length": String(MAX_ERROR_BYTES + 1) } } : {}),
      }));
      assert.deepEqual(diagnostic, unrecognizedRejection(500));
      assert.equal(cancelled, true);
    });
  }
});

test("AI diagnostics remain private and expose only whitelisted metadata fields", () => {
  const error = Object.assign(new Error("Fixed safe API error"), { code: "AI_RESPONSE_INVALID" });
  const expected = {
    operation: "resume_analysis",
    validation_field: "summary",
    validation_rule: "max_length",
    validation_limit: 900,
    ...knownRejection,
  };
  assert.equal(withAiDiagnostics(error, {
    ...expected,
    message: PRIVATE_SENTINEL,
    failed_generation: PRIVATE_SENTINEL,
    source_text: PRIVATE_SENTINEL,
    actual_value: PRIVATE_SENTINEL,
    nested: { value: PRIVATE_SENTINEL },
  }), error);
  assert.deepEqual(getAiDiagnostics(error), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { code: "AI_RESPONSE_INVALID" });
  assert.equal(JSON.stringify(getAiDiagnostics(error)).includes(PRIVATE_SENTINEL), false);
  assert.equal(getAiDiagnostics(new Error("Unrelated error")), undefined);
});

test("metadata fields cannot smuggle arbitrary values through whitelisted field names", () => {
  const error = new Error("Fixed safe API error");
  withAiDiagnostics(error, {
    operation: PRIVATE_SENTINEL,
    validation_field: PRIVATE_SENTINEL,
    validation_rule: PRIVATE_SENTINEL,
    validation_limit: 41_357,
    provider_http_status: PRIVATE_SENTINEL,
    provider_error_code: PRIVATE_SENTINEL,
    provider_error_type: PRIVATE_SENTINEL,
  });
  const diagnostic = getAiDiagnostics(error);
  assert.equal(JSON.stringify(diagnostic).includes(PRIVATE_SENTINEL), false);
  assert.notEqual(diagnostic?.validation_limit, 41_357);
});

test("unrecognized provider identifiers keep their fixed fallback through metadata projection", async () => {
  const error = new Error("Fixed safe API error");
  const diagnostic = await readProviderRejection(rejection({ error: {
    code: PRIVATE_SENTINEL, type: PRIVATE_SENTINEL,
  } }));
  withAiDiagnostics(error, diagnostic);
  assert.deepEqual(JSON.parse(JSON.stringify(getAiDiagnostics(error))), unrecognizedRejection());
});
