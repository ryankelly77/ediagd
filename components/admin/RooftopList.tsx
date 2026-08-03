"use client";

import { useState } from "react";
import { Card } from "@/components/brand/Card";
import {
  BAND_META,
  engagementBand,
  type RooftopEngagement,
} from "@/lib/admin";

/**
 * Rooftop cards that expand to their advisor list. Expansion is the only
 * interactive bit — every number here was computed server-side from the
 * user_engagement view.
 */
export function RooftopList({ rooftops }: { rooftops: RooftopEngagement[] }) {
  const [openId, setOpenId] = useState<string | null>(
    rooftops.length === 1 ? rooftops[0].rooftopId : null
  );

  return (
    <ul className="mt-2 space-y-3">
      {rooftops.map((rooftop) => {
        const open = openId === rooftop.rooftopId;
        const band =
          rooftop.averageScore == null ? null : engagementBand(rooftop.averageScore);

        return (
          <li key={rooftop.rooftopId}>
            <Card>
              <button
                onClick={() => setOpenId(open ? null : rooftop.rooftopId)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-extrabold text-navy">
                    {rooftop.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {rooftop.engagedCount} of {rooftop.advisorCount}{" "}
                    {rooftop.advisorCount === 1 ? "advisor" : "advisors"} engaged
                  </span>
                </span>

                <span className="text-right">
                  <ScoreChip score={rooftop.averageScore} />
                </span>
                <span
                  aria-hidden="true"
                  className={`text-lg leading-none text-ink-soft transition-transform ${
                    open ? "rotate-90" : ""
                  }`}
                >
                  ›
                </span>
              </button>

              {/* Compact bar — the glanceable read on a phone. */}
              {rooftop.averageScore != null && band && (
                <div className="px-4 pb-4">
                  <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line">
                    <div
                      className="h-full rounded-pill"
                      style={{
                        width: `${Math.min(100, Math.max(0, rooftop.averageScore))}%`,
                        background: `var(--color-${BAND_META[band].color})`,
                      }}
                    />
                  </div>
                </div>
              )}

              {open && (
                <div className="border-t border-line px-4 py-1">
                  {rooftop.advisors.length > 0 ? (
                    <ul className="divide-y divide-line">
                      {rooftop.advisors.map((advisor) => (
                        <li
                          key={advisor.userId}
                          className="flex items-center gap-3 py-3"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-navy">
                              {advisor.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-ink-soft">
                              Login {advisor.loginRatePct}% · Watch{" "}
                              {advisor.watchRatePct}%
                            </span>
                          </span>
                          <ScoreChip score={advisor.engagementScore} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-4 text-sm text-ink-soft">
                      No advisor activity recorded here yet.
                    </p>
                  )}
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-sm font-semibold text-ink-soft">No data</span>;
  }
  const band = engagementBand(score);
  return (
    <span className="inline-flex flex-col items-end">
      <span
        className="text-lg font-extrabold leading-none"
        style={{ color: `var(--color-${BAND_META[band].color})` }}
      >
        {score}
      </span>
      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        {BAND_META[band].label}
      </span>
    </span>
  );
}

export default RooftopList;
