/* ============================================================================
   EDIAGD — the inks the award art is drawn in

   ---------------------------------------------------------------------------
   WHY THIS FILE EXISTS AT ALL
   ---------------------------------------------------------------------------
   The certification spec (§10, implementation note) names the exact failure it
   is here to prevent:

       "The exported badge SVGs hardcode their colors (#7ec8cd, #e8b44c) while
        the code-drawn BadgeFrame reads CSS variables. The seals must not repeat
        that split: both paths feed from the shared brand constants, or the
        seals drift from the badges the first time a token moves."

   Thirty-four seal SVGs and nineteen badge SVGs are static files with hex
   literals baked into several hundred paths each. They cannot read a CSS
   variable — an <img> has no cascade — and inlining a megabyte of path data to
   gain one would be a poor trade.

   So the art is not made dynamic. It is made CHECKABLE. This file is the one
   place that states what each ink is and which token it mirrors, and
   test:seal-ink asserts three things at once:

       1. every hex in every seal and badge SVG is one of these inks
       2. every ink that mirrors a CSS token still equals that token
       3. every certification glyph_key resolves to a file that exists

   Move --ediagd-gold in brand.css without regenerating the art and (2) fails
   with the old and new values side by side. That is the whole mechanism: the
   drift becomes a red suite instead of a slow divergence nobody sees, which is
   what happened to the hand-drawn brand components once already.

   ---------------------------------------------------------------------------
   FOUR OF THESE MIRROR NOTHING, AND THAT IS RECORDED RATHER THAN FIXED
   ---------------------------------------------------------------------------
   SEAFOAM, RIM_DEEP, PARCHMENT and BRASS have no CSS token. Inventing tokens
   for them would be a brand decision taken by an implementer in a test file —
   and SEAFOAM in particular is already shared BY the badge art, so it is not a
   seal-only value that could be quietly renamed. They are pinned here so a
   change to any of them still has to pass through this file.
============================================================================ */

/** One ink, and what it answers to. */
export type BrandInk = {
  /** The literal as it appears in the SVG art. Lowercase, six digits. */
  hex: string;
  /** The CSS custom property it mirrors, when it mirrors one. */
  token: string | null;
  /** What it is, in the drawing. */
  role: string;
};

/**
 * THE PALETTE. Every hex in public/brand/seals/ and public/brand/badges/svg/.
 *
 * Counted at the time of writing: 112 gold, 102 seafoam, 46 cream, 36 navy,
 * 33 rim-deep, 14 slate, 6 teal, 4 wave, 2 brass, 1 parchment, 1 mark-navy.
 * A hex outside this set means new art arrived with an ink nobody declared.
 */
export const SEAL_INKS: Record<string, BrandInk> = {
  GOLD: {
    hex: "#e8b44c",
    token: "--ediagd-gold",
    role: "craft rim, credential collar, the tier mark",
  },
  SEAFOAM: {
    /* No token, and shared with the badge art — see the note above. The brand
       mark's own wave is #6fbcc6, a near neighbour but NOT this value, and the
       two must not be collapsed without Ryan looking at both. */
    hex: "#7ec8cd",
    token: null,
    role: "service rim, badge motif fill",
  },
  CREAM: {
    hex: "#f2efe8",
    token: null,
    role: "the Certified credential's ground, glyph knockouts",
  },
  NAVY: {
    hex: "#0c1c2c",
    token: "--ediagd-navy",
    role: "the medallion body",
  },
  RIM_DEEP: {
    hex: "#163a54",
    token: null,
    role: "the far stop of the body gradient",
  },
  SLATE: {
    hex: "#8492a2",
    token: null,
    role: "badge art only — the muted locked treatment",
  },
  TEAL: {
    hex: "#4aa8b0",
    token: "--ediagd-teal",
    role: "badge art accent",
  },
  WAVE: {
    /* lib/brand-ink.ts MARK_WAVE. The master mark's ink, which appears in the
       two credential seals because they carry the complete mark. */
    hex: "#6fbcc6",
    token: null,
    role: "the mark's water, inside the credential seals",
  },
  BRASS: {
    hex: "#c9b283",
    token: null,
    role: "the Master collar's inner bevel",
  },
  PARCHMENT: {
    hex: "#fbf6ea",
    token: null,
    role: "the Certified seal's inner disc",
  },
  MARK_NAVY: {
    /* lib/brand-ink.ts MARK_NAVY — the mark's own navy, a shade off the UI
       token, and deliberately so. Documented at length in styles/brand.css. */
    hex: "#132a40",
    token: null,
    role: "the mark's line work, inside the credential seals",
  },
};

/** Every declared hex, lowercased — what the art is allowed to contain. */
export const SEAL_PALETTE: ReadonlySet<string> = new Set(
  Object.values(SEAL_INKS).map((i) => i.hex)
);

/** The inks that must keep agreeing with a CSS token. */
export const TOKEN_MIRRORS = Object.entries(SEAL_INKS)
  .filter(([, i]) => i.token !== null)
  .map(([name, i]) => ({ name, hex: i.hex, token: i.token as string }));

/* ---------------------------------------------------------------------------
   WHERE THE ART LIVES
--------------------------------------------------------------------------- */

/** Seal SVGs, served statically. 34 files: 12 craft, 20 service, 2 credentials. */
export const SEAL_DIR = "/brand/seals";

/**
 * certification.glyph_key -> file, with a fallback that is a real drawing.
 *
 * AN UNKNOWN KEY MUST NOT RENDER NOTHING. A certification seeded before its art
 * exists — or a glyph_key typo — would otherwise leave a hole in the wall where
 * a medallion should be, and an empty box reads as a broken app rather than as
 * a missing file. The fallback is the service rim with no subject glyph, which
 * is honest: it says "a certification, kind unknown" instead of lying about
 * which one.
 */
export const SEAL_FALLBACK = "service_misc";

export function sealHref(glyphKey: string | null | undefined): string {
  const key = (glyphKey ?? "").trim();
  return `${SEAL_DIR}/${key || SEAL_FALLBACK}.svg`;
}
