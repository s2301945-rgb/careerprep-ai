"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getInterview, listInterviews, listJobs, startInterview, submitInterviewAnswer, type Interview, type SavedJob } from "@/lib/api";

type HistoryItem = Pick<Interview, "id" | "status" | "question_count" | "overall_score" | "summary" | "created_at">;

export function InterviewPanel({ resumeId }: { resumeId: string }) {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [jobId, setJobId] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [interview, setInterview] = useState<Interview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const interviewRequest = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [jobResult, historyResult] = await Promise.all([listJobs(), listInterviews(resumeId)]);
      setJobs(jobResult.jobs);
      setHistory(historyResult.interviews);
      setSelectedId((current) => current || historyResult.interviews[0]?.id || "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Interview history could not be loaded."); }
    finally { setLoading(false); }
  }, [resumeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const loadSelected = useCallback(async () => {
    const request = ++interviewRequest.current;
    if (!selectedId) { setInterview(null); return; }
    setLoading(true); setError("");
    try {
      const result = await getInterview(selectedId);
      if (request === interviewRequest.current) setInterview(result.interview);
    } catch (reason) {
      if (request === interviewRequest.current) setError(reason instanceof Error ? reason.message : "This interview could not be loaded.");
    } finally { if (request === interviewRequest.current) setLoading(false); }
  }, [selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSelected(); }, 0);
    return () => { window.clearTimeout(timer); interviewRequest.current += 1; };
  }, [loadSelected]);

  async function begin() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await startInterview(resumeId, jobId || null);
      interviewRequest.current += 1;
      setInterview(result.interview);
      setSelectedId(result.interview.id);
      setHistory((current) => [result.interview, ...current]);
      setDrafts({});
      setNotice("Five questions were saved. Your answers and feedback will remain available here.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The interview could not be started. Try again."); }
    finally { setBusy(false); }
  }

  async function answer(event: FormEvent<HTMLFormElement>, questionId: string, savedText: string | null) {
    event.preventDefault();
    const answerText = savedText ?? drafts[questionId] ?? "";
    if (!answerText.trim() || !interview) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await submitInterviewAnswer(interview.id, questionId, answerText);
      setInterview(result.interview);
      setHistory((current) => current.map((item) => item.id === result.interview.id ? result.interview : item));
      setNotice(result.interview.status === "completed" ? "Interview complete. Review your saved feedback." : "Answer evaluated and saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The answer could not be evaluated. Try again."); }
    finally { setBusy(false); }
  }

  return <section className="interview-panel" aria-labelledby="interview-heading">
    <div className="ai-result-heading"><div><span className="eyebrow">MOCK INTERVIEW</span><h3 id="interview-heading">Practice your answers</h3></div></div>
    <p>Start a five-question text interview based on your confirmed resume. A saved job description is optional. Scores are practice feedback, not a hiring prediction.</p>
    {error && <div className="notice notice-error" role="alert">{error} <button className="text-button" type="button" onClick={() => void refresh()}>Retry loading</button></div>}
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    <div className="interview-start">
      <label>Job context<select value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">No job description</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job_title || "Untitled job"}</option>)}</select></label>
      <button className="button button-secondary" disabled={busy} onClick={() => void begin()} type="button">{busy ? "Working…" : "Start a new interview"}</button>
    </div>
    {loading ? <p role="status">Loading interview history…</p> : history.length === 0 ? <p>No practice interviews yet.</p> : <div className="interview-history">
      <label>Saved interview<select value={selectedId} disabled={busy} onChange={(event) => { interviewRequest.current += 1; setSelectedId(event.target.value); setInterview(null); }}>{history.map((item) => <option value={item.id} key={item.id}>{new Date(item.created_at).toLocaleDateString()} · {item.status.replaceAll("_", " ")}{item.overall_score !== null ? ` · ${item.overall_score}/100` : ""}</option>)}</select></label>
      {interview?.status === "failed" && <p>Question generation failed. Start a new interview to retry.</p>}
      {interview?.status === "pending" && <p>Questions are still being prepared. <button className="text-button" type="button" onClick={() => void loadSelected()}>Refresh status</button></p>}
      {interview?.status === "completed" && <div className="job-match-result"><h4>Practice score: {interview.overall_score}/100</h4><p>{interview.summary}</p></div>}
      {interview?.questions.map((question) => <article className="interview-question" key={question.id}>
        <p className="eyebrow">QUESTION {question.question_number} · {question.question_type.toUpperCase()}</p>
        <h4>{question.question_text}</h4>
        {question.context_quote && <small>Based on: “{question.context_quote}”</small>}
        {question.answer_status === "evaluated" ? <div className="interview-feedback"><p><strong>Answer score: {question.answer_score}/100</strong></p><p>{question.feedback}</p>{question.answer_strengths?.length ? <p>Strengths: {question.answer_strengths.join("; ")}</p> : null}{question.answer_suggestions?.length ? <p>Try next: {question.answer_suggestions.join("; ")}</p> : null}<details><summary>View your answer</summary><p>{question.answer_text}</p></details></div> :
          question.answer_status === "evaluating" ? <p role="status">Answer evaluation is in progress. <button className="text-button" onClick={() => void loadSelected()} type="button">Refresh status</button></p> :
          <form onSubmit={(event) => void answer(event, question.id, question.answer_status === "failed" ? question.answer_text : null)}>
            {question.answer_status === "failed" && <p role="status">Evaluation failed. Retry the same saved answer.</p>}
            <label>Your answer<textarea required maxLength={30000} rows={4} disabled={question.answer_status === "failed" || busy} value={question.answer_status === "failed" ? question.answer_text ?? "" : drafts[question.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [question.id]: event.target.value }))} /></label>
            <button className="button button-secondary" disabled={busy || !(question.answer_status === "failed" ? question.answer_text : drafts[question.id])?.trim()} type="submit">{busy ? "Evaluating…" : question.answer_status === "failed" ? "Retry evaluation" : "Submit answer"}</button>
          </form>}
      </article>)}
    </div>}
  </section>;
}
