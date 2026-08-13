/* ============================================================================
   EDIAGD — saying which store and which month a number belongs to
   Client-safe: pure formatting, no Supabase import.

   "Your numbers · LABOR SALES THIS PERIOD · $36,583" was unambiguous when there
   was one rooftop and one month in the database. There are now eleven stores
   and three months, in two different source formats, and "this period" names
   none of them.

   THE PARTIAL MONTH IS THE DANGEROUS ONE. August holds 1–10 only. Rendered as
   "August 2026" beside July's full month it reads as a 78% collapse in
   performance that did not happen. Every surface that shows a figure has to
   carry the qualifier with it, so this returns the qualifier as part of the
   label rather than leaving each screen to remember.
   ============================================================================ */

export type PeriodInfo = {
  label: string | null;
  startsOn: string;
  endsOn: string;
  isPartial: boolean;
  daysCovered: number | null;
  lastDayCovered: string | null;
};

export type PeriodLabel = {
  /** "Doggett Chrysler Dodge Jeep Ram · July 2026" */
  headline: string;
  /** "July 2026" or "August 2026 (partial)" */
  period: string;
  /** "1–31 Jul 2026", or "1–10 Aug 2026" when partial. */
  range: string;
  /** "Aug 1–10, partial — 8 of 31 days" — null on a full month. */
  partialNote: string | null;
  isPartial: boolean;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Parses an ISO date without letting the local timezone shift the day. */
function parts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function monthName(iso: string): string {
  const p = parts(iso);
  if (!p) return "";
  return `${MONTHS[p.m]} ${p.y}`;
}

export function formatPeriod(
  rooftopName: string | null,
  period: PeriodInfo | null
): PeriodLabel {
  if (!period) {
    return {
      headline: rooftopName ?? "",
      period: "",
      range: "",
      partialNote: null,
      isPartial: false,
    };
  }

  const start = parts(period.startsOn);
  const end = parts(period.endsOn);
  const last = period.lastDayCovered ? parts(period.lastDayCovered) : null;

  const monthLabel = period.label?.trim() || monthName(period.startsOn);

  // On a partial month the range must stop where the DATA stops, not where the
  // calendar does — the whole point is to show that the month isn't finished.
  const shownEnd = period.isPartial && last ? last : end;
  const range =
    start && shownEnd
      ? start.m === shownEnd.m && start.y === shownEnd.y
        ? `${start.d}–${shownEnd.d} ${MONTHS[start.m]} ${start.y}`
        : `${start.d} ${MONTHS[start.m]} – ${shownEnd.d} ${MONTHS[shownEnd.m]} ${shownEnd.y}`
      : "";

  const daysInMonth = end && start ? end.d : null;
  const partialNote =
    period.isPartial && last && start
      ? `${MONTHS[start.m]} ${start.d}–${last.d}, partial` +
        (period.daysCovered && daysInMonth
          ? ` — ${period.daysCovered} of ${daysInMonth} days`
          : "")
      : null;

  const periodText = period.isPartial ? `${monthLabel} (partial)` : monthLabel;

  return {
    headline: rooftopName ? `${rooftopName} · ${periodText}` : periodText,
    period: periodText,
    range,
    partialNote,
    isPartial: period.isPartial,
  };
}

/** Shape returned by a `perf_period` select — kept in one place. */
export const PERIOD_COLUMNS =
  "id, label, starts_on, ends_on, is_partial, days_covered, last_day_covered";

export function toPeriodInfo(row: Record<string, unknown> | null): PeriodInfo | null {
  if (!row) return null;
  return {
    label: (row.label as string | null) ?? null,
    startsOn: String(row.starts_on ?? ""),
    endsOn: String(row.ends_on ?? ""),
    isPartial: Boolean(row.is_partial),
    daysCovered: row.days_covered == null ? null : Number(row.days_covered),
    lastDayCovered: (row.last_day_covered as string | null) ?? null,
  };
}
