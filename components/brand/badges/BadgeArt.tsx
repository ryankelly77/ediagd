/* ============================================================================
   EDIAGD — badge artwork
   Renders the exported badge SVGs from public/brand/badges/.

   ALWAYS the UNLABELED set at badges/svg/. The sibling badges/svg-labeled/ has
   the name curved along the bottom arc — that set is for print and export ONLY.
   In the app the name is rendered as HTML text beside the mark, so a labeled
   SVG would show the name twice (and its outlined text stops resolving below
   ~60px anyway). badges/buildable-now/ is a convenience copy of the five [now]
   badges; the app reads the full svg/ set so nothing needs moving as features
   ship.

   All 19 badges are drawn, so every catalog key gets its real art — including
   the ones whose FEATURE doesn't exist yet. The code-drawn Badge is kept only
   as a fallback for a key with no file at all.

   The muted state is derived in CSS from the same file — there is no separate
   greyed export to keep in sync.
   ============================================================================ */

import { BADGES_BY_KEY } from "@/lib/badges";
import { Badge } from "./Badge";

/** Every key we ship art for. */
export function hasBadgeArt(key: string): boolean {
  return BADGES_BY_KEY.has(key);
}

export function BadgeArt({
  badgeKey,
  earned = false,
  size = 64,
  className,
}: {
  badgeKey: string;
  earned?: boolean;
  size?: number;
  className?: string;
}) {
  if (!hasBadgeArt(badgeKey)) {
    // Unknown key (a catalog row with no art) — keep the construction on screen.
    return (
      <Badge badgeKey={badgeKey} earned={earned} size={size} className={className} />
    );
  }

  return (
    // alt="" by design: the badge name always appears as adjacent HTML text,
    // so announcing it here would repeat it to a screen reader.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/badges/svg/${badgeKey}.svg`}
      alt=""
      width={size}
      height={size}
      className={className}
      style={
        earned
          ? undefined
          : // Not earned: same art, muted — the wall shows what's coming.
            { filter: "grayscale(1)", opacity: 0.45 }
      }
    />
  );
}

export default BadgeArt;
