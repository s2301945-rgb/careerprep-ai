-- Sprint 3: persist extracted resume profiles and validated, explainable AI analyses.
BEGIN;

CREATE TABLE IF NOT EXISTS careerprep.resume_profiles (
    resume_id       BIGINT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    summary         TEXT NOT NULL,
    skills          JSONB NOT NULL DEFAULT '[]'::JSONB,
    education       JSONB NOT NULL DEFAULT '[]'::JSONB,
    projects        JSONB NOT NULL DEFAULT '[]'::JSONB,
    experience      JSONB NOT NULL DEFAULT '[]'::JSONB,
    schema_version  VARCHAR(80) NOT NULL,
    profile_revision INTEGER NOT NULL DEFAULT 1,
    review_status   VARCHAR(20) NOT NULL DEFAULT 'draft',
    confirmed_at    TIMESTAMPTZ,
    model_provider  VARCHAR(80),
    model_name      VARCHAR(120),
    prompt_version  VARCHAR(80),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_resume_profiles_owned_resume FOREIGN KEY (resume_id, user_id)
        REFERENCES careerprep.resumes (id, user_id) ON DELETE CASCADE,
    CONSTRAINT ck_resume_profiles_skills CHECK (JSONB_TYPEOF(skills) = 'array'),
    CONSTRAINT ck_resume_profiles_education CHECK (JSONB_TYPEOF(education) = 'array'),
    CONSTRAINT ck_resume_profiles_projects CHECK (JSONB_TYPEOF(projects) = 'array'),
    CONSTRAINT ck_resume_profiles_experience CHECK (JSONB_TYPEOF(experience) = 'array'),
    CONSTRAINT ck_resume_profiles_version CHECK (LENGTH(BTRIM(schema_version)) > 0),
    CONSTRAINT ck_resume_profiles_revision CHECK (profile_revision > 0),
    CONSTRAINT ck_resume_profiles_review CHECK (review_status IN ('draft', 'confirmed')),
    CONSTRAINT ck_resume_profiles_confirmation CHECK (
        (review_status = 'confirmed' AND confirmed_at IS NOT NULL)
        OR (review_status = 'draft' AND confirmed_at IS NULL)
    )
);

DROP TRIGGER IF EXISTS trg_resume_profiles_touch ON careerprep.resume_profiles;
CREATE TRIGGER trg_resume_profiles_touch BEFORE UPDATE ON careerprep.resume_profiles
    FOR EACH ROW EXECUTE FUNCTION careerprep.touch_updated_at();

ALTER TABLE careerprep.resume_analyses
    ADD COLUMN IF NOT EXISTS rubric_scores JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS source_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'careerprep.resume_analyses'::regclass
          AND conname = 'ck_resume_analyses_rubric_scores'
    ) THEN
        ALTER TABLE careerprep.resume_analyses
            ADD CONSTRAINT ck_resume_analyses_rubric_scores
            CHECK (JSONB_TYPEOF(rubric_scores) = 'object');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'careerprep.resume_analyses'::regclass
          AND conname = 'ck_resume_analyses_source_snapshot'
    ) THEN
        ALTER TABLE careerprep.resume_analyses
            ADD CONSTRAINT ck_resume_analyses_source_snapshot
            CHECK (JSONB_TYPEOF(source_snapshot) = 'object');
    END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON careerprep.resume_profiles TO careerprep_api;
GRANT SELECT, INSERT, UPDATE ON careerprep.resume_analyses TO careerprep_api;
GRANT USAGE, SELECT ON SEQUENCE careerprep.resume_analyses_id_seq TO careerprep_api;

COMMIT;
