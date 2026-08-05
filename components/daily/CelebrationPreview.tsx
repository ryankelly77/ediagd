"use client";

import { useState } from "react";
import { BadgeCelebration } from "./BadgeCelebration";
import { BADGES } from "@/lib/badges";

/**
 * TEMPORARY DEV PREVIEW — delete when the animation is signed off.
 *
 * Renders BadgeCelebration standalone so the confetti and reveal can be tuned
 * without earning a badge. Values here are FAKE: the real screen reads the
 * amount from game_settings via loadBadgeRewards(). Nothing on this page reads
 * or writes the database.
 */
export function CelebrationPreview({ initialReward }: { initialReward: number }) {
  const earnable = BADGES.filter((b) => b.status === "now");
  const [index, setIndex] = useState(0);
  const [reward, setReward] = useState(initialReward);
  // Remounting the celebration is what re-runs the mount animation.
  const [run, setRun] = useState(0);

  const badge = earnable[index];

  return (
    <main className="ediagd-app min-h-screen">
      <div className="mx-auto max-w-md px-6 py-8">
        <p className="ediagd-eyebrow">Dev preview</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy">
          Badge celebration
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Fake values — the real screen reads amounts from game settings. Nothing
          here touches your data.
        </p>

        {/* ---- The thing being previewed ---------------------------------- */}
        <div className="mt-6 rounded-card border border-line bg-surface-card p-4 text-center">
          <BadgeCelebration
            key={`${badge.key}-${run}`}
            badgeKey={badge.key}
            badgeName={badge.name}
            reward={reward}
          />
        </div>

        {/* ---- Controls ---------------------------------------------------- */}
        <button
          onClick={() => setRun((r) => r + 1)}
          className="mt-6 w-full rounded-xl bg-gold p-3.5 text-base font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Replay
        </button>

        <p className="ediagd-eyebrow mt-6">Badge</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {earnable.map((b, i) => (
            <button
              key={b.key}
              onClick={() => {
                setIndex(i);
                setRun((r) => r + 1);
              }}
              className={`rounded-pill px-3 py-1.5 text-sm font-extrabold transition ${
                i === index
                  ? "bg-navy text-white"
                  : "border border-line bg-surface-card text-navy hover:bg-teal-soft/20"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        <label className="mt-6 block">
          <span className="ediagd-eyebrow">Reward shown</span>
          <input
            type="number"
            min={0}
            value={reward}
            onChange={(e) => setReward(Number(e.target.value) || 0)}
            className="ediagd-numeral mt-2 w-full rounded-xl border border-line bg-cream-card p-3 font-extrabold text-navy outline-none focus:ring-2 focus:ring-gold"
          />
        </label>

        <p className="mt-6 rounded-xl border border-line bg-cream-card p-4 text-xs leading-relaxed text-ink-soft">
          To check reduced motion: DevTools → Rendering → Emulate CSS
          <span className="font-bold"> prefers-reduced-motion: reduce</span>. The
          confetti should disappear entirely and the medallion should appear with
          no scale-in — name and reward unchanged.
        </p>
      </div>
    </main>
  );
}

export default CelebrationPreview;
