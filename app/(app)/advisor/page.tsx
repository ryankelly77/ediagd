import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { PeriodChip, PeriodStamp } from "@/components/brand/PeriodStamp";
import { TrendAndHistory } from "@/components/advisor/TrendAndHistory";
import { loadAdvisorTrend } from "@/lib/advisor-trend";
import { formatPeriod, PERIOD_COLUMNS, toPeriodInfo } from "@/lib/period-label";
import { loadMeasurementPeriod } from "@/lib/perf-period";
import { formatRosterName } from "@/lib/manager";
import { ServiceList } from "@/components/advisor/ServiceList";
import { PitchButton } from "@/components/advisor/PitchButton";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
import { cueTierForRate, listCuesForServices } from "@/lib/daily";
import { loadFamiliesWithCues } from "@/lib/coachable-families";
import { loadLaborPerRo } from "@/lib/family-labor";
import { BRAND } from "@/lib/brand";
import {
  MIN_ROS_FOR_COACHING,
  buildServiceFamilies,
  eddiesPick,
  formatCurrency,
  formatFraction,
  formatPct,
  hasCoachingVolume,
  type FamilyAttach,
  type FamilyBenchmark,
} from "@/lib/advisor";

export default async function AdvisorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session, no screen. The performance views enforce this at the database
  // level too (0006), but redirecting is the honest user experience.
  if (!user) redirect("/login");

  // ---- Who is this advisor, and which op code are they in the DMS? ----------
  const { data: membership } = await supabase
    .from("membership")
    .select("rooftop_id, op_code_id, app_user:user_id(full_name)")
    .eq("user_id", user.id)
    .eq("role", "advisor")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!membership?.op_code_id) {
    return <NoAdvisorProfile />;
  }

  const opCodeId: string = membership.op_code_id;
  const rooftopId: string | null = membership.rooftop_id ?? null;

  const fullName =
    (membership.app_user as { full_name?: string | null } | null)?.full_name ?? null;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  // ---- Current period ------------------------------------------------------
  // The rooftop's latest COMPLETE period wins; a part-month is used only when
  // there is no complete one, and carries its "(partial) — 8 of 31 days"
  // qualifier through PERIOD_COLUMNS into the label. Shared with the daily flow
  // (lib/perf-period.ts) so the dashboard and /today cannot be measuring
  // different months.
  let periodId: string | null = null;
  let periodRow: Record<string, unknown> | null = null;
  let rooftopName: string | null = null;
  if (rooftopId) {
    const [period, { data: rt }] = await Promise.all([
      loadMeasurementPeriod(supabase, rooftopId, PERIOD_COLUMNS),
      supabase.from("rooftop").select("name").eq("id", rooftopId).maybeSingle(),
    ]);
    periodId = period?.id ?? null;
    periodRow = period?.row ?? null;
    rooftopName = (rt?.name as string | undefined) ?? null;
  }

  /*
   * WHOSE BOOK IS THIS?
   *
   * The screen keys on membership.op_code_id, and an operator id belongs to a
   * person at the dealership — not necessarily to the person logged in. An
   * admin who attaches a real operator id to their own membership to see real
   * data then reads "Aloha, Ryan / Here are your numbers" over somebody else's
   * book, which is the sort of thing that is obvious until it is quoted in a
   * meeting.
   *
   * The DMS roster knows the real name, so the screen says it when it differs.
   * The greeting stays personal: they are still the one logged in.
   */
  let bookOwner: string | null = null;
  if (rooftopId) {
    const { data: rosterRow } = await supabase
      .from("dms_advisor")
      .select("display_name")
      .eq("rooftop_id", rooftopId)
      .eq("advisor_op_id", opCodeId)
      .maybeSingle();
    const rosterName = formatRosterName(rosterRow?.display_name as string | null);
    const mine = fullName?.trim().toLowerCase();
    if (rosterName && rosterName.toLowerCase() !== mine) bookOwner = rosterName;
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

  const trend = await loadAdvisorTrend(supabase, opCodeId, resolvedRooftopId);

  /*
   * THE HEADLINE AND THE COACHING COME FROM DIFFERENT MONTHS, ON PURPOSE.
   *
   * The big number is what is happening NOW — an advisor on the 12th wants to
   * see the 12th. But Eddie's Pick is a judgement about where somebody is weak,
   * and on eight days of data one repair order swings an attach rate by three
   * points. So coaching is computed from the last COMPLETE month, and the card
   * says which month that was.
   *
   * Falls back to the headline period when there is no complete month yet —
   * better a noisy pick than none at all for a store in its first weeks.
   */
  const coachingPeriodId = trend.lastComplete?.periodId ?? resolvedPeriodId;
  const coachingRos = trend.lastComplete?.ros ?? totalRos;
  const coachingPeriod =
    trend.lastComplete && trend.lastComplete.periodId !== resolvedPeriodId
      ? trend.lastComplete
      : null;

  // ---- Attach rates + store benchmarks ------------------------------------
  const [{ data: attachRows }, { data: benchmarkRows }] = await Promise.all([
    supabase
      .from("advisor_family_attach")
      .select("family, fam_ros, advisor_ros, attach_rate_pct")
      .eq("advisor_op_id", opCodeId)
      .eq("period_id", coachingPeriodId)
      .eq("rooftop_id", resolvedRooftopId),
    supabase
      .from("family_store_benchmark")
      .select("family, store_avg_pct, store_best_pct")
      .eq("period_id", coachingPeriodId)
      .eq("rooftop_id", resolvedRooftopId),
  ]);

  // Per-family labor dollars come from advisor_family_labor, which resolves
  // family the same way the attach view does. When it's readable, Eddie's Pick
  // is ranked by revenue; when it isn't, the ranking falls back to missed ROs.
  // Either way the screen renders — and every other screen ranks identically,
  // because they all read this same view. See lib/family-labor.ts.
  const laborPerRoByFamily = await loadLaborPerRo(
    supabase,
    coachingPeriodId,
    opCodeId
  );
  const familiesWithCues = await loadFamiliesWithCues(supabase);

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

  const families = buildServiceFamilies(
    attach,
    benchmarks,
    laborPerRoByFamily,
    familiesWithCues
  );

  // Cues for every service, resolved HERE rather than fetched by the dialog on
  // open — two queries for the whole set instead of a round-trip per tap.
  // Lists, not singles: the pitch dialog previews several per service.
  const serviceCues = await listCuesForServices(
    supabase,
    new Date().toISOString().slice(0, 10),
    families.map((f) => ({ family: f.family, tier: cueTierForRate(f.rate) }))
  );
  const canCoach = hasCoachingVolume(coachingRos);
  const pick = eddiesPick(families, coachingRos);
  const periodLabel = formatPeriod(rooftopName, toPeriodInfo(periodRow));

  // The pick's chip names the month the PICK came from, which is not always the
  // month in the headline. A chip that said "August (partial)" over advice
  // derived from July would be the exact confusion this split exists to avoid.
  const pickLabel = coachingPeriod
    ? formatPeriod(null, {
        label: coachingPeriod.label,
        startsOn: coachingPeriod.startsOn,
        endsOn: coachingPeriod.startsOn,
        isPartial: false,
        daysCovered: coachingPeriod.daysCovered,
        lastDayCovered: coachingPeriod.lastDayCovered,
      })
    : periodLabel;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      {/* ---- Page title (the app greeting lives in AppHeader) ----------- */}
      <header>
        <div className="min-w-0">
          {/* BRAND.greeting, never the word itself — the login screen and this
              screen have to say the same thing, and only one of them is a
              place anybody would think to look when it changes. */}
          <h1 className="text-2xl font-extrabold leading-tight text-navy">
            {firstName ? `${BRAND.greeting}, ${firstName}` : BRAND.greeting}
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {bookOwner
              ? `You're viewing ${bookOwner}'s numbers`
              : "Here are your numbers"}
          </p>
        </div>
      </header>

      {/* WHICH STORE, WHICH MONTH. "Labor sales this period" named neither, and
          with eleven rooftops and a part-finished August on the books that is
          not a small omission. */}
      <PeriodStamp label={periodLabel} className="mt-1" />

      {/* ---- Daily stat: the screen's big number, warm not navy ---------- */}
      {/* Feature card rather than a second navy hero — DESIGN_LANGUAGE §5 says
          one hero per screen, and Eddie's Pick is the hero here. */}
      <section className="ediagd-card-feature mt-6">
        <p className="ediagd-eyebrow">
          {periodLabel.period ? `Labor sales · ${periodLabel.period}` : "Labor sales this period"}
        </p>
        <p className="ediagd-figure mt-2 text-navy">
          {formatCurrency(Number(totals.total_labor_sales ?? 0))}
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4">
          <SecondaryStat
            label="ELR"
            value={
              totals.blended_elr == null
                ? "—"
                : formatCurrency(Number(totals.blended_elr), true)
            }
          />
          <SecondaryStat
            label="Labor GP"
            value={
              totals.gp_pct_weighted == null
                ? "—"
                : formatFraction(Number(totals.gp_pct_weighted))
            }
          />
          <SecondaryStat label="ROs" value={String(totalRos)} />
        </dl>

        {/* The competition is yesterday: this advisor against their own last
            month, same window when the month isn't finished. */}
        <TrendAndHistory trend={trend} />
      </section>

      {/* ---- Eddie's Pick: the one hero ---------------------------------- */}
      {canCoach && pick && (
        <section className="ediagd-hero mt-6">
          <SunWaveMotif />

          <div className="relative">
            <div className="flex items-center gap-2">
              <p className="ediagd-eyebrow">
                {BRAND.app}&apos;s Pick of the Day
              </p>
              {/* The pick is ranked from THIS period's attach rates. A screenshot
                  of just this card would otherwise carry no date at all. */}
              <PeriodChip label={pickLabel} />
            </div>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white">
              {pick.family}
            </h2>
            {coachingPeriod && (
              <p className="ediagd-numeral mt-1 text-xs text-ice-dim">
                {`Based on ${coachingPeriod.label} — the last complete month`}
              </p>
            )}

            <p className="mt-3 text-sm leading-relaxed text-ice-dim">
              Your {pick.family} attach is{" "}
              <span className="font-extrabold text-white">
                {formatPct(pick.rate)}
              </span>{" "}
              — the store averages{" "}
              <span className="font-extrabold text-white">
                {formatPct(pick.storeAvg)}
              </span>
              . Close the gap.
            </p>

            {/* The gap made visual: your rate against the store's. */}
            <div className="mt-5" aria-hidden="true">
              <div className="h-2 w-full overflow-hidden rounded-pill bg-white/15">
                <div
                  className="h-full rounded-pill bg-gold"
                  style={{
                    width: `${Math.max(
                      4,
                      Math.min(100, (pick.rate / Math.max(pick.storeAvg, 0.1)) * 100)
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-bold uppercase tracking-wide text-ice-dim">
                <span>You {formatPct(pick.rate)}</span>
                <span>Store {formatPct(pick.storeAvg)}</span>
              </div>
            </div>

            <PitchButton
              service={pick.family}
              cues={serviceCues[pick.family] ?? []}
            />
          </div>
        </section>
      )}

      {/* ---- Your services ----------------------------------------------- */}
      <section className="mt-8">
        <h2 className="ediagd-eyebrow px-1">Your services</h2>

        {canCoach ? (
          <div className="ediagd-card mt-3 px-4">
            <ServiceList families={families} cues={serviceCues} />
          </div>
        ) : (
          <div className="ediagd-card mt-3 p-6">
            <p className="text-base font-extrabold text-navy">Building data</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Just {totalRos} {totalRos === 1 ? "RO" : "ROs"} so far this period —
              your coaching picks unlock as your volume grows. We start showing
              service status at {MIN_ROS_FOR_COACHING}.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

/** ELR / Labor GP / ROs — quiet supporting numbers under the big one. */
function SecondaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </dt>
      <dd className="ediagd-numeral mt-1 text-xl font-extrabold text-navy">
        {value}
      </dd>
    </div>
  );
}

/** Signed in, but this account isn't linked to a DMS advisor record yet. */
function NoAdvisorProfile() {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">
          No advisor profile linked to this account yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Your daily numbers show up here as soon as your manager links you to
          your advisor ID. Nothing to do on your end.
        </p>
      </Card>
    </main>
  );
}

/* buildLaborPerRo lived here. It keyed on the embedded service_line.family —
   the legacy op_code lookup — so anything that became a family through DMS
   mapping (sub_category_map, and the resolved_family 0054 added) had no dollars
   and silently fell back to missed ROs. Replaced in 0055 by
   advisor_family_labor, read through lib/family-labor.ts by all three callers. */
