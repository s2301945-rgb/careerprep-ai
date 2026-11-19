# Final-defense readiness checklist

Prepared November 20, 2026 (Asia/Manila), from the supplied [final-defense instructions](00-final-defense-instructions.md) and [original endterm requirements](00-official-course-instructions.md). Unchecked items require actual evidence. This checklist records preparation work and does not certify the project complete.

## Deadline and presentation format

The code freeze and final submission deadline is **November 27, 2026 at 11:59 PM Philippine time**. Submit the repository, source and documentation, production URL, tagged release and Deployment Challenge before that cutoff. The final production app must correspond to the final tag. Preserve real commit history and timestamps. Earlier November 17 dates in the pitch and delivery plan are historical planning targets superseded by this final notice.

| Segment | Suggested time | What to prepare |
| --- | --- | --- |
| Problem and product | 3 minutes | Users, purpose, realistic scenario, value and any change from the approved pitch. |
| Architecture | 4 minutes | Frontend, backend, database and AI flow, related tables, API, hosting and trade-offs. |
| Live production walkthrough | 6 minutes | Full CRUD, related data, saved AI results, loading/empty/error states and invalid requests. |
| AI implementation | 3 minutes | Groq/model, grounded prompts, backend validation/storage, evaluation results, failures and limitations. |
| DevOps and engineering | 4 minutes | Designated DevOps Engineer explains actual rules, pipeline, environments, logs, metrics and rollback. |
| Panel Q&A | 10 minutes | Every member can explain the system, source code and operational decisions. |

Reporting totals 20 minutes and Q&A totals 10 minutes. Prepare while the preceding team presents and use no more than three minutes of setup afterward. Everyone attends, participates, uses English and wears presentable attire. The schedule and group order are to be announced November 27. The panel can review the challenge separately and may request relevant portions during the session.

## Verified snapshot and remaining application checks

The [November 19–20 hosted acceptance record](06-sprint-log.md#signed-in-hosted-acceptance--november-1920-2026-asiamanila) verifies existing-account sign-in, synthetic PDF upload/list/rename/private download, profile extraction and confirmation, resume analysis, saved job comparison, a complete five-answer interview and persistence after reload. That rehearsal used the older November 15 frontend and Railway revision `9f96080`. It does not verify the newest frontend fixes. Backend CI and smoke results are linked in that record.

Commit `3998f66` passed all three jobs in [CI run 44564774693](https://github.com/s2301945-rgb/careerprep-ai/actions/runs/44564774693). The approved manual setup deployed that revision as `dpl_AkvTwSQizp3zLn8Vi14sZdFtZfEk` on Node.js 22.x. The accepted alias, build messages, retained profile/analysis/match/interview and byte-matching private download were verified afterward. See the [November 20 update](06-sprint-log.md#frontend-production-update--november-20-2026-asiamanila).

PRs #39 and #40 have since merged. Main `328c9f7` passed CI and automatically deployed to Railway as `166fc749-2784-433e-8bc2-e725f6f725ef`; its production smoke passed. A later real-document analysis succeeded once and persisted after reopening, after earlier validation/provider failures. That single success does not establish a permanent reliability fix. A job comparison also saved, but one explanation overstates its source quote. The frontend workflow's first two attempts failed at missing secrets and token-format validation. After approved correction, attempt 3 built and deployed the same `328c9f7` revision, verified the production alias and passed smoke. Saved analysis, comparison and completed-interview history loaded on the fresh frontend. See the [current evidence checkpoint](evidence/release-recheck-2026-11-20.json). Neither a manual deployment nor a manually retried workflow satisfies the continuous Deployment Challenge.

## Seven product requirements

| Requirement | Code/CI evidence | Current production evidence and limits |
| --- | --- | --- |
| Real database CRUD | Resume endpoints and PostgreSQL persistence/ownership/delete tests passed CI. | Create/read/update passed before the frontend update; retained reads and private download passed after it. Current Delete and backend-redeployment persistence still need a controlled rehearsal. |
| Meaningful AI | Structured extraction, reviewed profiles, analysis/matching/interviews, source-quote validation and persistence, and mocked tests. Three resume fixtures and six synthetic job-matching references distinguish aspirations, named tools and demonstrated activity. | A single-account live journey saved extraction, analysis, matching and five interview answers. Earlier intermittent analysis failures and an overstated matching claim remain observed limitations. The new semantic prompt guidance and labelled matching cases have not been evaluated against the live provider. Numeric calibration and separate interview evaluation remain unverified. |
| Backend API | REST API owns SQL, private Storage and Groq. The browser's Supabase SDK is for Auth, not direct application database or AI calls. | The deployed frontend calls the intended Railway API; signed-in reads/download and the signed-out API boundary passed. |
| Frontend integration | Loading, empty, validation, error/retry and pending-request handling are implemented and tested. Frontend lint/build passed CI. | Normal user journey passed on the earlier build, and persisted results load on the updated build. Forced failure UI cases still need current hosted evidence. |
| Related database tables | Six migrations and integration tests cover ownership, profiles, analyses, job matches and interview questions/answers. | Saved related results are used by the live app. The six hosted migrations were recorded in the earlier audit; final current two-account isolation still needs verification. |
| Environments and secrets | Secret-free templates and ignore rules are present; earlier credential-boundary scans are dated evidence. | Public frontend settings were configured and the app works with the backend's server settings. A current complete history/boundary review and verified environment separation remain release evidence tasks. |
| AI/request errors | Mocked provider rate-limit, authorization, network, bad-output and timeout cases pass with mapped errors and retry rules. | Production readiness and unauthorized requests passed. Current forced AI failure/timeout and malformed-upload cases are not yet verified in the deployed UI. |

The focused [mocked AI failure drill](08-setup-and-api.md#mocked-ai-failure-drill) passed two tests covering seven injected failure cases without live provider calls. It is reproducible backend evidence, not a substitute for claiming an unobserved live production failure.

- [ ] **Frontend owner and DevOps Engineer** deploy the reviewed release through the configured automatic path and verify the accepted production alias serves that exact revision. Follow the [pipeline runbook](07-pipeline-and-environments.md#frontend-deployment-after-main-ci).
- [ ] **Developers and tester** repeat the production journey on the final revision, including a disposable record's full Create, Read, Update and Delete lifecycle, PDF and DOCX, reload persistence, private download, profile confirmation, AI analysis, job matching and all five interview answers.
- [ ] **Backend developer and tester** use two controlled accounts to prove ownership isolation and exercise expired authentication, invalid uploads and malformed requests. Record actual results. Retain the existing demo resume and use a separate disposable file for deletion.
- [ ] **AI developer and frontend developer** prepare a clearly identified method to simulate provider failure, malformed output and timeout, and demonstrate the resulting error/retry behavior. Existing mocked tests provide backend evidence. Record which failure cases were actually exercised in the deployed UI.
- [ ] **Team** disclose known limitations, including the deferred public signup email setup while an existing confirmed account is used. Confirm the panel's demonstration account works and provide its access details securely outside the public repository.

## Continuous Deployment Challenge

The actual system walkthrough, CRUD and AI demonstration must be live from production. The challenge is the only permitted pre-recorded demonstration. Existing edited or silent walkthroughs in the local outputs folder are practice material and do not satisfy this recording requirement.

The designated DevOps Engineer narrates in English during one continuous screen recording. Keep every waiting period, failed check and recovery visible. Do not cut, edit, add transitions, adjust speed, pause recording or skip sections. Prepare the workspace beforehand so credentials and private data stay hidden. The final-defense notice does not specify a separate 15-minute limit for this challenge.

- [ ] **Repository owner and DevOps Engineer** confirm the actual required approval and CI gates are enforced before starting. The last inspection found the main ruleset required PRs but zero approvals and no status checks. Enabling a policy must be verified in the dashboard.
- [ ] **Developer** make a small visible application change, such as page wording, and show the change in a development branch. A documentation-only change such as the earlier `backend/demo-pipeline-check.md` cannot demonstrate the required visible application modification.
- [ ] **Developer** commit and push the branch, open the PR and show its tests, quality checks, builds and execution times.
- [ ] **Separate teammate** review the actual change and submit the required approval. Preserve the genuine reviewer and commit evidence.
- [ ] **DevOps Engineer** show that required checks and approvals have passed, merge under the established policies, and follow the automatically triggered deployment and its logs. Use the normal automatic path for the frontend and backend changes. Do not use a manual deployment, manually dispatch a deployment workflow or bypass a quality gate to complete the challenge.
- [ ] **DevOps Engineer** open the accepted production app and verify the visible change on the same deployed source revision. Keep the entire path through production verification in the continuous recording.
- [ ] **Team** submit an accessible recording link in the root README before freeze and test panel access. No challenge link has been supplied in this preparation pass.

## Final deliverables and evidence

| Owner | Required next action |
| --- | --- |
| Team | Add actual member names to the existing role responsibilities and identify exactly one designated DevOps Engineer. Confirm the shared product-owner and review responsibilities. |
| Developers | Keep complete frontend/backend source, migrations, complete secret-free environment examples, setup instructions and synthetic test data available. Recheck architecture diagram, ERD, API documentation and the implemented relationships against the release. |
| Team | Obtain the final technical-documentation format announced for November 20 and check the submitted documentation against it. The supplied notice states the format will be posted; its contents have not been provided in this review. |
| AI developer | Document the provider/model choice, prompts, backend processing, limitations and actual evaluation results with inputs and acceptance criteria. Distinguish live provider outcomes from mocked tests. |
| DevOps Engineer | Configure and verify automatic delivery, required reviews/checks and environment separation. Show the security checks actually used, alongside tests and builds. CI currently records lint/tests/builds; a separate automated security-check stage has not been established in this review. |
| DevOps Engineer | Complete the four-sprint metrics log from actual runs, with time definitions, success rates, deployment outcomes and supported optimization comparisons. Preserve the distinction between local cache measurements and hosted pipeline trends. |
| DevOps Engineer and platform owners | Rehearse rollback to a known working frontend/backend revision, verify health and the user journey, and record actual outcomes and recovery timing. Preserve production data and use the reviewed recovery procedure. |
| Team | Link the real project board and add available sprint plans, standup notes, four retrospectives, consultation records and scope-change history. Identify unavailable historical evidence honestly. Do not manufacture past records or reviews. |
| DevOps Engineer | Maintain incident logs and postmortems for actual incidents, with known impact, cause, fix and recovery evidence. Leave unknown timings explicit. |
| Team | Prepare the final slide deck and rehearse the 20-minute reporting sequence and 10-minute defense. No final slide deck is linked in this preparation pass. |
| Release owner and reviewer | Verify the final reviewed commit in production, finish the dated changelog and publish the final tag/release before freeze. Link the production URL, tag, technical documentation, slide deck and continuous challenge from the root README. A final release tag has not been established in the current record. |

The [release checklist](../CHANGELOG.md#release-checklist), [dated sprint evidence](06-sprint-log.md), [pipeline/runbook](07-pipeline-and-environments.md) and [cloud setup guide](09-cloud-setup.md) contain the operational details. Mark each item only after its action and evidence exist.
