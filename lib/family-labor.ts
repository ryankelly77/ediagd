/* ============================================================================
   EDIAGD — per-family dollars, read one way by every screen

   Eddie's Pick ranks by `opportunity ?? missedRos` (see rank() in
   lib/advisor.ts). `opportunity` exists only when buildServiceFamilies is given
   a labor-per-RO map, so whoever forgets to pass one silently gets a DIFFERENT
   ranking — not an error, just a different answer. That is how the advisor page
   and the manager's team view came to disagree about the same advisor's biggest
   opportunity.

   So the map is loaded here, from advisor_family_labor (0055), which resolves
   family through the same chain as advisor_family_attach. Both callers-with-one
   -advisor and the manager's whole-roster case are covered, because the manager
   needs the same numbers for thirty people without thirty round-trips.

   RETURNS undefined, NOT an empty object, when there is nothing readable.
   advisor_op_metric is RLS-gated and the view is security-invoker, so a caller
   without access gets nothing — and `undefined` is what makes buildServiceFamilies
   fall back to missed ROs. An empty object would instead assert "every family
   earned zero", which ranks every opportunity at 0 and quietly flattens the
   pick order.
   ============================================================================ */

/** Structural, matching the loose client type the data loaders already use. */
type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

type LaborRow = {
  advisor_op_id: string;
  family: string;
  labor_per_ro: number | string | null;
};

/*
 * ---- ZERO IS NOT AN AMOUNT OF MONEY, IT IS THE ABSENCE OF A FIGURE ---------
 *
 * `labor_per_ro = 0` means the DMS recorded ROs in that family and no labor
 * dollars against them — warranty and internal work, or sales landing under a
 * different op code. 540 of 16,379 rows are in that state today.
 *
 * Copying the 0 through was the bug. rank() in lib/advisor.ts is
 * `opportunity ?? missedRos`, so a family with a NUMBER gets ranked on
 * `missedRos * 0` and a family with no number falls back to missedRos — which
 * means a real gap scores 0 and is beaten by any family with a dollar to its
 * name. Wipers is 4,263 ROs behind store average across 27 advisor-periods and
 * could never win the pick.
 *
 * The header above already draws this distinction for the map as a whole:
 * undefined rather than {} so buildServiceFamilies falls back rather than
 * asserting every family earned zero. This is the same sentence one level down,
 * per family.
 */
function toMap(rows: LaborRow[]): Record<string, number> | undefined {
  const perRo: Record<string, number> = {};
  for (const r of rows) {
    if (r.labor_per_ro == null) continue;
    const v = Number(r.labor_per_ro);
    if (Number.isFinite(v) && v > 0) perRo[String(r.family)] = v;
  }
  return Object.keys(perRo).length > 0 ? perRo : undefined;
}

/**
 * Labor-per-RO by family for ONE advisor in one period.
 */
export async function loadLaborPerRo(
  client: Client,
  periodId: string,
  advisorOpId: string
): Promise<Record<string, number> | undefined> {
  const { data, error } = await client
    .from("advisor_family_labor")
    .select("advisor_op_id, family, labor_per_ro")
    .eq("period_id", periodId)
    .eq("advisor_op_id", advisorOpId);

  if (error || !data) return undefined;
  return toMap(data as LaborRow[]);
}

/**
 * Labor-per-RO by family for EVERY advisor at a rooftop in one period, keyed by
 * advisor_op_id.
 *
 * One query for the whole roster. The manager view builds a summary per advisor
 * and would otherwise issue one round-trip per person on every page load.
 */
export async function loadLaborPerRoByAdvisor(
  client: Client,
  periodId: string,
  rooftopId: string
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();

  const { data, error } = await client
    .from("advisor_family_labor")
    .select("advisor_op_id, family, labor_per_ro")
    .eq("period_id", periodId)
    .eq("rooftop_id", rooftopId);

  if (error || !data) return out;

  const grouped = new Map<string, LaborRow[]>();
  for (const r of data as LaborRow[]) {
    const key = String(r.advisor_op_id);
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }

  for (const [advisorOpId, rows] of grouped) {
    const map = toMap(rows);
    if (map) out.set(advisorOpId, map);
  }
  return out;
}
