import { redirect } from "next/navigation";
import { markActiveToday } from "@/lib/engagement/mark-active";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/AppHeader";
import { TabBar, type Tab } from "@/components/nav/TabBar";
import { DayRollover } from "@/components/nav/DayRollover";
import { SwipeNavigation } from "@/components/nav/SwipeNavigation";
import type { IsoDate } from "@/lib/gamification/streak";
import { loadScheduleContext, restDayFor, type RestDay } from "@/lib/work-schedule";
import { swellAsOf } from "@/lib/gamification/streak";
import { TAB_ROUTES } from "@/lib/navigation";

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
  const [{ data: memberships }, { data: profile }, { data: balanceRow }, { data: swell }] =
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
      /* THE SAME ROW /streak READS. The chip renders this value and does not
         recompute it — if the two could disagree, that is a chip bug. */
      supabase
        .from("swell")
        .select("current_len, longest_len, last_completed_on, paddle_out_available, paddle_out_last_granted")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  /*
   * ---- THE APP NOTICES SOMEBODY OPENED IT --------------------------------
   *
   * Here rather than on /today, because engagement means "opened the app" and
   * a manager who lives on /manager never opens /today. This layout wraps every
   * signed-in screen, which is the same reason the onboarding gate sits here.
   *
   * NOT AWAITED. It is bookkeeping; the page does not need its result and must
   * not wait on a round trip to render. It cannot throw — see markActiveToday.
   *
   * Role-blind: advisor, manager and technician all count.
   */
  const activeRooftop = (memberships ?? [])[0]?.rooftop_id as string | undefined;
  if (activeRooftop) void markActiveToday(user.id, activeRooftop);

  // The bell's number. head:true counts in Postgres and transfers no rows, and
  // RLS (0030) scopes it to this user's own mail without a filter here.
  const { count: unreadCount } = await supabase
    .from("notification")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  const displayName = profile?.full_name ?? user.email ?? "there";
  /*
   * Filled in below, once we know the rooftop's date and this advisor's
   * schedule. NOT `swell.current_len` — that only moves on completion, so the
   * chip used to wear a number that had been dead since the last missed work
   * day. See swellAsOf in lib/gamification/streak.ts.
   *
   * Zero until proven otherwise: with no rooftop there is no date to judge
   * liveness against, and a chip is not worth a number nothing has checked.
   */
  let streak = 0;
  const balance = balanceRow?.balance == null ? null : Number(balanceRow.balance);

  const roles = new Set((memberships ?? []).map((m) => m.role as string));
  const isManager = roles.has("manager");
  const isAdmin = roles.has("admin");

  // The Today tab points at the ritual until it's done, then at the numbers —
  // so the tab is always "where today lives" rather than a dead end.
  let todayHref = "/today";
  // Handed to DayRollover so a webview left open overnight notices. Both stay
  // null when there is no rooftop, which is the case where there is no
  // "today" to be stale about.
  let renderedDate: string | null = null;
  let rooftopTz: string | null = null;
  /*
   * ---- WHAT THE STREAK CHIP NEEDS BESIDES THE NUMBER ----------------------
   *
   * Both default to the working-day, not-yet-done form, which is the honest
   * answer when there is no rooftop to ask: no rooftop means no closure
   * calendar and no "today" worth being confident about, and a chip that
   * claimed a rest day on a hunch would tell somebody their Swell was safe
   * when nothing had checked.
   */
  let restToday: RestDay | null = null;
  let completedToday = false;
  const rooftopId = memberships?.[0]?.rooftop_id as string | undefined;
  if (rooftopId) {
    const [{ data: todayRaw }, { data: rooftopRow }] = await Promise.all([
      supabase.rpc("rooftop_today", { _rooftop: rooftopId }),
      supabase.from("rooftop").select("timezone").eq("id", rooftopId).maybeSingle(),
    ]);
    const { data: settingsRow } = await supabase
      .from("game_settings")
      .select("paddle_out_per_month, paddle_out_cap")
      .limit(1)
      .maybeSingle();
    const today =
      (todayRaw as IsoDate | null) ?? new Date().toISOString().slice(0, 10);
    renderedDate = today;
    rooftopTz = (rooftopRow?.timezone as string | null) ?? null;

    /* restDayFor over the SAME context /today builds its rest card from —
       schedule, booked Island Time, and confirmed closures for this rooftop.
       Three reasons, one answer, so the chip and the rest card can never
       disagree about whether somebody is resting. */
    const [{ data: done }, context] = await Promise.all([
      supabase
        .from("daily_completion")
        .select("id")
        .eq("user_id", user.id)
        .eq("completion_date", today)
        .maybeSingle(),
      loadScheduleContext(supabase, user.id, rooftopId),
    ]);
    completedToday = Boolean(done);
    if (done) todayHref = "/advisor";
    restToday = restDayFor(today as IsoDate, context);

    /* The chip asks the engine, over the context it just loaded for restDayFor
       — so the chip, the rest card and the Swell screen cannot disagree. */
    streak = swellAsOf(
      {
        currentLen: Number(swell?.current_len ?? 0),
        longestLen: Number(swell?.longest_len ?? 0),
        lastCompletedOn: (swell?.last_completed_on as IsoDate | null) ?? null,
        paddleOutAvailable: Number(swell?.paddle_out_available ?? 0),
        paddleOutLastGranted:
          (swell?.paddle_out_last_granted as IsoDate | null) ?? null,
      },
      today as IsoDate,
      {
        paddleOutCap: Number(settingsRow?.paddle_out_cap ?? 0),
        paddleOutPerMonth: Number(settingsRow?.paddle_out_per_month ?? 0),
        sandDailyLoop: 0,
        sandSwell7: 0,
        sandSwell30: 0,
        sandSwell90: 0,
        sandSwell365: 0,
        sandBadge: 0,
        sandCertification: 0,
      },
      context
    ).current;
  }

  // Max 5 tabs. Admin lives inside More rather than taking a slot, so a
  // manager-admin doesn't overflow the bar.
  //
  // ---- THE FOURTH SLOT IS THE ROLE-DEPENDENT ONE --------------------------
  //
  // Certs is permanent for everybody: what an advisor has earned is theirs, and
  // it belongs beside the streak rather than three taps down a drawer.
  //
  // What it displaced differs by role, because the two roles were not using the
  // same tab for the same kind of thing:
  //
  //   advisor  Today · Streak · Certs · Badges · More
  //            Swag leaves the bar. It is a shop — visited when there is
  //            something to spend on, not daily — and it keeps its row in More.
  //
  //   manager  Today · Streak · Certs · Team · More
  //            BADGES leaves the bar, not Team. A manager checks their roster
  //            constantly and it must not be buried, whereas badges are a
  //            surface people are notified INTO rather than one they navigate
  //            to. Badges keeps a row in More for managers, so nothing the bar
  //            drops becomes unreachable — see MANAGER_EXTRA_SECTIONS.
  const leadsTeam = isManager || isAdmin;
  const tabs: Tab[] = [
    { href: todayHref, label: "Today", icon: "sun", match: [TAB_ROUTES.today, TAB_ROUTES.advisor] },
    // Sand Dollars hangs off the Swell, so the Streak tab stays lit there.
    { href: TAB_ROUTES.streak, label: "Streak", icon: "wave", match: [TAB_ROUTES.streak, "/sand-dollars"] },
    /* "Certs", not "Certifications" — the bar has five labels to fit and the
       longest one sets the floor at the largest text sizes. */
    { href: TAB_ROUTES.certifications, label: "Certs", icon: "seal", match: [TAB_ROUTES.certifications] },
    leadsTeam
      ? { href: TAB_ROUTES.manager, label: "Team", icon: "team" as const, match: [TAB_ROUTES.manager] }
      : { href: TAB_ROUTES.badges, label: "Badges", icon: "shell" as const, match: [TAB_ROUTES.badges] },
    // fallback: More is a drawer. Everything reached through it — Saved, the
    // libraries, Your Group, profile, notifications — keeps it lit, without
    // each new page behind it having to be remembered here. See TabBar.
    {
      href: TAB_ROUTES.more,
      label: "More",
      icon: "more",
      match: ["/more", "/admin"],
      fallback: true,
      /* The bell's job, reduced to its useful half. See Tab.dot in TabBar. */
      dot: Number(unreadCount ?? 0) > 0,
    },
  ];

  return (
    <>
      {/* Renders nothing. Watches for the rooftop's midnight and refreshes the
          server components once it passes, so a shell nobody closes stops
          showing yesterday. */}
      {renderedDate && rooftopTz && (
        <DayRollover serverDate={renderedDate} timezone={rooftopTz} />
      )}
      {/* Renders nothing. Adds the full-screen swipe that the system's
          edge-only gesture does not cover — see SwipeNavigation. */}
      <SwipeNavigation />
      <AppHeader
        balance={balance}
        streak={streak}
        rest={restToday}
        completedToday={completedToday}
      />
      {children}
      <TabBar tabs={tabs} showAdminInMore={isAdmin} />
    </>
  );
}
