/* ============================================================================
   EDIAGD — schedules that are legal and probably wrong

   PURE. The advisor's own confirm screen runs these on a draft before it is
   saved, and the admin's onboarding list runs them on what was saved. One set
   of rules, so a schedule that reads "unusual — worth a look" to a GM is the
   same one its owner was asked about at the source.

   ---------------------------------------------------------------------------
   WHY THIS EXISTS: A SCHEDULE THAT PASSED EVERY CHECK AND MEANT NOTHING
   ---------------------------------------------------------------------------
   Mitch's row: every weekday false, saturday_mode 'alternating'. validateDraft
   is satisfied — one day is picked and an alternating anchor is present — so it
   saved without a murmur. As far as the engine is concerned he works every
   other Saturday and nothing else, which means /today renders a rest card six
   days a week and his Swell counts almost nothing. Nobody would have found that
   until he asked why his streak never moved.

   ---------------------------------------------------------------------------
   A FLAG IS NEVER A BLOCK
   ---------------------------------------------------------------------------
   A two-day part-timer is a real person at a real dealership, and a rule that
   refuses their week would be the app telling them their job is wrong. So these
   never stop a save and never stop an advisor being counted — they raise a
   question, in one quiet amber line, to somebody in a position to answer it.
   ============================================================================ */

import type { WorkSchedule } from "@/lib/gamification/streak";

/** Below this many days a week, ask. Not refuse — ask. */
export const FEW_DAYS_THRESHOLD = 3;

/**
 * How long after a first login an unconfirmed schedule stops being "they
 * haven't got to it yet".
 *
 * A week: long enough to cover somebody invited on a Friday who works Mon–Fri,
 * short enough that an account stuck at the onboarding gate for a fortnight is
 * surfaced while rollout is still happening rather than after it.
 */
export const CONFIRM_GRACE_DAYS = 7;

export type ScheduleFlagCode = "few-days" | "weekend-only" | "confirm-overdue";

export type ScheduleFlag = {
  code: ScheduleFlagCode;
  /** One line, addressed to whoever is reading. */
  note: string;
};

/**
 * Days a week this schedule could put somebody on the drive.
 *
 * ALTERNATING SATURDAYS COUNT AS ONE. They do work Saturdays — just not every
 * one — and halving it would push a Mon–Fri advisor who also does every other
 * Saturday from six days to five and a half for no reader's benefit. The number
 * is only ever compared against a threshold of three.
 */
export function workDaysPerWeek(schedule: WorkSchedule | null): number {
  if (!schedule) return 0;
  const weekdays = [
    schedule.mon,
    schedule.tue,
    schedule.wed,
    schedule.thu,
    schedule.fri,
  ].filter(Boolean).length;
  const saturday = schedule.saturdayMode === "none" ? 0 : 1;
  return weekdays + saturday + (schedule.sun ? 1 : 0);
}

/** True when nothing Monday to Friday is selected but a weekend day is. */
export function isWeekendOnly(schedule: WorkSchedule | null): boolean {
  if (!schedule) return false;
  const anyWeekday =
    schedule.mon || schedule.tue || schedule.wed || schedule.thu || schedule.fri;
  const anyWeekend = schedule.saturdayMode !== "none" || schedule.sun;
  return !anyWeekday && anyWeekend;
}

/**
 * What looks unusual about this schedule, if anything.
 *
 * `daysSinceFirstLogin` is null when they have never logged in — an account
 * that has not been opened is not an overdue confirmation, it is an account
 * nobody has opened, and the list says that in its own column.
 */
export function scheduleFlags(
  schedule: WorkSchedule | null,
  context: {
    /** False when schedule_set_at is null: a row exists but nobody confirmed it. */
    confirmed?: boolean;
    daysSinceFirstLogin?: number | null;
  } = {}
): ScheduleFlag[] {
  const flags: ScheduleFlag[] = [];
  const confirmed = context.confirmed ?? true;

  if (isWeekendOnly(schedule)) {
    flags.push({
      code: "weekend-only",
      note: "weekends only — no weekday is selected",
    });
  } else if (schedule && workDaysPerWeek(schedule) < FEW_DAYS_THRESHOLD) {
    /*
     * `else if`, because a weekend-only week is nearly always also a short one
     * and two amber lines saying the same thing about the same row reads as
     * noise. The more specific finding wins.
     */
    flags.push({
      code: "few-days",
      note: `${workDaysPerWeek(schedule)} ${
        workDaysPerWeek(schedule) === 1 ? "day" : "days"
      } a week — fewer than most`,
    });
  }

  const since = context.daysSinceFirstLogin;
  if (!confirmed && since != null && since > CONFIRM_GRACE_DAYS) {
    flags.push({
      code: "confirm-overdue",
      note: `signed in ${since} days ago and hasn't confirmed a schedule`,
    });
  }

  return flags;
}

/** "unusual schedule — worth a look", with the reasons. Empty when clean. */
export function flagLine(flags: ScheduleFlag[]): string {
  if (flags.length === 0) return "";
  return `Unusual schedule — worth a look: ${flags.map((f) => f.note).join("; ")}.`;
}

/**
 * The same question, asked of the person who can actually answer it.
 *
 * Second person and a question mark, because on the confirm screen this is
 * addressed to the advisor about their own week — not a finding about somebody
 * else. It appears beside a save button that still works.
 */
export function draftWarning(schedule: WorkSchedule | null): string {
  const flags = scheduleFlags(schedule, { confirmed: true });
  if (flags.length === 0) return "";

  if (flags[0].code === "weekend-only") {
    return "This looks unusual — you haven't picked a single weekday. Are you sure that's your week?";
  }
  return `This looks unusual — ${workDaysPerWeek(schedule)} ${
    workDaysPerWeek(schedule) === 1 ? "day" : "days"
  } a week. Are you sure that's your week?`;
}
