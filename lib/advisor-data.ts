/* ============================================================================
   EDIAGD — advisor performance queries (server)
   Loads the rows the advisor screens need and hands them to the shared logic in
   lib/advisor.ts. The maths lives there; this file only fetches.

   NOTE: app/(app)/advisor/page.tsx still does its own equivalent queries inline.
   It should adopt this helper so the dashboard and the daily flow can never
   disagree about Eddie's Pick — left alone here to avoid touching a working
   screen in this task. The one rule they DO now share is which period to
   measure on: both call loadMeasurementPeriod, because the two screens
   disagreeing about that is not a cosmetic difference.
   ============================================================================ */

import {
  buildServiceFamilies,
  eddiesPick,
  hasCoachingVolume,
  type FamilyAttach,
  type FamilyBenchmark,
  type ServiceFamily,
} from "@/lib/advisor";
import { loadFamiliesWithCues } from "@/lib/coachable-families";
import { loadLaborPerRo } from "@/lib/family-labor";
import { loadAdvisorPeriodWithTotals } from "@/lib/perf-period";

type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type AdvisorDay = {
  periodId: string;
  rooftopId: string;
  totalRos: number;
  totalLaborSales: number;
  families: ServiceFamily[];
  pick: ServiceFamily | null;
  hasVolume: boolean;
  /**
   * True when the only period available is a part-month. The pick is still
   * computed and still rendered — a rooftop's first month is a real state — but
   * NO COACHING BLOCK MAY BE OPENED FROM IT. Eight days of data is not six days
   * of conversation, and the block outlives the complete file's arrival.
   */
  fromPartialPeriod: boolean;
};

/**
 * Everything the daily flow needs about this advisor's current period.
 * Returns null when there's no performance period for them yet — the caller
 * decides how to degrade (the daily flow still runs, with a generic cue).
 */
export async function loadAdvisorDay(
  client: Client,
  opCodeId: string,
  rooftopId: string | null
): Promise<AdvisorDay | null> {
  /*
   * NO ROOFTOP IS A REFUSAL, NOT A GUESS.
   *
   * This used to fall through to `advisor_period_totals` with no period filter,
   * no ordering, and limit(1) — Postgres returning whichever row it liked. An
   * advisor whose membership carries no rooftop was measured against a random
   * historical month, and differently on different page loads. There is no
   * honest answer here, so there is no answer.
   */
  if (!rooftopId) return null;

  /*
   * Advisor-grained: their own latest complete period, else their own latest
   * partial — and their totals in it, from the same row and the same trip. See
   * lib/perf-period.ts for why this used to be three queries and why it is one.
   *
   * Null here means the advisor has no rows in any live period at this rooftop.
   * The two old failure points — no period, and a period with no totals row —
   * cannot be told apart any more because they cannot happen apart: the totals
   * ARE the row the period was chosen from.
   */
  const measured = await loadAdvisorPeriodWithTotals(client, rooftopId, opCodeId);
  if (!measured) return null;

  const { period, totals } = measured;
  const resolvedPeriodId = totals.periodId;
  const resolvedRooftopId = totals.rooftopId;
  const totalRos = totals.totalRos;

  const [
    { data: attachRows },
    { data: benchmarkRows },
    familiesWithCues,
    laborPerRoByFamily,
  ] = await Promise.all([
      client
        .from("advisor_family_attach")
        .select("family, fam_ros, advisor_ros, attach_rate_pct")
        .eq("advisor_op_id", opCodeId)
        .eq("period_id", resolvedPeriodId)
        .eq("rooftop_id", resolvedRooftopId),
      client
        .from("family_store_benchmark")
        .select("family, store_avg_pct, store_best_pct")
        .eq("period_id", resolvedPeriodId)
        .eq("rooftop_id", resolvedRooftopId),
      loadFamiliesWithCues(client),
      loadLaborPerRo(client, resolvedPeriodId, opCodeId),
    ]);

  const attach: FamilyAttach[] = (attachRows ?? []).map(
    (r: Record<string, unknown>) => ({
      family: r.family as string,
      famRos: Number(r.fam_ros ?? 0),
      advisorRos: Number(r.advisor_ros ?? 0),
      attachRatePct: r.attach_rate_pct == null ? null : Number(r.attach_rate_pct),
    })
  );

  const benchmarks: FamilyBenchmark[] = (benchmarkRows ?? []).map(
    (r: Record<string, unknown>) => ({
      family: r.family as string,
      storeAvgPct: r.store_avg_pct == null ? null : Number(r.store_avg_pct),
      storeBestPct: r.store_best_pct == null ? null : Number(r.store_best_pct),
    })
  );

  const families = buildServiceFamilies(
    attach,
    benchmarks,
    laborPerRoByFamily,
    familiesWithCues
  );

  return {
    periodId: resolvedPeriodId,
    rooftopId: resolvedRooftopId,
    totalRos,
    totalLaborSales: totals.totalLaborSales,
    families,
    pick: eddiesPick(families, totalRos),
    hasVolume: hasCoachingVolume(totalRos),
    fromPartialPeriod: period.isPartial,
  };
}
