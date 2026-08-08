/* ============================================================================
   EDIAGD — impact queries
   SERVER ONLY (takes a Supabase client).

   WHAT THIS SCREEN IS ALLOWED TO CLAIM. Every number here is a comparison
   WITHIN one advisor: the services they were coached on against the services
   they were not, in the same month. That is what makes it worth reading —
   seasonality, staffing, incentives and store quality apply to both sides and
   cancel. It is still not proof, because which services get coached is not
   randomly assigned, so nothing here returns a number without the N beside it
   and the UI never says "caused".

   Every aggregate is computed by the 0029 views over the impact_rollup table.
   Live computation took 5.7s at 100 rooftops; the rollup takes 14ms.
   ============================================================================ */

import { LIST_PAGE_SIZE } from "@/lib/admin-engagement";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** Movement needs a before and an after. One month can say nothing at all. */
export const MIN_MONTHS_FOR_MOVEMENT = 2;

export type ImpactSummary = {
  /** Net incremental labor sales attributable to coaching. See the derivation. */
  incrementalLabor: number | null;
  incrementalRos: number | null;
  dollarRows: number;
  dollarAdvisors: number;
  coachedN: number;
  coachedDelta: number | null;
  uncoachedN: number;
  uncoachedDelta: number | null;
  /** Coached minus uncoached, in percentage points. The number to lead with. */
  gapPts: number | null;
  advisors: number;
  rooftops: number;
  monthsCompared: number;
  monthsAvailable: number;
  firstMonth: string | null;
  lastMonth: string | null;
  hasDemo: boolean;
  allDemo: boolean;
  computedAt: string | null;
};

export type InterventionRow = {
  intervention: "cue" | "video" | "lesson";
  n: number;
  meanDelta: number | null;
  incrementalLabor: number | null;
  advisors: number;
  /** False when every row behind it is seeded. Drives the illustrative label. */
  hasRealData: boolean;
};

export type Quadrant =
  | "engaged_improving"
  | "engaged_flat"
  | "quiet_improving"
  | "quiet_flat";

export type GridCell = {
  quadrant: Quadrant;
  advisors: number;
  meanCoachedDelta: number | null;
  incrementalLabor: number | null;
};

export type GridAdvisor = {
  userId: string;
  rooftopId: string;
  rooftopName: string;
  advisorName: string;
  engagementScore: number | null;
  coachedDelta: number | null;
  incrementalLabor: number | null;
  coachedN: number;
};

export type ImpactThresholds = {
  engagedScoreMin: number;
  improvingPtsMin: number;
};

export type Funnel = {
  advisors: number;
  doingDailyLoop: number;
  loopConsistently: number;
  intoLessons: number;
};

export type ImpactTrendRow = {
  startsOn: string;
  periodLabel: string;
  coachedN: number;
  coachedDelta: number | null;
  uncoachedN: number;
  uncoachedDelta: number | null;
  rooftops: number;
};

export type ImpactBandRow = {
  band: string;
  coachedN: number;
  coachedDelta: number | null;
  uncoachedN: number;
  uncoachedDelta: number | null;
  advisors: number;
};

export type ImpactRooftopRow = {
  rooftopId: string;
  rooftopName: string;
  monthCount: number;
  coachedN: number;
  coachedDelta: number | null;
  uncoachedN: number;
  uncoachedDelta: number | null;
  advisors: number;
  isDemo: boolean;
  /** Labor SALES lift. */
  incrementalLabor: number | null;
  /** Labor sales lift x this rooftop's own labor GP%. What ROI is measured on. */
  incrementalGp: number | null;
  gpPctUsed: number | null;
  monthlyPrice: number | null;
  priceIsOverride: boolean;
  subscriptionCost: number | null;
  /** Dollars of gross profit back per dollar of subscription. */
  roiRatio: number | null;
  /** No GP% on file — excluded from ROI rather than given an assumed margin. */
  gpMissing: boolean;
};

export type NetworkRoi = {
  incrementalLabor: number | null;
  incrementalGp: number | null;
  subscriptionCost: number | null;
  netGain: number | null;
  roiRatio: number | null;
  gpPctUsed: number | null;
  rooftopsCounted: number;
  rooftopsTooNew: number;
  rooftopsNoGp: number;
  rooftopsBelowCost: number;
  hasDemo: boolean;
};

/** How the rooftop list is ordered. ROI first — that's the GM conversation. */
export type RooftopSort = "roi" | "lift" | "name";

export type ServicePoint = {
  family: string;
  startsOn: string;
  periodLabel: string;
  attachRatePct: number | null;
  deltaPts: number | null;
  coached: boolean;
};

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export async function loadImpactSummary(client: Client): Promise<ImpactSummary | null> {
  const { data, error } = await client
    .from("admin_impact_summary")
    .select(
      "incremental_labor, incremental_ros, dollar_rows, dollar_advisors, coached_n, coached_delta, uncoached_n, uncoached_delta, gap_pts, advisors, rooftops, months_compared, months_available, first_month, last_month, has_demo, all_demo, computed_at"
    )
    .maybeSingle();

  if (error || !data) return null;

  return {
    incrementalLabor: num(data.incremental_labor),
    incrementalRos: num(data.incremental_ros),
    dollarRows: Number(data.dollar_rows ?? 0),
    dollarAdvisors: Number(data.dollar_advisors ?? 0),
    coachedN: Number(data.coached_n ?? 0),
    coachedDelta: num(data.coached_delta),
    uncoachedN: Number(data.uncoached_n ?? 0),
    uncoachedDelta: num(data.uncoached_delta),
    gapPts: num(data.gap_pts),
    advisors: Number(data.advisors ?? 0),
    rooftops: Number(data.rooftops ?? 0),
    monthsCompared: Number(data.months_compared ?? 0),
    monthsAvailable: Number(data.months_available ?? 0),
    firstMonth: (data.first_month as string | null) ?? null,
    lastMonth: (data.last_month as string | null) ?? null,
    hasDemo: Boolean(data.has_demo),
    allDemo: Boolean(data.all_demo),
    computedAt: (data.computed_at as string | null) ?? null,
  };
}

export async function loadInterventions(client: Client): Promise<InterventionRow[]> {
  const { data } = await client
    .from("admin_impact_intervention")
    .select("intervention, n, mean_delta, incremental_labor, advisors, has_real_data");

  const order: Record<string, number> = { cue: 0, video: 1, lesson: 2 };
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      intervention: r.intervention as InterventionRow["intervention"],
      n: Number(r.n ?? 0),
      meanDelta: num(r.mean_delta),
      incrementalLabor: num(r.incremental_labor),
      advisors: Number(r.advisors ?? 0),
      hasRealData: Boolean(r.has_real_data),
    }))
    .sort((a, b) => (order[a.intervention] ?? 9) - (order[b.intervention] ?? 9));
}

export async function loadGrid(client: Client): Promise<GridCell[]> {
  const { data } = await client
    .from("admin_impact_grid")
    .select("quadrant, advisors, mean_coached_delta, incremental_labor");

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    quadrant: r.quadrant as Quadrant,
    advisors: Number(r.advisors ?? 0),
    meanCoachedDelta: num(r.mean_coached_delta),
    incrementalLabor: num(r.incremental_labor),
  }));
}

export async function loadThresholds(client: Client): Promise<ImpactThresholds> {
  const { data } = await client
    .from("impact_settings")
    .select("engaged_score_min, improving_pts_min")
    .maybeSingle();

  return {
    engagedScoreMin: Number(data?.engaged_score_min ?? 75),
    improvingPtsMin: Number(data?.improving_pts_min ?? 0.5),
  };
}

export async function loadFunnel(client: Client): Promise<Funnel | null> {
  const { data } = await client
    .from("admin_engagement_funnel")
    .select("advisors, doing_daily_loop, loop_consistently, into_lessons")
    .maybeSingle();

  if (!data) return null;
  return {
    advisors: Number(data.advisors ?? 0),
    doingDailyLoop: Number(data.doing_daily_loop ?? 0),
    loopConsistently: Number(data.loop_consistently ?? 0),
    intoLessons: Number(data.into_lessons ?? 0),
  };
}

/** One quadrant's advisors, paged. Never the whole grid at once. */
export async function loadQuadrantAdvisors(
  client: Client,
  quadrant: Quadrant,
  limit: number = LIST_PAGE_SIZE
): Promise<{ rows: GridAdvisor[]; total: number }> {
  const { data, count } = await client
    .from("admin_impact_advisor_grid")
    .select(
      "user_id, rooftop_id, rooftop_name, advisor_name, engagement_score, coached_delta, incremental_labor, coached_n",
      { count: "exact" }
    )
    .eq("quadrant", quadrant)
    .order("incremental_labor", { ascending: false, nullsFirst: false })
    .order("advisor_name", { ascending: true })
    .range(0, limit - 1);

  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    rooftopId: r.rooftop_id as string,
    rooftopName: (r.rooftop_name as string) ?? "Rooftop",
    advisorName: (r.advisor_name as string) ?? "Advisor",
    engagementScore: num(r.engagement_score),
    coachedDelta: num(r.coached_delta),
    incrementalLabor: num(r.incremental_labor),
    coachedN: Number(r.coached_n ?? 0),
  }));

  return { rows, total: Number(count ?? rows.length) };
}

export async function loadImpactTrend(client: Client): Promise<ImpactTrendRow[]> {
  const { data } = await client
    .from("admin_impact_trend")
    .select(
      "starts_on, period_label, coached_n, coached_delta, uncoached_n, uncoached_delta, rooftops"
    )
    .order("starts_on", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    startsOn: r.starts_on as string,
    periodLabel: (r.period_label as string) ?? "",
    coachedN: Number(r.coached_n ?? 0),
    coachedDelta: num(r.coached_delta),
    uncoachedN: Number(r.uncoached_n ?? 0),
    uncoachedDelta: num(r.uncoached_delta),
    rooftops: Number(r.rooftops ?? 0),
  }));
}

export async function loadImpactByBand(client: Client): Promise<ImpactBandRow[]> {
  const { data } = await client
    .from("admin_impact_by_band")
    .select("band, coached_n, coached_delta, uncoached_n, uncoached_delta, advisors");

  const order: Record<string, number> = { engaged: 0, building: 1, nudge: 2 };
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      band: (r.band as string) ?? "nudge",
      coachedN: Number(r.coached_n ?? 0),
      coachedDelta: num(r.coached_delta),
      uncoachedN: Number(r.uncoached_n ?? 0),
      uncoachedDelta: num(r.uncoached_delta),
      advisors: Number(r.advisors ?? 0),
    }))
    .sort((a, b) => (order[a.band] ?? 9) - (order[b.band] ?? 9));
}

/**
 * Worst-first is wrong here — this list is read to find what IS working, so it
 * leads with the biggest coached movement. Stores without enough history sort
 * to the bottom rather than reading as a zero.
 */
const ROOFTOP_COLUMNS =
  "rooftop_id, rooftop_name, month_count, coached_n, coached_delta, uncoached_n, uncoached_delta, advisors, is_demo, incremental_labor, incremental_gp, gp_pct_used, monthly_price, price_is_override, subscription_cost, roi_ratio, gp_missing";

function toRooftopRow(r: Record<string, unknown>): ImpactRooftopRow {
  return {
    rooftopId: r.rooftop_id as string,
    rooftopName: (r.rooftop_name as string) ?? "Rooftop",
    monthCount: Number(r.month_count ?? 0),
    coachedN: Number(r.coached_n ?? 0),
    coachedDelta: num(r.coached_delta),
    uncoachedN: Number(r.uncoached_n ?? 0),
    uncoachedDelta: num(r.uncoached_delta),
    advisors: Number(r.advisors ?? 0),
    isDemo: Boolean(r.is_demo),
    incrementalLabor: num(r.incremental_labor),
    incrementalGp: num(r.incremental_gp),
    gpPctUsed: num(r.gp_pct_used),
    monthlyPrice: num(r.monthly_price),
    priceIsOverride: Boolean(r.price_is_override),
    subscriptionCost: num(r.subscription_cost),
    roiRatio: num(r.roi_ratio),
    gpMissing: Boolean(r.gp_missing),
  };
}

export async function loadImpactRooftops(
  client: Client,
  limit: number = LIST_PAGE_SIZE,
  sort: RooftopSort = "roi",
  belowCostOnly = false
): Promise<{ rows: ImpactRooftopRow[]; total: number }> {
  let query = client
    .from("admin_impact_rooftop")
    .select(
      ROOFTOP_COLUMNS,
      { count: "exact" }
    );

  // Ordered in Postgres so the ordering survives paging. ROI is the default
  // because "is this store paying for itself" is the conversation a GM has.
  if (sort === "roi") {
    query = query.order("roi_ratio", { ascending: false, nullsFirst: false });
  } else if (sort === "lift") {
    query = query.order("incremental_gp", { ascending: false, nullsFirst: false });
  }
  if (belowCostOnly) query = query.lt("roi_ratio", 1);

  const { data, count } = await query
    .order("rooftop_name", { ascending: true })
    .range(0, limit - 1);

  const rows = ((data ?? []) as Record<string, unknown>[]).map(toRooftopRow);
  return { rows, total: Number(count ?? rows.length) };
}

export async function loadNetworkRoi(client: Client): Promise<NetworkRoi | null> {
  const { data } = await client
    .from("admin_impact_roi")
    .select(
      "incremental_labor, incremental_gp, subscription_cost, net_gain, roi_ratio, gp_pct_used, rooftops_counted, rooftops_too_new, rooftops_no_gp, rooftops_below_cost, has_demo"
    )
    .maybeSingle();

  if (!data) return null;
  return {
    incrementalLabor: num(data.incremental_labor),
    incrementalGp: num(data.incremental_gp),
    subscriptionCost: num(data.subscription_cost),
    netGain: num(data.net_gain),
    roiRatio: num(data.roi_ratio),
    gpPctUsed: num(data.gp_pct_used),
    rooftopsCounted: Number(data.rooftops_counted ?? 0),
    rooftopsTooNew: Number(data.rooftops_too_new ?? 0),
    rooftopsNoGp: Number(data.rooftops_no_gp ?? 0),
    rooftopsBelowCost: Number(data.rooftops_below_cost ?? 0),
    hasDemo: Boolean(data.has_demo),
  };
}

export async function loadRooftopImpact(
  client: Client,
  rooftopId: string
): Promise<ImpactRooftopRow | null> {
  const { data } = await client
    .from("admin_impact_rooftop")
    .select(ROOFTOP_COLUMNS)
    .eq("rooftop_id", rooftopId)
    .maybeSingle();

  return data ? toRooftopRow(data as Record<string, unknown>) : null;
}

export type AdvisorImpact = {
  userId: string;
  advisorName: string;
  coachedN: number;
  coachedDelta: number | null;
  uncoachedN: number;
  uncoachedDelta: number | null;
};

/**
 * The advisors at one rooftop, with their own within-person comparison.
 *
 * Aggregated in JS from at most a few hundred rows — one rooftop's six months
 * of services — rather than adding another view. The bound is the reason that
 * is safe: 8 advisors x 12 families x 6 months is 576 rows at the very worst,
 * and the query is filtered to a single rooftop before it ever leaves Postgres.
 */
export async function loadRooftopAdvisors(
  client: Client,
  rooftopId: string
): Promise<{ advisors: AdvisorImpact[]; series: Map<string, ServicePoint[]> }> {
  const { data } = await client
    .from("impact_rollup")
    .select(
      "user_id, family, starts_on, period_label, attach_rate_pct, delta_pts, coached"
    )
    .eq("rooftop_id", rooftopId)
    .order("starts_on", { ascending: true });

  const rows = (data ?? []) as Record<string, unknown>[];

  const series = new Map<string, ServicePoint[]>();
  const totals = new Map<
    string,
    { cN: number; cSum: number; uN: number; uSum: number }
  >();

  for (const r of rows) {
    const userId = r.user_id as string;
    const point: ServicePoint = {
      family: (r.family as string) ?? "Service",
      startsOn: r.starts_on as string,
      periodLabel: (r.period_label as string) ?? "",
      attachRatePct: num(r.attach_rate_pct),
      deltaPts: num(r.delta_pts),
      coached: Boolean(r.coached),
    };
    const list = series.get(userId) ?? [];
    list.push(point);
    series.set(userId, list);

    if (point.deltaPts == null) continue;
    const t = totals.get(userId) ?? { cN: 0, cSum: 0, uN: 0, uSum: 0 };
    if (point.coached) {
      t.cN += 1;
      t.cSum += point.deltaPts;
    } else {
      t.uN += 1;
      t.uSum += point.deltaPts;
    }
    totals.set(userId, t);
  }

  // Names come from the advisor engagement view, which is already scoped and
  // already resolves the display name the same way every other screen does.
  const { data: names } = await client
    .from("admin_advisor_engagement")
    .select("user_id, advisor_name")
    .eq("rooftop_id", rooftopId);

  const nameOf = new Map<string, string>(
    ((names ?? []) as Record<string, unknown>[]).map((n) => [
      n.user_id as string,
      (n.advisor_name as string) ?? "Advisor",
    ])
  );

  const advisors: AdvisorImpact[] = [...totals.entries()]
    .map(([userId, t]) => ({
      userId,
      advisorName: nameOf.get(userId) ?? "Advisor",
      coachedN: t.cN,
      coachedDelta: t.cN > 0 ? Number((t.cSum / t.cN).toFixed(2)) : null,
      uncoachedN: t.uN,
      uncoachedDelta: t.uN > 0 ? Number((t.uSum / t.uN).toFixed(2)) : null,
    }))
    .sort(
      (a, b) =>
        (b.coachedDelta ?? -Infinity) - (a.coachedDelta ?? -Infinity) ||
        a.advisorName.localeCompare(b.advisorName)
    );

  return { advisors, series };
}
