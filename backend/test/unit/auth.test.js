import assert from "node:assert/strict";
import { test } from "node:test";
import { createSupabaseAuth } from "../../src/auth.js";

const AUTH_URL = "https://project.supabase.co";
const ANON_KEY = "public-test-key";
const ACCESS_TOKEN = "opaque.signed.access-token";

test("Supabase Auth resolves identity server-side and uses only the verified subject", async () => {
  let receivedUrl;
  let receivedHeaders;
  let receivedSignal;
  const auth = createSupabaseAuth({
    supabaseUrl: AUTH_URL,
    supabaseAnonKey: ANON_KEY,
    fetchImpl: async (url, options) => {
      receivedUrl = url;
      receivedHeaders = options.headers;
      receivedSignal = options.signal;
      return Response.json({
        id: "11111111-1111-4111-8111-111111111111",
        email: "verified@example.test",
        user_metadata: { full_name: "Verified Person" },
      });
    },
  });

  const identity = await auth.verifyAccessToken(ACCESS_TOKEN);
  assert.deepEqual(identity, {
    id: "11111111-1111-4111-8111-111111111111",
    email: "verified@example.test",
    name: "Verified Person",
  });
  assert.equal(receivedUrl, `${AUTH_URL}/auth/v1/user`);
  assert.deepEqual(receivedHeaders, { apikey: ANON_KEY, Authorization: `Bearer ${ACCESS_TOKEN}` });
  assert.ok(receivedSignal instanceof AbortSignal);
});

test("a JWT-shaped token is rejected when Supabase Auth rejects it", async () => {
  const auth = createSupabaseAuth({
    supabaseUrl: AUTH_URL,
    supabaseAnonKey: ANON_KEY,
    fetchImpl: async () => new Response("invalid token", { status: 401 }),
  });

  await assert.rejects(
    auth.verifyAccessToken("eyJhbGciOiJub25lIn0.eyJzdWIiOiJub3QtdHJ1c3RlZCJ9.signature"),
    (error) => error.status === 401 && error.code === "UNAUTHENTICATED",
  );
});
