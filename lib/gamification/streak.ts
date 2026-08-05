/* ============================================================================
   EDIAGD — Swell (streak) math
   PURE. No Supabase, no clock, no I/O — every input is passed in, so the
   grace-day rules can be tested exhaustively without a database.

   Brand rules encoded: celebrate up, never punish down. A missed day is
   absorbed by "Paddle Back Out" grace if the user has enough banked; otherwise
   the Swell restarts at 1 (a fresh start, not a penalty).
   ============================================================================ */

/** A calendar date in a rooftop's timezone, 'YYYY-MM-DD'. */
export type IsoDate = string;

export type SwellState = {
  currentLen: number;
  longestLen: number;
  lastCompletedOn: IsoDate | null;
  paddleOutAvailable: number;
  paddleOutLastGranted: IsoDate | null;
};

export type GameSettings = {
  paddleOutCap: number;
  paddleOutPerMonth: number;
  sandDailyLoop: number;
  sandSwell7: number;
  sandSwell30: number;
  sandSwell90: number;
  sandSwell365: number;
  sandBadge: number;
  sandCertification: number;
};

export type StreakOutcome = {
  /** Grace days granted by the monthly accrual on this run. */
  paddleOutGranted: number;
  /** Grace days consumed to bridge a gap. */
  paddleOutSpent: number;
  graceUsed: boolean;
  streakReset: boolean;
  /** Days missed between the last completion and today. */
  gapDays: number;
  /** Milestone reached by this completion, if any. */
  milestone: number | null;
  /** True on the very first completion ever — earns First Light. */
  firstEver: boolean;
  /** True when the date was already completed (or is in the past) — no change. */
  noop: boolean;
};

/** Streak lengths that earn a badge. */
export const MILESTONES = [7, 30, 90, 365] as const;
export type Milestone = (typeof MILESTONES)[number];

export const MILESTONE_BADGE: Record<Milestone, string> = {
  7: "swell_7",
  30: "swell_30",
  90: "swell_90",
  365: "swell_365",
};

/** The sand_reason enum value that matches each milestone. */
export const MILESTONE_REASON: Record<Milestone, string> = {
  7: "swell_7",
  30: "swell_30",
  90: "swell_90",
  365: "swell_365",
};

export function milestoneSand(milestone: Milestone, settings: GameSettings): number {
  switch (milestone) {
    case 7:
      return settings.sandSwell7;
    case 30:
      return settings.sandSwell30;
    case 90:
      return settings.sandSwell90;
    case 365:
      return settings.sandSwell365;
  }
}

/* ---- Date helpers -------------------------------------------------------- */
/* All arithmetic goes through Date.UTC on the Y-M-D parts. The dates already
   carry the rooftop's timezone (they come from rooftop_today), so treating them
   as UTC midnights keeps DST from ever shifting a day boundary. */

function toUtcMs(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Is `a` in an earlier calendar month than `b`? */
export function isEarlierMonth(a: IsoDate, b: IsoDate): boolean {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return ay < by || (ay === by && am < bm);
}

/* ---- The rules ----------------------------------------------------------- */

/**
 * Apply one completed day to a Swell.
 *
 * Order matters: the monthly grace grant happens BEFORE any grace is consumed,
 * so a user who returns after a gap can spend the grace they just accrued.
 *
 * Grace is all-or-nothing across a gap: bridging N missed days costs N. If the
 * user can't cover the whole gap we spend nothing and restart the Swell —
 * partially spending grace would burn the balance and still lose the streak.
 */
export function applyDailyCompletion(
  state: SwellState,
  today: IsoDate,
  settings: GameSettings
): { next: SwellState; outcome: StreakOutcome } {
  const outcome: StreakOutcome = {
    paddleOutGranted: 0,
    paddleOutSpent: 0,
    graceUsed: false,
    streakReset: false,
    gapDays: 0,
    milestone: null,
    firstEver: false,
    noop: false,
  };

  // Already completed today (or a clock anomaly put us behind) — change nothing.
  if (state.lastCompletedOn !== null && daysBetween(state.lastCompletedOn, today) <= 0) {
    outcome.noop = true;
    return { next: { ...state }, outcome };
  }

  const next: SwellState = { ...state };

  // ---- 1. Monthly Paddle Back Out accrual (before consuming) --------------
  if (
    next.paddleOutLastGranted === null ||
    isEarlierMonth(next.paddleOutLastGranted, today)
  ) {
    const before = next.paddleOutAvailable;
    next.paddleOutAvailable = Math.min(
      next.paddleOutAvailable + settings.paddleOutPerMonth,
      settings.paddleOutCap
    );
    outcome.paddleOutGranted = next.paddleOutAvailable - before;
    next.paddleOutLastGranted = today;
  }

  // ---- 2. Extend, bridge, or restart the Swell ---------------------------
  if (next.lastCompletedOn === null) {
    next.currentLen = 1; // first ever completion
    outcome.firstEver = true;
  } else {
    const gap = daysBetween(next.lastCompletedOn, today) - 1; // days missed
    outcome.gapDays = Math.max(0, gap);

    if (gap === 0) {
      next.currentLen += 1; // completed yesterday — unbroken
    } else if (next.paddleOutAvailable >= gap) {
      next.paddleOutAvailable -= gap;
      outcome.paddleOutSpent = gap;
      outcome.graceUsed = true;
      next.currentLen += 1; // grace bridged the gap
    } else {
      next.currentLen = 1; // gentle reset, no grace spent
      outcome.streakReset = true;
    }
  }

  next.longestLen = Math.max(next.longestLen, next.currentLen);
  next.lastCompletedOn = today;

  // ---- 3. Milestone? ------------------------------------------------------
  const hit = MILESTONES.find((m) => m === next.currentLen);
  outcome.milestone = hit ?? null;

  return { next, outcome };
}
