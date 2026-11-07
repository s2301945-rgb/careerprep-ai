# Changelog

## Unreleased

- Added private PDF and DOCX resume management with authenticated upload, listing, rename, download, and deletion.
- Added text extraction, a draft profile users can edit and confirm, and saved AI analysis with cited evidence and rubric scores.
- Added mocked backend tests, disposable PostgreSQL integration, and a live Groq evaluation with synthetic resumes.
- Started Week 4 hardening for AI request controls, workspace error and loading states, CI, and release documentation.
- Added saved job descriptions, grounded requirement-by-requirement resume matching, and backend-calculated practice scores.
- Added five-question text mock interviews with saved answers, rubric feedback, history, and a failed-evaluation retry using the same answer.
- Added owner-scoped API and PostgreSQL integration coverage for matching and interviews. Live Groq and hosted signed-in acceptance remain pending.

## Release checklist

- [ ] Review the Week 3 and Week 4 changes with a teammate and confirm the required checks pass for the exact release commit.
- [ ] Check migration compatibility and the rollback plan. Apply required migrations to the target database with a separate operator credential before the application depends on them.
- [ ] Merge the reviewed changes into `main` in dependency order. Confirm Railway and Vercel deploy the reviewed release revision and verify backend readiness.
- [ ] Check sign-in, upload, profile confirmation, saved analysis, job matching, a complete five-answer interview, and account isolation on the deployed app using synthetic data. Record the deployed revision, URLs, and results in the [sprint record](docs/06-sprint-log.md).
- [ ] Publish the annotated `v1.0.0` tag and GitHub release only after the deployed checks pass. Move the shipped entries from **Unreleased** to a dated version entry and include the production URL.

Use the [deployment and rollback guide](docs/07-pipeline-and-environments.md) during release verification. Record measured CI timings alongside the baseline when Week 4 runs are available.
