"use client";

/* ============================================================================
   EDIAGD — one question, answered in place

   The shape follows the ask. A cue with two possible endings is a CHOICE and
   gets two buttons; a cue with no fuller version anywhere is a REWRITE and gets
   a box. Rendering both as a generic "edit this row" form would make Mitch
   work out which kind of question he is looking at every time, and the whole
   point is that the queue already knows.

   Every card can also be answered with "Reads fine" — a real answer, kept, so
   the item does not come back tomorrow.
   ============================================================================ */

import { useState, useTransition } from "react";
import { answerReview, dismissReview } from "@/app/(app)/admin/content/review/actions";
import { Card } from "@/components/brand/Card";

export type ReviewRow = {
  id: string;
  contentId: string;
  reason: "truncated" | "pick_ending" | "missing_nugget" | "attribution" | "needs_op_code";
  detail: string | null;
  options: { ends?: string; candidates?: string[] } | null;
  title: string;
  body: string | null;
  nugget: string | null;
  voice: string | null;
  source: string | null;
  type: string;
};

const FIELD = {
  truncated: "body",
  pick_ending: "body",
  missing_nugget: "coaching_nugget",
  attribution: "voice",
  needs_op_code: "body",
} as const;

export function ReviewItem({ row }: { row: ReviewRow }) {
  // A truncated cue is a rewrite of what is already there, so the box starts
  // pre-filled — retyping 600 correct characters to add the missing 40 is not
  // a task anybody finishes.
  const [text, setText] = useState(
    row.reason === "missing_nugget" ? "" : row.body ?? ""
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  function save(value: string) {
    setError(null);
    start(async () => {
      const r = await answerReview(row.contentId, FIELD[row.reason], value);
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  }

  function fine() {
    setError(null);
    start(async () => {
      const r = await dismissReview(row.id);
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-navy">{row.title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {row.voice ? `${row.voice} · ` : ""}
            {(row.source ?? "").replace(/^(Mitch import|Quote Master) — /, "")}
          </p>
        </div>
        <a
          href={`/admin/content/item/${row.contentId}`}
          className="shrink-0 text-xs font-bold text-teal underline"
        >
          Open
        </a>
      </div>

      {row.detail && (
        <p className="mt-3 text-sm leading-relaxed text-ink">{row.detail}</p>
      )}

      {/* ---- What we currently have ------------------------------------- */}
      {row.reason !== "attribution" && (
        <div className="mt-3 rounded-xl bg-cream-card p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            {row.reason === "missing_nugget" ? "The quote" : "Where it stops"}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
            {row.reason === "missing_nugget" ? row.body : row.body}
          </p>
        </div>
      )}

      {/* ---- The answer, shaped like the question ------------------------ */}
      {row.reason === "pick_ending" && row.options?.candidates ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            The two versions in your workbook
          </p>
          {row.options.candidates.map((c, i) => (
            <p key={i} className="rounded-xl border border-line p-2 text-xs text-ink-soft">
              {c}
            </p>
          ))}
          <p className="text-xs text-ink-soft">
            Paste the ending you meant into the box and save.
          </p>
        </div>
      ) : null}

      {row.reason === "attribution" && row.options?.candidates ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.options.candidates.map((c) => (
            <button
              key={c}
              type="button"
              disabled={pending}
              onClick={() => save(c)}
              className="rounded-xl border border-teal px-3 py-2 text-sm font-bold text-teal transition hover:bg-teal-soft/20 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={row.reason === "missing_nugget" ? 4 : 8}
          placeholder={
            row.reason === "missing_nugget"
              ? "When would you use this quote, and with whom?"
              : "Paste the full version here."
          }
          className="mt-3 w-full rounded-xl border border-line bg-white p-3 text-sm text-ink focus:border-teal focus:outline-none"
        />
      )}

      {error && <p className="mt-2 text-sm font-bold text-clay">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        {row.reason !== "attribution" && (
          <button
            type="button"
            disabled={pending || !text.trim()}
            onClick={() => save(text)}
            className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={fine}
          className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-cream-card disabled:opacity-50"
        >
          Reads fine as it is
        </button>
      </div>
    </Card>
  );
}
