# CareerPrep AI documentation

Prepared: October 22, 2026 (Asia/Manila).

These documents describe the project in the repository and the proposed endterm application. **Implemented** means visible in the inspected source. **Confirmed** means supplied by the project owner in the documentation interview. **Proposed** means a design to implement. **Open** means an answer is still needed. A migration describes a database design; its presence does not prove a feature works in the application or that the migration is deployed.

The [official endterm project instructions](00-official-course-instructions.md) are included here as the course authority for requirements, process, grading, and final deliverables. The remaining documents describe CareerPrep AI's project-specific direction and plans.

## Read these documents

| Document | Purpose |
| --- | --- |
| [Official endterm project instructions](00-official-course-instructions.md) | Full course instruction set, including product acceptance criteria, sprint process, DevOps track, grading rubrics, and final deliverables. |
| [Project pitch](01-project-pitch.md) | Self-contained draft covering the six requested pitch sections and all seven development requirements. Use this as the source if the pitch submission needs a single PDF or Word document. |
| [Technical design](02-technical-design.md) | Architecture, user journeys, API contracts, AI processing, scoring, errors, secrets, delivery plan, and acceptance criteria. |
| [Database reference](03-database-reference.md) | Actual migration fields, relationships, constraints, access model, and proposed changes for Node.js and Supabase Auth. |
| [Discovery session and decisions](04-discovery-and-decisions.md) | Confirmed answers, assumptions, unresolved questions, and the ongoing focused interview. |
| [Backend delivery plan](05-backend-delivery-plan.md) | Proposed schedule through November 17, team handoffs, and a guided starting path for a backend engineer building experience. |
| [Sprint delivery record](06-sprint-log.md) | Official Sprint 1–2 scope, tracked work, live starting evidence, and review/deployment acceptance gates. |
| [Pipeline and environments](07-pipeline-and-environments.md) | Automated checks, hosting settings, environment separation, deploy/rollback runbook and measured pipeline baseline. |

## Confirmed direction

- Product: CareerPrep AI, a resume analyzer and text-based mock interview platform.
- First-release audience: college students and fresh graduates seeking entry-level jobs. Feedback and interview examples should fit coursework, projects, internships, and first-job applications.
- Backend: retain Node.js and adapt the original Laravel-oriented database/authentication design.
- Authentication: use Supabase Auth, with the Node API validating identities and enforcing ownership.
- Final scope: resume extraction/analysis, job-description matching, and mock interviews are all required. Build matching and interviews after resume analysis; they are not stretch goals. A user may still choose to practice without a job description.
- Deadline: November 17, 2026, treated as the final development/demonstration deadline. Exact submission time and any separate preliminary-pitch deadline are not supplied.
- Team: four people, covering frontend; DevOps; AI/ML plus backup backend; and primary backend. The AI/ML teammate can help with backend foundations and own AI integration. Individual availability and detailed deployment responsibilities remain open.
- Personal risk: the backend engineer reports low confidence across backend tasks. The proposed mitigation is guided implementation in small working slices, with the backup backend teammate helping on authentication, data access, and initial CRUD.
- AI: Google Gemini, cloud hosted. The project owner reports the key has already been tested successfully; AI key management is outside their responsibility as backend engineer. The responsible teammate and model-specific structured-output verification remain open.
- Documentation format requested now: Markdown in this directory. The earlier pitch submission format was described as a single PDF or Word document; the official endterm instructions list final project deliverables separately.

## Repository evidence

| Source | What it establishes |
| --- | --- |
| [Root README](../README.md) | Product intent, walking skeleton scope, setup, deployment addresses, and team role categories. Some claims describe external state and were not independently checked. |
| [Frontend manifest](../package.json) and [home page](../src/app/page.tsx) | Next.js/React frontend with backend health and Gemini connectivity controls. |
| [Backend server](../backend/src/server.js) and [manifest](../backend/package.json) | Standalone Node.js native HTTP server, Supabase metadata read, and Gemini REST connectivity request. |
| [Initial migration](../supabase/migrations/20261014150915_initial_schema.sql) | Eight private application tables, ownership constraints, score checks, indexes, and timestamp triggers; its comments and identity columns assume Laravel. |
| [Walking skeleton migration](../supabase/migrations/20261016160000_add_walking_skeleton_config.sql) | Public read-only project metadata and a SELECT policy. |
| [Frontend environment template](../.env.example) and [backend template](../backend/.env.example) | Current environment variable names, without secret values. |
| [CI workflow](../.github/workflows/ci.yml) and [Railway configuration](../backend/railway.json) | Configured install/lint/build/syntax checks and backend deployment settings. |
| [Vite prototype](../CareerPrepAI/src/main.ts) | Separate starter interface; it does not implement the planned application workflows. |

## Current readiness

The repository is a walking skeleton. Authentication, private application-table CRUD, uploads, document parsing, structured extraction, resume feedback, job matching, and interviews are still to be implemented. The public `app_config` read and the connectivity prompt do not satisfy the full CRUD and non-trivial AI requirements by themselves.

The owner's report says a Gemini key was tested successfully. The newer deployed check on October 22 returned `not_configured`; the [sprint delivery record](06-sprint-log.md) distinguishes that observed deployment state from the owner's earlier test.

The original design/discovery documents were prepared without invoking production endpoints, inspecting credentials, changing application code, applying migrations, or running automated application checks. Later implementation and verification are tracked separately in the sprint delivery record. The installed skill locations and project skill directories searched did not contain `grill-me`; the interview is recorded in [the decision log](04-discovery-and-decisions.md).

## Before submission

Confirm the remaining delivery details: exact submission time, any separate pitch deadline, teammate availability, provider provisioning, parser/model choices, and scoring/retention policies. Review the proposed dated plan and update the pitch with further decisions, then export **01-project-pitch.md** as the one PDF or Word document required by the course. The technical design and database reference provide implementation detail beyond the preliminary pitch.
