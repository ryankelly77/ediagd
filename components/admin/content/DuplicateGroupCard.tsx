"use client";

/* ============================================================================
   EDIAGD — two quotes that say the same thing, and one question about them

   THE CARD ASKS IN ENGLISH. "Containment 0.43, shape excerpt" is what the scan
   found; it is not what Mitch is being asked. He is being asked which words an
   advisor should see, so that is the heading, and the machinery is a single
   grey line at the bottom for when the answer is "why am I looking at this".

   STACKED, NOT SIDE BY SIDE. The comparison is between two blocks of prose of
   very different lengths, and he is reviewing from a phone. Columns would put
   the long one in a narrow gutter and make the short one look like a caption.
   Full width each, longest first, so the passage reads as the thing the short
   line came out of.
   ============================================================================ */

import { useState, useTransition } from "react";
import { Card } from "@/components/brand/Card";
import type { DuplicateGroup } from "@/lib/duplicates";
import {
  resolveDuplicate,
  keepAllInDuplicate,
  createQuoteFromLine,
} from "@/app/(app)/admin/content/review/duplicate-actions";

export function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (gone) return null;

  const proposed = group.members.filter((m) => m.proposed === "survive");
  const multi = proposed.length > 1;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) setGone(true);
      else { setError(r.error); setConfirming(null); }
    });
  }

  return (
    <Card className="p-4">
      <p className="text-base font-extrabold text-navy">
        These say the same thing. Which should advisors see?
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Keeping one withdraws the others. Nothing is deleted — anything withdrawn
        can be brought back.
      </p>

      <div className="mt-4 space-y-3">
        {group.members.map((m) => {
          const blocked = m.unretirable || Boolean(m.linkedVideo);
          // Every OTHER row would have to retire for this one to be kept, so a
          // linked row anywhere in the group disables every button but its own.
          const blockedBy = group.members.find(
            (o) => o.contentId !== m.contentId && (o.unretirable || Boolean(o.linkedVideo))
          );

          return (
            <div
              key={m.contentId}
              className={`rounded-xl border p-3 ${
                m.proposed === "survive" ? "border-teal bg-teal-soft/10" : "border-line bg-cream-card"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-ink-soft">{m.quoteKey ?? "—"}</span>
                {m.voice && <span className="text-xs text-ink-soft">· {m.voice}</span>}
                {m.proposed === "survive" && (
                  <span className="rounded-full bg-teal px-2 py-0.5 text-[11px] font-bold text-white">
                    Suggested
                  </span>
                )}
                {m.linkedVideo && (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                    Video: {m.linkedVideo.title}
                  </span>
                )}
                {m.saveCount > 0 && (
                  <span className="text-[11px] font-bold text-ink-soft">
                    {m.saveCount} kept it
                  </span>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {m.body}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirming === m.contentId ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => resolveDuplicate(group.id, [m.contentId]))}
                      className="rounded-xl bg-gold px-3 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-50"
                    >
                      {pending ? "Saving…" : `Yes — withdraw the other ${group.members.length - 1 === 1 ? "one" : group.members.length - 1}`}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirming(null)}
                      className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink-soft"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={pending || Boolean(blockedBy)}
                    onClick={() => setConfirming(m.contentId)}
                    className="rounded-xl border border-teal px-3 py-2 text-sm font-bold text-teal transition hover:bg-teal-soft/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-soft disabled:opacity-60"
                  >
                    Keep this one
                  </button>
                )}
                <a
                  href={`/admin/content/item/${m.contentId}`}
                  className="text-sm font-bold text-teal underline"
                >
                  Edit
                </a>
              </div>

              {/* Same shape as the disabled Op Code field: the control is off
                  and the reason sits under it, rather than a button that fails
                  when you press it. */}
              {blockedBy && !blocked && (
                <p className="mt-2 text-xs font-bold text-clay">
                  Keeping this would withdraw {blockedBy.quoteKey}, which
                  {blockedBy.linkedVideo ? ` "${blockedBy.linkedVideo.title}" points at` : " is linked to a video"}.
                  Move that link first.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- The group-10 answer: keep the lines, withdraw the passage ----- */}
      {multi && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resolveDuplicate(group.id, proposed.map((m) => m.contentId)))}
          className="mt-4 w-full rounded-xl bg-gold px-4 py-3 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-50"
        >
          Keep the {proposed.length} short lines, withdraw the long one
        </button>
      )}

      {/* ---- A line in the passage that has no row of its own -------------- */}
      {group.orphanLines.length > 0 && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            In the long one, not saved anywhere else
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Withdrawing the long version loses {group.orphanLines.length === 1 ? "this line" : "these lines"}. Make
            {group.orphanLines.length === 1 ? " it" : " them"} a quote first?
          </p>
          <div className="mt-2 space-y-2">
            {group.orphanLines.map((line) => (
              <div key={line} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <p className="flex-1 text-sm text-ink">{line}</p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await createQuoteFromLine(group.id, group.members[0].contentId, line);
                      if (!r.ok) setError(r.error);
                    })
                  }
                  className="shrink-0 rounded-xl border border-teal px-3 py-2 text-xs font-bold text-teal transition hover:bg-teal-soft/20 disabled:opacity-50"
                >
                  Make it its own quote
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-bold text-clay">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => keepAllInDuplicate(group.id))}
          className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-cream-card disabled:opacity-50"
        >
          They are different — keep them all
        </button>
      </div>

      <p className="mt-3 text-[11px] text-ink-soft">
        Matched because {group.relation ?? "they overlap"}
        {group.sourceGroup ? ` · group ${group.sourceGroup}` : ""}
      </p>
    </Card>
  );
}
