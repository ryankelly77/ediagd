import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BadgeGrid, type BadgeTile } from "@/components/badges/BadgeGrid";

export default async function BadgesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // badge is public reference data; user_badge is owner-readable (0012).
  const [{ data: catalog }, { data: earned }] = await Promise.all([
    supabase.from("badge").select("key, name, description, ring, sand_dollars"),
    supabase.from("user_badge").select("badge_key, earned_on").eq("user_id", user.id),
  ]);

  const earnedByKey = new Map(
    (earned ?? []).map((e) => [e.badge_key as string, e.earned_on as string])
  );

  const tiles: BadgeTile[] = (catalog ?? []).map((b) => ({
    key: b.key as string,
    name: b.name as string,
    description: (b.description as string | null) ?? null,
    ring: (b.ring as string) === "gold" ? "gold" : "seafoam",
    sandDollars: Number(b.sand_dollars ?? 0),
    earnedOn: earnedByKey.get(b.key as string) ?? null,
  }));

  // Earned first, then the rest — the wall should read as achievement, not gaps.
  tiles.sort((a, b) => {
    if (Boolean(a.earnedOn) !== Boolean(b.earnedOn)) return a.earnedOn ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const earnedCount = tiles.filter((t) => t.earnedOn).length;

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Your badges
      </h1>
      <p className="mt-1 text-2xl font-extrabold text-navy">
        {earnedCount} of {tiles.length} earned
      </p>

      <BadgeGrid tiles={tiles} />
    </main>
  );
}
