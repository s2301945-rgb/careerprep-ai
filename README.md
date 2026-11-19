# CareerPrep AI

CareerPrep AI helps college students and recent graduates organize resumes and prepare for entry-level applications. It includes sign-in, private PDF/DOCX uploads, resume management, editable profile extraction, AI resume analysis, saved job comparisons, and five-question text mock interviews. A signed-in rehearsal with synthetic data verified PDF upload, rename and private download, profile extraction and confirmation, saved analysis, job matching, a complete interview, and persistence after reload. See the [dated acceptance record](docs/06-sprint-log.md#signed-in-hosted-acceptance--november-1920-2026-asiamanila) for the tested deployments and remaining checks.

[Open CareerPrep AI](https://careerprep-ai-demo-221a.vercel.app). The app uses the [Railway API](https://careerprep-ai-production-89bf.up.railway.app), whose [readiness endpoint](https://careerprep-ai-production-89bf.up.railway.app/ready) checks the private application database.

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

## Release status

The signed-in demo workflow passed on the deployments recorded in the [sprint record](docs/06-sprint-log.md). The latest frontend fixes and deployment automation still need a verified production deployment. Public signup email delivery is deferred while an existing confirmed account is used. Current-run deletion and two-user isolation, enforced review and CI gates, rollback rehearsal, actual course process evidence, and the tagged release remain open in the [release checklist](CHANGELOG.md#release-checklist). See the [cloud setup guide](docs/09-cloud-setup.md) and [documentation index](docs/README.md) for the handoff.
