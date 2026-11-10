import Link from "next/link";
import type { Kickback } from "@/lib/story";

/* ============================================================================
   EDIAGD — Mitch asked for something more substantial

   Ryan, 9 November: "A kickback shows on the advisor's screen as a banner above
   labor sales, asking for something more substantial to complete the module."

   ---------------------------------------------------------------------------
   THE WORDS ARE THE RULING AND THEY ARE NOT PARAPHRASED
   ---------------------------------------------------------------------------
   "asked for something more substantial to complete the module" — not
   feedback, not grading, not rejected, not declined. Three of those four would
   turn a request into a verdict, and the one thing this banner has to achieve
   is that the advisor writes more rather than feeling marked down.

   The sentence NAMES MITCH. "Your story was kicked back" is the passive voice
   of a system refusing somebody; a person read it and a person asked, and the
   advisor already knows who Mitch is.

   ---------------------------------------------------------------------------
   NOT DISMISSABLE, AND THAT IS NOT AN OVERSIGHT
   ---------------------------------------------------------------------------
   There is no × and no "remind me later". The track's story leg is UNMET while
   this is up — my_story_for() excludes a kicked-back story (0180) — so a
   dismissable banner would leave somebody with a credential quietly stuck and
   the only explanation hidden behind a tap they already made.

   It clears when the story is EDITED, which the database does itself:
   `advisor_story_edit_resets_review` returns the row to pending on a changed
   body, so this banner's absence is derived from the row rather than from a
   flag somebody has to remember to unset.

   ---------------------------------------------------------------------------
   ONE BANNER PER STORY, NOT ONE LISTING THE TRACKS
   ---------------------------------------------------------------------------
   Each kickback carries ITS OWN note from Mitch and its own link to its own
   rewrite. A combined banner would have to drop the notes — a list cannot
   render two different sentences — and the note is the most useful thing on
   here. Two is already the unlikely case; eight is the ceiling and only for
   somebody who wrote eight thin stories.

   CLAY, NEVER RED. styles/brand.css spells it out on the token itself: "warm
   attention — NEVER red". This is a request, not an error.
   ============================================================================ */

export function KickbackBanner({ kickbacks }: { kickbacks: readonly Kickback[] }) {
  if (kickbacks.length === 0) return null;

  return (
    <div className="mt-5 space-y-3">
      {kickbacks.map((k) => (
        <section
          key={k.certificationId}
          /*
           * `role="status"` rather than `alert`. An alert interrupts a screen
           * reader mid-sentence, which is right for something that just went
           * wrong and wrong for a standing request that was already true when
           * the page loaded.
           */
          role="status"
          className="rounded-card border-2 border-clay/40 bg-clay/10 p-4"
        >
          <p className="text-base leading-relaxed text-ink">
            Mitch read your Good News Story for{" "}
            <strong className="font-extrabold text-navy">{k.trackName}</strong> and
            asked for something more substantial to complete the module.
            {k.reviewNote ? ` ${withStop(k.reviewNote)}` : ""}
          </p>

          {/*
            THE LINK GOES STRAIGHT TO THE TEXTAREA. The story page shows Mitch's
            note above the box and the button reads "Save my rewrite", so the
            whole of the ask and the whole of the answer are on one screen.

            A SLUG THAT DID NOT LOAD GETS NO LINK RATHER THAN A BROKEN ONE.
            loadKickback falls back to "" when the embedded certification is
            unreadable, and `/certifications//story` resolves to nothing — a
            dead tap under a sentence telling somebody to act is worse than a
            sentence they have to act on from the Certifications tab.
          */}
          {k.slug ? (
            <Link
              href={`/certifications/${encodeURIComponent(k.slug)}/story`}
              className="mt-3 inline-flex min-h-[2.75rem] items-center rounded-xl bg-clay px-4 text-sm font-extrabold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
            >
              Rewrite it
            </Link>
          ) : (
            <p className="mt-2 text-sm font-bold text-ink-soft">
              Open the track from Certifications to rewrite it.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * Mitch's note, run into the sentence before it, ending in something.
 *
 * He is typing one line into a box, not drafting copy — "say what you actually
 * did" arrives with no full stop, and the banner would read as a fragment
 * colliding with the paragraph it sits inside. The note is never altered
 * otherwise: no capitalisation, no trimming beyond what the database already
 * did, because it is a person's own sentence to the advisor.
 */
function withStop(note: string): string {
  return /[.!?]$/.test(note.trim()) ? note.trim() : `${note.trim()}.`;
}

export default KickbackBanner;
