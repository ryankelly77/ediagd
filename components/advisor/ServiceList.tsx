"use client";

import { useState } from "react";
import { StatusRow, StatusDot } from "@/components/brand/StatusDot";
import { Modal } from "@/components/brand/Modal";
import { STATUS_META } from "@/lib/brand";
import { formatPct, type ServiceFamily } from "@/lib/advisor";
import type { ServiceCue } from "@/lib/daily";

/**
 * "Your services" — the glanceable list plus its detail dialog.
 *
 * Also used by the manager drill-in (TeamRoster), so the detail has to read as
 * sensibly about someone else's numbers as about your own.
 */
export function ServiceList({
  families,
  cues,
}: {
  families: ServiceFamily[];
  /** Service -> its coaching cue, resolved server-side. Absent where the
   *  caller has none to offer (the manager drill-in), and the section is then
   *  simply omitted. */
  cues?: Record<string, ServiceCue>;
}) {
  const [selected, setSelected] = useState<ServiceFamily | null>(null);

  return (
    <>
      <ul className="divide-y divide-line">
        {families.map((f) => (
          <li key={f.family}>
            <StatusRow
              service={f.family}
              rate={f.rate}
              storeAvg={f.storeAvg}
              onClick={() => setSelected(f)}
            />
          </li>
        ))}
      </ul>

      {selected && (
        <ServiceDetail
          family={selected}
          cue={cues?.[selected.family] ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/* ---- The detail ---------------------------------------------------------- */

function ServiceDetail({
  family,
  cue,
  onClose,
}: {
  family: ServiceFamily;
  /** Already resolved — the dialog never fetches, so nothing pops in late. */
  cue: ServiceCue | null;
  onClose: () => void;
}) {
  const missed = Math.round(family.missedRos);
  const onTrack = family.gapPp <= 0;
  const max = Math.max(family.rate, family.storeAvg, family.storeBest, 1) * 1.12;

  return (
    <Modal label={`${family.family} detail`} onClose={onClose} padded={false}>
      {/* ---- Hero: the insight, not the raw numbers -------------------- */}
      <div
        className="relative px-6 pb-6 pt-5"
        style={{ background: "var(--ediagd-hero-gradient)" }}
      >
        {/* The only dismiss control besides the backdrop — leaving shouldn't be
            the loudest action in the dialog. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-pill bg-white/15 text-lg leading-none text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          ×
        </button>

        <span className="flex items-center gap-2">
          {/* The one place the dot pulses: a single service, in focus. */}
          <StatusDot status={family.status} size={14} pulse />
          <span
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: `rgb(var(${STATUS_META[family.status].cssVar}))` }}
          >
            {STATUS_META[family.status].label}
          </span>
        </span>

        <h2 className="mt-2 pr-8 text-2xl font-extrabold leading-tight text-white">
          {family.family}
        </h2>

        {/* The most actionable sentence gets the most room. */}
        <p className="mt-3 text-base leading-relaxed text-ice-dim">
          {onTrack ? (
            <>At or above the store average here — keep it rolling.</>
          ) : (
            <>
              About{" "}
              <span className="ediagd-numeral font-extrabold text-white">
                {missed <= 1 ? "one" : missed}
              </span>{" "}
              more {missed <= 1 ? "RO" : "ROs"} this period closes the gap to the
              store average.
            </>
          )}
        </p>
      </div>

      {/* ---- The comparison, shown rather than listed ------------------- */}
      <div className="p-6">
        <p className="ediagd-eyebrow">How you compare</p>

        <div className="mt-3 space-y-3">
          <CompareBar
            label="You"
            value={family.rate}
            max={max}
            color={`rgb(var(${STATUS_META[family.status].cssVar}))`}
            emphasis
          />
          <CompareBar
            label="Store average"
            value={family.storeAvg}
            max={max}
            color="rgb(var(--ediagd-ocean))"
          />
          <CompareBar
            label="Store best"
            value={family.storeBest}
            max={max}
            color="rgb(var(--ediagd-teal-soft))"
          />
        </div>

        {/* ---- The next step, when one exists ---------------------------- */}
        {cue && (
          <div className="mt-6 rounded-card border border-line bg-cream-card p-4">
            <p className="ediagd-eyebrow">Coaching cue</p>
            <p className="mt-1.5 text-base font-extrabold text-navy">
              {cue.title}
            </p>
            {cue.body && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
                {cue.body}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** One labelled bar. Tabular figures so the numbers line up down the column. */
function CompareBar({
  label,
  value,
  max,
  color,
  emphasis,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  emphasis?: boolean;
}) {
  const width = Math.max(2, Math.min(100, (value / max) * 100));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`text-xs ${
            emphasis ? "font-extrabold text-navy" : "font-semibold text-ink-soft"
          }`}
        >
          {label}
        </span>
        <span
          className={`ediagd-numeral text-sm ${
            emphasis ? "font-extrabold text-navy" : "font-bold text-ink-soft"
          }`}
        >
          {formatPct(value)}
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-pill bg-line">
        <div
          className="h-full rounded-pill"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default ServiceList;
