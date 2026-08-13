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
  const { data } = await supabase.rpc("is_platform_owner");
  if (!data) throw new Error("Platform owner only.");
  return user;
}

/**
 * Set (or clear) the family for one sub-category at one rooftop.
 *
 * An empty family is a legitimate answer: it puts the row back in the queue
 * rather than pretending a decision was made.
 */
export async function setSubCategoryFamily(formData: FormData): Promise<void> {
  const user = await requireOwner();

  const rooftopId = String(formData.get("rooftopId") ?? "");
  const subCategory = String(formData.get("subCategory") ?? "");
  const familyRaw = String(formData.get("family") ?? "").trim();
  if (!rooftopId || !subCategory) return;

  const family = familyRaw === "" ? null : familyRaw;
  const service = createServiceClient();

  // The family must be one we actually have. A free-text value here would
  // create a family that exists in exactly one mapping row and nowhere else.
  if (family) {
    const { data: known } = await service
      .from("service_family")
      .select("name")
      .eq("name", family)
      .maybeSingle();
    if (!known) throw new Error(`"${family}" is not a service family.`);
  }

  const { error } = await service.from("sub_category_map").upsert(
    {
      rooftop_id: rooftopId,
      sub_category: subCategory,
      family,
      status: family ? "confirmed" : "unmapped",
      confirmed_by: family ? user.id : null,
      confirmed_at: family ? new Date().toISOString() : null,
    },
    { onConflict: "rooftop_id,sub_category" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/admin/dms/mapping");
  revalidatePath("/admin/dms");
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
 * property of the work, not of the store.
 */
export async function markNotCoachable(formData: FormData): Promise<void> {
  const user = await requireOwner();

  const subCategory = String(formData.get("subCategory") ?? "");
  if (!subCategory) return;

  const service = createServiceClient();
  const { error } = await service
    .from("sub_category_map")
    .update({
      family: null,
      status: "not_coachable",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("sub_category", subCategory)
    .neq("status", "confirmed"); // a deliberate mapping still wins
  if (error) throw new Error(error.message);

  revalidatePath("/admin/dms/mapping");
  revalidatePath("/admin/dms");
}

/** Put a not-coachable sub-category back in the queue. */
export async function clearNotCoachable(formData: FormData): Promise<void> {
  await requireOwner();
  const subCategory = String(formData.get("subCategory") ?? "");
  if (!subCategory) return;

  const service = createServiceClient();
  const { error } = await service
    .from("sub_category_map")
    .update({ status: "unmapped", family: null, confirmed_by: null, confirmed_at: null })
    .eq("sub_category", subCategory)
    .eq("status", "not_coachable");
  if (error) throw new Error(error.message);

  revalidatePath("/admin/dms/mapping");
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

  const service = createServiceClient();
  const { data: known } = await service
    .from("service_family")
    .select("name")
    .eq("name", family)
    .maybeSingle();
  if (!known) throw new Error(`"${family}" is not a service family.`);

  const { error } = await service
    .from("sub_category_map")
    .update({
      family,
      status: "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("sub_category", subCategory)
    .neq("status", "confirmed");
  if (error) throw new Error(error.message);

  revalidatePath("/admin/dms/mapping");
  revalidatePath("/admin/dms");
}
