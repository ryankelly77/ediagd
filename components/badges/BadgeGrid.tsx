"use client";

import { useEffect, useState } from "react";
import { BadgeMedallion } from "@/components/brand/badges/BadgeMedallion";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { BADGES, BADGE_FAMILIES, type BadgeSpec } from "@/lib/badges";

export type BadgeTile = BadgeSpec & {
  /** ISO date from user_badge.earned_on, or null if not earned. */
  earnedOn: string | null;
};

type TileState = "earned" | "locked" | "soon";

function stateOf(tile: BadgeTile): TileState {
  if (tile.earnedOn) return "earned";
  // "future" badges aren't things the user is failing to earn — the feature
  // that would detect them doesn't exist yet. Say so plainly.
  return tile.status === "future" ? "soon" : "locked";
}

/**
 * The badges wall. Every badge is visible with a one-line "how to earn", so
 * someone reading "First Light" knows what it takes without tapping. Tapping
 * opens the fuller detail.
 */
export function BadgeGrid({
  earnedByKey,
  rewards,
}: {
  earnedByKey: Record<string, string>;
  /** Badge key -> Sand Dollars, read from game_settings / the catalog. */
  rewards: Record<string, number>;
}) {
  const [selected, setSelected] = useState<BadgeTile | null>(null);

  const tiles: BadgeTile[] = BADGES.map((spec) => ({
    ...spec,
    earnedOn: earnedByKey[spec.key] ?? null,
  }));

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
      {BADGE_FAMILIES.map((family) => {
        const inFamily = tiles.filter((t) => t.family === family.key);
        if (inFamily.length === 0) return null;
        const earnedHere = inFamily.filter((t) => t.earnedOn).length;
        const earnable = inFamily.some((t) => t.status === "now");

        return (
          <section key={family.key} className="mt-8 first:mt-6">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="ediagd-eyebrow">{family.label}</h2>
              {earnable && (
                <span className="ediagd-numeral text-xs font-bold text-ink-soft">
                  {earnedHere} of {inFamily.length}
                </span>
              )}
            </div>
            <p className="mt-1 px-1 text-xs text-ink-soft">{family.blurb}</p>

            {/* Grid, not rows: the art carries a dotted ring, a motif and
                numerals, and stops resolving much below ~90px. Two up on a
                phone gives each badge room to actually read. */}
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {inFamily.map((tile) => (
                <li key={tile.key}>
                  <BadgeTileCard
                    tile={tile}
                    reward={rewards[tile.key] ?? null}
                    onOpen={() => setSelected(tile)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {selected && (
        <BadgeDetail
          tile={selected}
          reward={rewards[selected.key] ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/**
 * One badge in the wall: large art, name, and an always-visible how-to-earn,
 * so nobody has to tap to learn what a badge takes.
 */
function BadgeTileCard({
  tile,
  reward,
  onOpen,
}: {
  tile: BadgeTile;
  reward: number | null;
  onOpen: () => void;
}) {
  const state = stateOf(tile);

  return (
    <button
      onClick={onOpen}
      className="ediagd-card flex h-full w-full flex-col items-center gap-2 p-4 text-center transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {/* The art was drawn for dark — give it its navy medallion. */}
      <BadgeMedallion badgeKey={tile.key} state={state} size={104} />

      <span
        className={`text-sm font-extrabold leading-tight ${
          state === "earned" ? "text-navy" : "text-navy/60"
        }`}
      >
        {tile.name}
      </span>

      {state === "earned" && <EarnedTag />}
      {state === "soon" && <SoonTag />}

      <span
        className={`text-xs leading-snug ${
          state === "earned" ? "font-semibold text-palm" : "text-ink-soft"
        }`}
      >
        {state === "earned"
          ? `Earned ${formatDate(tile.earnedOn!)}`
          : tile.howToEarn}
      </span>

      {/* What it's worth. The motivator when locked; a footnote once earned. */}
      {reward != null && reward > 0 && <RewardLine reward={reward} state={state} />}
    </button>
  );
}

/** The Sand Dollar value of a badge, with the currency mark. */
function RewardLine({ reward, state }: { reward: number; state: TileState }) {
  const earned = state === "earned";
  return (
    <span
      className={`mt-auto flex items-center gap-1 pt-1 text-[11px] font-extrabold ${
        earned ? "text-ink-soft" : "text-gold"
      }`}
    >
      <SandDollarIcon size={14} tone={earned ? "sand" : "gold"} />
      <span className="ediagd-numeral">
        {earned ? "+" : ""}
        {reward.toLocaleString()}
      </span>
      <span className="font-bold">{earned ? "earned" : "Sand Dollars"}</span>
    </span>
  );
}

/** Reads as "unlocked" before anyone parses the date. */
function EarnedTag() {
  return (
    <span className="rounded-pill bg-palm-soft px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-palm">
      Earned
    </span>
  );
}

/** Visually distinct from a locked-but-earnable badge. */
function SoonTag() {
  return (
    <span className="rounded-pill border border-line bg-teal-soft/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ocean">
      Coming soon
    </span>
  );
}

function BadgeDetail({
  tile,
  reward,
  onClose,
}: {
  tile: BadgeTile;
  reward: number | null;
  onClose: () => void;
}) {
  const state = stateOf(tile);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tile.name}
        className="w-full max-w-sm rounded-t-card bg-surface-card p-6 text-center shadow-pop sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto block w-fit">
          <BadgeMedallion badgeKey={tile.key} state={state} size={136} />
        </span>

        <h2 className="mt-4 text-xl font-extrabold text-navy">{tile.name}</h2>
        {state === "soon" && (
          <span className="mt-2 inline-block">
            <SoonTag />
          </span>
        )}

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{tile.detail}</p>

        {reward != null && reward > 0 && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-base font-extrabold text-gold">
            <SandDollarIcon size={20} />
            <span className="ediagd-numeral">
              {state === "earned" ? "+" : ""}
              {reward.toLocaleString()}
            </span>
            <span>Sand Dollars</span>
          </p>
        )}

        {state === "earned" ? (
          <p className="mt-3 text-sm font-bold text-palm">
            Earned {formatDate(tile.earnedOn!)}
          </p>
        ) : (
          <>
            <p className="mt-4 rounded-card bg-teal-soft/20 px-4 py-3 text-sm font-bold text-navy">
              {tile.howToEarn}
            </p>
            {state === "soon" && tile.waitingOn && (
              <p className="mt-2 text-xs text-ink-soft">{tile.waitingOn}</p>
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-navy p-3 font-extrabold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Close
        </button>
      </div>
    </div>
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
