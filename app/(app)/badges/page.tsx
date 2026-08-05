import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { BADGES, NOW_BADGE_KEYS } from "@/lib/badges";
import { loadBadgeRewards } from "@/lib/badge-rewards";

export default async function BadgesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // What this user has actually earned (owner-readable, 0012). The badge SET
  // itself comes from lib/badges.ts so every badge is visible — including the
  // ones whose feature doesn't exist yet, which the wall marks "Coming soon".
  const { data: earned } = await supabase
    .from("user_badge")
    .select("badge_key, earned_on")
    .eq("user_id", user.id);

  // Real amounts, from game_settings / the catalog — never hardcoded.
  const rewards = await loadBadgeRewards(supabase);

  const earnedByKey = Object.fromEntries(
    (earned ?? []).map((e) => [e.badge_key as string, e.earned_on as string])
  );

  const earnedCount = Object.keys(earnedByKey).length;
  const earnableCount = NOW_BADGE_KEYS.length;

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="ediagd-eyebrow">Your badges</h1>
      <p className="mt-1 text-2xl font-extrabold text-navy">
        <span className="ediagd-numeral">{earnedCount}</span> of{" "}
        <span className="ediagd-numeral">{earnableCount}</span> earned
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {BADGES.length} badges in the system — more unlock as new features land.
      </p>

      <BadgeGrid earnedByKey={earnedByKey} rewards={rewards} />
    </main>
  );
}
