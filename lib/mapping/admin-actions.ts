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
  await requireOwner();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!name || !category) return;

  const service = createServiceClient();
  await service
    .from("op_code_catalog")
    .update({ name, category, notes: notes || null, updated_at: new Date().toISOString() })
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
  await requireOwner();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;
  const retire = String(formData.get("retire") ?? "") === "1";

  const service = createServiceClient();
  await service
    .from("op_code_catalog")
    .update({
      retired_at: retire ? new Date().toISOString() : null,
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
 * `effective_from` is stamped to today on every change. It is read by nothing
 * yet — rebuild_dms_periods is still all-or-nothing and cannot honour a date
 * floor, which is the next piece of foundation work — but the column has to
 * carry a true date from the first edit or the epoch can never be reconstructed
 * afterwards. Writing it now costs nothing; not writing it is unrecoverable.
 */
export async function updateOpCodeFamily(formData: FormData): Promise<void> {
  await requireOwner();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;

  const family = String(formData.get("family") ?? "").trim();
  const coachable = String(formData.get("coachable") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim();
  if (!family) return;

  const service = createServiceClient();

  /* The family must be one the rest of the app knows about. A free-text family
     here would create a bucket no benchmark, view or cue pool has ever heard
     of, and the code would vanish from coaching without appearing to. */
  const { data: known } = await service
    .from("service_family")
    .select("name")
    .eq("name", family)
    .maybeSingle();
  if (!known) return;

  await service
    .from("op_code_family")
    .update({
      family,
      coachable,
      note: note || null,
      /* A human has now ruled on it, whatever the seed's guess was. */
      confidence: "ruled",
      effective_from: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
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
