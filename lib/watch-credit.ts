/* ============================================================================
   EDIAGD — one video, one watch, however many players render it

   CLIENT-SAFE. No server-only import, because the decision this holds is made
   in the browser, between two mounts of the same video, before any round trip.

   ---------------------------------------------------------------------------
   THE BUG THIS EXISTS FOR
   ---------------------------------------------------------------------------
   On a rest day the card offers the day's video with nothing gated on it, and
   "Take today's rep anyway" then reveals the loop — which serves THE SAME
   VIDEO, gated. Both players ask the server record whether the gate was already
   met today, and the record is a prop fetched when the page loaded. The reveal
   is deliberately a state change with no round trip, so an advisor who watched
   the video on the card met a step-4 player still holding the null the server
   sent before they pressed play, and was asked to watch the whole thing again.

   The write was never the problem: the card mints a ticket and files the gate
   exactly as the loop does. What was missing is the client reading back its own
   write. So a gate opened anywhere in this visit is remembered here, and every
   player that renders that video afterwards is handed it.

   ---------------------------------------------------------------------------
   WHAT DOES NOT CARRY: PARTIAL COVERAGE
   ---------------------------------------------------------------------------
   Only a MET gate travels. Coverage is session-only by design — it is what
   stops a watch being assembled out of five-second visits across a week — and
   TrackedVideo refuses to seed its accumulator from a record, because a later
   partial watch could then resume from a full one.

   Carrying a half-watch between mounts would mean reversing that for the sake
   of the one case where the same video renders twice in a day. Threshold or
   nothing: cross the bar on the card and the loop knows; stop halfway and the
   loop starts at zero. The alternative buys a minute of rewatch and costs the
   property that makes the measurement mean anything.
   ============================================================================ */

/**
 * A gate already met, for one video, on one store-local day.
 *
 * Defined here rather than in lib/watch-gate so both sides can name it: that
 * module is server-only, and this shape is what the browser passes between two
 * players. watch-gate re-exports it, so every existing import still resolves.
 */
export type GateRecord = {
  /** Coverage when it opened, or null when the failure valve opened it. */
  pct: number | null;
  /** Opened because the player broke, not because the video was watched. */
  error: boolean;
};

/** What the tracker reports when a gate opens. */
export type WatchOutcome = { pct: number; error: boolean };

/**
 * The record a crossed threshold produces.
 *
 * A failed player reports no percentage. It opened the gate because the video
 * would not play, and writing down whatever fraction had struggled through
 * would read later as a watch that happened.
 */
export function gateFromWatch(state: WatchOutcome): GateRecord {
  return { pct: state.error ? null : state.pct, error: state.error };
}

/**
 * What to hand a player as `initialMet`.
 *
 * `session` wins when present, and it can only ever have been set by a gate
 * opening in this visit — which is strictly newer than anything the page load
 * carried. There is no case where the server record is fresher.
 *
 * A session gate is kept even when the server refused to write it. The refusal
 * path already promises the advisor keeps the gate they earned in this session
 * and loses only its survival of a refresh; a second mount of the same video is
 * still that session, so it must not re-demand the watch either.
 */
export function creditedGate(
  server: GateRecord | null,
  session: GateRecord | null
): GateRecord | null {
  return session ?? server;
}
