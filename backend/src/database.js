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
          (SELECT id FROM careerprep.storage_cleanup_tasks LIMIT 0)
      `);
      return true;
    },
  };
}
