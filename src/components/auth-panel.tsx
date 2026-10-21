"use client";

import { FormEvent, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export function AuthPanel({ sessionNotice = "" }: { sessionNotice?: string }) {
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setPending(true);
    setNotice("");
    setError("");

    try {
      if (mode === "sign_in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) setError(signInError.message);
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signUpError) {
          setError(signUpError.message);
        } else if (!data.session) {
          setNotice("Check your inbox for the confirmation link. You can sign in after confirming your email.");
        }
      }
    } catch {
      setError("Authentication could not be completed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="auth-brand">
        <a className="brand-lockup brand-lockup-light" href="#auth-brand" aria-label="CareerPrep home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span id="auth-brand">CareerPrep</span>
        </a>
        <div className="auth-story-copy">
          <p className="eyebrow eyebrow-light">Your next step starts here</p>
          <h1>Build a career story that feels like yours.</h1>
          <p>Keep your resume ready, organized, and in one private workspace as you prepare for your next opportunity.</p>
        </div>
        <div className="auth-proof" aria-label="Workspace features">
          <div><span className="proof-icon" aria-hidden="true">01</span><span>Keep every version close</span></div>
          <div><span className="proof-icon" aria-hidden="true">02</span><span>Manage your documents securely</span></div>
          <div><span className="proof-icon" aria-hidden="true">03</span><span>Prepare at your own pace</span></div>
        </div>
        <div className="story-orbit story-orbit-one" aria-hidden="true" />
        <div className="story-orbit story-orbit-two" aria-hidden="true" />
      </section>

      <section className="auth-form-side" aria-labelledby="auth-title">
        <div className="auth-mobile-brand brand-lockup">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>CareerPrep</span>
        </div>
        <div className="auth-card">
          <div className="auth-card-heading">
            <p className="eyebrow">Resume workspace</p>
            <h2 id="auth-title">{mode === "sign_in" ? "Welcome back" : "Create your account"}</h2>
            <p>{mode === "sign_in" ? "Sign in to pick up where you left off." : "Set up your account to create a private workspace."}</p>
          </div>

          {!isSupabaseConfigured && (
            <div className="notice notice-warning" role="status">
              Sign-in isn’t configured for this workspace. Contact your project administrator for help.
            </div>
          )}
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {notice && <div className="notice notice-success" role="status">{notice}</div>}
          {sessionNotice && <div className="notice notice-warning" role="status">{sessionNotice}</div>}

          <form className="auth-form" onSubmit={submit}>
            <label className="field-label" htmlFor="auth-email">Email</label>
            <input
              autoComplete="email"
              id="auth-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <div className="field-label-row">
              <label className="field-label" htmlFor="auth-password">Password</label>
              {mode === "sign_up" && <span className="field-hint">At least 8 characters</span>}
            </div>
            <input
              autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              id="auth-password"
              minLength={mode === "sign_up" ? 8 : 1}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={password}
            />
            <button className="button button-primary button-full auth-submit" disabled={pending || !isSupabaseConfigured} type="submit">
              {pending ? <><span className="spinner" aria-hidden="true" /> Working…</> : mode === "sign_in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "sign_in" ? "New to CareerPrep?" : "Already have an account?"}{" "}
            <button className="text-button" disabled={pending} onClick={() => { setMode(mode === "sign_in" ? "sign_up" : "sign_in"); setError(""); setNotice(""); }} type="button">
              {mode === "sign_in" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <p className="auth-footnote">Your resume files stay private and are only available to your account.</p>
        </div>
      </section>
    </main>
  );
}
