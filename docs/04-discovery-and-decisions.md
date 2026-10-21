# CareerPrep AI discovery session and decision log

Session started October 21, 2026 (Asia/Manila). Purpose: pressure-test the pitch against the course requirements and replace assumptions with explicit project decisions.

The requested `@grill-me` skill was not found in the available skill catalog, installed Codex skill directories, searched Claude skill directories, or project skill files. A focused interview is being conducted directly in chat. No skill was installed and no claim is made that a dedicated skill session was invoked.

## 1. Confirmed answers

| ID | Question | Owner's answer / resulting decision |
| --- | --- | --- |
| D-01 | Node.js or the Laravel backend described by the migration? | **Keep Node.js and adapt the schema/authentication plan.** Existing Node implementation remains the backend direction; Laravel-specific comments/columns need reconciliation. |
| D-02 | Supabase Auth or Node-managed credentials? | **Use Supabase Auth.** The proposed design keeps bigint application profiles with a unique UUID identity link, and verifies tokens in Node. The mapping mechanics are proposed implementation detail. |
| D-03 | Is a Gemini key already tested? | **The key is already tested.** This is the owner's report, not a live provider call performed during documentation. The key is not the owner's responsibility as backend engineer. |
| D-04 | What role does the owner hold? | **Primary backend engineer.** |
| D-05 | Are matching and interviews mandatory? | **Keep both in the final scope; build them after resume analysis.** They are required features, not stretch goals. A user may still omit a job description for a general interview. |
| D-06 | What is the deadline? | **November 17**, interpreted as November 17, 2026 in this session and used as the development/demonstration deadline. Exact cutoff time and any separate pitch deadline remain open. |
| D-07 | What is the team capacity? | **Four people:** one frontend, one DevOps, one AI/ML plus backup backend, and one primary backend. Working hours and specific task handoffs remain open. |
| D-08 | Which backend task feels riskiest personally? | **The primary backend engineer reports low confidence across backend tasks.** This informs the internal learning/support plan. The pitch presents integration and delivery risk collectively, in the team's voice, without attributing personal statements to one member. |
| D-09 | Can the AI/ML and backup backend teammate help with foundations and own AI integration? | **They can help with backend foundations and own AI integration.** Plan early pairing on authentication, database access, and the first CRUD endpoint. Availability and provisioning details still need agreement. |
| D-10 | Who is the first-release audience? | **College students and fresh graduates seeking entry-level jobs.** Use entry-level expectations and examples grounded in coursework, projects, internships, and other relevant experience. |
| D-11 | Whose voice should the pitch use? | **Use the team's voice.** Write commitments as “we,” “our,” or “the team”; describe risks and mitigation at the project level. Do not write as the individual backend engineer or quote personal admissions in the pitch. |

The newer D-03 answer supersedes the root README's older note that authorization blocks the Gemini live check. The API key itself is neither requested nor recorded. Testing a key does not establish structured extraction, budget availability, or a deployed end-to-end analysis flow.

## 2. Active interview questions

**Next interview focus:** confirm English-language readable PDF/DOCX input and typed interviews, excluding scanned/encrypted documents and voice features. These boundaries are proposed in the draft but not yet confirmed by the owner.

Earlier scope, deadline-date, team-role, personal-risk, and backend-support questions are answered in D-05 through D-09. Do not ask for those decisions again. Follow up only on the remaining specifics, such as exact cutoff time, a separate pitch deadline, teammate availability, and task ownership.

Continue with the questions below in order of the decisions they unblock. Record explicit answers and update the pitch/design together. Do not turn an unanswered question into a confirmed commitment.

## 3. Next questions to pressure-test feasibility

| Priority / ID | Question to ask | Why the answer matters | Proposed default, not yet confirmed |
| --- | --- | --- | --- |
| High / Q-04 | With college students/fresh graduates confirmed, which anonymized resume and entry-level job examples can the team use for evaluation? | Grounds extraction fields, interview difficulty, and a meaningful demo in the actual audience. | Coursework/projects/internships and entry-level roles; representative samples still needed. |
| High / Q-05 | The AI/ML teammate can own Gemini integration. Who specifically owns quota/billing and injecting the key into Railway, and which model has passed a structured-output request? | The backend depends on provisioned access and a predictable response contract. | Gemini cloud REST with an explicitly tested model; no automatic switch to an arbitrary scoring model. |
| High / Q-06 | Are text-based PDF and DOCX both mandatory? Are scanned or password-protected files expected? | OCR and document complexity may exceed course time. | Text-based PDF/DOCX; reject unreadable/scanned/encrypted files with a helpful explanation. |
| High / Q-07 | Is the team comfortable requiring profile review before analysis? | Prevents extracted facts from being silently accepted and clarifies what the model may use. | Review/confirmation step with validated user corrections. |
| High / Q-08 | Who approves the scoring rubric and what does a score mean to a user? | Numeric scores need explainable arithmetic and realistic claims. | Published practice heuristics; backend-computed totals; no hiring prediction. |
| High / Q-09 | With all three feature areas required, are PDF-only input, a smaller match rubric, and three typed interview questions acceptable fallback reductions? | A fallback must preserve the qualifying AI category and the confirmed full feature scope. | Reduce breadth and depth; keep analysis, matching, interviews, real AI, CRUD, and validation. |
| Medium / Q-10 | What are the demo user volume, file/storage allowance, daily AI-call limit, and budget? Who monitors it? | Determines limits and synchronous versus worker execution. | Small classroom demo; explicit per-user usage caps and bounded retries. No budget amount assumed. |
| Medium / Q-11 | Should deleting a job also delete interviews based on it? | Existing SQL cascades remove those sessions and answers. | Explain current cascade in the UI unless the team explicitly chooses a migration to preserve history. |
| Medium / Q-12 | How long are resumes, derived snapshots, and answers retained? Should account deletion remove everything immediately? | Private files and SQL cascades require coordinated cleanup. | Private access and explicit deletion; retention period still undecided. |
| Medium / Q-13 | With all four roles known and backup support confirmed, who applies migrations, configures Auth/storage, provisions credentials, and reviews QA? How many hours can each person commit? | Role counts alone do not establish working availability or detailed handoffs. | Primary backend pairs with AI/ML on foundations; confirm DevOps/AI credential and deployment responsibilities. |
| Medium / Q-14 | Are five typed questions and one answer attempt per question sufficient? Must the interview adapt after every answer? | Adaptive interviews, speech, and attempt history require additional design and persistence. | Fixed generated question set per session; five typed answers; one evaluated attempt per question. |
| Medium / Q-15 | How will the team export and submit the one final PDF/Word document, and who reviews it? | Markdown is the requested working format, while the course accepts a single document. | Export the self-contained pitch after open decisions are resolved. |

## 4. Assumptions used in the draft

These make the proposal concrete without representing owner approval:

- Audience is confirmed as college students and fresh graduates seeking entry-level jobs; sample resumes/jobs still need selection.
- Initial language: English. No speech, video, OCR, scraping, or external agent actions.
- Private Supabase Storage, backend-owned PostgreSQL CRUD, and Auth token verification in Node.
- A user reviews the extracted profile before scoring.
- Maximum file size: 10 MiB, already constrained by SQL. Page/text/AI limits in the design are proposed.
- A short interview has five typed questions; matching and interviews are required, while the question count and reduced fallback details remain proposed.
- Rubric weights, source snapshots, idempotency fields, cleanup tasks, and the structured profile table are proposed requirements, not implemented features.
- Delivery targets are proposed within the confirmed October 21–November 17 window and four-role team. They are not completed milestones or guarantees of availability. The separate preliminary-pitch deadline and exact final cutoff time remain open.

## 5. Risks and decision consequences

| Risk | Evidence / consequence | Mitigation / evidence needed |
| --- | --- | --- |
| Architecture drift | SQL assumes Laravel while Node runs; credentials/profile design do not agree. | Node + Supabase Auth confirmed. Write a compatible follow-up migration and update old commentary. |
| False readiness | Status indicators and a provider ping can be mistaken for full product integration. | Keep implemented/proposed states visible; demonstrate real owned CRUD and a persisted structured AI result. |
| Parsing and grounding | No parsers, structured-output validation, or profile table exist yet. | Early representative-file feasibility exercise; bounded parser inputs; user review; evidence checks. |
| Backend learning and schedule | The primary backend engineer reports low confidence across backend tasks. Four team roles and a November 17 deadline are confirmed, but working hours are not. | Pair with confirmed backup support; build one working endpoint at a time; use dated gates and reduce feature depth while preserving all required feature areas. |
| Provider dependency | Owner reports a tested key, and the AI/ML teammate can own AI integration; credential provisioning and quota responsibility are not yet specific. | Confirm provisioning/monitoring handoffs; verify the selected model/schema and deployment settings without exposing keys. |
| Mutable sources | Stored feedback can become misleading if profile/job content changes. | Immutable file records, explicit profile revisions, frozen run context, and new job records once referenced. |
| Storage deletion | SQL cascades do not remove files; Auth deletion can erase metadata needed for cleanup. | Durable cleanup metadata and a coordinated delete/account lifecycle. |
| Score credibility | SQL accepts numbers but does not define how to judge a resume or answer. | Approve/version a transparent rubric and inspect representative outputs; present uncertainty. |

## 6. Submission readiness

The personal risk answer, deadline date, team-role counts, full feature commitment, backup backend support, and initial audience are recorded. Before calling the pitch final, resolve the input/interaction limits, exact submission timing, available hours, provider provisioning, parser/model choices, and scoring/fallback details. Review the proposed [backend delivery plan](05-backend-delivery-plan.md) with the team. Keep the one-paragraph summary under half a page in the exported layout. Verify the six required pitch sections and seven-requirement appendix remain self-contained in [01-project-pitch.md](01-project-pitch.md). The technical design and database reference remain supporting documentation.

This interview has started and remains open. Its incomplete answers are visible rather than filled in as personal statements or technical accomplishments.
