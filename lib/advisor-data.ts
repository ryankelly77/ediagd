/* ============================================================================
   EDIAGD — advisor performance queries (server)
   Loads the rows the advisor screens need and hands them to the shared logic in
   lib/advisor.ts. The maths lives there; this file only fetches.

   NOTE: app/(app)/advisor/page.tsx still does its own equivalent queries inline.
   It should adopt this helper so the dashboard and the daily flow can never
   disagree about Eddie's Pick — left alone here to avoid touching a working
   screen in this task.
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
  let periodId: string | null = null;
  if (rooftopId) {
    const { data: period } = await client
      .from("perf_period")
      .select("id")
      .eq("rooftop_id", rooftopId)
      .order("ends_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    periodId = (period?.id as string | undefined) ?? null;
  }

  let totalsQuery = client
    .from("advisor_period_totals")
    .select("period_id, rooftop_id, total_ros, total_labor_sales")
    .eq("advisor_op_id", opCodeId);
  if (periodId) totalsQuery = totalsQuery.eq("period_id", periodId);

  const { data: totals } = await totalsQuery.limit(1).maybeSingle();
  if (!totals) return null;

  const resolvedPeriodId = totals.period_id as string;
  const resolvedRooftopId = totals.rooftop_id as string;
  const totalRos = Number(totals.total_ros ?? 0);

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
    totalLaborSales: Number(totals.total_labor_sales ?? 0),
    families,
    pick: eddiesPick(families, totalRos),
    hasVolume: hasCoachingVolume(totalRos),
  };
}
