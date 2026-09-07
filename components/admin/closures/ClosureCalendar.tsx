"use client";

/* ============================================================================
   EDIAGD — the whole group's year, on one screen, with nothing that moves

   Two things were wrong with the first version, and Ryan found both.

   IT REARRANGED ITSELF. Ruling a date took it out of "is the store shut?" and
   put it back somewhere further down the page. "Dropping it down below confused
   me" — and on a phone the row you just tapped scrolls out of sight, so you
   cannot even tell the tap landed. Now every date keeps its place in the year
   and only the switch changes.

   IT ASKED THE SAME QUESTION ELEVEN TIMES. One calendar per rooftop meant a
   hundred and twenty-one decisions for a dealer whose stores close on the same
   days. The scope now defaults to every rooftop the manager holds; a ruling
   writes to all of them at once, and a single store can still be picked out of
   the switcher when one genuinely differs.

   MIXED IS SHOWN, NOT RESOLVED. When the stores disagree the switch sits at
   centre and the row says how many are shut. A control that picked a side would
   silently misreport the others.
   ============================================================================ */

import { useState, useTransition } from "react";
import { Card } from "@/components/brand/Card";
import { Toggle } from "@/components/brand/Toggle";
import { Select } from "@/components/brand/Select";
import { setClosureAction, ruleRemainingAction, addClosureAction } from "@/lib/closure-actions";
import type { ClosureState } from "@/lib/closures";

export type CalendarItem = {
  date: string;
  dateLabel: string;
  label: string;
  state: ClosureState;
  closedCount: number;
  scopeCount: number;
};

export const ALL_SCOPE = "__all__";

export function ClosureCalendar({
  rooftops,
  scope,
  items,
}: {
  rooftops: { id: string; name: string }[];
  /** A rooftop id, or ALL_SCOPE. */
  scope: string;
  items: CalendarItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const scopeIds = scope === ALL_SCOPE ? rooftops.map((r) => r.id) : [scope];

  /* The dates the bulk buttons act on, named here so the label and the write
     cannot disagree. Only rows NOBODY has ruled: a mixed date is a decision
     made differently per store, and sweeping it up would erase the difference. */
  const unset = items.filter((i) => i.state === "unset");
  const scopeName =
    scope === ALL_SCOPE
      ? `all ${rooftops.length} rooftops`
      : (rooftops.find((r) => r.id === scope)?.name ?? "this rooftop");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't save.");
    });
  };

  /* The scope switcher changes a URL param rather than local state, so the
     server re-reads the calendar for the new scope. A client-side filter would
     have to hold every rooftop's rows in the page to answer "mixed". */
  const setScope = (value: string) => {
    const url = new URL(window.location.href);
    if (value === ALL_SCOPE) url.searchParams.delete("rooftop");
    else url.searchParams.set("rooftop", value);
    window.location.href = url.toString();
  };

  return (
    <>
      {rooftops.length > 1 && (
        <div className="mt-4">
          <label className="mb-1 block px-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
            Setting up
          </label>
          <Select
            ariaLabel="Which rooftops"
            value={scope}
            onChange={setScope}
            options={[
              { value: ALL_SCOPE, label: `All my rooftops (${rooftops.length})` },
              ...rooftops.map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
          <p className="mt-1 px-1 text-xs text-ink-soft">
            {scope === ALL_SCOPE
              ? "Every answer applies to all of them. Pick one store if it differs."
              : "Only this store."}
          </p>
        </div>
      )}

      <Card className="mt-4 p-5">
        {error && (
          <p className="mb-3 rounded-xl bg-clay/10 p-3 text-sm font-bold text-clay">{error}</p>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Closed on this day?
          </p>
          {/* "all 4" sat directly under "All my rooftops (11)" and read as
              four ROOFTOPS. It always meant days. Both buttons now say so, and
              both act on exactly the dates counted here — no more, which is
              what stops a bulk tap closing the one store held open. */}
          {unset.length > 0 && (
            <span className="flex items-center gap-3 text-xs font-bold">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    ruleRemainingAction({
                      rooftopIds: scopeIds,
                      dates: unset.map((i) => ({ date: i.date, label: i.label })),
                      closed: true,
                    })
                  )
                }
                className="text-ocean underline underline-offset-2 disabled:opacity-50"
              >
                Closed on {unset.length} unset {unset.length === 1 ? "day" : "days"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    ruleRemainingAction({
                      rooftopIds: scopeIds,
                      dates: unset.map((i) => ({ date: i.date, label: i.label })),
                      closed: false,
                    })
                  )
                }
                className="text-ink-soft underline underline-offset-2 disabled:opacity-50"
              >
                Open on {unset.length === 1 ? "it" : "them"}
              </button>
            </span>
          )}
        </div>

        <ul className="mt-2 divide-y divide-line">
          {items.map((i) => (
            <li key={i.date} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-extrabold text-navy">{i.label}</span>
                <span className="block text-xs text-ink-soft">
                  {i.dateLabel}
                  {/* The row says which way it is set IN WORDS as well as by the
                      switch. "Not set" is a third state and a switch alone
                      cannot show three. */}
                  {i.state === "unset" && (
                    <span className="ml-2 font-bold text-clay">Not set</span>
                  )}
                  {i.state === "mixed" && (
                    <span className="ml-2 font-bold text-ocean">
                      {i.closedCount} of {i.scopeCount} closed
                    </span>
                  )}
                </span>
              </span>
              <Toggle
                label={`Closed on ${i.label}`}
                checked={i.state === "closed"}
                indeterminate={i.state === "mixed"}
                disabled={pending}
                onChange={(next) =>
                  run(() =>
                    setClosureAction({
                      rooftopIds: scopeIds,
                      date: i.date,
                      label: i.label,
                      closed: next,
                    })
                  )
                }
              />
            </li>
          ))}
        </ul>

        {items.length === 0 && (
          <p className="mt-1 text-sm text-ink-soft">
            No dates on file yet for {scopeName}.
          </p>
        )}

        {/* ---- A day of their own ---------------------------------------- */}
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
              <p className="text-xs text-ink-soft">Adds it to {scopeName}.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending || !newDate || !newLabel.trim()}
                  onClick={() =>
                    run(async () => {
                      const res = await addClosureAction({
                        rooftopIds: scopeIds,
                        date: newDate,
                        label: newLabel,
                      });
                      if (res.ok) {
                        setAdding(false);
                        setNewDate("");
                        setNewLabel("");
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
    </>
  );
}
