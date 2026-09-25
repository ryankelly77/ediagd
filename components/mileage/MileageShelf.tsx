"use client";

import { useState } from "react";
import { TrackedVideo } from "@/components/video/TrackedVideo";
import type { MileageFilm } from "@/lib/mileage";

/**
 * One rung's films. A chart, not a course.
 *
 * ---------------------------------------------------------------------------
 * `policy="none"`, AND THAT IS THE WHOLE DESIGN
 * ---------------------------------------------------------------------------
 *
 * ServiceShelf uses `credit-only`: voluntary, but a watch is measured and
 * credited. This is one step further — nothing is measured at all. No
 * `content_progress` row, no threshold, no `onGateMet`, no resume position.
 *
 * It matters because measurement leaks into display. The instant a watch is
 * recorded, the next reasonable-sounding request is a tick beside the ones
 * you've seen, and then the shelf is quietly telling an advisor they are 3 of 51
 * through a lookup table. There is nothing to be 51 of. An advisor who opens
 * 25,000 twice and never opens 40,000 has used this correctly.
 *
 * So there is no ✓ column, no numbered steps, and no "continue". The rows carry
 * a title and a duration, because both are things you need in order to choose.
 */
export function MileageShelf({ films, label }: { films: MileageFilm[]; label: string }) {
  /*
   * Nothing is auto-selected. ServiceShelf opens on the first unwatched film
   * because the ritual has a next; a chart does not. Opening one for the advisor
   * would be the product guessing which mileage question they came with.
   */
  const [playing, setPlaying] = useState<string | null>(null);
  const current = films.find((f) => f.contentId === playing) ?? null;

  if (films.length === 0) {
    return (
      <p className="mt-6 text-base leading-relaxed text-ink">
        No films on this rung yet.
      </p>
    );
  }

  return (
    <div className="mt-5">
      {current && (
        <div className="mb-5">
          <h2 className="text-lg font-extrabold leading-tight text-navy">{current.title}</h2>
          <div className="mt-3">
            <TrackedVideo
              /* Nothing recorded. See the note at the top of this file. */
              policy="none"
              contentId={current.contentId}
              renditions={current.renditions}
              title={current.title}
            />
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {films.map((f) => {
          const active = f.contentId === playing;
          return (
            <li key={f.contentId}>
              <button
                type="button"
                onClick={() => setPlaying(active ? null : f.contentId)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  active
                    ? "border-gold bg-gold-soft/30"
                    : "border-line bg-surface-card hover:bg-cream-card"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy">{f.title}</span>
                </span>
                {f.durationSec != null && (
                  <span className="ediagd-numeral shrink-0 text-xs text-ink-soft">
                    {Math.floor(f.durationSec / 60)}:
                    {String(Math.round(f.durationSec) % 60).padStart(2, "0")}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-sm leading-relaxed text-ink-soft">
        {`Everything the factory recommends at ${label} miles. Look it up as often as you like — nothing here is tracked and nothing needs finishing.`}
      </p>
    </div>
  );
}
