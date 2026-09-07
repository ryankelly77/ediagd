"use client";

/* ============================================================================
   EDIAGD — where the emailed link lands

   ---------------------------------------------------------------------------
   THIS PAGE OPENS IN SAFARI, NOT IN THE APP
   ---------------------------------------------------------------------------
   A link in an email opens in the phone's browser. Nothing about tapping it
   knows the EDIAGD app exists, and universal-link handling that would route it
   back is a bigger piece of work than a v1 reset needs.

   So the success state says so, plainly: password updated, now go back to the
   app. Without that sentence somebody finishes the reset, sees a signed-out
   web page, and reasonably concludes it did not work — the exact frustration
   this feature exists to end, arriving one screen later than before.

   ---------------------------------------------------------------------------
   THE SESSION ARRIVES IN THE URL
   ---------------------------------------------------------------------------
   Supabase's link carries a code that supabase-js exchanges for a short-lived
   session on load. updateUser() then works because the user IS signed in — as
   themselves, for a few minutes, purely to do this.

   Which is why the invalid-link state has to exist: an expired or reused link
   leaves no session, updateUser fails with something unreadable, and the only
   useful thing to say is "ask for a fresh one".
   ============================================================================ */

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AUTH_INPUT, AUTH_BUTTON, AUTH_QUIET_LINK } from "@/components/auth/AuthShell";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/auth-password";

type State = "checking" | "ready" | "invalid" | "done";

export function ResetPasswordScreen() {
  const supabase = createClient();
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * ---- A LINK IS REQUIRED, NOT MERELY A SESSION -------------------------
   *
   * The first cut asked "is there a session?" and a signed-in browser answered
   * yes — so anyone already logged in could open /reset-password directly and
   * set a new password with no link at all, and the expired-link state could
   * never appear for them. On a shared phone that is a way to take an account.
   *
   * So the URL has to carry a recovery credential. Supabase sends one of two
   * shapes depending on the template, and both are handled: `?token_hash=…&
   * type=recovery` is exchanged here, while the PKCE `?code=` / `#access_token`
   * forms are picked up by supabase-js itself. Neither present means no link,
   * whatever the cookie jar says.
   */
  useEffect(() => {
    let settled = false;

    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") ?? hash.get("type");
    const hasCode = url.searchParams.has("code");
    const hasAccessToken = hash.has("access_token");
    const hasLink = Boolean(tokenHash) || hasCode || hasAccessToken;

    /* The token_hash form is ours to exchange; the others supabase-js does. */
    if (hasLink && tokenHash) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: (type as "recovery") ?? "recovery" })
        .then(({ data, error: otpError }) => {
          if (otpError || !data.session) {
            settled = true;
            setState("invalid");
          } else {
            settled = true;
            setState("ready");
          }
        });
    }

    if (hasLink) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          settled = true;
          setState("ready");
        }
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (hasLink && session) {
        settled = true;
        setState("ready");
      }
    });

    /* No link at all is decided immediately; a link that never produces a
       session is decided after three seconds — long enough for a slow phone on
       dealership wifi, short enough that nobody stares at a blank card.
       Both go through the timer rather than a synchronous setState, which the
       cascading-render rule rejects and is right to. */
    const timer = window.setTimeout(
      () => {
        if (!settled) setState("invalid");
      },
      hasLink ? 3000 : 0
    );

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [supabase]);

  async function handleSave() {
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    /* Signed out straight away. The reset link's session is a means to an end,
       and leaving it live in a browser somebody may not own is a loose end. */
    await supabase.auth.signOut();
    setState("done");
  }

  if (state === "checking") {
    return (
      <AuthShell>
        <p className="text-base text-ink">Checking your link…</p>
      </AuthShell>
    );
  }

  if (state === "invalid") {
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold text-navy">That link has expired</h1>
          <p className="text-base leading-relaxed text-ink">
            Reset links last an hour and can only be used once. Ask for a fresh
            one and it&apos;ll be with you in a minute.
          </p>
          <Link href="/forgot-password" className={AUTH_BUTTON + " block text-center"}>
            Send a new link
          </Link>
          <Link href="/login" className={AUTH_QUIET_LINK}>
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (state === "done") {
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold text-navy">Password updated</h1>
          {/*
            THE SENTENCE THAT STOPS SOMEBODY BEING STRANDED. They are in Safari
            because that is where an email link opens; the app is a separate
            icon on their home screen and nothing here can put them back in it.
          */}
          <p className="text-base leading-relaxed text-ink">
            Go back to the EDIAGD app and sign in with your new password.
          </p>
          <p className="text-sm leading-relaxed text-ink-soft">
            On this browser instead? You can sign in here too.
          </p>
          <Link href="/login" className={AUTH_QUIET_LINK}>
            Sign in here
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold text-navy">Set a new password</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
        <input
          type="password"
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={AUTH_INPUT}
        />
        <input
          type="password"
          placeholder="Type it again"
          aria-label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          className={AUTH_INPUT}
        />
        {error && <p className="text-sm font-bold text-clay">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving || !password || !confirm}
          className={AUTH_BUTTON}
        >
          {saving ? "Saving…" : "Save new password"}
        </button>
      </div>
    </AuthShell>
  );
}
