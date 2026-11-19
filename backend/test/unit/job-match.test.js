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
});

test("job matching reports a response-stream failure as retryable provider unavailability", async () => {
  const match = createJobMatcher({ apiKey: "test-only", model: "openai/gpt-oss-20b",
    fetchImpl: async () => new Response(new ReadableStream({ pull() { throw new Error("connection lost"); } })) });
  await assert.rejects(match(job, resume), (error) => error.code === "AI_PROVIDER_UNAVAILABLE" && error.retryable === true);
});
