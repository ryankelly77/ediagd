/* ============================================================================
   EDIAGD — the mark's own inks

   ---------------------------------------------------------------------------
   WHY THIS IS SEPARATE FROM THE UI TOKENS
   ---------------------------------------------------------------------------
   These are the colours of the ARTWORK, taken verbatim from the designer's
   master files in public/brand/svg. They are not the design language.

   `--ediagd-gold` in styles/brand.css is #E8B44C; the sun in the master is
   #e3b15c. That is a real, deliberate gap. Gold is not merely the sun's ink —
   it is the language's colour for wins and the single primary action, woven
   through every button, every streak celebration and every badge. Re-skinning
   the entire UI as a side effect of a logo file arriving would be the tail
   wagging the dog, so the mark follows its master and the UI keeps its tokens.
   The deltas are small enough that no one will ever see the seam.

   Aligning the two is a design-language decision to make with Mitch, not a
   drive-by. Until then: artwork reads from here, interface reads from brand.css.

   ---------------------------------------------------------------------------
   AND WHY IT EXISTS AT ALL
   ---------------------------------------------------------------------------
   The palm went into the master files and appeared in none of the four places
   the mark is hand-drawn — the launch animation, the app icon layers, the
   streak hero and the rest card — because every one of them carried its own
   private copy of the geometry AND its own hex codes. They had already drifted
   to the previous palette without anyone noticing.

   Geometry sometimes has to be hand-drawn: a layer that animates, or one the
   icon compiler needs as a separate file, cannot be an <img> of the master. The
   INK never has to be. One import, and the drift cannot regrow.
   ============================================================================ */

/** Ring and palm on a light ground. Master: ediagd-mark-primary-light.svg */
export const MARK_NAVY = "#132a40";

/** Ring and palm on a dark ground. Master: ediagd-mark-primary-dark.svg */
export const MARK_CREAM = "#f2efe8";

/** The sun disc and its rays. Not the UI's gold — see the header. */
export const MARK_SUN = "#e3b15c";

/** The wave and its swell lines. Not the UI's teal. */
export const MARK_WAVE = "#6fbcc6";

/** The master viewBox. Every hand-drawn copy uses these coordinates. */
export const MARK_VIEWBOX = "0 0 120 120";

/**
 * The palm, as path data, in master coordinates.
 *
 * Exported because three surfaces draw it — the launch animation, the icon's
 * cream layer, and the rest card — and a fourth copy is how a frond ends up
 * one pixel out on one screen. Trunk first, then five fronds.
 */
export const MARK_PALM_PATHS = [
  "M86 78 C 86 68, 84.5 56, 80 47",
  "M80 47 C 72.5 42, 64 42.5, 58 47",
  "M80 47 C 75 39.5, 67.5 36.5, 60 37.5",
  "M80 47 C 82.5 38.5, 88 34, 95 33.5",
  "M80 47 C 87.5 42.5, 95 43, 101 48",
  "M80 47 C 79.5 39, 76 32.5, 70.5 29",
] as const;

/** The wave body, in master coordinates. */
export const MARK_WAVE_PATH =
  "M16 76 C 22 52, 46 43, 57 55 C 48 52, 40.5 58, 42.5 67 C 53 60, 70 63, 80 73 C 60 82, 33 82, 16 76 Z";

/** The two swell lines under the wave. The second is the fainter one. */
export const MARK_SWELL_PATHS = [
  "M26 88 C 42 93, 66 93.5, 86 88.5",
  "M36 97 C 48 100.5, 64 100.5, 76 97.5",
] as const;

/** The sun's five rays, in master coordinates. */
export const MARK_RAYS = [
  { x1: 52, y1: 22, x2: 52, y2: 17 },
  { x1: 41, y1: 26, x2: 38, y2: 22.5 },
  { x1: 63, y1: 26, x2: 66, y2: 22.5 },
  { x1: 36.5, y1: 36, x2: 31.5, y2: 34.5 },
  { x1: 67.5, y1: 36, x2: 72.5, y2: 34.5 },
] as const;

/** The sun disc. */
export const MARK_SUN_CIRCLE = { cx: 52, cy: 38, r: 9 } as const;

/** The ring. */
export const MARK_RING = { cx: 60, cy: 60, r: 56 } as const;
