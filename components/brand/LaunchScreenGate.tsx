"use client";

/* ============================================================================
   EDIAGD — when the launch screen leaves

   The rule this exists to enforce: the animation plays DURING the fetch, never
   in addition to it.

     app ready first   -> the sequence still finishes. Cutting a 1.4s animation
                          at 0.6s to reveal the app is worse than the 0.8s it
                          saves; a launch that ends mid-gesture reads as a bug.
     fetch slower      -> the SETTLED MARK holds. It is already on screen and
                          already finished, so it becomes the loading state at
                          no cost. There is never an animation followed by a
                          spinner, because there is never a spinner.

   So: leave at max(sequence end, app ready). Both conditions, whichever is
   later, and nothing in between.

   ---------------------------------------------------------------------------
   COLD LAUNCH ONLY
   ---------------------------------------------------------------------------
   The flag is written to sessionStorage the first time this mounts. An inline
   script in the document head reads it BEFORE first paint and hides the overlay
   with CSS, so a reload mid-session shows nothing rather than showing the mark
   and then removing it.

   sessionStorage rather than localStorage because a session is exactly the
   scope wanted: it survives reloads and client navigation within one run of the
   app, and it is gone when the app is. A Capacitor resume from background does
   not reload the webview at all, so it never reaches this code.
   ============================================================================ */

import { useEffect } from "react";

/**
 * Matches the last keyframe in styles/brand.css, plus a beat to settle.
 *
 * 1200 rather than 1400 since the wordmark left: the swell was the last thing
 * moving and it lands at 1.06s. Holding to 1.4s would have been ~350ms of a
 * finished mark doing nothing, which reads as the app being slow rather than as
 * a pause with intent.
 */
const SEQUENCE_MS = 1200;

/**
 * Belt and braces. If `load` never fires — a hung image, a request that stalls
 * past any sane wait — the mark must not become a permanent screen. The app is
 * revealed anyway; a half-loaded page somebody can look at beats a logo they
 * cannot leave.
 */
const MAX_HOLD_MS = 8000;

export const LAUNCH_SESSION_KEY = "ediagd:launched";

export function LaunchScreenGate() {
  useEffect(() => {
    const el = document.getElementById("ediagd-launch");
    if (!el) return;

    /* Written immediately, not on the way out: a reload DURING the animation is
       still a reload within the session, and it should not replay. */
    try {
      sessionStorage.setItem(LAUNCH_SESSION_KEY, "1");
    } catch {
      /* Private mode, or storage disabled. The animation then plays on each
         load, which is a worse experience than intended and a much better one
         than a crash. */
    }

    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      el.setAttribute("data-leaving", "1");
      /* Flips the inline `html` navy back off — see the critical style in
         app/layout.tsx. Without this the navy would sit behind every cream
         screen for the rest of the session and show through on overscroll. */
      document.documentElement.dataset.launched = "1";
      /* Removed after the fade so it cannot swallow a tap, and so the DOM does
         not keep a full-screen element around for the rest of the session. */
      window.setTimeout(() => el.remove(), 300);
    };

    const startedAt = performance.now();
    const afterSequence = (fn: () => void) => {
      const remaining = SEQUENCE_MS - (performance.now() - startedAt);
      if (remaining <= 0) fn();
      else window.setTimeout(fn, remaining);
    };

    /* Reduced motion has no sequence to wait for — the mark was settled on the
       first frame, so the only thing left to wait for is the app. */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? (fn: () => void) => fn() : afterSequence;

    const whenReady = () => hold(dismiss);

    if (document.readyState === "complete") {
      whenReady();
    } else {
      window.addEventListener("load", whenReady, { once: true });
    }

    const failsafe = window.setTimeout(dismiss, MAX_HOLD_MS);

    return () => {
      window.removeEventListener("load", whenReady);
      window.clearTimeout(failsafe);
    };
  }, []);

  return null;
}
