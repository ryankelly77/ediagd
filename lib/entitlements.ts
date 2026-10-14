/* ============================================================================
   EDIAGD — who may see which library
   SERVER ONLY.

   TWO ADD-ONS AND A BASE PRODUCT. 0001 already models this properly:
   product_catalog says Joe the Pro and Manager Meetings are add-ons
   (is_addon = true), rooftop_product records what a store actually bought, and
   content's RLS gates every row on rooftop_has_product(). None of that is new
   here — this file only resolves the same question in the page layer so a
   screen can say "your rooftop hasn't bought this" instead of rendering an
   empty list that looks broken.

   THE DATABASE IS STILL THE BOUNDARY. Every check here is duplicated by
   0010's content_entitled_read policy, which is what actually stops a row
   reaching someone. If these two ever disagree, RLS wins and the page shows
   nothing — the failure mode is an empty screen, never a leak.
   ============================================================================ */

import type { ProductKey } from "@/lib/content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export type Entitlement = {
  /** The rooftop bought it AND the caller holds the role it serves. */
  entitled: boolean;
  /** Holds the role somewhere — used to tell "not for you" from "not bought". */
  hasRole: boolean;
  /** Rooftops where both are true. Empty when not entitled. */
  rooftopIds: string[];
};

/**
 * Does this person hold `role` at a rooftop that owns `product`?
 *
 * ---------------------------------------------------------------------------
 * THIS RETURNED `entitled: false` FOR EVERYBODY, FOR EVERY PRODUCT, ALWAYS.
 * Found 13 October 2026, on production.
 * ---------------------------------------------------------------------------
 * It used to be one query, embedding the join:
 *
 *     .from("membership")
 *     .select("rooftop_id, rooftop_product!inner(product)")
 *
 * PostgREST cannot resolve that embed and never could. `membership.rooftop_id`
 * and `rooftop_product.rooftop_id` both point at `rooftop.id` — two children of
 * one parent, which is not a foreign key BETWEEN them and therefore not an
 * embeddable relationship. Against production it answers:
 *
 *     Could not find a relationship between 'membership' and 'rooftop_product'
 *     in the schema cache
 *
 * And the caller wrote `const { data } = await …`, so **the error was never
 * destructured**. On an error supabase-js returns `data: null`, `?? []` made it
 * an empty array, and an empty array is indistinguishable here from "they are
 * not entitled". Every call returned `entitled: false` with complete
 * confidence.
 *
 * Nobody noticed because BOTH add-ons it gates were unbought: Joe the Pro has
 * no customer and 0148 deliberately withheld Manager Meetings from Beaumont
 * because the films did not exist. The correct screen and the broken one said
 * the same words. It surfaced the moment 0164 granted the first
 * `manager_meetings` row and the tile still read "isn't on your subscription"
 * while the same join, run as the same manager in SQL, returned a row.
 *
 * This is the file's own warning come true, one layer up: "If these two ever
 * disagree, RLS wins and the page shows nothing — the failure mode is an empty
 * screen, never a leak." That is exactly what happened, and it is why a false
 * refusal survives review: it wears the costume of care.
 *
 * ---------------------------------------------------------------------------
 * TWO QUERIES, AND THE ERROR IS A REFUSAL RATHER THAN AN EMPTY LIST
 * ---------------------------------------------------------------------------
 * Both errors are now read. A failed read THROWS rather than returning
 * `entitled: false`, because "we could not find out" and "they may not have it"
 * are different answers and only one of them should quietly hide a screen
 * somebody paid for.
 *
 * The cost is one extra round trip, on two screens, neither of which is in the
 * daily loop. The previous docstring sold the single query as the point; it was
 * buying a round trip with a wrong answer.
 */
export async function checkEntitlement(
  client: Client,
  userId: string,
  /** ANY of these roles will do — joe_the_pro serves advisors and managers. */
  roles: readonly ("advisor" | "manager" | "technician" | "admin")[],
  product: ProductKey
): Promise<Entitlement> {
  /* 1. The rooftops where they hold one of these roles. This also answers
        `hasRole`, so the "not for you" / "not bought" distinction costs
        nothing extra. */
  const { data: memberships, error: memberError } = await client
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", userId)
    .in("role", roles as string[])
    .eq("active", true);
  if (memberError) {
    throw new Error(`checkEntitlement: membership read failed — ${memberError.message}`);
  }

  const roofIds = [
    ...new Set(((memberships ?? []) as { rooftop_id: string }[]).map((m) => m.rooftop_id)),
  ];
  // Distinguishing "you're not a manager" from "your store hasn't bought it"
  // is the difference between a useful empty state and a dead end.
  const hasRole = roofIds.length > 0;
  if (!hasRole) return { entitled: false, hasRole: false, rooftopIds: [] };

  /* 2. Which of those rooftops actually own the product.
        `status` is NOT filtered, which matches what the old query did and what
        content's own RLS does — rooftop_has_product() is the boundary, and a
        second, stricter opinion here would hide a screen the database would
        still serve. If status ever needs to mean something, it needs to mean
        it in one place. */
  const { data: owned, error: productError } = await client
    .from("rooftop_product")
    .select("rooftop_id")
    .in("rooftop_id", roofIds)
    .eq("product", product);
  if (productError) {
    throw new Error(`checkEntitlement: rooftop_product read failed — ${productError.message}`);
  }

  const entitledIds = [
    ...new Set(((owned ?? []) as { rooftop_id: string }[]).map((r) => r.rooftop_id)),
  ];
  return { entitled: entitledIds.length > 0, hasRole: true, rooftopIds: entitledIds };
}
