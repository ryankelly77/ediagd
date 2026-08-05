/* ============================================================================
   EDIAGD — the badge set
   Maps a catalog key to its motif and tier ring. Add a badge by adding one row
   to BADGE_ART; the construction comes from BadgeFrame for free.
   ============================================================================ */

import { BadgeFrame, type BadgeRing, type MotifColors } from "./BadgeFrame";
import {
  CrestingWaveMotif,
  DoubleWaveMotif,
  RisingSunMotif,
  TripleWaveMotif,
  WaveMotif,
} from "./motifs";

type BadgeArt = {
  ring: BadgeRing;
  motif: (colors: MotifColors) => React.ReactNode;
};

/** Keyed to the `badge` catalog in 0011. */
export const BADGE_ART: Record<string, BadgeArt> = {
  first_light: { ring: "seafoam", motif: RisingSunMotif },
  swell_7: { ring: "seafoam", motif: WaveMotif },
  swell_30: { ring: "gold", motif: DoubleWaveMotif },
  swell_90: { ring: "gold", motif: TripleWaveMotif },
  big_wave: { ring: "gold", motif: CrestingWaveMotif },
};

/** A badge the catalog knows about but the art doesn't — still on-brand. */
const FALLBACK: BadgeArt = { ring: "seafoam", motif: RisingSunMotif };

export function Badge({
  badgeKey,
  earned = false,
  size = 64,
  ring,
  className,
  title,
}: {
  badgeKey: string;
  earned?: boolean;
  size?: number;
  /** Override the tier ring — the catalog's `ring` column wins when supplied. */
  ring?: BadgeRing;
  className?: string;
  title?: string;
}) {
  const art = BADGE_ART[badgeKey] ?? FALLBACK;
  return (
    <BadgeFrame
      ring={ring ?? art.ring}
      earned={earned}
      size={size}
      className={className}
      title={title}
      renderMotif={art.motif}
    />
  );
}

export default Badge;
