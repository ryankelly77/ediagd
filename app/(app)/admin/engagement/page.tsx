import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { AdvisorDetail } from "@/components/admin/AdvisorDetail";
import { DistributionDonut } from "@/components/admin/DistributionDonut";
import { EngagementHero } from "@/components/admin/EngagementHero";
import { EngagementList, type EngagementRow } from "@/components/admin/EngagementList";
import { RollupStamp } from "@/components/admin/RollupStamp";
import { loadAdvisorDetails, rooftopToday } from "@/lib/admin-advisor-detail";
import {
  LIST_PAGE_STEP,
  loadAdvisors,
  loadRooftops,
  loadScope,
  loadSummary,
  parseBand,
  resolveLimit,
} from "@/lib/admin-engagement";

/* ============================================================================
   EDIAGD — /admin/engagement

   AGGREGATE -> EXCEPTIONS -> DETAIL ON DEMAND. This screen must read the same
   for a dealer admin with one rooftop and a platform owner with hundreds, so
   it never enumerates anything: a headline number, a distribution, and the
   bottom ten. Everything else is behind search or a tap.

   Every number here is computed by the 0026 views in Postgres. Three queries
   run regardless of scale — one scope row, one summary row, and one page of at
   most ten list rows. See lib/admin-engagement.ts for why that matters.
   ============================================================================ */

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    band?: string;
    q?: string;
    show?: string;
    /** The people section pages on its own, so "Show more" moves one list. */
    pshow?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { band: bandParam, q, show, pshow } = await searchParams;
  const band = parseBand(bandParam);
  const search = q?.trim() || null;
  const limit = resolveLimit(show);

  // Scope comes from the database (admin_rooftops()), so a dealer admin sees
  // only the rooftops they administer and the platform owner sees everything —
  // without this page ever holding a list of rooftop ids.
  const scope = await loadScope(supabase);
  if (scope.rooftopCount === 0) return <NotAnAdmin />;

  const summary = await loadSummary(supabase);
  if (!summary) return <EngagementUnavailable />;

  // Only the platform owner may force a recalculation — 0028's function refuses
  // anyone else, so showing the control to a dealer admin would be a button
  // that always fails.
  const { data: profile } = await supabase
    .from("app_user")
    .select("is_platform_owner")
    .eq("id", user.id)
    .maybeSingle();
  const isPlatformOwner = Boolean(profile?.is_platform_owner);

  // One rooftop: skip the rooftop level entirely rather than making someone
  // tap through a list of one.
  const advisorLevel = scope.singleRooftop;

  const rows: EngagementRow[] = [];
  let total = 0;

  if (advisorLevel) {
    const { rows: advisors, total: count } = await loadAdvisors(supabase, {
      band,
      search,
      limit,
    });
    total = count;

    // One rooftop, so one calendar: every row shares the store's today, and the
    // detail for all of them comes back in a single batch.
    const today = advisors[0]
      ? await rooftopToday(supabase, advisors[0].rooftopId)
      : null;
    const details = today
      ? await loadAdvisorDetails(supabase, advisors.map((a) => a.userId), today)
      : new Map();

    for (const a of advisors) {
      const detail = details.get(a.userId);
      rows.push({
        id: a.userId,
        name: a.advisorName,
        score: a.score,
        band: a.band,
        detail: `${a.daysLoggedIn} of ${a.workingDays} days`,
        expand:
          detail && today ? (
            <AdvisorDetail
              detail={detail}
              loginRatePct={a.loginRatePct}
              watchRatePct={a.watchRatePct}
              today={today}
            />
          ) : undefined,
      });
    }
  } else {
    const { rows: rooftops, total: count } = await loadRooftops(supabase, {
      band,
      search,
      limit,
    });
    total = count;
    for (const r of rooftops) {
      rows.push({
        id: r.rooftopId,
        name: r.rooftopName,
        score: r.avgScore,
        band: r.band,
        detail:
          r.nudgeCount > 0
            ? `${r.advisorCount} advisors · ${r.nudgeCount} need attention`
            : `${r.advisorCount} advisors`,
        href: `/admin/rooftop/${r.rooftopId}`,
      });
    }
  }

  // A group admin searching by name means a person as often as a store, so the
  // query runs against both. People are a section of their own rather than
  // rows mixed into the rooftop list, because a 41 next to a store name and a
  // 41 next to a person's name aren't the same number.
  //
  // Only while searching: with no query this would be every advisor in the
  // group, which is the enumeration this screen exists to avoid.
  const peopleLimit = resolveLimit(pshow);
  const people: EngagementRow[] = [];
  let peopleTotal = 0;

  if (search && !advisorLevel) {
    const { rows: matches, total: count } = await loadAdvisors(supabase, {
      band,
      search,
      limit: peopleLimit,
    });
    peopleTotal = count;
    for (const a of matches) {
      people.push({
        // Keyed by both: someone can be an advisor at two rooftops.
        id: `${a.userId}:${a.rooftopId}`,
        name: a.advisorName,
        score: a.score,
        band: a.band,
        detail: `${a.rooftopName} · ${a.daysLoggedIn} of ${a.workingDays} days`,
        // Land on their rooftop with the search carried over, so the row they
        // tapped is the row they see.
        href: buildHref(`/admin/rooftop/${a.rooftopId}`, { q: a.advisorName }),
      });
    }
  }

  const noun = advisorLevel ? "advisors" : "rooftops";
  /*
   * THE DONUT MUST TOTAL THE HERO. At rooftop level the three engagement bands
   * only cover stores that appear in engagement_rollup; the rest are added
   * back as "Not started" so the segments sum to the rooftop count in the
   * headline. At advisor level there is no equivalent — an advisor with no
   * account is not an advisor the app knows about — so the fourth band is
   * zero there and simply does not render.
   */
  const counts = advisorLevel
    ? { ...summary.advisorBands, not_started: 0 }
    : { ...summary.rooftopBands, not_started: scope.notStarted };

  const scopeLine = [
    `${scope.rooftopCount.toLocaleString()} ${
      scope.rooftopCount === 1 ? "rooftop" : "rooftops"
    }`,
    // "534 advisors" counted app users with an advisor role. The 73 DMS roster
    // advisors have no logins and are correctly excluded — but the label has to
    // say which population it is, or the number reads as "every advisor".
    `${summary.advisorCount.toLocaleString()} ${
      summary.advisorCount === 1 ? "advisor with an account" : "advisors with accounts"
    }`,
    summary.workingDays > 0
      ? `last ${summary.workingDays} working days`
      : "no activity yet",
  ].join(" · ");

  const query = {
    q: search ?? undefined,
    show: show || undefined,
    pshow: pshow || undefined,
  };
  // Each "Show more" grows its own list and leaves the other where it was.
  const moreHref = buildHref("/admin/engagement", {
    ...query,
    band: band ?? undefined,
    show: String(limit + LIST_PAGE_STEP),
  });
  const peopleMoreHref = buildHref("/admin/engagement", {
    ...query,
    band: band ?? undefined,
    pshow: String(peopleLimit + LIST_PAGE_STEP),
  });

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Engagement"
      />

      {/* ---- 1. The headline -------------------------------------------- */}
      <div className="mt-4">
        <EngagementHero score={summary.avgScore} scopeLine={scopeLine} />
      </div>

      <RollupStamp computedAt={summary.computedAt} canRefresh={isPlatformOwner} />

      {/* ---- 2. Distribution — tap a band to filter the list ------------ */}
      {/* Eleven stores have performance data and nobody invited yet. Said out
          loud, because a segment an admin cannot explain is worse than none. */}
      {!advisorLevel && scope.notStartedWithData > 0 && (
        <p className="mt-3 px-1 text-xs leading-relaxed text-ink-soft">
          {`${scope.notStartedWithData} of the ${scope.notStarted} “not started” rooftops already have performance data loaded — they are waiting on accounts, not on activity.`}
        </p>
      )}

      <DistributionDonut
        counts={counts}
        noun={noun}
        activeBand={band}
        basePath="/admin/engagement"
        query={query}
      />

      {/* ---- 3 & 4. Search, then the exceptions -------------------------- */}
      <AdminSearch
        action="/admin/engagement"
        placeholder={advisorLevel ? "Search people" : "Search rooftops or people"}
        value={search ?? ""}
        band={band}
      />

      {search && !advisorLevel ? (
        // Two sections, and an empty section is simply absent — a "nothing to
        // chase" card above a list of matching people would read as a bug.
        <>
          {rows.length > 0 && (
            <EngagementList
              rows={rows}
              total={total}
              shown={rows.length}
              moreHref={moreHref}
              heading="Matching rooftops"
              emptyLine=""
            />
          )}
          {people.length > 0 && (
            <EngagementList
              rows={people}
              total={peopleTotal}
              shown={people.length}
              moreHref={peopleMoreHref}
              heading="People"
              emptyLine=""
            />
          )}
          {rows.length === 0 && people.length === 0 && (
            <EngagementList
              rows={[]}
              total={0}
              shown={0}
              moreHref={null}
              heading="Matching rooftops and people"
              emptyLine={`Nothing matches "${search}".`}
            />
          )}
        </>
      ) : (
        <EngagementList
          rows={rows}
          total={total}
          shown={rows.length}
          moreHref={moreHref}
          heading={listHeading(band, search, noun)}
          emptyLine={
            search
              ? `Nothing matches "${search}".`
              : `Every one of your ${noun} is at or above target. Rare — enjoy it.`
          }
        />
      )}

      {/* ---- 6. Tools ---------------------------------------------------- */}
    </main>
  );
}

/* ---- Bits ---------------------------------------------------------------- */

function listHeading(
  band: string | null,
  search: string | null,
  noun: string
): string {
  if (search) return `Matching ${noun}`;
  if (band === "engaged") return `On track`;
  if (band === "building") return `Close to target`;
  if (band === "nudge") return `Needs attention`;
  return `Needs attention first`;
}

function buildHref(base: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

function NotAnAdmin() {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">
          This screen is for owners and admins
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Your account isn&apos;t set up as an admin at a rooftop. If you own or
          run the group, ask your EDIAGD contact to add the role.
        </p>
      </Card>
    </main>
  );
}

function EngagementUnavailable() {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">
          Engagement isn&apos;t available yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The reporting views aren&apos;t reachable from this account. Nothing
          is wrong with your data — try again shortly.
        </p>
      </Card>
    </main>
  );
}
