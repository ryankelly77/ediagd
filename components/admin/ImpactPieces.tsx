import { Card } from "@/components/brand/Card";
import type {
  ImpactBandRow,
  ImpactSummary,
  ImpactTrendRow,
  ServicePoint,
} from "@/lib/admin-impact";

/* ============================================================================
   EDIAGD — the impact screen's parts

   THE RULE EVERY PIECE HERE FOLLOWS: a number never appears without the sample
   it came from. "+2.1 pts" is a claim; "+2.1 pts across 764 advisor-services"
   is a finding. The difference matters because this screen will eventually be
   shown to a dealer principal deciding whether to keep paying for the app.

   Up is palm, down is clay. Never red — a service that slipped is a
   conversation to have, not a failure to punish.
   ============================================================================ */

/** "+1.30" / "−0.09" / "—". Always signed, always two decimals, tabular. */
export function Delta({
  value,
  size = "base",
}: {
  value: number | null;
  size?: "base" | "lg";
}) {
  if (value == null) {
    return <span className="ediagd-numeral text-ink-soft">—</span>;
  }

  // Rounded before the sign is chosen, so -0.004 never prints as "−0.00".
  const rounded = Math.round(value * 100) / 100;
  const color =
    rounded > 0
      ? "rgb(var(--ediagd-palm))"
      : rounded < 0
        ? "rgb(var(--ediagd-clay))"
        : "rgb(var(--ediagd-ink-soft))";

  return (
    <span
      className={`ediagd-numeral font-extrabold ${
        size === "lg" ? "text-3xl" : "text-base"
      }`}
      style={{ color }}
    >
      {rounded > 0 ? "+" : rounded < 0 ? "−" : ""}
      {Math.abs(rounded).toFixed(2)}
    </span>
  );
}

/** Fabricated data must be impossible to mistake for evidence. */
export function DemoBanner({ allDemo }: { allDemo: boolean }) {
  return (
    <Card className="mt-3 border-gold/60 p-4">
      <p className="ediagd-eyebrow" style={{ color: "rgb(var(--ediagd-gold))" }}>
        Demo data
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-navy">
        {allDemo
          ? "Every number on this screen comes from seeded [DEMO] rooftops. The movement was designed, not measured — it exists to prove the analysis works, and it is not evidence of anything."
          : "Some rooftops on this screen are seeded [DEMO] data mixed with real stores. Treat any total as illustrative until the demo rooftops are removed."}
      </p>
    </Card>
  );
}

/**
 * The headline. Both sides of the comparison, side by side, because the
 * uncoached number is what makes the coached one mean anything — a screen that
 * showed only "+1.30" would be claiming far more than the data supports.
 */
export function ImpactHeadline({ summary }: { summary: ImpactSummary }) {
  const gap =
    summary.coachedDelta != null && summary.uncoachedDelta != null
      ? Math.round((summary.coachedDelta - summary.uncoachedDelta) * 100) / 100
      : null;

  return (
    <Card className="ediagd-card-feature mt-4">
      <p className="ediagd-eyebrow">Coached vs uncoached services</p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <Delta value={summary.coachedDelta} size="lg" />
          <p className="mt-1 text-sm font-bold text-navy">Coached</p>
          <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
            {summary.coachedN.toLocaleString()} advisor-services
          </p>
        </div>
        <div>
          <Delta value={summary.uncoachedDelta} size="lg" />
          <p className="mt-1 text-sm font-bold text-navy">Not coached</p>
          <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
            {summary.uncoachedN.toLocaleString()} advisor-services
          </p>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-navy">
        {gap == null ? (
          <>Not enough matched months yet to compare the two.</>
        ) : (
          <>
            Attach rate on coached services moved{" "}
            <strong className="font-extrabold">
              {gap > 0 ? "+" : gap < 0 ? "−" : ""}
              {Math.abs(gap).toFixed(2)} points
            </strong>{" "}
            {gap >= 0 ? "more" : "less"} than uncoached services for the same
            advisors, over {summary.monthsCompared.toLocaleString()} month-over-month{" "}
            {summary.monthsCompared === 1 ? "comparison" : "comparisons"}.
          </>
        )}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        Within-advisor comparison: {summary.advisors.toLocaleString()} advisors
        across {summary.rooftops.toLocaleString()}{" "}
        {summary.rooftops === 1 ? "rooftop" : "rooftops"}. Both sides are the
        same people in the same months, so staffing, seasonality and store
        differences apply to both. Which services get coached isn&apos;t
        randomly assigned, so this shows movement, not cause.
      </p>
    </Card>
  );
}

/** Month by month, so a single good month can't masquerade as a trend. */
export function ImpactTrend({ rows }: { rows: ImpactTrendRow[] }) {
  if (rows.length === 0) return null;

  const widest = Math.max(
    1,
    ...rows.flatMap((r) => [
      Math.abs(r.coachedDelta ?? 0),
      Math.abs(r.uncoachedDelta ?? 0),
    ])
  );

  return (
    <>
      <h2 className="ediagd-eyebrow mt-8 px-1">Month by month</h2>
      <Card className="mt-2 px-4">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.startsOn} className="py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold text-navy">
                  {r.periodLabel}
                </span>
                <span className="ediagd-numeral text-xs text-ink-soft">
                  {r.coachedN.toLocaleString()} coached ·{" "}
                  {r.uncoachedN.toLocaleString()} not
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                <TrendBar label="Coached" value={r.coachedDelta} widest={widest} />
                <TrendBar
                  label="Not coached"
                  value={r.uncoachedDelta}
                  widest={widest}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function TrendBar({
  label,
  value,
  widest,
}: {
  label: string;
  value: number | null;
  widest: number;
}) {
  const v = value ?? 0;
  const pct = Math.min(100, (Math.abs(v) / widest) * 100);
  const color =
    v > 0 ? "rgb(var(--ediagd-palm))" : v < 0 ? "rgb(var(--ediagd-clay))" : "transparent";

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-ink-soft">{label}</span>
      {/* Centre line: right of it is up, left is down. */}
      <span className="relative h-2.5 flex-1 rounded-pill bg-line/50">
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
      </span>
      <span className="w-14 shrink-0 text-right">
        <Delta value={value} />
      </span>
    </div>
  );
}

/** The correlational cut, with its caveat attached rather than footnoted. */
export function ImpactByBand({ rows }: { rows: ImpactBandRow[] }) {
  if (rows.length === 0) return null;

  const label: Record<string, string> = {
    engaged: "Engaged",
    building: "Building",
    nudge: "Needs a nudge",
  };

  return (
    <>
      <h2 className="ediagd-eyebrow mt-8 px-1">By engagement — supporting context</h2>
      <Card className="mt-2 px-4">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li
              key={r.band}
              className="flex items-center gap-3 py-3.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-navy">
                  {label[r.band] ?? r.band}
                </span>
                <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
                  {r.advisors.toLocaleString()} advisors ·{" "}
                  {r.coachedN.toLocaleString()} coached services
                </span>
              </span>
              <span className="w-16 shrink-0 text-right">
                <Delta value={r.coachedDelta} />
              </span>
              <span className="w-16 shrink-0 text-right">
                <Delta value={r.uncoachedDelta} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-2 px-1 text-xs leading-relaxed text-ink-soft">
        Coached, then uncoached. This split is <strong>correlational</strong>:
        advisors who engage more may be the ones who were going to improve
        anyway. It cannot separate the two, which is why the headline above uses
        the within-advisor comparison instead.
      </p>
    </>
  );
}

/**
 * "Two months are needed to show movement — currently 1."
 *
 * Said plainly, and never as a result. A store that has just been onboarded has
 * no impact number; it does not have an impact of zero, and the difference is
 * the whole reason this component exists.
 */
export function NotEnoughHistory({
  monthsAvailable,
  scope,
}: {
  monthsAvailable: number;
  scope: string;
}) {
  return (
    <Card className="mt-4 p-6">
      <h2 className="text-base font-extrabold text-navy">
        Not enough history yet
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Movement is the difference between two months, so two months of imported
        performance data are needed before {scope} can show any —{" "}
        <span className="ediagd-numeral font-bold text-navy">
          currently {monthsAvailable.toLocaleString()}
        </span>
        . This is a gap in the data, not a finding: it does not mean coaching had
        no effect.
      </p>
    </Card>
  );
}

/**
 * One advisor's per-service history, with the coached months marked.
 *
 * This is the view that makes the claim legible rather than statistical: you
 * can see the month coaching started on a service and what the line did after.
 */
export function ServiceHistory({ points }: { points: ServicePoint[] }) {
  const families = new Map<string, ServicePoint[]>();
  for (const p of points) {
    const list = families.get(p.family) ?? [];
    list.push(p);
    families.set(p.family, list);
  }

  const months = [...new Set(points.map((p) => p.startsOn))].sort();
  if (months.length === 0) return null;

  const ordered = [...families.entries()].sort((a, b) => {
    const aCoached = a[1].some((p) => p.coached) ? 0 : 1;
    const bCoached = b[1].some((p) => p.coached) ? 0 : 1;
    return aCoached - bCoached || a[0].localeCompare(b[0]);
  });

  return (
    <div className="border-t border-line px-1 pb-4 pt-4">
      <p className="ediagd-eyebrow">Attach rate by service</p>

      {/* Wide content scrolls inside itself; the page never scrolls sideways. */}
      <div className="mt-2.5 -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[22rem] border-collapse text-left">
          <thead>
            <tr>
              <th className="pb-2 pr-3 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                Service
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="pb-2 pl-2 text-right text-[11px] font-bold uppercase tracking-wide text-ink-soft"
                >
                  {monthLabel(points, m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map(([family, series]) => (
              <tr key={family} className="border-t border-line">
                <td className="py-2 pr-3 text-sm font-bold text-navy">
                  {family}
                </td>
                {months.map((m) => {
                  const p = series.find((s) => s.startsOn === m);
                  return (
                    <td key={m} className="py-2 pl-2 text-right">
                      {p?.attachRatePct == null ? (
                        <span className="text-ink-soft">·</span>
                      ) : (
                        <span
                          className="ediagd-numeral inline-flex items-center gap-1 text-sm"
                          title={p.coached ? "Coached this month" : undefined}
                        >
                          {p.coached && (
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-pill"
                              style={{ background: "rgb(var(--ediagd-gold))" }}
                            />
                          )}
                          <span className="font-bold text-navy">
                            {p.attachRatePct.toFixed(1)}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-pill"
          style={{ background: "rgb(var(--ediagd-gold))" }}
        />
        A gold dot marks a month this advisor was coached on that service.
      </p>
    </div>
  );
}

function monthLabel(points: ServicePoint[], startsOn: string): string {
  const label = points.find((p) => p.startsOn === startsOn)?.periodLabel ?? "";
  // "Apr 2026" -> "Apr"; the year is in the page, not in every column head.
  return label.split(" ")[0] || label;
}
