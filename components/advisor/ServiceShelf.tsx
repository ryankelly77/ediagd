"use client";

import { useState, useTransition } from "react";
import { TrackedVideo } from "@/components/video/TrackedVideo";
import { CueCard } from "@/components/advisor/CueCard";
import { completeLibraryItem } from "@/lib/library-actions";
import type { VideoRenditions } from "@/lib/mux/playback";
import type { FamilyItem } from "@/lib/service-family";

/* ============================================================================
   EDIAGD — a service family's films and cues

   WATCHING AHEAD. TWO_LADDERS: "The loop guarantees a floor; the card lifts the
   ceiling. Both read and write ONE consumption record, so the loop never
   re-serves a film watched in the card."

   That one record is content_progress, and the write goes through
   completeLibraryItem — the SAME server action the lesson library uses. Not a
   second completion path: it re-checks entitlement with the caller's own
   client, writes completed_at, and runs the certification accrual. A film
   finished here is a film the pitch slot will skip tomorrow, for free.
   ============================================================================ */

type PlayableFilm = FamilyItem & { renditions: VideoRenditions };

export function ServiceShelf({
  family,
  films,
  cues,
  isFocusFamily,
}: {
  family: string;
  films: PlayableFilm[];
  cues: FamilyItem[];
  isFocusFamily: boolean;
}) {
  /*
   * OPENS ON THE NEXT UNWATCHED FILM, which is what "continue" on the card
   * promised. Falls back to the first film when the shelf is finished — there
   * is no next, and an empty player would be a worse answer than a rewatch.
   */
  const firstUnwatched = films.find((f) => !f.completed) ?? films[0] ?? null;
  const [playing, setPlaying] = useState<string | null>(firstUnwatched?.contentId ?? null);

  /*
   * Completion is held here rather than re-read from the server, so the row
   * ticks the moment the bar is cleared. The server is still the authority —
   * the action re-checks entitlement and the unique index is the pay-once
   * guard — this is only what the screen shows while it waits.
   */
  const [done, setDone] = useState<Set<string>>(
    () => new Set(films.filter((f) => f.completed).map((f) => f.contentId))
  );
  const [, startTransition] = useTransition();

  const markDone = (contentId: string, pct: number, errored: boolean) => {
    /*
     * ---- A FAILED PLAYER IS NOT A WATCH, AND HERE THAT MATTERS MORE --------
     *
     * TrackedVideo fires onGateMet "by watching OR BY FAILING", and in the
     * ritual that is right: a broken player must never cost somebody their
     * streak, so the day completes and records watch_error.
     *
     * The shelf is the opposite case. Completion here writes completed_at,
     * which is the cursor the PITCH SLOT reads — so crediting a failure would
     * quietly remove that film from the loop and the advisor would never be
     * served it. A film silently skipped is worse than a film they have to
     * come back to, and unlike the ritual nothing is lost by not crediting:
     * this screen is voluntary and it is still there tomorrow.
     *
     * Caught by watching the shelf against a fixture whose Mux ids are fake —
     * every film ticked itself the moment its player gave up.
     */
    if (errored) return;
    if (done.has(contentId)) return;
    setDone((prev) => new Set(prev).add(contentId));
    startTransition(async () => {
      try {
        await completeLibraryItem(contentId, pct);
      } catch {
        /*
         * Swallowed, and the tick stays. A failed write means the film is
         * offered again tomorrow, which is a small cost; yanking the tick back
         * would tell somebody who just watched it that they had not.
         */
      }
    });
  };

  const current = films.find((f) => f.contentId === playing) ?? null;

  return (
    <div className="mt-6 space-y-8">
      {/* ---- The films ---------------------------------------------------- */}
      {films.length > 0 ? (
        <section>
          <p className="ediagd-eyebrow">
            {isFocusFamily ? "The family you're working" : "Pitch films"}
          </p>

          {current && (
            <div className="mt-3">
              <h2 className="text-lg font-extrabold leading-tight text-navy">
                {current.title}
              </h2>
              {current.stage && (
                <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                  {current.stage}
                </p>
              )}
              <div className="mt-3">
                <TrackedVideo
                  /*
                   * `credit-only`, NOT `gate-continue`. There is no Continue
                   * here and nothing is held shut: this screen is voluntary, so
                   * a watch is measured and credited and never enforced. The
                   * ritual is where a gate belongs.
                   */
                  policy="credit-only"
                  contentId={current.contentId}
                  renditions={current.renditions}
                  title={current.title}
                  threshold={90}
                  initialWatchedPct={done.has(current.contentId) ? 100 : 0}
                  initialPositionSec={null}
                  onGateMet={(s) => markDone(current.contentId, s.pct, s.error)}
                />
              </div>
            </div>
          )}

          <ul className="mt-5 space-y-2">
            {films.map((f, i) => {
              const finished = done.has(f.contentId);
              const active = f.contentId === playing;
              return (
                <li key={f.contentId}>
                  <button
                    type="button"
                    onClick={() => setPlaying(f.contentId)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                      active
                        ? "border-gold bg-gold-soft/30"
                        : "border-line bg-surface-card hover:bg-cream-card"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold ${
                        finished ? "bg-teal text-white" : "bg-cream-card text-ink-soft"
                      }`}
                    >
                      {finished ? "✓" : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-navy">
                        {f.title}
                      </span>
                      {f.stage && (
                        <span className="block text-xs text-ink-soft">{f.stage}</span>
                      )}
                    </span>
                    {f.durationSec != null && (
                      <span className="ediagd-numeral shrink-0 text-xs text-ink-soft">
                        {Math.floor(f.durationSec / 60)}:
                        {String(f.durationSec % 60).padStart(2, "0")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        /*
         * HONESTLY EMPTY, AND SPECIFIC ABOUT WHY. Ten coachable families have no
         * film at all; saying "on the way" for all of them was the old dialog's
         * mistake, because for Belts & Cooling it was simply untrue.
         */
        <section className="rounded-card border border-line bg-cream-card px-6 py-8 text-center">
          <p className="text-base font-extrabold text-navy">
            No pitch films for {family} yet.
          </p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
            The cues below have the words to use on the drive.
          </p>
        </section>
      )}

      {/* ---- The cues ----------------------------------------------------- */}
      {cues.length > 0 && (
        <section>
          <p className="ediagd-eyebrow">
            {cues.length === 1 ? "Coaching cue" : "Coaching cues"}
            <span className="ediagd-numeral ml-2 text-xs font-bold text-ink-soft">
              {cues.length}
            </span>
          </p>
          <ul className="mt-3 space-y-3">
            {cues.map((c) => (
              <li key={c.contentId}>
                <CueCard cue={{ id: c.contentId, title: c.title, body: c.body }} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
