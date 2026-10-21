# CareerPrep AI

CareerPrep AI is an AI-powered resume analyzer and mock interview platform. The Week 1 deliverable is a thin, deployed walking skeleton that proves the frontend, backend, database, AI provider, CI, and deployment path can work together.

## Week 1 Walking Skeleton

- Next.js frontend deployed on Vercel with live service indicators
- Standalone Node.js backend deployed separately on Railway
- `GET /health` backend endpoint
- Supabase PostgreSQL read through `public.app_config`
- `POST /ai-test` server-side Gemini connectivity test
- GitHub Actions install, lint, and build checks on pull requests
- Vercel frontend and Railway backend deployment configuration

Future iterations will add authentication, PDF/DOCX resume upload, resume analysis, job-description matching, interview questions, and answer evaluation.

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
```

Copy `.env.example` to `.env.local`, then start both services:

```bash
cp .env.example .env.local
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

CI builds both frontends and checks the Railway backend.

## Environment Variables

The frontend uses one public variable:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Copy `backend/.env.example` to `backend/.env` for local backend development. In Railway, configure:

```env
FRONTEND_URL=https://your-vercel-domain.vercel.app
SUPABASE_URL=
SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_API_KEY` is a server-only secret stored only in Railway. Never place it in a `NEXT_PUBLIC_` variable or commit a local environment file.

## Database Migration

Apply the SQL files in `supabase/migrations` to a new Supabase project in filename order. The walking-skeleton migration creates `public.app_config`, inserts the project name, and grants read-only access so `/health` can prove a real database read.

The larger `careerprep` schema is private by design and is reserved for future application features.

## API Endpoints

### `GET /health`

Returns frontend/backend database connectivity information. When Supabase is configured, the application name is read from PostgreSQL.

### `POST /ai-test`

Makes a minimal Gemini request from the server. The API key is never sent to the browser.

## Quality Checks

```bash
pnpm lint
pnpm build
```

GitHub Actions runs frontend install, lint, build, and a backend syntax check on every pull request and on pushes to `main`.

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
