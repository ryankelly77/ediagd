/* ============================================================================
   EDIAGD — which cut of the video plays

   Mitch reported that desktop video was very blurry. It was: shapeVideo() chose
   the rendition on the server, where there is no viewport, so the condition
   reduced to "does a 9:16 crop exist" — and one exists for all 58 videos. Every
   laptop in the pilot was watching a 1080-wide phone crop stretched wide.

   The failure had no error and no log line. It looked exactly like a working
   feature to everyone who shipped it, which is the whole reason the rule is now
   a pure function with a test rather than an expression inside a component.

     npm run test:rendition
   ============================================================================ */

import {
  VERTICAL_NATIVE_WIDTH,
  contentBox,
  describeRenditions,
  markGeometry,
  pickRendition,
  type Viewport,
} from "../lib/video-rendition";
import type { Rendition, VideoRenditions } from "../lib/mux/playback";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}\n        expected ${e}\n        actual   ${a}`);
    console.log(`    ✗ ${label}  expected ${e}, got ${a}`);
  }
}
const ok = (label: string, cond: boolean, detail = "") =>
  check(label + (detail ? ` (${detail})` : ""), cond, true);
const section = (t: string) => console.log(`\n${t}`);

const cut = (id: string): Rendition => ({
  playbackId: id,
  token: `tok-${id}`,
  thumbnailToken: `thumb-${id}`,
  storyboardToken: `story-${id}`,
});

const MASTER = cut("master-16x9");
const VERTICAL = cut("vertical-9x16");

const both: VideoRenditions = { landscape: MASTER, vertical: VERTICAL };
const masterOnly: VideoRenditions = { landscape: MASTER, vertical: null };

/** A frame that fills a typical /today column at this viewport width. */
const view = (
  viewportWidth: number,
  viewportHeight: number,
  frameWidth: number
): Viewport => ({ viewportWidth, viewportHeight, frameWidth });

const chosen = (r: VideoRenditions, v: Viewport | null) =>
  pickRendition(r, v).rendition.playbackId;

/* ---- 1 · The bug ---------------------------------------------------------- */
section("1 · A desktop never gets the phone crop");

/*
 * THE EXACT REPORT. A 1440x900 laptop, video in a 720px column, vertical cut
 * present and ready — which described every video in the library.
 */
check(
  "1440x900 laptop plays the master",
  chosen(both, view(1440, 900, 720)),
  MASTER.playbackId
);
check(
  "and says why",
  pickRendition(both, view(1440, 900, 720)).reason,
  "wide-viewport"
);
check(
  "drawn 16:9, not squeezed into a tall box",
  pickRendition(both, view(1440, 900, 720)).shape,
  "landscape"
);
check(
  "a 2560-wide desktop, same answer",
  chosen(both, view(2560, 1440, 1200)),
  MASTER.playbackId
);
check(
  "and a narrow browser window on that desktop is still a wide viewport",
  chosen(both, view(1100, 800, 1100)),
  MASTER.playbackId
);

/* ---- 2 · The phone, which was always right ------------------------------- */
section("2 · The phone still gets the cut that was made for it");

check(
  "390x844 phone plays the vertical",
  chosen(both, view(390, 844, 390)),
  VERTICAL.playbackId
);
check(
  "at 9:16, full bleed",
  pickRendition(both, view(390, 844, 390)),
  {
    rendition: VERTICAL,
    shape: "vertical",
    reason: "vertical-fits",
  }
);
check(
  "a portrait tablet too",
  chosen(both, view(834, 1194, 834)),
  VERTICAL.playbackId
);

/*
 * ROTATION. The same tablet turned sideways is a wide viewport and a wide
 * viewport gets the master — this is the case the old server-side rule could
 * not see at all, because the page had already rendered.
 */
check(
  "and turned sideways it is a desktop as far as this rule cares",
  chosen(both, view(1194, 834, 1194)),
  MASTER.playbackId
);

/* ---- 3 · Never upscale the vertical -------------------------------------- */
section("3 · The 9:16 cut is 1080 wide and is never enlarged past it");

check("the native width is what derive-vertical writes", VERTICAL_NATIVE_WIDTH, 1080);
check(
  "a portrait window with a 1080px frame still fits",
  chosen(both, view(1100, 1400, 1080)),
  VERTICAL.playbackId
);
check(
  "one pixel wider and the master is the better picture",
  pickRendition(both, view(1100, 1400, 1081)),
  { rendition: MASTER, shape: "landscape", reason: "frame-too-wide" }
);

/*
 * DEVICE PIXELS ARE DELIBERATELY NOT CONSULTED. A 390pt phone at DPR 3 asks for
 * 1170 physical pixels, over the ceiling — and the vertical is still right
 * there, because the alternative is a 16:9 master letterboxed into a tall
 * screen with most of it black. The ceiling is about layout size.
 */
check(
  "a 390pt phone is measured at 390, not at 1170",
  chosen(both, view(390, 844, 390)),
  VERTICAL.playbackId
);

/* ---- 4 · No vertical, and stale counts as none --------------------------- */
section("4 · A missing or stale crop letterboxes the master, never crops it");

check(
  "no vertical: the phone gets the master",
  pickRendition(masterOnly, view(390, 844, 390)),
  { rendition: MASTER, shape: "landscape", reason: "no-vertical" }
);
check(
  "drawn 16:9 — letterboxed in a tall frame rather than CSS-cropped, because a "
    + "centre crop cuts heads and nobody checked this one",
  pickRendition(masterOnly, view(390, 844, 390)).shape,
  "landscape"
);

/*
 * STALE IS ABSENT. renditionsFor() refuses to mint a token for a crop whose
 * master has been re-cut since, so 'stale' arrives here as vertical: null and
 * cannot be selected by any viewport.
 */
check(
  "a stale crop is described as skipped everywhere",
  describeRenditions({
    mux_playback_id: "abc",
    vertical_playback_id: "def",
    vertical_status: "stale",
  }).includes("skipped everywhere"),
  true
);

/* ---- 5 · Before the first measurement ------------------------------------ */
section("5 · The unmeasured first frame is the master, never the crop");

/*
 * There is no viewport during SSR and none on the first render. The master is
 * the safe default in both: it is never the WRONG picture, only sometimes a
 * letterboxed one. Defaulting the other way is how this bug shipped.
 */
check(
  "null viewport: master",
  pickRendition(both, null),
  { rendition: MASTER, shape: "landscape", reason: "not-measured" }
);
check(
  "a zero-sized measurement is treated as no measurement",
  pickRendition(both, view(0, 0, 0)).reason,
  "not-measured"
);

/* ---- 6 · What the admin screen says -------------------------------------- */
section("6 · The status line tells the truth about each state");

check(
  "ready",
  describeRenditions({
    mux_playback_id: "abc",
    vertical_playback_id: "def",
    vertical_status: "ready",
  }),
  "Master + vertical. Phones get the 9:16 cut, desktop gets the master."
);
check(
  "no crop at all",
  describeRenditions({ mux_playback_id: "abc", vertical_status: null }).startsWith(
    "Master only"
  ),
  true
);
check(
  "a row with no master is not playable and says so",
  describeRenditions({ mux_playback_id: null }),
  "No master — nothing to play."
);
/* 'ready' with no id is not ready. The pair is the state, not the word. */
check(
  "ready but no playback id is still master-only",
  describeRenditions({
    mux_playback_id: "abc",
    vertical_playback_id: null,
    vertical_status: "ready",
  }).startsWith("Master only"),
  true
);


/* ---- 7 · The mark in the corner ------------------------------------------- */
section("7 · The mark sits on the picture, never in a letterbox bar");

/*
 * The frame is always drawn at the shape of the cut inside it, so today every
 * one of these resolves to "the whole box" — contentBox is a no-op against real
 * content. It is here for the upload that is not 16:9, because the failure then
 * is a logo floating in a black bar, which reads as a broken page rather than a
 * watermark, and nobody would think to look for it.
 */
check(
  "a 16:9 picture in a 16:9 frame fills it — no bars",
  contentBox({ width: 900, height: 506.25 }, 16 / 9),
  { x: 0, y: 0, width: 900, height: 506.25 }
);
check(
  "a 4:3 picture in a 16:9 frame gets bars left and right",
  contentBox({ width: 800, height: 450 }, 4 / 3),
  { x: 100, y: 0, width: 600, height: 450 }
);
check(
  "a 16:9 picture in a 9:16 frame gets bars top and bottom",
  contentBox({ width: 360, height: 640 }, 16 / 9),
  { x: 0, y: 218.75, width: 360, height: 202.5 }
);

/* Sizing: 8% of the picture on landscape, 14% on the phone cut. */
check(
  "a 900px landscape frame gets a 72px mark, inset 27",
  markGeometry({ width: 900, height: 506.25 }, 16 / 9, "landscape"),
  { left: 27, top: 27, size: 72 }
);
check(
  "a 390px vertical frame gets 55, inset 12",
  markGeometry({ width: 390, height: 693.33 }, 9 / 16, "vertical"),
  { left: 12, top: 12, size: 55 }
);
ok(
  "the phone share is larger on purpose — 8% of 390 would be a smudge",
  markGeometry({ width: 390, height: 693.33 }, 9 / 16, "vertical")!.size >
    Math.round(390 * 0.08)
);

/* THE CASE THIS EXISTS FOR: a letterboxed picture pushes the mark inward, so
   it lands on the video rather than on the bar above it. */
const boxed = markGeometry({ width: 360, height: 640 }, 16 / 9, "vertical")!;
const picture = contentBox({ width: 360, height: 640 }, 16 / 9);
ok(
  "a letterboxed mark starts below the top bar",
  boxed.top >= picture.y,
  `top ${boxed.top} vs bar ends at ${picture.y}`
);
ok(
  "and ends before the picture does",
  boxed.top + boxed.size <= picture.y + picture.height,
  `${boxed.top + boxed.size} <= ${picture.y + picture.height}`
);

/* Floor and ceiling, because a percentage alone is wrong at both ends. */
check(
  "a huge desktop frame is capped, not proportional",
  markGeometry({ width: 2560, height: 1440 }, 16 / 9, "landscape")!.size,
  104
);
check(
  "and a tiny embed gets the floor rather than a smudge",
  markGeometry({ width: 200, height: 112.5 }, 16 / 9, "landscape")!.size,
  36
);
check(
  "a frame with no width has nowhere to put a mark",
  markGeometry({ width: 0, height: 0 }, 16 / 9, "landscape"),
  null
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
