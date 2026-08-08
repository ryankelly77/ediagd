import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EngagementList, type EngagementRow } from "@/components/admin/EngagementList";
import {
  DemoBanner,
  Delta,
  ImpactByBand,
  ImpactTrend,
  NotEnoughHistory,
} from "@/components/admin/ImpactPieces";
import { NetworkRoiCard, money, roiLabel } from "@/components/admin/RoiPieces";
import {
  DollarHeadline,
  EngagementFunnel,
  GapBars,
  InterventionSplit,
  QuadrantGrid,
} from "@/components/admin/ImpactV2";
import { LIST_PAGE_STEP, loadScope, resolveLimit } from "@/lib/admin-engagement";
import {
  MIN_MONTHS_FOR_MOVEMENT,
  loadFunnel,
  loadGrid,
  loadImpactByBand,
  loadImpactRooftops,
  loadImpactSummary,
  loadImpactTrend,
  loadInterventions,
  loadNetworkRoi,
  loadThresholds,
  type RooftopSort,
} from "@/lib/admin-impact";

/* ============================================================================
   EDIAGD — /admin/impact

   The question a dealer principal eventually asks out loud: is this app
   improving my numbers? This screen answers it with the only comparison that
   survives scrutiny — within one advisor, coached services against uncoached
   ones, in the same month — and refuses to answer at all when there isn't
   enough history, rather than printing a zero that reads like a verdict.

   Four queries, all aggregated in Postgres over the 0029 rollup: summary,
   trend, band split, and one page of rooftops. 14ms at 100 rooftops.
   ============================================================================ */

export default async function ImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; sort?: string; below?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { show, sort: sortParam, below } = await searchParams;
  const limit = resolveLimit(show);
  const sort: RooftopSort =
    sortParam === "lift" || sortParam === "name" ? sortParam : "roi";
  const belowCostOnly = below === "1";

  const scope = await loadScope(supabase);
  if (scope.rooftopCount === 0) return <NotAnAdmin />;

  const summary = await loadImpactSummary(supabase);

  // No performance import at all is a different state from "not enough of it".
  if (!summary || summary.monthsAvailable === 0) {
    return (
      <Shell>
        <Card className="mt-4 p-6">
          <h2 className="text-base font-extrabold text-navy">
            No performance data yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Impact is measured against the monthly DMS export. Once the first
            month is imported this screen starts tracking, and it can compare
            once a second month lands.
          </p>
        </Card>
      </Shell>
    );
  }

  if (summary.monthsAvailable < MIN_MONTHS_FOR_MOVEMENT) {
    return (
      <Shell>
        {summary.hasDemo && <DemoBanner allDemo={summary.allDemo} />}
        <NotEnoughHistory
          monthsAvailable={summary.monthsAvailable}
          scope={scope.singleRooftop ? "this rooftop" : "these rooftops"}
        />
      </Shell>
    );
  }

  const [trend, bands, interventions, grid, thresholds, funnel, roi, { rows: rooftops, total }] =
    await Promise.all([
      loadImpactTrend(supabase),
      loadImpactByBand(supabase),
      loadInterventions(supabase),
      loadGrid(supabase),
      loadThresholds(supabase),
      loadFunnel(supabase),
      loadNetworkRoi(supabase),
      loadImpactRooftops(supabase, limit, sort, belowCostOnly),
    ]);

  const listHref = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { sort, below: belowCostOnly ? "1" : undefined, ...next };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "roi") p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/impact?${qs}` : "/admin/impact";
  };

  const listRows: EngagementRow[] = rooftops.map((r) => ({
    id: r.rooftopId,
    name: r.rooftopName,
    // The list component draws the score chip; impact has no 0-100 score, so
    // the movement goes in the detail line and the chip stays empty.
    score: null,
    band: r.coachedDelta != null && r.coachedDelta > 0 ? "engaged" : "building",
    detail:
      r.monthCount < MIN_MONTHS_FOR_MOVEMENT
        ? `${r.monthCount} month of data — not enough to compare`
        : r.gpMissing
          ? `no GP% on file · coached ${fmt(r.coachedDelta)} pts`
          : `${roiLabel(r.roiRatio)} back · ${money(r.incrementalGp)} GP vs ${money(r.subscriptionCost)} paid`,
    href: `/admin/impact/${r.rooftopId}`,
  }));

  return (
    <Shell>
      {summary.hasDemo && <DemoBanner allDemo={summary.allDemo} />}

      {/* Money first: it is the only number on this screen a dealer principal
          can act on without translation. */}
      <DollarHeadline summary={summary} />

      {/* Then what it cost to get it. */}
      {roi && <NetworkRoiCard roi={roi} />}

      {/* Then the movement it was derived from, led by the GAP. */}
      <GapBars summary={summary} />

      <QuadrantGrid cells={grid} thresholds={thresholds} />

      <InterventionSplit rows={interventions} />

      {funnel && <EngagementFunnel funnel={funnel} />}

      <ImpactTrend rows={trend} />

      <h2 className="ediagd-eyebrow mt-8 px-1">By rooftop</h2>
      <p className="mt-1 px-1 text-xs text-ink-soft">
        Tap a store to see which advisors and which services moved.
      </p>

      {/* Sort and filter as links, so the view stays shareable and the page
          never needs client state. */}
      <div className="mt-2 flex flex-wrap gap-1.5 px-1">
        <Chip href={listHref({ sort: "roi" })} active={sort === "roi"}>
          Return
        </Chip>
        <Chip href={listHref({ sort: "lift" })} active={sort === "lift"}>
          Gross profit
        </Chip>
        <Chip href={listHref({ sort: "name" })} active={sort === "name"}>
          Name
        </Chip>
        <Chip
          href={listHref({ below: belowCostOnly ? undefined : "1" })}
          active={belowCostOnly}
        >
          Below cost only
        </Chip>
      </div>
      <div className="mt-1">
        <EngagementList
          rows={listRows}
          total={total}
          shown={listRows.length}
          moreHref={listHref({ show: String(limit + LIST_PAGE_STEP) })}
          heading=""
          emptyLine="No rooftop has two months of performance data yet."
        />
      </div>

      <ImpactByBand rows={bands} />

      <p className="mt-8 px-1 text-xs leading-relaxed text-ink-soft">
        Attach rate is derived from the op-code export, never stored — the same
        figures /manager reports. A service counts as coached in a month when
        the advisor completed a cue for that service family during it.
      </p>
    </Shell>
  );
}

/* ---- Bits ---------------------------------------------------------------- */

function fmt(v: number | null): string {
  if (v == null) return "—";
  const r = Math.round(v * 100) / 100;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`;
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={`inline-flex min-h-[2.25rem] items-center rounded-pill border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
        active
          ? "border-teal bg-teal-soft/30 text-navy"
          : "border-line bg-surface-card text-ink-soft hover:bg-teal-soft/15"
      }`}
    >
      {children}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Impact & ROI"
      />
      {children}
    </main>
  );
}

function NotAnAdmin() {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">
          This screen is for owners and admins
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Your account isn&apos;t set up as an admin at a rooftop.
        </p>
      </Card>
    </main>
  );
}

export { Delta };
