"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TrackedVideo } from "@/components/video/TrackedVideo";
import { completeLibraryItem } from "@/lib/library-actions";
import type { VideoRenditions } from "@/lib/mux/playback";

/* ============================================================================
   EDIAGD — a track's entry film, watched ahead of the morning it would open

   WHY THIS SCREEN EXISTS. The entry film was served in exactly one place: the
   track_entry morning in the daily loop. On /certifications/[slug] it was a
   card with a play glyph and the caption "opens the track on your first
   morning" — and it was not a link. It looked tappable and did nothing, and
   nothing in the library played it either. Valerie Patterson, a drive manager,
   reported on 10 November that she could not open the opener; she was working
   ahead, which is the thing the track page exists to let her do.

   Ryan's ruling the same day: the opener is playable from the track page.

   ---------------------------------------------------------------------------
   `credit-only`, AND THE SHAPE IS THE SERVICE SHELF'S
   ---------------------------------------------------------------------------
   Not the daily loop's `gate-continue` and not its watch ticket: there is no
   Continue here and no day being completed. Watching is voluntary and it is
   measured and credited, exactly as the family card does it, through the one
   server action both library surfaces already share.

   An ERROR IS NOT A WATCH. TrackedVideo fires onGateMet "by watching OR BY
   FAILING" because in the ritual a broken player must never cost somebody
   their streak. Here, as on the shelf, crediting a failure would write the
   completed_at that makes the loop stop serving this film — so an advisor whose
   player died would lose the opener entirely and never be shown it again. The
   refusal is the same one, for the same reason, and 0 is the right credit.

   THE TICK FOLLOWS THE ROW, NEVER LEADS IT. completeLibraryItem reports failure
   by RETURNING { ok: false }; it does not throw. The shelf learned this the
   expensive way on 5 November — twelve films ticked, none saved, and the same
   advisor watched them all twice. So: say "saving", tick on ok, show the reason
   otherwise.
============================================================================ */

export function OpenerPlayer({
  contentId,
  title,
  renditions,
  trackSlug,
  trackName,
  alreadyWatched,
}: {
  contentId: string;
  title: string;
  renditions: VideoRenditions;
  trackSlug: string;
  trackName: string;
  alreadyWatched: boolean;
}) {
  const [done, setDone] = useState(alreadyWatched);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const back = `/certifications/${encodeURIComponent(trackSlug)}`;

  function onGateMet(pct: number, errored: boolean) {
    if (errored) return; // see the note above — a failed player is not a watch
    if (done || saving) return;

    setSaving(true);
    setError(null);
    startTransition(async () => {
      /* 'library', NOT a fourth surface word. 0123's vocabulary is
         loop | card | library | quiz and the column's check constraint holds
         it to those four; the track page's own comment calls its module links
         "THE ACCELERATION", which is the library. Minting a fifth value would
         need a migration and would silently fall out of every fixed list that
         already enumerates the four — the construction AGENTS.md warns about —
         for a distinction nothing selects on. */
      const result = await completeLibraryItem(contentId, "library", pct).catch(
        (e: unknown) => ({
          ok: false as const,
          error: e instanceof Error ? e.message : "Could not save that just now.",
        })
      );
      setSaving(false);
      if (!result.ok) {
        setError(result.error ?? "Could not save that just now.");
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="mt-4">
      <TrackedVideo
        policy="credit-only"
        contentId={contentId}
        renditions={renditions}
        title={title}
        threshold={90}
        initialWatchedPct={alreadyWatched ? 100 : 0}
        initialPositionSec={null}
        onGateMet={(s) => onGateMet(s.pct, s.error)}
      />

      {/* SAID OUT LOUD. The alternative is what happened on the shelf: a film
          that did not save looked exactly like a film that did. */}
      {saving && (
        <p aria-live="polite" className="mt-3 text-xs font-bold text-ink-soft">
          Saving this one…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-card px-3 py-2 text-xs font-bold"
          style={{
            background: "color-mix(in srgb, rgb(var(--ediagd-clay)) 12%, transparent)",
            color: "rgb(var(--ediagd-clay))",
          }}
        >
          {error} This one is not saved — it will still be here.
        </p>
      )}

      {done && !error && (
        <p className="mt-3 text-sm font-bold text-palm">
          Watched. {trackName} is open — the lessons are below.
        </p>
      )}

      <Link
        href={back}
        className="mt-5 inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-gold px-5 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        {done ? `On to ${trackName}` : `Back to ${trackName}`}
      </Link>
    </div>
  );
}
