/* ============================================================================
   EDIAGD — work schedules and Island Time
   Shared by completeDay (service role), the onboarding screen, /profile, and
   the manager views. Row shape in, engine shape out — the pure streak module
   never learns what a database row looks like.
   ============================================================================ */

import {
  isIslandTime,
  isWorkDay,
  isoWeekday,
  type IsoDate,
  type IslandTime,
  type SaturdayMode,
  type ScheduleContext,
  type WorkSchedule,
} from "@/lib/gamification/streak";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** The six plain days, in the order a week reads. Saturday is a mode. */
export const WEEKDAYS = [
  { key: "mon", column: "works_mon", label: "Mon", full: "Monday" },
  { key: "tue", column: "works_tue", label: "Tue", full: "Tuesday" },
  { key: "wed", column: "works_wed", label: "Wed", full: "Wednesday" },
  { key: "thu", column: "works_thu", label: "Thu", full: "Thursday" },
  { key: "fri", column: "works_fri", label: "Fri", full: "Friday" },
  { key: "sun", column: "works_sun", label: "Sun", full: "Sunday" },
] as const;

export type WeekdayKey = (typeof WEEKDAYS)[number]["key"];

export const SATURDAY_CHOICES: { value: SaturdayMode; label: string }[] = [
  { value: "none", label: "I don't work Saturdays" },
  { value: "every", label: "Every Saturday" },
  { value: "alternating", label: "Every other Saturday" },
];

/** What the form sends and the action validates. No user id — see the action. */
export type ScheduleDraft = {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sun: boolean;
  saturdayMode: SaturdayMode;
  /** Required when saturdayMode is 'alternating': a Saturday they DO work. */
  saturdayAnchor: IsoDate | null;
};

export const EMPTY_DRAFT: ScheduleDraft = {
  mon: false,
  tue: false,
  wed: false,
  thu: false,
  fri: false,
  sun: false,
  saturdayMode: "none",
  saturdayAnchor: null,
};

/** The most common dealership week, offered as a one-tap starting point. */
export const MON_FRI_DRAFT: ScheduleDraft = {
  ...EMPTY_DRAFT,
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
};

/* ---- Row <-> engine ------------------------------------------------------ */

export type ScheduleRow = {
  works_mon: boolean | null;
  works_tue: boolean | null;
  works_wed: boolean | null;
  works_thu: boolean | null;
  works_fri: boolean | null;
  works_sun: boolean | null;
  saturday_mode: string | null;
  saturday_anchor: string | null;
  schedule_set_at?: string | null;
};

export const SCHEDULE_COLUMNS =
  "works_mon, works_tue, works_wed, works_thu, works_fri, works_sun, saturday_mode, saturday_anchor, schedule_set_at";

export function rowToSchedule(row: ScheduleRow | null | undefined): WorkSchedule | null {
  if (!row) return null;
  return {
    mon: Boolean(row.works_mon),
    tue: Boolean(row.works_tue),
    wed: Boolean(row.works_wed),
    thu: Boolean(row.works_thu),
    fri: Boolean(row.works_fri),
    sun: Boolean(row.works_sun),
    saturdayMode: (row.saturday_mode as SaturdayMode) ?? "none",
    saturdayAnchor: (row.saturday_anchor as IsoDate | null) ?? null,
  };
}

export function scheduleToDraft(schedule: WorkSchedule | null): ScheduleDraft {
  if (!schedule) return { ...EMPTY_DRAFT };
  return {
    mon: schedule.mon,
    tue: schedule.tue,
    wed: schedule.wed,
    thu: schedule.thu,
    fri: schedule.fri,
    sun: schedule.sun,
    saturdayMode: schedule.saturdayMode,
    saturdayAnchor: schedule.saturdayAnchor,
  };
}

export function draftToRow(draft: ScheduleDraft) {
  return {
    works_mon: draft.mon,
    works_tue: draft.tue,
    works_wed: draft.wed,
    works_thu: draft.thu,
    works_fri: draft.fri,
    works_sun: draft.sun,
    saturday_mode: draft.saturdayMode,
    // Only an alternating schedule has any use for an anchor; storing one on a
    // 'never'/'every' schedule would be a fact nobody reads and nobody updates.
    saturday_anchor: draft.saturdayMode === "alternating" ? draft.saturdayAnchor : null,
  };
}

/* ---- Validation (shared by the action; the DB re-checks anyway) ---------- */

/**
 * Returns an error message, or null when the draft is sound.
 *
 * The database enforces the same two rules with CHECK constraints, so this is
 * about giving a person a sentence they can act on rather than a constraint
 * violation. It is NOT the security boundary.
 */
export function validateDraft(draft: ScheduleDraft): string | null {
  const anyDay =
    draft.mon ||
    draft.tue ||
    draft.wed ||
    draft.thu ||
    draft.fri ||
    draft.sun ||
    draft.saturdayMode !== "none";

  if (!anyDay) {
    return "Pick at least one day you're on the drive.";
  }

  if (draft.saturdayMode === "alternating") {
    if (!draft.saturdayAnchor) {
      return "Tell us the next Saturday you work, so we know which weeks are yours.";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.saturdayAnchor)) {
      return "That date doesn't look right.";
    }
    if (isoWeekday(draft.saturdayAnchor) !== 6) {
      return "That date isn't a Saturday.";
    }
  }

  return null;
}

/* ---- Rest days ----------------------------------------------------------- */

export type RestDay = { kind: "day_off" | "island_time" };

/**
 * Is today a day nobody asked them to work, and which kind?
 *
 * ---------------------------------------------------------------------------
 * THE SCREEN AND THE MATHS READ THE SAME CONTEXT
 * ---------------------------------------------------------------------------
 * /today shows a rest card on exactly the days countMissedWorkDays refuses to
 * count. Deriving that twice, in two files, is how a screen ends up promising
 * "your streak is safe" on a day the engine will hold against them — so this is
 * the one derivation and both sides use it.
 *
 * NULL SCHEDULE MEANS SCHEDULED, matching the engine: with no row on file
 * countMissedWorkDays treats every day as a work day, so a rest card here would
 * be a promise nothing behind it keeps.
 *
 * DAY OFF OUTRANKS ISLAND TIME. A Saturday inside a booked week is both, and
 * "scheduled day off" is the truer thing to say about it — Island Time copy is
 * for a day they would otherwise have been on the drive.
 */
export function restDayFor(
  date: IsoDate,
  context: ScheduleContext
): RestDay | null {
  if (!context.schedule) return null;
  if (!isWorkDay(date, context.schedule)) return { kind: "day_off" };
  if (isIslandTime(date, context.islandTime)) return { kind: "island_time" };
  return null;
}

/* ---- Loading ------------------------------------------------------------- */

/**
 * Everything the streak engine needs about one person's calendar.
 *
 * Both reads are scoped to the user. Under the user's own client RLS does that
 * too (0025); under the service role this eq() is the only thing that does, so
 * it is not optional.
 */
export async function loadScheduleContext(
  client: Client,
  userId: string
): Promise<ScheduleContext> {
  const [{ data: scheduleRow }, { data: islandRows }] = await Promise.all([
    client
      .from("work_schedule")
      .select(SCHEDULE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("island_time")
      .select("start_date, end_date")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(500),
  ]);

  const islandTime: IslandTime[] = ((islandRows ?? []) as {
    start_date: string;
    end_date: string;
  }[]).map((r) => ({ start: r.start_date, end: r.end_date }));

  return { schedule: rowToSchedule(scheduleRow as ScheduleRow | null), islandTime };
}

/** Has this person told us their schedule? Absence of a row is the signal. */
export function isOnboarded(row: ScheduleRow | null | undefined): boolean {
  return Boolean(row);
}

/* ---- Island Time --------------------------------------------------------- */

export type IslandTimeEntry = {
  id: string;
  start: IsoDate;
  end: IsoDate;
  note: string | null;
};

/** Upcoming or still running today. */
export function isCurrentOrFuture(entry: IslandTimeEntry, today: IsoDate): boolean {
  return entry.end >= today;
}

/* ---- Display ------------------------------------------------------------- */

/** "Mon–Fri" / "Mon, Wed, Fri + every other Saturday" — a human sentence. */
export function describeSchedule(schedule: WorkSchedule | null): string {
  if (!schedule) return "Not set yet";

  const days = WEEKDAYS.filter((d) => schedule[d.key]).map((d) => d.label);
  // Mon–Fri is common enough to be worth naming rather than listing.
  const isMonFri =
    schedule.mon && schedule.tue && schedule.wed && schedule.thu && schedule.fri && !schedule.sun;

  const base = isMonFri ? "Mon–Fri" : days.length > 0 ? days.join(", ") : "";

  const sat =
    schedule.saturdayMode === "every"
      ? "every Saturday"
      : schedule.saturdayMode === "alternating"
        ? "every other Saturday"
        : null;

  if (base && sat) return `${base} + ${sat}`;
  if (base) return base;
  if (sat) return sat.charAt(0).toUpperCase() + sat.slice(1);
  return "No days set";
}

/** The next N Saturdays from `from`, for the anchor picker. */
export function upcomingSaturdays(from: IsoDate, count = 6): IsoDate[] {
  const out: IsoDate[] = [];
  const [y, m, d] = from.split("-").map(Number);
  let cursor = Date.UTC(y, m - 1, d);
  // Walk to the next Saturday (today counts if today is one).
  while (new Date(cursor).getUTCDay() !== 6) cursor += 86_400_000;
  for (let i = 0; i < count; i++) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 7 * 86_400_000;
  }
  return out;
}

/** 'Sat 8 Aug' — short, unambiguous, no year unless it differs. */
export function formatDayLabel(date: IsoDate, today: IsoDate): string {
  const d = new Date(date + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return date;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export { isWorkDay };
export type { IslandTime, SaturdayMode, ScheduleContext, WorkSchedule };
