"use client";

import { BadgeMedallion } from "@/components/brand/badges/BadgeMedallion";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";

/**
 * The badge moment: the medallion lights up and brand-coloured confetti bursts.
 *
 * WHY IT'S BUILT THIS WAY — the earlier version looked mechanical for two
 * reasons, both fixed here:
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

/** Brand palette only — gold stays meaningful because nothing else is rainbow. */
const CONFETTI_COLORS = [
  "rgb(var(--ediagd-gold))",
  "rgb(var(--ediagd-teal-soft))",
  "rgb(var(--ediagd-teal))",
  "rgb(var(--ediagd-cream-card))",
];

const PIECES = 72;

/** Deterministic pseudo-random in [0,1). Smooth spread, no modulo bands. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

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
  const pieces = Array.from({ length: PIECES }, (_, i) => {
    const angle = noise(i) * Math.PI * 2; // full circle, unevenly spaced
    const speed = 55 + noise(i + 101) * 165; // how hard it's thrown
    const upward = 0.35 + noise(i + 202) * 0.85; // some fly up, some barely

    return {
      color: CONFETTI_COLORS[Math.floor(noise(i + 303) * CONFETTI_COLORS.length)],
      driftX: Math.round(Math.cos(angle) * speed),
      rise: Math.round(60 + Math.abs(Math.sin(angle)) * speed * upward),
      fall: Math.round(280 + noise(i + 404) * 220),
      spin: Math.round((noise(i + 505) < 0.5 ? -1 : 1) * (300 + noise(i + 606) * 900)),
      width: 4 + Math.round(noise(i + 707) * 5),
      height: 7 + Math.round(noise(i + 808) * 8),
      duration: Math.round(1900 + noise(i + 909) * 1500),
      // One burst: a hair of scatter, not a queue.
      delay: Math.round(noise(i + 1010) * 70),
    };
  });

  return (
    <div className="relative mt-6 flex flex-col items-center">
      <div
        aria-hidden="true"
        className="ediagd-confetti-burst pointer-events-none absolute left-1/2 top-[52px] h-0 w-0"
      >
        {pieces.map((p, i) => (
          // Horizontal drift — steady, so nothing "kicks" sideways.
          <span
            key={i}
            className="ediagd-cx"
            style={
              {
                animationDuration: `${p.duration}ms`,
                animationDelay: `${p.delay}ms`,
                "--cx": `${p.driftX}px`,
              } as React.CSSProperties
            }
          >
            {/* Vertical — up against gravity, then down and accelerating. */}
            <span
              className="ediagd-cy"
              style={
                {
                  animationDuration: `${p.duration}ms`,
                  animationDelay: `${p.delay}ms`,
                  "--rise": `${p.rise}px`,
                  "--fall": `${p.fall}px`,
                } as React.CSSProperties
              }
            >
              {/* The paper itself: tumbling and fading. */}
              <span
                className="ediagd-piece"
                style={
                  {
                    animationDuration: `${p.duration}ms`,
                    animationDelay: `${p.delay}ms`,
                    background: p.color,
                    width: p.width,
                    height: p.height,
                    "--spin": `${p.spin}deg`,
                  } as React.CSSProperties
                }
              />
            </span>
          </span>
        ))}
      </div>

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
        .ediagd-cx,
        .ediagd-cy,
        .ediagd-piece {
          position: absolute;
          top: 0;
          left: 0;
          display: block;
          animation-fill-mode: forwards;
        }

        /* X: steady drift outward — no kick, just air. */
        .ediagd-cx {
          animation-name: ediagd-cx;
          animation-timing-function: cubic-bezier(.12,.62,.32,1);
        }
        @keyframes ediagd-cx {
          to { transform: translateX(var(--cx)); }
        }

        /* Y: the parabola. Per-keyframe timing gives genuine deceleration on the
           way up and acceleration on the way down — this is what stops it
           reading as a slide. */
        .ediagd-cy {
          animation-name: ediagd-cy;
        }
        @keyframes ediagd-cy {
          0% {
            transform: translateY(0);
            animation-timing-function: cubic-bezier(.16,.66,.4,1);
          }
          32% {
            transform: translateY(calc(var(--rise) * -1));
            animation-timing-function: cubic-bezier(.55,.02,.85,.5);
          }
          100% { transform: translateY(var(--fall)); }
        }

        /* The paper: tumble and fade. */
        .ediagd-piece {
          border-radius: 1px;
          opacity: 0;
          animation-name: ediagd-piece;
          animation-timing-function: linear;
        }
        @keyframes ediagd-piece {
          0%   { opacity: 0; transform: rotate(0deg) scale(.7); }
          6%   { opacity: 1; transform: rotate(calc(var(--spin) * .06)) scale(1); }
          72%  { opacity: 1; }
          100% { opacity: 0; transform: rotate(var(--spin)) scale(.92); }
        }

        .ediagd-badge-pop {
          animation: ediagd-badge-pop 620ms cubic-bezier(.2,.9,.3,1.2) both;
        }
        @keyframes ediagd-badge-pop {
          0%   { transform: scale(.55); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          /* No burst at all — not a frozen one. */
          .ediagd-confetti-burst { display: none; }
          .ediagd-badge-pop { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default BadgeCelebration;
