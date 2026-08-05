"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/guards";
import { createServiceClient } from "@/lib/supabase/service";
import type { SwagResult } from "@/lib/swag";

/**
 * Admin side of the shack: work the fulfillment queue and edit the catalog.
 * Every action re-checks admin (Server Actions accept direct POSTs) on top of
 * the RLS policies from 0018.
 */
async function requireAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.userId) return { ok: false as const, error: "You need to sign in." };
  if (!ctx.hasAdminAccess) return { ok: false as const, error: "Admins only." };
  return { ok: true as const, ctx };
}

function revalidateSwag() {
  revalidatePath("/admin/swag");
  revalidatePath("/swag");
}

/* ---- Fulfillment --------------------------------------------------------- */

export async function markFulfilled(redemptionId: string): Promise<SwagResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data, error } = await auth.ctx.supabase
    .from("swag_redemption")
    .update({ status: "fulfilled", fulfilled_at: new Date().toISOString() })
    .eq("id", redemptionId)
    .eq("status", "requested") // don't re-fulfil or resurrect a cancellation
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: "That order isn't awaiting fulfillment any more." };
  }

  revalidateSwag();
  return { ok: true, message: "Marked as sent." };
}

/**
 * Cancel and refund.
 *
 * The refund is a NEW positive ledger entry rather than deleting the original
 * debit: the ledger is an append-only history, so "spent 1,500 then refunded
 * 1,500" is the truthful record and the balance view arrives at the same number
 * either way. It carries the same ref_id, so the pair stays linked.
 *
 * Uses the service role because the economy tables are service-role-write-only
 * (0012) — admins can update the redemption, but nobody writes the ledger from
 * a user session.
 */
export async function cancelRedemption(redemptionId: string): Promise<SwagResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const service = createServiceClient();

  const { data: redemption, error: readError } = await service
    .from("swag_redemption")
    .select("id, user_id, price_paid, status, swag_item:swag_item_id(name)")
    .eq("id", redemptionId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!redemption) return { ok: false, error: "That order no longer exists." };
  if (redemption.status === "cancelled") {
    return { ok: false, error: "That order is already cancelled." };
  }

  const { error: statusError } = await service
    .from("swag_redemption")
    .update({ status: "cancelled" })
    .eq("id", redemptionId);
  if (statusError) return { ok: false, error: statusError.message };

  const refund = Number(redemption.price_paid ?? 0);
  if (refund > 0) {
    const embed = redemption.swag_item as unknown;
    const item = (Array.isArray(embed) ? embed[0] : embed) as
      | { name: string | null }
      | null
      | undefined;

    const { error: refundError } = await service.from("sand_dollar_entry").insert({
      user_id: redemption.user_id as string,
      amount: refund,
      reason: "adjustment",
      ref_id: redemptionId,
      note: `Refund — ${item?.name ?? "Swag Shack"}`,
    });

    if (refundError) {
      // Put the order back rather than cancel without refunding.
      await service
        .from("swag_redemption")
        .update({ status: redemption.status })
        .eq("id", redemptionId);
      return { ok: false, error: refundError.message };
    }
  }

  revalidateSwag();
  revalidatePath("/sand-dollars");
  return {
    ok: true,
    message: `Cancelled — ${refund.toLocaleString()} Sand Dollars refunded.`,
  };
}

/* ---- Catalog ------------------------------------------------------------- */

export type SwagItemDraft = {
  id?: string;
  key: string;
  name: string;
  description: string | null;
  price: number;
  variants: string | null;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
};

export async function saveSwagItem(draft: SwagItemDraft): Promise<SwagResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const key = draft.key.trim().toLowerCase().replace(/\s+/g, "_");
  const name = draft.name.trim();
  const price = Number(draft.price);

  if (!key) return { ok: false, error: "A key is required." };
  if (!name) return { ok: false, error: "A name is required." };
  if (!Number.isInteger(price) || price < 0) {
    return { ok: false, error: "Price must be a whole number of Sand Dollars." };
  }

  const payload = {
    key,
    name,
    description: draft.description?.trim() || null,
    price_sand_dollars: price,
    variants: draft.variants?.trim() || null,
    image_url: draft.imageUrl?.trim() || null,
    sort_order: Number(draft.sortOrder) || 0,
    active: draft.active,
  };

  const query = draft.id
    ? auth.ctx.supabase.from("swag_item").update(payload).eq("id", draft.id)
    : auth.ctx.supabase.from("swag_item").insert(payload);

  const { error } = await query;
  if (error) return { ok: false, error: error.message };

  revalidateSwag();
  return { ok: true, message: draft.id ? "Item saved." : "Item added." };
}

/**
 * Retire rather than delete: past redemptions reference the item, and a hard
 * delete would break the fulfillment history.
 */
export async function setSwagItemActive(
  itemId: string,
  active: boolean
): Promise<SwagResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.ctx.supabase
    .from("swag_item")
    .update({ active })
    .eq("id", itemId);

  if (error) return { ok: false, error: error.message };
  revalidateSwag();
  return { ok: true, message: active ? "Back on the shelf." : "Retired." };
}
