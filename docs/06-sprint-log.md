# Sprint 1 and 2 delivery record

Date: October 22, 2026, Asia/Manila. The [official course instructions](00-official-course-instructions.md) define the sprint scope and Definition of Done. This record distinguishes repository implementation from deployed acceptance. Earlier documentation remains the design baseline; it does not prove external state.

## Scope and work board

Sprint 1 is the deployed walking skeleton. Sprint 2 adds authenticated resume CRUD: upload, list, detail, rename, private download and delete. Resume extraction, analysis, matching and interviews follow in Sprints 3–4; all remain required for the final release.

| Work | Tracking | Reviewable slice |
| --- | --- | --- |
| Foundation, contracts and live skeleton evidence | [#17](https://github.com/s2301945-rgb/careerprep-ai/issues/17), [#2](https://github.com/s2301945-rgb/careerprep-ai/issues/2) | [PR #21](https://github.com/s2301945-rgb/careerprep-ai/pull/21), `docs/sprint-1-foundation` |
| Supabase identity, private database/storage and owned resume API | [#18](https://github.com/s2301945-rgb/careerprep-ai/issues/18), [#4](https://github.com/s2301945-rgb/careerprep-ai/issues/4) | [PR #22](https://github.com/s2301945-rgb/careerprep-ai/pull/22), `feature/sprint-2-resume-api` |
| Auth and resume screens | [#19](https://github.com/s2301945-rgb/careerprep-ai/issues/19) | [PR #23](https://github.com/s2301945-rgb/careerprep-ai/pull/23), `feature/sprint-2-resume-ui` |
| API tests, environments, runbooks and acceptance evidence | [#20](https://github.com/s2301945-rgb/careerprep-ai/issues/20) | [PR #24](https://github.com/s2301945-rgb/careerprep-ai/pull/24), `feature/sprint-2-delivery` |

The two sprint milestones group these issues. Work is assigned to the repository contributor doing this implementation; this does not assign other teammates or establish their availability. Existing issues #5–#11 retain later extraction, feedback, matching and interview work. Issue #5 includes Sprint 3 text extraction and must not be closed merely because upload works.

## Verified starting evidence

| Check | Observed result |
| --- | --- |
| Production frontend | `https://careerprep-ai-ten.vercel.app` returned HTTP 200. |
| Production backend/database | `GET https://careerprep-ai-production.up.railway.app/health` returned HTTP 200 and `database: connected`. This checks public metadata, not private CRUD or all migrations. |
| Production AI probe | `POST /ai-test` returned HTTP 200 with `ai: not_configured`. The hosted backend needs its server-side Gemini environment before this acceptance item passes. The owner's earlier key test remains separate reported evidence. |
| Existing main CI | [Run 39622375992](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/39622375992) succeeded for `115dfb8`. |
| Hosting integration | GitHub deployment records show Vercel `Production` and `Preview`, including successful production deployment for `115dfb8`. This does not establish separate preview backend/database configuration. |
| Branch protection | The active `Protect main` ruleset blocks deletion and force pushes and requires a PR. It currently requires zero approving reviews and has no required CI check rule. The README's previous stronger claim was inaccurate. Admin action is required to enforce both passing checks and one teammate review. |
| Migration access | No local hosted database/migration credentials were configured at the start. Current migration inventory and legacy user data require inspection before applying the follow-up migration. |

## Implementation and acceptance evidence

The API branch passes 16 automated unit/API tests and the real PostgreSQL integration suite. The integration suite uses the restricted application privilege role, verifies migration constraints and grants, and exercises actual persistence, pagination, Auth cascades and cleanup. The frontend passes ESLint and its production build. The integrated delivery commit `e9f1dcb` passes all three jobs in [CI run 39647136503](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/39647136503); its Vercel PR preview also succeeds. Production smoke is correctly skipped for a preview event; this is not production acceptance.

The [local browser report](evidence/local-browser-verification.json) records two passing Chromium tests against real Next.js, Node and PostgreSQL 18.6. PDF/DOCX uploads, rename/reload persistence, byte-identical downloads, two-user isolation, actual SDK account switching across tabs, deletion and readiness error display pass. Auth/Storage in this browser run are local stand-ins. [Desktop](evidence/desktop-workspace.png) and [mobile](evidence/mobile-workspace.png) screenshots use synthetic data; they do not prove deployed acceptance.

The [hosted migration record](evidence/hosted-migration.json) records all three migrations applied to Supabase PostgreSQL 17.11. The second migration already existed in the schema and was marked applied only after its table, policy, grants and seed were verified. The follow-up migration was then applied. A separate restricted runtime login connects with verified TLS; the private `resumes` bucket and grants were checked. No production user or resume seed was added.

The [final hosted API rehearsal](evidence/hosted-api-verification.json) passes **34/34 assertions**, running the actual backend on loopback against real hosted Supabase Auth, PostgreSQL and Storage, including authenticated Gemini connectivity with the corrected model. It is provider acceptance, not a Railway deployment. It creates two temporary synthetic identities, verifies private CRUD and cross-owner 404s, and removes its own accounts and files. A read-only aggregate query after the final run confirms no users, resumes, stored resume objects or unfinished cleanup tasks remain. The [earlier failed-model run](evidence/hosted-api-before-model-fix.json) is preserved separately.

The initial Gemini probe with `gemini-2.5-flash` returned upstream 404 despite that model appearing in the catalog. Google's [current access guidance](https://ai.google.dev/gemini-api/docs/deprecations) limits 2.5 models to projects with past usage. Switching the configurable connectivity model to `gemini-3.5-flash-lite` produced a [successful backend probe](evidence/gemini-3_5-flash-lite-probe.json). This does not implement or validate the later structured AI feature.

The [credential boundary check](evidence/secret-boundary.json) found no configured private credentials in source, generated browser assets or inspected Git history objects. It checks the configured private values, rather than proving absence of every possible unknown historical secret. Reports omit tokens, passwords, object paths and document contents.

Follow-up PR #28 (`feature/week2-integrated-review`, commit `e0374a2`) clarifies that the upload limit is inclusive at 10 MiB. CI run [42383930686](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/42383930686) passed the frontend install/lint/build, API unit tests, PostgreSQL migrations/grants/persistence integration tests, and prototype build. The production health/API boundary job was skipped for this feature-branch preview. Its Vercel deployment is password protected and redirects to Vercel login when opened outside an authorized session; hosted user-flow acceptance remains pending. PR #28 targets the existing Sprint 2 delivery branch and remains unmerged.

## Hosting handoff

Supabase CLI is authenticated and linked. Auth confirmation redirects now allow the replacement frontend, the existing frontend, the known UI review alias and exact local origins. Email confirmation and unrelated remote settings were preserved.

The replacement Vercel project `xiee-t/careerprep-ai` is linked to this checkout, configured for Next.js/Node 22 and frozen pnpm installs. Its first deployment of integrated commit `b061bef` is ready at `https://careerprep-ai-seven.vercel.app` (deployment `dpl_Gk2D9xWA1oPkadqCQscwD31TwPy3`, 32-second build). A [read-only Chromium check](evidence/vercel-setup-verification.json) confirms HTTP 200, a working signed-out form and no browser runtime errors; it performs no sign-in or provider calls. Vercel automatically labeled this first deployment production. Treat it as setup evidence: `NEXT_PUBLIC_API_URL` is deliberately pending the replacement Railway domain, so the full hosted workspace is not accepted. Supabase public settings are configured; private server credentials were not added to Vercel.

The user authorized replacement Railway and Vercel projects because the original accounts were inaccessible. Railway is authenticated, but project creation returned `Deploys have been paused temporarily`; its [official status page](https://status.railway.com/) reported an active dashboard/API/build outage. No replacement Railway project or database was created. The existing backend remains the earlier walking skeleton. Retry creation after recovery, inject the backend variables, deploy the checked commit, set the frontend API URL and rebuild.

Vercel's Git connection attempt to `s2301945-rgb/careerprep-ai` failed. Current access is write access to another person's repository; Vercel's [GitHub integration instructions](https://vercel.com/docs/git/vercel-for-github) require ownership to connect a personal repository. The repository owner needs to resolve the Git/hosting ownership arrangement before automatic frontend deployment can be claimed. See the [cloud setup steps](09-cloud-setup.md).

## Remaining deployed acceptance checks

- Verify invalid/expired credentials fail and that concurrent profile resolution maps one verified subject to one profile.
- Upload an actual readable sample; reload list/detail, rename and download it; delete and verify metadata plus private file cleanup.
- Repeat with a second identity and probe every operation against the first user's ID.
- Exercise malformed input, invalid format, oversized upload and storage failure/retry.
- Apply every SQL migration to real PostgreSQL; verify foreign keys, runtime grants and deletion cleanup. A local Auth/Storage stand-in is test infrastructure, not hosted-provider acceptance.
- Run the API suite in CI, then repeat the real two-user journey in the deployed environment.

## Process and remaining evidence

Exactly four project roles are confirmed: frontend, primary backend, AI/ML plus backup backend, and one dedicated DevOps engineer. Names, personal availability and credential owners remain open in the [decision log](04-discovery-and-decisions.md). Do not invent assignments or completed standups.

The requested work is prepared as separate PRs with dependencies, without automatic merging. The course counts an item done only after a teammate-reviewed PR is merged, its pipeline passes, it deploys and the deployed increment is checked. These external acceptance steps remain open until evidence is recorded here.

Before consultation, the team must add its actual standups and retrospective, confirm the DevOps/credential owners, review the PRs and record deployed outcomes. This log does not substitute generated history for that evidence.

## Sprint 3 implementation — resume extraction and analysis

Implementation is on `feature/week3-resume-ai-analysis`, based on the unmerged Week 2 review branch. It adds bounded PDF.js and DOCX text extraction, a private draft profile with evidence quotes and a review/confirmation step, and saved resume analysis through the Groq backend. The backend validates response shapes and cited source phrases, computes the mean of four rubric dimensions, records model/prompt/rubric provenance and the confirmed profile revision, and persists failed analysis attempts. The frontend can edit profile fields before confirmation and shows evidence, rubric scores, loading/errors and retry controls. Job matching and mock interviews are still later sprint work.

The Week 3 database migration adds the profile table and analysis score/source snapshot columns with least-privilege runtime grants. The migration runner verifies its schema and grants; the PostgreSQL integration suite now checks profile revision/confirmation and analysis persistence under the runtime role. The integration suite passed on a disposable local PostgreSQL 16.15 database after correcting the second-user fixture. The suite exercised migrations, runtime grants, ownership, profile confirmation, analysis persistence and cleanup. Frontend lint, TypeScript and production build passed locally for the original Week 3 implementation. Backend syntax checks and all 30 unit/API tests passed locally, including PDF/DOCX text extraction, the mocked profile/confirmation/analysis flow, invalid output, provider timeouts before and after headers, and a three-example synthetic evaluation set. Automated tests use mocked Groq responses. The initial live evaluation returned 0/3. After adding strict Groq response schemas and handling credentials or achievements with unstated details, the evaluation on November 8, 2026 passed 3/3 with openai/gpt-oss-20b. Each synthetic resume yielded the expected skill and a source quote for its quantified achievement. GitHub Actions [run 42392368562](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/42392368562) passed all three jobs for the prior commit 9ab4a78; the follow-up was verified locally. No Week 3 migration or feature deployment is claimed for a hosted environment; the prior Railway service remains on its earlier branch and lacks the required Week 3 configuration.

## Sprint 4 kickoff — hardening and release preparation

Implementation started on `feature/week4-hardening-release` from Week 3 commit `efc58d8`. Profile and analysis loads now announce progress and offer a retry on failure. The draft editor retains focus while typing, and AI operations announce which step is running. Resume extraction and analysis share a per-process request budget with retryable responses when capacity is reached.

Local verification passed: frontend lint, TypeScript, two production builds from a frozen install, backend syntax checks, 31 unit/API tests, and the disposable PostgreSQL 16 integration suite. A targeted scan of the pre-Week 4 local history found no matches for common provider key or private-key formats across 72 reachable commits. This does not cover every possible credential format. [Pipeline measurements](07-pipeline-and-environments.md#week-4-cache-measurement) record the local cold/warm comparison. Hosted Week 4 CI is pending.

The next local Week 4 pass adds private saved job descriptions and requirement-level comparison. The backend verifies job and resume evidence, excludes protected-attribute criteria, calculates the equal-weight score, and persists a completed result or a failed attempt. A second pass adds five-question text interviews, saved answers, evaluated feedback, a deterministic overall score, owner checks, failed-answer retry, and stale-run recovery. The frontend provides entry, history, loading, empty, error and retry states. The two additive migrations grant only the required runtime table and sequence access. A frozen frontend dependency install, backend `npm ci`, backend syntax check, all 40 unit/API tests, frontend lint, TypeScript, production build, and a disposable PostgreSQL 16 integration run passed locally, including a complete five-answer interview and an evaluation retry. A follow-up check maps interrupted Groq response streams to retryable errors and marks saved job comparisons stale after a profile revision. A pattern scan of all 74 locally reachable commits and current tracked files found no common Groq/OpenAI key or private-key markers; it does not prove absence of every credential type. Live Groq for the new workflows, a signed-in browser flow, and hosted migrations remain unverified.

Release remains pending. The branch stack needs reviewed integration into `main`, target environment configuration and migrations, deployed acceptance, and a rollback rehearsal before publishing the release tag. [Unreleased changelog](../CHANGELOG.md)

The November 10 audit confirmed that the Week 1 frontend branch is published and that the Week 2 and Week 3 changes remain open in PRs [#28](https://github.com/s2301945-rgb/careerprep-ai/pull/28) and [#29](https://github.com/s2301945-rgb/careerprep-ai/pull/29). The Week 4 integration candidate at `7d5ba09` passed frontend, API/PostgreSQL and prototype jobs in [Actions run 42405096043](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/42405096043). Vercel reported a successful protected preview for [draft PR #30](https://github.com/s2301945-rgb/careerprep-ai/pull/30). The preview requires team access, and production smoke was skipped. The draft has no submitted reviews.

The November 10 follow-up fixes retry buttons that reloaded the list after a saved comparison or interview failed to load. The interview now reloads after an answer evaluation error so users can retry the saved text. A local browser run with mock Auth and API responses injected each of the three failures and verified recovery, including the original answer text and desktop/mobile rendering. This verifies UI behavior with synthetic data.

Read-only GitHub inspection on November 8 found PRs #21, #22, #23, #24, #28 and #29 open with no submitted reviews; #21 currently reports a merge conflict with `main`. Read-only Railway inspection found only the `production` environment in project `capable-unity`. Its `careerprep-ai` service deploys from `main`, uses `/` as the health check, and lists only `FRONTEND_URL` and `GROQ_MODEL` as service variable names. No Week 4 code, migration or credential was deployed during this check. The production service cannot be counted as a ready Week 4 backend from this configuration alone; its private database, Auth, Storage and Groq settings still need provisioning and a successful `/ready` check after reviewed integration. These observations do not replace a hosted acceptance test.
