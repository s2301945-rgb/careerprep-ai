const errorDiagnostics = new WeakMap();
const MAX_ERROR_BYTES = 16 * 1024;
const knownProviderCodes = new Set([
  "json_validate_failed", "json_validation_failed", "invalid_api_key",
  "model_not_found", "context_length_exceeded", "rate_limit_exceeded", "unrecognized",
]);
const knownProviderTypes = new Set([
  "invalid_request_error", "authentication_error", "permission_error",
  "rate_limit_error", "server_error", "api_error", "unrecognized",
]);
const operations = new Set(["resume_profile", "resume_analysis", "job_match"]);
const validationFields = new Set([
  "source_text", "response", "profile", "analysis", "summary", "rubric.clarity", "rubric.relevance", "rubric.evidence", "rubric.completeness",
  "skills", "skills[].name", "skills[].evidence", "education", "education[].credential", "education[].institution", "education[].evidence",
  "projects", "projects[].name", "projects[].description", "projects[].evidence",
  "experience", "experience[].role", "experience[].organization", "experience[].highlights",
  "experience[].highlights[].text", "experience[].highlights[].evidence",
  "strengths", "strengths[].text", "strengths[].evidence", "weaknesses", "weaknesses[].text", "weaknesses[].evidence",
  "missing_sections", "missing_sections[].section", "missing_sections[].reason",
  "recommendations", "recommendations[].text", "recommendations[].evidence",
  "skill_assessments", "skill_assessments[].name", "skill_assessments[].score", "skill_assessments[].evidence",
]);
const validationRules = new Set([
  "invalid_type", "empty", "max_length", "forbidden_control", "max_items", "source_quote",
  "score_range", "unknown_skill", "invalid_json", "max_bytes", "missing_content", "source_reference",
]);
const validationLimits = new Set([8, 12, 20, 30, 80, 100, 160, 240, 300, 350, 400, 401, 700, 900, 80_000, 128 * 1024]);

export function withAiDiagnostics(error, diagnostic) {
  errorDiagnostics.set(error, { ...errorDiagnostics.get(error), ...diagnostic });
  return error;
}

export function getAiDiagnostics(error) {
  const diagnostic = errorDiagnostics.get(error);
  if (!diagnostic) return undefined;
  return {
    operation: operations.has(diagnostic.operation) ? diagnostic.operation : undefined,
    provider_http_status: Number.isInteger(diagnostic.provider_http_status) && diagnostic.provider_http_status >= 300 && diagnostic.provider_http_status <= 599
      ? diagnostic.provider_http_status : undefined,
    provider_error_code: knownProviderCodes.has(diagnostic.provider_error_code) ? diagnostic.provider_error_code : undefined,
    provider_error_type: knownProviderTypes.has(diagnostic.provider_error_type) ? diagnostic.provider_error_type : undefined,
    validation_field: validationFields.has(diagnostic.validation_field) ? diagnostic.validation_field : undefined,
    validation_rule: validationRules.has(diagnostic.validation_rule) ? diagnostic.validation_rule : undefined,
    validation_limit: validationLimits.has(diagnostic.validation_limit) ? diagnostic.validation_limit : undefined,
  };
}

export async function readProviderRejection(response) {
  const diagnostic = {
    provider_http_status: response.status,
    provider_error_code: "unrecognized",
    provider_error_type: "unrecognized",
  };
  const declaredBytes = Number(response.headers.get("content-length"));
  if (!response.body) return diagnostic;
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_ERROR_BYTES) {
    void response.body.cancel().catch(() => {});
    return diagnostic;
  }

  let reader;
  try { reader = response.body.getReader(); }
  catch { return diagnostic; }
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 1000);
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ERROR_BYTES) {
        void reader.cancel().catch(() => {});
        return diagnostic;
      }
      chunks.push(Buffer.from(value));
    }
    const payload = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
    if (knownProviderCodes.has(payload?.error?.code)) diagnostic.provider_error_code = payload.error.code;
    if (knownProviderTypes.has(payload?.error?.type)) diagnostic.provider_error_type = payload.error.type;
  } catch {
    // Error bodies are optional diagnostics. They never change the API error.
  } finally {
    clearTimeout(timer);
    try { reader.releaseLock(); } catch {}
  }
  return diagnostic;
}
