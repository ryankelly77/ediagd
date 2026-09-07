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
 * Belt and braces. If anything above throws or a timer is starved, the mark
 * must not become a permanent screen. The app is revealed anyway; a
 * half-loaded page somebody can look at beats a logo they cannot leave.
 *
 * Four seconds rather than eight, now that the gate no longer waits on `load`:
 * the thing it is guarding against is a bug in this file, not a slow network.
 */
const MAX_HOLD_MS = 4000;

export const LAUNCH_SESSION_KEY = "ediagd:launched";

export function LaunchScreenGate() {
  useEffect(() => {
    /*
     * ---- NOTHING IN HERE TOUCHES THE OVERLAY ELEMENT ----------------------
     *
     * The first version called el.remove(), and that was a real bug that took
     * production down on every link click: <LaunchScreen /> is rendered BY
     * REACT in the root layout, so removing it imperatively left the reconciler
     * holding a node that is no longer in the document. The next client-side
     * navigation threw
     *
     *     NotFoundError: Failed to execute 'insertBefore' on 'Node'
     *     NotFoundError: Failed to execute 'removeChild' on 'Node'
     *
     * and the router surfaced it as "this page couldn't load". A full reload
     * fixed it because rendering started clean, which is exactly the shape Ryan
     * described: every link broken, reload always works.
     *
     * So the gate now only ever writes attributes on <html>, which React does
     * not own — the same surface the pre-paint script already uses. CSS does
     * the hiding. The overlay element stays exactly where React put it, inert
     * and invisible, and the reconciler's picture of the DOM stays true.
     */
    const root = document.documentElement;

    /*
     * ---- THE SPLASH IS NOT LIFTED FROM HERE ANY MORE ----------------------
     *
     * It was, and that was the bug. A React effect cannot run until the JS has
     * downloaded and hydrated, so the native splash sat on top of the webview
     * for the whole of it — measured 3.5s on Ryan's phone, with the app drawn
     * and ready underneath the entire time. "the opening screen has the navy
     * blue for 2 to 3 sec before the animation shows."
     *
     * The lift now happens in two places that are both earlier than this: the
     * inline script in the layout asks the bridge directly at first paint, and
     * capacitor.config's launchShowDuration is down to 150ms as the floor. The
     * backstop below stays because neither is guaranteed — the bridge may not
     * have registered its plugin proxies that early — and a splash that will
     * not hide must never be able to strand the app on its own launch screen.
     */

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
      /* Fade, then mark the session launched — the second rule hides the
         overlay outright and also stops it replaying on the next load. */
      root.dataset.launchLeaving = "1";
      window.setTimeout(() => {
        root.dataset.launched = "1";
      }, 300);
    };

    /*
     * ---- TIMED FROM RELEASE ----------------------------------------------
     *
     * Not from paint: on device the overlay paints under the native splash, so
     * paint is not when the mark becomes visible. The clock starts when the
     * keyframes are released, which is the same instant the splash lifts.
     */
    const afterSequence = (fn: () => void) => {
      const remaining = SEQUENCE_MS - (performance.now() - releasedAt);
      if (remaining <= 0) fn();
      else window.setTimeout(fn, remaining);
    };

    /* Reduced motion has no sequence to wait for — the mark was settled on the
       first frame, so the only thing left to wait for is the app. */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? (fn: () => void) => fn() : afterSequence;

    /*
     * ---- READY MEANS INTERACTIVE, NOT `load` ------------------------------
     *
     * This used to wait for window.load, which waits for EVERY subresource.
     * Measured on production: the app is hydrated and interactive at 1.59s and
     * `load` does not fire until 6.37s, held open by trailing chunks and the
     * favicon. The overlay was sitting there for five seconds after the
     * animation had finished, which is the opposite of "plays during the
     * fetch" — it was the app waiting on a favicon.
     *
     * This effect running IS the ready signal: React has hydrated, so the page
     * underneath is interactive and worth revealing. Anything still in flight
     * is a resource the app can finish fetching while somebody looks at it.
     */
    /*
     * Declared AFTER hold and dismiss, deliberately. release() closes over
     * both, and it only worked above because its one call site sat behind an
     * await — a future synchronous call would have been a temporal-dead-zone
     * crash on every launch. Ordering it here makes that impossible rather
     * than merely unlikely.
     */
    /**
     * Releases the paused keyframes and starts the hold clock.
     *
     * Normally the inline script in the layout has already done the releasing,
     * at first paint, and left the timestamp behind — so this reads its clock
     * rather than starting a new one. Timing the hold from hydration would
     * count the sequence as beginning when we noticed it, not when it began,
     * and hold a finished mark on screen for the difference.
     *
     * The fallback matters for anything that reaches hydration without the
     * script having run: an already-launched session, or a browser that blocked
     * the inline tag. Then this IS the release, and the clock starts here.
     */
    let releasedAt = 0;
    const release = () => {
      if (releasedAt) return;
      const inline = (window as unknown as { __ediagdLaunchAt?: number })
        .__ediagdLaunchAt;
      releasedAt = typeof inline === "number" ? inline : performance.now();
      root.dataset.launchGo = "1";
      hold(dismiss);
    };

    void (async () => {
      let native = false;
      try {
        const { Capacitor } = await import("@capacitor/core");
        native = Capacitor.isNativePlatform();
      } catch {
        /* No Capacitor: we are in a browser. */
      }

      /*
       * ---- THE SHELL ANIMATES AGAIN ---------------------------------------
       *
       * It briefly did not. When the splash was hidden from a React effect it
       * sat there for 3.5s, so the 1.2s sequence afterwards was a short brand
       * moment behind a long wait — Ryan: "the animation is shorter than the
       * 1.5 blank navy screen hold." The fix at the time was to drop the
       * animation and put the mark on the splash instead.
       *
       * That reasoning expired once the splash floor came down to 150ms. What
       * was left of the delay is the webview's own time to first paint, and the
       * sequence now starts on that first painted frame — measured 1.35s to the
       * mark, then a full second of visible animation, app at 2.35s. It plays
       * DURING the load, which is the whole rule.
       *
       * The splash is plain navy again, so the animation supplies the mark:
       * nothing is drawn twice, and there is no size to match between two
       * different rendering systems.
       */
      if (native) {
        try {
          const { SplashScreen } = await import("@capacitor/splash-screen");
          await SplashScreen.hide();
        } catch {
          /* The inline script in the layout has almost certainly done this
             already; this is the backstop for a bridge that was not ready. */
        }
      }
      release();
    })();

    const failsafe = window.setTimeout(dismiss, MAX_HOLD_MS);

    return () => {
      window.clearTimeout(failsafe);
    };
  }, []);

  return null;
}
