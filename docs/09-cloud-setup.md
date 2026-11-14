# Connect Supabase, Railway and Vercel from VS Code

The production backend runs on the `careerprep-ai` service in Railway's `capable-unity` project. It deploys `main` from `/backend` and checks [`/ready`](https://careerprep-ai-production-89bf.up.railway.app/ready). The November 14, 2026 audit confirmed the database connection and six applied Supabase migrations. The production service still needed the Storage and Groq credentials, and the public Vercel builds still needed to be connected to this backend. Recheck these settings before release.

## 1. Open the project terminal

In VS Code, open the `careerprep-ai` folder, choose **Terminal > New Terminal**, and check:

```powershell
supabase --version
railway --version
vercel --version
```

If a newly installed command is missing, close and reopen VS Code to refresh PATH. You do not need VS Code extensions to connect these services. The CLIs store login sessions locally; `.env.local` is application configuration, not the service login.

## 2. Check Supabase

```powershell
supabase projects list
supabase migration list --remote=pvarmnhsotxuoqtvcwcb
supabase config diff --remote=pvarmnhsotxuoqtvcwcb
```

Compare each version in [the migration directory](../supabase/migrations) with the remote ledger. All six versions through `20261108100000` matched in the release audit. If the ledger differs, review the diff and dry-run pending migrations before applying them. The `resumes` bucket should be private and allow PDFs and DOCX files up to 10 MiB.

Auth confirmation returns to `https://careerprep-ai-seven.vercel.app`; exact local and recorded review URLs are allowed too. The declared settings are in [config.toml](../supabase/config.toml). Review a diff before any future push; unrelated remote settings should stay untouched.

## 3. Configure the existing Railway service

The earlier outage and project-creation failure are historical. Inspect the existing project and service before making changes:

```powershell
railway whoami
railway list --json
```

Select the existing project rather than creating another:

```powershell
railway link
```

Choose `capable-unity`, the `production` environment and the existing `careerprep-ai` service. In **Variables**, check the setting names against [the setup guide](08-setup-and-api.md). The production audit found `DATABASE_URL`, `DATABASE_SSL_CA`, `FRONTEND_URL`, `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `GROQ_MODEL`.

- The Supabase project owner should enter the server-only legacy JWT `service_role` key as `SUPABASE_SERVICE_ROLE_KEY` directly in Railway. The deployed Storage client sends it as both `apikey` and a bearer token. A modern `sb_secret_…` key uses a different header convention and would require a client change. [Supabase key compatibility](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations)
- The Groq key owner should add a fresh `GROQ_API_KEY` to the same service. Store both credentials only in Railway and keep the database migration credential in the operator environment.

Use the checked commit as the deployment source. A source-only archive excludes ignored credentials and local dependencies:

```powershell
$deployStage = Join-Path $env:TEMP ('careerprep-deploy-' + [guid]::NewGuid())
$deployArchive = $deployStage + '.zip'
git archive --format=zip --output=$deployArchive HEAD backend
Expand-Archive -LiteralPath $deployArchive -DestinationPath $deployStage
railway up "$deployStage/backend" --path-as-root --service careerprep-ai --detach
railway domain --service careerprep-ai
```

Check [the production API's readiness](https://careerprep-ai-production-89bf.up.railway.app/ready) for HTTP 200 and a connected database. `/api/v1/resumes` without a token must return 401. Verify the deployed commit, the `/backend` root directory, and whether **Wait for CI** is enabled. Confirm that `FRONTEND_URL` includes the selected production domain and that the browser preflight returns HTTP 204 with that origin.

## 4. Finish Vercel

Confirm which frontend URL the team will submit and have that Vercel project's owner update it. In the release audit, [careerprep-ai-seven.vercel.app](https://careerprep-ai-seven.vercel.app) served an older build without a Railway API URL. The repository's public link, [careerprep-ai-ten.vercel.app](https://careerprep-ai-ten.vercel.app), called the older Railway service, whose `/ready` returned HTTP 503.

In **Settings > Environment Variables**, set the Production value of `NEXT_PUBLIC_API_URL` to `https://careerprep-ai-production-89bf.up.railway.app`. Verify the public Supabase Auth settings and the matching redirect URL for the selected site. Deploy the checked `main` commit after saving the setting, because Next.js embeds `NEXT_PUBLIC_` values at build time. Confirm the deployed revision before testing in the browser.

From this linked checkout, `vercel deploy --environment preview` creates a review deployment; `vercel deploy --prod` publishes production. Use a clean source archive for manual uploads, as above, or inspect `vercel deploy --dry --json` first to ensure ignored credentials and local files are excluded. A complete release still requires the reviewed commit and passing CI.

The attempted Git connection failed because this account does not own `s2301945-rgb/careerprep-ai`. Vercel's [GitHub integration requirements](https://vercel.com/docs/git/vercel-for-github) require ownership for personal repositories. The repository owner must resolve hosting/repository ownership and authorize the integration. Do not change repository ownership, create substitute history or claim automatic deployment is configured just because CLI upload works.

## 5. Accept the deployed increment

Set GitHub repository variables `PRODUCTION_FRONTEND_URL` and `PRODUCTION_API_URL` to the accepted URLs. Run the smoke workflow. It checks the frontend response and the API endpoints independently. In the deployed browser app, verify that the Network panel shows a successful `/ready` request to the chosen Railway API.

Use two dedicated test accounts and synthetic resumes. Check signup confirmation, sign-in and token refresh. Upload PDF and DOCX files, reload, rename, download and delete them. Verify the other account cannot list or download those files. Run the backend AI check, confirm a resume profile, generate a saved analysis, compare the resume with a saved job and complete the five-answer interview. Record the deployed commit, URLs and outcomes in [the sprint log](06-sprint-log.md). Tag the release after completing [the release checklist](../CHANGELOG.md#release-checklist).

The course also requires an actual teammate review before merge, real team standups and a retrospective. These are team actions; the test reports do not replace them.
