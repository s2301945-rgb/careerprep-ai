import { ApiError } from "./errors.js";

async function removeClaimedTask(task, repository, storage) {
  const activeResumeId = await repository.findResumeByStoragePath(task.storage_disk, task.storage_path);
  if (activeResumeId) {
    await repository.cancelCleanupTask(task.id, activeResumeId);
    return false;
  }

  try {
    if (task.storage_disk !== "supabase") {
      await repository.failCleanupTask(task.id, "UNSUPPORTED_STORAGE_DISK");
      return false;
    }
    await storage.remove(task.storage_path);
    await repository.completeCleanupTask(task.id);
    return true;
  } catch {
    await repository.failCleanupTask(task.id, "STORAGE_UNAVAILABLE");
    return false;
  }
}

export async function finishResumeDeletion(task, repository, storage) {
  if (!task) return true;
  if (task.status === "completed") return true;

  const claim = await repository.claimCleanupTask(task.id);
  if (claim) return removeClaimedTask(claim, repository, storage);

  const current = await repository.getCleanupTaskById(task.id);
  return current?.status === "completed";
}

export function startCleanupWorker({ repository, storage, logger = console, intervalMs = 15_000 }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const tasks = await repository.claimDueCleanupTasks(10);
      for (const task of tasks) {
        try {
          await removeClaimedTask(task, repository, storage);
        } catch {
          logger.error?.("Storage cleanup task could not be processed.");
        }
      }
    } catch {
      logger.error?.("Storage cleanup worker could not reach its database.");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function cleanupFailureError() {
  return new ApiError(
    503,
    "CLEANUP_PENDING",
    "The resume record was deleted, but private file cleanup is still pending. Retry the delete request shortly.",
    true,
  );
}
