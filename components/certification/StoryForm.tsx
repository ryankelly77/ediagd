"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
import { Toggle } from "@/components/brand/Toggle";
import { submitStory, setStoryShared } from "@/lib/story-actions";

/* ============================================================================
   EDIAGD — the Good News Story form

   THIS SCREEN IS THE END OF A TRACK, NOT A FORM FIELD.

   An advisor reaches it having done roughly fifty mornings. It is the last
   thing between them and a credential, and it is the only place in the whole
   product where they write rather than watch or tap. A bare textarea under a
   heading would be wrong: it would make eight months of work look like a
   support ticket.

   So the screen names the track, says what they have just finished, and then
   asks. The ceremony is the point — this is the moment the product stops
   testing recall and asks what they actually did.

   Restraint, though, same as everywhere else. No confetti: the celebration
   belongs to the credential, not to the act of submitting. The hero states the
   achievement plainly and the rest of the screen gets out of the way.
   ============================================================================ */

export type StoryFormProps = {
  certificationId: string;
  trackName: string;
  /** Items in the track, for the line that says what they finished. */
  itemCount: number;
  /**
   * Does this track have any quiz questions at all?
   *
   * MEASURED, NOT ASSUMED. Only Walk Around has any — 28 across 7 modules —
   * and six other tracks have modules and none. "and every check" would have
   * told advisors on six of seven tracks that they passed checks which never
   * existed.
   */
  hasChecks: boolean;
  /**
   * Is the story the LAST leg — every module already complete?
   *
   * trackComplete = modules.every(moduleComplete) && (storyRequired ?
   * storySubmitted : true). When this is true, pressing submit finishes the
   * track, and the screen is allowed to say so. When it is false — someone
   * arrived by URL with modules outstanding — it must not.
   */
  completesTrack: boolean;
  existing: {
    body: string;
    sharedToTeam: boolean;
    submittedAt: string;
    updatedAt: string;
    reviewedAt: string | null;
  } | null;
  /** Rooftop name, so "your team" is a place rather than an abstraction. */
  rooftopName: string | null;
  /**
   * PREVIEW. Nothing is written and the actions are never called — see
   * lib/navigation.ts ADMIN_PREVIEWS and the count in reports/phase-3i.
   */
  preview?: boolean;
};

export function StoryForm({
  certificationId,
  trackName,
  itemCount,
  hasChecks,
  completesTrack,
  existing,
  rooftopName,
  preview = false,
}: StoryFormProps) {
  const [body, setBody] = useState(existing?.body ?? "");
  const [shared, setShared] = useState(existing?.sharedToTeam ?? false);
  const [saved, setSaved] = useState(false);
  /* Has a story been submitted AT ALL — loaded with one, or written just now. */
  const [submitted, setSubmitted] = useState(existing !== null);
  /* Unsaved changes sitting in the box. */
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isEdit = existing !== null;

  /* Reject empty and whitespace-only. NOTHING ELSE — see lib/story-actions.ts
     for why there is no character minimum and why adding one is a mistake. */
  const canSave = body.trim().length > 0 && !pending;

  function save() {
    setError(null);
    setDirty(false);
    setSubmitted(true);
    if (preview) {
      /* The preview never calls the action. It is not "the action with a flag
         checked inside" — it does not reach the server at all, because the one
         record that must contain a person's own words must never contain words
         nobody typed. */
      setSaved(true);
      return;
    }
    startTransition(async () => {
      const r = await submitStory(certificationId, body);
      if (r.ok) setSaved(true);
      else setError(r.error);
    });
  }

  function toggleShared(next: boolean) {
    setShared(next);
    if (preview) return;
    startTransition(async () => {
      const r = await setStoryShared(certificationId, next);
      if (!r.ok) {
        setError(r.error);
        setShared(!next);
      }
    });
  }

  return (
    <main className="mx-auto max-w-app px-4 pb-16 pt-6">
      {/*
        THE PREVIEW FRAME LIVES HERE AND NOWHERE ELSE.
        It used to leak into the product's own words — the confirmation read
        "Saved — in the real thing.", which is the preview talking about itself
        in the middle of a screen an advisor is supposed to read. A preview
        exists to show what the real thing looks like, so every other string on
        this page is now exactly what an advisor sees.
        STICKY, because the honest worry was that this scrolls away and somebody
        believes a preview submission was real. That is solved by keeping the
        frame visible, not by rewriting the product into preview-speak.
      */}
      {preview && (
        <p className="sticky top-0 z-10 -mx-4 mb-4 bg-gold/90 px-4 py-3 text-sm font-bold text-navy shadow-sm">
          Preview — nothing you type here is saved. Shown as an advisor who has
          finished the track would see it.
        </p>
      )}

      {/* ---- The ceremony: name the track, say what they finished --------- */}
      <section className="ediagd-hero" data-intentional-bleed>
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">
            {isEdit ? "Your Good News Story" : "One last thing"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white">
            {trackName}
          </h1>
          {!isEdit && itemCount > 0 && (
            /*
              Explicit {" "} after the expression: SWC drops a plain leading
              space on a text node that wraps to the next line, which is how
              this rendered "56items". Same fix, same reason, as the note in
              OnboardingFlow.

              AND "every check" ONLY WHEN THERE ARE CHECKS — see hasChecks.
            */
            <p className="mt-3 text-sm leading-relaxed text-ice-dim">
              That&apos;s all {itemCount}{" "}
              {hasChecks ? "items and every check." : "items."} One thing left,
              and it&apos;s the part nobody else asks for.
            </p>
          )}
          {isEdit && (
            <p className="mt-3 text-sm leading-relaxed text-ice-dim">
              Submitted{" "}
              {new Date(existing.submittedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
              . It counts already — you can change it whenever you like.
            </p>
          )}
        </div>
      </section>

      {/* ---- The prompt --------------------------------------------------- */}
      <div className="mt-6">
        {/* "because of this track" came out: the hero says the track name in
            40px directly above. Three lines of large bold become two and
            nothing is lost. */}
        <label htmlFor="story" className="block text-lg font-extrabold leading-snug text-ink">
          Tell us about a time you did something differently on the drive.
        </label>

        <textarea
          id="story"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
            setDirty(true);
          }}
          rows={9}
          placeholder="What happened, and what you did."
          className="mt-3 w-full rounded-card border border-line bg-white px-4 py-3 text-base leading-relaxed text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        />

        {/*
          RULING 2 — SHIPS WITH THE FORM OR THE FORM DOES NOT SHIP.
          Advisors will otherwise write "Mrs. Henderson in the blue Pacifica
          wouldn't buy the alignment until…", because that is how people
          describe their work. Plain and short: a legal notice here would make
          the whole screen feel like a liability exercise, which is the opposite
          of what it is for.
        */}
        <p className="mt-2 text-sm text-ink-soft">
          Please don&apos;t use customer names.
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-card bg-clay/15 px-4 py-3 text-sm font-bold text-clay">
          {error}
        </p>
      )}

      {/*
        THE BUTTON STOPS OFFERING TO SUBMIT ONCE IT HAS BEEN SUBMITTED.
        `submitted` rather than `isEdit`: isEdit is the state the page LOADED
        in, so after a fresh submit it was still false and the button still
        read "Submit my story" — which reads as though the first press did not
        take. The label now tracks what is true, and with `dirty` it also says
        whether there is anything to save.
      */}
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gold px-4 py-3.5 text-base font-extrabold text-navy shadow-[0_4px_16px_rgba(12,28,44,0.24)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {pending
          ? "Saving…"
          : !submitted
            ? "Submit my story"
            : dirty
              ? "Save changes"
              : "Saved"}
      </button>

      {/*
        ---- THE CONFIRMATION IS A CREDENTIAL LANDING, NOT A SAVE -------------

        Submitting the story is the LAST leg:

            trackComplete = modules.every(moduleComplete)
                            && (storyRequired ? storySubmitted : true)

        The advisor has just finished roughly fifty mornings, and this press
        finishes the track. "Saved" is what a form says; this is the moment the
        hero card promised one screen earlier.

        IT ONLY SAYS SO WHEN IT IS TRUE. completesTrack is false for somebody
        who arrived by URL with modules outstanding, and then the honest
        confirmation is the smaller one — the story is kept, the track is not
        finished.
      */}
      {saved && !dirty && (
        completesTrack ? (
          <div className="mt-5 rounded-card bg-navy p-5 text-center">
            <p className="text-xl font-extrabold leading-tight text-white">
              That&apos;s {trackName} done.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ice-dim">
              Every item, {hasChecks ? "every check, " : ""}and the part nobody
              else asks for. It counts towards your credential from now.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-center text-sm font-bold text-ocean">
            Your story is saved. The track finishes when the rest of the modules
            are done.
          </p>
        )
      )}

      {/* ---- Sharing: off, and it says who ------------------------------- */}
      {(isEdit || saved) && (
        <div className="mt-8 rounded-card border border-line bg-white p-4">
          {/*
            THE SWITCH NEEDS A VISIBLE LABEL, and Toggle's own doc says so —
            `label` is the aria-label, "the visible text lives beside it". It
            had none, so the control was a bare switch: before reading the
            sentence underneath you could not tell what it governed, and you
            could not read its state either.

            The label names the thing. The sentence below still explains who
            sees it, which is the part that was already working.
          */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-base font-extrabold text-ink">
              Share with my team
            </span>
            <Toggle
              checked={shared}
              onChange={toggleShared}
              label="Share this story with advisors at my store"
            />
          </div>
          {/*
            RULING 6 — SAY WHAT SHARING DOES, NOT "SHARE".
            An advisor deciding whether to show colleagues a story about their
            own work deserves to know exactly who that is. Both halves name the
            audience, so the label is the answer whichever way it is set — and
            the OFF state is worth stating too, because "your manager reads this
            either way" is something they should know before they write, not
            discover afterwards.
          */}
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {shared
              ? `Advisors at ${rooftopName ?? "your store"} can read it. Your manager reads it either way.`
              : `Off — only you and your manager. Turn it on to let advisors at ${rooftopName ?? "your store"} read it too.`}
          </p>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/certifications"
          className="text-sm font-extrabold text-ocean underline underline-offset-4"
        >
          Back to your tracks
        </Link>
      </div>
    </main>
  );
}
