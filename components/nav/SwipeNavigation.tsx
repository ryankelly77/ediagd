"use client";

import { useEffect } from "react";
import { swipeAnchor, swipeDirection, type SwipeAnchor } from "@/lib/swipe";

/* ============================================================================
   EDIAGD — swipe back and forward from anywhere, not just the edge

   ---------------------------------------------------------------------------
   WHAT THIS ADDS AND WHAT IT CANNOT
   ---------------------------------------------------------------------------
   iOS already gives the shell a back gesture — allowsBackForwardNavigationGestures
   in EDIAGDViewController — and it is the good one: interactive, following the
   thumb, previewing the screen behind, cancelling if you let go early. It is
   also strictly an EDGE gesture, which is Apple's convention and not ours to
   change. Ryan: "Currently it only works if you grab from the extreme edge of
   the page. Other apps you can just swipe from anywhere."

   So this is the second gesture, not a replacement. It is a FLING: a decisive
   horizontal swipe anywhere on the screen goes back (rightward) or forward
   (leftward), with no live preview, because a webview cannot render the
   previous page under your finger. The system keeps the edge and keeps the
   interactive version there; this covers the other 95% of the screen.

   Both live together because they never see the same touch — anything
   starting within EDGE_ZONE is left alone for iOS.

   ---------------------------------------------------------------------------
   THE HARD PART IS NOT THE SWIPE, IT IS EVERYTHING ELSE THAT SWIPES
   ---------------------------------------------------------------------------
   A drag across the middle of a screen is ambiguous in a way an edge drag
   never is. The admin mapping tables scroll sideways. So does any code block
   or wide figure. A range input is dragged horizontally by definition, and so
   is a video scrubber. Getting this wrong does not produce a missing gesture,
   it produces a page that navigates away while somebody is scrolling a table —
   which is worse than not having it.

   This is why the guard lives in JavaScript rather than in a native
   UIPanGestureRecognizer: only the DOM knows that the finger came down inside
   something horizontally scrollable. Native sees one webview and would have to
   guess.

   ---------------------------------------------------------------------------
   THE RULES THEMSELVES NOW LIVE IN lib/swipe.ts
   ---------------------------------------------------------------------------
   Onboarding had its own detector and it was 48px of clientX with no second
   axis, which is the t63 bug. There is one set of rules now and both import
   it; what stays here is only this gesture's CONSEQUENCE — back and forward on
   the history stack. See lib/swipe.ts for why each threshold is the number it
   is.
   ============================================================================ */

export function SwipeNavigation() {
  useEffect(() => {
    let anchor: SwipeAnchor | null = null;

    function onStart(e: TouchEvent) {
      anchor = swipeAnchor(e, Date.now(), window.innerWidth);
    }

    function onEnd(e: TouchEvent) {
      const from = anchor;
      anchor = null;
      if (!from) return;

      /*
       * `scrolled: false`.
       *
       * THIS IS A REAL DIFFERENCE FROM ONBOARDING AND IT IS DELIBERATE. The
       * app's own pages scroll the window, and a window scroll is what a page
       * does all day — refusing every gesture that happened during one would
       * turn this feature off on a long page, which is most of them. The
       * direction ratio is what separates a scroll from a fling here, and it
       * has held since this shipped.
       *
       * Onboarding is the other case: PhoneScreen is `h-dvh overflow-hidden`
       * with one inner scroller, so a vertical scroll there is a specific,
       * observable event on a specific element, and a gesture that caused one
       * is unambiguously not a swipe.
       */
      const dir = swipeDirection(from, e, Date.now(), false);
      if (!dir) return;

      /*
       * FORWARD IS OFFERED BECAUSE BACK IS. A back gesture you cannot undo is
       * a worse deal than the one iOS ships — the same reasoning that left
       * allowsBackForwardNavigationGestures on rather than restricting it.
       */
      if (dir === "right") window.history.back();
      else window.history.forward();
    }

    function onCancel() {
      anchor = null;
    }

    /* Passive: this never calls preventDefault. It reads the touch after the
       fact and navigates, so it must not cost the scroller a frame. */
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      /* touchcancel was left attached by the version before this one. An
         anonymous listener cannot be removed, so every mount of this component
         added one that outlived it. */
      document.removeEventListener("touchcancel", onCancel);
    };
  }, []);

  return null;
}

export default SwipeNavigation;
