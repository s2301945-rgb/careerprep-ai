import { ApiError } from "./errors.js";

export function createResumeAiGuard({
  windowMs = 60_000,
  maxStartsPerUser = 6,
  maxStarts = 30,
  maxConcurrent = 4,
  now = () => performance.now(),
} = {}) {
  let recentStarts = [];
  const activeUsers = new Set();

  function limited(status, code, message, waitMs) {
    return new ApiError(status, code, message, true, {
      retry_after_seconds: Math.max(1, Math.ceil(waitMs / 1000)),
    });
  }

  return {
    start(userId) {
      if (activeUsers.has(userId)) {
        throw limited(429, "AI_REQUEST_IN_PROGRESS", "Wait for your current resume AI request to finish, then try again.", 5000);
      }
      if (activeUsers.size >= maxConcurrent) {
        throw limited(503, "AI_CAPACITY_REACHED", "Resume AI is busy. Try again shortly.", 5000);
      }

      const startedAt = now();
      recentStarts = recentStarts.filter((entry) => startedAt - entry.at < windowMs);
      const userStarts = recentStarts.filter((entry) => entry.userId === userId);
      if (userStarts.length >= maxStartsPerUser) {
        const waitMs = userStarts[0].at + windowMs - startedAt;
        const seconds = Math.ceil(waitMs / 1000);
        throw limited(429, "AI_RATE_LIMITED", `You have reached the resume AI request limit. Try again in ${seconds} seconds.`, waitMs);
      }
      if (recentStarts.length >= maxStarts) {
        const waitMs = recentStarts[0].at + windowMs - startedAt;
        throw limited(503, "AI_CAPACITY_REACHED", "Resume AI is busy. Try again shortly.", waitMs);
      }

      recentStarts.push({ userId, at: startedAt });
      activeUsers.add(userId);
      return () => activeUsers.delete(userId);
    },
  };
}
