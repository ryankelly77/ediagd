"use client";

/* ============================================================================
   EDIAGD — the player that measures what was actually watched

   ONE MEASUREMENT, THREE POLICIES. The daily loop needs a Continue button that
   will not open until the video has been played; the LMS needs the same number
   for lesson credit but must not block a lesson on it; the library needs
   neither. All three are the same arithmetic, and it is written once here so
   the LMS inherits it rather than growing a second implementation that disagrees
   at the third decimal place.

     gate-continue  measure, and report `met` so a parent can gate on it
     credit-only    measure and report; the parent gates on nothing
     none           do not measure at all

   `none` exists so a caller can turn tracking off explicitly rather than by
   reaching for the untracked MuxVideo — the two players would then drift.

   ---------------------------------------------------------------------------
   COVERAGE COMES FROM `played`, NOT FROM currentTime
   ---------------------------------------------------------------------------
   The media element maintains a `played` TimeRanges of the spans that have gone
   through the decoder. Seeking moves the playhead without adding to it, which
   is precisely the property this feature needs and precisely the property
   currentTime does not have. Where `played` is unavailable, timeupdate deltas
   are accumulated instead — see stepToRange in lib/watch-coverage.

   Both paths run: `played` is authoritative when it reports something, and the
   delta accumulator is a floor under it. A browser that quietly returns an
   empty TimeRanges would otherwise gate the button shut forever.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { MuxVideo, type MuxVideoProps } from "@/components/video/MuxVideo";
import {
  WATCHED_PCT,
  isWatched,
  newWatchSession,
  observeWatch,
  type Range,
  type WatchSession,
} from "@/lib/watch-coverage";

export type WatchPolicy = "gate-continue" | "credit-only" | "none";

/** What the tracker knows, handed up on every change. */
export type WatchState = {
  /** Share of the video actually played, 0-100. */
  pct: number;
  /** Has the threshold been met at any point today? Never goes back to false. */
  met: boolean;
  /** The player failed or stalled, and the gate was released for it. */
  error: boolean;
};

/**
 * How long after pressing play we wait for a single frame before giving up.
 *
 * Twenty seconds is long enough to survive a slow handover on dealership wifi
 * and short enough that an advisor standing on a service drive has not already
 * decided the app is broken.
 */
const PLAYBACK_TIMEOUT_MS = 20_000;

export function TrackedVideo({
  policy = "credit-only",
  threshold = WATCHED_PCT,
  onWatchChange,
  onFirstPlay,
  initialMet = null,
  onGateMet,
  ...player
}: Omit<MuxVideoProps, "onEnded"> & {
  /**
   * Fired ONCE, the first time this viewer intends to play.
   *
   * This is where the watch ticket is minted, because it is the first moment
   * there is anything to time. Fired on the play INTENT rather than on the
   * first timeupdate so a slow first segment does not shorten the window the
   * advisor gets — and once only, so pausing and resuming does not re-open it.
   */
  onFirstPlay?: () => void;
  /**
   * This gate was already met earlier today, and the server says so.
   *
   * Coverage is session-only by design, so a reload starts the measurement at
   * zero — which used to mean a reload shut a gate the advisor had already
   * opened. The FACT is persisted instead of the position (see 0086), and this
   * is that fact arriving back.
   *
   * It seeds `met` and the reported percentage. It does NOT seed the coverage
   * accumulator: nothing has been decoded in this session and pretending
   * otherwise would let a later partial watch resume from a full one.
   */
  initialMet?: { pct: number | null; error: boolean } | null;
  /**
   * Fired ONCE, the moment the gate opens — by watching or by failing.
   *
   * This is where the fact gets written down. It carries the measurement, not
   * a verdict: the server re-checks the ticket and the wall clock before it
   * believes any of it.
   */
  onGateMet?: (state: WatchState) => void;
  policy?: WatchPolicy;
  threshold?: number;
  onWatchChange?: (state: WatchState) => void;
}) {
  /* All of the arithmetic lives in lib/watch-coverage now, so "does a scrub
     break this" is a test rather than a page you have to load and drag. */
  const session = useRef<WatchSession>(newWatchSession());

  /*
   * ---- A GATE MET EARLIER TODAY STARTS OPEN -------------------------------
   *
   * Seeded from the server record, at first render rather than in an effect, so
   * Continue is gold on the first paint instead of flashing shut and opening a
   * beat later.
   *
   * The COVERAGE is not seeded — `session` still starts empty. Nothing has been
   * decoded in this tab, and claiming otherwise would let a fresh half-watch
   * inherit a full one's ranges. What is inherited is the verdict, which is the
   * only thing that was ever persisted.
   */
  const [pct, setPct] = useState(initialMet?.pct ?? 0);
  const [failed, setFailed] = useState(Boolean(initialMet?.error));

  /* Kept in refs as well as state: the timeout callback and the media handlers
     close over them, and a stale `met` there would re-release a gate that has
     already been met and re-report it as an error. */
  const metRef = useRef(Boolean(initialMet) && !initialMet?.error);
  const failedRef = useRef(Boolean(initialMet?.error));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Written down once per session. A gate restored from the server is already
     recorded, so it does not get filed again. */
  const gateFiled = useRef(Boolean(initialMet));
  const fileGate = useCallback(
    (state: WatchState) => {
      if (gateFiled.current) return;
      gateFiled.current = true;
      onGateMet?.(state);
    },
    [onGateMet]
  );

  const report = useCallback(
    (next: Partial<WatchState>) => {
      onWatchChange?.({
        pct: next.pct ?? pct,
        met: next.met ?? metRef.current,
        error: next.error ?? failedRef.current,
      });
    },
    [onWatchChange, pct]
  );

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /**
   * Give up waiting and let them through.
   *
   * ONCE MET, NEVER UNDONE. A stall after the threshold was already reached is
   * not a failure that should relabel a completed watch as an error — the
   * advisor watched it, and the LMS should not hear otherwise because the
   * network dropped on the way to the next screen.
   */
  const release = useCallback(() => {
    clearTimer();
    if (metRef.current || failedRef.current) return;
    failedRef.current = true;
    setFailed(true);
    report({ error: true, pct: 0 });
    /* The valve counts as the gate opening, and it persists the same way: a
       refresh after a broken video must not demand the broken video again. */
    fileGate({ pct: 0, met: false, error: true });
  }, [clearTimer, report, fileGate]);

  const armTimeout = useCallback(() => {
    if (metRef.current || failedRef.current) return;
    clearTimer();
    timer.current = setTimeout(release, PLAYBACK_TIMEOUT_MS);
  }, [clearTimer, release]);

  useEffect(() => clearTimer, [clearTimer]);

  const handleTimeUpdate = useCallback(
    (event: Event) => {
      if (policy === "none") return;
      const el = event.currentTarget as HTMLVideoElement | null;
      if (!el) return;

      /* A frame decoded is proof playback started — whatever the network does
         after this, the advisor is not stuck behind the timeout. */
      clearTimer();

      /* The element's own record of what went through the decoder. */
      const playedRanges: Range[] = [];
      const p = el.played;
      if (p) {
        for (let i = 0; i < p.length; i++) {
          playedRanges.push({ start: p.start(i), end: p.end(i) });
        }
      }

      session.current = observeWatch(session.current, {
        currentTime: el.currentTime,
        duration: el.duration,
        played: playedRanges,
      });
      const next = session.current.pct;

      if (next <= pct) return; // no new ground covered
      setPct(next);

      /* `met` lives only in a ref: this component renders nothing that depends
         on it — the gate and its line are the parent's — and a second copy in
         state would be a second source of truth for the same fact. */
      if (!metRef.current && isWatched(next, threshold)) {
        metRef.current = true;
        report({ pct: next, met: true });
        fileGate({ pct: next, met: true, error: false });
        return;
      }
      report({ pct: next });
    },
    [policy, threshold, pct, report, clearTimer, fileGate]
  );

  /*
   * BACKGROUNDING THE APP MUST NOT ACCUMULATE, AND IT DOES NOT.
   *
   * In the Capacitor shell, backgrounding pauses the media element; timeupdate
   * stops firing, so nothing is added — the measurement is driven by media
   * time, never by wall clock, so there is no timer to keep running. Returning
   * resumes and the deltas continue from where the playhead is. Lock-screen and
   * picture-in-picture playback keep firing timeupdate, so they count, which is
   * correct: it is playing.
   *
   * The only thing wall-clock drives is the stall timeout, and that is
   * disarmed here so a backgrounded app cannot time itself out while paused.
   */
  const handlePause = useCallback(() => clearTimer(), [clearTimer]);

  const firstPlayFired = useRef(false);
  const handlePlay = useCallback(() => {
    if (policy === "none") return;
    if (!firstPlayFired.current) {
      firstPlayFired.current = true;
      onFirstPlay?.();
    }
    armTimeout();
  }, [policy, armTimeout, onFirstPlay]);

  const handleError = useCallback(() => release(), [release]);

  /*
   * `ended` is NOT sufficient on its own, deliberately. A viewer who scrubs to
   * the last second gets an `ended` event having played nothing, and treating
   * that as a watch would reopen the exact hole this feature closes. It is used
   * only to take a final coverage reading, since the last timeupdate can land a
   * beat before the true end.
   */
  const handleEnded = useCallback(
    (event: Event) => {
      if (policy === "none") return;
      handleTimeUpdate(event);
    },
    [policy, handleTimeUpdate]
  );

  const tracking = policy !== "none";

  return (
    <div>
      <MuxVideo
        {...player}
        /* The parent draws the gate line; two progress bars stacked would be
           two different numbers (furthest-reached and coverage) disagreeing in
           public. */
        showProgress={player.showProgress ?? !tracking}
        /*
         * ONLY `gate-continue` LOSES CONTROLS. The policy already says whether
         * a button is waiting on this video, and that is precisely the question
         * "should this be skippable" is asking — so it is answered here rather
         * than by a second flag every caller would have to remember to set in
         * agreement with the policy it already passed.
         *
         * `credit-only` (the LMS) and `none` (the library) keep the timeline,
         * the speed menu and the resume point. Nothing is held shut there.
         */
        gated={player.gated ?? policy === "gate-continue"}
        onTimeUpdate={tracking ? handleTimeUpdate : undefined}
        onPlay={tracking ? handlePlay : undefined}
        onPause={tracking ? handlePause : undefined}
        onError={tracking ? handleError : undefined}
        onEnded={tracking ? handleEnded : undefined}
      />
      {failed && (
        <p className="mt-3 text-sm text-ink-soft">
          Couldn&apos;t play this one — moving on.
        </p>
      )}
    </div>
  );
}

/**
 * The gate line under the Continue button.
 *
 * A thin line that fills, and nothing else — no countdown, no "watch 12 more
 * seconds", no nagging. The advisor can see the player; a second commentary on
 * it is noise on a three-minute ritual.
 *
 * Teal while working, palm when met. Gold belongs to the CTA above it and clay
 * is the attention colour; neither should appear on a progress line, and red
 * appears nowhere in this brand at all.
 */
export function WatchGateLine({ pct, met }: { pct: number; met: boolean }) {
  return (
    <div
      className="mt-2 h-1 w-full overflow-hidden rounded-pill"
      style={{ background: "rgb(var(--ediagd-teal-soft) / 0.45)" }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Watched so far"
    >
      <div
        className="h-full rounded-pill transition-[width] duration-300"
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          background: met ? "rgb(var(--ediagd-palm))" : "rgb(var(--ediagd-teal))",
        }}
      />
    </div>
  );
}
