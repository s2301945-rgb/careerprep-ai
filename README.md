# CareerPrep AI

CareerPrep AI helps college students and recent graduates organize resumes and prepare for entry-level applications. It includes sign-in, private PDF/DOCX uploads, resume management, editable profile extraction, AI resume analysis, saved job comparisons, and five-question text mock interviews. A signed-in rehearsal with synthetic data verified PDF upload, rename and private download, profile extraction and confirmation, saved analysis, job matching, a complete interview, and persistence after reload. See the [dated acceptance record](docs/06-sprint-log.md#signed-in-hosted-acceptance--november-1920-2026-asiamanila) for the tested deployments and remaining checks.

[Open CareerPrep AI](https://careerprep-ai-seven.vercel.app). The app uses the [Railway API](https://careerprep-ai-production-368d0279.up.railway.app), whose [readiness endpoint](https://careerprep-ai-production-368d0279.up.railway.app/ready) checks the private application database.

## How it works

The Next.js frontend uses Supabase Auth for sign-in. It sends authenticated resume requests to a standalone Node.js API. The API enforces ownership, stores metadata and results in Supabase PostgreSQL, and keeps originals in a private Supabase Storage bucket. During extraction and analysis, the API sends extracted text to Groq, checks the returned structure and evidence, and saves the result. The user reviews and confirms the profile before requesting analysis.

| Area | Technology and reference |
| --- | --- |
| Frontend | Next.js, React, and TypeScript on Vercel |
| Backend | Node.js HTTP API on Railway. [API reference](docs/08-setup-and-api.md#api-reference) |
| Data | Supabase Auth, PostgreSQL, and private Storage. [Database relationships](docs/03-database-reference.md) |
| AI | Groq with backend validation and a synthetic evaluation set. [AI flow and evaluation](docs/08-setup-and-api.md#api-reference) |
| Delivery | GitHub Actions. [Pipeline, environment setup, and rollback](docs/07-pipeline-and-environments.md) |

See the [architecture diagram](docs/02-technical-design.md) and [sprint record](docs/06-sprint-log.md) for the design and verification history. The release status is tracked in the [changelog](CHANGELOG.md).

## Team roles

| Role | Responsibility |
| --- | --- |
| Frontend developer | Interface, authentication screens, and API integration |
| Primary backend developer | API contracts, ownership, validation, persistence, and integration |
| AI/ML developer and backup backend | Groq integration, structured output validation, and backend foundation support |
| Dedicated DevOps engineer | CI/CD, environments, secrets, deployment health, and pipeline evidence |

The team has four people and one dedicated DevOps engineer. Product ownership and code review are shared team responsibilities.

## Branch strategy

- `main` contains stable, deployable code.
- Develop on a feature branch and submit a pull request. When a branch depends on an unmerged change, review it against that dependency first.
- Team policy requires passing CI and at least one teammate review before merge. Repository administrators manage the GitHub rules that enforce those gates.

## Run locally

Use Node.js 22 and pnpm 11.25.0. From the repository root, run in PowerShell:

```powershell
pnpm install --frozen-lockfile
npm --prefix backend ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

1. Set `NEXT_PUBLIC_API_URL=http://localhost:8080` and the public Supabase URL and anon key in `.env.local`.
2. Set `FRONTEND_URL=http://localhost:3000` in `backend/.env` and configure the same development Supabase project, server-only Storage key, and restricted PostgreSQL runtime login. Set `GROQ_API_KEY` there to try live extraction and analysis.
3. Apply migrations to the development database using the separate operator connection. Follow the [migration and role setup instructions](docs/08-setup-and-api.md#apply-migrations-deliberately) before running `npm --prefix backend run migrate`. The backend loads its ignored `.env` automatically.
4. Start the backend with `npm --prefix backend start` and the frontend with `pnpm dev` in separate terminals.
5. Open [http://localhost:3000](http://localhost:3000). Use the same origin configured in `FRONTEND_URL` and the Supabase Auth redirect allowlist.

Check [backend readiness](http://localhost:8080/ready) before signing in. A ready backend returns HTTP 200 with a connected private database. Use a development account and a synthetic text-based PDF or DOCX. Upload it, open it, choose **Extract resume profile**, review the draft, choose **Confirm this profile**, then select **Analyze resume**. In the same resume view, save a job description and compare it, then start a five-question mock interview with or without the saved job. Reopen the resume to check saved comparisons and interview feedback. Scanned PDFs without a text layer cannot be extracted. Apply both Sprint 4 migrations before starting this version of the backend.

The optional Vite prototype in `CareerPrepAI/` is separate. Run it with `npm --prefix CareerPrepAI ci` and `npm --prefix CareerPrepAI run dev`.

## Quality checks

```powershell
pnpm lint
pnpm build
npm --prefix backend run check
npm --prefix backend test
```

GitHub Actions also runs database integration against disposable PostgreSQL and builds the prototype. To run the database suite locally, use the [disposable database setup](docs/08-setup-and-api.md#automated-checks).

The normal tests mock Groq. With a development key set on the backend, run `npm --prefix backend run evaluate:resume-ai` to check the three synthetic fixtures against the live provider. The command reports a pass count for expected skills and grounded achievement evidence. Keep Groq keys, database passwords, Storage service-role keys, and access tokens in ignored local files or hosting secret settings.

For job matching, `node backend/scripts/evaluate-job-match.js --live` evaluates six synthetic labelled cases, including aspirations and unsupported proficiency claims. It reports case identifiers and outcomes, not document text or keys. Without `--live` it makes no provider calls and states that live evaluation was not run. Passing mocked tests does not establish model accuracy. The runtime quotation validator checks source spans, not semantic entailment.

## Release status

PRs #39 and #40 are merged. Main revision `328c9f7` passed [CI](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/44580202191), deployed automatically to Railway, and passed the [deployment smoke](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/44580304288). A signed-in analysis retest saved a result that remained after reopening; earlier intermittent failures still have no confirmed root cause. Exact source quotations check where evidence came from, not whether every AI interpretation is justified. Review matching and analysis claims yourself.

The frontend workflow initially failed at missing secrets and then token-format validation. After approved configuration, [attempt 3](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/44580304795/attempts/3) built and deployed `328c9f7`, verified that the accepted Vercel alias points to that deployment, and passed the production smoke. The corrected run was manually retried; it does not substitute for the continuous Deployment Challenge or verify a new merge through automatic frontend delivery. Public signup email delivery remains deferred while a confirmed account is used. Final deployed two-account acceptance, enforced review/CI gates, rollback rehearsal, real course records, and the tagged release remain open. See the [dated recheck](docs/evidence/release-recheck-2026-11-20.json), [release checklist](CHANGELOG.md#release-checklist), and [cloud setup guide](docs/09-cloud-setup.md).

## Final defense

The final code freeze and submission deadline is **November 27, 2026 at 11:59 PM Philippine time**. The official format is a 20-minute presentation with a live production walkthrough, followed by 10 minutes of Q&A. The Deployment Challenge must be recorded continuously with English narration by the designated DevOps Engineer, then linked here before freeze. Existing edited walkthroughs are rehearsal material. [Official final-defense instructions](docs/00-final-defense-instructions.md) · [Readiness checklist and submission evidence](docs/10-final-defense-checklist.md)

The final tag, slide-deck link and continuous Deployment Challenge link are pending. Add their verified links here when the deliverables exist and confirm panel access.
