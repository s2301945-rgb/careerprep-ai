import { readFile } from "node:fs/promises";
import { getConfig } from "../src/env.js";
import { createResumeAI } from "../src/resume-ai.js";
import { ApiError } from "../src/errors.js";

function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

async function main() {
  const { groqApiKey, groqModel } = getConfig();
  if (!groqApiKey) {
    console.error("Live evaluation blocked: configure GROQ_API_KEY in the ignored backend/.env.");
    process.exitCode = 1;
    return;
  }

  const cases = JSON.parse(await readFile(new URL("../test/fixtures/resume-evaluation-set.json", import.meta.url), "utf8"));
  const ai = createResumeAI({ apiKey: groqApiKey, model: groqModel });
  let passed = 0;
  for (const item of cases) {
    try {
      const { result: profile } = await ai.extractProfile(item.resume_text);
      const { result: analysis } = await ai.analyze(item.resume_text, profile);
      const hasSkill = profile.skills.some(({ name }) => normalize(name) === normalize(item.expected_skill));
      const hasEvidence = analysis.strengths.some(({ evidence }) =>
        normalize(evidence).includes(normalize(item.expected_evidence)),
      );
      if (hasSkill && hasEvidence) passed += 1;
      console.log(item.id, { expectedSkill: hasSkill, achievementEvidence: hasEvidence });
    } catch (error) {
      console.error(item.id, error instanceof ApiError ? error.code : "EVALUATION_FAILED");
    }
  }
  console.log(`Resume AI evaluation: ${passed}/${cases.length} passed.`);
  if (passed !== cases.length) process.exitCode = 1;
}

await main();
