"use client";

import { useEffect } from "react";

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
   ============================================================================ */

/**
 * Touches starting this close to either edge belong to iOS.
 *
 * Wide enough to cover the system's own recogniser so the two never both fire
 * on one drag — a double `history.back()` would skip a screen, and the user
 * would have no idea why.
 */
const EDGE_ZONE = 28;

/** How far the thumb has to travel before this counts as a decision. */
const MIN_DISTANCE = 80;

/** Horizontal has to beat vertical by this much, or it is a scroll. */
const DIRECTION_RATIO = 2;

/**
 * Past this it is a drag, not a fling.
 *
 * Someone slowly dragging their finger across a screen is usually doing
 * something else — selecting, or scrolling a stubborn list. A back gesture is
 * quick and committed.
 */
const MAX_DURATION_MS = 700;

/** Anything that owns horizontal dragging for itself. */
const OPT_OUT = "input[type=range], video, [data-no-swipe], .mux-player, media-controller";

/** Did the touch land inside something that scrolls sideways? */
function insideHorizontalScroller(start: EventTarget | null): boolean {
  let node = start instanceof Element ? start : null;
  while (node && node !== document.body) {
    /* A carousel, a wide table, a code block. If it has room to move
       horizontally, the drag is probably meant for it. */
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function SwipeNavigation() {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let armed = false;

    function onStart(e: TouchEvent) {
      armed = false;
      /* Two fingers is a pinch or a system gesture, never this. */
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;

      if (t.clientX <= EDGE_ZONE || t.clientX >= window.innerWidth - EDGE_ZONE) return;
      if (e.target instanceof Element && e.target.closest(OPT_OUT)) return;
      if (insideHorizontalScroller(e.target)) return;

      startX = t.clientX;
      startY = t.clientY;
      startedAt = Date.now();
      armed = true;
    }

    function onEnd(e: TouchEvent) {
      if (!armed) return;
      armed = false;

      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (Date.now() - startedAt > MAX_DURATION_MS) return;
      if (Math.abs(dx) < MIN_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

      /*
       * FORWARD IS OFFERED BECAUSE BACK IS. A back gesture you cannot undo is
       * a worse deal than the one iOS ships — the same reasoning that left
       * allowsBackForwardNavigationGestures on rather than restricting it.
       */
      if (dx > 0) window.history.back();
      else window.history.forward();
    }

    /* Passive: this never calls preventDefault. It reads the touch after the
       fact and navigates, so it must not cost the scroller a frame. */
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", () => { armed = false; }, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);

  return null;
}

export default SwipeNavigation;
