/* ============================================================================
   EDIAGD — badge medallion
   The two states deliberately use OPPOSITE surfaces, so they can't be confused:

     locked / coming soon → pale cream disc, muted art. Quiet, recessive,
                            clearly a placeholder for something not yet earned.
     earned               → navy hero-gradient medallion, gold ring, full-
                            saturation art, gold check. The badge lit up.

   Earning is therefore a transformation — light placeholder becomes rich dark
   medallion — rather than a subtle change in opacity.
   ============================================================================ */

import { BadgeArt } from "./BadgeArt";

export type BadgeDisplayState = "earned" | "locked" | "soon";

export function BadgeMedallion({
  badgeKey,
  state,
  size = 112,
  className,
}: {
  badgeKey: string;
  state: BadgeDisplayState;
  /** Diameter of the medallion; the art sits at ~78% of it. */
  size?: number;
  className?: string;
}) {
  const earned = state === "earned";
  const artSize = Math.round(size * 0.78);

  if (!earned) {
    // ---- Locked / Coming soon: light and quiet --------------------------
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center rounded-pill ${className ?? ""}`}
        style={{
          width: size,
          height: size,
          background: "rgb(var(--ediagd-cream))",
          boxShadow: "inset 0 0 0 1px rgb(var(--ediagd-line))",
        }}
      >
        {/* earned={false} gives the adaptive light treatment: muted art that
            reads on cream without shouting. */}
        <BadgeArt badgeKey={badgeKey} earned={false} size={artSize} />
      </span>
    );
  }

  // ---- Earned: the dark, gold-ringed medallion --------------------------
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-pill ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: "var(--ediagd-hero-gradient)",
        boxShadow:
          "0 0 0 2px rgb(var(--ediagd-gold) / 0.55), 0 6px 18px rgb(12 28 44 / 0.35)",
      }}
    >
      {/* Full-saturation art — the version drawn to sing on navy. */}
      <BadgeArt badgeKey={badgeKey} earned size={artSize} />

      <span
        aria-hidden="true"
        className="absolute -bottom-0.5 -right-0.5 flex h-[30%] w-[30%] items-center justify-center rounded-pill bg-gold text-navy shadow-[0_2px_6px_rgba(12,28,44,0.4)]"
      >
        <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" aria-hidden="true">
          <path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}

export default BadgeMedallion;
