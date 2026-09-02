/* ============================================================================
   EDIAGD — which cut of the video to play

   Pure. No React, no DOM, no Mux — so scripts/rendition-scenarios.ts can prove
   the rule offline, which matters because the failure mode is not an error. It
   is a picture that looks fine to whoever shipped it and blurry to whoever
   watches it on a laptop.

   ---------------------------------------------------------------------------
   THE BUG THIS EXISTS TO FIX
   ---------------------------------------------------------------------------
   shapeVideo() chose the rendition server-side, and the condition was

       vertical_status === 'ready' && vertical_playback_id != null

   with no reference to the viewport, because a server component has none. All
   58 videos in the library are 'ready', so the 9:16 phone crop was served to
   every device — a 1080-wide portrait slice stretched across a landscape frame
   on a desktop. Two thirds of the master's picture was already thrown away by
   the crop; the browser then upscaled what was left.

   ---------------------------------------------------------------------------
   THE RULE
   ---------------------------------------------------------------------------
   The viewport decides the shape, and the frame decides whether the vertical
   would have to be enlarged to fill it:

     viewport wider than tall   the master. Always. A desktop, a landscape
                                tablet, and a phone turned sideways are one case.
     viewport taller than wide  the vertical, if there is a usable one and the
                                frame is not wider than the vertical's native
                                1080; otherwise the master, letterboxed.

   ---------------------------------------------------------------------------
   WHY THE VIEWPORT AND NOT THE FRAME'S OWN SHAPE
   ---------------------------------------------------------------------------
   Because the frame's HEIGHT is the answer, not the question. The player sets
   `aspectRatio` from the cut it is playing and the frame has no height of its
   own, so "is this box tall or wide" resolves to "whichever I picked last" —
   both outcomes are stable and the measurement carries no information.

   The frame's WIDTH is a genuine input: it comes from the column the player was
   dropped into, and it is the reason this is not just a media query. /today can
   render a 480px player in a 1600px window, and the window is not what the
   viewer is looking at.

   NEVER UPSCALE THE VERTICAL. scripts/derive-vertical.ts scales every crop to
   1080x1920, so past 1080 CSS pixels of FRAME width the vertical is being
   enlarged and the master is the better picture even in a portrait window.

   CSS PIXELS, NOT DEVICE PIXELS, and that is deliberate. A 390pt phone at DPR 3
   asks for 1170 physical pixels, which is over the 1080 ceiling — but the
   vertical is still the right cut there, because the alternative is a 16:9
   master letterboxed into a tall screen with most of it black. The ceiling is
   about layout SIZE, which is what "phone or desktop" actually means here.
   ============================================================================ */

import type { Rendition, VideoRenditions } from "@/lib/mux/playback";

/**
 * What derive-vertical produces, every time: `scale=1080:1920`.
 *
 * Not read from the row because it is not stored — and it does not need to be,
 * because the worker has one output size. If that ever becomes configurable,
 * this is the constant that has to become a column.
 */
export const VERTICAL_NATIVE_WIDTH = 1080;

/** What the client measured. All CSS pixels. */
export type Viewport = {
  /** Width of the box the player is drawn into. */
  frameWidth: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type RenditionChoice = {
  rendition: Rendition;
  /** The aspect ratio the frame should be drawn at. */
  shape: "vertical" | "landscape";
  /** Why — surfaced in tests, and the thing to log when a picture looks wrong. */
  reason:
    | "vertical-fits"
    | "wide-viewport"
    | "not-measured"
    | "frame-too-wide"
    | "no-vertical";
};

/**
 * Pick the cut for a viewport of this shape and a frame of this width.
 *
 * `view` is null before the first measurement, and on the server, where there
 * is no viewport at all. The master is the answer then: it is never the WRONG
 * picture, only sometimes a letterboxed one, and defaulting to the vertical is
 * how a desktop ends up playing the phone rendition — which is the bug.
 */
export function pickRendition(
  renditions: VideoRenditions,
  view: Viewport | null
): RenditionChoice {
  const { landscape, vertical } = renditions;

  if (!vertical) {
    return { rendition: landscape, shape: "landscape", reason: "no-vertical" };
  }
  if (!view || view.viewportWidth <= 0 || view.viewportHeight <= 0) {
    return { rendition: landscape, shape: "landscape", reason: "not-measured" };
  }
  if (view.viewportWidth >= view.viewportHeight) {
    return { rendition: landscape, shape: "landscape", reason: "wide-viewport" };
  }
  if (view.frameWidth > VERTICAL_NATIVE_WIDTH) {
    return { rendition: landscape, shape: "landscape", reason: "frame-too-wide" };
  }
  return { rendition: vertical, shape: "vertical", reason: "vertical-fits" };
}

/**
 * What the admin status line says about a row's renditions.
 *
 * Read-only. It exists so that "why is my phone letterboxing this one" is a
 * glance rather than a query.
 */
export function describeRenditions(row: {
  mux_playback_id?: string | null;
  vertical_playback_id?: string | null;
  vertical_status?: string | null;
}): string {
  if (!row.mux_playback_id) return "No master — nothing to play.";
  const status = row.vertical_status ?? null;

  if (status === "ready" && row.vertical_playback_id) {
    return "Master + vertical. Phones get the 9:16 cut, desktop gets the master.";
  }
  if (status === "stale") {
    return "Master + vertical (STALE). The crop predates the current take, so it is skipped everywhere — phones letterbox the master until it is re-cut.";
  }
  if (status === "pending") {
    return "Master only — the vertical is queued. Phones letterbox until it lands.";
  }
  if (status === "error") {
    return "Master only — the vertical failed to derive. Phones letterbox the master.";
  }
  return "Master only. Phones letterbox it; no vertical has been cut.";
}
