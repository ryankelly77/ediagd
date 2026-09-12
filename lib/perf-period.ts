/* ============================================================================
   EDIAGD — which period an advisor is measured on

   ---------------------------------------------------------------------------
   A PARTIAL MONTH IS NOT A MONTH
   ---------------------------------------------------------------------------
   `perf_period.is_partial` has existed since the daily feed landed, and two
   readers already respect it: lib/period-label.ts writes "August 2026 (partial)
   — 8 of 31 days" onto every figure, and lib/advisor-trend.ts refuses to
   compare against a partial point. The two readers that MOVE NUMBERS did not.

   Both took `order('ends_on').limit(1)` and got whatever was newest. On the
   first of September that is August with eight days in it, for all eleven
   rooftops — and at Doggett CDJR those eight days carry an average of 18 ROs
   against July's 139, so half the store falls under the 20-RO coaching floor
   and gets no pick and no status dots at all. The ones above it have their
   attach rates AND the store benchmark computed from a third of a month, and
   /today then opens a SIX-DAY coaching block on the result — a block that
   outlives the arrival of the complete file.

   So: the latest COMPLETE period wins. A partial one is used only when there is
   no complete period at all, which is a rooftop's first month and a real state
   the screens must still render — labelled, and with no block opened from it.

   `superseded_at` is filtered here for the same reason. A monthly period that
   the daily feed has since covered in full is retired rather than deleted, and
   selecting one would show numbers a newer source has already replaced.
   ============================================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export type MeasurementPeriod = {
  id: string;
  /** The whole row, for callers that render a label from it. */
  row: Record<string, unknown>;
  /**
   * True when no complete period exists and this is the best available.
   * Callers must not open a coaching block from one — see ensureBlockForToday.
   */
  isPartial: boolean;
};

/** A period row as the chooser needs to see it. */
type PeriodRow = {
  id?: unknown;
  ends_on?: unknown;
  is_partial?: unknown;
  rooftop_id?: unknown;
} & Record<string, unknown>;

/**
 * THE RULE, ONCE: latest complete, else latest of anything.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT TWO QUERIES ANY MORE
 * ---------------------------------------------------------------------------
 * It used to be expressed as "ask for a complete one, then ask again without
 * that filter" — two round trips, which read well and said exactly what it
 * meant. The cost only became visible once /today was measured: Eddie's Pick
 * was four sequential round trips and ~800ms, and two of them were this.
 *
 * The preference is UNCHANGED and still not a sort. `order('is_partial')
 * .order('ends_on')` would return a complete period from six months ago in
 * preference to last month's partial, which is a different and worse rule.
 * This picks the newest complete one if any complete one exists, and only then
 * falls back to the newest of anything — which is the same two-step preference,
 * applied to rows already in hand instead of to two queries.
 *
 * Ties on ends_on break on id, so the answer cannot move between page loads.
 * Postgres's `limit 1` had no tiebreak at all.
 */
function chooseMeasurementPeriod<T extends PeriodRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const newestFirst = [...rows].sort((a, b) => {
    const byEnd = String(b.ends_on ?? "").localeCompare(String(a.ends_on ?? ""));
    return byEnd !== 0 ? byEnd : String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  return newestFirst.find((r) => r.is_partial === false) ?? newestFirst[0];
}

/**
 * The period to measure this rooftop on: latest complete, else latest partial.
 *
 * `columns` is passed in so a caller that renders a label can ask for the label
 * columns without this module knowing what a label is.
 */
export async function loadMeasurementPeriod(
  client: Client,
  rooftopId: string,
  columns = "id, starts_on, ends_on, is_partial",
  /**
   * The advisor's operator id, when the caller has one.
   *
   * ---------------------------------------------------------------------------
   * WHY THE ROOFTOP'S ANSWER IS NOT ALWAYS THE ADVISOR'S
   * ---------------------------------------------------------------------------
   * "Latest complete period at this rooftop" is the right rule and the wrong
   * grain. An operator who only appears in a newer PARTIAL file has no rows in
   * the store's latest complete month, so the screens resolve a period, find
   * nothing in it, and render "no performance period" — while labelled partial
   * data for that person sits one month later.
   *
   * That is not hypothetical: operator 671 exists only in the part-month August
   * file, so Mitch's own account reads as unmeasured. Every mid-month hire has
   * the same first few weeks.
   *
   * So the preference is unchanged — complete beats partial — and it is applied
   * to the periods THIS ADVISOR HAS ROWS IN. Without an operator id the
   * behaviour is exactly as before, which is what the manager and admin screens
   * want.
   */
  advisorOpId?: string | null
): Promise<MeasurementPeriod | null> {
  const base = () =>
    client
      .from("perf_period")
      .select(columns)
      .eq("rooftop_id", rooftopId)
      .is("superseded_at", null)
      .order("ends_on", { ascending: false })
      .limit(1);

  /* No operator: the rooftop's own latest, as before. */
  if (!advisorOpId) {
    const { data: complete } = await base().eq("is_partial", false).maybeSingle();
    if (complete) {
      return { id: complete.id as string, row: complete as Record<string, unknown>, isPartial: false };
    }
    const { data: partial } = await base().maybeSingle();
    if (!partial) return null;
    return {
      id: partial.id as string,
      row: partial as Record<string, unknown>,
      isPartial: Boolean(partial.is_partial),
    };
  }

  /*
   * The periods this operator actually has totals in, and the periods
   * themselves, in ONE round trip — rather than asking the rooftop for a period
   * and hoping the advisor is in it.
   */
  const found = await loadAdvisorPeriodWithTotals(client, rooftopId, advisorOpId, columns);
  return found?.period ?? null;
}

/** The advisor's own totals for the period they are measured on. */
export type AdvisorPeriodTotals = {
  periodId: string;
  rooftopId: string;
  totalRos: number;
  totalLaborSales: number;
};

/**
 * The advisor's measurement period AND their totals in it — one round trip.
 *
 * ---------------------------------------------------------------------------
 * THIS EXISTS BECAUSE THREE QUERIES WERE ASKING ONE QUESTION
 * ---------------------------------------------------------------------------
 * loadAdvisorDay used to do this in three sequential hops: fetch the period
 * ids this operator has rows in, fetch the newest complete period among them,
 * then fetch that period's totals row. Each is small — the advisor has twenty
 * periods, all of it under 300 rows — and each cost a full round trip. Measured
 * against the live database: 281ms, 162ms, 119ms, for data that arrives in
 * 126ms when asked for together.
 *
 * PostgREST can embed perf_period from advisor_period_totals even though both
 * are views, so the join the three queries were doing by hand happens in the
 * database, and the preference is then applied by chooseMeasurementPeriod to
 * rows already in memory. Same rule, same answer, one trip.
 *
 * The totals come back for free: they are columns on the row the period was
 * chosen from, which is precisely why the third query was redundant. Reading
 * them from that row also closes a gap — the old code chose a period and then
 * fetched totals for it in a separate query, so a period that was superseded
 * between the two reads could hand back a period and totals that disagreed.
 *
 * Still the USER's client, so the entitlement RLS on both views decides what is
 * visible. Nothing here widens what an advisor can see.
 */
export async function loadAdvisorPeriodWithTotals(
  client: Client,
  rooftopId: string,
  advisorOpId: string,
  columns = "id, starts_on, ends_on, is_partial"
): Promise<{ period: MeasurementPeriod; totals: AdvisorPeriodTotals } | null> {
  /* The chooser needs these three whatever the caller asked for, and asking
     for a column twice is an error rather than a no-op. */
  const embedded = [
    ...new Set([
      ...columns.split(",").map((c) => c.trim()).filter(Boolean),
      "id",
      "ends_on",
      "is_partial",
      "rooftop_id",
      "superseded_at",
    ]),
  ].join(", ");

  const { data } = await client
    .from("advisor_period_totals")
    .select(
      `period_id, rooftop_id, total_ros, total_labor_sales, perf_period!inner(${embedded})`
    )
    .eq("advisor_op_id", advisorOpId)
    .eq("rooftop_id", rooftopId)
    /* Filtered on the EMBEDDED column, which is what !inner makes possible: a
       superseded period drops the whole row rather than arriving with a null
       hanging off it. Same reason as the header note — a monthly period the
       daily feed has since covered in full would otherwise show numbers a
       newer source has already replaced. */
    .is("perf_period.superseded_at", null);

  type Row = {
    period_id: string;
    rooftop_id: string;
    total_ros: number | null;
    total_labor_sales: number | null;
    perf_period: PeriodRow | null;
  };

  /* The rooftop is checked on BOTH sides. The query filters the totals view's
     rooftop; this filters the period's. The two-query version happened to
     check each separately and they must not be allowed to drift apart. */
  const rows = ((data ?? []) as Row[]).filter(
    (r) => r.perf_period && r.perf_period.rooftop_id === rooftopId
  );
  if (rows.length === 0) return null;

  const chosen = chooseMeasurementPeriod(
    rows.map((r) => ({ ...r.perf_period!, __row: r }))
  );
  if (!chosen) return null;

  const row = (chosen as { __row: Row }).__row;
  const { __row, ...periodRow } = chosen as Record<string, unknown> & { __row: Row };
  void __row;

  return {
    period: {
      id: row.period_id,
      row: periodRow,
      isPartial: Boolean(periodRow.is_partial),
    },
    totals: {
      periodId: row.period_id,
      rooftopId: row.rooftop_id,
      totalRos: Number(row.total_ros ?? 0),
      totalLaborSales: Number(row.total_labor_sales ?? 0),
    },
  };
}
