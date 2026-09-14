/* ============================================================================
   EDIAGD — the mark, from the designer's master file

   ---------------------------------------------------------------------------
   ONE DEFINITION, THREE SURFACES
   ---------------------------------------------------------------------------
   The app header, the auth shell and the printed certificate all show the same
   mark. Before this component they showed it three different ways: two typed
   the file path inline, and the certificate drew the hand-built <Logo> — which
   is the PRE-PALM geometry, so the one document that gets framed on a wall
   carried a mark the rest of the product had stopped using.

   This is the fourth time a brand asset has drifted here (the hand-drawn badge
   components, the seal inks, the four hand-drawn marks lib/brand-ink.ts was
   written for, and now the certificate), and every time the cause is the same:
   a second copy nobody remembered to update. So there is one component, it
   reads its source from lib/brand-ink.ts, and test:brand-mark fails the build
   if anything references a mark file any other way.

   ---------------------------------------------------------------------------
   WHY <Logo> IS NOT THIS
   ---------------------------------------------------------------------------
   <Logo> still exists and is still correct for what it is: hand-drawn geometry
   for surfaces that genuinely need it — something that animates, or a layer the
   icon compiler wants separately. lib/brand-ink.ts sets that rule. A print
   document needs none of it and should show the master, which is also the only
   way it can never fall behind the master.
============================================================================ */

import { MARK_SRC_DARK, MARK_SRC_LIGHT } from "@/lib/brand-ink";

export function BrandMark({
  size = 96,
  onDark = false,
  className,
  style,
  alt = "",
}: {
  size?: number | string;
  /** Navy ground: takes the reverse master, which is drawn, not filtered. */
  onDark?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Empty by default — the wordmark beside it is the accessible name. */
  alt?: string;
}) {
  return (
    /* A static SVG at an exact size. next/image would put a loader in front of
       it and does not optimise SVG anyway; on the certificate the size is a
       physical measurement, which next/image would not preserve. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={onDark ? MARK_SRC_DARK : MARK_SRC_LIGHT}
      alt={alt}
      width={typeof size === "number" ? size : undefined}
      height={typeof size === "number" ? size : undefined}
      className={className}
      style={{ width: size, height: size, display: "block", ...style }}
    />
  );
}

export default BrandMark;
