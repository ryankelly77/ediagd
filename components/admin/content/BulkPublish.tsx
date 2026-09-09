"use client";

/* ============================================================================
   EDIAGD — publishing a batch without publishing a surprise

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   Mitch dropped 77 films; 22 of them landed as new drafts. Publishing those one
   at a time is twenty-two screens, and the twenty-third tap is where somebody
   stops reading what they are tapping. Ryan: "I need a way to bulk publish in
   admin."

   ---------------------------------------------------------------------------
   SELECTION, NOT A FILTER
   ---------------------------------------------------------------------------
   The ids sent are the ones ticked on this screen. There is deliberately no
   "publish everything matching this filter" — a filter can widen between the
   reading of it and the tapping of it (a colleague ingests a batch, the page is
   stale by ninety seconds), and the number in the button would no longer be the
   number that moves. What you counted is what goes.

   "Select all" therefore means all the rows RENDERED here, and the count says
   so. If the list is capped, the cap is what you get.

   ---------------------------------------------------------------------------
   IT REPORTS WHAT IT REFUSED
   ---------------------------------------------------------------------------
   The action holds back anything not actually playable — a video with no
   playback id, one still transcoding, one whose 9:16 is stale. That is the
   safeguard the whole ingest is built around, and a bulk button that silently
   skipped rows would be worse than one that published them: the admin would
   believe a film is live and never look again. So refusals come back with a
   reason each, and they stay on screen until dismissed.
   ============================================================================ */

import { useState, useTransition } from "react";
import { publishMany, type BulkPublishResult } from "@/app/(app)/admin/content/actions";

export function BulkPublish({
  ids,
  labels,
}: {
  /** Every draft rendered on this screen, in display order. */
  ids: string[];
  /** id -> title, so a refusal can name the film rather than a uuid. */
  labels: Record<string, string>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<BulkPublishResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (ids.length === 0) return null;

  const allOn = selected.size === ids.length && ids.length > 0;
  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
    setResult(null);
    setConfirming(false);
  };

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-cream-card p-3">
        <button
          type="button"
          onClick={() => {
            setSelected(allOn ? new Set() : new Set(ids));
            setResult(null);
            setConfirming(false);
          }}
          className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-navy transition hover:bg-navy/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {allOn ? "Clear" : `Select all ${ids.length}`}
        </button>

        <span className="text-sm font-bold text-ink-soft">
          {selected.size === 0 ? "none selected" : `${selected.size} selected`}
        </span>

        <span className="flex-1" />

        {/*
          TWO TAPS, AND THE SECOND ONE CARRIES THE NUMBER. Publishing puts
          content on advisors' screens; it is not undoable by a refresh. The
          count is in the confirm rather than only in the label above, so the
          thing being agreed to is the thing being read.
        */}
        {!confirming ? (
          <button
            type="button"
            disabled={selected.size === 0 || pending}
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Publish
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-xl px-3 py-2 text-sm font-bold text-ink-soft transition hover:bg-navy/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await publishMany([...selected]);
                  setResult(r);
                  setConfirming(false);
                  if (r.ok) setSelected(new Set());
                })
              }
              className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {pending ? "Publishing…" : `Publish ${selected.size} now`}
            </button>
          </span>
        )}
      </div>

      {result && (
        <div className="mt-2 rounded-2xl border border-line bg-surface-card p-3 text-sm">
          {result.error ? (
            <p className="font-bold text-clay">{result.error}</p>
          ) : (
            <p className="font-bold text-navy">
              {result.published === 0
                ? "Nothing published."
                : `Published ${result.published}.`}
              {result.held.length > 0 && ` ${result.held.length} held back:`}
            </p>
          )}
          {result.held.length > 0 && (
            <ul className="mt-2 space-y-1 text-ink-soft">
              {result.held.map((h) => (
                <li key={h.id}>
                  <span className="font-bold text-navy">{labels[h.id] ?? h.title}</span>{" "}
                  — {h.because}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-2 text-xs font-bold text-ocean underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* The tick list. Rendered here rather than inside each result row so the
          rows stay a plain link somewhere else in the app can reuse. */}
      <ul className="mt-2 space-y-1">
        {ids.map((id) => (
          <li key={id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-navy/5">
              <input
                type="checkbox"
                checked={selected.has(id)}
                onChange={() => toggle(id)}
                className="h-5 w-5 accent-gold"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-navy">
                {labels[id] ?? id}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
