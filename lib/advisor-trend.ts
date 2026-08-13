/* ============================================================================
   EDIAGD — an advisor against their own last month
   SERVER ONLY (takes a Supabase client).

   THE COMPETITION IS YESTERDAY. The brand's whole position is that an advisor
   is measured against themselves, not ranked against the person at the next
   desk, so every comparison here is same-advisor, month over month. Nothing in
   this file can produce a leaderboard.

   ---------------------------------------------------------------------------
   THE PARTIAL-MONTH RULE, WHICH IS THE ONLY HARD PART
   ---------------------------------------------------------------------------
   August holds 1–10. Comparing its $8,080 against a complete July's $45,488
   would report a 82% collapse every single month, for every advisor, purely as
   an artefact of the calendar. So a partial month is compared over the SAME
   WINDOW: Aug 1–10 against Jul 1–10, actual numbers on both sides.

   NOT a run-rate and not a projection. "You're on pace for $25,000" is a
   forecast dressed as a fact, and it is wrong most of the month — the last
   week of a month does not look like the first. Two real windows, or nothing.

   MATCHED ON WORKED DAYS, NOT ON THE CALENDAR. Aug 1–10 holds six worked days
   and Jul 1–10 holds seven, so a calendar window compares six days of effort
   against seven and then has to explain itself. Comparing the N days worked so
   far against the FIRST N days worked last month makes both sides equal by
   construction, and the caveat disappears.

   The numbers come from dms_daily_advisor_total, the only place day-level truth
   exists — so the comparison is only available where BOTH months came from the
   daily Dynatron feed.

   ---------------------------------------------------------------------------
   CROSS-FORMAT COMPARISONS ARE REFUSED
   ---------------------------------------------------------------------------
   June arrived as the old OpCode Analysis export; July and August come from the
   daily Dynatron feed. The two reports do not necessarily scope the same work,
   so June → July movement could be a change in what the report counts rather
   than a change in what the advisor did.

   Both things are done about it: the trend REFUSES to compute across a format
   boundary (and says why), and the history CHART MARKS the boundary so a step
   in the bars is visibly a change of source, not a change of performance.
   Excluding it silently would leave the same misleading step in the chart.
   ============================================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export type MonthPoint = {
  periodId: string;
  label: string;
  startsOn: string;
  isPartial: boolean;
  daysCovered: number | null;
  lastDayCovered: string | null;
  /** 'dynatron' (daily feed), 'opcode' (older export), or 'monthly' (seed). */
  sourceKind: string;
  ros: number;
  laborSales: number;
};

export type Delta = {
  /** Current minus prior, in the unit of the metric. */
  diff: number;
  direction: "up" | "flat" | "down";
};

export type Comparison = {
  /** 'full' = whole month vs whole month. 'worked-days' = matched effort. */
  basis: "full" | "worked-days";
  /**
   * Worked days on each side of a 'worked-days' comparison — equal by
   * construction, which is the point of the basis.
   *
   * The earlier version matched the CALENDAR window (Aug 1–10 vs Jul 1–10) and
   * had to disclose that one side held six worked days and the other seven. A
   * day is the unit an advisor actually works, so matching on worked days
   * removes the caveat rather than explaining it.
   */
  workedDays: number | null;
  /**
   * Set when the prior month ran out of worked days before N was reached, so
   * the whole of it was used. Labelled rather than extrapolated: inventing the
   * missing days would be a forecast, and this file does not forecast.
   */
  priorWasFullMonth: boolean;
  currentLabel: string;
  priorLabel: string;
  laborSales: { current: number; prior: number } & Delta;
  ros: { current: number; prior: number } & Delta;
};

export type AdvisorTrend = {
  points: MonthPoint[];
  current: MonthPoint | null;
  /** The most recent COMPLETE month — what coaching should be based on. */
  lastComplete: MonthPoint | null;
  comparison: Comparison | null;
  /** Why there is no comparison, when there isn't one. */
  noComparisonReason: string | null;
  /** True when the history spans more than one report format. */
  hasFormatBoundary: boolean;
};

/**
 * The daily feed, under either name it has had.
 *
 * 0041 renames source_kind 'dms_daily' -> 'dynatron'. Code and migrations do
 * not land at the same instant, and a screen that silently refuses to compare
 * anything in the gap is exactly the failure this session already had once —
 * so both names are accepted rather than assuming an ordering.
 */
const isDailyFeed = (kind: string) => kind === "dynatron" || kind === "dms_daily";

/**
 * Do two months come from the same report?
 *
 * Compared through isDailyFeed so a July written before the rename and an
 * August written after it are not treated as a format boundary — that would
 * refuse a perfectly good comparison and blame it on June.
 */
function sameFormat(a: string, b: string): boolean {
  if (isDailyFeed(a) && isDailyFeed(b)) return true;
  return a === b;
}

/** Treats a difference inside this band as flat rather than movement. */
const FLAT_BAND = { money: 50, ros: 1 };

function delta(current: number, prior: number, band: number): Delta {
  const diff = current - prior;
  if (Math.abs(diff) <= band) return { diff, direction: "flat" };
  return { diff, direction: diff > 0 ? "up" : "down" };
}

/**
 * Every month this advisor has at this rooftop, plus the comparison.
 *
 * Bounded by construction: periods for one rooftop, totals for one advisor, and
 * — only when a partial comparison is possible — the daily rows for two months.
 * Nothing here scans the daily table across rooftops.
 */
export async function loadAdvisorTrend(
  client: Client,
  opCodeId: string,
  rooftopId: string
): Promise<AdvisorTrend> {
  const empty: AdvisorTrend = {
    points: [],
    current: null,
    lastComplete: null,
    comparison: null,
    noComparisonReason: null,
    hasFormatBoundary: false,
  };

  const { data: periodRows } = await client
    .from("perf_period")
    .select("id, label, starts_on, is_partial, days_covered, last_day_covered, source_kind")
    .eq("rooftop_id", rooftopId)
    .order("starts_on", { ascending: true });

  const periods = (periodRows ?? []) as Record<string, unknown>[];
  if (periods.length === 0) return empty;

  const { data: totalRows } = await client
    .from("advisor_period_totals")
    .select("period_id, total_ros, total_labor_sales")
    .eq("advisor_op_id", opCodeId)
    .eq("rooftop_id", rooftopId);

  const totals = new Map<string, { ros: number; laborSales: number }>();
  for (const t of (totalRows ?? []) as Record<string, unknown>[]) {
    totals.set(String(t.period_id), {
      ros: Number(t.total_ros ?? 0),
      laborSales: Number(t.total_labor_sales ?? 0),
    });
  }

  // Only months this advisor actually worked. A month they were not there for
  // is not a zero — it is not their month, and a zero bar would read as a
  // catastrophic month rather than an absence.
  const points: MonthPoint[] = periods
    .filter((p) => totals.has(String(p.id)))
    .map((p) => {
      const t = totals.get(String(p.id))!;
      return {
        periodId: String(p.id),
        label: (p.label as string) ?? "",
        startsOn: String(p.starts_on),
        isPartial: Boolean(p.is_partial),
        daysCovered: p.days_covered == null ? null : Number(p.days_covered),
        lastDayCovered: (p.last_day_covered as string | null) ?? null,
        sourceKind: String(p.source_kind ?? "monthly"),
        ros: t.ros,
        laborSales: t.laborSales,
      };
    });

  if (points.length === 0) return empty;

  const current = points[points.length - 1]!;
  const prior = points.length > 1 ? points[points.length - 2]! : null;
  const lastComplete = [...points].reverse().find((p) => !p.isPartial) ?? null;
  const hasFormatBoundary = new Set(points.map((p) => p.sourceKind)).size > 1;

  const base = { points, current, lastComplete, hasFormatBoundary };

  if (!prior) {
    return {
      ...base,
      comparison: null,
      noComparisonReason: "This is the first month we have for you.",
    };
  }

  // ---- the format guard, before any arithmetic ---------------------------
  if (!sameFormat(prior.sourceKind, current.sourceKind)) {
    return {
      ...base,
      comparison: null,
      /*
       * FINAL, NOT "YET". June sits between two Dynatron runs — Apr, May then
       * Jul, Aug — so it is a permanent island. "Next month will be comparable"
       * was true when June was the oldest month we had; it is now a promise
       * that can never come due, on either side of the boundary.
       */
      noComparisonReason: `${prior.label} came from a different report format, so it can’t be compared to the months around it.`,
    };
  }

  // ---- complete month: straight comparison -------------------------------
  if (!current.isPartial) {
    return {
      ...base,
      noComparisonReason: null,
      comparison: {
        basis: "full",
        workedDays: null,
        priorWasFullMonth: false,
        currentLabel: current.label,
        priorLabel: prior.label,
        laborSales: {
          current: current.laborSales,
          prior: prior.laborSales,
          ...delta(current.laborSales, prior.laborSales, FLAT_BAND.money),
        },
        ros: {
          current: current.ros,
          prior: prior.ros,
          ...delta(current.ros, prior.ros, FLAT_BAND.ros),
        },
      },
    };
  }

  // ---- partial month: match WORKED DAYS ----------------------------------
  // N days worked so far this month against the FIRST N days worked last
  // month. Equal effort on both sides, so no day-count caveat is needed.
  if (!isDailyFeed(current.sourceKind)) {
    return {
      ...base,
      comparison: null,
      noComparisonReason:
        "This month isn’t finished, and we don’t have day-level history to line it up against yet.",
    };
  }

  const { data: dailyRows } = await client
    .from("dms_daily_advisor_total")
    .select("report_date, unique_ros, labor_sales")
    .eq("rooftop_id", rooftopId)
    .eq("advisor_op_id", opCodeId)
    .gte("report_date", prior.startsOn)
    .lte("report_date", current.lastDayCovered ?? current.startsOn)
    .order("report_date", { ascending: true });

  type Day = { date: string; ros: number; sales: number };
  const currentDays: Day[] = [];
  const priorDays: Day[] = [];

  for (const r of (dailyRows ?? []) as Record<string, unknown>[]) {
    const date = String(r.report_date);
    const day: Day = {
      date,
      ros: Number(r.unique_ros ?? 0),
      sales: Number(r.labor_sales ?? 0),
    };
    // A day with no activity is not a worked day, and padding with zeroes
    // would make "first N worked days" mean something else entirely.
    if (day.ros === 0 && day.sales === 0) continue;
    if (date >= current.startsOn) currentDays.push(day);
    else if (date >= prior.startsOn) priorDays.push(day);
  }

  const n = currentDays.length;
  if (n === 0) {
    return {
      ...base,
      comparison: null,
      noComparisonReason: `Nothing recorded yet this month to compare with ${prior.label}.`,
    };
  }
  if (priorDays.length === 0) {
    return {
      ...base,
      comparison: null,
      noComparisonReason: `No ${prior.label} activity to line this up against.`,
    };
  }

  // If they worked more days by now than they did in the whole of last month,
  // the honest comparison is against all of last month, said out loud.
  const priorWasFullMonth = priorDays.length < n;
  const priorSlice = priorWasFullMonth ? priorDays : priorDays.slice(0, n);

  const sum = (days: Day[]) => ({
    ros: days.reduce((t, d) => t + d.ros, 0),
    sales: days.reduce((t, d) => t + d.sales, 0),
  });
  const cur = sum(currentDays);
  const pri = sum(priorSlice);

  return {
    ...base,
    noComparisonReason: null,
    comparison: {
      basis: "worked-days",
      workedDays: n,
      priorWasFullMonth,
      currentLabel: current.label,
      priorLabel: prior.label,
      laborSales: {
        current: cur.sales,
        prior: pri.sales,
        ...delta(cur.sales, pri.sales, FLAT_BAND.money),
      },
      ros: { current: cur.ros, prior: pri.ros, ...delta(cur.ros, pri.ros, FLAT_BAND.ros) },
    },
  };
}
