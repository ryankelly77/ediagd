/* ============================================================================
   EDIAGD — how much Island Time a year holds

   PURE. No client, no server-only, no imports beyond the streak engine's own
   predicates — because three surfaces need this answer and they must not each
   compute their own. The panel quotes the cost BEFORE the advisor books, the
   server action refuses on it, and the manager's advisor view reports it. A
   preview that says "4 days" over an action that charges 6 is worse than no
   preview at all.

   ---------------------------------------------------------------------------
   WHY WORK DAYS AND NOT CALENDAR DAYS
   ---------------------------------------------------------------------------
   Island Time buys one thing: days the Swell does not count against you. A
   Mon–Fri advisor's Saturday was never counted in the first place — 0025 made
   weekends invisible to the streak — so a fortnight in Fiji costs them ten
   days, not fourteen. Charging for the weekends would mean the advisor who
   works six days a week gets less real time off than the one who works five,
   out of the same budget, which is backwards.

   ---------------------------------------------------------------------------
   A DAY IS CHARGED ONCE
   ---------------------------------------------------------------------------
   Ranges may overlap — 0025 says so explicitly, because the engine only asks
   "is this date inside ANY range". So usage is a SET of dates, not a sum of
   lengths. Two overlapping weeks are not two weeks of budget, and a range that
   merely re-covers days already booked costs nothing.

   ---------------------------------------------------------------------------
   PER CALENDAR YEAR, AND A RANGE CAN SPAN TWO
   ---------------------------------------------------------------------------
   A trip from 28 December to 4 January is charged to both years, each against
   its own budget. Rolling the whole thing into the year it starts in would let
   somebody spend next year's allowance in December and then spend it again.
   ============================================================================ */

import {
  addDays,
  daysBetween,
  isWorkDay,
  type IslandTime,
  type IsoDate,
  type WorkSchedule,
} from "@/lib/gamification/streak";

/** Guard against a range so long the expansion becomes the cost. */
const MAX_EXPAND_DAYS = 800;

export const yearOf = (date: IsoDate): number => Number(date.slice(0, 4));

/**
 * Every date in a range that would spend budget: the advisor's own work days.
 *
 * Returns dates rather than a count so callers can union them — see the
 * charged-once rule above.
 */
export function chargeableDays(
  start: IsoDate,
  end: IsoDate,
  schedule: WorkSchedule | null
): IsoDate[] {
  if (end < start) return [];
  const span = Math.min(daysBetween(start, end), MAX_EXPAND_DAYS);
  const out: IsoDate[] = [];
  for (let i = 0; i <= span; i++) {
    const d = addDays(start, i);
    if (isWorkDay(d, schedule)) out.push(d);
  }
  return out;
}

/** Every chargeable date across every booked range, counted once. */
export function bookedDays(
  ranges: IslandTime[],
  schedule: WorkSchedule | null
): Set<IsoDate> {
  const all = new Set<IsoDate>();
  for (const r of ranges) {
    for (const d of chargeableDays(r.start, r.end, schedule)) all.add(d);
  }
  return all;
}

export type YearUsage = {
  year: number;
  cap: number;
  used: number;
  remaining: number;
};

/** What this advisor has spent in one calendar year, and what is left. */
export function usageForYear(
  ranges: IslandTime[],
  schedule: WorkSchedule | null,
  year: number,
  cap: number
): YearUsage {
  let used = 0;
  for (const d of bookedDays(ranges, schedule)) {
    if (yearOf(d) === year) used++;
  }
  /*
   * REMAINING NEVER GOES BELOW ZERO, but `used` is reported as it truly is.
   * Ranges booked before this rule existed are grandfathered and can put
   * somebody over the cap on day one; "17 of 15 used" is the honest thing to
   * show a manager, and "−2 left" is not a sentence anybody says.
   */
  return { year, cap, used, remaining: Math.max(0, cap - used) };
}

export type RangeQuote = {
  /** One entry per calendar year the range touches, in order. */
  years: (YearUsage & { cost: number; remainingAfter: number })[];
  /** Total chargeable days the range would ADD, across every year. */
  cost: number;
  /** False when any year would go over. */
  affordable: boolean;
};

/**
 * What booking this range would cost, given what is already on the books.
 *
 * The cost EXCLUDES days already covered by an existing range, so re-booking
 * over a week the advisor already has charges nothing — the engine would have
 * ignored those days either way.
 */
export function quoteRange(
  start: IsoDate,
  end: IsoDate,
  existing: IslandTime[],
  schedule: WorkSchedule | null,
  cap: number
): RangeQuote {
  const already = bookedDays(existing, schedule);
  const fresh = chargeableDays(start, end, schedule).filter((d) => !already.has(d));

  const years = [...new Set(fresh.map(yearOf))].sort();
  const rows = years.map((year) => {
    const cost = fresh.filter((d) => yearOf(d) === year).length;
    const u = usageForYear(existing, schedule, year, cap);
    return { ...u, cost, remainingAfter: Math.max(0, u.cap - u.used - cost) };
  });

  return {
    years: rows,
    cost: fresh.length,
    affordable: rows.every((r) => r.used + r.cost <= r.cap),
  };
}

/* ---- The words -----------------------------------------------------------
   Generated here so the preview under the date pickers and the refusal from
   the server action are the same sentence about the same arithmetic. A booking
   that is quoted in one voice and refused in another reads as a bug even when
   both numbers are right.
-------------------------------------------------------------------------- */

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * "This uses 4 of your 15 Island Time days this year — 6 left after."
 *
 * The numerals are bare. "4 days of your 15 Island Time days" says days three
 * times in eleven words, and the sentence has to be read at a glance under two
 * date pickers.
 */
export function quoteSentence(quote: RangeQuote, thisYear: number): string {
  if (quote.cost === 0) {
    return "These days are already booked as Island Time — this adds nothing.";
  }

  return quote.years
    .map((y) => {
      const when = y.year === thisYear ? "this year" : `in ${y.year}`;
      return (
        `This uses ${y.cost} of your ${y.cap} Island Time days ${when} — ` +
        `${y.remainingAfter} left after.`
      );
    })
    .join(" ");
}

/**
 * Why it was refused, with the number that matters.
 *
 * NEVER TRUNCATES. Booking eight days and silently getting six back is the app
 * deciding which half of somebody's holiday counts, and they would find out in
 * January when the Swell broke on a day they thought was covered.
 */
export function refusalSentence(quote: RangeQuote, thisYear: number): string {
  const over = quote.years.find((y) => y.used + y.cost > y.cap);
  if (!over) return "";
  const when = over.year === thisYear ? "this year" : `in ${over.year}`;
  return (
    `That needs ${days(over.cost)} and you have ${over.remaining} left ${when} — ` +
    `you've used ${over.used} of your ${over.cap} Island Time days. ` +
    `Shorten it, or ask your manager.`
  );
}
