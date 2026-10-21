# CareerPrep AI

CareerPrep AI helps college students and fresh graduates organize resumes and prepare for entry-level applications. The Sprint 2 implementation adds a private resume workspace with Supabase sign-in, real PDF/DOCX upload, list/detail, rename, authorized download and deletion through a standalone Node API.

Resume text extraction, AI analysis, job-description matching and mock interviews remain required later work. The current workspace stores documents without claiming an AI analysis. [Sprint evidence](docs/06-sprint-log.md) distinguishes implementation from reviewed, deployed completion.

## Implemented scope

- Next.js authentication and resume workspace, with loading, empty and error states
- Standalone Node.js backend deployed separately on Railway
- Verified Supabase Auth identities mapped to owned application profiles
- Private PostgreSQL resume CRUD and private Supabase Storage, with durable file-cleanup recovery
- `GET /health` metadata check and `GET /ready` private-schema readiness
- Supabase PostgreSQL read through `public.app_config`
- Authenticated, bounded `POST /ai-test` server-side Gemini connectivity probe
- GitHub Actions frontend checks, API tests, real PostgreSQL integration tests and prototype build
- Vercel frontend and Railway backend deployment configuration

Read the [setup and API guide](docs/08-setup-and-api.md) for configuration, migrations, ownership rules and recovery. The files in this PR stack require the hosted environment changes and review listed in the sprint record before the live app reflects this scope.

## Technology

- Frontend: Next.js, React, TypeScript on Vercel
- Backend: Node.js HTTP API on Railway
- Database: Supabase PostgreSQL
- AI provider: Google Gemini
- CI: GitHub Actions
- Deployment: Vercel

## Team Roles

| Role | Responsibility |
| --- | --- |
| Frontend developer | Interface, authentication screens, and API integration |
| Primary backend developer | API contracts, ownership, validation, persistence, and integration |
| AI/ML developer and backup backend | Gemini integration, structured output validation, and backend foundation support |
| Dedicated DevOps engineer | CI/CD, environments, secrets, deployment health, and pipeline evidence |

The confirmed team has four people and exactly one dedicated DevOps engineer. Names and individual availability still need to be recorded. Product-owner duty and code review are shared team responsibilities; assign the product-owner duty before consultation.

## Branch Strategy

- `main` contains stable, deployable code.
- Work is completed in `feature/<issue-number>-<description>` branches.
- Changes enter `main` through pull requests.
- Team policy requires passing CI and at least one teammate review before merge.
- The active GitHub ruleset requires pull requests and blocks force pushes/deletion. It currently enforces neither approving reviews nor required status checks; a repository admin must configure those gates.

## Local Setup

Requirements: Node.js 22+ and pnpm 11+.

```bash
pnpm install
npm --prefix backend ci
```

Copy `.env.example` to `.env.local` and `backend/.env.example` to `backend/.env`, configure a development Supabase project and the private database runtime login, and apply migrations as explained in the [setup guide](docs/08-setup-and-api.md). Start the services in separate terminals:

```bash
pnpm dev
npm --prefix backend start
```

Open `http://localhost:3000`.

### Standalone frontend prototype

The `CareerPrepAI/` directory preserves the Vite and TypeScript prototype from the `master` branch. It runs independently of the Next.js frontend at the repository root:

```bash
npm --prefix CareerPrepAI ci
npm --prefix CareerPrepAI run dev
```

CI builds both frontends and tests the Railway backend against disposable PostgreSQL.

## Environment Variables

The frontend uses three public settings:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Copy `backend/.env.example` to `backend/.env` for local backend development. In Railway, configure:

```env
FRONTEND_URL=https://your-vercel-domain.vercel.app
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_RESUME_BUCKET=resumes
DATABASE_URL=
DATABASE_SSL_CA=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_API_KEY` is a server-only secret stored only in Railway. Never place it in a `NEXT_PUBLIC_` variable or commit a local environment file.

`DATABASE_URL` uses a limited runtime login granted the `careerprep_api` privilege role; the separate `MIGRATION_DATABASE_URL` belongs only in the operator environment. The backend loads its ignored `.env` automatically. The committed templates list all current settings; the [setup guide](docs/08-setup-and-api.md) explains their sources and TLS requirements.

## Database Migration

From the full repository checkout, run `npm --prefix backend run migrate` with a separate `MIGRATION_DATABASE_URL`. For manually migrated existing databases, inspect the current schema/history and use the explicit baseline procedure in the setup guide. Applied-file checksums prevent silent migration changes.

The follow-up migration reconciles Supabase Auth, adds display titles, creates a private resume bucket and durable cleanup tasks, and grants a limited runtime privilege role. Legacy profiles are never linked based solely on matching email. The `careerprep` schema stays private and outside the Supabase Data API; all application operations go through Node.

## API Endpoints

### `GET /health`

Returns frontend/backend database connectivity information. When Supabase is configured, the application name is read from PostgreSQL.

### `POST /ai-test`

Requires a verified bearer token and makes a minimal Gemini request from the server, with a timeout and per-identity interval limit. The API key is never sent to the browser.

### Resume API

`/api/v1/me` and `/api/v1/resumes` provide authenticated profile resolution and owned upload/list/detail/rename/delete/download. See the [complete API contract](docs/08-setup-and-api.md#api-reference) for requests, envelopes, pagination, errors and cleanup semantics.

## Quality Checks

```bash
pnpm lint
pnpm build
npm --prefix backend run check
npm --prefix backend test
```

GitHub Actions runs these checks, PostgreSQL integration tests and the preserved prototype build on every pull request and push to `main`. The integration suite needs an explicitly disposable local database; CI supplies its own. See [pipeline documentation](docs/07-pipeline-and-environments.md) for stages, measured baseline, environment separation and rollback.

## Deployment

### Live Week 1 deployment

- Frontend: https://careerprep-ai-ten.vercel.app
- Backend: https://careerprep-ai-production.up.railway.app

The deployed frontend connects to the Railway backend, and the backend successfully reads the walking-skeleton configuration from the hosted Supabase database.

### Backend on Railway

1. Create a Railway service from this GitHub repository.
2. Set the service **Root Directory** to `/backend`.
3. Add the variables from `backend/.env.example` (Railway supplies `PORT`).
4. Generate a public Railway domain and verify `/`, `/health`, and `POST /ai-test`.

### Frontend on Vercel

1. Import the same GitHub repository into Vercel using the repository root.
2. Set `NEXT_PUBLIC_API_URL` to the public Railway domain, without a trailing slash.
3. Redeploy the `main` branch.
4. Set Railway's `FRONTEND_URL` to the final Vercel URL.
5. Verify all four service indicators and the **Test AI connection** button.

Complete the [hosting configuration and two-user rehearsal](docs/07-pipeline-and-environments.md) before calling Sprint 2 deployed. Vercel previews need an intentionally separate API/database environment and exact allowed origins.

## Week 1 Evidence Checklist

- [x] Repository, README, `.gitignore`, `.env.example`, and branch strategy
- [x] Database schema and migration files
- [x] Minimal frontend calling backend endpoints
- [x] Backend endpoint reading from the database
- [x] Pull-request CI for install, lint, and build
- [ ] Full migration inventory verified against the hosted project (previously reported applied; the current live health check verifies public metadata only)
- [x] Production deployment available at a live URL
- [x] Branch protection requires pull requests
- [ ] Admin-enforced passing CI and one teammate approval
- [x] GitHub issues created for the Week 1 requirements
- [ ] Gemini verified through the deployed backend — the October 22, 2026 check returned `not_configured`; the owner's separately reported successful key test does not verify the current Railway environment

## Sprint scope and evidence

The [official instructions](docs/00-official-course-instructions.md) define Sprint 1 as the deployed walking skeleton and Sprint 2 as owned resume CRUD through the API and UI, including API tests and environment separation. Extraction, analysis, matching and interviews remain later required work. See the [documentation index](docs/README.md) and [sprint delivery record](docs/06-sprint-log.md) for contracts, issues, verified results and outstanding review/deployment gates.

## Security

Never commit API keys, database passwords, access tokens, or other credentials. Use `.env.local`, GitHub Actions secrets, and Vercel environment variables.
