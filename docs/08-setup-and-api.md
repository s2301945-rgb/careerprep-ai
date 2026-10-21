# Resume workspace setup and API

This is the Sprint 2 implementation contract. Later extraction, analysis, matching and interviews remain in the [technical design](02-technical-design.md). Deployment/test evidence belongs in the [sprint record](06-sprint-log.md).

## Local setup with an existing development Supabase project

Use Node.js 22+ and pnpm 11.25.0. Run commands from the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
npm --prefix backend ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

Edit the two ignored environment files locally. Existing files may already contain your settings; inspect them before copying over them. Do not put credentials in chat, screenshots or commits.

| File | Required settings | Source |
| --- | --- | --- |
| `.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local Node API URL and the development project's public Supabase Auth settings |
| `backend/.env` | `FRONTEND_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Exact local frontend origin and the same development Supabase project |
| `backend/.env` | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_RESUME_BUCKET=resumes` | Server-only Storage credential; never a public frontend variable |
| `backend/.env` | `DATABASE_URL`, optional `DATABASE_SSL_CA` | A limited PostgreSQL runtime login, with verified TLS for remote connections |
| Operator environment | `MIGRATION_DATABASE_URL`, optional `MIGRATION_DATABASE_SSL_CA` | Separate schema-owner/migration credential; remove it from long-running application environments |
| `backend/.env` | Optional `GEMINI_API_KEY`, `GEMINI_MODEL` | Server-side connectivity probe only; not needed for resume CRUD or routine tests |

`backend/.env` loads automatically regardless of the shell's working directory. Process environment values take precedence. Supabase's connection panel provides direct/session-pooler URLs; use a connection reachable from Railway and keep the pool bounded. Remote TLS verifies the certificate and hostname. `sslmode=disable` is accepted only for loopback outside production; it is not a hosted workaround.

In the development Supabase Auth settings, enable the intended email/password flow, set the site URL and allow the exact frontend callback URLs. Keep email confirmation behavior explicit: the UI shows a confirmation notice when sign-up produces no session. The browser SDK manages the persisted session and refresh; Node verifies each bearer token using Supabase Auth before resolving an application profile.

## Apply migrations deliberately

The migration runner is an operator action from the **full repository checkout**, whose `supabase/migrations` directory is available. Railway's `/backend` deployment does not contain the sibling migration directory and must not run migrations on app startup.

For a fresh Supabase development project with its standard Auth/Storage schemas:

```powershell
npm --prefix backend run migrate
```

For an existing project, first inspect the migration history, current schema, existing legacy users and backup/recovery options. The runner recognizes Supabase CLI migration history. If the two original SQL files were applied manually and have no ledger entry, use the explicit baseline command only after confirming that those original objects already exist:

```powershell
npm --prefix backend run migrate:baseline
npm --prefix backend run migrate
```

The runner records checksums and refuses changed applied migrations. It does not erase/rebuild the project. Never baseline a missing or partial schema to make a command pass. Plain PostgreSQL needs the integration fixture's Supabase stand-ins; use the test suite for that case rather than pretending plain PostgreSQL is the hosted Supabase service.

The follow-up migration:

- Adds a unique nullable `users.auth_user_id` reference to `auth.users`, while retaining existing bigint IDs and ownership foreign keys. Legacy users remain detached until explicitly reconciled; matching email alone does not authorize linking. A legacy email conflict returns `ACCOUNT_LINK_REQUIRED`.
- Removes unused Laravel `password`/`remember_token`, adds/backfills a checked `display_title`, and preserves the original filename and opaque file identity.
- Creates private bucket `resumes` with PDF/DOCX and 10 MiB restrictions when Supabase Storage is present.
- Adds a durable cleanup outbox independent of application/Auth cascades and captures private file keys before profile deletion.
- Creates the `careerprep_api` **NOLOGIN privilege role**, granting only the table/sequence access needed by this API. It does not create or commit a runtime password.

A privileged operator should create a separate login and grant it the privilege role, then set its password through the secure database administration flow:

```sql
CREATE ROLE careerprep_runtime LOGIN INHERIT;
GRANT careerprep_api TO careerprep_runtime;
```

For example, `psql`'s interactive `\password careerprep_runtime` avoids embedding the password in checked-in SQL. Use this login in `DATABASE_URL`. The account must not be a superuser, migration owner or Auth admin. Keep `careerprep` outside the Supabase Data API's exposed schemas. Do not grant `anon` or `authenticated` private-table access.

The original metadata migration seeds `public.app_config`. Resume records should be created through authenticated upload with real test documents; no production login passwords or private resumes are seeded automatically. Disposable test identities and fixtures belong only in the test environment.

Start the two services in separate terminals:

```powershell
npm --prefix backend start
```

```powershell
pnpm dev
```

Open `http://localhost:3000`, create/confirm a development account, sign in and upload a PDF or DOCX. Reload to verify persistence, then rename, download and delete it. Repeat with a second account to verify isolation.

## API reference

Base URL: configured `NEXT_PUBLIC_API_URL`. Application routes require `Authorization: Bearer <access-token>` from a real Supabase session. Do not send `user_id`; Node derives ownership from the verified identity. IDs and file sizes are decimal strings to preserve PostgreSQL bigint precision.

| Method/path | Request | Success |
| --- | --- | --- |
| `GET /` | None | 200, process liveness |
| `GET /health` | None | 200, public database metadata state; `not_configured` is not readiness |
| `GET /ready` | None | 200 only when the private application database check succeeds; otherwise 503 |
| `POST /ai-test` | Verified token, at most once per identity per minute per process | 200, Gemini connectivity status; no application analysis |
| `GET /api/v1/me` | Verified token | 200, `{ "user": { "id", "email", "name" } }`; safely resolves/creates the profile |
| `POST /api/v1/resumes` | Multipart `file` and optional `display_title` | 201, `{ "resume": ... }` after storing the real private document and metadata |
| `GET /api/v1/resumes` | Optional `limit` 1–100 (default 20) and opaque `cursor` | 200, `{ "resumes": [...], "next_cursor": "..." or null }` |
| `GET /api/v1/resumes/:id` | Owned decimal ID | 200, `{ "resume": ... }` |
| `PATCH /api/v1/resumes/:id` | JSON `{ "display_title": "Graduate applications" }` | 200, `{ "resume": ... }`; no other fields accepted |
| `GET /api/v1/resumes/:id/file` | Owned decimal ID | 200, original file attachment with private/no-store caching |
| `DELETE /api/v1/resumes/:id` | Owned decimal ID | 204 once required object cleanup is complete; repeat delete can complete/reuse its retained task |

A resume representation contains `id`, `display_title`, `original_filename`, `mime_type`, `file_size_bytes`, `extraction_status`, nullable extraction failure/time, and creation/update timestamps. It never reveals a permanent public file URL, storage path, owner ID or credential. A new upload starts with `extraction_status: pending`; it does not call an LLM. Replacing a document means uploading a new resume; renaming changes only its title.

Titles must contain 1–150 characters after trimming; blank/oversized/control-character titles and unknown write fields fail validation. Uploads accept one nonempty PDF/DOCX up to 10 MiB with matching filename, MIME and bounded document-container checks. Deeper readability, encryption, OCR and text extraction checks belong to the later extraction operation; Sprint 2 upload does not claim to have parsed usable resume text.

JSON mutations require `Content-Type: application/json`; file uploads require `multipart/form-data` with the browser-generated boundary. Request bodies, ZIP expansion and dependency timeouts are bounded. Only exact configured frontend origins receive access, and CORS does not replace token verification. Non-owned and missing resources both return 404.

Error shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "display_title must be 1 to 150 characters.",
    "retryable": false,
    "request_id": "opaque-request-id"
  }
}
```

Typical statuses: 400 malformed JSON/cursor/query, 401 invalid/missing session, 403 disallowed browser origin, 404 missing/unowned resource, 405 unsupported resource method, 409 explicit legacy-account reconciliation needed, 413 excessive body/file size, 415 wrong request media type, 422 invalid fields/document container, 429 repeated probe and 503 unavailable dependency/cleanup pending. Internal details and source documents are not returned/logged. A request ID allows a safe error report.

If deleting the database record succeeds but Storage fails, the API returns retryable `CLEANUP_PENDING` and retains the key/task. Retry the same delete shortly; the bounded worker also processes due tasks after restart. The task is not removed by an Auth/profile cascade. Upload compensation uses the same durable mechanism and checks for a live resume before removing an object.

## Automated checks

```powershell
pnpm lint
pnpm build
npm --prefix backend run check
npm --prefix backend test
```

For database integration, use a separate **disposable local PostgreSQL database** and set `TEST_DATABASE_URL` and `TEST_DATABASE_DISPOSABLE=true` only in that test shell. Then run `npm --prefix backend run test:integration`. The suite creates/removes test schemas and therefore must never target development data you need or any hosted production database. CI provisions its own PostgreSQL service and supplies these test-only values automatically.

See [pipeline and environments](07-pipeline-and-environments.md) for hosting configuration, preview isolation, deployment checks, rollback and measured evidence. The separate `CareerPrepAI/` Vite prototype is preserved, not the production application entry point.
