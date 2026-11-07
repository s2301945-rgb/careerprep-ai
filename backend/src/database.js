import fs from "node:fs";
import pg from "pg";
import { ApiError } from "./errors.js";

const { Pool } = pg;

export function createPool({
  connectionString,
  sslCaPath,
  applicationName = "careerprep-api",
  environment = "development",
  roleName,
}) {
  if (!connectionString) {
    throw new Error("A PostgreSQL connection string is required.");
  }

  const parsedUrl = new URL(connectionString);
  const host = parsedUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(host);
  const requestedSslMode = parsedUrl.searchParams.get("sslmode")?.toLowerCase();
  const sslRootCert = parsedUrl.searchParams.get("sslrootcert") ?? sslCaPath;
  if (requestedSslMode === "disable" && (!isLoopback || environment === "production")) {
    throw new Error("Unencrypted PostgreSQL is allowed only on loopback outside production.");
  }

  // node-postgres parses sslmode from the URI and that can weaken an explicit
  // `rejectUnauthorized` setting. Remove URI TLS options and construct the TLS
  // configuration ourselves so remote connections always verify certificates.
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) parsedUrl.searchParams.delete(key);
  const useLocalPlaintext = isLoopback
    && environment !== "production"
    && (requestedSslMode === "disable" || !requestedSslMode);
  const ssl = useLocalPlaintext
    ? false
    : {
      rejectUnauthorized: true,
      ...(sslRootCert ? { ca: fs.readFileSync(sslRootCert, "utf8") } : {}),
    };

  if (roleName && !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(roleName)) {
    throw new Error("A valid PostgreSQL role name is required.");
  }

  return new Pool({
    connectionString: parsedUrl.toString(),
    ssl,
    ...(roleName ? { options: `-c role=${roleName}` } : {}),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    application_name: applicationName,
  });
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapUser(row) {
  return { id: String(row.id), email: row.email, name: row.name };
}

function mapResume(row) {
  return {
    id: String(row.id),
    display_title: row.display_title,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    file_size_bytes: String(row.file_size_bytes),
    extraction_status: row.extraction_status,
    extraction_error: row.extraction_error,
    extracted_at: row.extracted_at ? iso(row.extracted_at) : null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function mapProfile(row) {
  return {
    resume_id: String(row.resume_id),
    summary: row.summary,
    skills: row.skills,
    education: row.education,
    projects: row.projects,
    experience: row.experience,
    schema_version: row.schema_version,
    profile_revision: Number(row.profile_revision),
    review_status: row.review_status,
    confirmed_at: row.confirmed_at ? iso(row.confirmed_at) : null,
    model_provider: row.model_provider,
    model_name: row.model_name,
    prompt_version: row.prompt_version,
    updated_at: iso(row.updated_at),
  };
}

function mapAnalysis(row) {
  return {
    id: String(row.id),
    status: row.status,
    overall_score: row.overall_score === null ? null : Number(row.overall_score),
    summary: row.summary,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    missing_sections: row.missing_sections,
    recommendations: row.recommendations,
    rubric_scores: row.rubric_scores,
    rubric_version: row.rubric_version,
    model_provider: row.model_provider,
    model_name: row.model_name,
    prompt_version: row.prompt_version,
    created_at: iso(row.created_at),
    completed_at: row.completed_at ? iso(row.completed_at) : null,
  };
}

const RESUME_COLUMNS = `
  id::text AS id,
  display_title,
  original_filename,
  mime_type,
  file_size_bytes::text AS file_size_bytes,
  extraction_status,
  extraction_error,
  extracted_at,
  created_at,
  updated_at
`;

export function createRepository(pool) {
  async function getUser(authUserId) {
    const result = await pool.query(
      `SELECT id::text AS id, email, name
       FROM careerprep.users
       WHERE auth_user_id = $1`,
      [authUserId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async function queryCleanupForResume(ownerUserId, resumeId) {
    const result = await pool.query(
      `SELECT id::text AS id, owner_user_id::text AS owner_user_id,
              resume_id::text AS resume_id, storage_disk, storage_path, status,
              attempt_count::text AS attempt_count
       FROM careerprep.storage_cleanup_tasks
       WHERE owner_user_id = $1 AND resume_id = $2
       ORDER BY requested_at DESC, id DESC
       LIMIT 1`,
      [ownerUserId, resumeId],
    );
    return result.rows[0] ?? null;
  }

  return {
    async resolveUser(identity) {
      const existing = await getUser(identity.id);
      if (existing) return existing;
      if (!identity.email) {
        throw new ApiError(422, "IDENTITY_EMAIL_REQUIRED", "This sign-in method needs an email address before it can create a profile.");
      }

      try {
        const inserted = await pool.query(
          `INSERT INTO careerprep.users (name, email, auth_user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (auth_user_id) DO NOTHING
           RETURNING id::text AS id, email, name`,
          [identity.name || identity.email.split("@", 1)[0] || "User", identity.email, identity.id],
        );
        if (inserted.rows[0]) return mapUser(inserted.rows[0]);
      } catch (error) {
        if (error?.code === "23505") {
          throw new ApiError(
            409,
            "ACCOUNT_LINK_REQUIRED",
            "A profile with this email already exists and needs an explicit account-linking step.",
          );
        }
        throw error;
      }

      const afterInsert = await getUser(identity.id);
      if (!afterInsert) throw new Error("The authenticated application profile could not be resolved.");
      return afterInsert;
    },

    async listResumes(ownerUserId, { limit, cursor }) {
      const params = [ownerUserId];
      let cursorClause = "";
      if (cursor) {
        params.push(cursor.createdAt, cursor.id);
        cursorClause = `AND (created_at, id) < ($2::timestamptz, $3::bigint)`;
      }
      params.push(limit + 1);
      const limitParameter = `$${params.length}`;
      const result = await pool.query(
        `SELECT ${RESUME_COLUMNS},
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
         FROM careerprep.resumes
         WHERE user_id = $1 ${cursorClause}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limitParameter}`,
        params,
      );
      const visibleRows = result.rows.slice(0, limit);
      return {
        rows: visibleRows.map(mapResume),
        hasMore: result.rows.length > limit,
        lastCreatedAt: visibleRows.at(-1)?.cursor_created_at ?? null,
      };
    },

    async findResume(ownerUserId, resumeId) {
      const result = await pool.query(
        `SELECT ${RESUME_COLUMNS}
         FROM careerprep.resumes
         WHERE user_id = $1 AND id = $2`,
        [ownerUserId, resumeId],
      );
      return result.rows[0] ? mapResume(result.rows[0]) : null;
    },

    async findResumeFile(ownerUserId, resumeId) {
      const result = await pool.query(
        `SELECT ${RESUME_COLUMNS}, storage_disk, storage_path
         FROM careerprep.resumes
         WHERE user_id = $1 AND id = $2`,
        [ownerUserId, resumeId],
      );
      if (!result.rows[0]) return null;
      return { ...mapResume(result.rows[0]), storage_disk: result.rows[0].storage_disk, storage_path: result.rows[0].storage_path };
    },

    async createResume(ownerUserId, resume) {
      const result = await pool.query(
        `INSERT INTO careerprep.resumes (
           user_id, display_title, original_filename, storage_disk, storage_path,
           mime_type, file_size_bytes, extraction_status
         ) VALUES ($1, $2, $3, 'supabase', $4, $5, $6, 'pending')
         RETURNING ${RESUME_COLUMNS}`,
        [
          ownerUserId,
          resume.displayTitle,
          resume.originalFilename,
          resume.storagePath,
          resume.mimeType,
          resume.fileSizeBytes,
        ],
      );
      return mapResume(result.rows[0]);
    },

    async renameResume(ownerUserId, resumeId, displayTitle) {
      const result = await pool.query(
        `UPDATE careerprep.resumes
         SET display_title = $3
         WHERE user_id = $1 AND id = $2
         RETURNING ${RESUME_COLUMNS}`,
        [ownerUserId, resumeId, displayTitle],
      );
      return result.rows[0] ? mapResume(result.rows[0]) : null;
    },

    async saveExtractedProfile(ownerUserId, resumeId, { sourceText, profile, schemaVersion, provider, model, promptVersion }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const resumeResult = await client.query(
          `UPDATE careerprep.resumes
           SET extracted_text = $3, extraction_status = 'completed', extraction_error = NULL, extracted_at = NOW()
           WHERE user_id = $1 AND id = $2
           RETURNING id::text AS id`,
          [ownerUserId, resumeId, sourceText],
        );
        if (!resumeResult.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        const result = await client.query(
          `INSERT INTO careerprep.resume_profiles (
             resume_id, user_id, summary, skills, education, experience, projects, schema_version,
             profile_revision, review_status, confirmed_at, model_provider, model_name, prompt_version
           ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, 1, 'draft', NULL, $9, $10, $11)
           ON CONFLICT (resume_id) DO UPDATE SET
             user_id = EXCLUDED.user_id, summary = EXCLUDED.summary,
             skills = EXCLUDED.skills, education = EXCLUDED.education, experience = EXCLUDED.experience,
             projects = EXCLUDED.projects,
             schema_version = EXCLUDED.schema_version,
             profile_revision = careerprep.resume_profiles.profile_revision + 1,
             review_status = 'draft', confirmed_at = NULL,
             model_provider = EXCLUDED.model_provider, model_name = EXCLUDED.model_name,
             prompt_version = EXCLUDED.prompt_version
           RETURNING resume_id::text AS resume_id, summary, skills, education, experience, projects,
                     schema_version, profile_revision, review_status, confirmed_at,
                     model_provider, model_name, prompt_version, updated_at`,
          [resumeId, ownerUserId, profile.summary, JSON.stringify(profile.skills), JSON.stringify(profile.education),
            JSON.stringify(profile.experience), JSON.stringify(profile.projects), schemaVersion, provider, model, promptVersion],
        );
        await client.query("COMMIT");
        return mapProfile(result.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async storeResumeText(ownerUserId, resumeId, sourceText) {
      const result = await pool.query(
        `UPDATE careerprep.resumes
         SET extracted_text = $3, extraction_status = 'completed', extraction_error = NULL, extracted_at = NOW()
         WHERE user_id = $1 AND id = $2
         RETURNING id::text AS id`,
        [ownerUserId, resumeId, sourceText],
      );
      return Boolean(result.rows[0]);
    },

    async failResumeExtraction(ownerUserId, resumeId, errorCode) {
      const result = await pool.query(
        `UPDATE careerprep.resumes
         SET extraction_status = 'failed', extraction_error = $3, extracted_at = NULL
         WHERE user_id = $1 AND id = $2
         RETURNING id::text AS id`,
        [ownerUserId, resumeId, errorCode],
      );
      return Boolean(result.rows[0]);
    },

    async getResumeProfile(ownerUserId, resumeId) {
      const result = await pool.query(
        `SELECT resume_id::text AS resume_id, summary, skills, education, experience, projects,
                schema_version, profile_revision, review_status, confirmed_at,
                model_provider, model_name, prompt_version, updated_at
         FROM careerprep.resume_profiles WHERE user_id = $1 AND resume_id = $2`,
        [ownerUserId, resumeId],
      );
      return result.rows[0] ? mapProfile(result.rows[0]) : null;
    },

    async confirmResumeProfile(ownerUserId, resumeId, profile) {
      const result = await pool.query(
        `UPDATE careerprep.resume_profiles SET
           profile_revision = profile_revision + CASE
             WHEN summary IS DISTINCT FROM $3
               OR skills IS DISTINCT FROM $4::jsonb
               OR education IS DISTINCT FROM $5::jsonb
               OR experience IS DISTINCT FROM $6::jsonb
               OR projects IS DISTINCT FROM $7::jsonb THEN 1 ELSE 0 END,
           summary = $3, skills = $4::jsonb, education = $5::jsonb, experience = $6::jsonb,
           projects = $7::jsonb,
           review_status = 'confirmed', confirmed_at = NOW()
         WHERE user_id = $1 AND resume_id = $2
         RETURNING resume_id::text AS resume_id, summary, skills, education, experience, projects,
                   schema_version, profile_revision, review_status, confirmed_at,
                   model_provider, model_name, prompt_version, updated_at`,
        [ownerUserId, resumeId, profile.summary, JSON.stringify(profile.skills),
          JSON.stringify(profile.education), JSON.stringify(profile.experience), JSON.stringify(profile.projects)],
      );
      return result.rows[0] ? mapProfile(result.rows[0]) : null;
    },

    async getConfirmedResumeContext(ownerUserId, resumeId) {
      const result = await pool.query(
        `SELECT r.extracted_text,
                p.resume_id::text AS resume_id, p.summary, p.skills, p.education, p.experience, p.projects,
                p.schema_version, p.profile_revision, p.review_status, p.confirmed_at,
                p.model_provider, p.model_name, p.prompt_version, p.updated_at
         FROM careerprep.resumes r
         JOIN careerprep.resume_profiles p ON p.resume_id = r.id AND p.user_id = r.user_id
         WHERE r.user_id = $1 AND r.id = $2`,
        [ownerUserId, resumeId],
      );
      const row = result.rows[0];
      return row ? { sourceText: row.extracted_text, profile: mapProfile(row) } : null;
    },

    async createResumeAnalysisRun(ownerUserId, resumeId, snapshot) {
      const result = await pool.query(
        `INSERT INTO careerprep.resume_analyses (user_id, resume_id, status, source_snapshot)
         SELECT $1, r.id, 'processing', $3::jsonb
         FROM careerprep.resumes r
         JOIN careerprep.resume_profiles p ON p.resume_id = r.id AND p.user_id = r.user_id
         WHERE r.user_id = $1 AND r.id = $2 AND p.review_status = 'confirmed'
         RETURNING id::text AS id`,
        [ownerUserId, resumeId, JSON.stringify(snapshot)],
      );
      return result.rows[0]?.id ?? null;
    },

    async completeResumeAnalysis(ownerUserId, resumeId, analysisId, { result, provider, model, promptVersion, rubricVersion }) {
      const scores = { ...result.rubric_scores, skill_assessments: result.skill_assessments };
      const updated = await pool.query(
        `UPDATE careerprep.resume_analyses SET status = 'completed', overall_score = $4,
           summary = $5, strengths = $6::jsonb, weaknesses = $7::jsonb,
           missing_sections = $8::jsonb, recommendations = $9::jsonb,
           rubric_scores = $10::jsonb, rubric_version = $11,
           model_provider = $12, model_name = $13, prompt_version = $14,
           error_code = NULL, completed_at = NOW()
         WHERE user_id = $1 AND resume_id = $2 AND id = $3 AND status = 'processing'
         RETURNING id::text AS id, status, overall_score::text AS overall_score, summary,
                   strengths, weaknesses, missing_sections, recommendations, rubric_scores,
                   rubric_version, model_provider, model_name, prompt_version, created_at, completed_at`,
        [ownerUserId, resumeId, analysisId, result.overall_score, result.summary,
          JSON.stringify(result.strengths), JSON.stringify(result.weaknesses),
          JSON.stringify(result.missing_sections), JSON.stringify(result.recommendations),
          JSON.stringify(scores), rubricVersion, provider, model, promptVersion],
      );
      return updated.rows[0] ? mapAnalysis(updated.rows[0]) : null;
    },

    async failResumeAnalysis(ownerUserId, resumeId, analysisId, errorCode) {
      await pool.query(
        `UPDATE careerprep.resume_analyses SET status = 'failed', error_code = $4
         WHERE user_id = $1 AND resume_id = $2 AND id = $3 AND status = 'processing'`,
        [ownerUserId, resumeId, analysisId, errorCode],
      );
    },

    async getLatestResumeAnalysis(ownerUserId, resumeId) {
      const result = await pool.query(
        `SELECT id::text AS id, status, overall_score::text AS overall_score, summary,
                strengths, weaknesses, missing_sections, recommendations, rubric_scores,
                rubric_version, model_provider, model_name, prompt_version, created_at, completed_at
         FROM careerprep.resume_analyses WHERE user_id = $1 AND resume_id = $2
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [ownerUserId, resumeId],
      );
      return result.rows[0] ? mapAnalysis(result.rows[0]) : null;
    },

    async armUploadCleanup(ownerUserId, storagePath) {
      const result = await pool.query(
        `INSERT INTO careerprep.storage_cleanup_tasks (
           owner_user_id, storage_disk, storage_path, status,
           next_attempt_at, requested_at
         ) VALUES ($1, 'supabase', $2, 'armed', NOW() + INTERVAL '5 minutes', NOW())
         RETURNING id::text AS id, owner_user_id::text AS owner_user_id,
                   resume_id::text AS resume_id, storage_disk, storage_path, status`,
        [ownerUserId, storagePath],
      );
      return result.rows[0];
    },

    async attachUploadCleanupToResume(taskId, resumeId) {
      await pool.query(
        `UPDATE careerprep.storage_cleanup_tasks
         SET resume_id = $2, status = 'cancelled', next_attempt_at = NOW(),
             lease_expires_at = NULL, last_error_code = NULL
         WHERE id = $1 AND status IN ('armed', 'processing')`,
        [taskId, resumeId],
      );
    },

    async queueUploadCleanup(taskId, errorCode) {
      const result = await pool.query(
        `UPDATE careerprep.storage_cleanup_tasks
         SET status = 'pending', next_attempt_at = NOW(), lease_expires_at = NULL,
             last_error_code = $2
         WHERE id = $1 AND status <> 'completed'
         RETURNING id::text AS id, owner_user_id::text AS owner_user_id,
                   resume_id::text AS resume_id, storage_disk, storage_path, status`,
        [taskId, errorCode],
      );
      return result.rows[0] ?? null;
    },

    async queueResumeDeletion(ownerUserId, resumeId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const resumeResult = await client.query(
          `SELECT id::text AS id, storage_disk, storage_path
           FROM careerprep.resumes
           WHERE user_id = $1 AND id = $2
           FOR UPDATE`,
          [ownerUserId, resumeId],
        );

        if (!resumeResult.rows[0]) {
          await client.query("COMMIT");
          return queryCleanupForResume(ownerUserId, resumeId);
        }

        const resume = resumeResult.rows[0];
        await client.query(
          `INSERT INTO careerprep.storage_cleanup_tasks (
             owner_user_id, resume_id, storage_disk, storage_path, status,
             attempt_count, next_attempt_at, lease_expires_at, last_error_code,
             requested_at, completed_at
           ) VALUES ($1, $2, $3, $4, 'pending', 0, NOW(), NULL, NULL, NOW(), NULL)
           ON CONFLICT (storage_disk, storage_path) DO UPDATE
           SET owner_user_id = EXCLUDED.owner_user_id,
               resume_id = EXCLUDED.resume_id,
               status = CASE
                   WHEN careerprep.storage_cleanup_tasks.status = 'completed' THEN 'completed'
                   ELSE 'pending'
               END,
               next_attempt_at = CASE
                   WHEN careerprep.storage_cleanup_tasks.status = 'completed'
                       THEN careerprep.storage_cleanup_tasks.next_attempt_at
                   ELSE NOW()
               END,
               lease_expires_at = NULL,
               last_error_code = NULL,
               requested_at = NOW(),
               completed_at = CASE
                   WHEN careerprep.storage_cleanup_tasks.status = 'completed'
                       THEN careerprep.storage_cleanup_tasks.completed_at
                   ELSE NULL
               END`,
          [ownerUserId, resumeId, resume.storage_disk, resume.storage_path],
        );
        await client.query(
          `DELETE FROM careerprep.resumes WHERE user_id = $1 AND id = $2`,
          [ownerUserId, resumeId],
        );
        const task = await client.query(
          `SELECT id::text AS id, owner_user_id::text AS owner_user_id,
                  resume_id::text AS resume_id, storage_disk, storage_path, status
           FROM careerprep.storage_cleanup_tasks
           WHERE storage_disk = $1 AND storage_path = $2`,
          [resume.storage_disk, resume.storage_path],
        );
        await client.query("COMMIT");
        return task.rows[0] ?? null;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async getCleanupTask(ownerUserId, resumeId) {
      return queryCleanupForResume(ownerUserId, resumeId);
    },

    async getCleanupTaskById(taskId) {
      const result = await pool.query(
        `SELECT id::text AS id, owner_user_id::text AS owner_user_id,
                resume_id::text AS resume_id, storage_disk, storage_path, status,
                attempt_count::text AS attempt_count
         FROM careerprep.storage_cleanup_tasks
         WHERE id = $1`,
        [taskId],
      );
      return result.rows[0] ?? null;
    },

    async claimCleanupTask(taskId) {
      const result = await pool.query(
        `UPDATE careerprep.storage_cleanup_tasks
         SET status = 'processing', attempt_count = attempt_count + 1,
             lease_expires_at = NOW() + INTERVAL '2 minutes'
         WHERE id = $1
           AND (
             (status IN ('armed', 'pending') AND next_attempt_at <= NOW())
             OR (status = 'processing' AND lease_expires_at < NOW())
           )
         RETURNING id::text AS id, owner_user_id::text AS owner_user_id,
                   resume_id::text AS resume_id, storage_disk, storage_path,
                   attempt_count::text AS attempt_count, status`,
        [taskId],
      );
      return result.rows[0] ?? null;
    },

    async claimDueCleanupTasks(limit = 10) {
      const result = await pool.query(
        `WITH due AS (
           SELECT id
           FROM careerprep.storage_cleanup_tasks
           WHERE ((status IN ('armed', 'pending') AND next_attempt_at <= NOW())
               OR (status = 'processing' AND lease_expires_at < NOW()))
           ORDER BY next_attempt_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE careerprep.storage_cleanup_tasks AS task
         SET status = 'processing', attempt_count = task.attempt_count + 1,
             lease_expires_at = NOW() + INTERVAL '2 minutes'
         FROM due
         WHERE task.id = due.id
         RETURNING task.id::text AS id, task.owner_user_id::text AS owner_user_id,
                   task.resume_id::text AS resume_id, task.storage_disk, task.storage_path,
                   task.attempt_count::text AS attempt_count, task.status`,
        [limit],
      );
      return result.rows;
    },

    async findResumeByStoragePath(storageDisk, storagePath) {
      const result = await pool.query(
        `SELECT id::text AS id
         FROM careerprep.resumes
         WHERE storage_disk = $1 AND storage_path = $2
         LIMIT 1`,
        [storageDisk, storagePath],
      );
      return result.rows[0]?.id ?? null;
    },

    async cancelCleanupTask(taskId, resumeId) {
      await pool.query(
        `UPDATE careerprep.storage_cleanup_tasks
         SET status = 'cancelled', resume_id = COALESCE($2, resume_id),
             lease_expires_at = NULL, completed_at = NULL, last_error_code = NULL
         WHERE id = $1 AND status <> 'completed'`,
        [taskId, resumeId],
      );
    },

    async completeCleanupTask(taskId) {
      await pool.query(
        `UPDATE careerprep.storage_cleanup_tasks
         SET status = 'completed', completed_at = NOW(),
             lease_expires_at = NULL, last_error_code = NULL
         WHERE id = $1`,
        [taskId],
      );
    },

    async failCleanupTask(taskId, errorCode) {
      await pool.query(
        `UPDATE careerprep.storage_cleanup_tasks
         SET status = 'pending',
             next_attempt_at = NOW() + LEAST(
               INTERVAL '1 hour',
               POWER(2, LEAST(attempt_count, 12)) * INTERVAL '1 second'
             ),
             lease_expires_at = NULL,
             last_error_code = $2
         WHERE id = $1 AND status = 'processing'`,
        [taskId, errorCode],
      );
    },

    async pingPrivateSchema() {
      await pool.query(`
        SELECT
          (SELECT auth_user_id FROM careerprep.users LIMIT 0),
          (SELECT display_title FROM careerprep.resumes LIMIT 0),
          (SELECT id FROM careerprep.storage_cleanup_tasks LIMIT 0),
          (SELECT resume_id FROM careerprep.resume_profiles LIMIT 0),
          (SELECT rubric_scores FROM careerprep.resume_analyses LIMIT 0)
      `);
      return true;
    },
  };
}
