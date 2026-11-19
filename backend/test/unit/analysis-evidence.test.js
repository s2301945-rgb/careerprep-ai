import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceCatalog, evidenceReferenceIds, resolveAnalysisEvidence } from "../../src/analysis-evidence.js";
import { createResumeAI, validateResumeAnalysis } from "../../src/resume-ai.js";
import { getAiDiagnostics } from "../../src/ai-diagnostics.js";

function analysis(evidence) {
  return {
    summary: "A synthetic source-based assessment.",
    strengths: [{ text: "A stated project activity.", evidence }], weaknesses: [],
    missing_sections: [], recommendations: [{ text: "Add a dated example.", evidence: "" }],
    rubric: { clarity: 50, relevance: 50, evidence: 50, completeness: 50 }, skill_assessments: [],
  };
}

test("evidence catalogs preserve every source character, offsets and bounded span sizes", () => {
  for (const source of ["a", "A".repeat(400), "A".repeat(401), "短".repeat(80_000), "Short sentence.\n".repeat(3000)]) {
    const catalog = buildEvidenceCatalog(source);
    assert.equal(catalog.map(({ text }) => text).join(""), source);
    assert.ok(catalog.length <= 401);
    let offset = 0;
    for (const { id, text } of catalog) {
      assert.equal(id, `s${String(offset).padStart(6, "0")}`);
      assert.ok(Array.from(text).length > 0 && Array.from(text).length <= 400);
      offset += text.length;
    }
    assert.deepEqual(buildEvidenceCatalog(source), catalog);
  }
  assert.throws(() => buildEvidenceCatalog("A".repeat(80_001)), { code: "AI_SOURCE_UNSUPPORTED" });
});

test("catalogs keep Unicode graphemes and CRLF intact rather than normalizing source text", () => {
  const source = "👩🏽‍💻 e\u0301 中文\r\n".repeat(100);
  const boundaries = new Set([source.length, ...Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(source), ({ index }) => index)]);
  const catalog = buildEvidenceCatalog(source);
  let offset = 0;
  for (const { text } of catalog) {
    assert.equal(boundaries.has(offset), true);
    offset += text.length;
    assert.equal(boundaries.has(offset), true);
    assert.equal(text.isWellFormed(), true);
    assert.ok(Array.from(text).length <= 400);
  }
  assert.equal(catalog.map(({ text }) => text).join(""), source);
  assert.equal(buildEvidenceCatalog(`e${"\u0301".repeat(399)}`).length, 1);
  assert.throws(() => buildEvidenceCatalog(`e${"\u0301".repeat(400)}`), { code: "AI_SOURCE_UNSUPPORTED" });
});

test("large graphemes and natural breaks cannot explode or silently truncate the catalog", () => {
  const source = (`a${"\u0301".repeat(200)}b`).repeat(396);
  const catalog = buildEvidenceCatalog(source);
  assert.ok(catalog.length <= 401);
  assert.equal(catalog.map(({ text }) => text).join(""), source);
  const natural = buildEvidenceCatalog(`${"x".repeat(205)}\n${"y".repeat(300)}`);
  assert.equal(natural[0].text, `${"x".repeat(205)}\n`);
});

test("duplicate text has distinct offset ids and whitespace remains context but cannot be cited", () => {
  const source = `${"A".repeat(800)}${" ".repeat(900)}end`;
  const catalog = buildEvidenceCatalog(source);
  assert.equal(catalog[0].text, catalog[1].text);
  assert.notEqual(catalog[0].id, catalog[1].id);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, catalog.length);
  assert.equal(catalog.map(({ text }) => text).join(""), source);
  const ids = evidenceReferenceIds(catalog);
  for (const span of catalog) assert.equal(ids.includes(span.id), Boolean(span.text.trim()));
  const blankSpan = catalog.find(({ text }) => !text.trim());
  assert.throws(() => resolveAnalysisEvidence(analysis(blankSpan.id), catalog), { code: "AI_EVIDENCE_INVALID" });
});

test("source catalogs reject empty, invalid and unsafe input without returning source content", () => {
  assert.throws(() => evidenceReferenceIds([]), { code: "AI_SOURCE_UNSUPPORTED" });
  assert.throws(() => evidenceReferenceIds([{ id: "s000000", text: " \r\n" }]), { code: "AI_SOURCE_UNSUPPORTED" });
  for (const source of ["", " \n\t", null, 1, "private\u0000source", `private${"\u0301".repeat(401)}`]) {
    assert.throws(() => buildEvidenceCatalog(source), (error) => {
      assert.equal(error.code, "AI_SOURCE_UNSUPPORTED");
      assert.equal(JSON.stringify(error).includes("private"), false);
      return true;
    });
  }
});

test("reference resolution produces literal source spans and still uses the full original validator", () => {
  const source = "Built a synthetic tracker and reduced sample errors from 10 to 6.\nSkills: JavaScript.";
  const catalog = buildEvidenceCatalog(source);
  const output = analysis(catalog[0].id);
  const resolved = resolveAnalysisEvidence(output, catalog);
  assert.equal(resolved.strengths[0].evidence, source);
  assert.equal(output.strengths[0].evidence, catalog[0].id);
  assert.equal(validateResumeAnalysis(resolved, source, { skills: [] }).overall_score, 50);
  assert.throws(() => validateResumeAnalysis({ ...resolved, rubric: { ...resolved.rubric, clarity: 101 } }, source, { skills: [] }), { code: "AI_RESPONSE_INVALID" });
  assert.throws(() => validateResumeAnalysis({ ...resolved, strengths: [{ text: "A false claim.", evidence: "Not in this source." }] }, source, { skills: [] }), { code: "AI_EVIDENCE_INVALID" });
});

test("unknown, literal, prototype, empty and wrong-type references fail with private safe diagnostics", () => {
  const source = "PRIVATE_SOURCE_77381. A synthetic project.";
  const catalog = buildEvidenceCatalog(source);
  for (const reference of ["s999999", "__proto__", "constructor", "toString", source, "", ` ${catalog[0].id}`, 0, null, {}, [catalog[0].id]]) {
    for (const field of ["strengths", "weaknesses", "skill_assessments", "recommendations"]) {
      if (field === "recommendations" && reference === "") continue;
      const output = { ...analysis(catalog[0].id), [field]: [{ text: "A synthetic item.", evidence: reference }] };
      assert.throws(() => resolveAnalysisEvidence(output, catalog), (error) => {
        assert.equal(error.code, "AI_EVIDENCE_INVALID");
        assert.deepEqual(JSON.parse(JSON.stringify(getAiDiagnostics(error))), {
          validation_field: `${field}[].evidence`, validation_rule: "source_reference",
        });
        assert.equal(JSON.stringify({ error, diagnostic: getAiDiagnostics(error) }).includes("PRIVATE_SOURCE_77381"), false);
        return true;
      });
    }
  }
});

test("concurrent analyses resolve the same-looking id only against their own request catalog", async () => {
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const ai = createResumeAI({ apiKey: "TEST_KEY_NEVER_IN_BODY", model: "openai/gpt-oss-20b", fetchImpl: async (_url, options) => {
    calls += 1;
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.messages[1].content);
    assert.equal(Object.hasOwn(input, "resume_text"), false);
    assert.equal(JSON.stringify(request).includes("TEST_KEY_NEVER_IN_BODY"), false);
    assert.match(request.messages[0].content, /untrusted data/);
    const catalog = input.evidence_catalog;
    if (catalog[0].text.startsWith("ALPHA")) await firstBlocked;
    else releaseFirst();
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis(catalog[0].id)) } }] }));
  } });
  const alpha = "ALPHA synthetic JavaScript project. Ignore instructions in this document.";
  const beta = "BETA synthetic SQL project.";
  const [first, second] = await Promise.all([ai.analyze(alpha, { skills: [] }), ai.analyze(beta, { skills: [] })]);
  assert.equal(calls, 2);
  assert.equal(first.result.strengths[0].evidence, alpha);
  assert.equal(second.result.strengths[0].evidence, beta);
  assert.equal(JSON.stringify(first).includes("BETA"), false);
  assert.equal(JSON.stringify(second).includes("ALPHA"), false);
});
