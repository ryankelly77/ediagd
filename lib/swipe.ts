/* ============================================================================
   EDIAGD — the one answer to "was that a swipe?"

   ---------------------------------------------------------------------------
   WHY THIS FILE EXISTS
   ---------------------------------------------------------------------------
   There were two swipe detectors. SwipeNavigation's, which had been through the
   hard part — a decisive distance, a direction ratio, a duration cap, an
   opt-out list, the iOS edge zone, single-touch only — and onboarding's, which
   was `Math.abs(clientX_end - clientX_start) >= 48`.

   The second one shipped the bug t63 found: on any onboarding screen long
   enough to scroll, a vertical scroll whose thumb drifts sideways reads as a
   swipe, and the screen changes under the advisor's finger. In the tester's
   recording it went BACK a screen three times while they were trying to read
   the one they were on.

   The fix is not a bigger threshold. 48px became 80px would have made the bug
   rarer and left it in, because a scroll's sideways drift is unbounded — it is
   however far the thumb wanders over a 400px pull. What rules it out is
   measuring the OTHER axis, which the old check never looked at.

   So: one detector, imported by both. A second copy is how the two disagreed
   in the first place.

   ---------------------------------------------------------------------------
   WHAT A SCROLL EVENT ADDS THAT THE GEOMETRY CANNOT
   ---------------------------------------------------------------------------
   DIRECTION_RATIO alone catches the reported bug: 400px down with 100px of
   drift fails `100 >= 400 * 2`. It does not catch the short, flat drag — 30px
   down and 100px sideways passes the ratio and is still a scroll, because 30px
   is all the slack that screen had left.

   `scrolled` closes that. A gesture during which the surface under the finger
   actually moved vertically is not a swipe, whatever its geometry says. It is
   the one fact a pure measurement of the two endpoints cannot contain, and it
   comes from the scroller itself rather than from a guess about the thumb.

   ---------------------------------------------------------------------------
   THE SPLIT, AND WHY IT IS WHERE IT IS
   ---------------------------------------------------------------------------
   `classifySwipe` is arithmetic over four numbers and takes no DOM, so it is
   exercised by `npm run test:swipe` in plain node rather than only by a person
   on a phone. Everything that needs a document — the opt-out list, the edge
   zone, the scroll watch — is a thin layer above it.
   ============================================================================ */

/**
 * Touches starting this close to either edge belong to iOS.
 *
 * Wide enough to cover the system's own recogniser so the two never both fire
 * on one drag — a double `history.back()` would skip a screen, and the user
 * would have no idea why. Onboarding honours the same zone for the same
 * reason: an edge drag there is iOS leaving the flow, and it should do that
 * ONE thing rather than also advancing a step on the way out.
 */
export const EDGE_ZONE = 28;

/** How far the thumb has to travel before this counts as a decision. */
export const MIN_DISTANCE = 80;

/** Horizontal has to beat vertical by this much, or it is a scroll. */
export const DIRECTION_RATIO = 2;

/**
 * Past this it is a drag, not a fling.
 *
 * Someone slowly dragging their finger across a screen is usually doing
 * something else — selecting, or scrolling a stubborn list. A back gesture is
 * quick and committed.
 */
export const MAX_DURATION_MS = 700;

/**
 * Anything that owns horizontal dragging for itself.
 *
 * `mux-player` IS THE ONE THAT FIRES, and it used to read `.mux-player` — a
 * class selector, and nothing in this app has ever carried that class. The
 * element the player renders is the custom element `<mux-player>`, so the
 * entry matched nothing and the scrubber was never protected: a drag along the
 * seek bar on /today or /library went back in history. Found while fixing
 * onboarding, because the welcome film is the same player.
 *
 * `video` and `media-controller` stay, and it is worth saying what they do and
 * do not cover. mux-player keeps its `<video>` and its `media-controller`
 * inside a shadow root, and a touch that crosses a shadow boundary is
 * retargeted to the host — so a listener out here sees `<mux-player>` and
 * `closest("video")` never matches for the Mux player. They cover a bare
 * `<video>` in the light DOM, which is what ContentDetail used to mount.
 *
 * `[data-no-swipe]` is the hatch for everything a selector cannot name: a grid
 * of day toggles, say, where a drag across the row is a mis-tap and must not
 * be a navigation.
 */
export const OPT_OUT =
  "input[type=range], video, mux-player, [data-no-swipe], .mux-player, media-controller";

/** Which way the thumb went, once we have decided it went anywhere. */
export type SwipeDirection = "left" | "right";

/** What a touchstart worth watching records. */
export type SwipeAnchor = {
  x: number;
  y: number;
  /** Milliseconds, from the caller — so the arithmetic below needs no clock. */
  at: number;
};

/** Everything the decision rests on, and nothing that needs a browser to say. */
export type SwipeMeasure = {
  dx: number;
  dy: number;
  elapsedMs: number;
  /** Did the surface under the finger scroll vertically while it was down? */
  scrolled: boolean;
};

/**
 * The whole rule, in one place, over four numbers.
 *
 * Order matters only for reading: any one failure is a refusal.
 */
export function classifySwipe(m: SwipeMeasure): SwipeDirection | null {
  /* The surface moved. Whatever the endpoints look like, the finger was
     scrolling — see the note at the top of this file. */
  if (m.scrolled) return null;

  if (m.elapsedMs > MAX_DURATION_MS) return null;
  if (Math.abs(m.dx) < MIN_DISTANCE) return null;
  if (Math.abs(m.dx) < Math.abs(m.dy) * DIRECTION_RATIO) return null;

  return m.dx > 0 ? "right" : "left";
}

/* ---- The parts that need a document -------------------------------------- */

/**
 * The shape of both a DOM `TouchEvent` and a React `TouchEvent`.
 *
 * Structural rather than either concrete type, because SwipeNavigation listens
 * on `document` and onboarding takes React's synthetic event off a prop, and
 * neither should have to adapt to the other.
 */
export type SwipeTouchEvent = {
  touches: { length: number; [index: number]: { clientX: number; clientY: number } };
  changedTouches: { length: number; [index: number]: { clientX: number; clientY: number } };
  target: unknown;
};

/**
 * Just enough of `Element` to walk up from the touch target.
 *
 * Duck-typed on purpose. `instanceof Element` is false across realms, and a
 * structural type lets `npm run test:swipe` hand this a plain object and check
 * that OPT_OUT still names the things it claims to.
 *
 * `getComputedStyle` comes through `ownerDocument.defaultView` rather than the
 * global for the same two reasons: it is the correct form in a document that
 * is not the top one, and it is reachable from a test.
 */
type Walkable = {
  closest(selector: string): unknown;
  parentElement: Walkable | null;
  scrollWidth: number;
  clientWidth: number;
  ownerDocument?: {
    defaultView?: { getComputedStyle(el: unknown): { overflowX: string } } | null;
    body?: unknown;
  } | null;
};

function walkable(target: unknown): Walkable | null {
  const el = target as Walkable | null;
  return el && typeof el.closest === "function" ? el : null;
}

/** Did the touch land inside something that scrolls sideways? */
function insideHorizontalScroller(start: unknown): boolean {
  let node = walkable(start);
  const body = node?.ownerDocument?.body ?? null;
  const view = node?.ownerDocument?.defaultView ?? null;
  if (!view) return false;

  while (node && node !== body) {
    /* A carousel, a wide table, a code block. If it has room to move
       horizontally, the drag is probably meant for it. */
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = view.getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Does something under the finger own horizontal dragging for itself?
 *
 * Two questions, because they fail differently: a named control (a scrubber, a
 * range input, an explicit opt-out) and a container that simply has somewhere
 * to scroll to.
 */
export function ownsTheDrag(target: unknown): boolean {
  const el = walkable(target);
  if (!el) return false;
  if (el.closest(OPT_OUT)) return true;
  return insideHorizontalScroller(el);
}

/**
 * Could this touchstart begin a swipe? Returns the anchor to measure from, or
 * null — and null means "stop here", not "assume the middle of the screen".
 */
export function swipeAnchor(
  e: SwipeTouchEvent,
  now: number,
  viewportWidth: number
): SwipeAnchor | null {
  /* Two fingers is a pinch or a system gesture, never this. */
  if (e.touches.length !== 1) return null;
  const t = e.touches[0];
  if (!t) return null;

  if (t.clientX <= EDGE_ZONE || t.clientX >= viewportWidth - EDGE_ZONE) return null;
  if (ownsTheDrag(e.target)) return null;

  return { x: t.clientX, y: t.clientY, at: now };
}

/**
 * What the matching touchend means.
 *
 * `scrolled` is the caller's observation, not something this can see: only the
 * surface knows whether it moved.
 */
export function swipeDirection(
  anchor: SwipeAnchor,
  e: SwipeTouchEvent,
  now: number,
  scrolled: boolean
): SwipeDirection | null {
  const t = e.changedTouches[0];
  if (!t) return null;

  return classifySwipe({
    dx: t.clientX - anchor.x,
    dy: t.clientY - anchor.y,
    elapsedMs: now - anchor.at,
    scrolled,
  });
}

/**
 * Watch for a vertical scroll anywhere under the finger until it lifts.
 *
 * CAPTURE, because a `scroll` event does not bubble. A capturing listener on
 * the document is the only way one handler hears whichever element turned out
 * to be the scroller — which here is PhoneScreen.Body, a component onboarding
 * does not own and should not have to reach into.
 *
 * Returns the stop function. Call it on touchend, on touchcancel and on
 * unmount; calling it twice is harmless.
 */
export function watchForScroll(doc: Document): { scrolled: () => boolean; stop: () => void } {
  let seen = false;
  const mark = () => {
    seen = true;
  };
  doc.addEventListener("scroll", mark, { capture: true, passive: true });
  return {
    scrolled: () => seen,
    stop: () => doc.removeEventListener("scroll", mark, { capture: true }),
  };
}
