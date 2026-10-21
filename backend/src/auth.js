import { ApiError } from "./errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSupabaseAuth({ supabaseUrl, supabaseAnonKey, fetchImpl = fetch }) {
  return {
    async verifyAccessToken(token) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Authentication is not configured.", true);
      }

      let response;
      try {
        response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Authentication could not be verified.", true);
      }

      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new ApiError(401, "UNAUTHENTICATED", "A valid sign-in session is required.");
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Authentication could not be verified.", true);
      }

      let user;
      try {
        user = await response.json();
      } catch {
        throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Authentication returned an invalid response.", true);
      }

      if (typeof user?.id !== "string" || !UUID_PATTERN.test(user.id)) {
        throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Authentication returned an invalid identity.", true);
      }

      const email = typeof user.email === "string" && user.email.trim()
        ? user.email.trim()
        : null;
      const metadata = user.user_metadata && typeof user.user_metadata === "object"
        ? user.user_metadata
        : {};
      const candidateName = [metadata.full_name, metadata.name]
        .find((value) => typeof value === "string" && value.trim());
      const name = candidateName?.trim().slice(0, 150)
        ?? email?.split("@", 1)[0]?.slice(0, 150)
        ?? "User";

      return { id: user.id, email, name };
    },
  };
}

export async function requireIdentity(request, auth) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 8192) {
    throw new ApiError(401, "UNAUTHENTICATED", "A valid sign-in session is required.");
  }

  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match) {
    throw new ApiError(401, "UNAUTHENTICATED", "A valid sign-in session is required.");
  }

  return auth.verifyAccessToken(match[1]);
}
