"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SwagResult } from "@/lib/swag";

/* ============================================================================
   SPENDING IS SERVER-AUTHORITATIVE — the mirror of completeDay().
   The economy tables are service-role-write-only (0012), and swag_redemption
   has no user INSERT policy (0018), so a redemption can only happen here.

   Every action below:
     * resolves the user from the SESSION — never takes a userId argument
     * reads the price from the DATABASE — never trusts a client-sent amount
     * checks the balance server-side before debiting

   ATOMICITY. PostgREST gives no multi-statement transaction, so this is the
   same compensating saga completeDay uses:
     1. write the redemption row first (it supplies the ledger's ref_id)
     2. write the negative ledger entry
     3. re-read the balance — if it went negative, a concurrent spend beat us,
        so undo BOTH writes and refuse
   Anything that fails midway is compensated in the catch. The residual risk is
   identical and documented there: compensation is itself a network call.
   ============================================================================ */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/* ---- Redeem an item ------------------------------------------------------ */

export async function redeemSwag(
  itemId: string,
  variant: string | null,
  shippingNote: string | null
): Promise<SwagResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const service = createServiceClient();

  // Price comes from the DB, not the client.
  const { data: item, error: itemError } = await service
    .from("swag_item")
    .select("id, name, price_sand_dollars, active")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) return { ok: false, error: itemError.message };
  if (!item || !item.active) {
    return { ok: false, error: "That item isn't in the shack right now." };
  }

  const price = Number(item.price_sand_dollars);
  const balance = await readBalance(service, user.id);

  if (balance < price) {
    const gap = price - balance;
    return {
      ok: false,
      error: `You're ${gap.toLocaleString()} Sand Dollars away from this one. Keep the Swell rolling.`,
    };
  }

  // 1. The redemption row — gives the ledger entry something to point at.
  const { data: redemption, error: redemptionError } = await service
    .from("swag_redemption")
    .insert({
      user_id: user.id,
      swag_item_id: item.id,
      price_paid: price,
      variant: variant?.trim() || null,
      shipping_note: shippingNote?.trim() || null,
      status: "requested",
    })
    .select("id")
    .maybeSingle();

  if (redemptionError) return { ok: false, error: redemptionError.message };
  if (!redemption?.id) return { ok: false, error: "Couldn't create the order." };

  // 2. The debit.
  const { error: ledgerError } = await service.from("sand_dollar_entry").insert({
    user_id: user.id,
    amount: -price,
    reason: "swag_purchase",
    ref_id: redemption.id,
    note: item.name,
  });

  if (ledgerError) {
    await service.from("swag_redemption").delete().eq("id", redemption.id);
    return { ok: false, error: ledgerError.message };
  }

  // 3. Guard the race: two redemptions in flight could both have passed the
  //    balance check above. The ledger is the source of truth, so if it's now
  //    negative, this one loses and is undone entirely.
  const after = await readBalance(service, user.id);
  if (after < 0) {
    await service.from("sand_dollar_entry").delete().eq("ref_id", redemption.id);
    await service.from("swag_redemption").delete().eq("id", redemption.id);
    return {
      ok: false,
      error: "Your balance changed while we were working. Nothing was spent — try again.",
    };
  }

  revalidatePath("/swag");
  revalidatePath("/sand-dollars");
  revalidatePath("/", "layout"); // the header pill shows the balance
  return {
    ok: true,
    message: `Redeemed! Mahalo — we'll get your ${item.name} out to you.`,
  };
}

/* ---- Buy a Paddle Back Out day ------------------------------------------- */

export async function buyPaddleOut(): Promise<SwagResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const service = createServiceClient();

  const { data: settings, error: settingsError } = await service
    .from("game_settings")
    .select("sand_paddle_out_price, paddle_out_cap")
    .limit(1)
    .maybeSingle();
  if (settingsError) return { ok: false, error: settingsError.message };
  if (!settings) return { ok: false, error: "Settings unavailable." };

  const price = Number(settings.sand_paddle_out_price);
  const cap = Number(settings.paddle_out_cap);

  const { data: swell } = await service
    .from("swell")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const held = Number(swell?.paddle_out_available ?? 0);
  if (held >= cap) {
    return {
      ok: false,
      error: `Your bank is full — you're holding ${held}. Spend one on a missed day and you can buy another.`,
    };
  }

  const balance = await readBalance(service, user.id);
  if (balance < price) {
    const gap = price - balance;
    return {
      ok: false,
      error: `A Paddle Back Out day costs ${price.toLocaleString()} — you're ${gap.toLocaleString()} away.`,
    };
  }

  // Debit first so a failure leaves nothing granted, then grant.
  const { data: entry, error: ledgerError } = await service
    .from("sand_dollar_entry")
    .insert({
      user_id: user.id,
      amount: -price,
      reason: "paddle_out_purchase",
      // The note is the ledger's detail line. "Purchased" separates this from
      // the free monthly allowance; the arrow says what the 500 bought.
      note: `Purchased (${held} → ${held + 1})`,
    })
    .select("id")
    .maybeSingle();

  if (ledgerError) return { ok: false, error: ledgerError.message };

  const { error: grantError } = await service.from("swell").upsert(
    {
      user_id: user.id,
      current_len: Number(swell?.current_len ?? 0),
      longest_len: Number(swell?.longest_len ?? 0),
      last_completed_on: swell?.last_completed_on ?? null,
      paddle_out_available: held + 1,
      paddle_out_last_granted: swell?.paddle_out_last_granted ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (grantError) {
    // Refund: they were charged for something they didn't get.
    if (entry?.id) {
      await service.from("sand_dollar_entry").delete().eq("id", entry.id);
    }
    return { ok: false, error: grantError.message };
  }

  // History (0021). Deliberately best-effort and last: the day is already
  // bought and banked, and a missing audit row must never cost someone 500
  // Sand Dollars. The screen reconciles against the counter and says when
  // rows are missing, so this fails loudly in the UI rather than silently.
  await service.from("paddle_out_entry").insert({
    user_id: user.id,
    delta: 1,
    kind: "purchased",
    ref_id: entry?.id ?? null,
    note: `Purchased (${held} → ${held + 1})`,
  });

  revalidatePath("/swag");
  revalidatePath("/streak");
  revalidatePath("/sand-dollars");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Banked. You're holding ${held + 1} Paddle Back Out ${held + 1 === 1 ? "day" : "days"}.`,
  };
}

/* ---- Shared -------------------------------------------------------------- */

async function readBalance(
  service: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<number> {
  const { data } = await service
    .from("sand_dollar_balance")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return Number(data?.balance ?? 0);
}
