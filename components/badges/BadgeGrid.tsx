"use client";

import { useEffect, useState } from "react";

export type BadgeTile = {
  key: string;
  name: string;
  description: string | null;
  /** Ring colour carries the tier — seafoam for early, gold for the big ones. */
  ring: "seafoam" | "gold";
  sandDollars: number;
  earnedOn: string | null;
};

const RING_COLOR: Record<BadgeTile["ring"], string> = {
  seafoam: "var(--color-teal)",
  gold: "var(--color-gold)",
};

export function BadgeGrid({ tiles }: { tiles: BadgeTile[] }) {
  const [selected, setSelected] = useState<BadgeTile | null>(null);

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <>
      <ul className="mt-4 grid grid-cols-3 gap-3">
        {tiles.map((tile) => {
          const earned = Boolean(tile.earnedOn);
          return (
            <li key={tile.key}>
              <button
                onClick={() => setSelected(tile)}
                className="flex w-full flex-col items-center gap-2 rounded-card border border-line bg-surface-card p-3 text-center transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 items-center justify-center rounded-pill text-2xl"
                  style={{
                    // Earned: full colour ring. Unearned: quiet, not scolding.
                    border: `3px solid ${earned ? RING_COLOR[tile.ring] : "var(--color-line)"}`,
                    background: earned
                      ? `color-mix(in srgb, ${RING_COLOR[tile.ring]} 15%, transparent)`
                      : "transparent",
                    filter: earned ? undefined : "grayscale(1)",
                    opacity: earned ? 1 : 0.55,
                  }}
                >
                  🌅
                </span>
                <span
                  className={`text-[11px] font-bold leading-tight ${
                    earned ? "text-navy" : "text-ink-soft"
                  }`}
                >
                  {tile.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            className="w-full max-w-sm rounded-t-card bg-surface-card p-6 text-center shadow-pop sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              aria-hidden="true"
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-pill text-4xl"
              style={{
                border: `3px solid ${
                  selected.earnedOn ? RING_COLOR[selected.ring] : "var(--color-line)"
                }`,
                background: selected.earnedOn
                  ? `color-mix(in srgb, ${RING_COLOR[selected.ring]} 15%, transparent)`
                  : "transparent",
                filter: selected.earnedOn ? undefined : "grayscale(1)",
                opacity: selected.earnedOn ? 1 : 0.55,
              }}
            >
              🌅
            </span>

            <h2 className="mt-4 text-xl font-extrabold text-navy">{selected.name}</h2>

            {selected.description && (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {selected.description}
              </p>
            )}

            {selected.earnedOn ? (
              <p className="mt-4 text-sm font-bold text-palm">
                Earned {formatDate(selected.earnedOn)}
              </p>
            ) : (
              <p className="mt-4 text-sm font-bold text-ocean">
                Not yet earned
                {selected.sandDollars > 0
                  ? ` — worth ${selected.sandDollars} Sand Dollars`
                  : ""}
              </p>
            )}

            <button
              onClick={() => setSelected(null)}
              className="mt-6 w-full rounded-xl bg-navy p-3 font-extrabold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** 'YYYY-MM-DD' → 'June 16, 2026', without pulling in a date library. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default BadgeGrid;
