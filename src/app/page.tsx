"use client";

import { useCallback, useEffect, useState } from "react";

type ServiceState = "checking" | "connected" | "not_configured" | "error";
type HealthResponse = { application?: string; backend?: ServiceState; database?: ServiceState; message?: string };
type AiResponse = { ai?: ServiceState; message?: string };

const labels: Record<ServiceState, string> = { checking: "Checking", connected: "Connected", not_configured: "Not configured", error: "Unavailable" };
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const requestTimeoutMs = 10_000;

function StatusBadge({ status }: { status: ServiceState }) {
  return <span className={`status status-${status}`} role="status"><span aria-hidden="true" className="status-dot" />{labels[status]}</span>;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("The backend returned an unexpected response.");
  return (await response.json()) as T;
}

function requestErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "The backend did not respond within 10 seconds.";
  if (error instanceof TypeError) return "The backend could not be reached. Check its URL, deployment, and allowed frontend origin.";
  if (error instanceof Error && error.message) return error.message;
  return "The backend could not be reached.";
}

export default function Home() {
  const [application, setApplication] = useState("CareerPrep AI");
  const [backendStatus, setBackendStatus] = useState<ServiceState>(apiUrl ? "checking" : "not_configured");
  const [databaseStatus, setDatabaseStatus] = useState<ServiceState>(apiUrl ? "checking" : "not_configured");
  const [healthMessage, setHealthMessage] = useState(apiUrl ? "Checking the Railway API and Supabase read..." : "Add NEXT_PUBLIC_API_URL to connect this frontend to the backend.");
  const [aiStatus, setAiStatus] = useState<ServiceState>("not_configured");
  const [aiMessage, setAiMessage] = useState("Run a small server-side request to verify the Groq API key.");

  const checkHealth = useCallback(async () => {
    if (!apiUrl) return;
    setBackendStatus("checking"); setDatabaseStatus("checking"); setHealthMessage("Checking the Railway API and Supabase read...");
    try {
      const response = await fetch(`${apiUrl}/health`, { cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs) });
      const data = await readJson<HealthResponse>(response);
      if (data.application) setApplication(data.application);
      setBackendStatus(data.backend === "connected" ? "connected" : "error");
      setDatabaseStatus(data.database ?? "error");
      setHealthMessage(data.message ?? (response.ok ? "The backend and database check completed." : `The health check returned HTTP ${response.status}.`));
    } catch (error) {
      setBackendStatus("error"); setDatabaseStatus("error"); setHealthMessage(requestErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    const healthCheck = window.setTimeout(() => void checkHealth(), 0);
    return () => window.clearTimeout(healthCheck);
  }, [checkHealth]);

  async function testAi() {
    if (!apiUrl) { setAiStatus("not_configured"); setAiMessage("Add NEXT_PUBLIC_API_URL before testing the backend AI connection."); return; }
    setAiStatus("checking"); setAiMessage("Contacting Groq securely from the backend...");
    try {
      const response = await fetch(`${apiUrl}/ai-test`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs + 2_000) });
      const data = await readJson<AiResponse>(response);
      setAiStatus(data.ai ?? "error");
      setAiMessage(data.message ?? (response.ok ? "The AI connectivity check completed." : `The AI check returned HTTP ${response.status}.`));
    } catch (error) { setAiStatus("error"); setAiMessage(requestErrorMessage(error)); }
  }

  return <main>
    <section className="hero"><div className="eyebrow">Week 1 · Walking Skeleton</div><h1>{application}</h1><p>An AI resume analyzer and mock interview platform. This foundation checks each connection independently, without treating a configured service as a successful one.</p></section>
    <section className="card" aria-labelledby="system-status">
      <div className="card-heading"><div><p className="section-label">Live system check</p><h2 id="system-status">Connection status</h2></div><button className="secondary-button" disabled={!apiUrl || backendStatus === "checking"} onClick={() => void checkHealth()} type="button">{backendStatus === "checking" ? "Checking..." : "Retry health check"}</button></div>
      <div className="status-grid">
        <article><div className="service-heading"><span aria-hidden="true" className="service-number">01</span><h3>Frontend</h3></div><StatusBadge status="connected" /><p>This Next.js interface loaded successfully in your browser.</p></article>
        <article><div className="service-heading"><span aria-hidden="true" className="service-number">02</span><h3>Backend</h3></div><StatusBadge status={backendStatus} /><p>{backendStatus === "connected" ? "The separately deployed Railway API responded." : healthMessage}</p></article>
        <article><div className="service-heading"><span aria-hidden="true" className="service-number">03</span><h3>Supabase</h3></div><StatusBadge status={databaseStatus} /><p>{healthMessage}</p></article>
        <article><div className="service-heading"><span aria-hidden="true" className="service-number">04</span><h3>Groq AI</h3></div><StatusBadge status={aiStatus} /><p>{aiMessage}</p><button disabled={aiStatus === "checking"} onClick={() => void testAi()} type="button">{aiStatus === "checking" ? "Testing..." : "Test AI connection"}</button></article>
      </div>
    </section>
    <aside className="scope-note" aria-label="Week 1 scope"><span>Current scope</span><p>Connection checks only. Resume analysis and mock interviews begin in later sprints.</p></aside>
  </main>;
}
