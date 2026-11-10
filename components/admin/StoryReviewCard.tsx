"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/brand/Card";
import { reviewStory } from "@/lib/story-actions";
import type { QueueStory } from "@/lib/story";

/* ============================================================================
   EDIAGD — one story on the review queue

   Mitch reads it and marks it Good, or Kickback with an optional sentence.

   ---------------------------------------------------------------------------
   THE WHOLE BODY, NEVER TRUNCATED
   ---------------------------------------------------------------------------
   These are a paragraph. A clamp with a "more" link would mean the default
   reading of this screen is a first line — and the thing being judged is
   whether the story is SUBSTANTIAL, which is precisely the property a first
   line hides. "I learned a lot about the walk-around and it really helped me"
   truncates to something that looks like an answer.

   ---------------------------------------------------------------------------
   A KICKBACK IS NOT AN ERROR STATE
   ---------------------------------------------------------------------------
   `clay` — the brand's warm attention, whose token in styles/brand.css carries
   the comment "NEVER red". An advisor's own account of their own work coming
   back in an error colour would read as a failed validation on the one personal
   record in the product. Good is `palm`, which is the same success token the
   on-track dot uses everywhere else.

   ---------------------------------------------------------------------------
   EVERY LABEL IS FORMATTED ON THE SERVER
   ---------------------------------------------------------------------------
   Dates arrive as finished strings rather than ISO stamps. A client component
   calling toLocaleDateString renders in the SERVER's zone during SSR and the
   BROWSER's on hydration, which is a mismatch on every machine not set to the
   server's timezone — a whole class of "it flickers and React complains" that
   costs nothing to avoid by passing text.
   ============================================================================ */

export type StoryReviewCardProps = {
  story: QueueStory;
  /** Finished strings from the server — see the note above. */
  submittedLabel: string;
  reviewedLabel: string;
  /** One per revision, newest first, aligned with story.revisions. */
  revisionLabels: string[];
};

export function StoryReviewCard({
  story,
  submittedLabel,
  reviewedLabel,
  revisionLabels,
}: StoryReviewCardProps) {
  /*
   * `status` TRACKS WHAT THE SERVER LAST CONFIRMED, not what was pressed. On
   * success it is set from the action's own argument; on failure it is left
   * exactly where it was, so a refused review does not leave a card claiming an
   * outcome the row does not have. Same discipline as StoryForm's `submitted`.
   */
  const [status, setStatus] = useState(story.reviewStatus);
  const [note, setNote] = useState(story.reviewNote ?? "");
  const [asking, setAsking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mark(verdict: "good" | "kickback") {
    setError(null);
    startTransition(async () => {
      const r = await reviewStory(story.id, verdict, verdict === "kickback" ? note : undefined);
      if (r.ok) {
        setStatus(verdict);
        setAsking(false);
      } else {
        setError(r.error);
      }
    });
  }

  /* The note Mitch has already sent, which is what the advisor is reading right
     now. Shown separately from the draft in the box so editing one is never
     mistaken for the other. */
  const sentNote = status === "kickback" ? story.reviewNote : null;

  return (
    <Card as="article" className="p-4">
      {/* ---- Who, where, which track ----------------------------------- */}
      {/*
        `min-w-0 flex-1` ON THE TEXT, NOT `flex-wrap` ON THE ROW.
        With wrap alone the chip's position depended on the NAME'S LENGTH — it
        sat top-right beside a short name and dropped onto its own line under a
        long one, so a list of cards had the status in two different places. The
        text column gives instead, which keeps the chip in one place down the
        whole list; that consistency is what makes the queue scannable.
      */}
      <div className="flex items-start justify-between gap-x-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold leading-snug text-navy">
            {story.advisorName}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {story.rooftopName} · {story.trackName}
          </p>
        </div>
        <StatusChip status={status} />
      </div>

      <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
        Submitted {submittedLabel}
      </p>

      {/* ---- The words, all of them ------------------------------------- */}
      {/*
        `whitespace-pre-wrap` because an advisor writing about their week uses
        line breaks, and collapsing them turns three moments into one run-on
        paragraph — which changes how substantial it reads.
      */}
      <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink">
        {story.body}
      </p>

      {/* ---- What was said last time, if anything ----------------------- */}
      {status !== "pending" && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm text-ink-soft">
            {status === "good" ? "Marked Good" : "Kicked back"}
            {story.reviewedByName ? ` by ${story.reviewedByName}` : ""}
            {story.reviewedAt ? ` · ${reviewedLabel}` : ""}
          </p>
          {sentNote && (
            <p className="mt-2 rounded-xl bg-clay/10 px-3 py-2 text-sm leading-relaxed text-ink">
              “{sentNote}”
            </p>
          )}
        </div>
      )}

      {/* ---- Previous versions: the reason 0127 keeps them --------------- */}
      {story.revisions.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="text-sm font-extrabold text-ocean underline underline-offset-4"
          >
            {showHistory ? "Hide" : "Show"}{" "}
            {story.revisions.length === 1
              ? "the previous version"
              : `${story.revisions.length} previous versions`}
          </button>
          {showHistory && (
            /*
              NEWEST FIRST, matching the order loadReviewQueue sorted them into.
              A story that came back after a kickback is the common case, and
              what Mitch wants is "what did it say before" — which is the most
              recent replacement, not the first draft.
            */
            <ol className="mt-3 space-y-3">
              {story.revisions.map((v, i) => (
                <li key={`${v.replacedAt}-${i}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                    Replaced {revisionLabels[i] ?? "earlier"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                    {v.body}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-clay/15 px-3 py-2 text-sm font-bold text-clay">
          {error}
        </p>
      )}

      {/* ---- The two buttons -------------------------------------------- */}
      <div className="mt-4 border-t border-line pt-4">
        {asking ? (
          /*
            THE NOTE IS OPTIONAL AND THE BUTTON SAYS SO. A required field here
            would produce "not substantial" eighteen times — Mitch's judgement
            reduced to a macro — and sometimes the kickback IS the whole
            message. The placeholder asks the useful question instead of
            labelling the advisor's work.
          */
          <div>
            <label
              htmlFor={`note-${story.id}`}
              className="block text-sm font-extrabold text-ink"
            >
              Anything to say to them? Optional.
            </label>
            <input
              id={`note-${story.id}`}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What would make it substantial?"
              className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => mark("kickback")}
                disabled={pending}
                className="min-h-[2.75rem] rounded-xl bg-clay px-4 text-sm font-extrabold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
              >
                {pending ? "Sending…" : "Send the kickback"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  setNote(story.reviewNote ?? "");
                }}
                disabled={pending}
                className="min-h-[2.75rem] rounded-xl border border-line px-4 text-sm font-extrabold text-ink-soft transition hover:bg-cream disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Never mind
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => mark("good")}
              disabled={pending || status === "good"}
              className="min-h-[2.75rem] rounded-xl bg-gold px-5 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              {pending ? "Saving…" : status === "good" ? "Good ✓" : "Good"}
            </button>
            <button
              type="button"
              onClick={() => setAsking(true)}
              disabled={pending}
              className="min-h-[2.75rem] rounded-xl border-2 border-clay px-5 text-sm font-extrabold text-clay transition hover:bg-clay/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
            >
              {status === "kickback" ? "Kick back again" : "Kickback"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * The state, named in words.
 *
 * NOT A COLOURED DOT. Three states where two of them matter and one is a
 * verdict about somebody's work — a dot would need a legend, and a legend on a
 * three-row list is a sign the labels should just be words.
 */
function StatusChip({ status }: { status: QueueStory["reviewStatus"] }) {
  const style =
    status === "good"
      ? "bg-palm-soft/60 text-navy"
      : status === "kickback"
        ? "bg-clay/15 text-clay"
        : "bg-gold-soft/50 text-navy";
  const label = status === "good" ? "Good" : status === "kickback" ? "Kicked back" : "Waiting";

  return (
    <span
      className={`shrink-0 rounded-pill px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] ${style}`}
    >
      {label}
    </span>
  );
}

export default StoryReviewCard;
