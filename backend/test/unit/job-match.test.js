import assert from "node:assert/strict";
import { test } from "node:test";
import { createJobMatcher, validateJobMatch } from "../../src/job-match.js";

const job = "Seeking JavaScript and SQL skills for an entry-level developer role.";
const resume = "Built a JavaScript project. Studied databases with SQL.";
const requirements = [
  { requirement: "JavaScript", job_evidence: "JavaScript", status: "met", resume_evidence: "JavaScript project", explanation: "A project uses JavaScript." },
  { requirement: "SQL", job_evidence: "SQL", status: "partial", resume_evidence: "SQL", explanation: "Coursework shows some SQL use." },
  { requirement: "Entry-level developer role", job_evidence: "entry-level developer role", status: "not_evidenced", resume_evidence: "", explanation: "The resume does not directly state a developer role." },
];

test("job matching derives the published equal-weight score from grounded assessments", () => {
  const result = validateJobMatch({ requirements }, job, resume);
  assert.equal(result.match_score, 50);
  assert.equal(result.matching_skills.length, 2);
  assert.equal(result.missing_skills.length, 1);
  assert.equal(validateJobMatch({ requirements: [] }, job, resume).match_score, null);
});

test("job matching rejects invented evidence, repeated requirements, and unsupported claims", () => {
  assert.throws(() => validateJobMatch({ requirements: [{ ...requirements[0], job_evidence: "Python" }] }, job, resume));
  assert.throws(() => validateJobMatch({ requirements: [{ ...requirements[0], resume_evidence: "ten years of work" }] }, job, resume));
  assert.throws(() => validateJobMatch({ requirements: [requirements[0], requirements[0]] }, job, resume));
  assert.throws(() => validateJobMatch({ requirements: [{ ...requirements[0], status: "met", resume_evidence: "" }] }, job, resume));
});

test("job evidence accepts normal document whitespace while rejecting other controls", () => {
  const multilineJob = "Required skills:\r\nJavaScript and\tSQL";
  const multilineResume = "Projects:\nJavaScript and\tSQL tracker";
  const assessment = {
    ...requirements[0], job_evidence: multilineJob, resume_evidence: multilineResume,
  };
  const result = validateJobMatch({ requirements: [assessment] }, multilineJob, multilineResume);
  assert.equal(result.requirements[0].job_evidence, multilineJob);
  assert.equal(result.requirements[0].resume_evidence, multilineResume);
  assert.equal(result.match_score, 100);

  for (const field of ["job_evidence", "resume_evidence"]) {
    for (const control of ["\u0000", "\u000b", "\u007f"]) {
      assert.throws(() => validateJobMatch({ requirements: [{ ...assessment, [field]: `JavaScript${control}` }] }, multilineJob, multilineResume), {
        code: "AI_RESPONSE_INVALID",
      });
    }
  }
  assert.throws(() => validateJobMatch({ requirements: [{ ...assessment, requirement: "JavaScript\nSQL" }] }, multilineJob, multilineResume), {
    code: "AI_RESPONSE_INVALID",
  });
  assert.throws(() => validateJobMatch({ requirements: [{ ...assessment, job_evidence: "TypeScript\nSQL" }] }, multilineJob, multilineResume), {
    code: "AI_EVIDENCE_INVALID",
  });
});

test("job matching sends a schema-constrained request and validates the provider response", async () => {
  let body;
  const match = createJobMatcher({ apiKey: "test-only", model: "openai/gpt-oss-20b", fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ requirements }) } }] }), { status: 200 });
  } });
  const result = await match(job, resume);
  assert.equal(result.match_score, 50);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.messages[1].content.includes(job), true);
  const instructions = body.messages[0].content;
  assert.match(instructions, /requirement within 160 characters, job_evidence within 350 characters, resume_evidence within 400 characters, and explanation within 400 characters/);
  assert.match(instructions, /requirement, job_evidence, and explanation must contain non-whitespace text/);
  assert.match(instructions, /requirement and explanation on one line without tabs/);
  assert.match(instructions, /character-for-character from job_text as one unbroken span/);
  assert.match(instructions, /resume_evidence copied character-for-character as one unbroken span from resume_text/);
  assert.equal(result.prompt_version, "job-match-v3");
});

test("job matching keeps field limits and exact evidence when the request includes length guidance", async () => {
  const sourceJob = `${job} ${"J".repeat(351)}`;
  const sourceResume = `${resume} ${"R".repeat(401)}`;
  const boundary = {
    requirement: "A".repeat(160), job_evidence: "J".repeat(350),
    status: "met", resume_evidence: "R".repeat(400), explanation: "E".repeat(400),
  };
  const matchFor = (assessment) => createJobMatcher({
    apiKey: "test-only", model: "openai/gpt-oss-20b",
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ requirements: [assessment] }) } }] })),
  });
  assert.equal((await matchFor(boundary)(sourceJob, sourceResume)).match_score, 100);
  for (const [field, overlong] of [
    ["requirement", "A".repeat(161)], ["job_evidence", "J".repeat(351)],
    ["resume_evidence", "R".repeat(401)], ["explanation", "E".repeat(401)],
  ]) {
    await assert.rejects(matchFor({ ...boundary, [field]: overlong })(sourceJob, sourceResume), { code: "AI_RESPONSE_INVALID" });
  }
  await assert.rejects(matchFor({
    ...requirements[0], job_evidence: "JavaScript and Python",
  })("Required: JavaScript; helpful: Python.", resume), { code: "AI_EVIDENCE_INVALID" });
});

test("job matching reports a response-stream failure as retryable provider unavailability", async () => {
  const match = createJobMatcher({ apiKey: "test-only", model: "openai/gpt-oss-20b",
    fetchImpl: async () => new Response(new ReadableStream({ pull() { throw new Error("connection lost"); } })) });
  await assert.rejects(match(job, resume), (error) => error.code === "AI_PROVIDER_UNAVAILABLE" && error.retryable === true);
});
