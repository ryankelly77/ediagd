"use server";

/* ============================================================================
   EDIAGD — confirming a sub-category's family
   SERVER ONLY.

   A confirmed mapping OUTRANKS the auto-matcher permanently. The importer
   seeds with ignoreDuplicates, so once a row here says 'confirmed' no future
   upload can quietly revert it — which is the only thing that makes correcting
   one worth an admin's time.

   Scoped per rooftop, deliberately. "Tune Up" at a Honda store and at a BMW
   store are not obliged to bundle the same work, and a group-wide mapping would
   make one store's correction silently move another store's numbers.

   ---------------------------------------------------------------------------
   EVERY EDIT HERE IS APPEND-ONLY NOW
   ---------------------------------------------------------------------------
   All four functions below used to UPDATE the live row. 0075's header names
   what that costs, about this exact table: it "rewrote every historical attach
   rate the instant it was saved — no rebuild required, no trace that anything
   happened. 815 rows behave this way against op_text_rule's 9." 0074 gave the
   table somewhere to keep the old version and 0075 taught the attach view to
   respect it; this is the half that stopped writing over history.

   Every write goes through applyMappingEdit → mapping_edit() (0078), which
   retires and inserts in one statement. Nothing here touches the table
   directly.

   ---------------------------------------------------------------------------
   WHICH OF THESE ASK, AND WHICH ANSWER FOR THEMSELVES
   ---------------------------------------------------------------------------
   A mapping edit is a Correction or a Change and the difference matters to
   history — but only when there is an old value to preserve. Three of the four
   actions below have none:

     * setting a family on an UNMAPPED row is the first thing anybody ever said
       about it. There is no prior mapping for history to keep, so it is a
       correction and the queue stays a queue rather than routing 60 rows
       through a confirm screen each.
     * "not a coachable service" and putting one back are statements about the
       WORK — a state inspection was never a thing an advisor sells, in any
       month. Both skip rows somebody confirmed by hand.
     * "apply everywhere" only touches rooftops that have not confirmed one, so
       again there is no human decision being overwritten.

   Re-mapping a row that ALREADY carries a family is the case with a real prior
   value, and that one goes through /admin/dms/mapping/confirm to be told which
   kind of edit it is — the same shape the families screen uses.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { applyMappingEdit, applyMappingEditEverywhere } from "@/lib/mapping/edit";
import type { EditMode } from "@/lib/mapping/epoch";
import { returnTarget } from "@/lib/mapping/return-to";

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

/*
 * ---------------------------------------------------------------------------
 * THE PATHS THESE ACTIONS ACTUALLY SERVE
 * ---------------------------------------------------------------------------
 * This used to revalidate /admin/dms/mapping and /admin/dms and nothing else.
 * Those were the screens it was written for; the mapping queue was ABSORBED
 * into Dealer Codes and /admin/dms/mapping now redirects here. So every write
 * was revalidating two paths nobody renders any more, and none of the paths it
 * had just changed.
 *
 * That is what made ruling a sub-category look like it did nothing: the write
 * landed, the confirm screen re-rendered from cache with the stale value, and
 * the dropdown snapped back to "— choose a family —". The ruling was in the
 * database the whole time, which is exactly why walking out to the list showed
 * it saved.
 */
function done() {
  revalidatePath("/admin/mapping/dealer-codes");
  revalidatePath("/admin/mapping/dealer-codes/confirm");
  // The old queue still redirects here; cheap to keep honest.
  revalidatePath("/admin/dms/mapping");
  revalidatePath("/admin/dms");
}

/** A family must be one the rest of the app knows about. */
async function requireKnownFamily(family: string): Promise<void> {
  const service = createServiceClient();
  const { data: known } = await service
    .from("service_family")
    .select("name")
    .eq("name", family)
    .maybeSingle();
  if (!known) throw new Error(`"${family}" is not a service family.`);
}

/**
 * Set (or clear) the family for one sub-category at one rooftop.
 *
 * An empty family is a legitimate answer: it puts the row back in the queue
 * rather than pretending a decision was made.
 *
 * `mode` comes from the form. The queue posts 'correction' for a row that has
 * no family yet; the confirm screen posts whichever the person chose.
 */
export async function setSubCategoryFamily(formData: FormData): Promise<void> {
  const user = await requireOwner();

  const rooftopId = String(formData.get("rooftopId") ?? "");
  const subCategory = String(formData.get("subCategory") ?? "");
  const familyRaw = String(formData.get("family") ?? "").trim();
  const mode = String(formData.get("mode") ?? "correction") as EditMode;
  const effectiveFrom = String(formData.get("effective_from") ?? "");
  if (!rooftopId || !subCategory) return;
  if (mode !== "correction" && mode !== "change") return;

  const family = familyRaw === "" ? null : familyRaw;
  if (family) await requireKnownFamily(family);

  const result = await applyMappingEdit({
    table: "sub_category_map",
    key: { rooftop_id: rooftopId, sub_category: subCategory },
    values: {
      family,
      status: family ? "confirmed" : "unmapped",
      confirmed_by: family ? user.id : null,
      confirmed_at: family ? new Date().toISOString() : null,
      updated_by: user.id,
    },
    mode,
    effectiveFrom,
  });
  if (!result.ok) throw new Error(result.error);

  done();
  const back = returnTarget(
    String(formData.get("returnTo") ?? ""),
    family ? `${subCategory} → ${family}` : `${subCategory} → no family`
  );
  if (back) redirect(back);
}

/**
 * Rule a sub-category out of coaching entirely.
 *
 * A state inspection is required by law, not sold. Diagnosis is time booked
 * against whatever the fault turns out to be. Body work is another department.
 * None is an attach, and filing them into a service family would inflate every
 * advisor's denominator AND generate coaching that tells somebody to sell more
 * state inspections — advice they cannot act on.
 *
 * Distinct from unmapped: this is a DECISION, so the rows stop reappearing in
 * the queue, and distinct from mapped: the rows are stored but never counted.
 * Applied at every rooftop at once, because whether a thing is coachable is a
 * property of the work, not of the store — and as a CORRECTION, because it was
 * never coachable in any month either.
 */
export async function markNotCoachable(formData: FormData): Promise<void> {
  const user = await requireOwner();

  const subCategory = String(formData.get("subCategory") ?? "");
  if (!subCategory) return;

  const service = createServiceClient();
  // A deliberate mapping still wins — the same guard the in-place update had.
  const { data: rows, error } = await service
    .from("sub_category_map_live")
    .select("rooftop_id")
    .eq("sub_category", subCategory)
    .neq("status", "confirmed");
  if (error) throw new Error(error.message);

  const { failed } = await applyMappingEditEverywhere(
    ((rows ?? []) as { rooftop_id: string }[]).map((r) => ({
      table: "sub_category_map" as const,
      key: { rooftop_id: r.rooftop_id, sub_category: subCategory },
      values: {
        family: null,
        status: "not_coachable",
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        updated_by: user.id,
      },
      mode: "correction" as const,
    }))
  );
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${rows?.length ?? 0} rooftops did not apply: ${failed[0].error}`
    );
  }

  done();
  /* Outside every try/catch by construction: redirect() works by throwing, and
     a caught NEXT_REDIRECT is a navigation that silently does not happen. */
  const back = returnTarget(String(formData.get("returnTo") ?? ""), `${subCategory} → not coachable`);
  if (back) redirect(back);
}

/** Put a not-coachable sub-category back in the queue. */
export async function clearNotCoachable(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const subCategory = String(formData.get("subCategory") ?? "");
  if (!subCategory) return;

  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("sub_category_map_live")
    .select("rooftop_id")
    .eq("sub_category", subCategory)
    .eq("status", "not_coachable");
  if (error) throw new Error(error.message);

  const { failed } = await applyMappingEditEverywhere(
    ((rows ?? []) as { rooftop_id: string }[]).map((r) => ({
      table: "sub_category_map" as const,
      key: { rooftop_id: r.rooftop_id, sub_category: subCategory },
      values: {
        family: null,
        status: "unmapped",
        confirmed_by: null,
        confirmed_at: null,
        updated_by: user.id,
      },
      mode: "correction" as const,
    }))
  );
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${rows?.length ?? 0} rooftops did not apply: ${failed[0].error}`
    );
  }

  /* This one had a bare revalidatePath("/admin/dms/mapping") and never called
     done() at all — so putting a row back in the queue refreshed one dead path
     and nothing else. Same bug as the other three, one layer deeper. */
  done();
  const back = returnTarget(String(formData.get("returnTo") ?? ""), `${subCategory} → back in the queue`);
  if (back) redirect(back);
}

/**
 * Apply one family to the same sub-category at EVERY rooftop that has it
 * unresolved.
 *
 * The per-rooftop rule above is about not making decisions on a store's behalf
 * silently. Doing it loudly, from a button labelled with what it will touch, is
 * the opposite — and with eleven stores arriving at once, mapping "LOF" eleven
 * times is how the queue gets abandoned half-done.
 *
 * Only rows that are NOT already confirmed are touched.
 */
export async function setFamilyEverywhere(formData: FormData): Promise<void> {
  const user = await requireOwner();

  const subCategory = String(formData.get("subCategory") ?? "");
  const family = String(formData.get("family") ?? "").trim();
  if (!subCategory || !family) return;
  await requireKnownFamily(family);

  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("sub_category_map_live")
    .select("rooftop_id")
    .eq("sub_category", subCategory)
    .neq("status", "confirmed");
  if (error) throw new Error(error.message);

  const { failed } = await applyMappingEditEverywhere(
    ((rows ?? []) as { rooftop_id: string }[]).map((r) => ({
      table: "sub_category_map" as const,
      key: { rooftop_id: r.rooftop_id, sub_category: subCategory },
      values: {
        family,
        status: "confirmed",
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        updated_by: user.id,
      },
      mode: "correction" as const,
    }))
  );
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${rows?.length ?? 0} rooftops did not apply: ${failed[0].error}`
    );
  }

  done();
  /* Outside every try/catch by construction: redirect() works by throwing, and
     a caught NEXT_REDIRECT is a navigation that silently does not happen. */
  const back = returnTarget(String(formData.get("returnTo") ?? ""), `${subCategory} → ${family}`);
  if (back) redirect(back);
}
