"use client";

import { useEffect, useState } from "react";
import { StatusRow, StatusDot } from "@/components/brand/StatusDot";
import { STATUS_META } from "@/lib/brand";
import { formatPct, type ServiceFamily } from "@/lib/advisor";

/**
 * "Your services" — the glanceable list plus its detail modal.
 * Client-side only because of the open/close state; the ranking and status
 * calculation already happened on the server.
 */
export function ServiceList({ families }: { families: ServiceFamily[] }) {
  const [selected, setSelected] = useState<ServiceFamily | null>(null);

  // Escape closes the modal — expected on desktop, harmless on mobile.
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.family} detail`}
            className="w-full max-w-sm rounded-t-card bg-surface-card p-6 shadow-pop sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <StatusDot status={selected.status} />
              <h2 className="flex-1 text-lg font-extrabold text-navy">
                {selected.family}
              </h2>
              <span
                className="text-sm font-bold"
                style={{ color: `rgb(var(${STATUS_META[selected.status].cssVar}))` }}
              >
                {STATUS_META[selected.status].label}
              </span>
            </div>

            <dl className="mt-5 space-y-3">
              <Comparison label="You" value={formatPct(selected.rate)} emphasis />
              <Comparison label="Store average" value={formatPct(selected.storeAvg)} />
              <Comparison label="Store best" value={formatPct(selected.storeBest)} />
            </dl>

            {selected.gapPp > 0 && (
              <p className="mt-4 text-sm text-ink-soft">
                Closing to store average is about{" "}
                <span className="font-bold text-navy">
                  {Math.round(selected.missedRos)} more {Math.round(selected.missedRos) === 1 ? "RO" : "ROs"}
                </span>{" "}
                this period.
              </p>
            )}

            <button
              onClick={() => setSelected(null)}
              className="mt-6 w-full rounded-xl bg-navy p-3 font-extrabold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Comparison({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd
        className={
          emphasis
            ? "text-2xl font-extrabold text-navy"
            : "text-base font-bold text-navy/70"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default ServiceList;
