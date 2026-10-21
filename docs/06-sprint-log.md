# Sprint 1 and 2 delivery record

Date: October 22, 2026, Asia/Manila. The [official course instructions](00-official-course-instructions.md) define the sprint scope and Definition of Done. This record distinguishes repository implementation from deployed acceptance. Earlier documentation remains the design baseline; it does not prove external state.

## Scope and work board

Sprint 1 is the deployed walking skeleton. Sprint 2 adds authenticated resume CRUD: upload, list, detail, rename, private download and delete. Resume extraction, analysis, matching and interviews follow in Sprints 3–4; all remain required for the final release.

| Work | Tracking | Reviewable slice |
| --- | --- | --- |
| Foundation, contracts and live skeleton evidence | [#17](https://github.com/s2301945-rgb/careerprep-ai/issues/17), [#2](https://github.com/s2301945-rgb/careerprep-ai/issues/2) | `docs/sprint-1-foundation` |
| Supabase identity, private database/storage and owned resume API | [#18](https://github.com/s2301945-rgb/careerprep-ai/issues/18), [#4](https://github.com/s2301945-rgb/careerprep-ai/issues/4) | `feature/sprint-2-resume-api` |
| Auth and resume screens | [#19](https://github.com/s2301945-rgb/careerprep-ai/issues/19) | `feature/sprint-2-resume-ui` |
| API tests, environments, runbooks and acceptance evidence | [#20](https://github.com/s2301945-rgb/careerprep-ai/issues/20) | Integrated UI/delivery PR |

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

## Planned acceptance checks

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
