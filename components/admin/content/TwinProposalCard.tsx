/* ============================================================================
   EDIAGD — a cue and a quote that may be one idea

   NO BUTTON. Every other card in this queue answers its question in place;
   this one deliberately does not, because the answer is an artifact link and a
   link changes what the day picker serves. Both texts, the overlap, and a way
   to open either row — that is the whole card.

   THE PERCENTAGE IS LABELLED IN WORDS, not printed bare. "0.62" is a number
   from a scan; "share 62% of their words" is the thing it measures, and this
   card is read by the person who wrote both of them, not by the person who
   wrote the scan.
   ============================================================================ */

import { Card } from "@/components/brand/Card";
import type { TwinProposal } from "@/lib/twins";

function Strength({ overlap }: { overlap: number }) {
  const pct = Math.round(overlap * 100);
  const strong = overlap >= 0.85;
  const partial = overlap >= 0.4;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
        strong
          ? "bg-teal text-white"
          : partial
            ? "border border-line text-ink-soft"
            : "border border-line text-ink-soft opacity-70"
      }`}
    >
      {pct}% same words
    </span>
  );
}

export function TwinProposalCard({ proposal }: { proposal: TwinProposal }) {
  return (
    <Card className="p-4">
      <p className="text-base font-extrabold text-navy">{proposal.cue.title}</p>

      <div className="mt-3 rounded-xl border border-line bg-cream-card p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          The cue
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {proposal.cue.body ?? "—"}
        </p>
        <a
          href={`/admin/content/item/${proposal.cue.contentId}`}
          className="mt-2 inline-block text-sm font-bold text-teal underline"
        >
          Open the cue
        </a>
      </div>

      <div className="mt-3 space-y-3">
        {proposal.candidates.map((c) => (
          <div key={c.contentId} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                The quote
              </span>
              <Strength overlap={c.overlap} />
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {c.body ?? "—"}
            </p>
            <a
              href={`/admin/content/item/${c.contentId}`}
              className="mt-2 inline-block text-sm font-bold text-teal underline"
            >
              Open the quote
            </a>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-soft">
        Matched on {proposal.candidates[0].matchedOn}. Nothing is linked
        automatically — until one of these is linked as the other&apos;s
        artifact, the daily loop can serve both on the same day.
      </p>
    </Card>
  );
}
