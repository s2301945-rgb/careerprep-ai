"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl, getHealth, getReadiness, testAiConnection, type AiTestResponse, type HealthResponse } from "@/lib/api";

type CheckState = "checking" | "connected" | "not_configured" | "error" | "unchecked";
const statusLabel: Record<CheckState, string> = {
  checking: "Checking",
  connected: "Connected",
  not_configured: "Not configured",
  error: "Unavailable",
  unchecked: "Not checked",
};

function StatusPill({ state }: { state: CheckState }) {
  return <span className={`status-pill status-${state}`}><span className="status-indicator" aria-hidden="true" />{statusLabel[state]}</span>;
}

function normalizeState(value: string | undefined): CheckState {
  if (value === "connected") return "connected";
  if (value === "error") return "error";
  return "not_configured";
}

export function ServiceDiagnostics() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthState, setHealthState] = useState<CheckState>(getApiBaseUrl() ? "checking" : "not_configured");
  const [healthMessage, setHealthMessage] = useState(getApiBaseUrl() ? "Checking the backend health endpoint." : "The backend API is not configured.");
  const [readinessState, setReadinessState] = useState<CheckState>(getApiBaseUrl() ? "checking" : "not_configured");
  const [readinessMessage, setReadinessMessage] = useState(getApiBaseUrl() ? "Checking the private application database." : "The application API is not configured.");
  const [ai, setAi] = useState<AiTestResponse | null>(null);
  const [aiState, setAiState] = useState<CheckState>("unchecked");
  const [aiMessage, setAiMessage] = useState("Run an authenticated request to verify the AI provider.");

  useEffect(() => {
    let active = true;
    if (!getApiBaseUrl()) return () => { active = false; };
    getHealth().then((result) => {
      if (!active) return;
      setHealth(result);
      setHealthState(result.backend === "connected" ? "connected" : normalizeState(result.backend));
      setHealthMessage(result.backend === "connected" ? "The backend health endpoint responded." : result.message ?? "The backend health check finished.");
    }).catch((reason: unknown) => {
      if (!active) return;
      setHealthState("error");
      setHealthMessage(reason instanceof Error ? reason.message : "The backend health check failed.");
    });
    getReadiness().then((result) => {
      if (!active) return;
      setReadinessState(normalizeState(result.database));
      setReadinessMessage(result.database === "connected" ? "The private application database is ready." : "The private application database is unavailable.");
    }).catch((reason: unknown) => {
      if (!active) return;
      setReadinessState("error");
      setReadinessMessage(reason instanceof Error ? reason.message : "The private application database is unavailable.");
    });
    return () => { active = false; };
  }, []);

  async function runAiTest() {
    setAi(null);
    setAiState("checking");
    setAiMessage("Sending an authenticated request to the backend…");
    try {
      const result = await testAiConnection();
      setAi(result);
      setAiState(normalizeState(result.ai));
      setAiMessage(result.message);
    } catch (reason) {
      setAiState("error");
      setAiMessage(reason instanceof Error ? reason.message : "The AI connectivity test could not be completed.");
    }
  }

  const metadataState = health ? normalizeState(health.database) : healthState === "checking" ? "checking" : healthState;

  return (
    <section className="diagnostics-card" aria-labelledby="diagnostics-title">
      <div className="diagnostics-heading">
        <div>
          <p className="eyebrow">Environment</p>
          <h2 id="diagnostics-title">Service checks</h2>
        </div>
        <span className="diagnostics-lock" aria-hidden="true">Private</span>
      </div>
      <div className="diagnostics-grid">
        <div className="diagnostic-item">
          <div className="diagnostic-topline"><span>Backend API</span><StatusPill state={healthState} /></div>
          <p>{healthMessage}</p>
        </div>
        <div className="diagnostic-item">
          <div className="diagnostic-topline"><span>Application database</span><StatusPill state={readinessState} /></div>
          <p>{readinessMessage}</p>
        </div>
        <div className="diagnostic-item">
          <div className="diagnostic-topline"><span>Project metadata</span><StatusPill state={metadataState} /></div>
          <p>{health?.message ?? (metadataState === "checking" ? "Checking public Supabase project metadata." : metadataState === "not_configured" ? "Public Supabase metadata is not configured." : "The public Supabase metadata check is unavailable.")}</p>
        </div>
        <div className="diagnostic-item diagnostic-ai">
          <div className="diagnostic-topline"><span>AI provider</span><StatusPill state={aiState} /></div>
          <p>{aiMessage}</p>
          <button className="button button-secondary button-small" disabled={aiState === "checking" || !getApiBaseUrl()} onClick={runAiTest} type="button">
            {aiState === "checking" ? <><span className="spinner spinner-dark" aria-hidden="true" /> Checking…</> : "Test AI connection"}
          </button>
        </div>
      </div>
      {ai?.ai === "connected" && <p className="sr-only" role="status">AI provider test connected.</p>}
    </section>
  );
}
