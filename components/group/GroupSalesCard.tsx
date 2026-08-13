"use client";

/* ============================================================================
   EDIAGD — the group's month, and the shape behind it

   THE NUMBER WITHOUT THE LINE IS HALF THE ANSWER. "$412,209, down $112,580"
   reads as a bad month. Whether it IS one depends entirely on what the three
   months before it did, and the card had no way to say.

   Collapsed by default: the headline and its movement are what a principal
   glances at. The line is what they open when the headline surprises them.

   THE PARTIAL MONTH IS DRAWN DIFFERENTLY — hollow dot, dashed final segment —
   for the same reason the advisor's history hatches its last bar. A ten-day
   August plotted as a solid point next to eight finished months is a cliff that
   did not happen.
   ============================================================================ */

import { useState } from "react";
import type { GroupMonth } from "@/lib/group";

const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function GroupSalesCard({
  eyebrow,
  total,
  chip,
  comparison,
  stats,
  months,
}: {
  eyebrow: string;
  total: number;
  chip: React.ReactNode;
  comparison: React.ReactNode;
  stats: React.ReactNode;
  months: GroupMonth[];
}) {
  const [open, setOpen] = useState(false);
  const canExpand = months.length > 1;

  return (
    <section className="ediagd-card-feature mt-4">
      {/* The headline is the tap target; the stats below stay plain content so
          a button never wraps a definition list. */}
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        aria-expanded={canExpand ? open : undefined}
        disabled={!canExpand}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <p className="ediagd-eyebrow">{eyebrow}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="ediagd-figure text-navy">{money(total)}</p>
          {chip}
        </div>
        {comparison}
        {canExpand && (
          <p className="mt-2 text-xs font-extrabold text-ocean">
            {open
              ? "Hide the last months ▲"
              : `See the last ${months.length} months ▼`}
          </p>
        )}
      </button>

      {open && <Sparkline months={months} />}

      <div className="mt-6 border-t border-line pt-4">{stats}</div>
    </section>
  );
}

function Sparkline({ months }: { months: GroupMonth[] }) {
  const [picked, setPicked] = useState<string | null>(
    months[months.length - 1]?.startsOn ?? null
  );

  const W = 320;
  const H = 64;
  const PAD = 6;

  const max = Math.max(...months.map((m) => m.laborSales), 1);
  // Baseline at zero, not at the minimum: a line scaled to its own min turns a
  // 3% dip into a cliff, which is the classic way a sparkline lies.
  const x = (i: number) =>
    months.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (months.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const solid = months.filter((m) => !m.isPartial);
  const line = solid.map((m) => `${x(months.indexOf(m))},${y(m.laborSales)}`);
  const lastSolid = solid[solid.length - 1];
  const partial = months.find((m) => m.isPartial);

  const active = months.find((m) => m.startsOn === picked) ?? null;

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-extrabold text-navy">
          {active ? active.label : ""}
          {active?.isPartial && (
            <span className="ml-1 font-bold text-ink-soft">(partial)</span>
          )}
        </p>
        {active && (
          <p className="ediagd-numeral text-xs text-ink-soft">
            {`${money(active.laborSales)} · ${Math.round(active.ros).toLocaleString()} ROs`}
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1.5 w-full"
        style={{ height: 64 }}
        role="img"
        aria-label={months
          .map((m) => `${m.label}: ${money(m.laborSales)}`)
          .join(", ")}
      >
        {line.length > 1 && (
          <polyline
            points={line.join(" ")}
            fill="none"
            stroke="rgb(var(--ediagd-teal))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* The reach into an unfinished month, dashed. */}
        {partial && lastSolid && (
          <line
            x1={x(months.indexOf(lastSolid))}
            y1={y(lastSolid.laborSales)}
            x2={x(months.indexOf(partial))}
            y2={y(partial.laborSales)}
            stroke="rgb(var(--ediagd-teal))"
            strokeWidth="2"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        )}
        {months.map((m, i) => {
          const isActive = m.startsOn === picked;
          return (
            <circle
              key={m.startsOn}
              cx={x(i)}
              cy={y(m.laborSales)}
              r={isActive ? 4.5 : 3}
              fill={m.isPartial ? "rgb(var(--ediagd-cream-card))" : "rgb(var(--ediagd-teal))"}
              stroke="rgb(var(--ediagd-teal))"
              strokeWidth="2"
              onClick={() => setPicked(m.startsOn)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>

      <div className="flex justify-between">
        {months.map((m) => (
          <button
            key={m.startsOn}
            type="button"
            onClick={() => setPicked(m.startsOn)}
            className="ediagd-numeral min-w-0 flex-1 truncate px-0.5 text-center text-[10px] text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {m.label.replace(/\s*20\d\d$/, "").slice(0, 3)}
          </button>
        ))}
      </div>

      {/* A month the group did not yet have every store in is a step in the
          line that is not performance. Said, rather than drawn over. */}
      {new Set(months.map((m) => m.rooftops)).size > 1 && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
          {`Store count changes across this range (${Math.min(...months.map((m) => m.rooftops))}–${Math.max(...months.map((m) => m.rooftops))}), so part of any step is stores joining, not trading.`}
        </p>
      )}
    </div>
  );
}
