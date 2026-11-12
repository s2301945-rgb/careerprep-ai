"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  deleteResume,
  downloadResume,
  extractResumeProfile,
  getResumeAnalysis,
  getCurrentProfile,
  getResume,
  getResumeProfile,
  listResumes,
  confirmResumeProfile,
  renameResume,
  runResumeAnalysis,
  uploadResume,
  type ResumeAnalysis,
  type AppProfile,
  type ResumeProfile,
  type ResumeRecord,
} from "@/lib/api";
import { ServiceDiagnostics } from "@/components/service-diagnostics";
import { JobMatchPanel } from "@/components/job-match-panel";
import { InterviewPanel } from "@/components/interview-panel";

type ResumeWorkspaceProps = {
  email: string;
  onSignOut: () => void;
  sessionNotice?: string;
};

type ResumeUpdate = Pick<ResumeRecord, "id"> & Partial<ResumeRecord>;

const resumeLimitBytes = 10 * 1024 * 1024;

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function initials(email: string) {
  const part = email.split("@")[0]?.trim() ?? "";
  return part.slice(0, 2).toUpperCase() || "CP";
}

function statusText(status: ResumeRecord["extraction_status"]) {
  switch (status) {
    case "processing": return "Processing";
    case "completed": return "Extracted";
    case "failed": return "Needs attention";
    default: return "Saved";
  }
}

function statusClass(status: ResumeRecord["extraction_status"]) {
  return status === "failed" ? "resume-status resume-status-failed" : `resume-status resume-status-${status}`;
}

function DocumentIcon() {
  return <span className="document-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 3.75h6.2L18 8.6v11.65H7a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z" /><path d="M13 4v5h5M8.5 13h7M8.5 16.5h7" /></svg></span>;
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className={`spinner${dark ? " spinner-dark" : ""}`} aria-hidden="true" />;
}

export function ResumeWorkspace({ email, onSignOut, sessionNotice = "" }: ResumeWorkspaceProps) {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");

  const loadPage = useCallback(async (cursor?: string | null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError("");
    try {
      const result = await listResumes(cursor);
      setResumes((current) => append ? [...current, ...result.resumes] : result.resumes);
      setNextCursor(result.next_cursor);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Your resumes could not be loaded.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadPage(); }, 0);
    getCurrentProfile().then((result) => {
      setProfile(result.user);
      setProfileError("");
    }).catch((reason: unknown) => {
      setProfileError(reason instanceof Error ? reason.message : "Your account details could not be loaded.");
    });
    return () => window.clearTimeout(initialLoad);
  }, [loadPage]);

  const filteredResumes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return resumes;
    return resumes.filter((resume) => `${resume.display_title} ${resume.original_filename}`.toLocaleLowerCase().includes(query));
  }, [resumes, search]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError("");
    setUploadNotice("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const candidate = formData.get("file");
    const file = candidate instanceof File ? candidate : null;
    const title = String(formData.get("display_title") ?? "").trim();

    if (!file) {
      setUploadError("Choose a PDF or DOCX file to upload.");
      return;
    }
    const isPdf = file.type === "application/pdf" || file.name.toLocaleLowerCase().endsWith(".pdf");
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.toLocaleLowerCase().endsWith(".docx");
    if (!isPdf && !isDocx) {
      setUploadError("Upload a PDF or DOCX document.");
      return;
    }
    if (file.size === 0 || file.size > resumeLimitBytes) {
      setUploadError("Choose a file that is 10 MiB or smaller.");
      return;
    }
    if (title.length > 150) {
      setUploadError("The display title must be 150 characters or fewer.");
      return;
    }

    setUploading(true);
    try {
      const result = await uploadResume(file, title);
      setResumes((current) => [result.resume, ...current.filter((resume) => resume.id !== result.resume.id)]);
      setUploadNotice("Your resume was saved to your private workspace.");
      form.reset();
      setSelectedFileName("");
      await loadPage();
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : "Your resume could not be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const updateResume = useCallback((updated: ResumeUpdate) => {
    setResumes((current) => current.map((resume) => resume.id === updated.id ? { ...resume, ...updated } : resume));
  }, []);

  const removeResume = useCallback((id: string) => {
    setResumes((current) => current.filter((resume) => resume.id !== id));
    setNextCursor(null);
    setSelectedId(null);
    void loadPage();
  }, [loadPage]);

  const shownName = profile?.name?.trim() || profile?.email || email;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand-lockup sidebar-brand" href="#workspace" aria-label="CareerPrep workspace">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>CareerPrep</span>
        </a>
        <p className="sidebar-section-label">WORKSPACE</p>
        <nav className="side-nav">
          <a className="side-nav-link side-nav-link-active" href="#resume-library" aria-current="page"><span className="nav-icon nav-icon-home" aria-hidden="true" />Overview</a>
          <a className="side-nav-link" href="#resume-library"><span className="nav-icon nav-icon-files" aria-hidden="true" />My resumes<span className="nav-count">{resumes.length}</span></a>
        </nav>
        <div className="sidebar-tip">
          <span className="tip-mark" aria-hidden="true">✦</span>
          <p className="sidebar-section-label">YOUR SPACE</p>
          <h2>One step at a time.</h2>
          <p>Keep your career documents organized while you work toward what’s next.</p>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-account"><span className="avatar avatar-small" aria-hidden="true">{initials(email)}</span><div><strong>{shownName}</strong><span>Personal workspace</span></div></div>
          <button className="signout-link" onClick={onSignOut} type="button"><span className="signout-icon" aria-hidden="true">↗</span>Sign out</button>
        </div>
      </aside>

      <main className="workspace-main" id="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>Overview</strong></div>
          <div className="topbar-account"><span className="avatar" aria-hidden="true">{initials(email)}</span><span>{shownName}</span><button className="topbar-signout" onClick={onSignOut} type="button">Sign out</button></div>
        </header>

        {(loadError && loadError.toLowerCase().includes("session")) && <div className="notice notice-error session-notice" role="alert">{loadError}</div>}
        {sessionNotice && <div className="notice notice-warning session-notice" role="status">{sessionNotice}</div>}
        {profileError && <div className="notice notice-warning account-notice" role="status">Account details could not be loaded. Your resume workspace can still be used.</div>}

        <section className="welcome-banner" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="eyebrow">YOUR CAREER TOOLKIT</p>
            <h1 id="welcome-title">A little progress adds up.</h1>
            <p>Keep your resume close and ready for the opportunities ahead.</p>
          </div>
          <div className="welcome-note"><span className="welcome-note-star" aria-hidden="true">✦</span><div><strong>Your private space</strong><span>Only you can access your saved files.</span></div></div>
          <span className="welcome-decoration welcome-decoration-one" aria-hidden="true" />
          <span className="welcome-decoration welcome-decoration-two" aria-hidden="true" />
        </section>

        <div className="workspace-columns">
          <section className="library-card" id="resume-library" aria-labelledby="library-title">
            <div className="section-heading library-heading">
              <div>
                <p className="eyebrow">DOCUMENTS</p>
                <h2 id="library-title">My resumes <span className="heading-count">{loading ? "…" : resumes.length}</span></h2>
                <p className="section-description">Your resume files, saved in one place.</p>
              </div>
              <button className="icon-button" aria-label="Refresh resumes" disabled={loading || loadingMore} onClick={() => void loadPage()} type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.7 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.3-2" /></svg></button>
            </div>

            <label className="search-field" htmlFor="resume-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.3 4.3" /></svg><input autoComplete="off" id="resume-search" onChange={(event) => setSearch(event.target.value)} placeholder="Search your resumes" type="search" value={search} /></label>

            {loadError && !loadError.toLowerCase().includes("session") && <div className="notice notice-error list-error" role="alert"><span>{loadError}</span><button className="text-button" onClick={() => void loadPage()} type="button">Try again</button></div>}
            {loading ? (
              <div className="resume-list" role="status">
                <span className="sr-only">Loading resumes…</span>
                {[0, 1, 2].map((item) => <div className="resume-skeleton" aria-hidden="true" key={item}><span className="skeleton-icon" /><span className="skeleton-lines"><i /><i /></span><span className="skeleton-action" /></div>)}
              </div>
            ) : filteredResumes.length > 0 ? (
              <div className="resume-list" aria-label="Saved resumes">
                {filteredResumes.map((resume) => (
                  <article className="resume-row" key={resume.id}>
                    <DocumentIcon />
                    <div className="resume-row-main">
                      <div className="resume-row-title"><h3 title={resume.display_title}>{resume.display_title}</h3><span className={statusClass(resume.extraction_status)}><span className="resume-status-dot" aria-hidden="true" />{statusText(resume.extraction_status)}</span></div>
                      <p>{resume.original_filename}</p>
                      <div className="resume-row-meta"><span>{formatBytes(resume.file_size_bytes)}</span><span className="meta-divider" aria-hidden="true">·</span><span>Saved {formatDate(resume.created_at)}</span></div>
                    </div>
                    <button className="row-action" aria-label={`View details for ${resume.display_title}`} onClick={() => setSelectedId(resume.id)} type="button">View details<span aria-hidden="true">›</span></button>
                  </article>
                ))}
              </div>
            ) : loadError ? null : resumes.length > 0 ? (
              <div className="empty-state empty-search"><span className="empty-illustration" aria-hidden="true">⌕</span><h3>No matches found</h3><p>Try a different title or filename.</p><button className="text-button" onClick={() => setSearch("")} type="button">Clear search</button></div>
            ) : (
              <div className="empty-state"><span className="empty-illustration" aria-hidden="true"><DocumentIcon /></span><h3>Your resume library is ready</h3><p>Upload a PDF or DOCX to keep your experience close and organized.</p><a className="text-button" href="#upload-resume">Upload your first resume <span aria-hidden="true">↓</span></a></div>
            )}

            {!loading && nextCursor && <button className="button button-load-more" disabled={loadingMore} onClick={() => void loadPage(nextCursor, true)} type="button">{loadingMore ? <><Spinner dark /> Loading more…</> : "Load more resumes"}</button>}
            {!loading && resumes.length > 0 && <p className="list-footnote">Showing {filteredResumes.length} of {resumes.length}{nextCursor ? " loaded" : " saved"} resume{resumes.length === 1 ? "" : "s"}.</p>}
          </section>

          <section className="upload-card" id="upload-resume" aria-labelledby="upload-title">
            <div className="upload-card-heading">
              <span className="upload-spark" aria-hidden="true">✦</span>
              <p className="eyebrow">ADD A DOCUMENT</p>
              <h2 id="upload-title">Make room for what’s next.</h2>
              <p>Save a resume to your personal library. You can rename or download it any time.</p>
            </div>
            <form className="upload-form" onSubmit={handleUpload}>
              <label className="field-label" htmlFor="display-title">Display title <span className="optional-label">Optional</span></label>
              <input id="display-title" maxLength={150} name="display_title" placeholder="e.g. Product Designer Resume" type="text" />
              <label className="field-label file-label" htmlFor="resume-file">Resume file</label>
              <div className="file-picker">
                <input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-describedby="resume-file-help" id="resume-file" name="file" onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")} required type="file" />
                <span className="file-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></svg></span>
                <span className="file-picker-copy"><strong title={selectedFileName || undefined}>{selectedFileName || "Choose a file"}</strong><span>{selectedFileName ? "Ready to upload" : "Browse your device"}</span></span>
                <span className="file-picker-hint" id="resume-file-help">PDF or DOCX<br />Up to 10 MiB</span>
              </div>
              {uploadError && <p className="inline-message inline-error" role="alert">{uploadError}</p>}
              {uploadNotice && <p className="inline-message inline-success" role="status">{uploadNotice}</p>}
              <button className="button button-primary button-full upload-submit" disabled={uploading} type="submit">{uploading ? <><Spinner /> Uploading securely…</> : "Upload resume"}<span aria-hidden="true">↑</span></button>
              <p className="upload-privacy"><span aria-hidden="true">♢</span> Your document is private to your account.</p>
            </form>
          </section>
        </div>

        <ServiceDiagnostics />

        <footer className="workspace-footer"><span>CareerPrep</span><span>Take your next step at your own pace.</span></footer>
      </main>

      {selectedId && <ResumeDetailDialog key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} onDeleted={removeResume} onUpdated={updateResume} />}
    </div>
  );
}

function ResumeDetailDialog({ id, onClose, onDeleted, onUpdated }: { id: string; onClose: () => void; onDeleted: (id: string) => void; onUpdated: (resume: ResumeUpdate) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [resume, setResume] = useState<ResumeRecord | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [aiAction, setAiAction] = useState<"extract" | "confirm" | "analyze" | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(true);
  const [aiLoadError, setAiLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const aiBusy = aiAction !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  useEffect(() => {
    let active = true;
    getResume(id).then((result) => {
      if (!active) return;
      setResume(result.resume);
      setTitle(result.resume.display_title);
    }).catch((reason: unknown) => {
      if (active) setActionError(reason instanceof Error ? reason.message : "Resume details could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    Promise.allSettled([getResumeProfile(id), getResumeAnalysis(id)]).then(([savedProfile, savedAnalysis]) => {
      if (!active) return;
      if (savedProfile.status === "fulfilled") {
        setProfile(savedProfile.value.profile);
      } else if (!(savedProfile.reason instanceof ApiError) || savedProfile.reason.code !== "PROFILE_NOT_FOUND") {
        setAiLoadError("The saved profile could not be loaded. Check the connection and try again.");
      }
      if (savedAnalysis.status === "fulfilled") {
        setAnalysis(savedAnalysis.value.analysis);
      } else if (!(savedAnalysis.reason instanceof ApiError) || savedAnalysis.reason.code !== "ANALYSIS_NOT_FOUND") {
        setAiLoadError((current) => current || "The saved analysis could not be loaded. Check the connection and try again.");
      }
      setAiLoading(false);
    });
    return () => { active = false; };
  }, [id, loadAttempt]);

  function retryDetails() {
    setLoading(true);
    setAiLoading(true);
    setActionError("");
    setAiError("");
    setAiLoadError("");
    setProfile(null);
    setAnalysis(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resume) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setActionError("Enter a title for this resume.");
      return;
    }
    if (nextTitle.length > 150) {
      setActionError("The display title must be 150 characters or fewer.");
      return;
    }
    setSaving(true);
    setActionError("");
    setActionNotice("");
    try {
      const result = await renameResume(id, nextTitle);
      setResume(result.resume);
      setTitle(result.resume.display_title);
      onUpdated(result.resume);
      setActionNotice("Resume title updated.");
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The title could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadFile() {
    if (!resume) return;
    setDownloading(true);
    setActionError("");
    try {
      const blob = await downloadResume(id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = resume.original_filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The original file could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  async function confirmAndDelete() {
    setDeleting(true);
    setActionError("");
    try {
      await deleteResume(id);
      onDeleted(id);
    } catch (reason) {
      const retryHint = reason instanceof ApiError && reason.retryable ? " You can try again." : "";
      setActionError(`${reason instanceof Error ? reason.message : "The resume could not be deleted."}${retryHint}`);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function extractProfile() {
    if (!resume) return;
    setAiAction("extract");
    setAiError("");
    setActionNotice("");
    try {
      const result = await extractResumeProfile(id);
      setProfile(result.profile);
      setAnalysis(null);
      const updated: ResumeUpdate = { id, extraction_status: "completed", extraction_error: null };
      setResume((current) => current ? { ...current, ...updated } : current);
      onUpdated(updated);
      setActionNotice("Profile extracted. Review the details before confirming them.");
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : "The resume profile could not be extracted.");
    } finally {
      setAiAction(null);
    }
  }

  async function confirmProfile() {
    if (!profile) return;
    setAiAction("confirm");
    setAiError("");
    setActionNotice("");
    try {
      const result = await confirmResumeProfile(id, {
        summary: profile.summary,
        skills: profile.skills,
        education: profile.education,
        projects: profile.projects,
        experience: profile.experience,
      });
      setProfile(result.profile);
      setActionNotice("Profile confirmed. You can now generate an analysis.");
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : "The profile could not be confirmed.");
    } finally {
      setAiAction(null);
    }
  }

  async function analyzeResume() {
    setAiAction("analyze");
    setAiError("");
    setActionNotice("");
    try {
      const result = await runResumeAnalysis(id);
      setAnalysis(result.analysis);
      setActionNotice("Analysis saved to this resume.");
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : "The resume could not be analyzed.");
    } finally {
      setAiAction(null);
    }
  }

  function updateProfile(change: (current: ResumeProfile) => ResumeProfile) {
    setProfile((current) => current ? change(current) : current);
  }

  function updateSkill(index: number, field: "name" | "evidence", value: string) {
    updateProfile((current) => ({ ...current, skills: current.skills.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function updateEducation(index: number, field: "credential" | "institution" | "evidence", value: string) {
    updateProfile((current) => ({ ...current, education: current.education.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function updateProject(index: number, field: "name" | "description" | "evidence", value: string) {
    updateProfile((current) => ({ ...current, projects: current.projects.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function updateExperience(index: number, field: "role" | "organization", value: string) {
    updateProfile((current) => ({ ...current, experience: current.experience.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function updateHighlight(experienceIndex: number, highlightIndex: number, field: "text" | "evidence", value: string) {
    updateProfile((current) => ({
      ...current,
      experience: current.experience.map((item, itemIndex) => itemIndex === experienceIndex
        ? { ...item, highlights: item.highlights.map((highlight, index) => index === highlightIndex ? { ...highlight, [field]: value } : highlight) }
        : item),
    }));
  }

  return (
    <dialog className="resume-dialog" ref={dialogRef} aria-labelledby="resume-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}>
      <div className="dialog-content">
        <header className="dialog-header">
          <div><p className="eyebrow">RESUME DETAILS</p><h2 id="resume-dialog-title">{resume?.display_title ?? "Resume"}</h2></div>
          <button className="icon-button dialog-close" aria-label="Close resume details" autoFocus onClick={onClose} type="button"><span aria-hidden="true">×</span></button>
        </header>
        {actionError && <div className="notice notice-error" role="alert">{actionError}</div>}
        {aiError && <div className="notice notice-error" role="alert">{aiError}</div>}
        {actionNotice && <div className="notice notice-success" role="status">{actionNotice}</div>}
        {loading ? (
          <div className="detail-loading" aria-live="polite"><Spinner dark /><span>Loading resume details…</span></div>
        ) : resume ? (
          <>
            <div className="detail-file-card"><DocumentIcon /><div><strong>{resume.original_filename}</strong><span>{formatBytes(resume.file_size_bytes)} <span aria-hidden="true">·</span> Added {formatDate(resume.created_at)}</span></div><span className={statusClass(resume.extraction_status)}>{statusText(resume.extraction_status)}</span></div>

            <form className="rename-form" onSubmit={saveTitle}>
              <label className="field-label" htmlFor="rename-title">Display title</label>
              <div className="rename-control"><input id="rename-title" maxLength={150} onChange={(event) => setTitle(event.target.value)} value={title} /><button className="button button-secondary" disabled={saving || deleting || title.trim() === resume.display_title} type="submit">{saving ? <><Spinner dark /> Saving…</> : "Save title"}</button></div>
            </form>

            <section className="extraction-info" aria-labelledby="extraction-title">
              {aiLoading && <p className="inline-message" role="status">Checking saved profile and analysis…</p>}
              {aiLoadError && <div className="notice notice-error" role="alert">
                <span>{aiLoadError}</span>{" "}
                <button className="text-button" onClick={retryDetails} type="button">Try again</button>
              </div>}
              {aiAction && <p className="sr-only" role="status">
                {aiAction === "extract" ? "Extracting resume profile." : aiAction === "confirm" ? "Saving confirmed profile." : "Analyzing resume."}
              </p>}
              <div className="extraction-info-title"><span className="extraction-spark" aria-hidden="true">✦</span><div><h3 id="extraction-title">Resume processing</h3><p>{resume.extraction_status === "completed" ? "Text extraction is complete." : resume.extraction_status === "processing" ? "Your document is being processed." : resume.extraction_status === "failed" ? "This document could not be processed." : "Your file is saved. Extract a profile to review your details and generate an analysis."}</p></div></div>
              <p className="ai-privacy-note">When you run extraction, analysis, job matching, or a mock interview, relevant resume text and any selected job description are sent from the backend to Groq for processing. Your browser does not send these documents directly to Groq.</p>
              {!aiLoading && !aiLoadError && !profile && <button className="button button-secondary" disabled={aiBusy || deleting} onClick={() => void extractProfile()} type="button">{aiBusy ? <><Spinner dark /> Extracting profile…</> : resume.extraction_status === "failed" ? "Retry profile extraction" : "Extract resume profile"}</button>}
              {!aiLoading && !aiLoadError && profile && <div className="ai-profile-card">
                <div className="ai-result-heading"><div><span className="eyebrow">AI EXTRACTED PROFILE</span><h4>Review the details</h4></div><span className={`resume-status ${profile.review_status === "confirmed" ? "resume-status-completed" : "resume-status-pending"}`}>{profile.review_status === "confirmed" ? "Confirmed" : "Needs review"}</span></div>
                {profile.review_status === "draft" ? <fieldset className="ai-profile-editor" disabled={aiBusy || deleting} aria-label="Edit extracted resume profile">
                  <label className="ai-edit-field"><span>Summary</span><textarea maxLength={700} onChange={(event) => updateProfile((current) => ({ ...current, summary: event.target.value }))} value={profile.summary} /></label>
                  <div className="ai-profile-section"><strong>Skills and source evidence</strong>{profile.skills.map((skill, index) => <div className="ai-edit-row" key={index}><input aria-label={`Skill ${index + 1}`} maxLength={80} onChange={(event) => updateSkill(index, "name", event.target.value)} value={skill.name} /><input aria-label={`Evidence for skill ${index + 1}`} maxLength={400} onChange={(event) => updateSkill(index, "evidence", event.target.value)} value={skill.evidence} /><button className="ai-remove-button" onClick={() => updateProfile((current) => ({ ...current, skills: current.skills.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Remove</button></div>)}<button className="ai-add-button" onClick={() => updateProfile((current) => ({ ...current, skills: [...current.skills, { name: "", evidence: "" }] }))} type="button">Add a skill</button></div>
                  <div className="ai-profile-section"><strong>Education</strong>{profile.education.map((item, index) => <div className="ai-edit-group" key={index}><input aria-label={`Credential ${index + 1}`} maxLength={160} placeholder="Credential or degree" onChange={(event) => updateEducation(index, "credential", event.target.value)} value={item.credential} /><input aria-label={`Institution ${index + 1}`} maxLength={160} placeholder="School or institution, if stated" onChange={(event) => updateEducation(index, "institution", event.target.value)} value={item.institution} /><input aria-label={`Education evidence ${index + 1}`} maxLength={400} placeholder="Exact phrase from the resume" onChange={(event) => updateEducation(index, "evidence", event.target.value)} value={item.evidence} /><button className="ai-remove-button" onClick={() => updateProfile((current) => ({ ...current, education: current.education.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Remove education</button></div>)}<button className="ai-add-button" onClick={() => updateProfile((current) => ({ ...current, education: [...current.education, { credential: "", institution: "", evidence: "" }] }))} type="button">Add education</button></div>
                  <div className="ai-profile-section"><strong>Projects</strong>{profile.projects.map((item, index) => <div className="ai-edit-group" key={index}><input aria-label={`Project ${index + 1}`} maxLength={160} placeholder="Project name" onChange={(event) => updateProject(index, "name", event.target.value)} value={item.name} /><input aria-label={`Project description ${index + 1}`} maxLength={300} placeholder="What the project did" onChange={(event) => updateProject(index, "description", event.target.value)} value={item.description} /><input aria-label={`Project evidence ${index + 1}`} maxLength={400} placeholder="Exact phrase from the resume" onChange={(event) => updateProject(index, "evidence", event.target.value)} value={item.evidence} /><button className="ai-remove-button" onClick={() => updateProfile((current) => ({ ...current, projects: current.projects.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Remove project</button></div>)}<button className="ai-add-button" onClick={() => updateProfile((current) => ({ ...current, projects: [...current.projects, { name: "", description: "", evidence: "" }] }))} type="button">Add a project</button></div>
                  <div className="ai-profile-section"><strong>Experience and project highlights</strong>{profile.experience.map((item, index) => <div className="ai-edit-group" key={index}><input aria-label={`Role ${index + 1}`} maxLength={160} placeholder="Role or project, if stated" onChange={(event) => updateExperience(index, "role", event.target.value)} value={item.role} /><input aria-label={`Organization ${index + 1}`} maxLength={160} placeholder="Organization (optional)" onChange={(event) => updateExperience(index, "organization", event.target.value)} value={item.organization} />{item.highlights.map((highlight, highlightIndex) => <div className="ai-edit-row" key={highlightIndex}><input aria-label={`Highlight ${index + 1}.${highlightIndex + 1}`} maxLength={300} placeholder="What you did" onChange={(event) => updateHighlight(index, highlightIndex, "text", event.target.value)} value={highlight.text} /><input aria-label={`Highlight evidence ${index + 1}.${highlightIndex + 1}`} maxLength={400} placeholder="Exact resume evidence" onChange={(event) => updateHighlight(index, highlightIndex, "evidence", event.target.value)} value={highlight.evidence} /></div>)}<button className="ai-add-button" onClick={() => updateProfile((current) => ({ ...current, experience: current.experience.map((entry, itemIndex) => itemIndex === index ? { ...entry, highlights: [...entry.highlights, { text: "", evidence: "" }] } : entry) }))} type="button">Add a highlight</button><button className="ai-remove-button" onClick={() => updateProfile((current) => ({ ...current, experience: current.experience.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Remove experience</button></div>)}<button className="ai-add-button" onClick={() => updateProfile((current) => ({ ...current, experience: [...current.experience, { role: "", organization: "", highlights: [] }] }))} type="button">Add experience</button></div>
                </fieldset> : <>
                  <p className="ai-profile-summary">{profile.summary}</p>
                  {profile.skills.length > 0 && <div className="ai-profile-section"><strong>Skills</strong><ul>{profile.skills.map((skill, index) => <li key={`${skill.name}-${index}`}><span>{skill.name}</span><small>“{skill.evidence}”</small></li>)}</ul></div>}
                  {profile.education.length > 0 && <div className="ai-profile-section"><strong>Education</strong><ul>{profile.education.map((item, index) => <li key={`${item.institution}-${index}`}><span>{[item.credential, item.institution].filter(Boolean).join(" · ")}</span><small>“{item.evidence}”</small></li>)}</ul></div>}
                  {profile.projects.length > 0 && <div className="ai-profile-section"><strong>Projects</strong><ul>{profile.projects.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}: {item.description}</span><small>“{item.evidence}”</small></li>)}</ul></div>}
                  {profile.experience.length > 0 && <div className="ai-profile-section"><strong>Experience</strong><ul>{profile.experience.map((item, index) => <li key={`${item.role}-${index}`}><span>{[item.role, item.organization].filter(Boolean).join(" · ")}</span>{item.highlights.map((highlight, highlightIndex) => <small key={highlightIndex}>{highlight.text} — “{highlight.evidence}”</small>)}</li>)}</ul></div>}
                </>}
                {profile.review_status === "draft" ? <button className="button button-secondary" disabled={aiBusy || deleting} onClick={() => void confirmProfile()} type="button">{aiBusy ? <><Spinner dark /> Saving…</> : "Confirm this profile"}</button> : <button className="button button-secondary" disabled={aiBusy || deleting} onClick={() => void analyzeResume()} type="button">{aiBusy ? <><Spinner dark /> Analyzing…</> : analysis?.status === "completed" ? "Run analysis again" : analysis?.status === "failed" ? "Retry analysis" : "Analyze resume"}</button>}
              </div>}
              {!aiLoading && !aiLoadError && analysis?.status === "completed" && <AnalysisResult analysis={analysis} />}
              {!aiLoading && !aiLoadError && analysis?.status === "failed" && <p className="inline-message inline-error" role="status">The last analysis failed. You can retry it.</p>}
              {!aiLoading && !aiLoadError && analysis?.status === "processing" && !aiBusy && <div className="inline-message" role="status">
                An analysis was started. Refresh to check for a result.{" "}
                <button className="text-button" onClick={retryDetails} type="button">Refresh status</button>
              </div>}
              {!aiLoading && !aiLoadError && profile?.review_status === "confirmed" && <JobMatchPanel resumeId={id} />}
              {!aiLoading && !aiLoadError && profile?.review_status === "confirmed" && <InterviewPanel resumeId={id} />}
            </section>

            {confirmDelete ? (
              <div className="delete-confirm" role="group" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description">
                <div className="delete-confirm-icon" aria-hidden="true">!</div>
                <div className="delete-confirm-copy"><h3 id="delete-confirm-title">Delete this resume?</h3><p id="delete-confirm-description">This removes the saved resume and its stored file. You can’t undo this action.</p></div>
                <div className="delete-confirm-actions"><button className="button button-secondary" disabled={deleting} onClick={() => setConfirmDelete(false)} type="button">Keep resume</button><button className="button button-danger" disabled={deleting || aiBusy || saving || downloading} onClick={() => void confirmAndDelete()} type="button">{deleting ? <><Spinner /> Deleting…</> : "Delete resume"}</button></div>
              </div>
            ) : (
              <div className="detail-actions"><button className="button button-secondary" disabled={downloading || deleting} onClick={() => void downloadFile()} type="button">{downloading ? <><Spinner dark /> Preparing file…</> : <><span aria-hidden="true">↓</span> Download original</>}</button><button className="button button-danger-quiet" disabled={aiBusy || saving || downloading} onClick={() => { setActionError(""); setConfirmDelete(true); }} type="button">Delete resume</button></div>
            )}
          </>
        ) : <div className="empty-state detail-empty"><h3>Resume details unavailable</h3><p>It may have been removed or you may have signed out.</p><button className="button button-secondary" onClick={retryDetails} type="button">Try again</button></div>}
      </div>
    </dialog>
  );
}

function AnalysisResult({ analysis }: { analysis: ResumeAnalysis }) {
  const rubric = [
    ["Clarity", analysis.rubric_scores.clarity],
    ["Relevance", analysis.rubric_scores.relevance],
    ["Evidence", analysis.rubric_scores.evidence],
    ["Completeness", analysis.rubric_scores.completeness],
  ] as const;
  return (
    <section className="analysis-result" aria-labelledby="analysis-result-title">
      <div className="analysis-result-heading"><div><span className="eyebrow">SAVED AI ANALYSIS</span><h3 id="analysis-result-title">Resume score</h3></div><strong className="analysis-score">{analysis.overall_score}<small>/100</small></strong></div>
      <p>{analysis.summary}</p>
      <div className="analysis-rubric" aria-label="Resume score by rubric category">{rubric.map(([label, score]) => <div key={label}><span>{label}</span><strong>{score}</strong></div>)}</div>
      {analysis.strengths.length > 0 && <div className="ai-profile-section"><strong>Strengths</strong><ul>{analysis.strengths.map((item, index) => <li key={index}><span>{item.text}</span><small>“{item.evidence}”</small></li>)}</ul></div>}
      {analysis.weaknesses.length > 0 && <div className="ai-profile-section"><strong>Areas to improve</strong><ul>{analysis.weaknesses.map((item, index) => <li key={index}><span>{item.text}</span><small>“{item.evidence}”</small></li>)}</ul></div>}
      {analysis.missing_sections.length > 0 && <div className="ai-profile-section"><strong>Information to add</strong><ul>{analysis.missing_sections.map((item, index) => <li key={index}><span>{item.section}</span><small>{item.reason}</small></li>)}</ul></div>}
      {analysis.recommendations.length > 0 && <div className="ai-profile-section"><strong>Next steps</strong><ul>{analysis.recommendations.map((item, index) => <li key={index}><span>{item.text}</span>{item.evidence && <small>“{item.evidence}”</small>}</li>)}</ul></div>}
      <p className="analysis-provenance">Rubric {analysis.rubric_version} · {analysis.model_provider} / {analysis.model_name}</p>
    </section>
  );
}
