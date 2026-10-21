import "../src/env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPool } from "../src/database.js";
import { getConfig } from "../src/env.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "../../supabase/migrations");
export function checksum(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

function stripTransactionBoundaries(sql) {
  const withoutBegin = sql.replace(/(^|\n)\s*BEGIN\s*;\s*(?=\n)/i, "$1");
  return withoutBegin.replace(/\s*COMMIT\s*;\s*$/i, "\n");
}

function migrationVersion(filename) {
  return /^([0-9]{14})_/.exec(filename)?.[1] ?? null;
}

async function createLedger(pool) {
  await pool.query("CREATE SCHEMA IF NOT EXISTS careerprep_meta");
  await pool.query("REVOKE ALL ON SCHEMA careerprep_meta FROM PUBLIC");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS careerprep_meta.schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      source TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("REVOKE ALL ON ALL TABLES IN SCHEMA careerprep_meta FROM PUBLIC");
}

async function listMigrations(directory = MIGRATIONS_DIRECTORY) {
  const filenames = (await fs.readdir(directory))
    .filter((filename) => /^\d{14}_.+\.sql$/.test(filename))
    .sort();
  return Promise.all(filenames.map(async (filename) => ({
    filename,
    sql: await fs.readFile(path.join(directory, filename), "utf8"),
  })));
}

async function supabaseHistoryContains(pool, version) {
  if (!version) return false;
  const relation = await pool.query("SELECT to_regclass('supabase_migrations.schema_migrations') AS table_name");
  if (!relation.rows[0]?.table_name) return false;
  const result = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1) AS found",
    [version],
  );
  return result.rows[0]?.found === true;
}

export async function verifyMigrationSchema(pool, filename) {
  if (filename === "20261014150915_initial_schema.sql") {
    const result = await pool.query(`
      WITH expected_columns(table_name, column_name, data_type) AS (
        VALUES
          ('users', 'id', 'bigint'), ('users', 'email', 'character varying'),
          ('resumes', 'id', 'bigint'), ('resumes', 'user_id', 'bigint'),
          ('resumes', 'original_filename', 'character varying'), ('resumes', 'storage_path', 'text'),
          ('resumes', 'mime_type', 'character varying'), ('resumes', 'file_size_bytes', 'bigint'),
          ('resume_analyses', 'resume_id', 'bigint'), ('resume_analyses', 'user_id', 'bigint'),
          ('job_descriptions', 'id', 'bigint'), ('job_descriptions', 'user_id', 'bigint'),
          ('job_matches', 'resume_id', 'bigint'), ('job_matches', 'job_description_id', 'bigint'),
          ('job_matches', 'user_id', 'bigint'),
          ('interview_sessions', 'resume_id', 'bigint'), ('interview_sessions', 'user_id', 'bigint'),
          ('interview_questions', 'interview_session_id', 'bigint'),
          ('interview_answers', 'interview_question_id', 'bigint')
      ),
      expected_foreign_keys(table_name, constraint_name) AS (
        VALUES
          ('resumes', 'fk_resumes_user'),
          ('resume_analyses', 'fk_resume_analyses_owned_resume'),
          ('job_descriptions', 'fk_job_descriptions_user'),
          ('job_matches', 'fk_job_matches_owned_resume'),
          ('job_matches', 'fk_job_matches_owned_job'),
          ('interview_sessions', 'fk_interview_sessions_owned_resume'),
          ('interview_sessions', 'fk_interview_sessions_owned_job'),
          ('interview_questions', 'fk_interview_questions_session'),
          ('interview_answers', 'fk_interview_answers_question')
      )
      SELECT
        to_regclass('careerprep.users') IS NOT NULL
        AND to_regclass('careerprep.resumes') IS NOT NULL
        AND to_regclass('careerprep.resume_analyses') IS NOT NULL
        AND to_regclass('careerprep.job_descriptions') IS NOT NULL
        AND to_regclass('careerprep.job_matches') IS NOT NULL
        AND to_regclass('careerprep.interview_sessions') IS NOT NULL
        AND to_regclass('careerprep.interview_questions') IS NOT NULL
        AND to_regclass('careerprep.interview_answers') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM expected_columns AS expected
          LEFT JOIN information_schema.columns AS actual
            ON actual.table_schema = 'careerprep'
            AND actual.table_name = expected.table_name
            AND actual.column_name = expected.column_name
          WHERE actual.column_name IS NULL OR actual.data_type <> expected.data_type
        )
        AND NOT EXISTS (
          SELECT 1 FROM expected_foreign_keys AS expected
          LEFT JOIN pg_constraint AS actual
            ON actual.conrelid = to_regclass('careerprep.' || expected.table_name)
            AND actual.conname = expected.constraint_name
          WHERE actual.oid IS NULL OR actual.contype <> 'f' OR actual.confdeltype <> 'c'
        )
        AND EXISTS (
          SELECT 1 FROM pg_index AS index
          JOIN pg_class AS table_relation ON table_relation.oid = index.indrelid
          JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
          WHERE namespace.nspname = 'careerprep'
            AND table_relation.relname = 'users'
            AND index.indexrelid = to_regclass('careerprep.uq_users_email_case_insensitive')
            AND index.indisunique
        ) AS complete
    `);
    return result.rows[0]?.complete === true;
  }

  if (filename === "20261016160000_add_walking_skeleton_config.sql") {
    const result = await pool.query(`
      SELECT to_regclass('public.app_config') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'app_config'
            AND column_name = 'project_name' AND data_type = 'text'
        )
        AND EXISTS (
          SELECT 1 FROM pg_class AS relation
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public' AND relation.relname = 'app_config'
            AND relation.relrowsecurity
        )
        AND EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'app_config'
            AND policyname = 'Public can read app config'
        ) AS complete
    `);
    return result.rows[0]?.complete === true;
  }

  if (filename === "20261022160000_sprint_2_resume_api.sql") {
    const result = await pool.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'careerprep' AND table_name = 'users'
            AND column_name = 'auth_user_id' AND data_type = 'uuid'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'careerprep' AND table_name = 'resumes'
            AND column_name = 'display_title' AND is_nullable = 'NO'
        )
        AND to_regclass('careerprep.storage_cleanup_tasks') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass('careerprep.users')
            AND conname = 'fk_users_auth_user' AND contype = 'f' AND confdeltype = 'c'
        )
        AND EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass('careerprep.users')
            AND conname = 'uq_users_auth_user_id' AND contype = 'u'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'careerprep' AND table_name = 'storage_cleanup_tasks'
            AND column_name = 'storage_path' AND data_type = 'text'
        )
        AND EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = to_regclass('careerprep.users')
            AND tgname = 'trg_users_queue_resume_cleanup' AND NOT tgisinternal
        )
        AND EXISTS (
          SELECT 1 FROM pg_roles
          WHERE rolname = 'careerprep_api' AND NOT rolcanlogin
        )
        AND has_schema_privilege('careerprep_api', 'careerprep', 'USAGE')
        AND has_table_privilege('careerprep_api', 'careerprep.users', 'SELECT')
        AND has_table_privilege('careerprep_api', 'careerprep.resumes', 'DELETE')
        AND has_table_privilege('careerprep_api', 'careerprep.storage_cleanup_tasks', 'INSERT')
        AND NOT has_table_privilege('careerprep_api', 'careerprep.users', 'DELETE') AS complete
    `);
    return result.rows[0]?.complete === true;
  }

  return false;
}

async function hasMigrationFootprint(pool, filename) {
  const result = await pool.query({
    "20261014150915_initial_schema.sql": "SELECT to_regnamespace('careerprep') IS NOT NULL AS present",
    "20261016160000_add_walking_skeleton_config.sql": "SELECT to_regclass('public.app_config') IS NOT NULL AS present",
    "20261022160000_sprint_2_resume_api.sql": `
      SELECT to_regclass('careerprep.storage_cleanup_tasks') IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'careerprep' AND table_name = 'users' AND column_name = 'auth_user_id'
          ) AS present
    `,
  }[filename] ?? "SELECT FALSE AS present");
  return result.rows[0]?.present === true;
}

async function recordMigration(pool, migration, source) {
  const migrationChecksum = checksum(migration.sql);
  const existing = await pool.query(
    "SELECT checksum FROM careerprep_meta.schema_migrations WHERE filename = $1",
    [migration.filename],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].checksum.trim() !== migrationChecksum) {
      throw new Error(`Applied migration ${migration.filename} has changed; create a new migration instead.`);
    }
    return false;
  }

  await pool.query(
    `INSERT INTO careerprep_meta.schema_migrations (filename, checksum, source)
     VALUES ($1, $2, $3)`,
    [migration.filename, migrationChecksum, source],
  );
  return true;
}

export async function baselineExistingMigrations(pool, logger = console) {
  const client = await pool.connect();
  try {
    await createLedger(client);
    await client.query("SELECT pg_advisory_lock(75462831, 2)");
    const migrations = await listMigrations();
    for (const migration of migrations) {
      const existing = await client.query(
        "SELECT filename FROM careerprep_meta.schema_migrations WHERE filename = $1",
        [migration.filename],
      );
      if (existing.rows[0]) continue;
      if (!(await verifyMigrationSchema(client, migration.filename))) {
        if (await hasMigrationFootprint(client, migration.filename)) {
          throw new Error(`Existing objects for ${migration.filename} do not match the verified schema; inspect the database before baselining.`);
        }
        continue;
      }
      await recordMigration(client, migration, "verified-existing-schema");
      logger.log?.(`Baselined verified existing migration ${migration.filename}`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(75462831, 2)").catch(() => {});
    client.release();
  }
}

export async function runMigrations(pool, { directory = MIGRATIONS_DIRECTORY, logger = console } = {}) {
  const client = await pool.connect();
  try {
    await createLedger(client);
    await client.query("SELECT pg_advisory_lock(75462831, 2)");
    const migrations = await listMigrations(directory);
    for (const migration of migrations) {
      const existing = await client.query(
        "SELECT checksum FROM careerprep_meta.schema_migrations WHERE filename = $1",
        [migration.filename],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum.trim() !== checksum(migration.sql)) {
          throw new Error(`Applied migration ${migration.filename} has changed; create a new migration instead.`);
        }
        continue;
      }

      if (await supabaseHistoryContains(client, migrationVersion(migration.filename))) {
        if (!(await verifyMigrationSchema(client, migration.filename))) {
          throw new Error(`Supabase history records ${migration.filename}, but required schema objects are missing.`);
        }
        await recordMigration(client, migration, "supabase-migration-history");
        logger.log?.(`Recorded existing Supabase migration ${migration.filename}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(stripTransactionBoundaries(migration.sql));
        await recordMigration(client, migration, "careerprep-migration-runner");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
      logger.log?.(`Applied ${migration.filename}`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(75462831, 2)").catch(() => {});
    client.release();
  }
}

async function runCli({ baseline = false } = {}) {
  const config = getConfig();
  if (!config.migrationDatabaseUrl) {
    throw new Error("MIGRATION_DATABASE_URL is required for migration commands.");
  }
  const pool = createPool({
    connectionString: config.migrationDatabaseUrl,
    sslCaPath: config.migrationDatabaseSslCa,
    applicationName: "careerprep-migrations",
    environment: config.environment,
  });
  try {
    if (baseline) await baselineExistingMigrations(pool);
    else await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli({ baseline: process.argv.includes("--baseline-existing") }).catch((error) => {
    console.error(error instanceof Error ? error.message : "Migration command failed.");
    process.exitCode = 1;
  });
}
