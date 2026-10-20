/* ============================================================================
   EDIAGD — which day is it AT THE STORE

   PURE. No client, no clock of its own — the instant is passed in. Safe to
   import from a script, a route handler or a server component.

   ---------------------------------------------------------------------------
   WHY THIS IS ITS OWN FILE
   ---------------------------------------------------------------------------
   "What date is it" is answered in three places in this codebase and they must
   not drift:

     rooftop_today(_rooftop)   SQL, 0013. The definition `rooftop_closed_day.
                               closed_on` is written against — 0101 says so in
                               its own comment: "Compared against
                               rooftop_today(), never against the server's
                               clock."
     storeDateOf()             here. The app-side answer, for code that already
                               holds the rooftop's timezone and should not make
                               a round trip for a date.
     lib/rollcall.ts           USED TO HOLD A PRIVATE COPY of this function. It
                               now imports this one, because two definitions of
                               the same quantity is the thing that bites on the
                               day one of them changes.

   The SQL and the TypeScript are the same formula — `instant at time zone tz`,
   truncated to a date — but they are two systems, and this file's rule is that
   anything depending on them agreeing must ASSERT they agree rather than
   assume it. `npm run accept:rollcall-cron` does, against the real rooftop.
   ============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";

/**
 * The calendar date an instant fell on, at the store.
 *
 * en-CA gives ISO ordering, which is the same trick lib/mapping/epoch.ts uses.
 * An unknown zone falls back to UTC rather than throwing — a date one day out
 * is a smaller lie than a 500 on the screen that reports it.
 *
 * `rooftop.timezone` is NOT NULL with a default of America/Chicago (0013), so
 * the null branch is unreachable through a rooftop row. It is kept because the
 * signature allows null and a function that would throw on an input its type
 * admits is a trap for the next caller.
 */
export function storeDateOf(instant: Date | string, timezone: string | null): IsoDate {
  const d = instant instanceof Date ? instant : new Date(instant);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d) as IsoDate;
  } catch {
    return d.toISOString().slice(0, 10) as IsoDate;
  }
}

/**
 * Monday = 1 … Sunday = 7, from an ISO DATE STRING.
 *
 * ---------------------------------------------------------------------------
 * NO TIMEZONE IS INVOLVED, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * The weekday of "2026-10-19" is Monday everywhere. Asking a Date built from
 * an INSTANT what day it is drags a second zone into an answer that has
 * already been decided — which is how "Saturday at the store" becomes "Friday
 * in UTC" and a post goes out on a closed day.
 *
 * So the date string is parsed as UTC midnight, where getUTCDay is exact, and
 * the caller's only job is to have produced that string in the store's zone
 * (storeDateOf above). One conversion, at one boundary.
 *
 * isodow rather than getUTCDay's 0-for-Sunday, so it matches `extract(isodow
 * from …)` in SQL — is_scheduled_day and scheduled_days_since both key on it,
 * and a second convention for the same thing is a bug waiting for a Sunday.
 */
export function isoWeekday(localDate: IsoDate | string): number {
  const dow = new Date(`${String(localDate).slice(0, 10)}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** "Mon" … "Sun", indexed by isoWeekday. Index 0 is unused. */
const WEEKDAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "Sat" for an ISO date string. For putting a weekday in a log line. */
export function weekdayName(localDate: IsoDate | string): string {
  return WEEKDAY_SHORT[isoWeekday(localDate)] ?? "?";
}

/** Saturday or Sunday at the store. */
export function isWeekend(localDate: IsoDate | string): boolean {
  return isoWeekday(localDate) >= 6;
}
