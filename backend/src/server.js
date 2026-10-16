import http from "node:http";

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
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  if (!apiKey) {
    return sendJson(request, response, 200, {
      ai: "not_configured",
      message: "Add GEMINI_API_KEY in Railway to complete the AI connectivity check.",
    });
  }

  try {
    const modelsResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
      { headers: { "x-goog-api-key": apiKey } },
    );

    if (!modelsResponse.ok) {
      throw new Error(`Gemini model discovery returned ${modelsResponse.status}`);
    }

    const modelCatalog = await modelsResponse.json();
    const availableModels = (modelCatalog.models ?? []).filter((candidate) =>
      candidate.supportedGenerationMethods?.includes("generateContent"),
    );
    const requestedName = `models/${model}`;
    const modelNames = [
      ...availableModels.filter((candidate) => candidate.name === requestedName),
      ...availableModels.filter((candidate) => candidate.name?.includes("flash")),
      ...availableModels,
    ]
      .map((candidate) => candidate.name)
      .filter((name, index, names) => name && names.indexOf(name) === index);

    if (modelNames.length === 0) {
      throw new Error("No Gemini model supporting generateContent is available for this API key");
    }

    let aiResponse;
    for (const modelName of modelNames) {
      aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with exactly: AI connection successful" }] }],
            generationConfig: { maxOutputTokens: 20, temperature: 0 },
          }),
        },
      );

      if (aiResponse.ok || aiResponse.status !== 404) break;
    }

    if (!aiResponse?.ok) throw new Error(`Gemini returned ${aiResponse?.status ?? "no response"}`);

    return sendJson(request, response, 200, {
      ai: "connected",
      message: "Gemini responded successfully from the Railway backend.",
    });
  } catch (error) {
    console.error("AI connectivity check failed:", error);
    return sendJson(request, response, 503, {
      ai: "error",
      message: "Gemini is configured, but the request failed.",
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
