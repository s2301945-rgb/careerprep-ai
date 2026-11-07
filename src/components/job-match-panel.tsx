"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getJobMatch, listJobs, runJobMatch, saveJob, type JobMatch, type SavedJob } from "@/lib/api";

export function JobMatchPanel({ resumeId }: { resumeId: string }) {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [jobId, setJobId] = useState("");
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const matchRequest = useRef(0);

  const refreshJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listJobs();
      setJobs(result.jobs);
      setJobId((current) => current || result.jobs[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Saved jobs could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshJobs(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshJobs]);

  const refreshMatch = useCallback(async () => {
    const request = ++matchRequest.current;
    if (!jobId) { setMatch(null); return; }
    setLoading(true);
    setError("");
    try {
      const result = await getJobMatch(resumeId, jobId);
      if (request === matchRequest.current) setMatch(result.match);
    } catch (reason) {
      if (request === matchRequest.current) setError(reason instanceof Error ? reason.message : "The saved comparison could not be loaded.");
    } finally { if (request === matchRequest.current) setLoading(false); }
  }, [jobId, resumeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshMatch(); }, 0);
    return () => { window.clearTimeout(timer); matchRequest.current += 1; };
  }, [refreshMatch]);

  async function addJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveJob({ job_title: title, company_name: company, description_text: description });
      setJobs((current) => [result.job, ...current]);
      setJobId(result.job.id);
      setTitle(""); setCompany(""); setDescription("");
      setNotice("Job description saved. You can now compare it with this resume.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The job could not be saved."); }
    finally { setBusy(false); }
  }

  async function compare() {
    if (!jobId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await runJobMatch(resumeId, jobId);
      setMatch(result.match);
      setNotice(result.match.match_score === null ? "No usable job requirements were found. No score was assigned." : "Comparison saved to this resume and job.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The comparison failed. You can retry."); }
    finally { setBusy(false); }
  }

  return <section className="job-match-panel" aria-labelledby="job-match-heading">
    <div className="ai-result-heading"><div><span className="eyebrow">JOB MATCHING</span><h3 id="job-match-heading">Compare with a job</h3></div></div>
    <p>Save a job description to compare its stated requirements with evidence in your confirmed resume. The score is practice feedback, not a hiring prediction.</p>
    {error && <div className="notice notice-error" role="alert">{error} <button className="text-button" type="button" onClick={() => void refreshJobs()}>Retry loading jobs</button></div>}
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    <form className="job-match-form" onSubmit={(event) => void addJob(event)}>
      <label>Job title (optional)<input maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Company (optional)<input maxLength={180} value={company} onChange={(event) => setCompany(event.target.value)} /></label>
      <label>Job description<textarea required minLength={1} maxLength={30000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <button className="button button-secondary" disabled={busy || !description.trim()} type="submit">{busy ? "Saving…" : "Save job description"}</button>
    </form>
    {loading ? <p role="status">Loading saved jobs and comparison…</p> : jobs.length === 0 ? <p>No saved jobs yet.</p> : <div className="job-match-saved">
      <label>Saved job<select value={jobId} disabled={busy} onChange={(event) => { matchRequest.current += 1; setJobId(event.target.value); setMatch(null); }}>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job_title || "Untitled job"}{job.company_name ? ` · ${job.company_name}` : ""}</option>)}</select></label>
      <button className="button button-secondary" disabled={busy || !jobId} type="button" onClick={() => void compare()}>{busy ? "Comparing…" : match?.status === "completed" ? "Compare again" : "Compare with resume"}</button>
      {match?.status === "failed" && <p role="status">The last comparison failed. You can retry.</p>}
      {match?.status === "processing" && <p role="status">A comparison was started. <button className="text-button" onClick={() => void refreshMatch()} type="button">Refresh status</button></p>}
      {match?.status === "completed" && <div className="job-match-result">
        <h4>{match.match_score === null ? "Insufficient information" : `Practice match: ${match.match_score}/100`}</h4>
        <p>{match.explanation}</p>
        {match.requirement_assessments.length === 0 ? <p>The job description did not contain usable requirements.</p> : <ul>{match.requirement_assessments.map((item, index) => <li key={index}><strong>{item.requirement}</strong> — {item.status.replaceAll("_", " ")}<small>Job: “{item.job_evidence}”</small>{item.resume_evidence && <small>Resume: “{item.resume_evidence}”</small>}<small>{item.explanation}</small></li>)}</ul>}
      </div>}
    </div>}
  </section>;
}
