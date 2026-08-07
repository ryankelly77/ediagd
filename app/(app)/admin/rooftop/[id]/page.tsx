import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { AdvisorDetail } from "@/components/admin/AdvisorDetail";
import { DistributionDonut } from "@/components/admin/DistributionDonut";
import { EngagementHero } from "@/components/admin/EngagementHero";
import { EngagementList, type EngagementRow } from "@/components/admin/EngagementList";
import {
  LIST_PAGE_STEP,
  loadAdvisors,
  loadRooftopSummary,
  parseBand,
  resolveLimit,
} from "@/lib/admin-engagement";
import { loadAdvisorDetails, rooftopToday } from "@/lib/admin-advisor-detail";
import type { EngagementBand } from "@/lib/admin";

/**
 * One rooftop's advisors — the same aggregate -> exceptions structure as
 * /admin, one level down.
 *
 * Access needs no check of its own: admin_rooftop_engagement and
 * admin_advisor_engagement are both scoped by admin_rooftops() and run with
 * invoker rights (0026), so a rooftop outside this admin's scope simply
 * returns no rows and 404s here.
 */
export default async function AdminRooftopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ band?: string; q?: string; show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { band: bandParam, q, show } = await searchParams;
  const band = parseBand(bandParam);
  const search = q?.trim() || null;
  const limit = resolveLimit(show);

  const rooftop = await loadRooftopSummary(supabase, id);
  if (!rooftop) notFound();

  const { rows: advisors, total } = await loadAdvisors(
    supabase,
    { band, search, limit },
    id
  );

  // The band split for THIS rooftop comes from its own row — no extra query,
  // and no counting rows in JS.
  const counts: Record<EngagementBand, number> = {
    engaged: 0,
    building: 0,
    nudge: 0,
  };
  const { data: split } = await supabase
    .from("admin_rooftop_engagement")
    .select("engaged_count, building_count, nudge_count")
    .eq("rooftop_id", id)
    .maybeSingle();
  if (split) {
    counts.engaged = Number(split.engaged_count ?? 0);
    counts.building = Number(split.building_count ?? 0);
    counts.nudge = Number(split.nudge_count ?? 0);
  }

  // Detail for the rows about to render, in one batch — not one fetch per card
  // and not one for every advisor in the store. See lib/admin-advisor-detail.
  const today = await rooftopToday(supabase, id);
  const details = await loadAdvisorDetails(
    supabase,
    advisors.map((a) => a.userId),
    today
  );

  const rows: EngagementRow[] = advisors.map((a) => {
    const detail = details.get(a.userId);
    return {
      id: a.userId,
      name: a.advisorName,
      score: a.score,
      band: a.band,
      detail: `${a.daysLoggedIn} of ${a.workingDays} days`,
      expand: detail ? (
        <AdvisorDetail
          detail={detail}
          loginRatePct={a.loginRatePct}
          watchRatePct={a.watchRatePct}
          today={today}
        />
      ) : undefined,
    };
  });

  const base = `/admin/rooftop/${id}`;
  const moreHref = buildHref(base, {
    band: band ?? undefined,
    q: search ?? undefined,
    show: String(limit + LIST_PAGE_STEP),
  });

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span aria-hidden="true">⟵</span> Engagement
      </Link>

      <h1 className="mt-3 text-2xl font-extrabold text-navy">
        {rooftop.rooftopName}
      </h1>

      <div className="mt-4">
        <EngagementHero
          score={rooftop.avgScore}
          scopeLine={`${rooftop.advisorCount} ${
            rooftop.advisorCount === 1 ? "advisor" : "advisors"
          } at this rooftop`}
        />
      </div>

      <DistributionDonut
        counts={counts}
        noun="advisors"
        activeBand={band}
        basePath={base}
        query={{ q: search ?? undefined, show: show || undefined }}
      />

      <AdminSearch
        action={base}
        placeholder="Search people"
        value={search ?? ""}
        band={band}
      />

      <EngagementList
        rows={rows}
        total={total}
        shown={rows.length}
        moreHref={moreHref}
        heading={search ? "Matching advisors" : "Needs attention first"}
        emptyLine={
          search
            ? `Nothing matches "${search}".`
            : "Everyone here is at or above target."
        }
      />
    </main>
  );
}

function buildHref(base: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}
