"use server";

/* ============================================================================
   EDIAGD — Dealer Codes: lock, and the op-code bridge

   Section 1 has NO actions here on purpose. It calls the four that already
   exist in lib/dms/mapping-actions.ts — setSubCategoryFamily, markNotCoachable,
   clearNotCoachable, setFamilyEverywhere — because those already route through
   mapping_edit() and are already the single write path. Adding a second set
   would be building the door this screen exists to close.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) throw new Error("Platform owner only.");
  return user;
}

function done() {
  revalidatePath("/admin/mapping/dealer-codes");
}

/* ---------------------------------------------------------------------------
   The lock
--------------------------------------------------------------------------- */

/**
 * Rule a dealer's code table complete, or reopen it.
 *
 * ---------------------------------------------------------------------------
 * LOCK DOES NOT FORBID EDITING. IT MAKES AN EDIT ANNOUNCE ITSELF.
 * ---------------------------------------------------------------------------
 * Onboarding ends somewhere: the list is pulled, auto-matched, ruled, done.
 * Before that point an edit is finishing a job. After it, an edit changes a
 * mapping that months of measurement have already run through — which is a
 * different act and deserves the epoch confirmation rather than a one-tap
 * button.
 *
 * A lock somebody cannot undo is a lock somebody works around, so unlocking is
 * one click and is recorded the same way.
 */
export async function setDealerLock(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const dealerId = String(formData.get("dealerId") ?? "").trim();
  const locked = String(formData.get("locked") ?? "") === "1";
  if (!dealerId) return;

  const service = createServiceClient();
  await service
    .from("org")
    .update({
      codes_locked_at: locked ? new Date().toISOString() : null,
      codes_locked_by: locked ? user.id : null,
    })
    .eq("id", dealerId);
  done();
}

/* ---------------------------------------------------------------------------
   Section 2 — the op-code bridge
--------------------------------------------------------------------------- */

/**
 * Record a ruling about one DMS op code, at every rooftop of the dealer.
 *
 * ---------------------------------------------------------------------------
 * THROUGH mapping_edit, FOR A TABLE NOTHING READS
 * ---------------------------------------------------------------------------
 * That is the point rather than an oversight. When coaching moves to op-code
 * precision this table is the bridge, and a bridge whose history begins on the
 * day it was first queried cannot answer "what was this code mapped to in
 * August". So the rulings are collected now and effective-dated now, through
 * the same function and with the same retire-and-insert as the mappings that
 * do move numbers.
 *
 * CORRECTION IS THE DEFAULT AND IS ALMOST ALWAYS RIGHT HERE. Nothing has ever
 * been measured through this table, so there is no history to preserve and
 * "this code always meant that" is simply true. A change is offered anyway,
 * because the day a dealer genuinely renumbers an op code mid-year, correction
 * would rewrite the wrong months — and by then the table will be live.
 *
 * PER ROOFTOP, because the key is (rooftop, code) — the same dealer can have
 * one store using a code the others do not.
 */
export async function ruleOpCode(formData: FormData): Promise<void> {
  const user = await requireOwner();

  const dmsOpCode = String(formData.get("dmsOpCode") ?? "").trim();
  const rooftopIds = String(formData.get("rooftopIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const canonicalRaw = String(formData.get("canonical") ?? "").trim();
  const matchedBy = String(formData.get("matchedBy") ?? "human");
  const mode = String(formData.get("mode") ?? "correction");
  const effectiveFrom = String(formData.get("effective_from") ?? "");

  if (!dmsOpCode || rooftopIds.length === 0) return;
  if (mode !== "correction" && mode !== "change") return;

  /*
   * "NOTHING FITS" MUST BE CHOSEN, NEVER INFERRED FROM AN EMPTY FIELD.
   *
   * This used to treat "" as the ruling "no code we have fits this", and the
   * row rendered an empty text box with a "no match" placeholder above a submit
   * button — so two codes were ruled by somebody clicking a button over a field
   * they had never touched. "Nobody chose anything" and "somebody chose
   * nothing" are different facts and now have different values.
   */
  if (canonicalRaw === "") return;
  const canonical = canonicalRaw === "__none__" ? null : canonicalRaw;
  const status = canonical ? "confirmed" : "no_match";

  const service = createServiceClient();

  if (canonical) {
    const { data: exists } = await service
      .from("op_code_catalog")
      .select("code")
      .eq("code", canonical)
      .maybeSingle();
    if (!exists) throw new Error(`${canonical} is not in the op code catalog.`);
  }

  for (const rooftopId of rooftopIds) {
    const { error } = await service.rpc("mapping_edit", {
      _table: "dms_op_code_map",
      _key: { rooftop_id: rooftopId, dms_op_code: dmsOpCode },
      _values: {
        canonical_code: canonical,
        status,
        matched_by: matchedBy === "auto" || matchedBy === "deck_map" ? matchedBy : "human",
        updated_by: user.id,
      },
      _mode: mode,
      ...(mode === "change" && effectiveFrom ? { _effective_from: effectiveFrom } : {}),
    });
    if (error) throw new Error(`${dmsOpCode} @ ${rooftopId}: ${error.message}`);
  }
  done();
}
