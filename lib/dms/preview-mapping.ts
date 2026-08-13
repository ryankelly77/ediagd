/* ============================================================================
   EDIAGD — what the mapping will look like AFTER the commit
   SERVER ONLY.

   THE BUG THIS EXISTS TO KILL. The preview reported 43 unmapped sub-categories
   over 2,967 rows; the commit then reported 36 over 2,763. Both were arithmetic
   over the same file, and both were "right" — they were just measuring
   different things. The preview counted DISTINCT SUB-CATEGORIES IN THE FILE
   that the rule file could not place. The commit counted ROOFTOP × SUB-CATEGORY
   ROWS left unmapped in the database, which already had confirmed decisions in
   it from earlier uploads.

   A preview that under-reports is worse than no preview. It is the screen whose
   entire job is "this is what will happen", and once one number on it is known
   to drift, none of the others are trusted either.

   So the projection is computed ONCE, here, at the same grain the database uses
   — (rooftop, sub-category) — and the preview and the post-commit result both
   read it. They agree because there is only one calculation.
   ============================================================================ */

import { autoMatch } from "./mapping";

export type ExistingMap = {
  rooftop_id: string;
  sub_category: string;
  family: string | null;
  status: string;
};

export type MappingProjection = {
  /** Distinct sub-categories that will still be unmapped somewhere. */
  unmappedSubCategories: number;
  /** Detail rows sitting under one of them. */
  unmappedRows: number;
  /** Sub-categories a person has ruled out of coaching entirely. */
  notCoachableSubCategories: number;
  notCoachableRows: number;
  /** Per sub-category, for the preview's list. */
  rows: {
    name: string;
    rows: number;
    family: string | null;
    status: "auto" | "confirmed" | "unmapped" | "not_coachable";
    note: string | null;
  }[];
};

/**
 * Project the post-commit mapping state.
 *
 * The resolution order is exactly the one commit_dms_import + the automap RPC
 * apply, and in the same order:
 *
 *   1. an existing 'confirmed' or 'not_coachable' row for this rooftop wins —
 *      those are decisions a person made, and no upload may revert them
 *   2. otherwise the rule file's verdict
 *   3. otherwise unmapped
 */
export function projectMapping(
  /** (rooftop, sub-category) pairs the file contains, with row counts. */
  pairs: { rooftopId: string | null; subCategory: string; rows: number }[],
  existing: ExistingMap[]
): MappingProjection {
  const decided = new Map<string, { family: string | null; status: string }>();
  for (const e of existing) {
    if (e.status === "confirmed" || e.status === "not_coachable") {
      decided.set(`${e.rooftop_id}|${e.sub_category}`, {
        family: e.family,
        status: e.status,
      });
    }
  }

  // Roll the per-rooftop verdicts up to one line per sub-category for display,
  // while counting rows at the pair grain the database uses.
  type Agg = {
    rows: number;
    family: string | null;
    status: MappingProjection["rows"][number]["status"];
    note: string | null;
    anyUnmapped: boolean;
    unmappedRows: number;
    notCoachableRows: number;
  };
  const bySub = new Map<string, Agg>();

  for (const p of pairs) {
    const auto = autoMatch(p.subCategory);
    const hit = p.rooftopId
      ? decided.get(`${p.rooftopId}|${p.subCategory}`)
      : undefined;

    const family = hit ? hit.family : auto.family;
    const status: Agg["status"] = hit
      ? (hit.status as Agg["status"])
      : auto.family
        ? "auto"
        : "unmapped";

    const cur = bySub.get(p.subCategory) ?? {
      rows: 0,
      family,
      status,
      note: auto.note,
      anyUnmapped: false,
      unmappedRows: 0,
      notCoachableRows: 0,
    };

    cur.rows += p.rows;
    if (status === "unmapped") {
      cur.anyUnmapped = true;
      cur.unmappedRows += p.rows;
    }
    if (status === "not_coachable") cur.notCoachableRows += p.rows;

    // A decision beats a guess in the summary line too.
    if (status === "confirmed" || status === "not_coachable") {
      cur.family = family;
      cur.status = status;
    } else if (cur.status === "unmapped" && status === "auto") {
      cur.family = family;
      cur.status = "auto";
    }

    bySub.set(p.subCategory, cur);
  }

  const rows = [...bySub.entries()]
    .map(([name, a]) => ({
      name,
      rows: a.rows,
      family: a.family,
      // If it is unmapped ANYWHERE it still needs somebody, so the summary
      // line says unmapped rather than hiding behind one rooftop's decision.
      status: a.anyUnmapped && a.status === "auto" ? ("unmapped" as const) : a.status,
      note: a.note,
    }))
    .sort((x, y) => y.rows - x.rows);

  const unmappedRows = [...bySub.values()].reduce((n, a) => n + a.unmappedRows, 0);
  const notCoachableRows = [...bySub.values()].reduce(
    (n, a) => n + a.notCoachableRows,
    0
  );

  return {
    unmappedSubCategories: rows.filter((r) => r.status === "unmapped").length,
    unmappedRows,
    notCoachableSubCategories: rows.filter((r) => r.status === "not_coachable").length,
    notCoachableRows,
    rows,
  };
}
