/* ============================================================================
   EDIAGD — the dealer group, as one thing
   SERVER ONLY (takes a Supabase client).

   WHAT WAS MISSING. Authority reached the group in 0045, but no screen did.
   /manager shows one store because a manager runs one store; /admin/engagement
   answers "is anybody using the app", which is a different question from "how
   is the group trading". A principal with eleven rooftops had nowhere to see
   eleven rooftops.

   SCOPED BY ORG, DELIBERATELY — and my first attempt got this wrong.

   I originally scoped it to "every rooftop the caller can see", reasoning that
   RLS already answers the question. It does not: a platform owner can see
   every rooftop in the database, so "Your group" rendered 111 stores — the
   eleven Doggett rooftops plus a hundred demo ones — under a heading claiming
   they were the viewer's group.

   "Your group" has to mean an ORG, so the org is what it asks for: the orgs
   where the caller holds a group grant, falling back to the orgs of the
   rooftops they hold a membership at. RLS still applies underneath and remains
   the security boundary; this narrowing is about the question the screen
   claims to answer.

   THE PERIOD IS CHOSEN ONCE, FOR THE WHOLE GROUP. Comparing a store's finished
   July against another's part-finished August would be meaningless, so every
   store is reported on the same month, and a store missing that month is shown
   as missing rather than as a zero.
   ============================================================================ */

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type StoreTrend = {
  /** Worked days matched on both sides. */
  workedDays: number;
  currentSales: number;
  priorSales: number;
  currentRos: number;
  priorRos: number;
  salesDiff: number;
  rosDiff: number;
  direction: "up" | "flat" | "down";
  /** The prior period ran out of worked days first; it was used in full. */
  priorExhausted: boolean;
};

export type GroupStore = {
  rooftopId: string;
  name: string;
  /** Null when this store has no period for the chosen month. */
  periodId: string | null;
  advisors: number;
  totalRos: number;
  totalLaborSales: number;
  /** Weighted across the store, not an average of advisor averages. */
  blendedElr: number | null;
  laborPerRo: number | null;
  /** Null when there is no comparable prior period. */
  trend: StoreTrend | null;
};

export type GroupMonth = {
  startsOn: string;
  label: string;
  isPartial: boolean;
  ros: number;
  laborSales: number;
  /** Stores contributing that month — a step here is not performance. */
  rooftops: number;
};

export type GroupView = {
  /**
   * What the group is actually called. "Your group" is what you write when you
   * do not know; the org row has known all along.
   */
  groupName: string;
  /** The month every store is reported on. */
  monthLabel: string;
  monthStart: string;
  isPartial: boolean;
  stores: GroupStore[];
  totals: {
    stores: number;
    reporting: number;
    advisors: number;
    ros: number;
    laborSales: number;
    blendedElr: number | null;
    /**
     * The group's own movement — the sum of each store's matched window, not a
     * comparison of two whole months. Stores with no prior period are absent
     * from both sides, so the total cannot be flattered by a store that simply
     * did not exist last month.
     */
    trend: StoreTrend | null;
  };
  /** Months available to switch between, newest first. */
  months: { startsOn: string; label: string; isPartial: boolean }[];
  /** The full series, oldest first, for the sparkline. */
  series: GroupMonth[];
  /** The month the trend compares against, for the screen to name. */
  comparedToLabel: string | null;
};

/**
 * The same flat band the advisor trend uses. If the two drifted, a store could
 * read "level" on one screen and "up" on another for the identical numbers.
 */
const FLAT_BAND = { money: 50, ros: 1 };

/**
 * Every store the caller runs, on one month.
 *
 * Three bounded reads: the caller's periods, the advisor totals for the chosen
 * month, and the rooftop names. Nothing scans daily data.
 */
export async function loadGroupView(
  client: Client,
  userId: string,
  monthStart?: string | null
): Promise<GroupView | null> {
  // ---- which org(s) is this person's group? -------------------------------
  const { data: orgGrants } = await client
    .from("org_membership")
    .select("org_id")
    .eq("user_id", userId)
    .eq("active", true);

  let orgIds = [
    ...new Set(((orgGrants ?? []) as { org_id: string }[]).map((g) => g.org_id)),
  ];

  // No group grant: fall back to the orgs behind the rooftops they work at, so
  // a multi-store manager still gets a coherent screen.
  if (orgIds.length === 0) {
    const { data: mem } = await client
      .from("membership")
      .select("rooftop:rooftop_id(org_id)")
      .eq("user_id", userId)
      .eq("active", true);
    orgIds = [
      ...new Set(
        ((mem ?? []) as { rooftop: { org_id: string } | null }[])
          .map((m) => m.rooftop?.org_id)
          .filter(Boolean) as string[]
      ),
    ];
  }
  if (orgIds.length === 0) return null;

  const [{ data: orgRooftops }, { data: orgRows }] = await Promise.all([
    client.from("rooftop").select("id, name").in("org_id", orgIds),
    client.from("org").select("id, name").in("id", orgIds),
  ]);

  const orgNames = ((orgRows ?? []) as { id: string; name: string }[]).map((o) => o.name);
  // One org: use its name. Several: no single name is truthful, so fall back.
  const groupName = orgNames.length === 1 ? orgNames[0]! : "Your group";

  const scope = (orgRooftops ?? []) as { id: string; name: string }[];
  if (scope.length === 0) return null;
  const scopeIds = scope.map((r) => r.id);

  const { data: periodRows } = await client
    .from("perf_period")
    .select("id, rooftop_id, label, starts_on, is_partial, source_kind")
    .in("rooftop_id", scopeIds)
    .order("starts_on", { ascending: false });

  const periods = (periodRows ?? []) as Record<string, unknown>[];
  if (periods.length === 0) return null;

  // Months, newest first, deduped by start date.
  const byMonth = new Map<string, { label: string; isPartial: boolean }>();
  for (const p of periods) {
    const key = String(p.starts_on);
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        label: (p.label as string) ?? key,
        isPartial: Boolean(p.is_partial),
      });
    }
  }
  const months = [...byMonth.entries()]
    .map(([startsOn, m]) => ({ startsOn, ...m }))
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));

  // `??` would not catch an empty-string month param — only null/undefined —
  // so the fallback is explicit.
  const requested = monthStart
    ? months.find((m) => m.startsOn === monthStart)
    : undefined;
  const chosen = requested ?? months[0]!;

  const inMonth = periods.filter((p) => String(p.starts_on) === chosen.startsOn);
  const periodIds = inMonth.map((p) => String(p.id));

  const { data: totalRows } = await client
    .from("advisor_period_totals")
    .select("period_id, rooftop_id, advisor_op_id, total_ros, total_labor_sales")
    .in("period_id", periodIds);

  const nameById = new Map(scope.map((r) => [r.id, r.name]));

  // FRHs are not on the totals view, so ELR is derived from money per RO rather
  // than money per hour here — labelled accordingly on the screen so it is not
  // mistaken for the blended ELR an advisor sees.
  const acc = new Map<
    string,
    { advisors: Set<string>; ros: number; sales: number; periodId: string }
  >();
  for (const p of inMonth) {
    acc.set(String(p.rooftop_id), {
      advisors: new Set(),
      ros: 0,
      sales: 0,
      periodId: String(p.id),
    });
  }
  for (const t of (totalRows ?? []) as Record<string, unknown>[]) {
    const a = acc.get(String(t.rooftop_id));
    if (!a) continue;
    a.advisors.add(String(t.advisor_op_id));
    a.ros += Number(t.total_ros ?? 0);
    a.sales += Number(t.total_labor_sales ?? 0);
  }

  const stores: GroupStore[] = [...acc.entries()]
    .map(([rooftopId, a]) => ({
      rooftopId,
      name: nameById.get(rooftopId) ?? "Rooftop",
      periodId: a.periodId,
      advisors: a.advisors.size,
      totalRos: a.ros,
      totalLaborSales: a.sales,
      blendedElr: null,
      laborPerRo: a.ros > 0 ? a.sales / a.ros : null,
      trend: null as StoreTrend | null,
    }))
    .sort((x, y) => y.totalLaborSales - x.totalLaborSales);

  // ---- per-store movement, on matched worked days ------------------------
  // One RPC: aggregating in Postgres avoids reading ~5,800 daily rows through
  // an API that caps a select at 1,000.
  const { data: trendRows } = await client.rpc("group_store_trend", {
    _month: chosen.startsOn,
    _compare_to: null,
  });

  const trendById = new Map<string, StoreTrend>();
  for (const t of (trendRows ?? []) as Record<string, unknown>[]) {
    const currentSales = Number(t.current_sales ?? 0);
    const priorSales = Number(t.prior_sales ?? 0);
    const currentRos = Number(t.current_ros ?? 0);
    const priorRos = Number(t.prior_ros ?? 0);
    const salesDiff = currentSales - priorSales;
    // No prior activity at all is not "down" — there is nothing to be down from.
    if (priorSales === 0 && priorRos === 0) continue;
    trendById.set(String(t.rooftop_id), {
      workedDays: Number(t.worked_days ?? 0),
      currentSales,
      priorSales,
      currentRos,
      priorRos,
      salesDiff,
      rosDiff: currentRos - priorRos,
      direction:
        Math.abs(salesDiff) <= FLAT_BAND.money
          ? "flat"
          : salesDiff > 0
            ? "up"
            : "down",
      priorExhausted: Boolean(t.prior_exhausted),
    });
  }
  for (const s of stores) s.trend = trendById.get(s.rooftopId) ?? null;

  // The month the comparison landed on — the one before the chosen month, when
  // it exists in the data at all.
  const priorIdx = months.findIndex((m) => m.startsOn === chosen.startsOn) + 1;
  const comparedToLabel =
    trendById.size > 0 && months[priorIdx] ? months[priorIdx].label : null;

  // The month-by-month line. Aggregated in Postgres — see 0050 for why.
  const { data: seriesRows } = await client.rpc("group_month_totals", {
    _rooftop_ids: scopeIds,
  });
  const series: GroupMonth[] = ((seriesRows ?? []) as Record<string, unknown>[])
    .map((r) => ({
      startsOn: String(r.starts_on),
      label: (r.label as string) ?? String(r.starts_on),
      isPartial: Boolean(r.is_partial),
      ros: Number(r.ros ?? 0),
      laborSales: Number(r.labor_sales ?? 0),
      rooftops: Number(r.rooftops ?? 0),
    }))
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));

  const withTrend = stores.filter((s) => s.trend);
  const groupTrend: StoreTrend | null = withTrend.length
    ? (() => {
        const cur = withTrend.reduce((n, s) => n + s.trend!.currentSales, 0);
        const pri = withTrend.reduce((n, s) => n + s.trend!.priorSales, 0);
        const curR = withTrend.reduce((n, s) => n + s.trend!.currentRos, 0);
        const priR = withTrend.reduce((n, s) => n + s.trend!.priorRos, 0);
        const diff = cur - pri;
        return {
          // Worked days vary by store, so the group figure is the widest window
          // any store contributed rather than a fictional single number.
          workedDays: Math.max(...withTrend.map((s) => s.trend!.workedDays)),
          currentSales: cur,
          priorSales: pri,
          currentRos: curR,
          priorRos: priR,
          salesDiff: diff,
          rosDiff: curR - priR,
          direction:
            Math.abs(diff) <= FLAT_BAND.money ? "flat" : diff > 0 ? "up" : "down",
          priorExhausted: withTrend.some((s) => s.trend!.priorExhausted),
        } as StoreTrend;
      })()
    : null;

  const ros = stores.reduce((n, s) => n + s.totalRos, 0);
  const sales = stores.reduce((n, s) => n + s.totalLaborSales, 0);

  return {
    groupName,
    monthLabel: chosen.label,
    monthStart: chosen.startsOn,
    isPartial: chosen.isPartial,
    stores,
    totals: {
      stores: stores.length,
      reporting: stores.filter((s) => s.totalRos > 0).length,
      advisors: stores.reduce((n, s) => n + s.advisors, 0),
      ros,
      laborSales: sales,
      blendedElr: ros > 0 ? sales / ros : null,
      trend: groupTrend,
    },
    months,
    series,
    comparedToLabel,
  };
}
