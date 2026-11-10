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
 * How close to the end the Continue gate opens, in seconds.
 *
 * The sign-off — "Mahalo" — lands a median 1.46s from the end across the whole
 * library, measured word-level across 90 films. Two seconds is that moment.
 */
export const GATE_TAIL_SEC = 2;

/**
 * The bar for THIS video, which a flat percentage cannot express.
 *
 * 95% is a share, and a share of a long film is a lot of film: on a 130-second
 * lesson it opens the button six and a half seconds early, while Mitch is still
 * talking. On a 30-second one it is a second and a half. The same number,
 * behaving completely differently, and worst on the longest pieces — which is
 * exactly what Ryan kept seeing: "the gold button showed way before the end
 * again."
 *
 * So the tail is expressed in SECONDS and converted to this video's own
 * percentage. And it is the STRICTER of the two, never the looser: on a short
 * clip two seconds would be 80% of it, which would open the gate earlier than
 * today rather than later. 95 stays the floor.
 */
export function gateThreshold(durationSec: number | null | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
    return WATCHED_PCT;
  }
  const tailBased = ((durationSec - GATE_TAIL_SEC) / durationSec) * 100;
  return Math.max(WATCHED_PCT, Math.min(99.5, tailBased));
}

/**
 * Has this been watched?
 *
 * Rounds to two decimals before comparing so a coverage of 94.999999 — which
 * floating-point summation of TimeRanges produces routinely — does not read as
 * short of a 95 bar the viewer has plainly met.
 *
 * NOTE THAT THE ROUNDING IS ONE-SIDED: the value is rounded, the threshold is
 * not. That is deliberate and it is also why the server must never share a bar
 * with the player — see serverGateThreshold directly below.
 */
export function isWatched(pct: number, threshold = WATCHED_PCT): boolean {
  return Math.round(pct * 100) / 100 >= threshold;
}

/**
 * How much looser the SERVER's bar is than the player's, in seconds of tail.
 *
 * `content.duration_sec` is an integer column, so the number the server holds
 * and the number the player measures off the media element differ by up to half
 * a second BY CONSTRUCTION — nothing is wrong with either. Measured across 411
 * published films on 5 November 2026: `mux - db` ran from -0.500s to +0.490s,
 * median +0.021s, and not one film exceeded a second.
 *
 * Half a second is therefore the whole of the disagreement the storage format
 * permits, not an estimate of it.
 */
export const SERVER_GATE_SLACK_SEC = 0.5;

/**
 * The bar the SERVER verifies a reported watch against.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT gateThreshold, AND WHY SHARING ONE WAS THE BUG
 * ---------------------------------------------------------------------------
 * Two systems measure this film. TrackedVideo opens its gate at
 * `gateThreshold(el.duration)` — the asset's real length, to the millisecond.
 * completeLibraryItem checked `gateThreshold(content.duration_sec)` — a whole
 * number of seconds in Postgres. Same function, same name, two different
 * quantities, and AGENTS.md already has the rule: two numbers with the same
 * name from different systems are not the same measurement.
 *
 * The gap is in the fourth decimal place of a percentage, which is exactly why
 * nobody saw it. On "After-MPI — Tire Rotation" the player credits at 98.3336
 * and the server demanded 98.3333 — and `isWatched` rounds the reported value
 * to 98.33, which is below the unrounded bar. Refused. The advisor watched the
 * film to the end.
 *
 * MEASURED, because the margin is too small to reason about: of 411 published
 * films, the server's bar exceeded the player's on 196 — 48% of the library.
 * Nine real completions were lost to it across three accounts before anybody
 * reported it, and they were only visible because the screen kept showing a
 * tick the database never got.
 *
 * ---------------------------------------------------------------------------
 * THE FIX IS A CONSTRUCTION, NOT A TOLERANCE
 * ---------------------------------------------------------------------------
 * The server is given a longer tail, so its bar is provably BELOW the player's
 * for every duration disagreement the integer column can produce. The unsafe
 * state — a server stricter than the gate the advisor actually saw open — is
 * not reachable rather than merely unlikely. Proven both ways in
 * `npm run test:watched-rule`: zero of 411 real films and zero of 2,905
 * synthetic worst-corner durations, and a film at 60% is still refused.
 *
 * It does not weaken the rule the advisor experiences. The player is still what
 * decides when the gate opens, unchanged at two seconds; this only stops the
 * server second-guessing it with a worse number. Half a second of extra tail
 * cannot be reached by anyone who has not watched to the player's own gate.
 */
export function serverGateThreshold(durationSec: number | null | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
    return WATCHED_PCT;
  }
  const tail = GATE_TAIL_SEC + SERVER_GATE_SLACK_SEC;
  const tailBased = ((durationSec - tail) / durationSec) * 100;
  return Math.max(WATCHED_PCT, Math.min(99.5, tailBased));
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

/**
 * Is a "the gate is met" claim possible this soon after the player opened?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT watchIsPlausible
 * ---------------------------------------------------------------------------
 * watchIsPlausible has a deliberate escape hatch: a claim BELOW the bar is not
 * a claim at all, so it is never challenged. An honest 40% is not a forgery and
 * refusing it would cost streaks over nothing.
 *
 * That hatch cannot be carried into the gate record. The gate opens at
 * game_settings.video_complete_pct — 90 by default — while credit needs 95, and
 * that early-gold margin is by design. Reuse watchIsPlausible here and posting
 * `pct: 90` one second after minting a ticket would sail through, because 90 is
 * "not a claim": one request, and the gate is open for the rest of the day.
 *
 * A met gate IS a claim, whatever number came with it. So the test is the wall
 * clock alone: saying you watched it takes as long as watching it.
 *
 * The same 0.9 slack as everywhere else — playback can outrun the clock a
 * little, and the ticket is minted a beat before the first frame decodes.
 * An unknown duration cannot be tested, and an untestable claim is not evidence
 * of forgery: it passes, exactly as it does for a completion.
 */
export function gateMetIsPlausible(
  durationSec: number | null | undefined,
  elapsedSec: number
): boolean {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return true;
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return false;
  return elapsedSec >= 0.9 * durationSec;
}
