# Connect Supabase, Railway and Vercel from VS Code

This guide records the earlier setup work. Recheck the live project settings before any release. The read-only Week 4 check found an existing Railway `capable-unity` project with a `careerprep-ai` production service sourced from `main`; it did not find configured database, Supabase Auth/Storage, or Groq key variables. The Railway service currently checks `/`, while the repository declares `/ready`. A successful Railway deployment alone does not establish that the private application is ready.

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
supabase migration list --linked
supabase config diff --project-ref pvarmnhsotxuoqtvcwcb
```

The project is `pvarmnhsotxuoqtvcwcb`. All three migration versions should appear as applied. Do not reset the database or re-create the runtime password. The existing runtime connection is in ignored `backend/.env`. The public frontend settings are in ignored `.env.local`.

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

Choose `capable-unity`, the `production` environment and the existing `careerprep-ai` service. In its **Variables** tab, configure the backend settings listed in [the setup guide](08-setup-and-api.md) through a private channel. Set `NODE_ENV=production`, use the limited runtime `DATABASE_URL`, and set `DATABASE_SSL_CA=certs/supabase-prod-ca-2021.crt`. Add only the exact approved frontend origins to `FRONTEND_URL`. Keep the service key and Groq key on Railway only. Do not add the operator/migration credential. Set the service health check to `/ready` and verify its response after the reviewed code and migrations are deployed.

Use the checked commit as the deployment source. A source-only archive excludes ignored credentials and local dependencies:

```powershell
$deployStage = Join-Path $env:TEMP ('careerprep-deploy-' + [guid]::NewGuid())
$deployArchive = $deployStage + '.zip'
git archive --format=zip --output=$deployArchive HEAD backend
Expand-Archive -LiteralPath $deployArchive -DestinationPath $deployStage
railway up "$deployStage/backend" --path-as-root --service careerprep-ai --detach
railway domain --service careerprep-ai
```

Record the verified domain. Check `https://YOUR-DOMAIN/ready`: it must return HTTP 200 with a connected database. `/api/v1/resumes` without a token must return 401. The live service is already sourced from `main`; verify Root Directory `/backend` and enable **Wait for CI** after the reviewed PR stack lands. Do not run the manual upload until the release is approved.

## 4. Finish Vercel

Open [your replacement project](https://vercel.com/xiee-t/careerprep-ai). It already has Next.js, Node 22, `pnpm install --frozen-lockfile`, `pnpm build`, and the two public Supabase settings. The first deployment is at [careerprep-ai-seven.vercel.app](https://careerprep-ai-seven.vercel.app). Its API is intentionally unconfigured until Railway supplies the replacement URL.

In **Settings > Environment Variables**, add `NEXT_PUBLIC_API_URL` with the new Railway HTTPS origin to Production. Use Preview only for the deliberately approved review environment; arbitrary previews must not access production private data. Redeploy after changing the value, because `NEXT_PUBLIC_` settings are included at build time.

From this linked checkout, `vercel deploy --environment preview` creates a review deployment; `vercel deploy --prod` publishes production. Use a clean source archive for manual uploads, as above, or inspect `vercel deploy --dry --json` first to ensure ignored credentials and local files are excluded. A complete release still requires the reviewed commit and passing CI.

The attempted Git connection failed because this account does not own `s2301945-rgb/careerprep-ai`. Vercel's [GitHub integration requirements](https://vercel.com/docs/git/vercel-for-github) require ownership for personal repositories. The repository owner must resolve hosting/repository ownership and authorize the integration. Do not change repository ownership, create substitute history or claim automatic deployment is configured just because CLI upload works.

## 5. Accept the deployed increment

Set GitHub repository variables `PRODUCTION_FRONTEND_URL` and `PRODUCTION_API_URL` to the accepted URLs. Run the smoke workflow after merge. Then use two real test accounts to upload PDF and DOCX, refresh, rename, download and delete; verify one account cannot access the other's documents. Check signup email confirmation and token refresh. Record the deployed commit and outcomes in [the sprint log](06-sprint-log.md).

The course also requires an actual teammate review before merge, real team standups and a retrospective. These are team actions; the test reports do not replace them.
