import { ApiError } from "./errors.js";

const MAX_RESPONSE_BYTES = 512 * 1024;

async function readResponseJson(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ApiError(502, "AI_RESPONSE_INVALID", "The AI provider returned an invalid response.");
  }

  if (!response.body) throw new ApiError(502, "AI_RESPONSE_INVALID", "The AI provider returned an invalid response.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ApiError(502, "AI_RESPONSE_INVALID", "The AI provider returned an invalid response.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    throw new ApiError(502, "AI_RESPONSE_INVALID", "The AI provider returned an invalid response.");
  }
}

export function createGeminiProbe({ apiKey, model, fetchImpl = fetch }) {
  return {
    async check() {
      if (!apiKey) {
        return { ai: "not_configured", message: "Gemini is not configured for this environment." };
      }
      const safeModel = model?.replace(/^models\//, "");
      if (!safeModel || !/^[A-Za-z0-9._-]{1,120}$/.test(safeModel)) {
        throw new ApiError(503, "AI_NOT_CONFIGURED", "The AI model configuration is invalid.");
      }

      let response;
      try {
        response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(safeModel)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "Reply with exactly: AI connection successful" }] }],
              generationConfig: {
                maxOutputTokens: 64,
                temperature: 0,
                ...( /^gemini-2\.5-(?:flash|flash-lite)(?:-|$)/i.test(safeModel)
                  ? { thinkingConfig: { thinkingBudget: 0 } }
                  : {} ),
              },
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );
      } catch {
        throw new ApiError(503, "AI_PROVIDER_UNAVAILABLE", "Gemini could not be reached.", true);
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new ApiError(503, "AI_PROVIDER_UNAVAILABLE", "Gemini could not complete the connectivity check.", true);
      }

      const payload = await readResponseJson(response);
      const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
      const text = Array.isArray(candidate?.content?.parts)
        ? candidate.content.parts
          .map((part) => typeof part?.text === "string" ? part.text : "")
          .join("")
          .trim()
        : "";
      if (!text || text.length > 5000 || ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate?.finishReason)) {
        throw new ApiError(502, "AI_RESPONSE_INVALID", "Gemini returned no usable text.", true);
      }

      return { ai: "connected", message: "Gemini responded successfully from the backend." };
    },
  };
}

export function createProbeRateLimiter({ intervalMs = 60_000, maxEntries = 10_000 } = {}) {
  const lastRequestAt = new Map();
  return {
    check(identityId) {
      const now = Date.now();
      const lastRequest = lastRequestAt.get(identityId);
      if (lastRequest && now - lastRequest < intervalMs) {
        throw new ApiError(429, "RATE_LIMITED", "Wait before running the AI connectivity check again.", true);
      }
      if (lastRequestAt.size >= maxEntries) {
        for (const [key, timestamp] of lastRequestAt) {
          if (now - timestamp >= intervalMs) lastRequestAt.delete(key);
        }
        if (lastRequestAt.size >= maxEntries) lastRequestAt.clear();
      }
      lastRequestAt.set(identityId, now);
    },
  };
}
