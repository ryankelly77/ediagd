/* ============================================================================
   EDIAGD — badge construction
   Per the brand book, every badge is the same three things: an outer circle, a
   dotted inner ring, and ONE flat motif from the brand's world. Flat palette
   colours only — never metallic gradients, never cartoon trophies, never red.

   THE TIER IS CARRIED BY THE RING COLOUR: seafoam for early tiers, Sunrise Gold
   for milestones. The motif says which badge; the ring says how far you've come.
   ============================================================================ */

export type BadgeRing = "seafoam" | "gold";

/** Ring colour by tier, plus the muted treatment for a badge not yet earned. */
const RING_COLOR: Record<BadgeRing, string> = {
  seafoam: "rgb(var(--ediagd-teal-soft))",
  gold: "rgb(var(--ediagd-gold))",
};

const MOTIF_COLOR: Record<BadgeRing, { sun: string; wave: string }> = {
  seafoam: {
    sun: "rgb(var(--ediagd-gold))",
    wave: "rgb(var(--ediagd-teal))",
  },
  gold: {
    sun: "rgb(var(--ediagd-gold))",
    wave: "rgb(var(--ediagd-ocean))",
  },
};

const LOCKED_RING = "rgb(var(--ediagd-line))";
const LOCKED_MOTIF = "rgb(var(--ediagd-ink-soft))";

export type MotifColors = { sun: string; wave: string; stroke: number };

/**
 * The shared shell: circle, dotted ring, and a slot for the motif.
 * `renderMotif` receives the resolved colours so each motif stays dumb about
 * earned/locked state.
 */
export function BadgeFrame({
  ring,
  earned = true,
  size = 64,
  className,
  title,
  renderMotif,
}: {
  ring: BadgeRing;
  earned?: boolean;
  size?: number;
  className?: string;
  /** Provide when the badge stands alone; omit when a visible label follows. */
  title?: string;
  renderMotif: (colors: MotifColors) => React.ReactNode;
}) {
  const ringColor = earned ? RING_COLOR[ring] : LOCKED_RING;
  const motif: MotifColors = earned
    ? { ...MOTIF_COLOR[ring], stroke: 4 }
    : { sun: LOCKED_MOTIF, wave: LOCKED_MOTIF, stroke: 4 };

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ opacity: earned ? 1 : 0.55 }}
    >
      {/* body */}
      <circle cx="50" cy="50" r="47" fill="rgb(var(--ediagd-cream-card))" />
      {/* outer circle — the tier ring */}
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke={ringColor}
        strokeWidth="3.5"
      />
      {/* dotted inner ring */}
      <circle
        cx="50"
        cy="50"
        r="39"
        fill="none"
        stroke={ringColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="0.5 7"
      />
      {renderMotif(motif)}
    </svg>
  );
}

export default BadgeFrame;
