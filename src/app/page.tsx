"use client";

import { useEffect, useState } from "react";

type ServiceState = "checking" | "connected" | "not_configured" | "error";
type HealthResponse = { application: string; backend: "connected"; database: ServiceState; message?: string };
const labels: Record<ServiceState, string> = { checking: "Checking", connected: "Connected", not_configured: "Not configured", error: "Unavailable" };
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

function StatusBadge({ status }: { status: ServiceState }) {
  return <span className={`status status-${status}`}><span aria-hidden="true" className="status-dot" />{labels[status]}</span>;
}

export default function Home() {
  const [health, setHealth] = useState<HealthResponse>({
    application: "CareerPrep AI",
    backend: "connected",
    database: apiUrl ? "checking" : "not_configured",
    message: apiUrl ? undefined : "Add NEXT_PUBLIC_API_URL in Vercel.",
  });
  const [aiStatus, setAiStatus] = useState<ServiceState>("not_configured");
  const [aiMessage, setAiMessage] = useState("Run a small server-side request to verify the Groq API key.");

  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/health`).then(async (response) => setHealth(await response.json())).catch(() => setHealth((current) => ({ ...current, database: "error", message: "The Railway backend could not be reached." })));
  }, []);

  async function testAi() {
    setAiStatus("checking");
    setAiMessage("Contacting Groq from the backend...");
    try {
      if (!apiUrl) throw new Error("Backend URL is not configured");
      const response = await fetch(`${apiUrl}/ai-test`, { method: "POST" });
      const data = (await response.json()) as { ai: ServiceState; message: string };
      setAiStatus(data.ai);
      setAiMessage(data.message);
    } catch {
      setAiStatus("error");
      setAiMessage("The AI connectivity test could not be completed.");
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Week 1 · Walking Skeleton</div>
        <h1>{health.application}</h1>
        <p>An AI resume analyzer and mock interview platform. This foundation proves the frontend, backend, database, CI, and AI integration can work together end to end.</p>
      </section>
      <section className="card" aria-labelledby="system-status">
        <div className="card-heading"><div><p className="section-label">System check</p><h2 id="system-status">Connection status</h2></div><span className="build-label">Foundation build</span></div>
        <div className="status-grid">
          <article><h3>Frontend</h3><StatusBadge status="connected" /><p>The Next.js interface is running.</p></article>
          <article><h3>Backend</h3><StatusBadge status={health.database === "checking" ? "checking" : health.backend === "connected" ? "connected" : "error"} /><p>The API is deployed separately on Railway.</p></article>
          <article><h3>Supabase</h3><StatusBadge status={health.database} /><p>{health.message ?? "Reading project data from PostgreSQL."}</p></article>
          <article><h3>Groq AI</h3><StatusBadge status={aiStatus} /><p>{aiMessage}</p><button disabled={aiStatus === "checking"} onClick={testAi}>{aiStatus === "checking" ? "Testing..." : "Test AI connection"}</button></article>
        </div>
      </section>
      <footer>Resume analysis and mock interviews will be delivered in future iterations.</footer>
    </main>
  );
}
