# CareerPrep AI: Resume Analyzer & Mock Interview Platform

Preliminary endterm project pitch | October 21, 2026

**Document status:** Our team proposes CareerPrep AI using Node.js and Supabase Auth, with resume analysis, job matching, and mock interviews in the final scope. Our deadline is November 17, 2026. Our four-person team consists of a frontend engineer, a DevOps engineer, an AI/ML engineer who also provides backup backend support, and a primary backend engineer. Features below describe our intended endterm application unless explicitly identified as implemented. We still need to confirm the exact submission time, any separate pitch deadline, and detailed working availability.

## 1. Project summary

CareerPrep AI helps college students and fresh graduates seeking entry-level jobs improve their resumes and practice for interviews. Users create an account, upload a PDF or DOCX resume, review the information extracted by AI, and receive specific feedback about clarity, completeness, and evidence from coursework, projects, internships, or other relevant experience. They may add a job description to compare stated requirements with their resume, then complete a text-based mock interview tailored to that material. The application saves resumes, analyses, job descriptions, questions, answers, and feedback so users can revisit their preparation. Scores explain performance against a published practice rubric; they do not predict hiring outcomes. The first-release audience is confirmed.

**Core resource:** A user-owned resume record. Users can create a resume by uploading a file, read their resume list and details, update its display title and review its extracted profile, and delete the resume and its associated results. Replacing a document creates a new resume record to keep historical feedback tied to the source that produced it. Analyses and interview sessions are related resources.

**Existing foundation:** Our repository contains a Next.js frontend, a separate Node.js backend, Supabase PostgreSQL migrations, and a Gemini connectivity endpoint. We will build the endterm workflows on this foundation.

## 2. AI feature justification

**Primary category: structured output extraction.** The backend requests schema-constrained JSON from Google Gemini, a **cloud** LLM API. AI extracts a resume profile containing skills, education, experience, and projects from the text parsed out of the uploaded document. It then produces structured feedback grounded in that resume. Required later features extract job requirements, identify supported and missing qualifications, generate interview questions, and evaluate typed answers using explicit rubric components. Supplying a job description is optional for the user, while implementing job matching and mock interviews is required for the final project.

This work goes beyond a generic chat interface: the output becomes validated application data connected to a specific owned resume, job description, or answer. The backend is responsible for the following sequence before results reach the frontend:

1. Authenticate the user, verify resource ownership, and validate the uploaded file or request body.
2. Parse readable text from the document, enforce input limits, and reject unsupported or empty documents. Scanned PDFs requiring OCR are outside the proposed first release.
3. Send only the necessary source text and a versioned task/schema to Gemini. Document text is treated as untrusted content.
4. Parse and validate the response's fields, types, array sizes, score ranges, evidence references, and permitted question categories. Missing information stays unknown; it must not be invented.
5. Normalize accepted fields, allow the user to correct the extracted profile, and calculate aggregate scores in backend code from validated component scores or requirement assessments.
6. Save accepted outputs with ownership, processing status, model name, and prompt/rubric versions. Return the stored application result rather than forwarding the raw provider response.
7. On failure, preserve the user's source data, record a safe error code, and offer a bounded retry. Invalid AI output is never saved as a successful result.

The current backend already calls Gemini through server-side REST requests using `fetch`. Structured extraction, runtime validation, and the persistence workflow still need implementation. Google's API supports JSON Schema structured outputs; backend validation remains necessary because a valid JSON shape does not establish factual correctness. See [Google's structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

**Model plan:** We will keep the model configurable with `GEMINI_MODEL`. Our existing template names `gemini-2.5-flash`; our AI/ML engineer will select and verify an accessible model that supports the required output schema before we accept the feature. A successful connectivity check alone does not establish that the structured workflow is complete.

## 3. Database schema sketch

**Database:** Supabase-hosted PostgreSQL. Eight application tables already exist in a SQL migration under the private `careerprep` schema. A separate public metadata table supports the walking skeleton. Supabase Auth integration and structured profile storage require a follow-up migration.

| Table | Principal fields, approximate types | Relationship |
| --- | --- | --- |
| `users` | `id` bigint PK, proposed `auth_user_id` UUID unique FK, `name` text, `email` text, timestamps | One application profile belongs to one Supabase Auth identity. One user owns many resumes and job descriptions. |
| `resumes` | `id` bigint PK, `user_id` FK, proposed `display_title` text, filename/path/MIME type, file size bigint, extracted text, extraction status/error, timestamps | Many resumes belong to one user. Files live in private object storage. |
| `resume_profiles` **proposed** | `resume_id` PK/FK, `user_id` FK, skills/education/experience/projects JSONB arrays, schema/model/prompt versions, timestamps | One current structured profile per resume. This storage is missing from the existing migration. |
| `resume_analyses` | `id`, `resume_id` + `user_id` FKs, status, overall score numeric, summary text, strengths/weaknesses/missing sections/recommendations JSONB, rubric/model/prompt versions | One resume can have many analysis runs. Component score storage is proposed. |
| `job_descriptions` | `id`, `user_id` FK, title/company text, description text, timestamps | One user can save many target jobs. |
| `job_matches` | `id`, owned resume/job FKs, status, match score, matching/missing skills and recommendations JSONB, explanation, provenance | Connects one resume to one job description; repeated runs can be retained. |
| `interview_sessions` | `id`, owned resume FK, optional owned job FK, status, question count, overall score, summary, strengths/improvements, rubric version, timestamps | One resume can support multiple interviews. |
| `interview_questions` | `id`, session FK, ordered question number, type, text, model/prompt versions | One session has many questions. |
| `interview_answers` | `id`, unique question FK, answer text, status, component/overall scores, feedback, strengths/suggestions, model/prompt versions | A question has zero or one current answer and evaluation. |

Relationship outline:

```text
Supabase Auth identity -> application user
application user -> many resumes -> one current structured profile
                               -> many resume analyses
application user -> many job descriptions
resume + job description -> many job match runs
resume + optional job description -> many interview sessions
interview session -> many ordered questions -> zero or one answer each
```

Composite foreign keys in the existing schema prevent linking a resume to another user's job description. All application reads and writes will also be scoped to the authenticated user by the backend. Passwords will be owned by Supabase Auth; the old Laravel-oriented password fields must be removed through a new migration. The application schema stays private and is accessed through server-side PostgreSQL credentials.

## 4. Tech stack declaration

| Layer | Choice and state |
| --- | --- |
| Frontend | Next.js, React, TypeScript, and CSS/Tailwind configuration; present in the repository. Proposed screens: sign-in, resume dashboard/detail, analysis, job matching, interview, and history. |
| Backend | Node.js with JavaScript ES modules and the native HTTP API currently in use. Keep a separate REST API for application data, AI calls, validation, and authorization. Routing and services will need to grow beyond the current single server file. |
| Authentication | Supabase Auth, confirmed during discovery; not integrated yet. The Node API verifies tokens before resolving the user's application profile. |
| Database | Supabase PostgreSQL, private `careerprep` schema; use a server-side database connection for CRUD. |
| File storage/parsing | Proposed private Supabase Storage bucket with backend-controlled access; PDF and DOCX text parsers still need selection. |
| AI provider/interface | Google Gemini cloud REST API through server-side `fetch`, with structured responses and backend runtime schema validation. No AI SDK is currently installed in the backend manifest. |
| Hosting | Our hosting plan uses Vercel for the frontend, Railway for the backend, and Supabase for database/storage/authentication. We will verify the deployed application as part of final integration. |
| CI | GitHub Actions configuration installs, lints, and builds the frontend, checks backend syntax, and builds the separate Vite prototype. |

Architecture: **Browser -> Node.js REST API -> private PostgreSQL / private file storage / Gemini.** The browser uses Supabase Auth for sign-in; application data and AI orchestration go through the Node API. Database credentials and Gemini keys remain server-side.

## 5. Risk and feasibility self-check

**Riskiest technical area:** Our main technical risk is integrating authentication, database access, private file handling, and validated AI-result persistence within the deadline. These components depend on one another, and their complete workflows are not implemented yet. We will reduce this risk through small, working delivery stages and shared backend review. Our primary backend and AI/ML engineers will collaborate on authentication, database access, and the first CRUD endpoint before extending that pattern to the remaining resources. Our AI/ML engineer will own Gemini integration, while our frontend and DevOps engineers support interface integration and deployment. We will reserve time for learning, troubleshooting, and integration rather than assume every component will work on the first attempt.

**Scope and delivery:** We will deliver all three feature areas by **November 17, 2026**: resume extraction/analysis, job matching, and mock interviews. We will build accounts and resume CRUD first, then structured resume extraction and analysis; matching and the text interview follow. Our proposed schedule targets analysis by November 3, matching by November 6, interviews by November 10, and integrated deployment by November 13, preserving November 14–16 for recovery and rehearsal. These are planning targets rather than completed milestones; we still need to confirm individual working availability. Our proposed full demo uses five typed questions and a backend-computed score. OCR, speech/video, scraping, automatic resume rewriting, and autonomous job applications are outside our proposed endterm scope.

**Fallback:** We will preserve resume analysis, job matching, and mock interviews while reducing their depth. Our proposed reductions are text-based PDF-only input if we obtain approval for the format change, a smaller extracted profile, three evidence-based resume recommendations, a compact requirement comparison, and three typed interview questions with a smaller rubric. We will retain real authentication, database CRUD, structured AI validation, persisted feedback, and error handling. If file parsing blocks progress, we will consider pasted resume text only after agreeing on the input change and adapting the schema. Matching and interviews remain required under our confirmed scope. We will show provider outages as retryable failures and use the real provider for successful AI demonstrations.

**API access:** Our team already has a Gemini API key that has been tested successfully. Our AI/ML engineer will own Gemini integration. We still need to assign responsibility for provisioning the key to Railway and monitoring quota/budget limits, and verify the selected model's structured output. We will also update the older authorization-blocked note in our root README to reflect the tested access status.

## 6. Environment plan

We will keep local values in ignored environment files and commit `.env.example` files containing variable names and placeholders only. We will configure hosted values in each service's environment settings. Our repository already ignores `.env` and `.env.*` while allowing `.env.example`. We will keep credentials out of public frontend variables.

| Variable or credential | Location and purpose | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Frontend; Node API address. Already in template. | No |
| Proposed `NEXT_PUBLIC_SUPABASE_URL` and public publishable/anon key | Frontend; Supabase Auth client configuration. | Public configuration, not privileged credentials |
| `PORT`, `FRONTEND_URL` | Backend; listen port and allowed browser origins. Already in template. | No |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Backend; existing public metadata probe. An anon key does not authorize access to the private application schema. | Not privileged credentials |
| `GEMINI_API_KEY` | Backend only; cloud AI requests. Already in template. | **Yes** |
| `GEMINI_MODEL` | Backend; tested model selection. Already in template. | No |
| Proposed `DATABASE_URL` | Backend only; PostgreSQL runtime account with limited privileges. A separate privileged connection may be used for controlled migrations. | **Yes** |
| Proposed `SUPABASE_SERVICE_ROLE_KEY` | Backend only if server-controlled storage uses privileged access. Ownership must be checked before each operation. | **Yes** |
| Proposed storage bucket and AI limit settings | Backend; bucket identifier, input/output limits, request timeout and usage caps. | No |

Access tokens, refresh tokens, signed file URLs, database passwords, and raw resumes must also stay out of commits and logs. User credentials are managed by Supabase Auth. Local backend startup must explicitly load its environment file: the current `npm start` script does not do so automatically. The technical design documents an explicit Node environment-file command.

## Appendix: coverage of the seven course requirements

| Requirement | Planned evidence at endterm | Current repository state |
| --- | --- | --- |
| 1. Real database CRUD | Upload/list/view/rename/delete an owned resume; persist changes and demonstrate reload. | Only public metadata reading exists in the backend. |
| 2. Non-trivial AI | Structured extraction and grounded feedback, validated and stored by the backend. | Provider connectivity request only. |
| 3. Separate backend API | Node.js REST endpoints for authentication checks, resources, and AI processing. | Separate Node server with `/`, `/health`, `/ai-test`. |
| 4. Functional wired frontend | Complete preparation screens use real API responses and saved records. | Status page calls the real backend endpoints. |
| 5. Related relational tables | Users, resumes, profiles, analyses, jobs, and interviews with foreign keys. | Eight application tables defined in migration; profile/auth changes proposed. |
| 6. Secrets management | Ignored local values, maintained templates, server-only secrets, hosted configuration. | Ignore rules/templates exist; runtime configuration must be maintained. |
| 7. AI and request errors | Reject malformed/unauthorized requests; handle timeouts, rate limits, invalid AI output, and retries without corrupting stored results. | Basic upstream failure handling exists; application request validation and recovery remain planned. |
