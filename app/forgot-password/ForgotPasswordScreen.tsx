"use client";

/* ============================================================================
   EDIAGD — "I can't get in"

   ---------------------------------------------------------------------------
   THE MESSAGE IS THE SAME WHETHER OR NOT THE ACCOUNT EXISTS
   ---------------------------------------------------------------------------
   "If that email has an account, a reset link is on its way." Always, including
   when the send fails.

   That is not vagueness for its own sake. A screen that says "no account with
   that email" is an oracle: anybody can type addresses at it and learn which
   ones belong to advisors at a named dealership. The cost of the generic
   sentence is that somebody who mistypes their address waits for an email that
   never comes; the cost of the specific one is a list of real users handed to
   whoever asks. The first is a support message, the second is a breach.

   THE ERROR IS SWALLOWED ON PURPOSE, and it is the same sentence, because a
   failure that renders differently is the same oracle with extra steps —
   Supabase rate-limits repeated sends per address, so "that didn't work" would
   quietly confirm which addresses had already been tried.
   ============================================================================ */

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AUTH_INPUT, AUTH_BUTTON, AUTH_QUIET_LINK } from "@/components/auth/AuthShell";

export function ForgotPasswordScreen() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        /*
         * The ORIGIN THIS PAGE IS ON, not a baked-in URL: the same build is
         * served from localhost, a preview and app.ediagd.ai, and a hardcoded
         * host would send every tester's link to production.
         *
         * Supabase only honours a redirect that is on its allow-list; anything
         * else silently falls back to the project's Site URL. So every origin
         * this ships from has to be listed in Auth -> URL Configuration.
         */
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      /* Deliberately ignored — see the header. */
    }
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold text-navy">Check your email</h1>
          <p className="text-base leading-relaxed text-ink">
            If that email has an account, a reset link is on its way. It expires
            in an hour.
          </p>
          <p className="text-sm leading-relaxed text-ink-soft">
            Nothing after a few minutes? Check your junk folder, or try again
            with a different address.
          </p>
          <Link href="/login" className={AUTH_QUIET_LINK}>
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold text-navy">Reset your password</h1>
        <p className="text-base leading-relaxed text-ink">
          Enter the email you sign in with and we&apos;ll send you a link.
        </p>
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className={AUTH_INPUT}
        />
        <button onClick={handleSend} disabled={loading || !email.trim()} className={AUTH_BUTTON}>
          {loading ? "Sending…" : "Send the link"}
        </button>
        <Link href="/login" className={AUTH_QUIET_LINK}>
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
