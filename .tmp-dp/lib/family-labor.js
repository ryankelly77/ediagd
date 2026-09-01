"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLaborPerRo = loadLaborPerRo;
exports.loadLaborPerRoByAdvisor = loadLaborPerRoByAdvisor;
function toMap(rows) {
    const perRo = {};
    for (const r of rows) {
        if (r.labor_per_ro == null)
            continue;
        const v = Number(r.labor_per_ro);
        if (Number.isFinite(v))
            perRo[String(r.family)] = v;
    }
    return Object.keys(perRo).length > 0 ? perRo : undefined;
}
/**
 * Labor-per-RO by family for ONE advisor in one period.
 */
async function loadLaborPerRo(client, periodId, advisorOpId) {
    const { data, error } = await client
        .from("advisor_family_labor")
        .select("advisor_op_id, family, labor_per_ro")
        .eq("period_id", periodId)
        .eq("advisor_op_id", advisorOpId);
    if (error || !data)
        return undefined;
    return toMap(data);
}
/**
 * Labor-per-RO by family for EVERY advisor at a rooftop in one period, keyed by
 * advisor_op_id.
 *
 * One query for the whole roster. The manager view builds a summary per advisor
 * and would otherwise issue one round-trip per person on every page load.
 */
async function loadLaborPerRoByAdvisor(client, periodId, rooftopId) {
    const out = new Map();
    const { data, error } = await client
        .from("advisor_family_labor")
        .select("advisor_op_id, family, labor_per_ro")
        .eq("period_id", periodId)
        .eq("rooftop_id", rooftopId);
    if (error || !data)
        return out;
    const grouped = new Map();
    for (const r of data) {
        const key = String(r.advisor_op_id);
        const list = grouped.get(key) ?? [];
        list.push(r);
        grouped.set(key, list);
    }
    for (const [advisorOpId, rows] of grouped) {
        const map = toMap(rows);
        if (map)
            out.set(advisorOpId, map);
    }
    return out;
}
