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
      {/*
        BOTH NUMBERS, BECAUSE ONE OF THEM ALONE RAISES A QUESTION.

        This read "4 of 9 earned" with "19 badges in the system" directly
        underneath, and Ryan asked the obvious thing: shouldn't it be 4 of 19?

        It should not. 10 of the 19 are status 'future' — the platform cannot
        yet DETECT them, because there are no lessons, no period history, no
        team tracking and no certifications behind them. A denominator of 19
        would set a bar that is unreachable for reasons that are nothing to do
        with the advisor, which is the exact thing lib/badges.ts says the
        "Coming soon" marking exists to avoid.

        So the fix was never the arithmetic, it was that two numbers sat next
        to each other with nothing explaining why they differed. Now the
        headline carries both — what you can chase today, and what the wall
        holds — and the line beneath says what closes the gap. Those features
        arrive with the LMS before launch, at which point earnable climbs on
        its own and this copy still reads true.
      */}
      <p className="mt-1 text-2xl font-extrabold text-navy">
        <span className="ediagd-numeral">{earnedCount}</span> of{" "}
        <span className="ediagd-numeral">{earnableCount}</span> earnable
        <span className="text-ink-soft">
          {" · "}
          <span className="ediagd-numeral">{BADGES.length}</span> total
        </span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {BADGES.length - earnableCount} more unlock as lessons, team tracking
        and certifications land.
      </p>

      <BadgeGrid earnedByKey={earnedByKey} rewards={rewards} />
    </main>
  );
}
