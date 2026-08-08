import { redirect } from "next/navigation";
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

  // ---- Blocking onboarding ------------------------------------------------
  // ONE gate for every signed-in screen, rather than a check sprinkled through
  // each page. It lives here rather than in app/page.tsx because that route
  // only guards the bare domain — a tab-bar tap or a bookmarked /streak would
  // sail straight past it, and a blocking screen you can tap around isn't one.
  //
  // /onboarding sits outside this route group precisely so this can be
  // unconditional: no pathname sniffing, no way to accidentally exempt a route.
  const { data: schedule } = await supabase
    .from("work_schedule")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!schedule) redirect("/onboarding");

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

  // The bell's number. head:true counts in Postgres and transfers no rows, and
  // RLS (0030) scopes it to this user's own mail without a filter here.
  const { count: unreadCount } = await supabase
    .from("notification")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

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
  //
  // The fifth slot is role-dependent: someone who coaches a team gets Team;
  // a plain advisor has no use for it, so they get the Swag Shack instead.
  // Swag stays in More for BOTH, so managers keep a path to it.
  const leadsTeam = isManager || isAdmin;
  const tabs: Tab[] = [
    { href: todayHref, label: "Today", icon: "sun", match: ["/today", "/advisor"] },
    // Sand Dollars hangs off the Swell, so the Streak tab stays lit there.
    { href: "/streak", label: "Streak", icon: "wave", match: ["/streak", "/sand-dollars"] },
    { href: "/badges", label: "Badges", icon: "shell", match: ["/badges"] },
    leadsTeam
      ? { href: "/manager", label: "Team", icon: "team" as const, match: ["/manager"] }
      : { href: "/swag", label: "Swag", icon: "swag" as const, match: ["/swag"] },
    { href: "/more", label: "More", icon: "more", match: ["/more", "/admin"] },
  ];

  return (
    <>
      <AppHeader
        initials={initialsFor(displayName)}
        balance={balance}
        unreadCount={Number(unreadCount ?? 0)}
      />
      {children}
      <TabBar tabs={tabs} showAdminInMore={isAdmin} />
    </>
  );
}
