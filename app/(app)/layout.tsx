import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/AppHeader";
import { TabBar, type Tab } from "@/components/nav/TabBar";
import type { IsoDate } from "@/lib/gamification/streak";

/** First letter of the name (or email) for the avatar. */
function initialsFor(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

/**
 * Shell for every signed-in screen. Resolves the viewer's roles server-side and
 * hands the client nav a finished tab list — the nav never queries.
 *
 * The bar hides itself on /today (immersive daily flow); see TabBar.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out: the pages themselves redirect to /login, so render bare.
  if (!user) return <>{children}</>;

  // Everything the header needs, resolved once for every screen in the group.
  const [{ data: memberships }, { data: profile }, { data: balanceRow }] =
    await Promise.all([
      supabase
        .from("membership")
        .select("rooftop_id, role")
        .eq("user_id", user.id)
        .eq("active", true),
      supabase
        .from("app_user")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      // RLS: the owner reads their own balance (0012).
      supabase
        .from("sand_dollar_balance")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const displayName = profile?.full_name ?? user.email ?? "there";
  const balance = balanceRow?.balance == null ? null : Number(balanceRow.balance);

  const roles = new Set((memberships ?? []).map((m) => m.role as string));
  const isManager = roles.has("manager");
  const isAdmin = roles.has("admin");

  // The Today tab points at the ritual until it's done, then at the numbers —
  // so the tab is always "where today lives" rather than a dead end.
  let todayHref = "/today";
  const rooftopId = memberships?.[0]?.rooftop_id as string | undefined;
  if (rooftopId) {
    const { data: todayRaw } = await supabase.rpc("rooftop_today", {
      _rooftop: rooftopId,
    });
    const today =
      (todayRaw as IsoDate | null) ?? new Date().toISOString().slice(0, 10);
    const { data: done } = await supabase
      .from("daily_completion")
      .select("id")
      .eq("user_id", user.id)
      .eq("completion_date", today)
      .maybeSingle();
    if (done) todayHref = "/advisor";
  }

  // Max 5 tabs. Admin lives inside More rather than taking a slot, so a
  // manager-admin doesn't overflow the bar.
  const tabs: Tab[] = [
    { href: todayHref, label: "Today", icon: "sun", match: ["/today", "/advisor"] },
    { href: "/streak", label: "Streak", icon: "wave", match: ["/streak"] },
    { href: "/badges", label: "Badges", icon: "shell", match: ["/badges"] },
    ...(isManager
      ? [{ href: "/manager", label: "Team", icon: "team" as const, match: ["/manager"] }]
      : []),
    { href: "/more", label: "More", icon: "more", match: ["/more", "/admin"] },
  ];

  return (
    <>
      <AppHeader initials={initialsFor(displayName)} balance={balance} />
      {children}
      <TabBar tabs={tabs} showAdminInMore={isAdmin} />
    </>
  );
}
