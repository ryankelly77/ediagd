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

export type TeamPriority = {
  family: string;
  storeAvgPct: number;
  /** Advisors sitting in 'pursue' on this family. */
  pursueCount: number;
  /** Advisors with enough volume to be counted at all. */
  eligibleCount: number;
};

/**
 * A manager can read team `membership` rows but not teammates' `app_user`
 * names (the app_user_self RLS policy is self-only), so most names come back
 * null today. Fall back to the DMS op code rather than rendering "null".
 */
export function displayAdvisorName(
  fullName: string | null | undefined,
  advisorOpId: string
): string {
  const trimmed = fullName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Advisor ${advisorOpId}`;
}

/** Roll one advisor's rows into the shape the roster renders. */
export function summarizeAdvisor(input: {
  advisorOpId: string;
  name: string;
  totalRos: number;
  totalLaborSales: number;
  attach: FamilyAttach[];
  benchmarks: FamilyBenchmark[];
}): AdvisorSummary {
  const families = buildServiceFamilies(input.attach, input.benchmarks);
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
 * Coaching order: the advisors with the most families to pursue come first,
 * because that's where a manager's next conversation pays most. Advisors
 * without enough volume sink to the bottom — there's nothing to coach on yet,
 * and they shouldn't look like a problem.
 */
export function rankRoster(summaries: AdvisorSummary[]): AdvisorSummary[] {
  return [...summaries].sort((a, b) => {
    if (a.hasVolume !== b.hasVolume) return a.hasVolume ? -1 : 1;
    return b.pursueCount - a.pursueCount || b.totalLaborSales - a.totalLaborSales;
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
