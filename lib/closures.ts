/* ============================================================================
   EDIAGD — the closure calendar

   PURE. No client, no cookies. The date arithmetic and the readiness rule are
   here so they can be tested without a rooftop, and so the seeder, the manager
   screen and the readiness line cannot disagree about what a year contains.

   ---------------------------------------------------------------------------
   THE FEDERAL LIST IS A PROPOSAL, NOT A TRUTH
   ---------------------------------------------------------------------------
   Dealerships decide their own closures. Plenty open on Presidents' Day and
   shut on Christmas Eve, and which is which is a fact about one rooftop that
   only the person running it knows. So this list exists to save a manager
   eleven taps, and nothing in it does anything until they confirm it.

   ---------------------------------------------------------------------------
   ACTUAL DATES, NOT OBSERVED ONES
   ---------------------------------------------------------------------------
   The federal calendar shifts a Saturday holiday to the Friday before and a
   Sunday one to the Monday after, because that is when federal OFFICES take the
   day. A service drive is not a federal office: a store that opens Saturdays
   and shuts for the Fourth of July shuts on the Fourth.

   So the proposal is the real date, every time. Where it lands on a day the
   advisor does not work anyway the card outranks it as a plain day off and
   nothing is lost, and where a store really does observe the Friday, that is a
   store-specific closure the manager adds in one line — which they can do, and
   which is more honest than us guessing at a convention they may not follow.
   ============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";

export type ClosureStatus = "proposed" | "confirmed";

/** One row of rooftop_closed_day, as every screen here wants it. */
export type Closure = {
  id: string;
  rooftopId: string;
  date: IsoDate;
  label: string;
  status: ClosureStatus;
  origin: "federal" | "store";
  /** Told us the store opens that day. Unconfirmed and never re-proposed. */
  dismissed: boolean;
};

/** A date the seeder would like a ruling on. */
export type ClosureProposal = { date: IsoDate; label: string };

/* ---- Date helpers, UTC throughout ---------------------------------------- */

const iso = (y: number, m: number, d: number): IsoDate =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The nth given weekday of a month. weekday: 0 Sunday … 6 Saturday. */
function nthWeekday(year: number, month: number, weekday: number, n: number): IsoDate {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (weekday - first + 7) % 7;
  return iso(year, month, 1 + offset + (n - 1) * 7);
}

/** The last given weekday of a month — Memorial Day's shape. */
function lastWeekday(year: number, month: number, weekday: number): IsoDate {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return iso(year, month, lastDay - ((lastDow - weekday + 7) % 7));
}

/**
 * The eleven US federal holidays for a year, in calendar order.
 *
 * Labels are what an advisor would call the day, because they are what the rest
 * card prints after "Closed for". Not "Washington's Birthday", which is the
 * statutory name and nobody's spoken one.
 */
export function federalHolidays(year: number): ClosureProposal[] {
  return [
    { date: iso(year, 1, 1), label: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), label: "Martin Luther King Jr. Day" },
    { date: nthWeekday(year, 2, 1, 3), label: "Presidents' Day" },
    { date: lastWeekday(year, 5, 1), label: "Memorial Day" },
    { date: iso(year, 6, 19), label: "Juneteenth" },
    { date: iso(year, 7, 4), label: "Independence Day" },
    { date: nthWeekday(year, 9, 1, 1), label: "Labor Day" },
    { date: nthWeekday(year, 10, 1, 2), label: "Columbus Day" },
    { date: iso(year, 11, 11), label: "Veterans Day" },
    { date: nthWeekday(year, 11, 4, 4), label: "Thanksgiving" },
    { date: iso(year, 12, 25), label: "Christmas Day" },
  ];
}

/**
 * Which years the seeder should have on file when run on `today`.
 *
 * The current year and the next one, always. Running it in December must not
 * leave a store with an empty January, and running it in January must not
 * re-litigate the year already in progress — which is why the seeder skips any
 * date it already has a row for rather than comparing years.
 */
export function yearsToSeed(today: IsoDate): number[] {
  const year = Number(today.slice(0, 4));
  return [year, year + 1];
}

/**
 * The proposals missing for a rooftop: the federal list, minus every date that
 * already has a row of any kind.
 *
 * "OF ANY KIND" IS THE WHOLE RULE. A confirmed date is already answered, and a
 * dismissed one was answered too — the manager told us their store opens that
 * day. Re-proposing it every January would ask the same question forever, which
 * is exactly the reason a dismissal is a tombstone rather than a delete.
 */
export function missingProposals(
  years: number[],
  existing: Iterable<IsoDate>
): ClosureProposal[] {
  const have = new Set(existing);
  return years
    .flatMap((y) => federalHolidays(y))
    .filter((p) => !have.has(p.date));
}

/* ---- Readiness ----------------------------------------------------------- */

/**
 * Has this rooftop's calendar been dealt with through the end of the year?
 *
 * ANSWERED, NOT CONFIRMED. A manager who tells us the store trades every
 * federal holiday has a finished calendar with nothing confirmed in it, and a
 * readiness line that called that "no" would nag forever at somebody who has
 * already done the job. So a date counts as settled when it has been confirmed
 * OR dismissed, and the question is whether any remaining proposal sits between
 * today and year-end.
 *
 * A rooftop that has never been seeded has no proposals and no rulings, and
 * reads as NOT confirmed — which is the honest answer before a rollout, because
 * nobody has looked at it.
 */
export function calendarSettledThroughYearEnd(
  today: IsoDate,
  closures: Pick<Closure, "date" | "status" | "dismissed">[]
): boolean {
  const yearEnd: IsoDate = `${today.slice(0, 4)}-12-31`;
  const inWindow = closures.filter((c) => c.date >= today && c.date <= yearEnd);
  if (inWindow.length === 0) return false;
  return inWindow.every((c) => c.status === "confirmed" || c.dismissed);
}

/** How many still need a ruling, for the line that says so. */
export function openProposalCount(
  today: IsoDate,
  closures: Pick<Closure, "date" | "status" | "dismissed">[]
): number {
  const yearEnd: IsoDate = `${today.slice(0, 4)}-12-31`;
  return closures.filter(
    (c) => c.date >= today && c.date <= yearEnd && c.status === "proposed" && !c.dismissed
  ).length;
}
