import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { SwagAdmin, type QueueRow } from "@/components/admin/swag/SwagAdmin";
import type { SwagItem } from "@/lib/swag";

export default async function AdminSwagPage() {
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  const [{ data: redemptionRows }, { data: itemRows }] = await Promise.all([
    // Admin RLS (0018) opens the whole queue; the embeds name the advisor and
    // the item so the queue reads without extra lookups.
    supabase
      .from("swag_redemption")
      .select(
        "id, price_paid, variant, shipping_note, status, created_at, swag_item:swag_item_id(name, image_url), app_user:user_id(full_name)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("swag_item").select("*").order("sort_order", { ascending: true }),
  ]);

  const queue: QueueRow[] = (redemptionRows ?? []).map((r) => {
    const itemEmbed = r.swag_item as unknown;
    const item = (Array.isArray(itemEmbed) ? itemEmbed[0] : itemEmbed) as
      | { name: string | null; image_url: string | null }
      | null
      | undefined;
    const userEmbed = r.app_user as unknown;
    const person = (Array.isArray(userEmbed) ? userEmbed[0] : userEmbed) as
      | { full_name: string | null }
      | null
      | undefined;

    return {
      id: r.id as string,
      advisorName: person?.full_name?.trim() || "Advisor",
      itemName: item?.name ?? "Swag",
      itemImageUrl: item?.image_url ?? null,
      pricePaid: Number(r.price_paid ?? 0),
      variant: (r.variant as string | null) ?? null,
      shippingNote: (r.shipping_note as string | null) ?? null,
      status: r.status as QueueRow["status"],
      createdAt: r.created_at as string,
    };
  });

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

  const awaiting = queue.filter((r) => r.status === "requested").length;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Swag Shack"
        subtitle={`${awaiting} awaiting fulfillment · ${items.length} items in the catalog`}
      />

      <SwagAdmin queue={queue} items={items} />
    </main>
  );
}
