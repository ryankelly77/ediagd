/* ============================================================================
   EDIAGD — the two ways a mapping can change, and what each one means

   Pure. No database, no React — so scripts/epoch-scenarios.ts can prove the
   date arithmetic offline, which is the part nobody can eyeball.

   ---------------------------------------------------------------------------
   CORRECTION vs CHANGE
   ---------------------------------------------------------------------------
   Not every edit is a policy change, and treating them alike is how you either
   corrupt history or refuse to fix a typo.

     CORRECTION  this was always wrong. The six piggyback typos, OIL-009 filed
                 under Fluids, a sub-category mapped wrong on day one. Nobody
                 ever meant the old value, so the honest thing is to fix history:
                 effective_from = genesis, every period recomputes.

     CHANGE      the shelf is being rearranged. The old value was right and now
                 something different is right. History stays on the old mapping;
                 the new one starts from a date Mitch picks.

   There is deliberately no third option and no bare date field. A date without
   one of those two words on it is an edit nobody can interpret six months
   later — and the interpretation is the whole point of recording it.
   ============================================================================ */

/**
 * The sentinel every seeded mapping is effective from (0074).
 *
 * Comfortably before any data: the earliest perf_period in production starts
 * 2025-01-01. A fixed date rather than the computed earliest period, so it
 * means the same thing on every environment and does not quietly shift the
 * first time somebody imports an older file.
 */
export const GENESIS = "2000-01-01";

export type EditMode = "correction" | "change";

/**
 * Today in the dealership's timezone.
 *
 * NOT UTC. `effective_from` is compared against period start dates, which are
 * store-local; stamping from toISOString() puts every edit after ~7pm Central
 * on tomorrow. All 73 op_code_family rows carry 2026-09-01 for exactly that
 * reason — the seed ran at 20:31 Central and `default current_date` is UTC.
 *
 * Every rooftop is America/Chicago. When that stops being true this needs a
 * rooftop, and the group-wide mappings have none to take — which is a real
 * problem for another day, not a reason to be wrong today.
 */
export function storeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The date a mapping edit takes effect from.
 *
 * A correction reaches back to the beginning; a change starts when it is told
 * to, defaulting to today.
 */
export function effectiveFromFor(mode: EditMode, picked?: string | null): string {
  if (mode === "correction") return GENESIS;
  const d = (picked ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : storeToday();
}

/**
 * The first period a change lands on.
 *
 * A period is measured under the rules in force on its FIRST day, so a change
 * dated mid-month does not touch that month — it starts with the next one. This
 * is the arithmetic behind "Takes effect with the October period", and getting
 * it off by one month would be invisible until somebody reconciled a number.
 */
export function firstAffectedMonth(effectiveFrom: string): string {
  const [y, m, d] = effectiveFrom.split("-").map(Number);
  // Effective on the 1st: that month is already under the new rule.
  if (d === 1) return `${y}-${String(m).padStart(2, "0")}-01`;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** "October 2026", for a sentence somebody reads before they commit. */
export function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${
    [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ][m - 1]
  } ${y}`;
}

/**
 * The sentence shown above the confirm button.
 *
 * Written here rather than in the page so the words and the arithmetic cannot
 * drift — a preview that says October while the database starts in September is
 * worse than no preview.
 */
export function describeEdit(
  mode: EditMode,
  effectiveFrom: string,
  periodsAffected: number
): string {
  if (mode === "correction") {
    return periodsAffected === 1
      ? "Every period recomputes — 1 period is affected."
      : `Every period recomputes — ${periodsAffected} periods are affected.`;
  }
  const first = firstAffectedMonth(effectiveFrom);
  return `Takes effect with the ${monthLabel(first)} period. ${
    monthLabel(prevMonth(first))
  } and earlier keep the current mapping.`;
}

function prevMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}-01`;
}

/* ---------------------------------------------------------------------------
   Dates a person reads
--------------------------------------------------------------------------- */

/** "Sep 2" — the format somebody writing a note would use. */
export function plainDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * When a mapping started applying, said in words rather than in a sentinel.
 *
 * ---------------------------------------------------------------------------
 * GENESIS IS NOT A DATE AND MUST NEVER RENDER AS ONE
 * ---------------------------------------------------------------------------
 * `2000-01-01` is how "for all of history" is stored. It is not a day anything
 * happened, and printing it asks the reader to know that — which nobody outside
 * this repo does. Mitch reading "in force since 2000-01-01" reasonably concludes
 * the system has been running since before the dealership had this DMS.
 *
 * It leaked in four places at once, which is why the wording lives here and not
 * in each screen: the row footer, both confirm screens, and the families table.
 * One function means the next surface cannot get it wrong on its own.
 */
export function sinceLabel(effectiveFrom: string | null | undefined): string {
  if (!effectiveFrom) return "unknown";
  return effectiveFrom.slice(0, 10) === GENESIS
    ? "the beginning of measurement"
    : plainDate(effectiveFrom);
}

/** The same fact as a clause: "applies to all history" / "applies from Sep 2". */
export function appliesLabel(effectiveFrom: string | null | undefined): string {
  if (!effectiveFrom) return "";
  return effectiveFrom.slice(0, 10) === GENESIS
    ? "applies to all history"
    : `applies from ${plainDate(effectiveFrom)}`;
}
