"use server";

/* ============================================================================
   EDIAGD — editing the mappings, from the app instead of from a laptop
   SERVER ONLY.

   Screens 1, 2 and 4 of the Admin Mapping work: the op-code catalog, the
   catalog-to-family map, and the alias table. Each of these was previously
   editable only by re-running a seed script against production from whichever
   machine had the CSV on it.

   ---------------------------------------------------------------------------
   PLATFORM OWNER, NOT ADMIN
   ---------------------------------------------------------------------------
   The RLS policies on these tables admit `role = 'admin'`, which is right for a
   rooftop admin reading them. Writing is narrower: op_code_family decides which
   family an op code's revenue lands in, and a rooftop admin editing it moves
   numbers at every other rooftop in the group. Same posture the sub-category
   mapping screen already takes.

   ---------------------------------------------------------------------------
   RETIRE, NEVER DELETE
   ---------------------------------------------------------------------------
   `op_code_catalog.code` is a foreign key from content.op_code, from
   op_code_family, and soon from the dealer translation table. Deleting a code
   would take `on delete set null` with it and silently untag every cue filed
   under it — a content loss that reads as a content gap months later. So screen
   1 retires and never deletes, and the retirement is a column rather than a
   removal.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { applyMappingEdit } from "@/lib/mapping/edit";
import type { EditMode } from "@/lib/mapping/epoch";

const MAPPING_PATHS = [
  "/admin/mapping",
  "/admin/mapping/op-codes",
  "/admin/mapping/families",
  "/admin/mapping/aliases",
];

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data } = await supabase.rpc("is_platform_owner");
  if (!data) throw new Error("Platform owner only.");
  return user;
}

function done() {
  MAPPING_PATHS.forEach((p) => revalidatePath(p));
}

/* ---------------------------------------------------------------------------
   Screen 1 · Op Codes
--------------------------------------------------------------------------- */

/**
 * Rename a code's LABEL. The code itself is never editable here.
 *
 * `code` is the key content is filed under, so changing it is a data migration
 * and not a form field — `on update cascade` would carry the references, but
 * every CSV, spreadsheet and printed sheet Mitch holds would then disagree with
 * the database. Name and category are labels and are safe.
 */
export async function updateOpCode(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!name || !category) return;

  const service = createServiceClient();
  await service
    .from("op_code_catalog")
    .update({
      name,
      category,
      notes: notes || null,
      /*
       * STAMPED HERE, NOT BY THE TRIGGER (0073).
       *
       * mapping_stamp_admin sets origin='admin' when auth.uid() is not null,
       * which is exactly right for a write carrying a session — and this write
       * does not carry one. It goes through the service client, so auth.uid()
       * is null and the trigger takes the same branch it takes for the seeder,
       * leaving the row marked 'file'. The next `npm run seed:op-codes` then
       * reverts the edit silently, which is the failure 0073 was written to
       * prevent, defeated by the client the action happens to use.
       *
       * updateOpCodeFamily has always set it by hand for the same reason. This
       * is the other screen catching up.
       */
      origin: "admin",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  done();
}

/**
 * Retire a code, or bring it back.
 *
 * A retired code keeps every foreign key it had. What it loses is a place in
 * the pickers: nothing new can be filed under it, and the family map stops
 * offering it to a block. Content already tagged with it stays tagged, because
 * the alternative is untagging work nobody asked to lose.
 */
export async function setOpCodeRetired(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;
  const retire = String(formData.get("retire") ?? "") === "1";

  const service = createServiceClient();
  await service
    .from("op_code_catalog")
    .update({
      retired_at: retire ? new Date().toISOString() : null,
      /* Same reason as updateOpCode: the service client carries no session, so
         the trigger cannot stamp this and a re-seed would not know a person had
         been here. 0073 notes that `retired_at` itself survives a re-seed
         because the seeders never write it — `name`, `category` and `notes` do
         not, and this row has now been touched by hand. */
      origin: "admin",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  done();
}

/* ---------------------------------------------------------------------------
   Screen 2 · Families
--------------------------------------------------------------------------- */

/**
 * Move a code to another family, or change whether it can be coached.
 *
 * ---------------------------------------------------------------------------
 * THIS MOVES NUMBERS ADVISORS ARE MEASURED ON, AND IT SAYS SO
 * ---------------------------------------------------------------------------
 * `family` decides which bucket an op code's revenue lands in once the pick
 * moves to op-code grain, and `coachable` decides whether Eddie's Pick can land
 * on it at all. Both are edits with consequences beyond this screen.
 *
 * `effective_from` is stamped by mapping_edit(): genesis for a correction, the
 * chosen date for a change. It is no longer written-but-unread — 0075 taught
 * rebuild_dms_periods and advisor_family_attach the interval test, and this
 * table joins them the day the pick moves to op-code grain.
 */
export async function updateOpCodeFamily(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;

  const family = String(formData.get("family") ?? "").trim();
  const coachable = String(formData.get("coachable") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim();
  const mode = String(formData.get("mode") ?? "") as EditMode;
  if (!family) return;
  if (mode !== "correction" && mode !== "change") return;

  const service = createServiceClient();

  /* The family must be one the rest of the app knows about. Free text here
     would create a bucket no benchmark, view or cue pool has heard of. */
  const { data: known } = await service
    .from("service_family")
    .select("name")
    .eq("name", family)
    .maybeSingle();
  if (!known) return;

  /*
   * ---- APPEND-ONLY: RETIRE, THEN INSERT, IN ONE STATEMENT ----------------
   *
   * Point-in-time rule selection only works if the OLD VALUE SURVIVES. An
   * in-place update would leave the interval test reading the new family for
   * every period including the ones measured under the old one — which is the
   * exact bug this whole piece of work exists to close, reintroduced at the
   * last step.
   *
   * This used to be an update, an insert, and a compensating update if the
   * insert failed. The compensation is itself a network call and can fail, and
   * a process death between the first two leaves a code with NO LIVE ROW: it
   * drops out of op_code_family_live, loadCoachableCodes stops offering it, and
   * the advisor's block silently falls back to family grain with nothing
   * recording why. mapping_edit() (0078) makes the pair one statement, and
   * mapping_edit is the same call sub_category_map now goes through — the shape
   * of an epoch edit is written down once. See lib/mapping/edit.ts.
   */
  const result = await applyMappingEdit({
    table: "op_code_family",
    key: { code },
    values: {
      family,
      coachable,
      note: note || null,
      confidence: "ruled",
      updated_by: user.id,
    },
    mode,
    effectiveFrom: String(formData.get("effective_from") ?? ""),
  });
  if (!result.ok) throw new Error(result.error);

  done();
}

/* ---------------------------------------------------------------------------
   Screen 4 · Aliases
--------------------------------------------------------------------------- */

/**
 * Confirm a proposed alias, or withdraw a confirmation.
 *
 * A proposed alias is VISIBLE AND INERT: the importer resolves confirmed rows
 * only, so a guess cannot quietly reroute content while it waits for an answer.
 * This is the button that makes it live — ACO-010 has been waiting on exactly
 * this since 0066.
 */
export async function setAliasConfirmed(formData: FormData): Promise<void> {
  await requireOwner();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const confirmed = String(formData.get("confirmed") ?? "") === "1";

  const service = createServiceClient();
  await service
    .from("mapping_alias")
    .update({ confirmed, updated_at: new Date().toISOString() })
    .eq("id", id);
  done();
}

/**
 * Add an alias. Refuses one that would point at nothing.
 *
 * An op-code alias whose canonical is not in the catalog is worse than no
 * alias: the importer would resolve a row to a code that does not exist and the
 * foreign key would reject the write, so the content simply would not import
 * and nobody would be told why.
 */
export async function createAlias(formData: FormData): Promise<void> {
  await requireOwner();
  const kind = String(formData.get("kind") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim();
  const canonical = String(formData.get("canonical") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!kind || !alias || !canonical) return;

  const service = createServiceClient();

  if (kind === "op_code") {
    const { data: target } = await service
      .from("op_code_catalog")
      .select("code")
      .eq("code", canonical)
      .maybeSingle();
    if (!target) return;
  }

  /* New aliases start UNCONFIRMED regardless of who adds them. Adding one is a
     proposal; confirming it is a separate act, and collapsing the two would
     remove the only pause in the process. */
  await service
    .from("mapping_alias")
    .upsert(
      { kind, alias, canonical, confirmed: false, note: note || null },
      { onConflict: "kind,alias" }
    );
  done();
}
