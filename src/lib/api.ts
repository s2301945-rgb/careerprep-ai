import { supabase } from "@/lib/supabase";

const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export type ExtractionStatus = "pending" | "processing" | "completed" | "failed";

export type ResumeRecord = {
  id: string;
  display_title: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: string;
  extraction_status: ExtractionStatus;
  extraction_error?: string | null;
  extracted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ResumeListResponse = {
  resumes: ResumeRecord[];
  next_cursor: string | null;
};

export type ResumeSkill = { name: string; evidence: string };
export type ResumeEducation = { credential: string; institution: string; evidence: string };
export type ResumeProject = { name: string; description: string; evidence: string };
export type ResumeHighlight = { text: string; evidence: string };
export type ResumeExperience = { role: string; organization: string; highlights: ResumeHighlight[] };
export type ResumeProfile = {
  resume_id: string;
  summary: string;
  skills: ResumeSkill[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  experience: ResumeExperience[];
  schema_version: string;
  profile_revision: number;
  review_status: "draft" | "confirmed";
  confirmed_at: string | null;
  updated_at: string;
};
export type ResumeAnalysis = {
  id: string;
  status: "processing" | "completed" | "failed";
  overall_score: number | null;
  summary: string | null;
  strengths: Array<{ text: string; evidence: string }>;
  weaknesses: Array<{ text: string; evidence: string }>;
  missing_sections: Array<{ section: string; reason: string }>;
  recommendations: Array<{ text: string; evidence?: string }>;
  rubric_scores: { clarity: number; relevance: number; evidence: number; completeness: number; skill_assessments: Array<{ name: string; score: number; evidence: string }> };
  rubric_version: string;
  model_provider: string | null;
  model_name: string | null;
  prompt_version: string | null;
  created_at: string;
  completed_at: string | null;
};

export type SavedJob = {
  id: string;
  job_title: string | null;
  company_name: string | null;
  description_text: string;
  created_at: string;
};

export type JobMatch = {
  id: string;
  status: "processing" | "completed" | "failed";
  is_stale: boolean;
  match_score: number | null;
  requirement_assessments: Array<{
    requirement: string;
    job_evidence: string;
    status: "met" | "partial" | "not_evidenced" | "unknown";
    resume_evidence: string;
    explanation: string;
  }>;
  explanation: string | null;
  error_code?: string | null;
};

export type InterviewQuestion = {
  id: string;
  question_number: number;
  question_type: "general" | "technical" | "behavioral" | "situational";
  question_text: string;
  context_quote: string;
  answer_text: string | null;
  answer_status: "evaluating" | "evaluated" | "failed" | null;
  answer_score: number | null;
  feedback: string | null;
  answer_strengths: string[] | null;
  answer_suggestions: string[] | null;
};

export type Interview = {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "abandoned";
  question_count: number;
  overall_score: number | null;
  summary: string | null;
  created_at: string;
  questions: InterviewQuestion[];
};

export type AppProfile = {
  id: string;
  email: string;
  name?: string | null;
};

export type HealthResponse = {
  application?: string;
  backend?: "connected" | "not_configured" | "error";
  database?: "connected" | "not_configured" | "error";
  message?: string;
};

export type ReadinessResponse = {
  backend?: "connected" | "not_configured" | "error";
  database?: "connected" | "not_configured" | "error";
};

export type AiTestResponse = {
  ai: "connected" | "not_configured" | "error";
  message: string;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    request_id?: string;
  };
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(message: string, options: { status: number; code?: string; retryable?: boolean; requestId?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
  }
}

export function getApiBaseUrl() {
  return apiBase;
}

async function accessToken() {
  if (!supabase) throw new ApiError("Authentication is not configured for this app.", { status: 0 });

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ApiError("Your session could not be checked. Sign in again to continue.", { status: 401 });
  if (!data.session?.access_token) {
    await supabase.auth.signOut({ scope: "local" });
    throw new ApiError("Your session has expired. Sign in again to continue.", { status: 401, code: "session_expired" });
  }
  return data.session.access_token;
}

function authenticatedOptions(options: RequestInit & { json?: unknown }, token: string): RequestInit {
  const { json, ...requestOptions } = options;
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  let body = requestOptions.body;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }

  return { ...requestOptions, body, headers };
}

async function authenticatedFetch(path: string, options: RequestInit & { json?: unknown } = {}) {
  if (!apiBase) throw new ApiError("The application API is not configured yet.", { status: 0 });

  let token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, authenticatedOptions(options, token));
  } catch {
    throw new ApiError("The application API could not be reached. Check the connection and try again.", { status: 0, retryable: true });
  }

  if (response.status !== 401 || !supabase) return response;

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) {
    await supabase.auth.signOut({ scope: "local" });
    throw new ApiError("Your session expired. Sign in again to continue.", { status: 401, code: "session_expired" });
  }

  token = data.session.access_token;
  try {
    response = await fetch(`${apiBase}${path}`, authenticatedOptions(options, token));
  } catch {
    throw new ApiError("The application API could not be reached. Check the connection and try again.", { status: 0, retryable: true });
  }

  if (response.status === 401) {
    await supabase.auth.signOut({ scope: "local" });
    throw new ApiError("Your session expired. Sign in again to continue.", { status: 401, code: "session_expired" });
  }
  return response;
}

async function responseError(response: Response) {
  let payload: ApiErrorPayload = {};
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    // Some infrastructure errors return plain text or no body.
  }
  return new ApiError(
    payload.error?.message ?? payload.message ?? "The request could not be completed. Try again.",
    {
      status: response.status,
      code: payload.error?.code,
      retryable: payload.error?.retryable,
      requestId: payload.error?.request_id,
    },
  );
}

async function requestJson<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const response = await authenticatedFetch(path, options);
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getCurrentProfile() {
  return requestJson<{ user: AppProfile }>("/api/v1/me");
}

export function listResumes(cursor?: string | null) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return requestJson<ResumeListResponse>(`/api/v1/resumes?${params.toString()}`);
}

export function getResume(id: string) {
  return requestJson<{ resume: ResumeRecord }>(`/api/v1/resumes/${encodeURIComponent(id)}`);
}

export function uploadResume(file: File, displayTitle: string) {
  const form = new FormData();
  form.set("file", file);
  if (displayTitle.trim()) form.set("display_title", displayTitle.trim());
  return requestJson<{ resume: ResumeRecord }>("/api/v1/resumes", { method: "POST", body: form });
}

export function renameResume(id: string, displayTitle: string) {
  return requestJson<{ resume: ResumeRecord }>(`/api/v1/resumes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: { display_title: displayTitle },
  });
}

export function deleteResume(id: string) {
  return requestJson<void>(`/api/v1/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function extractResumeProfile(id: string) {
  return requestJson<{ profile: ResumeProfile }>(`/api/v1/resumes/${encodeURIComponent(id)}/extract`, { method: "POST" });
}

export function getResumeProfile(id: string) {
  return requestJson<{ profile: ResumeProfile }>(`/api/v1/resumes/${encodeURIComponent(id)}/profile`);
}

export function confirmResumeProfile(id: string, profile: Pick<ResumeProfile, "summary" | "skills" | "education" | "projects" | "experience">) {
  return requestJson<{ profile: ResumeProfile }>(`/api/v1/resumes/${encodeURIComponent(id)}/profile`, {
    method: "PATCH",
    json: profile,
  });
}

export function runResumeAnalysis(id: string) {
  return requestJson<{ analysis: ResumeAnalysis }>(`/api/v1/resumes/${encodeURIComponent(id)}/analysis`, { method: "POST" });
}

export function getResumeAnalysis(id: string) {
  return requestJson<{ analysis: ResumeAnalysis }>(`/api/v1/resumes/${encodeURIComponent(id)}/analysis`);
}

export function listJobs() {
  return requestJson<{ jobs: SavedJob[] }>("/api/v1/jobs");
}

export function saveJob(input: { job_title: string; company_name: string; description_text: string }) {
  return requestJson<{ job: SavedJob }>("/api/v1/jobs", { method: "POST", json: input });
}

export function getJobMatch(resumeId: string, jobId: string) {
  return requestJson<{ match: JobMatch | null }>(`/api/v1/resumes/${encodeURIComponent(resumeId)}/jobs/${encodeURIComponent(jobId)}/match`);
}

export function runJobMatch(resumeId: string, jobId: string) {
  return requestJson<{ match: JobMatch }>(`/api/v1/resumes/${encodeURIComponent(resumeId)}/jobs/${encodeURIComponent(jobId)}/match`, { method: "POST" });
}

export function listInterviews(resumeId: string) {
  return requestJson<{ interviews: Array<Pick<Interview, "id" | "status" | "question_count" | "overall_score" | "summary" | "created_at">> }>(`/api/v1/resumes/${encodeURIComponent(resumeId)}/interviews`);
}

export function startInterview(resumeId: string, jobId: string | null) {
  return requestJson<{ interview: Interview }>(`/api/v1/resumes/${encodeURIComponent(resumeId)}/interviews`, { method: "POST", json: { job_id: jobId } });
}

export function getInterview(id: string) {
  return requestJson<{ interview: Interview }>(`/api/v1/interviews/${encodeURIComponent(id)}`);
}

export function submitInterviewAnswer(interviewId: string, questionId: string, answerText: string) {
  return requestJson<{ interview: Interview }>(`/api/v1/interviews/${encodeURIComponent(interviewId)}/questions/${encodeURIComponent(questionId)}/answer`, { method: "POST", json: { answer_text: answerText } });
}

export async function downloadResume(id: string) {
  const response = await authenticatedFetch(`/api/v1/resumes/${encodeURIComponent(id)}/file`);
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export async function getHealth() {
  if (!apiBase) throw new ApiError("Set NEXT_PUBLIC_API_URL to check the backend.", { status: 0 });
  let response: Response;
  try {
    response = await fetch(`${apiBase}/health`, { cache: "no-store" });
  } catch {
    throw new ApiError("The backend health endpoint could not be reached.", { status: 0, retryable: true });
  }
  let payload: HealthResponse = {};
  try {
    payload = (await response.json()) as HealthResponse;
  } catch {
    throw new ApiError("The backend returned an unreadable health response.", { status: response.status });
  }
  if (!response.ok && !payload.backend) throw new ApiError(payload.message ?? "The backend health check failed.", { status: response.status });
  return payload;
}

export async function getReadiness() {
  if (!apiBase) throw new ApiError("The application API is not configured yet.", { status: 0 });
  let response: Response;
  try {
    response = await fetch(`${apiBase}/ready`, { cache: "no-store" });
  } catch {
    throw new ApiError("The application database readiness check could not be reached.", { status: 0, retryable: true });
  }

  let payload: ReadinessResponse = {};
  try {
    payload = (await response.json()) as ReadinessResponse;
  } catch {
    throw new ApiError("The application database readiness response could not be read.", { status: response.status });
  }
  if (!response.ok || payload.database !== "connected") {
    throw new ApiError("The private application database is unavailable.", { status: response.status || 503, retryable: true });
  }
  return payload;
}

export function testAiConnection() {
  return requestJson<AiTestResponse>("/ai-test", { method: "POST" });
}

