/* ============================================================================
   EDIAGD — advisor daily-view logic
   Pure functions over the performance views (advisor_period_totals,
   advisor_family_attach, family_store_benchmark). No Supabase imports here so
   this stays unit-testable and usable from both server and client components.

   NOTE: `serviceStatus` already lives in lib/brand.ts with exactly the
   thresholds this screen needs (>= avg -> on-track, >= 60% of avg -> close,
   else pursue). It is re-exported here rather than redefined — one definition,
   so the dot on this screen can never drift from the dot anywhere else.
   ============================================================================ */

import {
  serviceStatus,
  tierFromScore,
  type ServiceStatus,
  type Tier,
} from "./brand";

export { serviceStatus };
export type { ServiceStatus, Tier };

/**
 * Below this many ROs in the period, attach rates are noise — a single extra
 * oil change swings a rate by whole points. We show a "building data" state
 * instead of status dots or a coaching pick.
 */
export const MIN_ROS_FOR_COACHING = 20;

// The services EDIAGD coaches advisors on. The DMS also emits catch-all
// buckets (Maintenance, Repair, Miscellaneous) that are not sellable services —
// exclude them from all coaching logic. Keep this as the single source of truth.
//
// BATTERY IS STILL OFF, and that is now a decision waiting on Ryan rather than
// on Mitch. Mitch's August triage ruled "Electrical, Charging & Starting" fully
// covered, and the family has 56 published cues — so it would pass every gate
// below. Turning it on changes Eddie's Pick for every advisor at every store on
// the same day, which is a bigger change than applying a mapping sheet, so it is
// left for its own call.
// OIL CHANGE AND ALIGNMENT ARE NOT HERE ANY MORE. Both have ZERO published
// cues and always have, and being on this list meant they could win Eddie's
// Pick with nothing written for them. The old generic fallback hid that; once
// the coaching ladder stopped ending in a generic passage, the day preview put
// a number on it — 3 of 60 measured advisors would have opened the app to
// "nothing written for this one yet". They are content-gated below instead.
export const COACHABLE_FAMILIES = [
  "Brake Service",
  "Differential",
  "Spark Plugs",
  "Filters",
  "Tires & Rotation",
  "Fuel System",
  "Fluids",
] as const;

/**
 * Intended to be coached, CONTENT-GATED until they have cues.
 *
 * ---------------------------------------------------------------------------
 * EIGHT FAMILIES, AND THEY GOT HERE TWO DIFFERENT WAYS
 * ---------------------------------------------------------------------------
 * Six are Mitch's new families, which have never had content (below). Two —
 * OIL CHANGE and ALIGNMENT — are original coachable families that turn out to
 * have zero published cues and always have. They were unconditionally coachable
 * until the day preview showed what that costs: three of sixty measured
 * advisors would have had their single biggest gap named and then met a card
 * saying nothing had been written about it.
 *
 * THE COST OF GATING THEM IS REAL AND WAS ACCEPTED KNOWINGLY. An advisor whose
 * worst family is Oil Change now gets coached on their SECOND biggest gap, and
 * nothing on their screen says the first one was skipped. The gap does not stop
 * existing; it stops being mentioned. That is the better of two bad options
 * only until somebody writes the cues — the fix is content, not this list, and
 * `npm run preview:day` prints a SUPPRESSED section naming every family in this
 * state and how many advisors it rerouted, so the hole stays visible at the
 * moment somebody is deciding whether to deploy.
 *
 * The six new ones:
 *
 * They exist because his triage routed $435K of Suspension, $540K of HVAC and
 * 1,611 wiper lines at families that did not exist. Mapping them is what makes
 * the money visible in reporting; coaching them before anybody has written a
 * word track would put a gap on an advisor's screen with nothing behind it when
 * they tap it.
 *
 * SEPARATE LIST, NOT A FLAG ON THE FIRST ONE, so the gate FAILS CLOSED: a caller
 * that does not pass the cue set gets these treated as not coachable. The
 * reverse default would mean one forgotten argument quietly ships six empty
 * families to every advisor.
 */
export const COACHABLE_PENDING_CONTENT = [
  "HVAC",
  "Belts & Cooling",
  "Wipers",
  "Lighting",
  "Suspension",
  "Inspections",
  // Original families with no cues. See the header — these are the two the day
  // preview caught, not new families waiting on a triage decision.
  "Oil Change",
  "Alignment",
] as const;

/**
 * Two gates, and both must pass for a pending family: somebody INTENDED it to be
 * coached, and somebody has WRITTEN something to coach with.
 *
 * Cue count alone is still not enough on its own: Battery has 56 published cues
 * and is deliberately not coached, so a family having content never implies it
 * should be. Intent is the first gate and content is the second, and BOTH
 * directions have a live example.
 *
 * The seven in COACHABLE_FAMILIES stay unconditional on purpose. loadFamiliesWithCues
 * returns an EMPTY SET on error — it fails closed — so gating all sixteen on it
 * would mean one database hiccup blanks Eddie's Pick for every advisor at every
 * store at once. Failing closed is right for a family that might have nothing;
 * it is badly wrong for the seven that reliably have hundreds.
 */
export const isCoachable = (
  family: string,
  familiesWithCues?: ReadonlySet<string>
) => {
  if ((COACHABLE_FAMILIES as readonly string[]).includes(family)) return true;
  if (!(COACHABLE_PENDING_CONTENT as readonly string[]).includes(family)) return false;
  return familiesWithCues?.has(family) ?? false;
};

/* ---- Shapes coming out of the views -------------------------------------- */

export type PeriodTotals = {
  periodId: string;
  rooftopId: string;
  advisorOpId: string;
  totalRos: number;
  totalLaborSales: number;
  blendedElr: number | null;
  gpPctWeighted: number | null;
};

export type FamilyAttach = {
  family: string;
  famRos: number;
  advisorRos: number;
  attachRatePct: number | null;
};

export type FamilyBenchmark = {
  family: string;
  storeAvgPct: number | null;
  storeBestPct: number | null;
};

/* ---- The joined, ranked row the UI renders ------------------------------- */

export type ServiceFamily = {
  family: string;
  /** The advisor's attach rate, in percent. */
  rate: number;
  storeAvg: number;
  storeBest: number;
  status: ServiceStatus;
  famRos: number;
  /** Percentage points below store average; 0 when at or above. */
  gapPp: number;
  /** ROs the advisor would add by pulling this family up to store average. */
  missedRos: number;
  /**
   * Estimated labor dollars behind `missedRos`. Null when per-family labor
   * sales aren't readable (see `laborPerRoByFamily` below), in which case
   * ranking falls back to `missedRos`.
   */
  opportunity: number | null;
};

const STATUS_ORDER: Record<ServiceStatus, number> = {
  pursue: 0,
  close: 1,
  "on-track": 2,
};

/** Ranking weight: dollars when we have them, otherwise missed ROs. */
function rank(f: ServiceFamily): number {
  return f.opportunity ?? f.missedRos;
}

/**
 * Join attach rates to store benchmarks and rank them.
 *
 * `laborPerRoByFamily` is optional: labor sales per family live on
 * advisor_op_metric (RLS-gated), not on the views, so callers that can't read
 * it pass nothing and every `opportunity` comes back null.
 *
 * Sort: pursue first, then close, then on-track — biggest opportunity first
 * within each band, so the top of the list is always the best use of the
 * advisor's next conversation.
 *
 * Non-coachable buckets are filtered out here — the single choke point every
 * screen already runs through — so the service list, Eddie's Pick, the tier
 * score, and the manager's team priorities all correct together. Callers don't
 * need to know the list exists.
 */
export function buildServiceFamilies(
  attach: FamilyAttach[],
  benchmarks: FamilyBenchmark[],
  laborPerRoByFamily?: Record<string, number>,
  familiesWithCues?: ReadonlySet<string>
): ServiceFamily[] {
  const byFamily = new Map(
    benchmarks
      .filter((b) => isCoachable(b.family, familiesWithCues))
      .map((b) => [b.family, b])
  );

  return attach
    .filter((a) => isCoachable(a.family, familiesWithCues))
    .map<ServiceFamily | null>((a) => {
      const bench = byFamily.get(a.family);
      const rate = a.attachRatePct;
      const storeAvg = bench?.storeAvgPct;
      // A family with no rate or no benchmark can't be judged — drop it rather
      // than render a dot we can't defend.
      if (rate == null || storeAvg == null) return null;

      const gapPp = Math.max(0, storeAvg - rate);
      const missedRos = (gapPp / 100) * a.advisorRos;
      const laborPerRo = laborPerRoByFamily?.[a.family];

      return {
        family: a.family,
        rate,
        storeAvg,
        storeBest: bench?.storeBestPct ?? storeAvg,
        status: serviceStatus(rate, storeAvg),
        famRos: a.famRos,
        gapPp,
        missedRos,
        opportunity: laborPerRo != null ? missedRos * laborPerRo : null,
      };
    })
    .filter((f): f is ServiceFamily => f !== null)
    .sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || rank(b) - rank(a)
    );
}

/** Do we have enough volume this period to coach on? */
export function hasCoachingVolume(totalRos: number): boolean {
  return totalRos >= MIN_ROS_FOR_COACHING;
}

/**
 * Eddie's Pick — the single biggest opportunity: among families the advisor is
 * BELOW store average on, the largest revenue-weighted gap. Returns null when
 * volume is too thin to coach on, or when they're at/above average everywhere
 * (a good problem to have).
 */
export function eddiesPick(
  families: ServiceFamily[],
  totalRos: number
): ServiceFamily | null {
  if (!hasCoachingVolume(totalRos)) return null;
  const below = families.filter((f) => f.rate < f.storeAvg);
  if (below.length === 0) return null;
  return below.reduce((best, f) => (rank(f) > rank(best) ? f : best));
}

/**
 * Tier from the share of the advisor's work that sits at or above store
 * average, weighted by that family's RO volume (brand.ts describes the tier as
 * revenue-weighted; RO volume is the closest weight the views expose).
 */
export function advisorTier(families: ServiceFamily[]): Tier {
  const total = families.reduce((sum, f) => sum + f.famRos, 0);
  if (total <= 0) return "Zero";
  const atOrAbove = families
    .filter((f) => f.status === "on-track")
    .reduce((sum, f) => sum + f.famRos, 0);
  return tierFromScore(atOrAbove / total);
}

/* ---- Display helpers ----------------------------------------------------- */

export function formatCurrency(value: number, withCents = false): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
}

/** Attach rates arrive as percentages already (38.4 -> "38.4%"). */
export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** gp_pct_weighted is a 0-1 fraction (0.6492 -> "64.9%"). */
export function formatFraction(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** "Aloha, {firstName}" wants just the first token of a full name. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
