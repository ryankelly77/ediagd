import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
import { SwagShack } from "@/components/swag/SwagShack";
import type { Redemption, SwagItem } from "@/lib/swag";

export default async function SwagPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: itemRows },
    { data: balanceRow },
    { data: redemptionRows },
    { data: settings },
    { data: swell },
  ] = await Promise.all([
    // RLS shows active items only to a normal user (0018).
    supabase
      .from("swag_item")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("sand_dollar_balance")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("swag_redemption")
      .select("id, price_paid, variant, shipping_note, status, created_at, fulfilled_at, swag_item:swag_item_id(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("game_settings")
      .select("sand_paddle_out_price, paddle_out_cap")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("swell")
      .select("paddle_out_available")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const items: SwagItem[] = (itemRows ?? []).map((r) => ({
    id: r.id as string,
    key: r.key as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    price: Number(r.price_sand_dollars ?? 0),
    variants: (r.variants as string | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    active: Boolean(r.active),
  }));

  const redemptions: Redemption[] = (redemptionRows ?? []).map((r) => {
    const embed = r.swag_item as unknown;
    const item = (Array.isArray(embed) ? embed[0] : embed) as
      | { name: string | null }
      | null
      | undefined;
    return {
      id: r.id as string,
      itemName: item?.name ?? "Swag",
      pricePaid: Number(r.price_paid ?? 0),
      variant: (r.variant as string | null) ?? null,
      shippingNote: (r.shipping_note as string | null) ?? null,
      status: r.status as Redemption["status"],
      createdAt: r.created_at as string,
      fulfilledAt: (r.fulfilled_at as string | null) ?? null,
    };
  });

  const balance = Number(balanceRow?.balance ?? 0);

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <section className="ediagd-hero">
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">Swag Shack</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white">
            Earned, never bought
          </h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-ice-dim">
            <SandDollarIcon size={18} />
            <span>
              You have{" "}
              <span className="ediagd-numeral font-extrabold text-white">
                {balance.toLocaleString()}
              </span>{" "}
              to spend
            </span>
          </p>
        </div>
      </section>

      <SwagShack
        items={items}
        balance={balance}
        redemptions={redemptions}
        paddleOutPrice={Number(settings?.sand_paddle_out_price ?? 500)}
        paddleOutHeld={Number(swell?.paddle_out_available ?? 0)}
        paddleOutCap={Number(settings?.paddle_out_cap ?? 5)}
      />
    </main>
  );
}
