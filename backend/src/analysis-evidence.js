import { ApiError } from "./errors.js";
import { withAiDiagnostics } from "./ai-diagnostics.js";

const MAX_SOURCE_CHARS = 80_000;
const MAX_SPAN_CHARS = 400;
const MIN_NATURAL_BREAK_CHARS = 200;
const MAX_SPANS = 401;
const evidenceFields = ["strengths", "weaknesses", "recommendations", "skill_assessments"];

function sourceError(rule, limit) {
  return withAiDiagnostics(new ApiError(422, "AI_SOURCE_UNSUPPORTED", "The document text cannot be represented safely for evidence-based analysis."), {
    validation_field: "source_text", validation_rule: rule, validation_limit: limit,
  });
}

export function buildEvidenceCatalog(source) {
  if (typeof source !== "string") throw sourceError("invalid_type");
  if (!source.trim()) throw sourceError("empty");
  if (Array.from(source).length > MAX_SOURCE_CHARS) throw sourceError("max_length", MAX_SOURCE_CHARS);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(source)) throw sourceError("forbidden_control");
  const graphemes = [];
  for (const { segment, index } of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(source)) {
    const length = Array.from(segment).length;
    if (length > MAX_SPAN_CHARS) throw sourceError("max_length", MAX_SPAN_CHARS);
    graphemes.push({ text: segment, start: index, end: index + segment.length, length });
  }
  const catalog = [];
  for (let start = 0; start < graphemes.length;) {
    let end = start;
    let length = 0;
    let paragraphEnd;
    let sentenceEnd;
    let wordEnd;
    while (end < graphemes.length && length + graphemes[end].length <= MAX_SPAN_CHARS) {
      length += graphemes[end].length;
      end += 1;
      if (length < MIN_NATURAL_BREAK_CHARS) continue;
      const text = graphemes[end - 1].text;
      if (/[\r\n]/u.test(text)) paragraphEnd = end;
      else if (/[.!?;:/]/u.test(text)) sentenceEnd = end;
      else if (/\s/u.test(text)) wordEnd = end;
    }
    const boundary = paragraphEnd ?? sentenceEnd ?? wordEnd ?? end;
    const offset = graphemes[start].start;
    catalog.push({ id: `s${String(offset).padStart(6, "0")}`, text: source.slice(offset, graphemes[boundary - 1].end) });
    if (catalog.length > MAX_SPANS) throw sourceError("max_items", MAX_SPANS);
    start = boundary;
  }
  const normalizedSource = source.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  for (const { text } of catalog) {
    if (text.trim() && !normalizedSource.includes(text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase())) {
      throw sourceError("source_quote");
    }
  }
  return catalog;
}

export function evidenceReferenceIds(catalog) {
  const ids = catalog.filter(({ text }) => text.trim()).map(({ id }) => id);
  if (!ids.length) throw sourceError("empty");
  return ids;
}

export function resolveAnalysisEvidence(result, catalog) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const evidence = new Map(catalog.filter(({ text }) => text.trim()).map(({ id, text }) => [id, text]));
  const resolved = { ...result };
  for (const field of evidenceFields) {
    if (!Array.isArray(result[field])) continue;
    resolved[field] = result[field].map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      if (field === "recommendations" && item.evidence === "") return { ...item };
      if (typeof item.evidence !== "string" || !evidence.has(item.evidence)) {
        throw withAiDiagnostics(new ApiError(502, "AI_EVIDENCE_INVALID", "The resume analysis could not verify an evidence reference."), {
          validation_field: `${field}[].evidence`, validation_rule: "source_reference",
        });
      }
      return { ...item, evidence: evidence.get(item.evidence) };
    });
  }
  return resolved;
}
