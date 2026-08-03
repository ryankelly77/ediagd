import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { RooftopList } from "@/components/admin/RooftopList";
import { BRAND, ENGAGEMENT_TARGET } from "@/lib/brand";
import { firstName } from "@/lib/advisor";
import {
  summarizeGroup,
  summarizeRooftop,
  type AdvisorEngagement,
} from "@/lib/admin";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // ---- Which rooftops does this person own/administer? ---------------------
  // Scoped to rooftops where they hold 'admin' specifically — my_rooftops()
  // would also include stores where they're merely an advisor.
  const { data: adminMemberships } = await supabase
    .from("membership")
    .select("rooftop_id, app_user:user_id(full_name)")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("active", true);

  if (!adminMemberships || adminMemberships.length === 0) {
    return <NotAnAdmin />;
  }

  const rooftopIds = [
    ...new Set(adminMemberships.map((m) => m.rooftop_id as string)),
  ];

  // PostgREST types the embed as an array; it's a to-one join in practice.
  const viewerEmbed = adminMemberships[0]?.app_user as unknown;
  const viewerUser = (Array.isArray(viewerEmbed) ? viewerEmbed[0] : viewerEmbed) as
    | { full_name: string | null }
    | null
    | undefined;
  const adminName = viewerUser?.full_name ?? user.email ?? "there";

  // ---- Engagement rows + the people behind them ---------------------------
  const [
    { data: rooftopRows },
    { data: engagementRows, error: engagementError },
    { data: advisorMemberships },
  ] = await Promise.all([
    supabase.from("rooftop").select("id, name").in("id", rooftopIds),
    supabase
      .from("user_engagement")
      .select(
        "user_id, rooftop_id, working_days, days_logged_in, videos_watched, login_rate_pct, watch_rate_pct, engagement_score"
      )
      .in("rooftop_id", rooftopIds),
    supabase
      .from("membership")
      .select("user_id, rooftop_id, app_user:user_id(full_name)")
      .in("rooftop_id", rooftopIds)
      .eq("role", "advisor")
      .eq("active", true),
  ]);

  // 0009 may not be applied yet — say so plainly rather than rendering zeros
  // that look like nobody is using the product.
  if (engagementError) {
    return <EngagementUnavailable message={engagementError.message} />;
  }

  // (user_id, rooftop_id) -> advisor name. Admins can read teammate profiles
  // as of 0008; anyone unresolved falls back to a neutral label.
  const advisorKeys = new Set<string>();
  const nameByUser = new Map<string, string | null>();
  for (const row of advisorMemberships ?? []) {
    advisorKeys.add(`${row.user_id}:${row.rooftop_id}`);
    const embed = row.app_user as unknown;
    const named = (Array.isArray(embed) ? embed[0] : embed) as
      | { full_name: string | null }
      | null
      | undefined;
    nameByUser.set(row.user_id as string, named?.full_name ?? null);
  }

  const byRooftop = new Map<string, AdvisorEngagement[]>();
  for (const row of engagementRows ?? []) {
    const userId = row.user_id as string;
    const rooftopId = row.rooftop_id as string;
    // Engagement is tracked for every member; this screen reports on advisors.
    if (!advisorKeys.has(`${userId}:${rooftopId}`)) continue;

    const list = byRooftop.get(rooftopId) ?? [];
    list.push({
      userId,
      name: nameByUser.get(userId)?.trim() || "Advisor",
      workingDays: Number(row.working_days ?? 0),
      daysLoggedIn: Number(row.days_logged_in ?? 0),
      videosWatched: Number(row.videos_watched ?? 0),
      loginRatePct: Number(row.login_rate_pct ?? 0),
      watchRatePct: Number(row.watch_rate_pct ?? 0),
      engagementScore: Number(row.engagement_score ?? 0),
    });
    byRooftop.set(rooftopId, list);
  }

  const nameByRooftop = new Map(
    (rooftopRows ?? []).map((r) => [r.id as string, r.name as string])
  );

  const group = summarizeGroup(
    rooftopIds.map((id) =>
      summarizeRooftop(id, nameByRooftop.get(id) ?? "Rooftop", byRooftop.get(id) ?? [])
    )
  );

  // Working days are per rooftop; show the widest window we're reporting on.
  const workingDays = Math.max(
    0,
    ...group.rooftops.flatMap((r) => r.advisors.map((a) => a.workingDays))
  );

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      {/* ---- Header ------------------------------------------------------ */}
      <header className="flex items-center gap-3">
        <img
          src="/brand/svg/ediagd-mark-primary-light.svg"
          alt=""
          className="h-10 w-auto"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold text-navy">
            {BRAND.greeting}, {firstName(adminName)}
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-soft">
            {BRAND.tagline}
          </p>
          <p className="truncate text-xs text-ink-soft">
            {group.rooftops.length}{" "}
            {group.rooftops.length === 1 ? "rooftop" : "rooftops"}
            {workingDays > 0 ? ` · last ${workingDays} working days` : ""}
          </p>
        </div>
        <span className="rounded-pill bg-gold-soft px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-navy">
          Owner
        </span>
      </header>

      {/* ---- Group summary ------------------------------------------------ */}
      <section className="mt-5 rounded-card bg-navy p-5 shadow-card">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
          Group engagement
        </p>

        {group.averageScore != null ? (
          <>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tight text-white">
                {group.averageScore}
              </span>
              <span className="text-sm font-bold text-ice-dim">
                avg score · target {ENGAGEMENT_TARGET}
              </span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ice-dim">
              <span className="font-extrabold text-white">
                {group.engagedCount} of {group.advisorCount}
              </span>{" "}
              {group.advisorCount === 1 ? "advisor is" : "advisors are"} engaged
              this period across{" "}
              {group.rooftops.length === 1
                ? "your rooftop"
                : `${group.rooftops.length} rooftops`}
              .
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ice-dim">
            No activity recorded yet. Engagement fills in here as advisors start
            logging in and watching their daily videos.
          </p>
        )}
      </section>

      {/* ---- Per-rooftop --------------------------------------------------- */}
      <section className="mt-5">
        <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Rooftops
        </h2>
        <RooftopList rooftops={group.rooftops} />
      </section>
    </main>
  );
}

/** Signed in, but not an admin anywhere. */
function NotAnAdmin() {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">
          This screen is for owners/admins
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Your account isn&apos;t set up as an admin at a rooftop. If you own or
          run the group, ask your EDIAGD contact to add the role.
        </p>
      </Card>
    </main>
  );
}

/** The engagement view isn't reachable (migration not applied, or no access). */
function EngagementUnavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">
          Engagement isn&apos;t switched on yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We can&apos;t read activity data for your rooftops right now, so there
          are no numbers to show. Once daily activity is being recorded, this
          screen fills in on its own.
        </p>
        <p className="mt-3 text-xs text-ink-soft">Detail: {message}</p>
      </Card>
    </main>
  );
}
