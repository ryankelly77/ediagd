"use client";

import { useState } from "react";
import { TierBadge } from "@/components/brand/TierBadge";
import { ServiceList } from "@/components/advisor/ServiceList";
import { Modal } from "@/components/brand/Modal";
import { formatCurrency } from "@/lib/advisor";
import type { AdvisorSummary } from "@/lib/manager";

/**
 * Movement against the advisor's own last period, on matched worked days.
 *
 * Palm up, clay down, ink level — the same scale as the status words a few
 * pixels to the right, and the same ±$50 band the advisor's own screen uses, so
 * a manager and an advisor can never read different verdicts off the same
 * numbers.
 */
function TrendChip({
  trend,
}: {
  trend: NonNullable<AdvisorSummary["trend"]>;
}) {
  const tone =
    trend.direction === "up"
      ? { c: "rgb(var(--ediagd-palm))", t: 18, mark: "▲" }
      : trend.direction === "down"
        ? { c: "rgb(var(--ediagd-clay))", t: 14, mark: "▼" }
        : { c: "rgb(var(--ediagd-ink-soft))", t: 12, mark: "=" };

  return (
    <span
      className="ediagd-numeral inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-extrabold"
      style={{
        background: `color-mix(in srgb, ${tone.c} ${tone.t}%, transparent)`,
        color: tone.c,
      }}
      title={`${trend.workedDays} worked days: ${formatCurrency(trend.currentSales)} vs ${formatCurrency(trend.priorSales)}`}
    >
      <span aria-hidden="true">{tone.mark}</span>
      {trend.direction === "flat"
        ? "level"
        : formatCurrency(Math.abs(trend.salesDiff))}
    </span>
  );
}

/**
 * The team roster plus the manager's drill-in. Tapping an advisor opens that
 * advisor's own service list — the same component the advisor sees, so the two
 * screens can never tell different stories about the same numbers.
 */
export function TeamRoster({ advisors }: { advisors: AdvisorSummary[] }) {
  const [selected, setSelected] = useState<AdvisorSummary | null>(null);

  return (
    <>
      <ul className="divide-y divide-line">
        {advisors.map((advisor) => (
          <li key={advisor.advisorOpId}>
            <button
              onClick={() => setSelected(advisor)}
              className="flex w-full items-center gap-3 px-1.5 py-3 text-left transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-bold text-navy">
                    {advisor.name}
                  </span>
                  {advisor.tier && <TierBadge tier={advisor.tier} small />}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                  <span>
                    {advisor.totalRos} ROs · {formatCurrency(advisor.totalLaborSales)}
                  </span>
                  {advisor.trend && <TrendChip trend={advisor.trend} />}
                </span>
              </span>

              <span className="text-right">
                {advisor.hasVolume ? (
                  advisor.pursueCount > 0 ? (
                    <span className="text-sm font-bold text-clay">
                      {advisor.pursueCount} to pursue
                    </span>
                  ) : (
                    <span className="text-sm font-bold text-palm">On track</span>
                  )
                ) : (
                  <span className="text-sm font-semibold text-ink-soft">
                    Building data
                  </span>
                )}
              </span>
              <span className="text-lg leading-none text-ink-soft">›</span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <Modal
        label={`${selected.name} services`}
        onClose={() => setSelected(null)}
        width="md"
        showClose
      >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-extrabold text-navy">
                  {selected.name}
                </h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {selected.totalRos} ROs ·{" "}
                  {formatCurrency(selected.totalLaborSales)}
                </p>
              </div>
              {selected.tier && <TierBadge tier={selected.tier} small />}
            </div>

            {selected.hasVolume ? (
              <div className="mt-4">
                <ServiceList families={selected.families} />
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                Just {selected.totalRos}{" "}
                {selected.totalRos === 1 ? "RO" : "ROs"} so far this period —
                coaching signals unlock as their volume grows.
              </p>
            )}

            <button
              onClick={() => setSelected(null)}
              className="mt-5 w-full rounded-xl bg-navy p-3 font-extrabold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Close
            </button>
        </Modal>
      )}
    </>
  );
}

export default TeamRoster;
