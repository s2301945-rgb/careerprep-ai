import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { createApp } from "../src/server.js";
import { createPool, createRepository } from "../src/database.js";
import { checksum, runMigrations, verifyMigrationSchema } from "../scripts/migrate.js";
import { finishResumeDeletion } from "../src/cleanup.js";

const connectionString = process.env.TEST_DATABASE_URL;
const enabled = Boolean(connectionString);

if (enabled) {
  const target = new URL(connectionString);
  const hostname = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (process.env.TEST_DATABASE_DISPOSABLE !== "true") {
    throw new Error("Integration tests require TEST_DATABASE_DISPOSABLE=true.");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Integration tests only run against a loopback PostgreSQL host.");
  }
  if (!/_test$/i.test(databaseName)) {
    throw new Error("Integration tests require a database name ending in _test.");
  }
}

const pool = enabled
  ? createPool({ connectionString, applicationName: "careerprep-integration-test", environment: "test" })
  : null;
let runtimePool;
let app;
let repository;
let storage;
let storageObjects;
let identities;

after(async () => {
  if (app?.listening) await new Promise((resolve) => app.close(resolve));
  await runtimePool?.end();
  await pool?.end();
});

async function prepareAuthStandIns() {
  const existing = await pool.query(`
    SELECT to_regclass('careerprep.users') AS users_table,
           to_regclass('careerprep_meta.schema_migrations') AS migration_ledger
  `);
  if (existing.rows[0]?.users_table && !existing.rows[0]?.migration_ledger) {
    throw new Error("Refusing to run integration migrations over an untracked existing careerprep schema.");
  }

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$
  `);
  await pool.query("CREATE SCHEMA IF NOT EXISTS auth");
  await pool.query("CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)");
}

function makeStorage() {
  let failNextRemove = false;
  return {
    async upload(key, bytes) { storageObjects.set(key, Buffer.from(bytes)); },
    async download(key) {
      const bytes = storageObjects.get(key);
      if (!bytes) throw new Error("file missing");
      return { buffer: bytes };
    },
    async remove(key) {
      if (failNextRemove) {
        failNextRemove = false;
        throw new Error("temporary storage outage");
      }
      storageObjects.delete(key);
    },
    failNextDelete() { failNextRemove = true; },
  };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function upload(baseUrl, title = "Resume") {
  const form = new FormData();
  form.set("display_title", title);
  form.set("file", new Blob([
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
  ], { type: "application/pdf" }), `${title}.pdf`);
  return fetch(`${baseUrl}/api/v1/resumes`, {
    method: "POST",
    headers: authHeaders("user-a"),
    body: form,
  });
}

test("PostgreSQL migrations and authenticated resume API enforce ownership and durable cleanup", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  await prepareAuthStandIns();
  await runMigrations(pool, { logger: { log() {} } });
  assert.equal(checksum("SELECT 1;\r\n"), checksum("SELECT 1;\n"));
  for (const filename of [
    "20261014150915_initial_schema.sql",
    "20261016160000_add_walking_skeleton_config.sql",
    "20261022160000_sprint_2_resume_api.sql",
  ]) {
    assert.equal(await verifyMigrationSchema(pool, filename), true, `${filename} baseline verification`);
  }

  const grants = await pool.query(`
    SELECT has_schema_privilege('careerprep_api', 'careerprep', 'USAGE') AS schema_usage,
           has_table_privilege('careerprep_api', 'careerprep.users', 'SELECT') AS can_read_users,
           has_table_privilege('careerprep_api', 'careerprep.users', 'DELETE') AS can_delete_users,
           has_table_privilege('careerprep_api', 'careerprep.resumes', 'DELETE') AS can_delete_resumes,
           has_table_privilege('anon', 'careerprep.users', 'SELECT') AS anon_can_read
  `);
  assert.deepEqual(grants.rows[0], {
    schema_usage: true,
    can_read_users: true,
    can_delete_users: false,
    can_delete_resumes: true,
    anon_can_read: false,
  });

  runtimePool = createPool({
    connectionString,
    applicationName: "careerprep-runtime-role-test",
    environment: "test",
    roleName: "careerprep_api",
  });
  const runtimeIdentity = await runtimePool.query(`
    SELECT current_user AS role_name, role.rolsuper AS is_superuser
    FROM pg_roles AS role WHERE role.rolname = current_user
  `);
  assert.deepEqual(runtimeIdentity.rows[0], { role_name: "careerprep_api", is_superuser: false });
  repository = createRepository(runtimePool);
  identities = {
    a: { id: randomUUID(), email: `a-${randomUUID()}@example.test`, name: "User A" },
    b: { id: randomUUID(), email: `b-${randomUUID()}@example.test`, name: "User B" },
    legacy: { id: randomUUID(), email: `legacy-${randomUUID()}@example.test`, name: "Legacy" },
  };
  await pool.query("INSERT INTO auth.users (id) VALUES ($1), ($2), ($3)", [
    identities.a.id,
    identities.b.id,
    identities.legacy.id,
  ]);

  await pool.query(
    "INSERT INTO careerprep.users (name, email) VALUES ('Legacy profile', $1)",
    [identities.legacy.email],
  );
  await assert.rejects(
    repository.resolveUser(identities.legacy),
    (error) => error.code === "ACCOUNT_LINK_REQUIRED" && error.status === 409,
  );

  const auth = {
    async verifyAccessToken(token) {
      if (token === "user-a") return identities.a;
      if (token === "user-b") return identities.b;
      throw Object.assign(new Error("invalid"), { status: 401, code: "UNAUTHENTICATED" });
    },
  };
  storageObjects = new Map();
  storage = makeStorage();
  app = createApp({
    config: { allowedOrigins: ["http://localhost:3000"], supabaseUrl: "", supabaseAnonKey: "" },
    repository,
    auth,
    storage,
    aiProbe: { async check() { return { ai: "not_configured" }; } },
    logger: { error() {} },
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.address().port}`;

  const ready = await fetch(`${baseUrl}/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { backend: "connected", database: "connected" });

  const meAResponse = await fetch(`${baseUrl}/api/v1/me`, { headers: authHeaders("user-a") });
  assert.equal(meAResponse.status, 200);
  const userA = (await meAResponse.json()).user;
  assert.equal(typeof userA.id, "string");
  assert.equal(userA.email, identities.a.email);

  const firstUpload = await upload(baseUrl, "First CV");
  const secondUpload = await upload(baseUrl, "Second CV");
  assert.equal(firstUpload.status, 201);
  assert.equal(secondUpload.status, 201);
  const firstResume = (await firstUpload.json()).resume;
  const secondResume = (await secondUpload.json()).resume;
  assert.equal(typeof firstResume.id, "string");
  assert.equal(typeof firstResume.file_size_bytes, "string");

  const pageOneResponse = await fetch(`${baseUrl}/api/v1/resumes?limit=1`, { headers: authHeaders("user-a") });
  assert.equal(pageOneResponse.status, 200);
  const pageOne = await pageOneResponse.json();
  assert.equal(pageOne.resumes.length, 1);
  assert.ok(pageOne.next_cursor);
  const pageTwoResponse = await fetch(
    `${baseUrl}/api/v1/resumes?limit=1&cursor=${encodeURIComponent(pageOne.next_cursor)}`,
    { headers: authHeaders("user-a") },
  );
  const pageTwo = await pageTwoResponse.json();
  assert.equal(pageTwoResponse.status, 200);
  assert.equal(pageTwo.resumes.length, 1);
  assert.deepEqual(
    [...new Set([...pageOne.resumes, ...pageTwo.resumes].map((resume) => resume.id))].sort(),
    [firstResume.id, secondResume.id].sort(),
  );

  const crossUser = await fetch(`${baseUrl}/api/v1/resumes/${firstResume.id}`, { headers: authHeaders("user-b") });
  assert.equal(crossUser.status, 404);
  assert.equal((await crossUser.json()).error.code, "RESUME_NOT_FOUND");

  const renamed = await fetch(`${baseUrl}/api/v1/resumes/${firstResume.id}`, {
    method: "PATCH",
    headers: { ...authHeaders("user-a"), "Content-Type": "application/json" },
    body: JSON.stringify({ display_title: "Updated CV" }),
  });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).resume.display_title, "Updated CV");

  const file = await fetch(`${baseUrl}/api/v1/resumes/${firstResume.id}/file`, { headers: authHeaders("user-a") });
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition"), /attachment/);
  assert.match(file.headers.get("cache-control"), /private/);
  assert.equal(Buffer.from(await file.arrayBuffer()).toString("latin1").startsWith("%PDF-"), true);

  const secondStoragePath = (await repository.findResumeFile(userA.id, secondResume.id)).storage_path;
  storage.failNextDelete();
  const delayedDelete = await fetch(`${baseUrl}/api/v1/resumes/${secondResume.id}`, {
    method: "DELETE",
    headers: authHeaders("user-a"),
  });
  assert.equal(delayedDelete.status, 503);
  assert.equal((await delayedDelete.json()).error.code, "CLEANUP_PENDING");
  assert.equal(storageObjects.has(secondStoragePath), true);
  const queued = await pool.query(
    `SELECT status, attempt_count, storage_path
     FROM careerprep.storage_cleanup_tasks WHERE resume_id = $1`,
    [secondResume.id],
  );
  assert.equal(queued.rows[0].status, "pending");
  assert.equal(queued.rows[0].attempt_count, 1);
  assert.equal(queued.rows[0].storage_path, secondStoragePath);
  await pool.query(
    "UPDATE careerprep.storage_cleanup_tasks SET next_attempt_at = NOW() WHERE resume_id = $1",
    [secondResume.id],
  );
  const retriedDelete = await fetch(`${baseUrl}/api/v1/resumes/${secondResume.id}`, {
    method: "DELETE",
    headers: authHeaders("user-a"),
  });
  assert.equal(retriedDelete.status, 204);
  assert.equal(storageObjects.has(secondStoragePath), false);

  const cascadeUpload = await upload(baseUrl, "Auth cascade CV");
  const cascadeResume = (await cascadeUpload.json()).resume;
  const cascadeStoragePath = (await repository.findResumeFile(userA.id, cascadeResume.id)).storage_path;
  await pool.query("DELETE FROM auth.users WHERE id = $1", [identities.a.id]);
  assert.equal(await repository.findResume(userA.id, cascadeResume.id), null);
  assert.equal(storageObjects.has(cascadeStoragePath), true);
  const captured = await pool.query(
    `SELECT id::text AS id, owner_user_id::text AS owner_user_id,
            resume_id::text AS resume_id, storage_disk, storage_path, status,
            attempt_count::text AS attempt_count
     FROM careerprep.storage_cleanup_tasks
     WHERE owner_user_id = $1 AND resume_id = $2`,
    [userA.id, cascadeResume.id],
  );
  assert.equal(captured.rows.length, 1);
  assert.equal(captured.rows[0].status, "pending");
  assert.equal(captured.rows[0].storage_path, cascadeStoragePath);
  assert.equal(await finishResumeDeletion(captured.rows[0], repository, storage), true);
  assert.equal(storageObjects.has(cascadeStoragePath), false);

  const finalState = await pool.query(
    "SELECT status FROM careerprep.storage_cleanup_tasks WHERE id = $1",
    [captured.rows[0].id],
  );
  assert.equal(finalState.rows[0].status, "completed");
});
