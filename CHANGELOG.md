# Changelog

## Unreleased

- Clarify that aspirations and listed tools do not demonstrate proficiency or work experience in AI prompts, and add six labelled synthetic matching references with an explicit opt-in live evaluation command. Model accuracy remains subject to live verification.
- Extend PostgreSQL integration coverage for cross-account private downloads, renames, deletion and library isolation without changing the owner's file, metadata or cleanup state.
- Align the backend runtime declaration with CI on Node.js 22 and audit production dependencies in each CI job. Record the actual November 20 deployment recovery and remaining course/release gates.

- Added private PDF and DOCX resume management with authenticated upload, listing, rename, download, and deletion.
- Added text extraction, a draft profile users can edit and confirm, and saved AI analysis with cited evidence and rubric scores.
- Added mocked backend tests, disposable PostgreSQL integration, and a live Groq evaluation with synthetic resumes.
- Started Week 4 hardening for AI request controls, workspace error and loading states, CI, and release documentation.
- Fixed retries for saved job comparisons and interviews. Failed interview evaluations can retry the original saved answer.
- Added saved job descriptions, grounded requirement-by-requirement resume matching, and backend-calculated practice scores.
- Added five-question text mock interviews with saved answers, rubric feedback, history, and a failed-evaluation retry using the same answer.
- Show newly saved jobs in the mock interview selector without reopening the resume.
- Added owner-scoped API and PostgreSQL integration coverage for matching and interviews. The [November 19–20 hosted rehearsal](docs/06-sprint-log.md#signed-in-hosted-acceptance--november-1920-2026-asiamanila) verified private upload/download, profile confirmation, live Groq analysis, job matching, and a complete saved interview with one confirmed test account. The [November 20 frontend update](docs/06-sprint-log.md#frontend-production-update--november-20-2026-asiamanila) deployed the latest UI fixes and verified the accepted alias, persisted results and private download. Final acceptance gates remain pending.
- Explain signup email limits clearly and prevent duplicate authentication submissions while a request is pending. This does not configure Supabase email delivery.
- Prepared a CI-gated Vercel deployment workflow; activation requires owner configuration and a successful hosted run.

## Release checklist

- [ ] Review the Week 3 and Week 4 changes with a teammate and confirm the required checks pass for the exact release commit.
- [ ] Check migration compatibility and the rollback plan. Apply required migrations to the target database with a separate operator credential before the application depends on them.
- [ ] Merge the reviewed changes into `main` in dependency order. Confirm Railway and Vercel deploy the reviewed release revision and verify backend readiness.
- [ ] Check sign-in, upload, profile confirmation, saved analysis, job matching, a complete five-answer interview, and account isolation on the deployed app using synthetic data. Record the deployed revision, URLs, and results in the [sprint record](docs/06-sprint-log.md).
- [ ] Publish the annotated `v1.0.0` tag and GitHub release only after the deployed checks pass. Move the shipped entries from **Unreleased** to a dated version entry and include the production URL.

Use the [deployment and rollback guide](docs/07-pipeline-and-environments.md) during release verification. Record measured CI timings alongside the baseline when Week 4 runs are available.
