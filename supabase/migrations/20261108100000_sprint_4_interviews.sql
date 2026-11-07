BEGIN;

ALTER TABLE careerprep.interview_sessions
    ADD COLUMN IF NOT EXISTS source_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE careerprep.interview_questions
    ADD COLUMN IF NOT EXISTS context_quote TEXT NOT NULL DEFAULT '';

GRANT SELECT, INSERT, UPDATE ON careerprep.interview_sessions TO careerprep_api;
GRANT SELECT, INSERT ON careerprep.interview_questions TO careerprep_api;
GRANT SELECT, INSERT, UPDATE ON careerprep.interview_answers TO careerprep_api;
GRANT USAGE, SELECT ON SEQUENCE careerprep.interview_sessions_id_seq TO careerprep_api;
GRANT USAGE, SELECT ON SEQUENCE careerprep.interview_questions_id_seq TO careerprep_api;
GRANT USAGE, SELECT ON SEQUENCE careerprep.interview_answers_id_seq TO careerprep_api;

COMMIT;
