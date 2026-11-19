# CareerPrep AI documentation

Prepared: October 22, 2026 (Asia/Manila).

Final-defense requirements aligned November 20, 2026 (Asia/Manila). This is the capture date of the supplied final notice, not its publication date.

These documents describe the project in the repository and the proposed endterm application. **Implemented** means visible in the inspected source. **Confirmed** means supplied by the project owner in the documentation interview. **Proposed** means a design to implement. **Open** means an answer is still needed. A migration describes a database design; its presence does not prove a feature works in the application or that the migration is deployed.

The [official endterm project instructions](00-official-course-instructions.md) provide the product and sprint requirements. The newer [Final Presentation and Project Defense instructions](00-final-defense-instructions.md) govern the final deadline, live demonstration and continuous Deployment Challenge where the notices differ. The [final-defense checklist](10-final-defense-checklist.md) tracks the remaining actions and evidence.

## Read these documents

| Document | Purpose |
| --- | --- |
| [Official endterm project instructions](00-official-course-instructions.md) | Full course instruction set, including product acceptance criteria, sprint process, DevOps track, grading rubrics, and final deliverables. |
| [Official final-defense instructions](00-final-defense-instructions.md) | Supplied notice captured November 20, including the November 27 freeze, live production walkthrough and continuous pre-recorded Deployment Challenge. |
| [Project pitch](01-project-pitch.md) | Self-contained draft covering the six requested pitch sections and all seven development requirements. Use this as the source if the pitch submission needs a single PDF or Word document. |
| [Technical design](02-technical-design.md) | Architecture, user journeys, API contracts, AI processing, scoring, errors, secrets, delivery plan, and acceptance criteria. |
| [Database reference](03-database-reference.md) | Actual migration fields, relationships, constraints, access model, and proposed changes for Node.js and Supabase Auth. |
| [Discovery session and decisions](04-discovery-and-decisions.md) | Confirmed answers, assumptions, unresolved questions, and the ongoing focused interview. |
| [Backend delivery plan](05-backend-delivery-plan.md) | Historical proposed schedule through November 17, team handoffs, and a guided starting path for a backend engineer building experience. The later official notice sets the final freeze. |
| [Sprint delivery record](06-sprint-log.md) | Official Sprint 1–2 scope, tracked work, live starting evidence, and review/deployment acceptance gates. |
| [Pipeline and environments](07-pipeline-and-environments.md) | Automated checks, hosting settings, environment separation, deploy/rollback runbook and measured pipeline baseline. |
| [Workspace setup and API](08-setup-and-api.md) | Step-by-step configuration, operator migration/runtime-role setup, resume endpoints, validation and cleanup recovery. |
| [Cloud setup from VS Code](09-cloud-setup.md) | Current service connections, replacement-project steps, CLI links and remaining deployment/account gates. |
| [Final-defense checklist](10-final-defense-checklist.md) | Current presentation format, honest verification snapshot, continuous challenge requirements and remaining submission evidence with owners. |

## Confirmed direction

- Product: CareerPrep AI, a resume analyzer and text-based mock interview platform.
- First-release audience: college students and fresh graduates seeking entry-level jobs. Feedback and interview examples should fit coursework, projects, internships, and first-job applications.
- Backend: retain Node.js and adapt the original Laravel-oriented database/authentication design.
- Authentication: use Supabase Auth, with the Node API validating identities and enforcing ownership.
- Final scope: resume extraction/analysis, job-description matching, and mock interviews are all required. Build matching and interviews after resume analysis; they are not stretch goals. A user may still choose to practice without a job description.
- Final freeze and submission deadline: **November 27, 2026 at 11:59 PM Philippine time**, confirmed by the newer final-defense notice. Earlier November 17 planning dates remain historical. The presentation schedule and group order are to be announced November 27.
- Team: four people, covering frontend; DevOps; AI/ML plus backup backend; and primary backend. The AI/ML teammate can help with backend foundations and own AI integration. Individual availability and detailed deployment responsibilities remain open.
- Personal risk: the backend engineer reports low confidence across backend tasks. The proposed mitigation is guided implementation in small working slices, with the backup backend teammate helping on authentication, data access, and initial CRUD.
- AI: The original plan selected Google Gemini. The backend uses Groq after the deployed Gemini project rejected free-tier requests. Live synthetic extraction, resume analysis, job matching, and a complete five-answer interview passed in the November 19–20 hosted rehearsal; see the [dated acceptance record](06-sprint-log.md#signed-in-hosted-acceptance--november-1920-2026-asiamanila) for its limits.
- Documentation is maintained as Markdown in this directory. The final notice says the technical-documentation format will be posted November 20; its contents have not been provided in this review. The earlier single PDF or Word requirement applied to the preliminary pitch.
- Final presentation: 20 minutes of reporting, including a live production walkthrough, followed by 10 minutes of shared panel Q&A. Only the Deployment Challenge is pre-recorded, continuously and without edits, pauses or skipped waiting periods, with English narration by the designated DevOps Engineer.

## Repository evidence

| Source | What it establishes |
| --- | --- |
| [Root README](../README.md) | Product intent, walking skeleton scope, setup, deployment addresses, and team role categories. Some claims describe external state and were not independently checked. |
| [Frontend manifest](../package.json) and [home page](../src/app/page.tsx) | Next.js/React frontend with backend health and AI connectivity controls. |
| [Backend server](../backend/src/server.js) and [manifest](../backend/package.json) | Standalone Node.js native HTTP server, Supabase metadata read, and Groq REST connectivity request. |
| [Initial migration](../supabase/migrations/20261014150915_initial_schema.sql) | Eight private application tables, ownership constraints, score checks, indexes, and timestamp triggers; its comments and identity columns assume Laravel. |
| [Walking skeleton migration](../supabase/migrations/20261016160000_add_walking_skeleton_config.sql) | Public read-only project metadata and a SELECT policy. |
| [Frontend environment template](../.env.example) and [backend template](../backend/.env.example) | Current environment variable names, without secret values. |
| [CI workflow](../.github/workflows/ci.yml) and [Railway configuration](../backend/railway.json) | Configured install/lint/build/syntax checks and backend deployment settings. |
| [Vite prototype](../CareerPrepAI/src/main.ts) | Separate starter interface; it does not implement the planned application workflows. |

## Current readiness

The Sprint 1–4 application is integrated into `main`, including [PR #38](https://github.com/s2301945-rgb/careerprep-ai/pull/38). The November 19–20 hosted rehearsal used Railway commit `9f96080`, with all three main CI jobs and production smoke passing. The November 14 audit recorded all six Supabase migrations applied. Signed-in hosted checks passed upload, rename, private download, extraction/profile confirmation, resume analysis, saved job matching and a complete saved mock interview. See the [dated acceptance record](06-sprint-log.md#signed-in-hosted-acceptance--november-1920-2026-asiamanila) and its linked evidence.

The submitted frontend is [careerprep-ai-demo-221a.vercel.app](https://careerprep-ai-demo-221a.vercel.app), calling [the working Railway API](https://careerprep-ai-production-89bf.up.railway.app). The [November 20 update](06-sprint-log.md#frontend-production-update--november-20-2026-asiamanila) deployed tested frontend commit `3998f66` and verified the accepted alias, retained results and private download. PR #39 still needs genuine review and merge. Automatic frontend delivery, current complete two-account acceptance, enforced review/check rules, rollback, actual course evidence, and the tagged release remain open. Public signup email delivery is deferred while an existing confirmed account is used. Earlier Gemini and walking-skeleton findings remain dated history, not the current application status.

The original design/discovery documents were prepared without invoking production endpoints, inspecting credentials, changing application code, applying migrations, or running automated application checks. Later implementation and verification are tracked separately in the sprint delivery record. The installed skill locations and project skill directories searched did not contain `grill-me`; the interview is recorded in [the decision log](04-discovery-and-decisions.md).

## Before submission

Complete the [final-defense checklist](10-final-defense-checklist.md) before November 27 at 11:59 PM Philippine time. Verify the final tagged revision in production, finish the required documentation in the instructor's final format, and add accessible documentation, slide-deck and continuous Deployment Challenge links to the root README. The edited local demo videos remain practice material. Preserve actual process history, and identify missing records honestly.
