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
  /**
   * SCHEDULED WORK DAYS missed between the last completion and today —
   * not calendar days. Non-work days and Island Time are invisible here.
   */
  gapDays: number;
  /** Milestone reached by this completion, if any. */
  milestone: number | null;
  /** True on the very first completion ever — earns First Light. */
  firstEver: boolean;
  /** True when the date was already completed (or is in the past) — no change. */
  noop: boolean;
  /**
   * Was today a day they were scheduled to work?
   *   true  — a normal work day
   *   false — a day off, or inside Island Time: extra effort. Counts fully,
   *           and is what the Free Surf badge tallies.
   *   null  — no schedule on file, so we genuinely don't know. Distinct from
   *           false: never claim someone wasn't scheduled when we can't tell.
   */
  onScheduledDay: boolean | null;
};

/* ---- Work schedules ------------------------------------------------------ */

export type SaturdayMode = "none" | "every" | "alternating";

/**
 * Which days a person works. Saturday is a mode rather than a boolean because
 * alternating Saturdays are a real dealership pattern and need three states.
 * `saturdayAnchor` is a Saturday they DO work; parity runs in whole weeks
 * from there. See 0025 for why this shape.
 */
export type WorkSchedule = {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sun: boolean;
  saturdayMode: SaturdayMode;
  saturdayAnchor: IsoDate | null;
};

/** A planned absence. Inclusive of both ends. */
export type IslandTime = { start: IsoDate; end: IsoDate };

/**
 * Everything the streak needs to know about a person's calendar. Both fields
 * are optional so existing callers keep working: no schedule means every day
 * is scheduled, which is exactly the pre-0025 behaviour.
 */
export type ScheduleContext = {
  schedule?: WorkSchedule | null;
  islandTime?: IslandTime[];
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

/** ISO weekday: Monday = 1 … Sunday = 7. Matches Postgres `isodow`. */
export function isoWeekday(date: IsoDate): number {
  const day = new Date(toUtcMs(date)).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/* ---- Schedule predicates ------------------------------------------------- */

/**
 * Does this person work on this date?
 *
 * No schedule means "not onboarded yet", and the honest answer there is to
 * treat every day as a work day — identical to the behaviour before schedules
 * existed, so nobody's streak changes shape the day this ships.
 */
export function isWorkDay(date: IsoDate, schedule?: WorkSchedule | null): boolean {
  if (!schedule) return true;

  switch (isoWeekday(date)) {
    case 1:
      return schedule.mon;
    case 2:
      return schedule.tue;
    case 3:
      return schedule.wed;
    case 4:
      return schedule.thu;
    case 5:
      return schedule.fri;
    case 6:
      return worksThisSaturday(date, schedule);
    default:
      return schedule.sun;
  }
}

function worksThisSaturday(date: IsoDate, schedule: WorkSchedule): boolean {
  if (schedule.saturdayMode === "every") return true;
  if (schedule.saturdayMode === "none") return false;

  // Alternating. Without an anchor there's no parity to measure, and guessing
  // "yes" would invent missed days out of nothing — so the safe answer is no.
  // 0025's CHECK constraint stops this reaching the database.
  if (!schedule.saturdayAnchor) return false;

  // Anchor and date are both Saturdays, so the difference is a whole number of
  // weeks: 0 mod 14 means an even number of weeks apart — a working Saturday.
  const diff = daysBetween(schedule.saturdayAnchor, date);
  return (((diff % 14) + 14) % 14) === 0;
}

/** Is this date inside any planned absence? ISO strings compare correctly. */
export function isIslandTime(date: IsoDate, ranges?: IslandTime[]): boolean {
  if (!ranges || ranges.length === 0) return false;
  return ranges.some((r) => r.start <= date && date <= r.end);
}

/**
 * Was this a day they owed us? A day off or a day inside Island Time is not.
 * Returns null when there's no schedule on file — see StreakOutcome.
 */
export function scheduledOn(
  date: IsoDate,
  context: ScheduleContext = {}
): boolean | null {
  if (!context.schedule) return null;
  return (
    isWorkDay(date, context.schedule) && !isIslandTime(date, context.islandTime)
  );
}

/** Guard against absurd input (a decade-old lastCompletedOn) spinning the loop. */
const MAX_GAP_SCAN_DAYS = 3660;

/**
 * The number of SCHEDULED WORK DAYS strictly between two dates, ignoring any
 * day inside Island Time.
 *
 * This is the whole fix. Weekends, days off and planned absence are invisible
 * to the streak — they produce no gap, so they cost no grace and break nothing.
 * Grace days now cover only genuinely missed WORK days, which is what they were
 * always for.
 */
export function countMissedWorkDays(
  from: IsoDate,
  to: IsoDate,
  context: ScheduleContext = {}
): number {
  const span = daysBetween(from, to);
  if (span <= 1) return 0;

  const limit = Math.min(span - 1, MAX_GAP_SCAN_DAYS);
  let missed = 0;
  for (let i = 1; i <= limit; i++) {
    const day = addDays(from, i);
    if (!isWorkDay(day, context.schedule)) continue;
    if (isIslandTime(day, context.islandTime)) continue;
    missed++;
  }
  return missed;
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
 *
 * The gap is measured in SCHEDULED WORK DAYS (see countMissedWorkDays), so a
 * Mon–Fri advisor's weekend is not a gap and costs nothing.
 *
 * Completing on a day they were NOT scheduled counts in full: it increments the
 * Swell and pays the daily loop exactly like any other day. Someone who opens
 * the app on their day off is doing more than we asked, and the brand rule is
 * celebrate up, never punish down — so extra effort is never worth less than
 * ordinary effort. It's recorded (outcome.onScheduledDay) so it can be
 * celebrated separately rather than penalised.
 */
export function applyDailyCompletion(
  state: SwellState,
  today: IsoDate,
  settings: GameSettings,
  context: ScheduleContext = {}
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
    onScheduledDay: scheduledOn(today, context),
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
    // Scheduled work days missed — weekends, days off and Island Time are
    // simply not counted, so they can never break a Swell or cost a grace day.
    const gap = countMissedWorkDays(next.lastCompletedOn, today, context);
    outcome.gapDays = gap;

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
