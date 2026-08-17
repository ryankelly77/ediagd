/* ============================================================================
   EDIAGD — manager team-view logic
   Pure functions over the same performance views the advisor screen uses.
   Every threshold (status bands, min volume, tier) comes from lib/advisor.ts →
   lib/brand.ts, so a manager's dot can never disagree with the advisor's dot.
   ============================================================================ */

import {
  advisorTier,
  buildServiceFamilies,
  hasCoachingVolume,
  type FamilyAttach,
  type FamilyBenchmark,
  type ServiceFamily,
  type Tier,
} from "./advisor";

export type AdvisorSummary = {
  /** Movement against the same worked days last period. Null when new. */
  trend?: AdvisorTrend | null;
  advisorOpId: string;
  /** Resolved display name — falls back to the op code when unreadable. */
  name: string;
  totalRos: number;
  totalLaborSales: number;
  /** False when the period is too thin to judge (see MIN_ROS_FOR_COACHING). */
  hasVolume: boolean;
  /** Null under min volume — we don't tier someone on noise. */
  tier: Tier | null;
  /** Families in 'pursue'; 0 under min volume. */
  pursueCount: number;
  families: ServiceFamily[];
};

export type AdvisorTrend = {
  workedDays: number;
  currentSales: number;
  priorSales: number;
  salesDiff: number;
  rosDiff: number;
  direction: "up" | "flat" | "down";
  priorExhausted: boolean;
};

export type TeamPriority = {
  family: string;
  storeAvgPct: number;
  /** Advisors sitting in 'pursue' on this family. */
  pursueCount: number;
  /** Advisors with enough volume to be counted at all. */
  eligibleCount: number;
};

/**
 * The DMS roster writes names as the report does: "Helton, Erin (671)".
 *
 * Turned into "Erin Helton" for display — the trailing operator id is already
 * shown as its own column, and "Advisor 671" was never a name anybody uses.
 */
export function formatRosterName(raw: string | null | undefined): string | null {
  const cleaned = raw?.replace(/\s*\(\w+\)\s*$/, "").trim();
  if (!cleaned) return null;
  const comma = cleaned.indexOf(",");
  if (comma === -1) return cleaned;
  const last = cleaned.slice(0, comma).trim();
  const first = cleaned.slice(comma + 1).trim();
  return first && last ? `${first} ${last}` : cleaned;
}

/**
 * A manager can read team `membership` rows but not teammates' `app_user`
 * names — app_user's RLS is self-only by design — so those come back null for
 * everyone but the viewer.
 *
 * The DMS ROSTER is the fallback, and it is a better one than it sounds: it
 * holds the name the dealership itself files the advisor under, and it exists
 * for people who have no app account at all. That is exactly the case that used
 * to render "Advisor 671" for a real advisor who started last week.
 *
 * The operator id remains the last resort, for somebody who appears in the
 * performance data and in no roster at all.
 */
export function displayAdvisorName(
  fullName: string | null | undefined,
  advisorOpId: string,
  rosterName?: string | null
): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  const roster = formatRosterName(rosterName);
  if (roster) return roster;
  return `Advisor ${advisorOpId}`;
}

/** Roll one advisor's rows into the shape the roster renders. */
export function summarizeAdvisor(input: {
  advisorOpId: string;
  name: string;
  totalRos: number;
  totalLaborSales: number;
  attach: FamilyAttach[];
  benchmarks: FamilyBenchmark[];
  /** Content gate for Mitch's new families — see lib/coachable-families.ts. */
  familiesWithCues?: ReadonlySet<string>;
  /**
   * Labor-per-RO by family for THIS advisor — see lib/family-labor.ts.
   *
   * Passing it is what makes the manager's team view rank Eddie's Pick the same
   * way the advisor's own screen does. Omitting it does not error; it silently
   * reverts this advisor to missed-RO ranking, which is the disagreement 0055
   * set out to remove.
   */
  laborPerRoByFamily?: Record<string, number>;
}): AdvisorSummary {
  const families = buildServiceFamilies(
    input.attach,
    input.benchmarks,
    input.laborPerRoByFamily,
    input.familiesWithCues
  );
  const hasVolume = hasCoachingVolume(input.totalRos);

  return {
    advisorOpId: input.advisorOpId,
    name: input.name,
    totalRos: input.totalRos,
    totalLaborSales: input.totalLaborSales,
    hasVolume,
    tier: hasVolume ? advisorTier(families) : null,
    pursueCount: hasVolume
      ? families.filter((f) => f.status === "pursue").length
      : 0,
    families,
  };
}

/**
 * The roster, in a NEUTRAL order.
 *
 * It used to sort by pursueCount descending — most services below the store
 * average first. That is not a tier badge, but it is the same judgement in a
 * different costume: it puts the person doing worst against their colleagues at
 * the top of a list their manager reads before a conversation. Removing the
 * Elite/Strong/Low/Zero pill and leaving that ordering would have moved the
 * ranking rather than retired it.
 *
 * ALPHABETICAL, because this is a list of people. Labor sales descending was
 * the alternative and is what /group uses for STORES — but a store is a
 * business unit and an advisor is a person, and ordering people by output is a
 * leaderboard whatever it is called. A manager scanning for a name finds it
 * fastest this way, and the trend chip on each row now carries the signal that
 * the ordering used to.
 *
 * Advisors without enough volume still sit at the end: that is not a judgement,
 * it is "we do not have enough data to say anything about this person yet".
 */
export function rankRoster(summaries: AdvisorSummary[]): AdvisorSummary[] {
  return [...summaries].sort((a, b) => {
    if (a.hasVolume !== b.hasVolume) return a.hasVolume ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Whole-team training opportunities: families where the most advisors are in
 * 'pursue'. A family several advisors share is a group session, not a
 * one-on-one. Families nobody is pursuing are omitted entirely.
 */
export function teamPriorities(
  summaries: AdvisorSummary[],
  benchmarks: FamilyBenchmark[],
  limit = 4
): TeamPriority[] {
  const eligible = summaries.filter((s) => s.hasVolume);
  const eligibleCount = eligible.length;
  if (eligibleCount === 0) return [];

  const pursueByFamily = new Map<string, number>();
  for (const advisor of eligible) {
    for (const family of advisor.families) {
      if (family.status === "pursue") {
        pursueByFamily.set(
          family.family,
          (pursueByFamily.get(family.family) ?? 0) + 1
        );
      }
    }
  }

  const avgByFamily = new Map(
    benchmarks
      .filter((b) => b.storeAvgPct != null)
      .map((b) => [b.family, b.storeAvgPct as number])
  );

  return [...pursueByFamily.entries()]
    .map<TeamPriority>(([family, pursueCount]) => ({
      family,
      storeAvgPct: avgByFamily.get(family) ?? 0,
      pursueCount,
      eligibleCount,
    }))
    .sort((a, b) => b.pursueCount - a.pursueCount || b.storeAvgPct - a.storeAvgPct)
    .slice(0, limit);
}
