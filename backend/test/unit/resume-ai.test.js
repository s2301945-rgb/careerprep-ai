import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createResumeAI, validateResumeAnalysis, validateResumeProfile } from "../../src/resume-ai.js";
import { getAiDiagnostics } from "../../src/ai-diagnostics.js";
import { buildEvidenceCatalog } from "../../src/analysis-evidence.js";

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

function analysisReferences(result, source) {
  const catalog = buildEvidenceCatalog(source);
  const normalized = (value) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const output = structuredClone(result);
  for (const field of ["strengths", "weaknesses", "recommendations", "skill_assessments"]) {
    for (const item of output[field] ?? []) {
      if (field === "recommendations" && item.evidence === undefined) item.evidence = "";
      if (typeof item.evidence !== "string" || !item.evidence.trim()) continue;
      item.evidence = catalog.find(({ text }) => normalized(text).includes(normalized(item.evidence)))?.id ?? item.evidence;
    }
  }
  return output;
}

function providerResponse(result, source) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(source ? analysisReferences(result, source) : result) } }] }));
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

test("analysis reference diagnostics identify only the field and rule without exposing content or keys", async () => {
  const item = evaluationSet[0];
  const privateSource = "PRIVATE_SYNTHETIC_SOURCE_SENTINEL_49281";
  const invalidQuote = "PRIVATE_SYNTHETIC_GENERATED_QUOTE_SENTINEL_49281";
  const apiKey = "TEST_ONLY_KEY_SENTINEL_49281";
  const source = `${item.resume_text}\n${privateSource}`;
  const profile = validateResumeProfile(profileFor(item), source);
  for (const field of ["strengths", "weaknesses", "recommendations", "skill_assessments"]) {
    const result = {
      ...analysisFor(item),
      [field]: field === "skill_assessments"
        ? [{ name: item.expected_skill, score: 50, evidence: invalidQuote }]
        : [{ text: "A synthetic finding.", evidence: invalidQuote }],
    };
    const ai = createResumeAI({
      apiKey, model: "test/model",
      fetchImpl: async () => providerResponse(result, source),
    });
    await assert.rejects(ai.analyze(source, profile), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, "AI_EVIDENCE_INVALID");
      assert.equal(error.message, "The resume analysis could not verify an evidence reference.");
      const diagnostic = JSON.parse(JSON.stringify(getAiDiagnostics(error)));
      assert.deepEqual(diagnostic, {
        operation: "resume_analysis", validation_field: `${field}[].evidence`, validation_rule: "source_reference",
      });
      assert.equal(Object.hasOwn(error, "validation_field"), false);
      const exposed = JSON.stringify({ error, diagnostic });
      for (const sentinel of [privateSource, invalidQuote, apiKey]) assert.equal(exposed.includes(sentinel), false);
      return true;
    });
  }
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
      return providerResponse(body.messages[0].content.startsWith("Extract") ? content : analysisReferences(content, item.resume_text));
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

test("profile requests state the enforced limits and keep valid boundary values", async () => {
  const source = `Synthetic student. JavaScript. ${"E".repeat(401)}`;
  const profile = {
    summary: "S".repeat(700),
    skills: [{ name: "N".repeat(80), evidence: "E".repeat(400) }],
    education: [{ credential: "C".repeat(160), institution: "I".repeat(160), evidence: "E".repeat(400) }],
    projects: [{ name: "P".repeat(160), description: "D".repeat(300), evidence: "E".repeat(400) }],
    experience: [{ role: "R".repeat(160), organization: "O".repeat(160), highlights: [{ text: "T".repeat(300), evidence: "E".repeat(400) }] }],
  };
  let request;
  const ai = createResumeAI({
    apiKey: "test-only", model: "openai/gpt-oss-20b",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(profile) } }] }));
    },
  });
  const generated = await ai.extractProfile(source);
  assert.deepEqual(generated.result, profile);
  const instructions = request.messages[0].content;
  assert.match(instructions, /summary within 700 characters/);
  assert.match(instructions, /at most 30 skills, 12 education entries, 30 projects, 20 experience entries, and 8 highlights per experience entry/);
  assert.match(instructions, /skill name within 80 characters/);
  assert.match(instructions, /credential, institution, project name, role, and organization within 160 characters/);
  assert.match(instructions, /project description and each highlight text within 300 characters/);
  assert.match(instructions, /every evidence quote within 400 characters/);
  assert.match(instructions, /non-whitespace text except credential, institution, role, and organization/);
  assert.match(instructions, /at least one non-empty credential or institution/);
  assert.match(instructions, /non-empty role or organization or at least one grounded highlight/);
  assert.equal(generated.promptVersion, "resume-ai-v5");
});

test("profile diagnostics retain strict field and list bounds without leaking source or generated values", async () => {
  const privateSource = "PRIVATE_SYNTHETIC_PROFILE_SOURCE_81394";
  const apiKey = "TEST_ONLY_PROFILE_KEY_81394";
  const generatedMarker = "PRIVATE_SYNTHETIC_PROFILE_OUTPUT_81394";
  const source = `${privateSource} JavaScript ${"E".repeat(401)}`;
  const profile = {
    summary: "Synthetic student.",
    skills: [{ name: "JavaScript", evidence: "JavaScript" }],
    education: [{ credential: "Student", institution: "", evidence: "JavaScript" }],
    projects: [{ name: "A project", description: "A short description.", evidence: "JavaScript" }],
    experience: [{ role: "", organization: "", highlights: [{ text: "A grounded activity.", evidence: "JavaScript" }] }],
  };
  const cases = [
    ["summary", 700, (copy) => { copy.summary = generatedMarker + "x".repeat(701); }],
    ["skills[].name", 80, (copy) => { copy.skills[0].name = "x".repeat(81); }],
    ["skills[].evidence", 400, (copy) => { copy.skills[0].evidence = "E".repeat(401); }],
    ["education[].credential", 160, (copy) => { copy.education[0].credential = "x".repeat(161); }],
    ["education[].institution", 160, (copy) => { copy.education[0].institution = "x".repeat(161); }],
    ["education[].evidence", 400, (copy) => { copy.education[0].evidence = "E".repeat(401); }],
    ["projects[].name", 160, (copy) => { copy.projects[0].name = "x".repeat(161); }],
    ["projects[].description", 300, (copy) => { copy.projects[0].description = "x".repeat(301); }],
    ["projects[].evidence", 400, (copy) => { copy.projects[0].evidence = "E".repeat(401); }],
    ["experience[].role", 160, (copy) => { copy.experience[0].role = "x".repeat(161); }],
    ["experience[].organization", 160, (copy) => { copy.experience[0].organization = "x".repeat(161); }],
    ["experience[].highlights[].text", 300, (copy) => { copy.experience[0].highlights[0].text = "x".repeat(301); }],
    ["experience[].highlights[].evidence", 400, (copy) => { copy.experience[0].highlights[0].evidence = "E".repeat(401); }],
    ["skills", 30, (copy) => { copy.skills = Array(31).fill(copy.skills[0]); }, "max_items"],
    ["education", 12, (copy) => { copy.education = Array(13).fill(copy.education[0]); }, "max_items"],
    ["projects", 30, (copy) => { copy.projects = Array(31).fill(copy.projects[0]); }, "max_items"],
    ["experience", 20, (copy) => { copy.experience = Array(21).fill(copy.experience[0]); }, "max_items"],
    ["experience[].highlights", 8, (copy) => { copy.experience[0].highlights = Array(9).fill(copy.experience[0].highlights[0]); }, "max_items"],
  ];
  for (const [field, limit, mutate, rule = "max_length"] of cases) {
    const output = structuredClone(profile);
    mutate(output);
    const ai = createResumeAI({
      apiKey, model: "test/model",
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] })),
    });
    await assert.rejects(ai.extractProfile(source), (error) => {
      assert.equal(error.code, "AI_RESPONSE_INVALID");
      const diagnostic = JSON.parse(JSON.stringify(getAiDiagnostics(error)));
      assert.deepEqual(diagnostic, {
        operation: "resume_profile", validation_field: field, validation_rule: rule, validation_limit: limit,
      });
      for (const sentinel of [privateSource, apiKey, generatedMarker]) {
        assert.equal(JSON.stringify({ error, diagnostic }).includes(sentinel), false);
      }
      return true;
    });
  }
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
      return providerResponse(formats.length === 1 ? content : analysisReferences(content, item.resume_text));
    },
  });
  const { result: profile } = await ai.extractProfile(item.resume_text);
  await assert.rejects(ai.analyze(item.resume_text, profile), { code: "AI_EVIDENCE_INVALID" });
  assert.deepEqual(formats.map(({ type, json_schema }) => [type, json_schema.name, json_schema.strict]), [
    ["json_schema", "resume_profile", true],
    ["json_schema", "resume_analysis", true],
    ["json_schema", "resume_analysis", true],
  ]);
  assert.equal(formats[1].json_schema.schema.properties.rubric.properties.clarity.type, "integer");
});

test("analysis requests communicate response limits and handle an education-only profile", async () => {
  const source = "Synthetic candidate. Bachelor of Information Technology, Example College. Skills: JavaScript.";
  const profile = validateResumeProfile({
    summary: "A student with JavaScript skills.",
    skills: [{ name: "JavaScript", evidence: "JavaScript" }],
    education: [{ credential: "Bachelor of Information Technology", institution: "Example College", evidence: "Bachelor of Information Technology, Example College" }],
    projects: [], experience: [],
  }, source);
  const output = {
    summary: "Education and skills are listed, with no project example supplied.",
    strengths: [], weaknesses: [],
    missing_sections: [{ section: "Projects", reason: "No project example appears in the source." }],
    recommendations: [{ text: "Add a project example with a clear result.", evidence: "" }],
    rubric: { clarity: 70, relevance: 70, evidence: 20, completeness: 40 },
    skill_assessments: [{ name: "JavaScript", score: 40, evidence: "JavaScript" }],
  };
  let request;
  const ai = createResumeAI({
    apiKey: "test-only", model: "openai/gpt-oss-20b",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return providerResponse(output, source);
    },
  });
  const analysis = await ai.analyze(source, profile);
  assert.equal(analysis.result.overall_score, 50);
  assert.deepEqual(analysis.result.recommendations, [{ text: output.recommendations[0].text }]);
  const instructions = request.messages[0].content;
  assert.match(instructions, /summary within 900 characters/);
  assert.match(instructions, /at most 8 items in each of strengths, weaknesses, missing_sections, and recommendations/);
  assert.match(instructions, /at most 30 skill_assessments/);
  assert.match(instructions, /finding or recommendation text within 400 characters/);
  assert.match(instructions, /section within 100 characters and reason within 240 characters/);
  assert.match(instructions, /skill name within 80 characters/);
  assert.match(instructions, /evidence must be non-empty catalog ids/);
  assert.match(instructions, /except recommendation evidence for absent information/);
  assert.match(instructions, /Distinguish a listed skill from demonstrated proficiency/);
  assert.match(instructions, /do not describe it as expertise, proficiency, commercial work, or years of experience without supporting activities or dates/);
  assert.match(instructions, /aspirations, not completed achievements or proof of communication, teamwork, or documentation/);
  assert.match(instructions, /recommend concrete examples instead of inventing them/);
  assert.equal(analysis.promptVersion, "resume-ai-v8");
  const input = JSON.parse(request.messages[1].content);
  assert.equal(Object.hasOwn(input, "resume_text"), false);
  assert.equal(input.evidence_catalog.map(({ text }) => text).join(""), source);
  const referenceIds = input.evidence_catalog.filter(({ text }) => text.trim()).map(({ id }) => id);
  for (const field of ["strengths", "weaknesses", "skill_assessments"]) {
    assert.deepEqual(request.response_format.json_schema.schema.properties[field].items.properties.evidence.enum, referenceIds);
  }
  assert.deepEqual(request.response_format.json_schema.schema.properties.recommendations.items.properties.evidence.enum, ["", ...referenceIds]);
});

test("analysis makes one corrective request for a source quote and fully validates the correction", async () => {
  const item = evaluationSet[0];
  const source = `${item.resume_text}\n${" ".repeat(500)}\nPRIVATE_SOURCE_SENTINEL_31842`;
  const profile = validateResumeProfile(profileFor(item), source);
  const invalidQuote = "PRIVATE_GENERATED_QUOTE_SENTINEL_31842";
  const apiKey = "TEST_ONLY_RECOVERY_KEY_31842";
  const invalid = { ...analysisFor(item), strengths: [{ text: "A synthetic finding.", evidence: invalidQuote }] };
  const requests = [];
  const signals = [];
  const ai = createResumeAI({
    apiKey, model: "openai/gpt-oss-20b",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      signals.push(options.signal);
      assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
      return providerResponse(requests.length === 1 ? invalid : analysisFor(item), source);
    },
  });
  const analysis = await ai.analyze(source, profile);
  assert.equal(analysis.result.overall_score, 73);
  assert.equal(analysis.promptVersion, "resume-ai-v8");
  assert.equal(requests.length, 2);
  assert.equal(signals[0], signals[1]);
  assert.deepEqual(requests[1].response_format, requests[0].response_format);
  for (const field of ["model", "temperature", "reasoning_effort", "max_completion_tokens"]) {
    assert.equal(requests[1][field], requests[0][field]);
  }
  assert.deepEqual(requests[1].messages.slice(0, 2), requests[0].messages);
  assert.equal(requests[1].messages[2].role, "assistant");
  assert.deepEqual(JSON.parse(requests[1].messages[2].content), analysisReferences(invalid, source));
  const correction = JSON.parse(requests[1].messages[3].content);
  assert.deepEqual(correction.validation_error, { field: "strengths[].evidence", rule: "source_reference" });
  assert.equal(JSON.stringify(requests).includes(apiKey), false);
  for (const sentinel of [apiKey, invalidQuote, "PRIVATE_SOURCE_SENTINEL_31842"]) {
    assert.equal(JSON.stringify(analysis).includes(sentinel), false);
  }
});

test("analysis stops after one invalid correction and rechecks non-evidence fields", async () => {
  const item = evaluationSet[0];
  const profile = validateResumeProfile(profileFor(item), item.resume_text);
  const invalid = { ...analysisFor(item), strengths: [{ text: "A synthetic finding.", evidence: "A quote absent from the synthetic source." }] };
  for (const [correction, code] of [
    [invalid, "AI_EVIDENCE_INVALID"],
    [{ ...analysisFor(item), rubric: { clarity: 101, relevance: 70, evidence: 70, completeness: 70 } }, "AI_RESPONSE_INVALID"],
  ]) {
    let calls = 0;
    const ai = createResumeAI({
      apiKey: "test-only", model: "test/model",
      fetchImpl: async () => providerResponse(++calls === 1 ? invalid : correction, item.resume_text),
    });
    await assert.rejects(ai.analyze(item.resume_text, profile), { code });
    assert.equal(calls, 2);
  }
});

test("valid analysis, profile extraction, and unrelated failures make only one provider request", async () => {
  const item = evaluationSet[0];
  const profile = validateResumeProfile(profileFor(item), item.resume_text);
  let validCalls = 0;
  const valid = createResumeAI({ apiKey: "test-only", model: "test/model", fetchImpl: async () => {
    validCalls += 1;
    return providerResponse(analysisFor(item), item.resume_text);
  } });
  assert.equal((await valid.analyze(item.resume_text, profile)).result.overall_score, 73);
  assert.equal(validCalls, 1);

  const cases = [
    [() => new Response("rejected", { status: 400 }), "AI_REQUEST_REJECTED"],
    [() => new Response("rejected", { status: 401 }), "AI_PROVIDER_AUTH"],
    [() => new Response("limited", { status: 429 }), "AI_PROVIDER_RATE_LIMITED"],
    [() => new Response("unavailable", { status: 500 }), "AI_PROVIDER_UNAVAILABLE"],
    [() => { throw new TypeError("synthetic connection error"); }, "AI_PROVIDER_UNAVAILABLE"],
    [() => new Response(JSON.stringify({ choices: [{ message: { content: "invalid JSON" } }] })), "AI_RESPONSE_INVALID"],
    [() => providerResponse({ ...analysisFor(item), summary: "x".repeat(901) }, item.resume_text), "AI_RESPONSE_INVALID"],
    [() => providerResponse({ ...profileFor(item), skills: [{ name: item.expected_skill, evidence: "An absent profile source quote." }] }), "AI_EVIDENCE_INVALID", true],
  ];
  for (const [response, code, isProfile] of cases) {
    let calls = 0;
    const ai = createResumeAI({ apiKey: "test-only", model: "test/model", fetchImpl: async () => {
      calls += 1;
      return response();
    } });
    await assert.rejects(isProfile ? ai.extractProfile(item.resume_text) : ai.analyze(item.resume_text, profile), { code });
    assert.equal(calls, 1, code);
  }
});

test("corrective analysis shares its original 25-second deadline", async (t) => {
  const item = evaluationSet[0];
  const profile = validateResumeProfile(profileFor(item), item.resume_text);
  const controller = new AbortController();
  let deadlines = 0;
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 25_000);
    deadlines += 1;
    return controller.signal;
  });
  let calls = 0;
  const ai = createResumeAI({ apiKey: "test-only", model: "test/model", fetchImpl: async (_url, options) => {
    calls += 1;
    assert.equal(options.signal, controller.signal);
    if (calls === 1) return providerResponse({ ...analysisFor(item), strengths: [{ text: "A finding.", evidence: "Absent source quote." }] }, item.resume_text);
    controller.abort(new DOMException("Synthetic timeout", "TimeoutError"));
    options.signal.throwIfAborted();
  } });
  await assert.rejects(ai.analyze(item.resume_text, profile), { code: "AI_TIMEOUT", status: 504 });
  assert.equal(calls, 2);
  assert.equal(deadlines, 1);
});

test("analysis does not start a corrective provider request after its deadline expires", async (t) => {
  const item = evaluationSet[0];
  const profile = validateResumeProfile(profileFor(item), item.resume_text);
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  let calls = 0;
  const ai = createResumeAI({ apiKey: "test-only", model: "test/model", fetchImpl: async () => {
    calls += 1;
    controller.abort(new DOMException("Synthetic timeout", "TimeoutError"));
    return providerResponse({ ...analysisFor(item), strengths: [{ text: "A finding.", evidence: "Absent source quote." }] }, item.resume_text);
  } });
  await assert.rejects(ai.analyze(item.resume_text, profile), { code: "AI_TIMEOUT", status: 504 });
  assert.equal(calls, 1);
});

test("strict-schema analysis still rejects oversized or empty findings without changing valid low scores", async () => {
  const item = evaluationSet[0];
  const source = `${"A".repeat(401)}\n${item.resume_text}`;
  const profile = validateResumeProfile(profileFor(item), source);
  const baseline = { ...analysisFor(item), rubric: { clarity: 8, relevance: 9, evidence: 8, completeness: 6 } };
  const aiFor = (output) => createResumeAI({
    apiKey: "test-only", model: "openai/gpt-oss-20b",
    fetchImpl: async () => providerResponse(output, source),
  });
  const boundary = {
    ...baseline, summary: "S".repeat(900),
    strengths: Array.from({ length: 8 }, () => ({ text: "T".repeat(400), evidence: "A".repeat(400) })),
  };
  assert.equal((await aiFor(boundary).analyze(source, profile)).result.overall_score, 8);
  const invalidOutputs = [
    { ...baseline, summary: "S".repeat(901) },
    { ...baseline, strengths: Array.from({ length: 9 }, () => baseline.strengths[0]) },
    { ...baseline, strengths: [{ text: "T".repeat(401), evidence: item.expected_evidence }] },
  ];
  for (const output of invalidOutputs) {
    await assert.rejects(aiFor(output).analyze(source, profile), { code: "AI_RESPONSE_INVALID" });
  }
  for (const output of [
    { ...baseline, strengths: [{ text: "An overlong source quote.", evidence: "A".repeat(401) }] },
    { ...baseline, weaknesses: [{ text: "Missing a project example.", evidence: "" }] },
  ]) {
    assert.throws(() => validateResumeAnalysis(output, source, profile), { code: "AI_RESPONSE_INVALID" });
    await assert.rejects(aiFor(output).analyze(source, profile), { code: "AI_EVIDENCE_INVALID" });
  }
  await assert.rejects(aiFor({
    ...baseline, strengths: [{ text: "An invented finding.", evidence: "Absent from the synthetic source." }],
  }).analyze(source, profile), { code: "AI_EVIDENCE_INVALID" });
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

test("unreadable rejection bodies preserve the existing provider error classifications", async () => {
  for (const [status, code, retryable] of [
    [400, "AI_REQUEST_REJECTED", false], [401, "AI_PROVIDER_AUTH", false],
    [429, "AI_PROVIDER_RATE_LIMITED", true], [500, "AI_PROVIDER_UNAVAILABLE", true],
  ]) {
    const ai = createResumeAI({
      apiKey: "test-only", model: "openai/gpt-oss-20b",
      fetchImpl: async () => new Response(new ReadableStream({ pull(controller) { controller.error(new Error("synthetic unreadable body")); } }), { status }),
    });
    await assert.rejects(ai.extractProfile(evaluationSet[0].resume_text), { code, retryable });
  }
});

test("missing Groq credentials are reported honestly without making a request", async () => {
  const ai = createResumeAI({ apiKey: "", model: "test/model", fetchImpl: () => { throw new Error("must not call"); } });
  await assert.rejects(ai.extractProfile(evaluationSet[0].resume_text), { code: "AI_NOT_CONFIGURED" });
});
