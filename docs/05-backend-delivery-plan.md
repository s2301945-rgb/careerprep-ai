# CareerPrep AI backend delivery plan

Planning date: October 21, 2026 (Asia/Manila). Confirmed deadline: **November 17, 2026**. Exact cutoff time and any separate preliminary-pitch deadline remain open. The owner supplied the month/day; the year follows the current project session.

The owner is the primary backend engineer and reports low confidence across backend tasks. This plan makes learning and integration explicit work. It uses the existing Node.js foundation and confirmed Supabase Auth choice. All dates and task splits below are proposals to review with the team; they are not promises that work is already complete or that each teammate is available full time.

## 1. Required result and team support

The final application must include **resume extraction/analysis, job matching, and mock interviews**, in addition to the seven course requirements. The confirmed audience is **college students and fresh graduates seeking entry-level jobs**. Matching and interviews are built after analysis. If time becomes tight, reduce their depth while preserving a real working version of each.

| Confirmed role | Proposed responsibility | Support and handoff |
| --- | --- | --- |
| Primary backend | API contracts, owned data operations, request validation, run/status persistence, backend score calculations, frontend integration support | Pair on initial Auth/SQL/CRUD work with the AI/ML and backup backend teammate. Implement later routes using the reviewed first-route pattern. |
| AI/ML and backup backend | Gemini integration, structured schemas/prompts, model-output validation and evidence rules, sample-output review | **Confirmed:** can own AI integration and help with backend foundations. Agree on an adapter contract before connecting it to routes. |
| Frontend | Auth UI, resume CRUD/profile review, results, job comparison, interview flow, loading/error states | Use agreed API shapes. Mock data can support UI development but cannot serve as final integration evidence. |
| DevOps | Proposed Auth/project environment setup support, Railway/Vercel configuration, CI, deployment, and operational checks | Confirm who applies database migrations, configures private Storage, and provisions each credential. These duties are proposed assignments, not implied by the role label alone. |

There is no separate database engineer in the supplied team. The proposed split is primary backend plus backup backend for schema design/review, with migration application agreed with DevOps. All members should review their own feature behavior and participate in the integrated rehearsal. Individual working hours, names, and backup arrangements are not yet known.

## 2. Dated delivery targets

| Dates, 2026 | Backend target | Work the team can prepare alongside it | Completion evidence |
| --- | --- | --- | --- |
| October 21–24 | Trace the existing server; agree a small API contract; pair on Supabase identity mapping, private SQL access, token verification, and one owned endpoint. | Frontend sign-in/navigation; AI teammate verifies structured output on one anonymized sample; DevOps confirms environment ownership. | A verified user resolves to one profile; invalid tokens fail; user A cannot access user B's data. |
| October 25–29 | Implement resume upload/list/detail/rename/delete and safe Storage cleanup/recovery. | Frontend dashboard/detail; AI teammate selects parsers and prepares profile/analysis schemas. | A real resume record and private file survive reload; rename persists; deletion removes dependent rows and handles file cleanup. |
| October 30–November 3 | Connect parsing, structured profile persistence, user confirmation, analysis validation, and score calculation. | Frontend profile review and feedback; AI teammate refines grounded prompts and failure handling. | Valid results persist; missing evidence stays unknown; bad provider output does not create a successful score. |
| November 4–6 | Add saved jobs and match-run persistence with a backend-computed match score. | Frontend comparison screen; AI teammate validates requirement assessments. | Owned resume/job comparison works; score arithmetic is explainable; empty/unusable requirements are handled. |
| November 7–10 | Add interview sessions/questions, answer saving/evaluation, and completion rules. | Frontend typed interview/results; AI teammate supplies question/evaluation schemas. | A complete short interview is stored; failed evaluation can recover; incomplete sessions do not get a completed score. |
| November 11–13 | Finish integrated deployment and errors across all three feature areas. | DevOps deployment checks; team exercises full journey and updates evidence/docs. | Real frontend uses real API/database/AI; two-user isolation and malformed-request/AI-failure cases are demonstrated. |
| November 14–16 | Fix regressions, rehearse, export submission, and preserve a working deployment. | Team reviews the pitch, demo, and role-specific evidence. | Full rehearsal succeeds; credentials are absent from commits and screenshots. |
| November 17 | Submit and/or demonstrate according to the course deadline. | Confirm exact cutoff and required artifacts in advance. | Agreed deliverables submitted on time. |

The analysis milestone is the dependency for both later feature areas. The AI teammate can verify parsers, schemas, and provider behavior while CRUD is being built; the product implementation still connects those pieces in the stated order. November 14–16 is recovery time, not spare capacity for new features.

## 3. First backend slice: one request you can explain

Start by understanding the existing path: a browser request reaches `backend/src/server.js`, the method/path selects a handler, the handler calls a dependency, and `sendJson` returns an HTTP status and JSON. Read `/health` first because it already demonstrates that chain without accepting user input.

Then implement one authenticated owned-data path with the backup teammate:

1. Agree the request and response in plain language: what does the caller send, what is returned, and what should fail?
2. Verify the Supabase access token and resolve the application's bigint user ID. Do not accept `user_id` as authority from the browser.
3. Establish the private PostgreSQL connection and the follow-up identity migration. The existing anon metadata key cannot access `careerprep` tables.
4. Implement a minimal owned read after a profile exists, then the first validated write. Use a controlled development record while uploads are still being built; the final resume-create route must store a real private document.
5. Walk through success, missing fields, invalid token, and a second user's ID. Inspect saved development state rather than assuming a 200 response proves persistence.
6. Have the backup teammate review the route before using it as the pattern for other resources. Write down what each layer does and how errors reach the frontend.

This slice is complete when the primary backend engineer can explain how identity becomes a database owner filter and how a failed request avoids an unauthorized mutation. Uploads, parsers, and Gemini are added in subsequent slices so each new failure has a smaller set of possible causes.

## 4. Backend and AI teammate contract

Agree this boundary before integrating provider calls:

| Primary backend supplies | AI integration returns |
| --- | --- |
| Task kind, bounded source text, confirmed profile/context, and server-owned schema/rubric identifiers | A runtime-validated result with bounded fields, grounded evidence, actual model name, and prompt/schema versions, or a typed failure |
| A persisted run ID, user ownership context, and source snapshot | No authority to change ownership, write arbitrary SQL, choose storage keys, or mark unrelated resources completed |
| Rules for timeouts, retries, and budget limits agreed with the integration owner | Explicit failure categories for provider auth, quota, timeout, blocked/empty response, invalid structure, and failed evidence checks |

The primary backend owns the final persistence/status transaction and aggregate score arithmetic. The AI teammate owns the provider adapter and its output validation, with review at the handoff. Both should agree on versioned example payloads before the frontend depends on them. Key provisioning remains an explicit AI/DevOps handoff; no key values belong in documents or chat.

## 5. If a target slips

Raise the issue at the missed gate with the concrete blocked behavior and the teammate needed. Do not wait until final integration to reveal that Auth, parsing, or private-table access does not work. Re-plan against the next dependency and use backup backend support early.

Proposed reductions, subject to team/instructor agreement where the product promise changes:

- Limit uploads to readable text-based PDF if supporting both formats becomes the parsing blocker.
- Extract a smaller profile and return a short set of grounded resume recommendations.
- Match a compact set of explicitly stated job requirements with one transparent scoring rule.
- Reduce an interview from five questions to three typed questions with a simple stable rubric and saved evaluations.
- Keep an uncomplicated interface and short saved history; defer visual polish and extra filters.

Keep authentication, owned database CRUD, all three feature areas, runtime AI validation, persistence, and errors. Do not replace real AI success with prerecorded responses. Any proposal to drop a required feature is a new scope decision and conflicts with the currently confirmed plan until explicitly changed.

## 6. Next confirmations

The first-release audience is confirmed. Still confirm individual available hours, exact cutoff and separate pitch deadline, named credential/migration owners, parser/model feasibility, and approved score/fallback rules. The [discovery log](04-discovery-and-decisions.md) records the questions and confirmed answers.
