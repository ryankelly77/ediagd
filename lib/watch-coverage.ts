/* ============================================================================
   EDIAGD — how much of a video was ACTUALLY PLAYED

   Pure. No React, no DOM, no clock. Every rule here is provable by passing
   numbers in and asserting on what comes back — see scripts/watch-scenarios.ts.

   ---------------------------------------------------------------------------
   THIS IS NOT THE SAME MEASUREMENT AS content_progress
   ---------------------------------------------------------------------------
   MuxVideo has always recorded the FURTHEST POINT REACHED, so re-watching
   cannot take away credit already earned. That is the right rule for "where do
   I resume", and it is the wrong rule for "did they watch it": dragging the
   scrubber to the end of a 29-second video sets furthest to 100% in under a
   second, having played nothing.

   Coverage is the other measurement. It asks which SECONDS OF THE MEDIA have
   been through the decoder, and a seek moves the playhead without adding any.
   Both are kept — they answer different questions, and the certification
   programme is about to treat "watched in the loop" as lesson credit, which is
   a claim only this one can support.
   ============================================================================ */

/** A half-open interval of media time, in seconds. */
export type Range = { start: number; end: number };

/**
 * Fold overlapping and touching intervals into a minimal set.
 *
 * The browser's own `played` TimeRanges is already normalised this way, so this
 * exists for the delta-accumulation fallback below — where every timeupdate
 * contributes its own tiny interval and they must not be counted twice when a
 * viewer replays a section.
 */
export function mergeRanges(ranges: Range[]): Range[] {
  const clean = ranges
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const out: Range[] = [];
  for (const r of clean) {
    const last = out[out.length - 1];
    // `>=` rather than `>`: two intervals that merely touch (…5] [5…) are one
    // continuous stretch of playback, and leaving them separate would be
    // arithmetically identical but would grow the array without bound over a
    // long watch.
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Total distinct media seconds covered by these ranges. */
export function coveredSeconds(ranges: Range[]): number {
  return mergeRanges(ranges).reduce((sum, r) => sum + (r.end - r.start), 0);
}

/**
 * Coverage as a percentage of the video's duration, 0-100.
 *
 * Returns 0 for an unknown or nonsensical duration rather than dividing by it.
 * A player that has not loaded metadata reports duration NaN, and a NaN
 * percentage would sail through a `>= 95` comparison as false and through a
 * `< 95` comparison as false too — the kind of value that makes a gate behave
 * differently depending on which way the condition was written.
 */
export function coveragePct(ranges: Range[], duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const pct = (coveredSeconds(ranges) / duration) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

/**
 * The gap between two timeupdate events, as an interval of PLAYED media.
 *
 * A media element fires timeupdate about four times a second, so a normal step
 * is ~0.25s. Anything much larger is not playback:
 *
 *   * a SEEK jumps the playhead — the skipped span was never decoded
 *   * a STALL or a backgrounded tab pauses the clock, then resumes; the wall
 *     time passed but the media time did not
 *   * PLAYBACK RATE changes scale the step, so the bound cannot be 0.25
 *
 * `maxStep` is the largest media-time jump still treated as continuous play.
 * 1.5s covers 4x playback comfortably and still refuses a scrub. A backwards
 * step is a seek backwards and contributes nothing on its own — the re-watched
 * span gets credited by the timeupdates that follow it.
 *
 * Returns null when the step is not playback.
 */
export function stepToRange(
  previousTime: number,
  currentTime: number,
  maxStep = 1.5
): Range | null {
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return null;
  const delta = currentTime - previousTime;
  if (delta <= 0) return null;
  if (delta > maxStep) return null;
  return { start: previousTime, end: currentTime };
}

/**
 * The bar for "watched", as a share of duration.
 *
 * 95 rather than 100 because the last frames of a Mux asset are routinely
 * unreachable: the media element commonly stops firing timeupdate a beat before
 * `duration`, and `ended` can arrive with currentTime a few hundredths short.
 * A 100% gate would be a gate nobody could open on some assets, and the failure
 * would look like a broken button rather than a strict rule.
 */
export const WATCHED_PCT = 95;

/**
 * Has this been watched?
 *
 * Rounds to two decimals before comparing so a coverage of 94.999999 — which
 * floating-point summation of TimeRanges produces routinely — does not read as
 * short of a 95 bar the viewer has plainly met.
 */
export function isWatched(pct: number, threshold = WATCHED_PCT): boolean {
  return Math.round(pct * 100) / 100 >= threshold;
}

/* ---------------------------------------------------------------------------
   The server's side of the same question
--------------------------------------------------------------------------- */

/**
 * Could this watch percentage physically have happened in this much time?
 *
 * THE CLIENT REPORTS, THE SERVER VERIFIES — the same posture as the block id on
 * daily_completion. A completion arrives with a watch percentage the client
 * measured, and a client can send any number it likes; what it cannot do is
 * make time pass. Ninety-five percent of a 29-second video takes at least ~26
 * seconds of wall clock, so a completion claiming it two seconds after the step
 * was served did not happen.
 *
 * The 0.9 factor is slack, not politeness: playback can genuinely outrun wall
 * clock a little at 1.25x speed, and the served-at timestamp is minted before
 * the page finishes rendering. It is generous enough that no honest viewer trips
 * it and tight enough that an instant claim cannot pass.
 *
 * Returns true when the claim is possible. An unknown duration returns true —
 * an unmeasurable claim is not evidence of forgery, and refusing completions
 * for videos whose duration nobody recorded would cost advisors their streak
 * over a missing column.
 */
export function watchIsPlausible(
  pct: number,
  durationSec: number | null | undefined,
  elapsedSec: number,
  threshold = WATCHED_PCT
): boolean {
  if (!isWatched(pct, threshold)) return true; // nothing being claimed
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return true;
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return false;
  return elapsedSec >= 0.9 * durationSec;
}

/**
 * What actually gets stored: 0-100, two decimals, or 0 when the player failed.
 *
 * A percentage is stored rather than a boolean because the LMS decides what
 * earns credit and that threshold will move. The measurement should outlive the
 * rule applied to it — re-deriving "did they watch it" from a stored number is
 * possible; recovering a number from a stored boolean is not.
 */
export function clampWatchPct(pct: unknown): number {
  const n = typeof pct === "number" ? pct : Number(pct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.min(100, n) * 100) / 100;
}

/* ---------------------------------------------------------------------------
   The session accumulator
--------------------------------------------------------------------------- */

/**
 * Everything one viewing of one video has established so far.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS HERE AND NOT IN THE PLAYER
 * ---------------------------------------------------------------------------
 * It used to live inside TrackedVideo as three refs and twenty lines of
 * handleTimeUpdate, which meant the one question anybody ever asks of it —
 * "does scrubbing break it?" — could only be answered by loading a page and
 * dragging a scrubber. Ryan reported a gate that would not open after a scrub
 * and there was no way to test the accumulator without a browser.
 *
 * It is pure, so now there is. The player owns the media events; this owns the
 * arithmetic.
 */
export type WatchSession = {
  /** Spans credited by the delta accumulator — the floor under `played`. */
  ranges: Range[];
  /** Where the playhead was at the previous sample, for the delta. */
  lastTime: number | null;
  /** The asset's duration, once the player has reported one. */
  duration: number;
  /** Coverage so far, 0-100. NEVER GOES DOWN — see observeWatch. */
  pct: number;
};

export function newWatchSession(): WatchSession {
  return { ranges: [], lastTime: null, duration: 0, pct: 0 };
}

/** One media sample: what the element reported at this timeupdate. */
export type WatchSample = {
  currentTime: number;
  duration: number;
  /** The element's own `played` TimeRanges, flattened. Authoritative when present. */
  played?: Range[];
};

/**
 * Fold one sample into the session.
 *
 * ---------------------------------------------------------------------------
 * A SEEK COSTS THE SKIPPED SECONDS AND NOTHING ELSE
 * ---------------------------------------------------------------------------
 * This is the property the whole feature turns on, so it is worth being exact
 * about the three ways a seek touches this function, and none of them is
 * destructive:
 *
 *   THE JUMP ITSELF adds nothing. stepToRange refuses a delta larger than a
 *   step of continuous play, so the span dragged over is never credited — which
 *   is the rule, and it stands.
 *
 *   WHAT FOLLOWS accumulates normally. `lastTime` is set to wherever the
 *   playhead landed, so the very next sample is an ordinary quarter-second step
 *   from there. There is no "seeked" flag, no penalty, nothing carried forward;
 *   the accumulator does not remember that a seek happened, because nothing
 *   about it should change what happens next.
 *
 *   SEEKING BACKWARDS gives a negative delta, which is also refused — and then
 *   the re-watched span is credited by the samples that follow it. mergeRanges
 *   folds it into what was already there rather than counting it twice.
 *
 * So: scrub anywhere, any number of times, then play the video through, and the
 * ranges merge into one span and coverage reaches 100. What a scrub cannot do
 * is poison the rest of the session — and what it never buys is credit for the
 * seconds it skipped.
 *
 * MONOTONIC. `pct` is the high-water mark, never the latest reading. A webview
 * that reports an empty `played` for one sample, or a duration that arrives
 * late, must not walk a real watch backwards — and a gate that could close
 * again after opening is a gate that opens at random.
 */
export function observeWatch(session: WatchSession, sample: WatchSample): WatchSession {
  const duration =
    Number.isFinite(sample.duration) && sample.duration > 0
      ? sample.duration
      : session.duration;

  const step = stepToRange(session.lastTime ?? sample.currentTime, sample.currentTime);
  const ranges = step ? mergeRanges([...session.ranges, step]) : session.ranges;

  let pct = coveragePct(ranges, duration);
  /*
   * `played` is authoritative where the browser provides it: it is the decoder's
   * own record and already excludes everything seeked past. The delta
   * accumulator stays as a floor under it, because a quirky webview that returns
   * an empty TimeRanges would otherwise drag a real watch to zero.
   */
  if (sample.played && sample.played.length > 0) {
    pct = Math.max(pct, coveragePct(sample.played, duration));
  }

  return {
    ranges,
    lastTime: sample.currentTime,
    duration,
    pct: Math.max(session.pct, pct),
  };
}
