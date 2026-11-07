import { ApiError } from "./errors.js";
import { MAX_FILE_BYTES } from "./documents.js";

function encodedObjectPath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function readLimitedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new ApiError(503, "FILE_UNAVAILABLE", "The stored resume is not available.", true);
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError(503, "FILE_UNAVAILABLE", "The stored resume is not available.", true);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function createSupabaseStorage({
  supabaseUrl,
  serviceRoleKey,
  bucket,
  fetchImpl = fetch,
}) {
  function assertConfigured() {
    if (!supabaseUrl || !serviceRoleKey || !bucket) {
      throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Private resume storage is not configured.", true);
    }
  }

  function objectUrl(path) {
    return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedObjectPath(path)}`;
  }

  const headers = () => ({
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  });

  return {
    async upload(path, buffer, mimeType) {
      assertConfigured();
      try {
        const response = await fetchImpl(objectUrl(path), {
          method: "POST",
          headers: {
            ...headers(),
            "Content-Type": mimeType,
            "Cache-Control": "private, no-store",
            "x-upsert": "false",
          },
          body: buffer,
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new ApiError(503, "STORAGE_UNAVAILABLE", "The resume file could not be stored.", true);
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, "STORAGE_UNAVAILABLE", "The resume file could not be stored.", true);
      }
    },

    async download(path) {
      assertConfigured();
      try {
        const response = await fetchImpl(objectUrl(path), {
          headers: headers(),
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new ApiError(503, "FILE_UNAVAILABLE", "The stored resume is not available.", true);
        }
        const buffer = await readLimitedBody(response, MAX_FILE_BYTES);
        return { buffer };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, "FILE_UNAVAILABLE", "The stored resume is not available.", true);
      }
    },

    async remove(path) {
      assertConfigured();
      try {
        const response = await fetchImpl(objectUrl(path), {
          method: "DELETE",
          headers: headers(),
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 404 || response.ok) {
          await response.body?.cancel();
          return;
        }
        await response.body?.cancel();
        throw new ApiError(503, "STORAGE_UNAVAILABLE", "Resume file cleanup is still pending.", true);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, "STORAGE_UNAVAILABLE", "Resume file cleanup is still pending.", true);
      }
    },
  };
}
