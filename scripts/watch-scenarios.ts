/* ============================================================================
   EDIAGD — watch-coverage scenarios

   Offline. No database, no network, no clock, no DOM: the coverage arithmetic
   and the server's plausibility rule are pure, so every case here is proved by
   passing numbers in and asserting on what comes back.

   The acceptance cases from the brief are the first section, by number, because
   those are the ones somebody will come back and check.

     npm run test:watch
   ============================================================================ */

import {
  WATCHED_PCT,
  clampWatchPct,
  coveragePct,
  coveredSeconds,
  isWatched,
  mergeRanges,
  newWatchSession,
  observeWatch,
  stepToRange,
  watchIsPlausible,
  type Range,
  type WatchSession,
} from "../lib/watch-coverage";

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

/** Play from `from` to `to` in realistic timeupdate steps. */
function play(from: number, to: number, step = 0.25): Range[] {
  const out: Range[] = [];
  let t = from;
  while (t < to) {
    const next = Math.min(to, t + step);
    const r = stepToRange(t, next);
    if (r) out.push(r);
    t = next;
  }
  return out;
}

/* The brief's video: 29 seconds. */
const D = 29;

(async () => {
  /* =======================================================================
     1 · The acceptance cases, in order
     ======================================================================= */
  section("1 · The acceptance cases");

  // "Tap Continue at 0:03 of a 0:29 video -> nothing happens; line shows ~10%."
  const threeSeconds = play(0, 3);
  const pctAt3 = coveragePct(threeSeconds, D);
  ok("at 0:03 of 0:29 the line shows ~10%", Math.round(pctAt3) === 10, `${pctAt3.toFixed(1)}%`);
  check("and the gate is shut", isWatched(pctAt3), false);

  /*
   * "Scrub to the end -> still disabled; coverage unchanged."
   *
   * A scrub is a single enormous jump in currentTime. stepToRange refuses it,
   * so the ranges are exactly what they were before the drag.
   */
  const scrub = stepToRange(3, 29);
  check("a 26-second jump contributes no range", scrub, null);
  const afterScrub = mergeRanges([...threeSeconds]);
  check(
    "coverage is unchanged by scrubbing to the end",
    coveragePct(afterScrub, D).toFixed(4),
    pctAt3.toFixed(4)
  );

  /*
   * And the case that makes the whole feature necessary: landing on the last
   * frame is 100% of the PLAYHEAD and ~3% of the video.
   */
  const scrubbedThenPlayedTheEnd = mergeRanges([...threeSeconds, ...play(28, 29)]);
  const scrubPct = coveragePct(scrubbedThenPlayedTheEnd, D);
  ok(
    "scrub-to-end then play the last second is nowhere near watched",
    !isWatched(scrubPct),
    `${scrubPct.toFixed(1)}%`
  );

  // "Let it play through -> enables at ~95%; completion carries ~100."
  const whole = play(0, 29);
  const wholePct = coveragePct(whole, D);
  ok("playing it through reaches 100%", Math.round(wholePct) === 100, `${wholePct.toFixed(2)}%`);
  check("and the gate opens", isWatched(wholePct), true);

  // The threshold itself: 95% of 29s is 27.55s.
  const justUnder = play(0, 27.5);
  const justOver = play(0, 27.6);
  check("27.5s of 29s is short of the bar", isWatched(coveragePct(justUnder, D)), false);
  check("27.6s of 29s clears it", isWatched(coveragePct(justOver, D)), true);

  /* =======================================================================
     2 · Coverage arithmetic
     ======================================================================= */
  section("2 · Coverage arithmetic");

  check("overlapping ranges are not double counted", coveredSeconds([
    { start: 0, end: 10 },
    { start: 5, end: 15 },
  ]), 15);
  check("touching ranges merge", mergeRanges([
    { start: 0, end: 5 },
    { start: 5, end: 9 },
  ]), [{ start: 0, end: 9 }]);
  check("out-of-order input is sorted first", coveredSeconds([
    { start: 20, end: 25 },
    { start: 0, end: 10 },
  ]), 15);
  check("zero-length and inverted ranges are dropped", coveredSeconds([
    { start: 5, end: 5 },
    { start: 9, end: 2 },
  ]), 0);

  /*
   * REWATCHING NEVER ADDS AND NEVER SUBTRACTS. Playing the same ten seconds
   * three times is ten seconds of coverage — and, crucially, it does not
   * decrease: once the gate is met for the day it stays met.
   */
  const rewatched = mergeRanges([...play(0, 10), ...play(0, 10), ...play(0, 10)]);
  check("rewatching the same span counts once", Math.round(coveredSeconds(rewatched)), 10);

  const fullThenRewatch = mergeRanges([...play(0, 29), ...play(4, 9)]);
  check(
    "rewatching after a full watch keeps it at 100",
    Math.round(coveragePct(fullThenRewatch, D)),
    100
  );

  /* =======================================================================
     3 · What counts as playback
     ======================================================================= */
  section("3 · What counts as playback");

  check("a normal 0.25s step counts", stepToRange(1, 1.25), { start: 1, end: 1.25 });
  check("a 1.5s step still counts (4x playback)", stepToRange(1, 2.5), { start: 1, end: 2.5 });
  check("a 2s step does not", stepToRange(1, 3), null);
  check("a backwards step contributes nothing", stepToRange(9, 4), null);
  check("a still playhead contributes nothing", stepToRange(4, 4), null);
  check("NaN is refused rather than propagated", stepToRange(NaN, 4), null);

  /*
   * A backgrounded app: the media element pauses, timeupdate stops. When it
   * resumes, the playhead has not moved, so the first step after is tiny — and
   * the wall-clock gap that passed adds nothing at all. That is the property
   * that makes the measurement safe in the Capacitor shell.
   */
  const backgrounded = mergeRanges([...play(0, 5), ...play(5, 10)]);
  check("backgrounding adds no coverage", Math.round(coveredSeconds(backgrounded)), 10);

  /* =======================================================================
     4 · Duration edge cases
     ======================================================================= */
  section("4 · Duration edge cases");

  check("unknown duration is 0%, never NaN", coveragePct(play(0, 5), NaN), 0);
  check("zero duration is 0%", coveragePct(play(0, 5), 0), 0);
  ok(
    "a NaN percentage can never satisfy the gate",
    !isWatched(coveragePct(play(0, 5), NaN)),
    "the failure mode that reads differently depending on comparison direction"
  );
  check("coverage cannot exceed 100", coveragePct([{ start: 0, end: 60 }], D), 100);
  check("94.999999 rounds up to meet a 95 bar", isWatched(94.999999), true);
  check("94.98 does not", isWatched(94.98), false);

  /* =======================================================================
     5 · The server's plausibility rule
     ======================================================================= */
  section("5 · The server's plausibility rule");

  // "Server rejects a forged completion posted 2s after render claiming 100%."
  check("100% claimed 2s after a 29s video was served is refused",
    watchIsPlausible(100, D, 2), false);
  check("100% claimed after 27s is allowed", watchIsPlausible(100, D, 27), true);
  check("the boundary is 0.9 x duration", watchIsPlausible(100, D, 26.1), true);
  check("just inside it is refused", watchIsPlausible(100, D, 26.0), false);

  /*
   * A PARTIAL WATCH IS NEVER REFUSED. Nothing is being claimed below the bar,
   * so there is nothing to forge — and rejecting it would cost an honest
   * advisor their day for watching some of a video quickly.
   */
  check("40% two seconds in is fine", watchIsPlausible(40, D, 2), true);
  check("0% is fine", watchIsPlausible(0, D, 0), true);

  /*
   * An unmeasurable claim is not evidence of forgery. Refusing completions for
   * videos whose duration nobody recorded would cost streaks over a null.
   */
  check("unknown duration cannot refuse", watchIsPlausible(100, null, 1), true);
  check("zero duration cannot refuse", watchIsPlausible(100, 0, 1), true);
  check("a negative elapsed is refused", watchIsPlausible(100, D, -5), false);

  /* =======================================================================
     6 · What gets stored
     ======================================================================= */
  section("6 · What gets stored");

  check("a percentage keeps two decimals", clampWatchPct(94.6666), 94.67);
  check("over 100 clamps", clampWatchPct(140), 100);
  check("negative becomes 0", clampWatchPct(-3), 0);
  check("nonsense becomes 0", clampWatchPct("banana"), 0);
  check("null becomes 0", clampWatchPct(null), 0);
  check("the stored value is a number, not a verdict", typeof clampWatchPct(95), "number");
  check("the default bar is 95", WATCHED_PCT, 95);


  /* =======================================================================
     7 · Ryan's bug: scrubbing must not poison the session
     =======================================================================

     Reported on /today: scrub the timeline and Continue never enables, even
     after playing to the end, and a refresh does not clear it. Two things were
     true, and only one of them was this file's business.

     The LOCKOUT was the resume point: a scrub wrote position_sec through
     record_watch_progress, so every subsequent load started the player four
     seconds from the end and there was nothing left to cover. That is fixed in
     MuxVideo — a gated player always starts at zero.

     THE ACCUMULATOR was not at fault, and these are the cases that say so. They
     are worth keeping anyway, because "seeking poisons the rest of the session"
     is the shape of bug this design could plausibly have had, and nobody could
     have ruled it out without loading a page and dragging a scrubber.
     ======================================================================= */
  section("7 · A scrub costs the seconds it skipped, and nothing else");

  /** Drive the real accumulator the way the player does. */
  const watch = (
    from: WatchSession,
    a: number,
    b: number,
    step = 0.25,
    duration = D
  ): WatchSession => {
    let s = from;
    for (let t = a; t < b; t = Math.min(b, t + step)) {
      const next = Math.min(b, t + step);
      s = observeWatch(s, { currentTime: next, duration });
      if (next >= b) break;
    }
    return s;
  };
  /** A seek: the playhead moves with no playback in between. */
  const seek = (from: WatchSession, to: number, duration = D): WatchSession =>
    observeWatch(from, { currentTime: to, duration });

  /* The exact gesture Ryan made: drag to near the end of a 29s video. */
  let s = watch(newWatchSession(), 0, 2);
  s = seek(s, 27);
  s = watch(s, 27, D);
  ok("dragging to the end and playing out the tail is not a watch",
     !isWatched(s.pct), `${s.pct.toFixed(1)}%`);
  check("and it credits only the seconds actually played",
        Math.round(coveredSeconds(s.ranges)), 4);

  /* THE FIX'S ACCEPTANCE CASE. Having scrubbed, play the whole thing. */
  s = watch(s, 0, D);
  ok("then playing it through clears the bar", isWatched(s.pct), `${s.pct.toFixed(1)}%`);
  check("the ranges merged into one span", s.ranges.length, 1);

  /* Scrubbing repeatedly, forwards and backwards, then playing through. */
  let t = newWatchSession();
  t = watch(t, 0, 3);
  t = seek(t, 20);
  t = watch(t, 20, 22);
  t = seek(t, 5);
  t = watch(t, 5, 6);
  t = seek(t, 0);
  t = watch(t, 0, D);
  ok("four seeks, then a full play-through, still clears",
     isWatched(t.pct), `${t.pct.toFixed(1)}%`);

  /* The seek itself must never add anything, in either direction. */
  const before = watch(newWatchSession(), 0, 5);
  check("a forward seek adds no coverage",
        Math.round(coveredSeconds(seek(before, 25).ranges) * 100) / 100,
        Math.round(coveredSeconds(before.ranges) * 100) / 100);
  check("nor does a backward one",
        Math.round(coveredSeconds(seek(before, 1).ranges) * 100) / 100,
        Math.round(coveredSeconds(before.ranges) * 100) / 100);

  /* And the sample AFTER a seek is an ordinary step, not a penalty. */
  const landed = seek(before, 25);
  const resumed = observeWatch(landed, { currentTime: 25.25, duration: D });
  check("accumulation resumes immediately at the new position",
        Math.round((coveredSeconds(resumed.ranges) - coveredSeconds(landed.ranges)) * 100) / 100,
        0.25);

  /* Re-watching a span already covered must not count it twice. */
  let u = watch(newWatchSession(), 0, 10);
  u = seek(u, 0);
  u = watch(u, 0, 10);
  check("re-watching the same ten seconds still counts ten",
        Math.round(coveredSeconds(u.ranges)), 10);

  /* `played` is authoritative, and the delta accumulator is the floor. */
  const withPlayed = observeWatch(newWatchSession(), {
    currentTime: 1,
    duration: D,
    played: [{ start: 0, end: D }],
  });
  ok("the element's own played record can clear the bar on its own",
     isWatched(withPlayed.pct), `${withPlayed.pct.toFixed(1)}%`);
  const thenEmpty = observeWatch(withPlayed, { currentTime: 1.25, duration: D, played: [] });
  ok("and a webview that then reports an empty one cannot take it back",
     isWatched(thenEmpty.pct), `${thenEmpty.pct.toFixed(1)}%`);

  /* Duration arriving late must not zero what came before it. */
  let late = observeWatch(newWatchSession(), { currentTime: 0.25, duration: NaN });
  late = observeWatch(late, { currentTime: 0.5, duration: NaN });
  check("no duration yet means no percentage yet", late.pct, 0);
  late = watch(late, 0.5, D);
  ok("and once it arrives the earlier seconds still count",
     isWatched(late.pct), `${late.pct.toFixed(1)}%`);

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\n  FAILURES");
    failures.forEach((f) => console.log(`    ${f}`));
    process.exit(1);
  }
})();
