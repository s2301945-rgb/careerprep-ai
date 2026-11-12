import assert from "node:assert/strict";
import { test } from "node:test";
import { finishResumeDeletion } from "../../src/cleanup.js";

test("cleanup keeps unsupported legacy storage disks pending without deleting a Supabase collision", async () => {
  const changes = [];
  let removed = false;
  const repository = {
    async claimCleanupTask(id) {
      return { id, storage_disk: "local", storage_path: "same/key" };
    },
    async findResumeByStoragePath() { return null; },
    async failCleanupTask(id, code) { changes.push({ id, code }); },
    async completeCleanupTask() { assert.fail("unsupported disk must not complete"); },
  };
  const storage = {
    async remove() { removed = true; },
  };

  const result = await finishResumeDeletion({ id: "55", status: "pending" }, repository, storage);
  assert.equal(result, false);
  assert.equal(removed, false);
  assert.deepEqual(changes, [{ id: "55", code: "UNSUPPORTED_STORAGE_DISK" }]);
});
