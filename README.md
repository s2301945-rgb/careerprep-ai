# CareerPrep AI

CareerPrep AI is an AI-powered resume analyzer and mock interview platform. The Week 1 deliverable is a thin, deployed walking skeleton that proves the frontend, backend, database, AI provider, CI, and deployment path can work together.

## Week 1 Walking Skeleton

- Next.js frontend with live service indicators
- `GET /api/health` backend endpoint
- Supabase PostgreSQL read through `public.app_config`
- `POST /api/ai-test` server-side Gemini connectivity test
- GitHub Actions install, lint, and build checks on pull requests
- Vercel-ready deployment configuration

Future iterations will add authentication, PDF/DOCX resume upload, resume analysis, job-description matching, interview questions, and answer evaluation.

## Technology

- Frontend and backend: Next.js, React, TypeScript
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
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env.local` and provide:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only secrets. Never commit `.env.local`.

## Database Migration

Apply the SQL files in `supabase/migrations` to a new Supabase project in filename order. The walking-skeleton migration creates `public.app_config`, inserts the project name, and grants read-only access so `/api/health` can prove a real database read.

The larger `careerprep` schema is private by design and is reserved for future application features.

## API Endpoints

### `GET /api/health`

Returns frontend/backend database connectivity information. When Supabase is configured, the application name is read from PostgreSQL.

### `POST /api/ai-test`

Makes a minimal Gemini request from the server. The API key is never sent to the browser.

## Quality Checks

```bash
pnpm lint
pnpm build
```

GitHub Actions runs install, lint, and build on every pull request and on pushes to `main`.

## Deployment

1. Import the GitHub repository into Vercel.
2. Add the environment variables from `.env.example` in Vercel project settings.
3. Deploy the `main` branch.
4. Verify the homepage, `/api/health`, and the **Test AI connection** button.
5. Add the production URL to this README.

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
