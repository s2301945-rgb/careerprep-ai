# Connect Supabase, Railway and Vercel from VS Code

The production backend runs on the `careerprep-ai` service in Railway's `sunny-beauty` project. It deploys `main` from `/backend` and checks [`/ready`](https://careerprep-ai-production-368d0279.up.railway.app/ready). The November 14, 2026 audit confirmed the database connection and six applied Supabase migrations; the [November 19–20 hosted rehearsal](06-sprint-log.md#signed-in-hosted-acceptance--november-1920-2026-asiamanila) passed private file operations and live AI workflows. On November 26, 2026, the backend was moved to `sunny-beauty` with a non-expiring `GROQ_API_KEY`, and the production frontend was switched to `xiee-t/careerprep-ai` at [`https://careerprep-ai-seven.vercel.app`](https://careerprep-ai-seven.vercel.app).

The [November 20 setup deployment](06-sprint-log.md#frontend-production-update--november-20-2026-asiamanila) configured the three public Vercel Production settings, changed Node.js to 22.x and deployed tested commit `3998f66` to the submitted demo URL. Its accepted alias and retained application data were verified. Automatic frontend delivery and the final release gates still require owner/team action; the manual setup is not the recorded Deployment Challenge.

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

The declared Auth confirmation destination is `https://careerprep-ai-seven.vercel.app`; exact local and recorded review URLs are allowed too. These target settings are in [config.toml](../supabase/config.toml). Compare them with the hosted settings before applying a reviewed configuration update.

### Signup email limits

The November 19, 2026 dashboard check found custom SMTP disabled. The signed-in collaborator could view the setting but its toggle was disabled. A signup error such as `over_email_send_rate_limit` means confirmation mail could not be sent; it is not proof that account creation or email confirmation succeeded.

Supabase's built-in sender currently allows two emails per hour per project and only sends to organization team addresses. It is intended for testing. Public signup requires a custom SMTP provider or Send Email hook. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

An owner or administrator with permission to edit Auth settings should open **CareerPrep AI > Authentication > Emails > SMTP Settings**, enable custom SMTP, and enter the team's provider host, port, username, password, and verified sender address directly in Supabase. Keep credentials out of the frontend, Git, screenshots, and chat. Keep email confirmation enabled and review the email quota against the provider's allowance.

After configuration, use an email address controlled by the tester for one signup, follow the received confirmation link back to the deployed website, and verify sign-in. Record the result. An existing confirmed account can use password sign-in while signup mail is limited. Repeated signup attempts consume requests and do not repair email delivery.

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

Choose `capable-unity`, the `production` environment and the existing `careerprep-ai` service. In **Variables**, check the setting names against [the setup guide](08-setup-and-api.md). The November 19 inspection found `DATABASE_URL`, `DATABASE_SSL_CA`, `FRONTEND_URL`, `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, and `GROQ_MODEL`, without inspecting values. The signed-in rehearsal independently verified Storage and Groq operations. Do not replace working credentials simply because older records list them as missing. If credentials later need provisioning or rotation:

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

The active production frontend URL is [careerprep-ai-seven.vercel.app](https://careerprep-ai-seven.vercel.app), in the Vercel scope `xiee-t` (`prj_EzVr9hqE2eNMW5D6h3XcDGUFE56s`). Earlier `careerprep-ai-demo-221a` and `careerprep-ai-ten` links are historical deployments.

In **Settings > Environment Variables**, configure Production variables `NEXT_PUBLIC_API_URL` (the working Railway API), `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (a public anon or publishable key). No stored Production variables were present at the November 19 inspection, despite the old build having public settings embedded. Verify the matching Auth redirect URL, approve and set the project's Node.js version to `22.x` to match CI, then deploy the checked revision. Next.js embeds `NEXT_PUBLIC_` values at build time. Confirm the deployed revision before repeating browser acceptance.

From this linked checkout, `vercel deploy --environment preview` creates a review deployment; `vercel deploy --prod` publishes production. Use a clean source archive for manual uploads, as above, or inspect `vercel deploy --dry --json` first to ensure ignored credentials and local files are excluded. A complete release still requires the reviewed commit and passing CI.

The attempted native Git connection failed because this account does not own `s2301945-rgb/careerprep-ai`. Vercel's [GitHub integration requirements](https://vercel.com/docs/git/vercel-for-github) require ownership for personal repositories. The alternative [CI-gated Vercel workflow](07-pipeline-and-environments.md#frontend-deployment-after-main-ci) requires the repository owner to add the three documented Actions secrets, plus public deployment target variables. A workflow file or manual upload alone does not prove automatic deployment works. Record the first successful deployment of the tested SHA to the accepted alias.

## 5. Accept the deployed increment

Set GitHub repository variables `PRODUCTION_FRONTEND_URL` and `PRODUCTION_API_URL` to the accepted URLs. Run the smoke workflow. It checks the frontend response and the API endpoints independently. In the deployed browser app, verify that the Network panel shows a successful `/ready` request to the chosen Railway API.

Use two dedicated test accounts and synthetic resumes. Check signup confirmation, sign-in and token refresh. Upload PDF and DOCX files, reload, rename, download and delete them. Verify the other account cannot list or download those files. Run the backend AI check, confirm a resume profile, generate a saved analysis, compare the resume with a saved job and complete the five-answer interview. Record the deployed commit, URLs and outcomes in [the sprint log](06-sprint-log.md). Tag the release after completing [the release checklist](../CHANGELOG.md#release-checklist).

The course also requires an actual teammate review before merge, real team standups and a retrospective. These are team actions; the test reports do not replace them.
