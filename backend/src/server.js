import http from "node:http";
import { probeGroq } from "./groq.js";

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(request) {
  const origin = request.headers.origin;
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function sendJson(request, response, status, body) {
  response.writeHead(status, {
    ...corsHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function checkDatabase(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return sendJson(request, response, 200, {
      application: "CareerPrep AI",
      backend: "connected",
      database: "not_configured",
      message: "Add the Supabase environment variables in Railway.",
    });
  }

  try {
    const databaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/app_config?select=project_name&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!databaseResponse.ok) throw new Error(`Supabase returned ${databaseResponse.status}`);
    const records = await databaseResponse.json();

    return sendJson(request, response, 200, {
      application: records[0]?.project_name ?? "CareerPrep AI",
      backend: "connected",
      database: "connected",
      message: "Project data was read successfully from Supabase by the Railway backend.",
    });
  } catch (error) {
    console.error("Database connectivity check failed:", error);
    return sendJson(request, response, 503, {
      application: "CareerPrep AI",
      backend: "connected",
      database: "error",
      message: "Supabase is configured, but the database read failed.",
    });
  }
}

async function checkAi(request, response) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";

  if (!apiKey) {
    return sendJson(request, response, 200, {
      ai: "not_configured",
      message: "Add GROQ_API_KEY in Railway to complete the AI connectivity check.",
    });
  }

  try {
    await probeGroq({ apiKey, model });

    return sendJson(request, response, 200, {
      ai: "connected",
      message: "Groq responded successfully from the Railway backend.",
    });
  } catch (error) {
    console.error("AI connectivity check failed:", error);
    return sendJson(request, response, 503, {
      ai: "error",
      message: "Groq is configured, but the request failed.",
    });
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(request));
    return response.end();
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/") {
    return sendJson(request, response, 200, {
      service: "CareerPrep AI backend",
      status: "running",
    });
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return checkDatabase(request, response);
  }

  if (request.method === "POST" && url.pathname === "/ai-test") {
    return checkAi(request, response);
  }

  return sendJson(request, response, 404, { message: "Route not found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`CareerPrep AI backend listening on port ${port}`);
});
