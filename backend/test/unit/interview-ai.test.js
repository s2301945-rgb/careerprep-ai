import assert from "node:assert/strict";
import { test } from "node:test";
import { createInterviewAI, validateInterviewEvaluation, validateInterviewQuestions } from "../../src/interview-ai.js";

const resume = "Built a scheduling project used by 120 students.";
const job = "Seeking an entry-level developer with JavaScript skills.";
const questions = Array.from({ length: 5 }, (_, index) => ({
  question_number: index + 1,
  question_type: index === 0 ? "technical" : "behavioral",
  question_text: `Tell me about project challenge ${index + 1}.`,
  context_quote: "scheduling project",
}));

test("interview questions require the requested count, order, uniqueness and grounded context", () => {
  assert.equal(validateInterviewQuestions({ questions }, 5, resume, job).length, 5);
  assert.throws(() => validateInterviewQuestions({ questions: questions.slice(0, 4) }, 5, resume, job));
  assert.throws(() => validateInterviewQuestions({ questions: [{ ...questions[0], context_quote: "invented award" }, ...questions.slice(1)] }, 5, resume, job));
  assert.throws(() => validateInterviewQuestions({ questions: [questions[0], questions[0], ...questions.slice(2)] }, 5, resume, job));
});

test("answer scoring uses technical weight only for technical questions", () => {
  const output = { relevance: 80, clarity: 70, completeness: 60, examples: 90, technical: 50,
    feedback: "Good example, clarify the outcome.", strengths: ["Concrete project"], suggestions: ["Describe your impact"] };
  assert.equal(validateInterviewEvaluation(output, "technical").overall_score, 73);
  assert.equal(validateInterviewEvaluation({ ...output, technical: null }, "behavioral").overall_score, 75.56);
  assert.throws(() => validateInterviewEvaluation({ ...output, relevance: 101 }, "technical"));
});

test("interview AI uses structured provider requests and validates generated questions", async () => {
  const calls = [];
  const service = createInterviewAI({ apiKey: "test-only", model: "openai/gpt-oss-20b", fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions }) } }] }));
  } });
  const generated = await service.generate(5, resume, job);
  assert.equal(generated.questions.length, 5);
  assert.equal(calls[0].response_format.type, "json_schema");
  assert.equal(calls[0].messages[1].content.includes(resume), true);
});

test("interview AI evaluates a typed answer and rejects malformed provider output", async () => {
  const evaluation = { relevance: 80, clarity: 70, completeness: 60, examples: 90, technical: null,
    feedback: "Good example, explain the impact.", strengths: ["Relevant project"], suggestions: ["Add a result"] };
  let body;
  const service = createInterviewAI({ apiKey: "test-only", model: "openai/gpt-oss-20b", fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(evaluation) } }] }));
  } });
  const result = await service.evaluate(questions[1], "I planned the project with classmates.", { resume_text: resume, job_text: job });
  assert.equal(result.result.overall_score, 75.56);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.messages[1].content.includes("I planned the project"), true);
  assert.throws(() => validateInterviewEvaluation({ ...evaluation, examples: 110 }, "behavioral"));
});

test("interview AI reports an interrupted response body as retryable", async () => {
  const service = createInterviewAI({ apiKey: "test-only", model: "openai/gpt-oss-20b",
    fetchImpl: async () => new Response(new ReadableStream({ pull() { throw new Error("connection lost"); } })) });
  await assert.rejects(service.generate(5, resume, job), (error) => error.code === "AI_PROVIDER_UNAVAILABLE" && error.retryable === true);
});
