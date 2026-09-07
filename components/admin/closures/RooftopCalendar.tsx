"use client";

/* ============================================================================
   EDIAGD — one rooftop's year, and four taps to settle it

   The screen is a list of dates with two buttons, and the restraint is the
   design. A manager asked to configure a calendar will not; a manager asked
   "is the store shut on Labor Day — yes or no" answers eleven of those in under
   a minute. So there is no date picker for the federal dates, no bulk editor,
   and no settings.

   PROPOSALS SORT FIRST because they are the only rows that need doing. A
   confirmed calendar collapses into a quiet list underneath.
   ============================================================================ */

import { useState, useTransition } from "react";
import { Card } from "@/components/brand/Card";
import {
  addClosureAction,
  confirmAllProposalsAction,
  confirmClosureAction,
  dismissClosureAction,
} from "@/lib/closure-actions";

export type CalendarItem = {
  id: string;
  date: string;
  dateLabel: string;
  label: string;
  status: "proposed" | "confirmed";
  origin: "federal" | "store";
  dismissed: boolean;
};

export function RooftopCalendar({
  rooftopId,
  rooftopName,
  items,
  openCount,
  settled,
  siblingRooftops,
}: {
  rooftopId: string;
  rooftopName: string;
  items: CalendarItem[];
  openCount: number;
  settled: boolean;
  siblingRooftops: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't save.");
    });
  };

  const open = items.filter((i) => i.status === "proposed" && !i.dismissed);
  const confirmed = items.filter((i) => i.status === "confirmed");
  const dismissed = items.filter((i) => i.status === "proposed" && i.dismissed);

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean">
          {rooftopName}
        </p>
        <p className="text-xs text-ink-soft">
          {settled ? "settled through year-end" : `${openCount} still to rule this year`}
        </p>
      </div>

      <Card className="p-5">
        {error && (
          <p className="mb-3 rounded-xl bg-clay/10 p-3 text-sm font-bold text-clay">
            {error}
          </p>
        )}

        {/* ---- Still to rule ------------------------------------------- */}
        {open.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                Is the store shut?
              </p>
              {open.length > 1 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => confirmAllProposalsAction(rooftopId))}
                  className="text-xs font-bold text-ocean underline underline-offset-2 disabled:opacity-50"
                >
                  Closed on all {open.length}
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {open.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-cream-card p-3"
                >
                  <span className="min-w-0">
                    <span className="block font-extrabold text-navy">{i.label}</span>
                    <span className="block text-xs text-ink-soft">{i.dateLabel}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => confirmClosureAction(i.id))}
                      className="min-h-[44px] rounded-xl bg-gold px-3 py-2 text-sm font-extrabold text-navy disabled:opacity-50"
                    >
                      Closed
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => dismissClosureAction(i.id))}
                      className="min-h-[44px] rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink disabled:opacity-50"
                    >
                      We&apos;re open
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Confirmed ------------------------------------------------ */}
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          Closed, coming up
        </p>
        {confirmed.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">
            Nothing confirmed — every day is a normal work day.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {confirmed.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 py-1"
              >
                <span className="text-sm text-navy">
                  <span className="font-bold">{i.label}</span>
                  <span className="text-ink-soft"> · {i.dateLabel}</span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => dismissClosureAction(i.id))}
                  className="text-xs font-bold text-ink-soft underline underline-offset-2 disabled:opacity-50"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Dismissed dates are shown, quietly. A manager who dismissed one by
            mistake needs to be able to find it, and a hidden decision is one
            nobody can correct. */}
        {dismissed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-bold text-ink-soft">
              Open on {dismissed.length} of the suggested days
            </summary>
            <ul className="mt-2 space-y-1">
              {dismissed.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm text-ink-soft">
                    {i.label} · {i.dateLabel}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => confirmClosureAction(i.id))}
                    className="text-xs font-bold text-ocean underline underline-offset-2 disabled:opacity-50"
                  >
                    Actually closed
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* ---- Add a store-specific day --------------------------------- */}
        <div className="mt-5 border-t border-line pt-4">
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-sm font-bold text-ocean underline underline-offset-2"
            >
              Add a day we close
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  aria-label="Date we close"
                  className="rounded-xl border border-line bg-cream-card p-3 font-semibold text-navy"
                />
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Inventory day"
                  aria-label="What to call it"
                  maxLength={60}
                  className="w-full rounded-xl border border-line bg-cream-card p-3 font-semibold text-navy"
                />
              </div>

              {siblingRooftops.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="h-4 w-4 accent-teal"
                  />
                  Apply to all {siblingRooftops.length + 1} of my rooftops
                </label>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending || !newDate || !newLabel.trim()}
                  onClick={() =>
                    run(async () => {
                      const res = await addClosureAction({
                        rooftopIds: applyToAll
                          ? [rooftopId, ...siblingRooftops.map((s) => s.id)]
                          : [rooftopId],
                        date: newDate,
                        label: newLabel,
                      });
                      if (res.ok) {
                        setAdding(false);
                        setNewDate("");
                        setNewLabel("");
                        setApplyToAll(false);
                      }
                      return res;
                    })
                  }
                  className="min-h-[44px] rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="text-sm font-bold text-ink-soft"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
