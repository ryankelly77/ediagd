"use client";

import { BadgeMedallion } from "@/components/brand/badges/BadgeMedallion";
import { ConfettiBurst } from "@/components/brand/ConfettiBurst";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";

/**
 * The badge moment: the medallion lights up and brand-coloured confetti bursts.
 * The burst itself is ConfettiBurst, shared with the onboarding welcome gift.
 *
 * (The confetti rationale now lives in that component.)
 *
 * OLD NOTES, kept because they explain the tuning:
 *
 *   1. Staged launches. Deriving the delay from `i % 14` released pieces in
 *      fourteen visible waves. A burst is ONE event: every piece now launches
 *      within ~70ms, and the variety comes from trajectory, not timing.
 *   2. Straight lines with a shared kink. A single element animating out to a
 *      point and then downward made every piece change direction on the same
 *      frame. Now X and Y are separate elements with separate timing: X drifts
 *      at a near-constant rate while Y decelerates upward then accelerates down
 *      under "gravity" (per-keyframe timing functions). Composed, that's a real
 *      parabola, and every piece follows its own.
 *
 * Values come from a deterministic hash of the index — well distributed, so no
 * modulo banding, but identical on server and client so hydration is stable.
 *
 * Transform and opacity only, so it stays on the compositor. Nothing loops.
 * Reduced motion removes the burst entirely, in CSS.
 */

export function BadgeCelebration({
  badgeKey,
  badgeName,
  reward,
}: {
  badgeKey: string;
  badgeName: string;
  /** Sand Dollars this badge paid, or null if unknown. */
  reward: number | null;
}) {
  return (
    <div className="relative mt-6 flex flex-col items-center">
      <ConfettiBurst />

      <div className="ediagd-badge-pop">
        <BadgeMedallion badgeKey={badgeKey} state="earned" size={112} />
      </div>

      <p className="ediagd-eyebrow mt-4">Badge earned</p>
      <p className="mt-1 text-2xl font-extrabold text-navy">{badgeName}</p>

      {reward != null && reward > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-base font-extrabold text-gold">
          <SandDollarIcon size={20} />
          <span className="ediagd-numeral">+{reward.toLocaleString()}</span>
          <span>Sand Dollars</span>
        </p>
      )}

      <style>{`
        .ediagd-badge-pop {
          animation: ediagd-badge-pop 620ms cubic-bezier(.2,.9,.3,1.2) both;
        }
        @keyframes ediagd-badge-pop {
          0%   { transform: scale(.55); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          /* The burst's own rule lives in ConfettiBurst. */
          .ediagd-badge-pop { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default BadgeCelebration;
