/* ============================================================================
   EDIAGD — certification seal

   ---------------------------------------------------------------------------
   A SIBLING OF BadgeMedallion, NOT A COPY OF IT
   ---------------------------------------------------------------------------
   The two live side by side on the same walls, so the unearned state is
   deliberately IDENTICAL: the same pale cream disc with the same inset hairline
   that BadgeMedallion draws. A wall of things-not-yet-earned should read as one
   quiet row, whatever each of them turns into.

   The earned state is where they part, and the spec (§10) is explicit about
   why:

       "Circles are badges — things you did. Seals are certifications — things
        you are. Badges keep the smooth disc and the gold check; seals take the
        scalloped rim and no check, because a seal is a status, not a completed
        task."

   So there is NO GOLD CHECK here, and it is not an omission to be helpfully
   restored later. A check mark means "done". A certification is not done; it is
   held, and it can lapse.

   ---------------------------------------------------------------------------
   THE EARNED SEAL IS THE SUPPLIED ART, UNTOUCHED
   ---------------------------------------------------------------------------
   BadgeMedallion composes its earned state — navy gradient, gold ring, art on
   top. A seal arrives already composed: the scalloped rim, the body gradient
   and the subject glyph are one drawing, and the rim colour is what carries the
   tier (seafoam service, gold craft, cream Certified, gold-collar Master).
   Rebuilding that ring in CSS would be a second opinion about the tier, in a
   different colour space, that could disagree with the file.

   The inks in those files are pinned by lib/brand-seal-ink.ts and enforced by
   test:seal-ink — see that file for why the art is checked rather than made
   dynamic.

   ---------------------------------------------------------------------------
   LAPSED IS NOT A THIRD PICTURE
   ---------------------------------------------------------------------------
   Design law 3: lapsed is never revoked, "clay at most, never red, and the
   badge is never stripped". A lapsed certification therefore renders EARNED —
   the seal it earned — and the currency is said in words beside it. Nothing
   here dims, greys or crosses out a thing somebody genuinely holds.
============================================================================ */

import { sealHref } from "@/lib/brand-seal-ink";

export type SealDisplayState = "earned" | "locked" | "soon";

export function SealMedallion({
  glyphKey,
  name,
  state,
  size = 112,
  className,
}: {
  /** certification.glyph_key — resolved through sealHref, which never 404s. */
  glyphKey: string | null | undefined;
  /** The certification's name, for the accessible label. */
  name: string;
  state: SealDisplayState;
  /** Diameter of the seal. The art fills it — the rim IS the edge. */
  size?: number;
  className?: string;
}) {
  const earned = state === "earned";

  if (!earned) {
    /* ---- Not earned: the seal's OWN art, muted --------------------------
       Identical treatment to BadgeMedallion's locked state — cream disc,
       inset hairline, and the real artwork at grayscale(1) / opacity 0.45.

       AN EARLIER VERSION DREW A GENERIC RING HERE, on the reasoning that a
       muted brake rotor would read as a brake certification rendered badly.
       That was wrong, and the Coming Soon grid proved it: fourteen tracks
       rendered as fourteen indistinguishable circles. Thirty-four distinct
       glyphs were drawn precisely so a wall of certifications is not a wall of
       identical rings, and hiding the glyph until it is earned throws that away
       at exactly the moment it does the most work — when somebody is deciding
       which track to start.

       A locked badge still shows its motif. A locked seal shows its glyph. */
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center rounded-pill ${className ?? ""}`}
        style={{
          width: size,
          height: size,
          background: "rgb(var(--ediagd-cream))",
          boxShadow: "inset 0 0 0 1px rgb(var(--ediagd-line))",
        }}
        role="img"
        aria-label={`${name} — ${state === "soon" ? "coming soon" : "not yet earned"}`}
      >
        {/* Full size, not inset: on a seal the scalloped rim IS the edge, so
            shrinking the art would float a small seal inside a plain circle and
            lose the silhouette that distinguishes a seal from a badge.
            alt="" and aria-hidden because the span above already carries the
            accessible name — announcing it twice is noise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sealHref(glyphKey)}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className="inline-block shrink-0"
          style={{
            width: size,
            height: size,
            filter: "grayscale(1)",
            opacity: 0.45,
          }}
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  /* ---- Earned: the seal as supplied ------------------------------------
     An <img>, not an inline <svg>: these files are ~28KB of path data each and
     a certifications screen shows thirty of them. Inlining would put a megabyte
     of geometry in the document to gain a cascade the art does not use. */
  return (
    /* Same call BadgeArt makes, for the same reason: next/image does not
       optimise SVG and would put a loader in front of a static file. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sealHref(glyphKey)}
      width={size}
      height={size}
      alt={`${name} — certification seal`}
      className={`inline-block shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
    />
  );
}

export default SealMedallion;
