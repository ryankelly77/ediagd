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

/**
 * The period to measure this rooftop on: latest complete, else latest partial.
 *
 * TWO QUERIES RATHER THAN ONE SORT, deliberately. `order('is_partial').order(
 * 'ends_on')` would express the same preference in one round trip and would
 * also silently return a complete period from six months ago in preference to
 * last month's partial — which is a different and worse rule. Asking for a
 * complete one and then falling back says what it means.
 *
 * `columns` is passed in so a caller that renders a label can ask for the label
 * columns without this module knowing what a label is.
 */
export async function loadMeasurementPeriod(
  client: Client,
  rooftopId: string,
  columns = "id, starts_on, ends_on, is_partial"
): Promise<MeasurementPeriod | null> {
  const base = () =>
    client
      .from("perf_period")
      .select(columns)
      .eq("rooftop_id", rooftopId)
      .is("superseded_at", null)
      .order("ends_on", { ascending: false })
      .limit(1);

  const { data: complete } = await base().eq("is_partial", false).maybeSingle();
  if (complete) {
    return {
      id: complete.id as string,
      row: complete as Record<string, unknown>,
      isPartial: false,
    };
  }

  const { data: partial } = await base().maybeSingle();
  if (!partial) return null;

  return {
    id: partial.id as string,
    row: partial as Record<string, unknown>,
    isPartial: Boolean(partial.is_partial),
  };
}
