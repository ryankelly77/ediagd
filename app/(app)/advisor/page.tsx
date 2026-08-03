import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { TierBadge } from "@/components/brand/TierBadge";
import { ServiceList } from "@/components/advisor/ServiceList";
import { BRAND } from "@/lib/brand";
import {
  MIN_ROS_FOR_COACHING,
  advisorTier,
  buildServiceFamilies,
  eddiesPick,
  firstName,
  formatCurrency,
  formatFraction,
  formatPct,
  hasCoachingVolume,
  type FamilyAttach,
  type FamilyBenchmark,
} from "@/lib/advisor";

// TODO: no auth guard yet — this route renders for signed-out visitors via the
// dev fallback below. Route protection (redirect to /login when there's no
// session) is a separate step.

/**
 * TEMPORARY DEV FALLBACK.
 * Until test accounts carry an advisor membership, an unrecognised visitor is
 * shown Esparza's real Doggett numbers so the screen has something to render.
 * Delete this the moment route protection lands — it must never reach prod.
 */
const DEV_FALLBACK_OP_CODE_ID = "35122";
const DEV_FALLBACK_NAME = "Esparza";

export default async function AdvisorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Who is this advisor, and which op code are they in the DMS? ----------
  let opCodeId: string | null = null;
  let advisorName: string | null = null;
  let rooftopId: string | null = null;

  if (user) {
    const { data: membership } = await supabase
      .from("membership")
      .select("rooftop_id, op_code_id, app_user:user_id(full_name)")
      .eq("user_id", user.id)
      .eq("role", "advisor")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (membership?.op_code_id) {
      opCodeId = membership.op_code_id;
      rooftopId = membership.rooftop_id;
      // PostgREST types the embed as an array; it's a to-one join in practice.
      const embed = membership.app_user as unknown;
      const appUser = (Array.isArray(embed) ? embed[0] : embed) as
        | { full_name: string | null }
        | null
        | undefined;
      advisorName = appUser?.full_name ?? user.email ?? null;
    }
  }

  const usingFallback = opCodeId === null;
  if (usingFallback) {
    opCodeId = DEV_FALLBACK_OP_CODE_ID;
    advisorName = DEV_FALLBACK_NAME;
  }

  // ---- Current period ------------------------------------------------------
  // With a real membership the rooftop's latest period wins. Under the dev
  // fallback perf_period is RLS-blocked, so we fall back to whichever period
  // the advisor's own totals expose.
  let periodId: string | null = null;
  if (rooftopId) {
    const { data: period } = await supabase
      .from("perf_period")
      .select("id")
      .eq("rooftop_id", rooftopId)
      .order("ends_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    periodId = period?.id ?? null;
  }

  let totalsQuery = supabase
    .from("advisor_period_totals")
    .select(
      "period_id, rooftop_id, advisor_op_id, total_ros, total_labor_sales, blended_elr, gp_pct_weighted"
    )
    .eq("advisor_op_id", opCodeId);
  if (periodId) totalsQuery = totalsQuery.eq("period_id", periodId);

  const { data: totals } = await totalsQuery.limit(1).maybeSingle();

  if (!totals) {
    return (
      <main className="mx-auto max-w-app px-4 py-10">
        <Card className="p-6">
          <h1 className="text-lg font-extrabold text-navy">No numbers yet</h1>
          <p className="mt-2 text-sm text-ink-soft">
            We don&apos;t have a performance period for this advisor yet. Once the
            month&apos;s export lands, your stats show up here.
          </p>
        </Card>
      </main>
    );
  }

  const resolvedPeriodId = totals.period_id as string;
  const resolvedRooftopId = totals.rooftop_id as string;
  const totalRos = Number(totals.total_ros ?? 0);

  // ---- Attach rates + store benchmarks ------------------------------------
  const [{ data: attachRows }, { data: benchmarkRows }] = await Promise.all([
    supabase
      .from("advisor_family_attach")
      .select("family, fam_ros, advisor_ros, attach_rate_pct")
      .eq("advisor_op_id", opCodeId)
      .eq("period_id", resolvedPeriodId)
      .eq("rooftop_id", resolvedRooftopId),
    supabase
      .from("family_store_benchmark")
      .select("family, store_avg_pct, store_best_pct")
      .eq("period_id", resolvedPeriodId)
      .eq("rooftop_id", resolvedRooftopId),
  ]);

  // Per-family labor dollars live on the RLS-gated raw table, not the views.
  // When it's readable, Eddie's Pick is ranked by revenue; when it isn't, the
  // ranking falls back to missed ROs. Either way the screen renders.
  const { data: metricRows } = await supabase
    .from("advisor_op_metric")
    .select("ros, labor_sales, service_line(family)")
    .eq("advisor_op_id", opCodeId)
    .eq("period_id", resolvedPeriodId);

  const laborPerRoByFamily = buildLaborPerRo(metricRows);

  const attach: FamilyAttach[] = (attachRows ?? []).map((r) => ({
    family: r.family as string,
    famRos: Number(r.fam_ros ?? 0),
    advisorRos: Number(r.advisor_ros ?? 0),
    attachRatePct: r.attach_rate_pct == null ? null : Number(r.attach_rate_pct),
  }));

  const benchmarks: FamilyBenchmark[] = (benchmarkRows ?? []).map((r) => ({
    family: r.family as string,
    storeAvgPct: r.store_avg_pct == null ? null : Number(r.store_avg_pct),
    storeBestPct: r.store_best_pct == null ? null : Number(r.store_best_pct),
  }));

  const families = buildServiceFamilies(attach, benchmarks, laborPerRoByFamily);
  const canCoach = hasCoachingVolume(totalRos);
  const pick = eddiesPick(families, totalRos);
  const tier = advisorTier(families);
  const greetingName = firstName(advisorName ?? "there");

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex items-center gap-3">
        {/* -primary-light is the navy-inked mark — the one that reads on the
            cream app surface. */}
        <img
          src="/brand/svg/ediagd-mark-primary-light.svg"
          alt=""
          className="h-10 w-auto"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold text-navy">
            {BRAND.greeting}, {greetingName}
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-soft">
            {BRAND.tagline}
          </p>
        </div>
        {canCoach && <TierBadge tier={tier} />}
      </header>

      {usingFallback && (
        <p className="mt-4 rounded-[10px] border border-line bg-gold-soft/50 px-3 py-2 text-xs font-semibold text-navy">
          Dev preview — showing op code {DEV_FALLBACK_OP_CODE_ID}. Sign in as an
          advisor to see your own numbers.
        </p>
      )}

      {/* ---- Daily stat -------------------------------------------------- */}
      <Card className="mt-5 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
          Labor sales this period
        </p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight text-navy">
          {formatCurrency(Number(totals.total_labor_sales ?? 0))}
        </p>
        <dl className="mt-4 flex gap-6 border-t border-line pt-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              ELR
            </dt>
            <dd className="text-lg font-extrabold text-navy">
              {totals.blended_elr == null
                ? "—"
                : formatCurrency(Number(totals.blended_elr), true)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Labor GP
            </dt>
            <dd className="text-lg font-extrabold text-navy">
              {totals.gp_pct_weighted == null
                ? "—"
                : formatFraction(Number(totals.gp_pct_weighted))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              ROs
            </dt>
            <dd className="text-lg font-extrabold text-navy">{totalRos}</dd>
          </div>
        </dl>
      </Card>

      {/* ---- Eddie's Pick ------------------------------------------------ */}
      {canCoach && pick && (
        <section className="mt-5 rounded-card bg-navy p-5 shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
            {BRAND.app}&apos;s Pick of the Day
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-white">{pick.family}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ice-dim">
            Your {pick.family} attach is{" "}
            <span className="font-extrabold text-white">{formatPct(pick.rate)}</span>{" "}
            — the store averages{" "}
            <span className="font-extrabold text-white">
              {formatPct(pick.storeAvg)}
            </span>
            . Close the gap.
          </p>
          <a
            href="#"
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gold p-3 font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Watch the pitch
          </a>
        </section>
      )}

      {/* ---- Your services ----------------------------------------------- */}
      <section className="mt-5">
        <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Your services
        </h2>

        {canCoach ? (
          <Card className="mt-2 px-4 py-1">
            <ServiceList families={families} />
          </Card>
        ) : (
          <Card className="mt-2 p-5">
            <p className="text-base font-extrabold text-navy">Building data</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Just {totalRos} {totalRos === 1 ? "RO" : "ROs"} so far this period —
              your coaching picks unlock as your volume grows. We start showing
              service status at {MIN_ROS_FOR_COACHING}.
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}

/**
 * Average labor dollars per RO for each family, from the raw metric rows.
 * Returns undefined when nothing is readable so callers can skip the
 * revenue weighting entirely.
 */
function buildLaborPerRo(
  rows:
    | { ros: number | null; labor_sales: number | null; service_line: unknown }[]
    | null
): Record<string, number> | undefined {
  if (!rows || rows.length === 0) return undefined;

  const totals = new Map<string, { ros: number; sales: number }>();
  for (const row of rows) {
    // PostgREST returns the embedded row as an object (or an array, depending
    // on how it infers the relationship) — handle both.
    const embed = Array.isArray(row.service_line)
      ? row.service_line[0]
      : row.service_line;
    const family = (embed as { family?: string | null } | null)?.family;
    if (!family) continue;

    const entry = totals.get(family) ?? { ros: 0, sales: 0 };
    entry.ros += Number(row.ros ?? 0);
    entry.sales += Number(row.labor_sales ?? 0);
    totals.set(family, entry);
  }

  const perRo: Record<string, number> = {};
  for (const [family, { ros, sales }] of totals) {
    if (ros > 0) perRo[family] = sales / ros;
  }
  return Object.keys(perRo).length > 0 ? perRo : undefined;
}
