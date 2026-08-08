import Link from "next/link";
import { Card } from "@/components/brand/Card";
import { Delta } from "./ImpactPieces";
import type {
  Funnel,
  GridCell,
  ImpactSummary,
  ImpactThresholds,
  InterventionRow,
  Quadrant,
} from "@/lib/admin-impact";

/* ============================================================================
   EDIAGD — the impact screen, second pass

   WHAT WENT WRONG THE FIRST TIME. It led with "+1.75 coached vs −0.07
   uncoached": no units, no explanation of what uncoached meant, and nothing a
   dealer principal could act on. Two numbers side by side are a puzzle. The
   reader has to subtract them, guess the unit, and infer the control group.

   So this version leads with the GAP, states the unit in words, names the
   baseline in one line, and puts money at the top — because attach points make
   a GM nod politely and dollars get a renewal signed.
   ============================================================================ */

const money = (v: number | null): string =>
  v == null
    ? "—"
    : `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;

const monthName = (iso: string | null): string =>
  iso
    ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

/* ---- 1. The money ------------------------------------------------------- */

/**
 * The headline, with its own arithmetic attached.
 *
 * The derivation is a <details> rather than a footnote because this number will
 * be quoted in a renewal conversation, and the first question will be "where
 * does that come from?". A number that cannot answer that is worth less than no
 * number at all.
 */
export function DollarHeadline({ summary }: { summary: ImpactSummary }) {
  const range =
    summary.firstMonth && summary.lastMonth
      ? `${monthName(summary.firstMonth)} – ${monthName(summary.lastMonth)}`
      : `${summary.monthsCompared} months`;

  return (
    <Card className="ediagd-card-feature mt-4">
      <p className="ediagd-eyebrow">Incremental labor attributed to coaching</p>

      <p
        className="ediagd-figure mt-2"
        style={{
          color:
            (summary.incrementalLabor ?? 0) >= 0
              ? "rgb(var(--ediagd-navy))"
              : "rgb(var(--ediagd-clay))",
        }}
      >
        {money(summary.incrementalLabor)}
      </p>

      <p className="mt-2 text-sm leading-relaxed text-navy">
        Across{" "}
        <strong className="font-extrabold">
          {summary.rooftops.toLocaleString()}
        </strong>{" "}
        {summary.rooftops === 1 ? "rooftop" : "rooftops"} and{" "}
        <strong className="font-extrabold">
          {summary.dollarAdvisors.toLocaleString()}
        </strong>{" "}
        advisors, {range}.
      </p>

      <p className="ediagd-numeral mt-1 text-xs text-ink-soft">
        {summary.dollarRows.toLocaleString()} coached advisor-services ·{" "}
        {summary.incrementalRos == null
          ? "—"
          : `${Math.round(summary.incrementalRos).toLocaleString()} incremental repair orders`}
      </p>

      <details className="group mt-4 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-ocean [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="text-lg leading-none transition-transform group-open:rotate-90"
          >
            ›
          </span>
          How this number is built
        </summary>

        <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-navy">
          <li>
            <strong className="font-extrabold">1. Baseline.</strong> For one
            advisor in one month, the average movement of the services they were{" "}
            <em>not</em> coached on. That stands in for everything happening
            anyway — seasonality, staffing, incentives, the weather.
          </li>
          <li>
            <strong className="font-extrabold">2. Excess.</strong> Each coached
            service&apos;s movement minus that baseline. Negative excess is kept:
            a coached service that moved less than the advisor&apos;s own
            baseline subtracts from this total.
          </li>
          <li>
            <strong className="font-extrabold">3. Repair orders.</strong> Excess
            points ÷ 100 × that advisor&apos;s total ROs for the month — how many
            more times the service was sold than the baseline predicts.
          </li>
          <li>
            <strong className="font-extrabold">4. Dollars.</strong> Those ROs ×
            the labor sold per RO on that service, from the same month&apos;s
            op-code export. No list price, no assumed rate.
          </li>
        </ol>

        <p className="mt-3 rounded-card bg-teal-soft/20 p-3 text-xs leading-relaxed text-navy">
          <strong className="font-extrabold">Assumptions and limits.</strong>{" "}
          This is labor sales, not margin. It is not a forecast. An advisor with
          no uncoached services in a month has no baseline and is excluded rather
          than compared to zero. And it shows movement, not cause — which
          services get coached isn&apos;t randomly assigned, so an advisor may be
          coached on what they were already working on.
        </p>
      </details>
    </Card>
  );
}

/* ---- 2. The comparison, made readable ----------------------------------- */

/**
 * Two bars and one sentence. The gap is the finding, so the gap is the number
 * printed largest; the two component figures sit underneath as evidence rather
 * than as a riddle for the reader to solve.
 */
export function GapBars({ summary }: { summary: ImpactSummary }) {
  const widest = Math.max(
    0.5,
    Math.abs(summary.coachedDelta ?? 0),
    Math.abs(summary.uncoachedDelta ?? 0)
  );

  return (
    <Card className="mt-3 p-5">
      <p className="ediagd-eyebrow">Coached vs everything else</p>

      <p className="mt-2 text-base leading-relaxed text-navy">
        Coached services moved{" "}
        <strong className="ediagd-numeral text-lg font-extrabold">
          {summary.gapPts == null
            ? "—"
            : `${summary.gapPts > 0 ? "" : "−"}${Math.abs(summary.gapPts).toFixed(2)} points`}
        </strong>{" "}
        {(summary.gapPts ?? 0) >= 0 ? "more" : "less"} than the same
        advisors&apos; other services, over the same months.
      </p>

      <div className="mt-4 space-y-3">
        <Bar
          label="Coached services"
          value={summary.coachedDelta}
          n={summary.coachedN}
          widest={widest}
          emphasis
        />
        <Bar
          label="Everything else"
          value={summary.uncoachedDelta}
          n={summary.uncoachedN}
          widest={widest}
        />
      </div>

      <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs leading-relaxed">
        <div>
          <dt className="font-extrabold text-navy">The unit</dt>
          <dd className="text-ink-soft">
            Percentage points of change in attach rate, month over month. An
            attach rate is the share of an advisor&apos;s repair orders that
            included that service.
          </dd>
        </div>
        <div>
          <dt className="font-extrabold text-navy">
            What &quot;everything else&quot; is
          </dt>
          <dd className="text-ink-soft">
            The same advisors&apos; other services in the same months — the
            baseline for whatever was happening anyway. Same people, same store,
            same customers, so staffing, seasonality and incentives apply to both
            sides and cancel.
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        {summary.advisors.toLocaleString()} advisors ·{" "}
        {summary.monthsCompared.toLocaleString()} month-over-month{" "}
        {summary.monthsCompared === 1 ? "comparison" : "comparisons"}. This shows
        movement, not cause.
      </p>
    </Card>
  );
}

function Bar({
  label,
  value,
  n,
  widest,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  n: number;
  widest: number;
  emphasis?: boolean;
}) {
  const v = value ?? 0;
  const pct = Math.min(100, (Math.abs(v) / widest) * 100);
  const color =
    v > 0 ? "rgb(var(--ediagd-palm))" : v < 0 ? "rgb(var(--ediagd-clay))" : "transparent";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`text-sm ${emphasis ? "font-extrabold text-navy" : "font-bold text-ink-soft"}`}
        >
          {label}
        </span>
        <span className="flex items-baseline gap-2">
          <Delta value={value} />
          <span className="ediagd-numeral text-xs text-ink-soft">
            n={n.toLocaleString()}
          </span>
        </span>
      </div>
      <span className="relative mt-1.5 block h-3 rounded-pill bg-line/50">
        <span
          aria-hidden="true"
          className="absolute inset-y-0 rounded-pill"
          style={{
            background: color,
            width: `${pct / 2}%`,
            left: v >= 0 ? "50%" : undefined,
            right: v < 0 ? "50%" : undefined,
          }}
        />
        {/* The zero line, so a bar's direction is never ambiguous. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px bg-ink-soft/40"
        />
      </span>
    </div>
  );
}

/* ---- 3. Intervention decomposition -------------------------------------- */

const INTERVENTION_META: Record<
  InterventionRow["intervention"],
  { label: string; what: string }
> = {
  cue: { label: "Cue acknowledged", what: "The daily coaching line" },
  video: { label: "Video watched", what: "Advisor video" },
  lesson: { label: "Lesson completed", what: "Lesson library" },
};

/**
 * Which intervention moved the number.
 *
 * THE MOST DANGEROUS COMPONENT ON THE SCREEN. Videos and lessons do not exist —
 * there are no advisor videos in the product and the lesson library was never
 * built — so any figure in those two rows comes from seeded data and cannot be
 * validated by anyone. Rendered plainly, this panel would say "videos drive
 * more lift than cues", which is an assumption wearing the clothes of evidence.
 *
 * So a row without real data is labelled on the row itself, not in a footnote,
 * and its number is set in the muted colour rather than the confident one.
 * has_real_data is computed in the view, so the label disappears by itself the
 * day a real video is watched at a real rooftop.
 */
export function InterventionSplit({ rows }: { rows: InterventionRow[] }) {
  const illustrative = rows.filter((r) => !r.hasRealData && r.intervention !== "cue");

  return (
    <>
      <h2 className="ediagd-eyebrow mt-8 px-1">What moved it</h2>

      {illustrative.length > 0 && (
        <Card className="mt-2 border-gold/60 p-4">
          <p className="text-sm font-extrabold leading-snug text-navy">
            No video or lesson data exists yet — these figures are illustrative.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            There are no advisor videos in the product and the lesson library
            hasn&apos;t been built. The{" "}
            {illustrative.map((r) => INTERVENTION_META[r.intervention].label.toLowerCase()).join(" and ")}{" "}
            {illustrative.length === 1 ? "row is" : "rows are"} seeded so this
            layout can be reviewed. Do not read them as findings — when real data
            arrives these light up on their own.
          </p>
        </Card>
      )}

      <Card className="mt-2 px-4">
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const meta = INTERVENTION_META[r.intervention];
            const real = r.hasRealData;
            return (
              <li key={r.intervention} className="py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-navy">
                      {meta.label}
                    </span>
                    <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
                      {r.n === 0
                        ? "no data"
                        : `${r.n.toLocaleString()} services · ${r.advisors.toLocaleString()} advisors`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className="ediagd-numeral block text-base font-extrabold"
                      style={{
                        color: real
                          ? "rgb(var(--ediagd-navy))"
                          : "rgb(var(--ediagd-ink-soft))",
                      }}
                    >
                      {money(r.incrementalLabor)}
                    </span>
                    <span className="ediagd-numeral block text-xs text-ink-soft">
                      {r.meanDelta == null
                        ? "—"
                        : `${r.meanDelta > 0 ? "+" : r.meanDelta < 0 ? "−" : ""}${Math.abs(r.meanDelta).toFixed(2)} pts avg`}
                    </span>
                  </span>
                </div>
                {!real && r.n > 0 && (
                  <p
                    className="mt-1.5 text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: "rgb(var(--ediagd-gold))" }}
                  >
                    Illustrative — seeded data, not evidence
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="mt-2 px-1 text-xs leading-relaxed text-ink-soft">
        A service can be touched by more than one intervention in a month, so
        these rows overlap and do not sum to the headline.
      </p>
    </>
  );
}

/* ---- 4. Engagement x improvement ---------------------------------------- */

const QUADRANT_META: Record<
  Quadrant,
  { title: string; meaning: string; tone: "good" | "watch" | "odd" | "target" }
> = {
  engaged_improving: {
    title: "Engaged and improving",
    meaning: "Working as intended",
    tone: "good",
  },
  engaged_flat: {
    title: "Engaged but flat",
    meaning: "The coaching isn't landing — a content problem, not a people one",
    tone: "watch",
  },
  quiet_improving: {
    title: "Improving without us",
    meaning: "Getting better for reasons we can't claim",
    tone: "odd",
  },
  quiet_flat: {
    title: "Not engaged, not moving",
    meaning: "The list to work",
    tone: "target",
  },
};

const TONE_COLOR: Record<string, string> = {
  good: "rgb(var(--ediagd-palm))",
  watch: "rgb(var(--ediagd-gold))",
  odd: "rgb(var(--ediagd-ocean))",
  target: "rgb(var(--ediagd-clay))",
};

export function QuadrantGrid({
  cells,
  thresholds,
}: {
  cells: GridCell[];
  thresholds: ImpactThresholds;
}) {
  const byQuadrant = new Map(cells.map((c) => [c.quadrant, c]));
  const order: Quadrant[] = [
    "engaged_improving",
    "engaged_flat",
    "quiet_improving",
    "quiet_flat",
  ];

  return (
    <>
      <h2 className="ediagd-eyebrow mt-8 px-1">Engagement × improvement</h2>
      <p className="mt-1 px-1 text-xs leading-relaxed text-ink-soft">
        Engaged means an engagement score of{" "}
        <span className="ediagd-numeral font-bold text-navy">
          {thresholds.engagedScoreMin}
        </span>{" "}
        or more. Improving means coached services gained at least{" "}
        <span className="ediagd-numeral font-bold text-navy">
          {thresholds.improvingPtsMin}
        </span>{" "}
        points a month on average.{" "}
        <Link
          href="/admin/pricing"
          className="font-bold text-ocean underline underline-offset-2"
        >
          Change these
        </Link>
        .
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {order.map((q) => {
          const cell = byQuadrant.get(q);
          const meta = QUADRANT_META[q];
          const count = cell?.advisors ?? 0;
          return (
            <Link
              key={q}
              href={`/admin/impact/quadrant/${q}`}
              className="rounded-card transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <Card className="h-full p-4">
                <span
                  aria-hidden="true"
                  className="block h-1 w-8 rounded-pill"
                  style={{ background: TONE_COLOR[meta.tone] }}
                />
                <span className="ediagd-numeral mt-2 block text-2xl font-extrabold text-navy">
                  {count.toLocaleString()}
                </span>
                <span className="mt-0.5 block text-sm font-bold leading-snug text-navy">
                  {meta.title}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
                  {meta.meaning}
                </span>
                {cell?.incrementalLabor != null && (
                  <span className="ediagd-numeral mt-1.5 block text-xs font-bold text-ink-soft">
                    {money(cell.incrementalLabor)}
                  </span>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}

/* ---- 5. The funnel ------------------------------------------------------ */

/**
 * Engagement, next to the outcome data rather than joined to it. Putting them
 * side by side lets the reader draw the comparison; joining them would be us
 * making a claim the data can't carry.
 */
export function EngagementFunnel({ funnel }: { funnel: Funnel }) {
  const pct = (n: number) =>
    funnel.advisors === 0 ? 0 : Math.round((n / funnel.advisors) * 100);

  const steps = [
    { label: "Advisors", n: funnel.advisors, note: "with performance history" },
    {
      label: "Doing the daily loop",
      n: funnel.doingDailyLoop,
      note: "completed it at least once in 30 days",
    },
    {
      label: "Doing it consistently",
      n: funnel.loopConsistently,
      note: "10 or more days in the last 30",
    },
    {
      label: "Going into lessons",
      n: funnel.intoLessons,
      note: "finished a lesson in 30 days",
    },
  ];

  return (
    <>
      <h2 className="ediagd-eyebrow mt-8 px-1">Engagement funnel</h2>
      <Card className="mt-2 px-4">
        <ul className="divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.label} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-navy">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {s.note}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="ediagd-numeral block text-base font-extrabold text-navy">
                    {s.n.toLocaleString()}
                  </span>
                  {i > 0 && (
                    <span className="ediagd-numeral block text-xs text-ink-soft">
                      {pct(s.n)}%
                    </span>
                  )}
                </span>
              </div>
              {i > 0 && (
                <span className="relative mt-1.5 block h-2 rounded-pill bg-line/50">
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 rounded-pill"
                    style={{
                      width: `${pct(s.n)}%`,
                      background:
                        s.n === 0
                          ? "transparent"
                          : "rgb(var(--ediagd-teal))",
                    }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {funnel.intoLessons === 0 && (
        <p className="mt-2 px-1 text-xs leading-relaxed text-ink-soft">
          Nobody is in lessons because the lesson library doesn&apos;t exist yet.
          The step is here so the drop-off is visible the moment it does.
        </p>
      )}
    </>
  );
}
