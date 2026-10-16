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
| Product owner | Requirements, priorities, and backlog |
| Frontend developer | Interface and client-side behavior |
| Backend developer | API routes and AI integration |
| Database developer | Schema design and migrations |
| DevOps / QA | CI, testing, and deployment |

Team members may hold more than one role. Add member names beside these roles before the consultation.

## Branch Strategy

- `main` contains stable, deployable code.
- Work is completed in `feature/<issue-number>-<description>` branches.
- Changes enter `main` through pull requests.
- CI must pass before a pull request is merged.
- Direct pushes and force pushes to `main` are blocked by a GitHub ruleset.

## Local Setup

Requirements: Node.js 22+ and pnpm 11+.

```bash
pnpm install
Copy `.env.example` to `.env.local`, then start both services:

```bash
cp .env.example .env.local
pnpm dev
npm --prefix backend start
```

Open `http://localhost:3000`.

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

Apply the SQL files in `supabase/migrations` to a new Supabase project in filename order. The walking-skeleton migration creates `public.app_config`, inserts the project name, and grants read-only access so `/api/health` can prove a real database read.

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
- [ ] Supabase migrations applied to the hosted project
- [ ] Gemini key verified through the backend
- [ ] Production deployment available at a live URL
- [ ] GitHub issues created for every requirement

## Security

Never commit API keys, database passwords, access tokens, or other credentials. Use `.env.local`, GitHub Actions secrets, and Vercel environment variables.
