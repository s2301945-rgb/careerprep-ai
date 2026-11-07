"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthPanel } from "@/components/auth-panel";
import { ResumeWorkspace } from "@/components/resume-workspace";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [sessionNotice, setSessionNotice] = useState("");
  const hadSession = useRef(false);
  const signingOut = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "SIGNED_OUT" && hadSession.current && !signingOut.current) {
        setSessionNotice("Your session has expired. Sign in again to continue.");
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") setSessionNotice("");
      if (nextSession) hadSession.current = true;
      if (event === "SIGNED_OUT") hadSession.current = false;
      setSession(nextSession);
      setAuthReady(true);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setSessionNotice("Your saved session could not be restored. Please sign in again.");
      } else {
        setSession(data.session);
        hadSession.current = Boolean(data.session);
      }
      setAuthReady(true);
    }).catch(() => {
      if (!active) return;
      setSessionNotice("Your saved session could not be restored. Please sign in again.");
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    if (!supabase) return;
    signingOut.current = true;
    const { error } = await supabase.auth.signOut();
    signingOut.current = false;
    if (error) {
      setSessionNotice("Sign out could not be completed. Please try again.");
      return;
    }
    hadSession.current = false;
    setSession(null);
    setSessionNotice("");
  }

  if (!authReady) {
    return <main className="auth-loading" aria-live="polite"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span className="spinner spinner-dark" /><p>Restoring your private workspace…</p></main>;
  }

  if (!session) return <AuthPanel sessionNotice={sessionNotice} />;
  return <ResumeWorkspace key={session.user.id} email={session.user.email ?? "Your account"} onSignOut={() => void signOut()} sessionNotice={sessionNotice} />;
}
