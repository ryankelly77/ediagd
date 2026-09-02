/* ============================================================================
   EDIAGD — editing a versioned mapping, once, for all three tables
   SERVER ONLY.

   ---------------------------------------------------------------------------
   WHY THERE IS ONE OF THESE AND NOT THREE
   ---------------------------------------------------------------------------
   op_code_family had a correct retire-and-insert since the Mapping screens
   shipped. sub_category_map — the table 0075 named as the one that "rewrote
   every historical attach rate the instant it was saved", with 815 rows against
   op_text_rule's 9 — had four editors that all updated the live row in place.

   The fix for the second was never going to be a second copy of the first. Two
   implementations of an epoch edit is how one of them ends up subtly different,
   and the difference shows up months later as a period measured under two
   mappings with nothing on any screen disagreeing.

   So the shape lives here and the arithmetic lives in mapping_edit() (0078),
   which does the retire and the insert in ONE statement. The previous version
   was an update, then an insert, then a compensating update — three round trips
   with two windows, and what sits on the other side of those windows is a key
   with no live row at all.
   ============================================================================ */

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { GENESIS, effectiveFromFor, type EditMode } from "@/lib/mapping/epoch";

/** The three tables 0074 made append-only. Nothing else may be edited this way. */
export type MappingTable = "sub_category_map" | "op_text_rule" | "op_code_family";

export type MappingEdit = {
  table: MappingTable;
  /** The natural key — {code}, {sub_category}, or {rooftop_id, sub_category}. */
  key: Record<string, string>;
  /** Only the columns this edit changes; the rest are inherited from the row
   *  being replaced, so a caller cannot blank a column by forgetting it. */
  values: Record<string, unknown>;
  mode: EditMode;
  /** Ignored for a correction, which always reaches back to GENESIS. */
  effectiveFrom?: string | null;
};

export type MappingEditResult =
  | { ok: true; effectiveFrom: string; versionsRetired: number }
  | { ok: false; error: string };

/**
 * Retire the current version of one mapping and insert its replacement.
 *
 * A CORRECTION collapses every existing version to an empty interval at its own
 * start date and begins again at genesis: nobody ever meant the old value, so
 * no period should be able to find it. A CHANGE retires the live version at the
 * new date and starts there, leaving history on the old mapping.
 *
 * Returns the error as a value rather than throwing. Every caller here is a
 * Server Action reached from a form, and the two failures a person can actually
 * cause — a change dated before the version it replaces, and a key with no live
 * row — both deserve a sentence rather than a stack trace.
 */
export async function applyMappingEdit(edit: MappingEdit): Promise<MappingEditResult> {
  const effectiveFrom = effectiveFromFor(edit.mode, edit.effectiveFrom);
  const service = createServiceClient();

  const { data, error } = await service.rpc("mapping_edit", {
    _table: edit.table,
    _key: edit.key,
    _values: edit.values,
    _mode: edit.mode,
    _effective_from: edit.mode === "correction" ? GENESIS : effectiveFrom,
  });

  if (error) return { ok: false, error: error.message };

  const r = (data ?? {}) as { effective_from?: string; versions_retired?: number };
  return {
    ok: true,
    effectiveFrom: r.effective_from ?? effectiveFrom,
    versionsRetired: Number(r.versions_retired ?? 0),
  };
}

/**
 * The same edit applied to one key at many rooftops.
 *
 * sub_category_map is scoped per rooftop, and two of its editors deliberately
 * act across all of them — whether a thing is coachable is a property of the
 * work, not of the store. Each rooftop is its own mapping_edit() call because
 * each is its own key and its own row; they are sequenced rather than raced so
 * a failure reports which rooftop it stopped at instead of leaving an unknown
 * subset applied.
 *
 * PARTIAL SUCCESS IS REPORTED, NOT SWALLOWED. Eleven stores is eleven
 * statements, and "3 of 11 applied" is something a person can act on.
 */
export async function applyMappingEditEverywhere(
  edits: MappingEdit[]
): Promise<{ applied: number; failed: { key: Record<string, string>; error: string }[] }> {
  let applied = 0;
  const failed: { key: Record<string, string>; error: string }[] = [];

  for (const edit of edits) {
    const result = await applyMappingEdit(edit);
    if (result.ok) applied++;
    else failed.push({ key: edit.key, error: result.error });
  }

  return { applied, failed };
}
