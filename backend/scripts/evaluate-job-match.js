import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJobMatcher } from "../src/job-match.js";
import { ApiError } from "../src/errors.js";

function normalize(value) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function evaluateJobMatchCase(sample, result) {
  const failures = [];
  const assessments = Array.isArray(result?.requirements) ? result.requirements : [];
  const candidates = [];
  for (const [index, expectation] of sample.expectations.entries()) {
    const criterion = normalize(expectation.job_evidence);
    const matches = assessments.flatMap((assessment, assessmentIndex) => {
      const quote = normalize(assessment.job_evidence);
      return quote && (quote.includes(criterion) || criterion.includes(quote)) ? [assessmentIndex] : [];
    });
    candidates.push(matches);
    if (!matches.length) failures.push({ criterion: index + 1, issue: "missing_assessment" });
    else if (matches.some((assessmentIndex) => !expectation.allowed_statuses.includes(assessments[assessmentIndex].status))) {
      failures.push({ criterion: index + 1, issue: "unexpected_status" });
    }
  }
  // A broad job quote can overlap several labels, but one assessment can cover
  // only one of them. Reassign earlier matches to find maximum distinct coverage.
  const assignedCriterion = new Map();
  function assign(criterionIndex, visited) {
    for (const assessmentIndex of candidates[criterionIndex]) {
      if (visited.has(assessmentIndex)) continue;
      visited.add(assessmentIndex);
      const previous = assignedCriterion.get(assessmentIndex);
      if (previous === undefined || assign(previous, visited)) {
        assignedCriterion.set(assessmentIndex, criterionIndex);
        return true;
      }
    }
    return false;
  }
  for (const criterionIndex of candidates.keys()) {
    if (candidates[criterionIndex].length && !assign(criterionIndex, new Set())) {
      failures.push({ criterion: criterionIndex + 1, issue: "missing_assessment" });
    }
  }
  const [minimum, maximum] = sample.score_range;
  if (!Number.isFinite(result?.match_score) || result.match_score < minimum || result.match_score > maximum) {
    failures.push({ issue: "score_outside_reference_range" });
  }
  return { passed: failures.length === 0, failures };
}

async function main() {
  if (!process.argv.includes("--live")) {
    console.log("Live job matching evaluation was not run. Use --live with a configured development provider.");
    return;
  }
  const { getConfig } = await import("../src/env.js");
  const { groqApiKey, groqModel } = getConfig();
  if (!groqApiKey) {
    console.error("Live job matching evaluation blocked: configure a development GROQ_API_KEY locally.");
    process.exitCode = 1;
    return;
  }
  const samples = JSON.parse(await readFile(new URL("../test/fixtures/job-match-evaluation-set.json", import.meta.url), "utf8"));
  const match = createJobMatcher({ apiKey: groqApiKey, model: groqModel });
  let passed = 0;
  for (const sample of samples) {
    try {
      const result = await match(sample.job_text, sample.resume_text);
      const assessment = evaluateJobMatchCase(sample, result);
      if (assessment.passed) passed += 1;
      console.log(sample.id, assessment);
    } catch (error) {
      console.error(sample.id, error instanceof ApiError ? error.code : "EVALUATION_FAILED");
    }
  }
  console.log(`Live job matching evaluation: ${passed}/${samples.length} passed.`);
  if (passed !== samples.length) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) await main();
