/* ============================================================================
   EDIAGD logo mark — now the master, not a second drawing of it

   ---------------------------------------------------------------------------
   WHAT THIS USED TO BE, AND WHY IT HAD TO STOP
   ---------------------------------------------------------------------------
   This file drew the mark inline: a ring at r=44, a sun at cx=50 cy=46, and
   two quadratic wave bands, inked from the UI's CSS variables. That is the
   PRE-PALM mark. It kept rendering it for as long as it existed, and because
   FrontDoor -> Wordmark -> Logo is the chain a visitor actually meets, the old
   mark was the first thing anyone saw of this brand.

   lib/brand-ink.ts already wrote down why: "the palm went into the master
   files and appeared in none of the four places the mark is hand-drawn ...
   because every one of them carried its own private copy of the geometry AND
   its own hex codes." This was the fifth.

   So it no longer draws anything. It renders <BrandMark>, which is the one
   component that shows the designer's master file, and it cannot fall behind
   that master because it no longer has a copy to fall behind with.

   ---------------------------------------------------------------------------
   THE PROPS ARE UNCHANGED ON PURPOSE
   ---------------------------------------------------------------------------
   `size`, `className` and `title` keep their names, their defaults and their
   meanings, so Wordmark.tsx and FrontDoor.tsx needed no edit. `title` still
   becomes the image's accessible name, which preserves what a screen reader
   heard before rather than quietly changing it alongside the artwork.

   `onDark` is new and additive: BrandMark already draws a reverse master for
   navy grounds, and exposing it here is what stops the next person hand-rolling
   a dark variant. Nothing passes it today — Wordmark's own `onDark` switches
   the TEXT only, and the one call site is the front door on cream.
============================================================================ */

import { BrandMark } from "./BrandMark";

type LogoProps = {
  size?: number;
  className?: string;
  title?: string;
  /** Navy ground: takes the reverse master, which is drawn, not filtered. */
  onDark?: boolean;
};

export function Logo({
  size = 56,
  className,
  title = "EDIAGD",
  onDark = false,
}: LogoProps) {
  return <BrandMark size={size} onDark={onDark} className={className} alt={title} />;
}

export default Logo;
