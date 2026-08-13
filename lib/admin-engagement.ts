/* ============================================================================
   EDIAGD — admin engagement queries
   SERVER ONLY (takes a Supabase client). Every aggregate is computed by the
   0026 views in Postgres; nothing here pulls a row per advisor.

   THE RULE THAT MAKES THIS SCALE: no query returns more than one screenful.
   The old screen fetched every rooftop, every engagement row and every advisor
   membership and grouped them in JS, which broke twice before it got slow —
   PostgREST truncates at 1000 rows, and its .in() filter values go in the URL,
   which fails past roughly 200 ids. Neither limit is reachable from here: the
   summary is one row, and the list is paged.
   ============================================================================ */

import type { EngagementBand } from "@/lib/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** Rows per page in the exceptions list. Deliberately small — see above. */
export const LIST_PAGE_SIZE = 10;
/** How many more each "Show more" adds. */
export const LIST_PAGE_STEP = 25;
/** Hard ceiling, so a crafted ?show= can't ask for everything. */
export const LIST_MAX = 200;

export type EngagementSummary = {
  advisorCount: number;
  avgScore: number | null;
  workingDays: number;
  reportingRooftops: number;
  advisorBands: Record<EngagementBand, number>;
  rooftopBands: Record<EngagementBand, number>;
  /**
   * When the rollup these numbers come from was computed (0028). Null means it
   * has never run — which the screen has to say out loud, because "0 advisors"
   * and "nobody has computed this yet" look identical otherwise.
   */
  computedAt: string | null;
};

export type ScopeInfo = {
  rooftopCount: number;
  /** One rooftop: skip the rooftop level entirely and report on advisors. */
  singleRooftop: boolean;
  /** Rooftops with no engagement rows at all — see loadCoverage. */
  notStarted: number;
  /** Of those, how many already have performance data loaded. */
  notStartedWithData: number;
};

/** How many rooftops this admin covers, including ones with no data yet. */
export async function loadScope(client: Client): Promise<ScopeInfo> {
  /*
   * THREE DENOMINATORS USED TO DISAGREE ON ONE SCREEN. The hero said 112
   * rooftops, the donut totalled 100, and nothing explained the gap: the donut
   * is built from engagement_rollup, which only contains rooftops where
   * somebody has an account and has done something. The eleven Doggett stores
   * have performance data and no logins, so they were absent from the chart
   * while being counted in the headline — eleven stores invisible in a total
   * an admin reads as "all of them".
   *
   * Both numbers now come from admin_engagement_coverage, so the donut's
   * segments plus "Not started" always add up to the hero.
   */
  const { data } = await client
    .from("admin_engagement_coverage")
    .select("rooftops_in_scope, rooftops_not_started, not_started_with_data")
    .maybeSingle();

  const rooftopCount = Number(data?.rooftops_in_scope ?? 0);
  return {
    rooftopCount,
    singleRooftop: rooftopCount === 1,
    notStarted: Number(data?.rooftops_not_started ?? 0),
    notStartedWithData: Number(data?.not_started_with_data ?? 0),
  };
}

/** One row. Everything the hero and the donut need, at any scale. */
export async function loadSummary(client: Client): Promise<EngagementSummary | null> {
  const { data, error } = await client
    .from("admin_engagement_summary")
    .select(
      "advisor_count, avg_score, working_days, reporting_rooftops, adv_on_track, adv_close, adv_attention, rt_on_track, rt_close, rt_attention, computed_at"
    )
    .maybeSingle();

  if (error || !data) return null;

  return {
    advisorCount: Number(data.advisor_count ?? 0),
    avgScore: data.avg_score == null ? null : Number(data.avg_score),
    workingDays: Number(data.working_days ?? 0),
    reportingRooftops: Number(data.reporting_rooftops ?? 0),
    advisorBands: {
      engaged: Number(data.adv_on_track ?? 0),
      building: Number(data.adv_close ?? 0),
      nudge: Number(data.adv_attention ?? 0),
    },
    rooftopBands: {
      engaged: Number(data.rt_on_track ?? 0),
      building: Number(data.rt_close ?? 0),
      nudge: Number(data.rt_attention ?? 0),
    },
    computedAt: (data.computed_at as string | null) ?? null,
  };
}

/**
 * ILIKE treats % and _ as wildcards, so a search for "50%" would match far more
 * than the admin meant. Escaping keeps typed text literal.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type RooftopRow = {
  rooftopId: string;
  rooftopName: string;
  avgScore: number | null;
  band: EngagementBand;
  advisorCount: number;
  nudgeCount: number;
};

export type AdvisorRow = {
  userId: string;
  /** Which store this row is for — an advisor can appear at more than one. */
  rooftopId: string;
  rooftopName: string;
  advisorName: string;
  score: number | null;
  band: EngagementBand;
  daysLoggedIn: number;
  workingDays: number;
  /**
   * The two halves of the score. Already on the row the list fetches, so the
   * detail card gets them for free — no second query to say "showed up 71%,
   * did the work 48%".
   */
  loginRatePct: number | null;
  watchRatePct: number | null;
};

export type ListQuery = {
  band?: EngagementBand | null;
  search?: string | null;
  limit: number;
};

/** Worst-first rooftops, filtered and paged in the database. */
export async function loadRooftops(
  client: Client,
  { band, search, limit }: ListQuery
): Promise<{ rows: RooftopRow[]; total: number }> {
  let query = client
    .from("admin_rooftop_engagement")
    .select(
      "rooftop_id, rooftop_name, avg_score, band, advisor_count, nudge_count",
      { count: "exact" }
    );

  if (band) query = query.eq("band", band);
  if (search) query = query.ilike("rooftop_name", `%${escapeLike(search)}%`);

  const { data, count } = await query
    .order("avg_score", { ascending: true, nullsFirst: true })
    .order("rooftop_name", { ascending: true })
    .range(0, limit - 1);

  const rows: RooftopRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rooftopId: r.rooftop_id as string,
    rooftopName: (r.rooftop_name as string) ?? "Rooftop",
    avgScore: r.avg_score == null ? null : Number(r.avg_score),
    band: (r.band as EngagementBand) ?? "nudge",
    advisorCount: Number(r.advisor_count ?? 0),
    nudgeCount: Number(r.nudge_count ?? 0),
  }));

  return { rows, total: Number(count ?? rows.length) };
}

/** Worst-first advisors, optionally within one rooftop. Same paging rules. */
export async function loadAdvisors(
  client: Client,
  { band, search, limit }: ListQuery,
  rooftopId?: string
): Promise<{ rows: AdvisorRow[]; total: number }> {
  let query = client
    .from("admin_advisor_engagement")
    .select(
      "user_id, rooftop_id, rooftop_name, advisor_name, engagement_score, band, days_logged_in, working_days, login_rate_pct, watch_rate_pct",
      { count: "exact" }
    );

  if (rooftopId) query = query.eq("rooftop_id", rooftopId);
  if (band) query = query.eq("band", band);
  if (search) query = query.ilike("advisor_name", `%${escapeLike(search)}%`);

  const { data, count } = await query
    .order("engagement_score", { ascending: true, nullsFirst: true })
    .order("advisor_name", { ascending: true })
    .range(0, limit - 1);

  const rows: AdvisorRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    rooftopId: r.rooftop_id as string,
    rooftopName: (r.rooftop_name as string) ?? "Rooftop",
    advisorName: (r.advisor_name as string) ?? "Advisor",
    score: r.engagement_score == null ? null : Number(r.engagement_score),
    band: (r.band as EngagementBand) ?? "nudge",
    daysLoggedIn: Number(r.days_logged_in ?? 0),
    workingDays: Number(r.working_days ?? 0),
    loginRatePct: r.login_rate_pct == null ? null : Number(r.login_rate_pct),
    watchRatePct: r.watch_rate_pct == null ? null : Number(r.watch_rate_pct),
  }));

  return { rows, total: Number(count ?? rows.length) };
}

/** One rooftop's headline, for the drill-down page. */
export async function loadRooftopSummary(
  client: Client,
  rooftopId: string
): Promise<RooftopRow | null> {
  const { data } = await client
    .from("admin_rooftop_engagement")
    .select("rooftop_id, rooftop_name, avg_score, band, advisor_count, nudge_count")
    .eq("rooftop_id", rooftopId)
    .maybeSingle();

  if (!data) return null;
  return {
    rooftopId: data.rooftop_id as string,
    rooftopName: (data.rooftop_name as string) ?? "Rooftop",
    avgScore: data.avg_score == null ? null : Number(data.avg_score),
    band: (data.band as EngagementBand) ?? "nudge",
    advisorCount: Number(data.advisor_count ?? 0),
    nudgeCount: Number(data.nudge_count ?? 0),
  };
}

/** Clamp a ?show= param so the ceiling can't be talked around. */
export function resolveLimit(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return LIST_PAGE_SIZE;
  return Math.min(Math.max(LIST_PAGE_SIZE, Math.floor(value)), LIST_MAX);
}

export function parseBand(raw: string | undefined): EngagementBand | null {
  return raw === "engaged" || raw === "building" || raw === "nudge" ? raw : null;
}
