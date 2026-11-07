BEGIN;

ALTER TABLE careerprep.job_matches
    ADD COLUMN IF NOT EXISTS requirement_assessments JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE careerprep.job_matches
    ADD COLUMN IF NOT EXISTS profile_revision INTEGER;

ALTER TABLE careerprep.job_matches
    ADD CONSTRAINT ck_job_matches_requirements_array
    CHECK (JSONB_TYPEOF(requirement_assessments) = 'array');

GRANT SELECT, INSERT ON careerprep.job_descriptions TO careerprep_api;
GRANT SELECT, INSERT, UPDATE ON careerprep.job_matches TO careerprep_api;
GRANT USAGE, SELECT ON SEQUENCE careerprep.job_descriptions_id_seq TO careerprep_api;
GRANT USAGE, SELECT ON SEQUENCE careerprep.job_matches_id_seq TO careerprep_api;

COMMIT;
