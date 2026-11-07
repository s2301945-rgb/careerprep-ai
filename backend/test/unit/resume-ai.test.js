import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createResumeAI, validateResumeAnalysis, validateResumeProfile } from "../../src/resume-ai.js";

const evaluationSet = JSON.parse(readFileSync(new URL("../fixtures/resume-evaluation-set.json", import.meta.url), "utf8"));

function profileFor(item) {
  const skillsLine = item.resume_text.match(/^Skills:.*$/im)?.[0] ?? item.expected_skill;
  return {
    summary: `Entry-level candidate with ${item.expected_skill} experience.`,
    skills: [{ name: item.expected_skill, evidence: skillsLine }],
    education: [],
    projects: [],
    experience: [],
  };
}

function analysisFor(item) {
  return {
    summary: "The resume includes a relevant, documented accomplishment.",
    strengths: [{ text: "Includes a specific result.", evidence: item.expected_evidence }],
    weaknesses: [{ text: "Some role details could be clearer.", evidence: item.expected_evidence }],
    missing_sections: [{ section: "Employment dates", reason: "No dates were supplied for one role." }],
    recommendations: [{ text: "Add months and years for each experience." }],
    rubric: { clarity: 70, relevance: 75, evidence: 80, completeness: 65 },
    skill_assessments: [{ name: item.expected_skill, score: 80, evidence: item.resume_text.match(/^Skills:.*$/im)?.[0] ?? item.expected_skill }],
  };
}

test("Week 3 evaluation set keeps profile and assessment claims grounded", () => {
  assert.equal(evaluationSet.length, 3);
  for (const item of evaluationSet) {
    const profile = validateResumeProfile(profileFor(item), item.resume_text);
    const analysis = validateResumeAnalysis(analysisFor(item), item.resume_text, profile);
    assert.equal(profile.skills[0].name, item.expected_skill);
    assert.ok(item.resume_text.toLocaleLowerCase().includes(analysis.strengths[0].evidence.toLocaleLowerCase()));
    assert.equal(analysis.overall_score, 73);
  }
});

test("profiles keep grounded education and achievements when a school or role is unstated", () => {
  const source = "Computer Systems Servicing NC II\nCoordinated three student events with 200 attendees.";
  const content = {
    summary: "Candidate with a certification and event experience.",
    skills: [],
    education: [{ credential: "Computer Systems Servicing NC II", institution: "", evidence: "Computer Systems Servicing NC II" }],
    experience: [{ role: "", organization: "", highlights: [{ text: "Coordinated three events.", evidence: "Coordinated three student events with 200 attendees." }] }],
  };
  const profile = validateResumeProfile(content, source);
  assert.deepEqual(profile.education, content.education);
  assert.deepEqual(profile.experience, content.experience);
  assert.throws(() => validateResumeProfile({
    ...content, education: [{ ...content.education[0], credential: "" }],
  }, source), { code: "AI_RESPONSE_INVALID" });
  assert.throws(() => validateResumeProfile({
    ...content, experience: [{ role: "", organization: "", highlights: [] }],
  }, source), { code: "AI_RESPONSE_INVALID" });
});

test("profile and analysis validators reject invented evidence and unknown skills", () => {
  const item = evaluationSet[0];
  assert.throws(() => validateResumeProfile({
    summary: "A profile summary.",
    skills: [{ name: "Rust", evidence: "Expert in Rust" }],
    education: [], experience: [],
  }, item.resume_text), { code: "AI_EVIDENCE_INVALID" });

  const profile = validateResumeProfile(profileFor(item), item.resume_text);
  assert.throws(() => validateResumeAnalysis({
    ...analysisFor(item),
    skill_assessments: [{ name: "Rust", score: 90, evidence: "JavaScript" }],
  }, item.resume_text, profile), { code: "AI_RESPONSE_INVALID" });
});

test("Groq profile and analysis calls are mocked, JSON-only, and schema validated", async () => {
  const item = evaluationSet[0];
  const sent = [];
  const ai = createResumeAI({
    apiKey: "test-key",
    model: "test/model",
    fetchImpl: async (url, options) => {
      sent.push({ url, options });
      const body = JSON.parse(options.body);
      const content = body.messages[0].content.startsWith("Extract")
        ? profileFor(item)
        : analysisFor(item);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
    },
  });
  const profile = await ai.extractProfile(item.resume_text);
  const analysis = await ai.analyze(item.resume_text, profile.result);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(sent[0].options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(sent[0].options.body).response_format, { type: "json_object" });
  assert.equal(Object.hasOwn(JSON.parse(sent[0].options.body), "store"), false);
  assert.equal(profile.provider, "groq");
  assert.equal(analysis.result.overall_score, 73);
});

test("the default Groq model requests strict profile and analysis schemas and still validates evidence", async () => {
  const item = evaluationSet[0];
  const formats = [];
  const ai = createResumeAI({
    apiKey: "test-key", model: "openai/gpt-oss-20b",
    fetchImpl: async (_url, options) => {
      const { response_format: format } = JSON.parse(options.body);
      formats.push(format);
      const content = formats.length === 1
        ? profileFor(item)
        : { ...analysisFor(item), strengths: [{ text: "Made up.", evidence: "This is not in the resume." }] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
    },
  });
  const { result: profile } = await ai.extractProfile(item.resume_text);
  await assert.rejects(ai.analyze(item.resume_text, profile), { code: "AI_EVIDENCE_INVALID" });
  assert.deepEqual(formats.map(({ type, json_schema }) => [type, json_schema.name, json_schema.strict]), [
    ["json_schema", "resume_profile", true],
    ["json_schema", "resume_analysis", true],
  ]);
  assert.equal(formats[1].json_schema.schema.properties.rubric.properties.clarity.type, "integer");
});

test("provider errors and malformed JSON fail without returning a success-shaped result", async () => {
  const unavailable = createResumeAI({
    apiKey: "test-key", model: "test/model",
    fetchImpl: async () => new Response("upstream", { status: 429 }),
  });
  await assert.rejects(unavailable.extractProfile(evaluationSet[0].resume_text), { code: "AI_PROVIDER_RATE_LIMITED", retryable: true });

  const badCredential = createResumeAI({
    apiKey: "test-key", model: "test/model",
    fetchImpl: async () => new Response("forbidden", { status: 403 }),
  });
  await assert.rejects(badCredential.extractProfile(evaluationSet[0].resume_text), { code: "AI_PROVIDER_AUTH", retryable: false });

  const disconnected = createResumeAI({
    apiKey: "test-key", model: "test/model",
    fetchImpl: async () => { throw new Error("network failure"); },
  });
  await assert.rejects(disconnected.extractProfile(evaluationSet[0].resume_text), { code: "AI_PROVIDER_UNAVAILABLE", retryable: true });

  const malformed = createResumeAI({
    apiKey: "test-key", model: "test/model",
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 }),
  });
  await assert.rejects(malformed.extractProfile(evaluationSet[0].resume_text), { code: "AI_RESPONSE_INVALID" });
});

test("provider timeouts and interrupted response bodies return retryable AI errors", async () => {
  const resumeText = evaluationSet[0].resume_text;
  const base = { apiKey: "test-key", model: "test/model" };
  const timeout = createResumeAI({
    ...base,
    fetchImpl: async () => { throw new DOMException("timed out", "TimeoutError"); },
  });
  await assert.rejects(timeout.extractProfile(resumeText), { status: 504, code: "AI_TIMEOUT", retryable: true });

  for (const [error, status, code] of [
    [new DOMException("body aborted", "AbortError"), 504, "AI_TIMEOUT"],
    [new TypeError("connection closed"), 503, "AI_PROVIDER_UNAVAILABLE"],
  ]) {
    const ai = createResumeAI({
      ...base,
      fetchImpl: async () => new Response(new ReadableStream({
        pull(controller) { controller.error(error); },
      })),
    });
    await assert.rejects(ai.extractProfile(resumeText), { status, code, retryable: true });
  }
});

test("missing Groq credentials are reported honestly without making a request", async () => {
  const ai = createResumeAI({ apiKey: "", model: "test/model", fetchImpl: () => { throw new Error("must not call"); } });
  await assert.rejects(ai.extractProfile(evaluationSet[0].resume_text), { code: "AI_NOT_CONFIGURED" });
});
