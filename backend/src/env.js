import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

export function getConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8080),
    allowedOrigins: (env.FRONTEND_URL ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    supabaseUrl: env.SUPABASE_URL?.replace(/\/+$/, ""),
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    resumeBucket: env.SUPABASE_RESUME_BUCKET ?? "resumes",
    databaseUrl: env.DATABASE_URL,
    databaseSslCa: env.DATABASE_SSL_CA,
    migrationDatabaseUrl: env.MIGRATION_DATABASE_URL,
    migrationDatabaseSslCa: env.MIGRATION_DATABASE_SSL_CA ?? env.DATABASE_SSL_CA,
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL ?? "openai/gpt-oss-20b",
    environment: env.NODE_ENV ?? "development",
  };
}
