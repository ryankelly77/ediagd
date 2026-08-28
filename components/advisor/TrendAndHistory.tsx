"use client";

/* ============================================================================
   EDIAGD — how this month compares to your last one, and the months before it

   NEVER RED, IN EITHER DIRECTION. A month that is behind is not a failure
   notice; it is Tuesday. Down reads in clay with a specific, actionable
   sentence — "about 4 ROs behind July's pace" is something an advisor can do
   something about before the month ends. A red arrow is something to feel bad
   about, and the brand does not do that.

   AHEAD IS PALM, NOT GOLD. The status vocabulary on this very screen already
   reads palm = on track, gold = close, clay = pursue — so colouring "ahead of
   last month" gold said "nearly there" about a month that is going well, and
   spent the one colour DESIGN_LANGUAGE §5 reserves for celebration and
   milestones on ordinary movement.

   THE PARTIAL MONTH IS DRAWN DIFFERENTLY. A hatched bar, always, so a
   ten-day August can never be read as a finished month sitting next to a
   finished July. The chart is the place that mistake would be easiest to make.
   ============================================================================ */

import { useState } from "react";
import type { AdvisorTrend, Comparison, MonthPoint } from "@/lib/advisor-trend";

const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const TONE = {
  // Palm, not gold: gold already means "close" in the status scale used a few
  // rows further down this same screen, and ahead-of-last-month is on track.
  up: { color: "rgb(var(--ediagd-palm))", tint: 18 },
  flat: { color: "rgb(var(--ediagd-ink-soft))", tint: 12 },
  down: { color: "rgb(var(--ediagd-clay))", tint: 14 },
} as const;

/**
 * One sentence, in the advisor's own terms.
 *
 * Down is phrased as a gap to close rather than a loss taken, and in ROs where
 * ROs are the lever — an advisor cannot directly move dollars, they can take
 * one more car.
 */
function sentence(c: Comparison): { text: string; tone: keyof typeof TONE } {
  const sales = c.laborSales;
  const ros = c.ros;
  const when =
    c.basis === "worked-days"
      ? c.priorWasFullMonth
        ? `all of ${c.priorLabel}`
        : `the same days in ${c.priorLabel}`
      : c.priorLabel;

  if (sales.direction === "up") {
    return {
      tone: "up",
      text: `Ahead of ${when} by ${money(Math.abs(sales.diff))}.`,
    };
  }
  if (sales.direction === "flat") {
    return { tone: "flat", text: `Level with ${when}.` };
  }

  // Behind: lead with the thing they can act on.
  if (ros.direction === "down" && Math.abs(ros.diff) >= 1) {
    const n = Math.round(Math.abs(ros.diff));
    return {
      tone: "down",
      text: `About ${n} ${n === 1 ? "RO" : "ROs"} behind ${when} — ${money(Math.abs(sales.diff))} of labor.`,
    };
  }
  return {
    tone: "down",
    text: `${money(Math.abs(sales.diff))} behind ${when}.`,
  };
}

export function TrendAndHistory({ trend }: { trend: AdvisorTrend }) {
  const [open, setOpen] = useState(false);
  const { comparison, noComparisonReason, points } = trend;

  const line = comparison ? sentence(comparison) : null;
  const tone = line ? TONE[line.tone] : TONE.flat;

  return (
    <div className="mt-5 border-t border-line pt-4">
      {/* ---- always visible: the one-line trend ---------------------------- */}
      {line && comparison ? (
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-extrabold"
            style={{
              background: `color-mix(in srgb, ${tone.color} ${tone.tint}%, transparent)`,
              color: tone.color,
            }}
          >
            {line.tone === "up" ? "▲" : line.tone === "down" ? "▼" : "="}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug" style={{ color: tone.color }}>
              {line.text}
            </p>
            {/* ONE LINE. The day counts match by construction now, so there is
                nothing left to disclose — unless the prior month ran out of
                worked days first, which is said plainly rather than filled in. */}
            {comparison.basis === "worked-days" && (
              <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
                {comparison.priorWasFullMonth
                  ? `Through ${comparison.workedDays} worked days: ${money(comparison.laborSales.current)} · ${money(comparison.laborSales.prior)} for all of ${comparison.priorLabel}`
                  : `Through ${comparison.workedDays} worked days: ${money(comparison.laborSales.current)} · ${money(comparison.laborSales.prior)} in ${comparison.priorLabel}`}
              </p>
            )}
            {comparison.basis === "full" && (
              <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
                {`${money(comparison.laborSales.current)} · ${money(comparison.laborSales.prior)} in ${comparison.priorLabel}`}
              </p>
            )}
          </div>
        </div>
      ) : (
        noComparisonReason && (
          <p className="text-xs leading-relaxed text-ink-soft">{noComparisonReason}</p>
        )
      )}

      {/* ---- the toggle ---------------------------------------------------- */}
      {points.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-3 flex min-h-[2.5rem] w-full items-center justify-center gap-1.5 rounded-xl border border-line text-xs font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {open
              ? "Hide history"
              : `History · ${points.length} ${points.length === 1 ? "month" : "months"}`}
            <span aria-hidden="true" className="text-[10px]">
              {open ? "▲" : "▼"}
            </span>
          </button>

          {open && <History points={points} />}
        </>
      )}
    </div>
  );
}

/* ---- the chart ----------------------------------------------------------- */

/**
 * How many months the chart opens on.
 *
 * The 2025 backfill took an advisor's history from five or six months to
 * fifteen. The bar row is flex, not a scroller, so it did not overflow — it
 * COMPRESSED, and fifteen bars on a 360px phone is about 20px each, which is
 * a texture rather than a chart. Six is what fits while staying readable, and
 * it is also the horizon somebody actually coaches against.
 */
const DEFAULT_MONTHS = 6;

function History({ points }: { points: MonthPoint[] }) {
  const [selected, setSelected] = useState<string | null>(
    points[points.length - 1]?.periodId ?? null
  );
  const [showAll, setShowAll] = useState(false);

  const shown = showAll ? points : points.slice(-DEFAULT_MONTHS);

  /* Scale to what is VISIBLE. Scaling to the full set would leave the default
     six bars measured against a maximum the person cannot see, so a tall month
     hidden behind the tap would silently flatten everything on screen. */
  const maxSales = Math.max(...shown.map((p) => p.laborSales), 1);
  const maxRos = Math.max(...shown.map((p) => p.ros), 1);

  /* Falling back to the newest VISIBLE month covers collapsing while an older
     month is selected — the alternative is a chart with nothing highlighted
     and a header reading "Tap a month" for a month still on screen. */
  const active =
    shown.find((p) => p.periodId === selected) ?? shown[shown.length - 1] ?? null;

  /* Two years of history means two Julys. The year only earns its space when
     the visible window actually crosses one. */
  const spansYears = new Set(shown.map((p) => p.startsOn.slice(0, 4))).size > 1;

  return (
    <div className="mt-4">
      {/* The tapped month's numbers, above the bars — a phone has no hover. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-extrabold text-navy">
          {active ? active.label : "Tap a month"}
          {active?.isPartial && (
            <span className="ml-1.5 font-bold text-ink-soft">
              {`(${active.daysCovered} days)`}
            </span>
          )}
        </p>
        {active && (
          <p className="ediagd-numeral text-xs text-ink-soft">
            {`${money(active.laborSales)} · ${Math.round(active.ros)} ROs`}
          </p>
        )}
      </div>

      {/* Expanded, the bars stop sharing the width and start scrolling — past
          about eight, flex-1 makes them thinner than the gap between them. */}
      <div
        className={
          showAll
            ? "mt-3 flex items-end gap-2 overflow-x-auto pb-1"
            : "mt-3 flex items-end gap-2"
        }
      >
        {shown.map((p) => {
          const isActive = p.periodId === selected;
          const salesH = Math.max(4, (p.laborSales / maxSales) * 88);
          const rosH = Math.max(3, (p.ros / maxRos) * 88);
          return (
            <button
              key={p.periodId}
              type="button"
              onClick={() => setSelected(p.periodId)}
              aria-label={`${p.label}: ${money(p.laborSales)}, ${Math.round(p.ros)} ROs${p.isPartial ? ", partial month" : ""}`}
              className={`flex flex-col items-center gap-1 rounded-lg py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                showAll ? "w-11 shrink-0" : "min-w-0 flex-1"
              }`}
              style={{
                background: isActive
                  ? "color-mix(in srgb, rgb(var(--ediagd-teal)) 8%, transparent)"
                  : "transparent",
              }}
            >
              <span className="flex h-[92px] w-full items-end justify-center gap-1">
                {/* labor sales */}
                <span
                  className="ediagd-bar w-3 rounded-t"
                  data-partial={p.isPartial ? "true" : undefined}
                  style={{
                    height: `${salesH}px`,
                    // backgroundColor, NOT background: the shorthand resets
                    // background-image, which is where the partial-month hatch
                    // lives. It rendered as a plain bar and the whole "this
                    // month isn't finished" signal silently disappeared.
                    backgroundColor: isActive
                      ? "rgb(var(--ediagd-ocean))"
                      : "rgb(var(--ediagd-teal))",
                  }}
                />
                {/* ROs, quieter — the same shape in a lighter key */}
                <span
                  className="ediagd-bar w-2 rounded-t"
                  data-partial={p.isPartial ? "true" : undefined}
                  style={{
                    height: `${rosH}px`,
                    backgroundColor: "rgb(var(--ediagd-teal-soft))",
                  }}
                />
              </span>
              <span className="ediagd-numeral block w-full truncate text-center text-[10px] text-ink-soft">
                {shortMonth(p.label, shown.length, spansYears)}
              </span>
            </button>
          );
        })}
      </div>

      {points.length > DEFAULT_MONTHS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-3 flex min-h-[2.5rem] w-full items-center justify-center gap-1.5 rounded-xl border border-line text-xs font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {showAll
            ? `Show last ${DEFAULT_MONTHS} months`
            : `Show more · ${points.length - DEFAULT_MONTHS} earlier ${
                points.length - DEFAULT_MONTHS === 1 ? "month" : "months"
              }`}
          <span aria-hidden="true" className="text-[10px]">
            {showAll ? "▲" : "▼"}
          </span>
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-soft">
        <Key color="rgb(var(--ediagd-teal))" label="Labor sales" />
        <Key color="rgb(var(--ediagd-teal-soft))" label="ROs" />
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="ediagd-bar inline-block h-2.5 w-3 rounded-sm"
            data-partial="true"
            style={{ backgroundColor: "rgb(var(--ediagd-teal))" }}
          />
          Part month
        </span>
      </div>

      {/* The format boundary, said out loud rather than left as a mystery step
          in the bars. */}
      {new Set(shown.map((p) => (p.sourceKind === "dms_daily" ? "dynatron" : p.sourceKind))).size > 1 && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
          {`${shown.filter((p) => p.sourceKind !== "dynatron" && p.sourceKind !== "dms_daily").map((p) => p.label).join(", ")} came from a different report format than the months around it. A step at that point may be a change in what the report counts, not in what you did.`}
        </p>
      )}

      <style>{`
        /* A hatch, not a lighter colour: at these sizes a tint reads as a
           different metric, while diagonal stripes read as "incomplete". */
        .ediagd-bar[data-partial="true"] {
          background-image: repeating-linear-gradient(
            45deg,
            rgb(255 255 255 / 0.85) 0 2px,
            rgb(255 255 255 / 0) 2px 4px
          );
          outline: 1px dashed rgb(var(--ediagd-ocean) / 0.55);
          outline-offset: -1px;
        }
      `}</style>
    </div>
  );
}

/**
 * "June" at three bars, "Jun" at four or more.
 *
 * Five bars on a 360px phone leaves about 62px each; "September" needs ~70 and
 * truncates to "Septem…", which is worse than an abbreviation everybody reads
 * without thinking.
 *
 * THE YEAR COMES BACK WHEN THE WINDOW CROSSES ONE. Dropping it was right while
 * history was one advisor's recent run; with the 2025 backfill an expanded
 * chart holds two Julys, and two identical labels on two different bars is a
 * misread waiting to happen. "Jul '25" is the smallest thing that separates
 * them.
 */
function shortMonth(label: string, barCount: number, spansYears = false): string {
  const name = label.replace(/\s*20\d\d$/, "").trim();
  const short = barCount >= 4 ? name.slice(0, 3) : name;
  if (!spansYears) return short;
  const year = label.match(/(20)(\d\d)$/)?.[2];
  return year ? `${short} '${year}` : short;
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
