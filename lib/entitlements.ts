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
 * One query. The embedded rooftop_product filter means PostgREST does the join,
 * so an advisor at forty rooftops still costs one round trip.
 */
export async function checkEntitlement(
  client: Client,
  userId: string,
  /** ANY of these roles will do — joe_the_pro serves advisors and managers. */
  roles: readonly ("advisor" | "manager" | "technician" | "admin")[],
  product: ProductKey
): Promise<Entitlement> {
  const { data } = await client
    .from("membership")
    .select("rooftop_id, rooftop_product!inner(product)")
    .eq("user_id", userId)
    .in("role", roles as string[])
    .eq("active", true)
    .eq("rooftop_product.product", product);

  const rows = (data ?? []) as { rooftop_id: string }[];
  if (rows.length > 0) {
    return {
      entitled: true,
      hasRole: true,
      rooftopIds: [...new Set(rows.map((r) => r.rooftop_id))],
    };
  }

  // Distinguishing "you're not a manager" from "your store hasn't bought it"
  // is the difference between a useful empty state and a dead end.
  const { count } = await client
    .from("membership")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("role", roles as string[])
    .eq("active", true);

  return { entitled: false, hasRole: Number(count ?? 0) > 0, rooftopIds: [] };
}
