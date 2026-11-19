# Final presentation and project defense

> Official instructions supplied by the project owner, captured on November 20, 2026 (Asia/Manila). The publication date was not supplied. The wording below is preserved from the supplied text attachment.
>
> These final-defense instructions supersede the earlier endterm document where final-presentation rules differ, including the November 27 code freeze and the pre-recorded Deployment Challenge. The original product and sprint requirements remain available in [the endterm instructions](00-official-course-instructions.md).

---

CSP221A | Final Presentation and Project Defense
Official website and resources: https://csp221a.vercel.app/Links to an external site.

1. General Instructions
The final presentation serves as your team's official Demo Day. Each group is expected to present a complete, functional, and deployed AI-integrated application and demonstrate its technical capabilities, development process, and readiness for production.

All members must wear decent, presentable, and appropriate attire.
All presentations, demonstrations, and answers during the Q&A must be delivered in English.
All members are expected to attend, participate, and understand the entire project.
Groups must begin preparing once the group before them starts presenting. Prepare without disrupting the ongoing presentation.
A maximum of 3 minutes of preparation time will be given after the previous group finishes.
The official presentation schedule and order of groups will be announced on November 27, 2026.
The system demonstration must be conducted live using the production deployment. Pre-recorded system demonstrations are strictly prohibited. The pre-recorded Deployment Challenge is the only exception.
No documentation, no presentation.


2. Important Dates and Penalties
Item	Details
Code freeze & Documentation Submission 	November 27, 2026, at 11:59 PM (Philippine time)
Schedule announcement	November 27, 2026
Late commits	−5 to −15 points, depending on the significance and impact of the commit
Presentation overtime	−5 points for every minute exceeding the allocated reporting time
Preparation time	Maximum of 3 minutes
Missing documentation	Group will not be allowed to present
All final deliverables, including documentation, source code, repository links, production URLs, and the pre-recorded Deployment Challenge, must be completed and submitted before the code freeze.

The production application must correspond to the final tagged release. Repository history must remain intact. Groups must not manipulate commit timestamps or history to avoid penalties. Complete the changes needed for your recorded Deployment Challenge before code freeze.



3. Presentation Format
Each group will be given a total of 30 minutes, excluding preparation time.

Segment	Suggested duration
Problem and product overview	3 minutes
System architecture	4 minutes
Live system demonstration	6 minutes
AI and LLM implementation	3 minutes
DevOps and engineering process	4 minutes
Total reporting time	20 minutes
Panel Q&A	10 minutes
Total session	30 minutes
Groups may rearrange the presentation segments as long as all required components are covered within the allocated reporting time. The Deployment Challenge recording must be available for the panel to review separately; groups are not required to play the entire recording during their presentation. Be ready to show relevant portions if requested.



4. Suggested Presentation Content
A. Problem and Product Overview
Project name and objectives.
Problem being addressed.
Target users and intended use cases.
Proposed solution and its value.
Significant changes from the originally approved project pitch, if applicable.
B. System Architecture and Technical Implementation
Complete system architecture diagram.
Frontend, backend, database, and AI technologies used.
Database schema with at least two related tables or collections and an explanation of their relationships.
API architecture (REST or GraphQL) and communication between system components.
Frontend, backend, and database hosting platforms.
Justification of selected technologies and architectural decisions, including relevant trade-offs.
Demonstration that the backend owns the database and AI logic; the frontend must not directly call the database or LLM provider.
C. Live System Demonstration
Groups must demonstrate their actual working system using the production deployment.

Complete walkthrough of the system's main features through a realistic user journey.
Full CRUD (create, read, update, and delete) operations using a persistent database.
Functionality of related database tables or collections.
Frontend and backend integration.
Actual AI-powered features and their outputs.
Loading states, empty states, error handling, and input validation.
System behavior during failed requests or unexpected inputs.
Screenshots, mockups, localhost-only demonstrations, and video recordings will not be accepted as substitutes for the live production system walkthrough.

D. AI and LLM Implementation
AI model or provider used and justification.
AI workflow and integration with the backend.
Prompt engineering, RAG, tool calling, structured outputs, or agentic workflows, where applicable.
Explanation of the meaningful work performed by the AI feature. A simple pass-through chatbot is insufficient.
Backend processing of AI-generated outputs, such as validation, transformation, storage, or triggering another action.
AI evaluation methodology, test cases, and actual evaluation results.
Automated tests and mocked LLM calls.
Handling of AI failures, timeouts, and invalid responses.
Known limitations of the AI implementation.
E. DevOps and Engineering Process
This section must be primarily presented by the designated DevOps Engineer.

Complete CI/CD pipeline walkthrough, including its stages and triggers.
Git branching strategy and pull request workflow.
Branch protection rules, required reviews, and automated quality gates.
Automated testing, security checks, and build processes.
Production and staging or preview environments, where applicable.
Frontend, backend, and database hosting dashboards and relevant logs.
Environment variables and secrets management without revealing sensitive values.
Pipeline performance metrics and trends across the four sprints.
Before-and-after results of pipeline optimizations.
Deployment, health verification, and rollback procedures.
Sprint history, project board, and incident reports.
Availability of the submitted pre-recorded Deployment Challenge as evidence of an end-to-end CI/CD workflow.


5. Pre-Recorded Deployment Challenge
Unlike the actual system demonstration, the Deployment Challenge must be pre-recorded before Demo Day. The purpose of the recording is to verify that the group's entire CI/CD workflow functions correctly, from code changes to production deployment.

Video Recording Requirements
The video must be a continuous, uninterrupted screen recording from beginning to end.
No cuts, edits, transitions, speed adjustments, pauses in the recording, or skipped sections are allowed.
The entire deployment process, including waiting for the pipeline to finish, must be visible.
The DevOps Engineer must narrate and explain the process in English.
Pipeline stages, execution times, and relevant logs must be clearly visible.
Manual deployments or bypassing established repository policies are prohibited.
Sensitive information, including API keys and passwords, must not be exposed. Prepare the recording environment accordingly.
Required Demonstration
The recording must show the following steps in sequence:

Make a small, visible modification to the application, such as changing text on a page.
Commit and push the changes to a development branch.
Create a pull request.
Demonstrate the required code review and approval process.
Show automated tests, quality checks, and build processes, as applicable to the pipeline.
Merge the changes into the main branch once the required checks and approvals have passed.
Show the automatically triggered CI/CD deployment process and its logs.
Verify that the modification is reflected in the production application.
Do not skip waiting periods, failed checks, or other parts of the workflow. The recording must provide clear evidence that the change reached production through the established automated pipeline.

Submission and Evaluation
The recording must be completed and submitted before November 27, 2026, at 11:59 PM.
The video must be accessible to the panel through a link in the project repository's README.
The panel may ask the DevOps Engineer to explain any part of the recorded workflow during the Q&A.
Evidence of editing, skipped steps, or bypassed quality checks may invalidate the submission.
The challenge is worth 5 points in the final presentation rubric and also contributes evidence toward the DevOps Engineer's individual CI/CD grade.
Important: This is the only pre-recorded demonstration permitted. The actual system walkthrough, CRUD operations, AI features, and technical defense must still be conducted live during Demo Day.



6. Panel Question and Answer Session
Each group will undergo a 10-minute technical defense following its presentation.

The panel Q&A will be graded as a group. There will be no separate individual Q&A scores. However, the panel may direct questions to any member. Everyone must understand the system beyond their assigned responsibilities.

Potential questions and challenges may involve:

Explaining specific sections of the source code.
Defending architectural and technology choices.
Explaining database relationships and API endpoints.
Simulating an AI provider failure or malformed AI output.
Demonstrating automated tests and evaluation results.
Sending malformed requests to the backend.
Explaining security measures, secrets management, and repository policies.
Explaining the recorded deployment workflow.
Performing a production rollback.
Justifying AI implementation and evaluation methods.
The separate individual Developer Contribution and DevOps grades remain in effect, as specified in the original project guidelines. The Q&A itself carries a shared team score.

7. Required Final Deliverables
All deliverables must be available in the project repository or accessible through the repository's README. Submit the repository link and production URL before code freeze.

Product Deliverables
Complete frontend and backend source code
Production deployment URL
Tagged final release (e.g., v1.0.0)
Database schema and migrations
Complete .env.example file listing required variables without actual secrets
Seed data or setup script
Technical Documentation (Format will be posted on Nov. 20, 2026)
Project README and setup instructions
System architecture diagram
Database schema diagram or ERD
API documentation
AI implementation documentation, including approach, prompts or tools, backend output processing, and limitations
AI testing and evaluation results
Release changelog
Team roles and responsibilities
DevOps
CI/CD configuration files
Pipeline documentation (e.g., PIPELINE.md) and pipeline diagram
Completed pipeline metrics log
Pipeline optimization report with before-and-after results
Deployment and rollback runbook
Incident logs and postmortems
Presentation Materials
Final presentation slide deck
Working demonstration accounts and test data, where applicable
Method for simulating AI provider failures
Continuous, unedited screen recording of the Deployment Challenge, linked in the README
Incomplete or missing required documentation must be addressed before the group can present.



8. Final Presentation Grading Rubric
Criteria	Points
Problem and product clarity	10
Live demonstration, CRUD, and data	15
AI feature depth	20
Architecture and API design	10
Error handling and resilience	10
Security and secrets management	5
Engineering process	10
Recorded Deployment Challenge	5
Presentation delivery and panel Q&A	15
Total	100
The final presentation accounts for 40% of the overall final project grade. The remaining components are weekly consultations (30%) and the individual Developer Contribution or CI/CD Workflow score (30%). Applicable deductions are applied to the final presentation score.



9. Panel Members and Judges
Panel Members	Judges
Mary Jade Jakosalem	Janpol Hidalgo
Mitchel Mariano	Carlos Valderrama
Stalingrad Dollosa	Alyssa Magay


10. Additional Reminders
Test your production deployment before your scheduled presentation.
Prepare all necessary accounts, credentials, browser tabs, and development tools beforehand.
Ensure that the panel can access your repository, documentation, production application, and Deployment Challenge recording.
Wake up any inactive or sleeping hosting services before presenting.
Never expose actual API keys, passwords, or other sensitive credentials during the presentation.
Prepare sufficient test data to demonstrate all major features.
Rehearse your presentation to ensure that it fits within the allocated time.
Be honest about system limitations, bugs, and incomplete features.
All members must be able to explain the code, including code generated using AI coding assistants.
Avoid spending too much time on introductory slides. Prioritize the working system, technical implementation, and evidence of your engineering process.
If production fails during the presentation, be prepared to diagnose the problem or roll back to the last working release.
Your objective is to prove that your team can build, test, deploy, maintain, and confidently defend a functional AI-integrated software product.