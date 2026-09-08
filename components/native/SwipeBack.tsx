"use client";

/* ============================================================================
   EDIAGD — the edge-swipe, in JavaScript, because the native one does not fire

   ---------------------------------------------------------------------------
   THE NATIVE API WAS THE RIGHT FIRST TRY AND THE WRONG ANSWER
   ---------------------------------------------------------------------------
   Build 10 set WKWebView's allowsBackForwardNavigationGestures, which is the
   real system gesture and would have been better than anything written here:
   interactive, with a live preview of the previous screen and a proper cancel.
   I shipped it saying I could not verify it and that the open question was
   whether it honours SAME-DOCUMENT pushState entries.

   It does not. Ryan: "swipe gestures do not work in build 10." Every navigation
   in this app is a pushState entry — that is what a client-rendered router
   does — so the gesture had nothing it recognised to go back to.

   The native flag stays enabled. It costs nothing and it still covers real page
   loads; this handles the case it cannot see, and if the native recogniser ever
   does claim a touch, the browser never delivers these events and this does
   nothing. They cannot both fire.

   ---------------------------------------------------------------------------
   WHAT IT WILL NOT DO
   ---------------------------------------------------------------------------
   It will not fake the iOS transition. A JavaScript handler cannot render the
   previous screen behind your thumb, and a half-imitation — sliding the current
   page away to reveal cream — looks broken in a way that doing nothing does
   not. So the page follows the finger a little, as an acknowledgement that the
   gesture was understood, and the actual navigation is instant.

   ---------------------------------------------------------------------------
   AND WHAT IT REFUSES TO TOUCH
   ---------------------------------------------------------------------------
   Only touches STARTING within 24px of the left edge, one finger, moving
   decidedly sideways. That combination is what keeps it away from the admin
   tables, which scroll horizontally and are the exact screens Ryan asked for
   this on — a handler that guessed would trade a breadcrumb for a table that
   sometimes navigates away mid-scroll.
   ============================================================================ */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How close to the edge a touch must start. Matches iOS's own zone. */
const EDGE = 24;
/** How far it must travel before it counts as a swipe rather than a tap. */
const COMMIT = 70;
/** Beyond this much vertical drift it is a scroll, not a swipe. */
const SLOPE = 1.0;

export function SwipeBack() {
  const router = useRouter();

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let decided = false;

    const surface = () => document.body;

    const reset = (animate: boolean) => {
      const el = surface();
      el.style.transition = animate ? "transform 160ms ease-out" : "";
      el.style.transform = "";
      if (animate) window.setTimeout(() => (el.style.transition = ""), 180);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE) return;

      /* Never inside something that scrolls sideways on purpose, and never
         where a screen has asked to be left alone. */
      let node = t.target as HTMLElement | null;
      while (node && node !== document.body) {
        if (node.hasAttribute?.("data-no-swipe-back")) return;
        const ox = getComputedStyle(node).overflowX;
        if ((ox === "auto" || ox === "scroll") && node.scrollWidth > node.clientWidth) return;
        node = node.parentElement;
      }

      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
      decided = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);

      if (!decided) {
        if (dy > 12 && dy > Math.abs(dx) * SLOPE) { tracking = false; reset(false); return; }
        if (dx < 8) return;
        decided = true;
      }
      if (dx <= 0) return;

      /* Follows the finger, damped, and only so far: this is an
         acknowledgement, not a transition. */
      surface().style.transform = `translateX(${Math.min(dx * 0.32, 44)}px)`;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
      reset(true);
      if (decided && dx >= COMMIT) {
        /* history.length is the only signal available about whether there is
           anywhere to go; going "back" out of the first screen would hand the
           webview to a blank page. */
        if (window.history.length > 1) router.back();
      }
    };

    const onCancel = () => { tracking = false; reset(true); };

    /* Passive: this never calls preventDefault — a handler that can block
       scrolling is a handler that will, on the one screen nobody tested. */
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
      reset(false);
    };
  }, [router]);

  return null;
}
