/**
 * The Swell sun — EDIAGD's core motif, the rising sun over water.
 *
 * Deliberately the same drawing as the First Light badge's motif, without the
 * badge frame: the streak hero and the celebration should read as the same
 * family as the badge wall, because the rising sun IS the brand's mark.
 *
 * Flat Sunrise Gold on the water's teal — no gradients, per the brand book.
 *
 * INKS COME FROM lib/brand-ink, NOT FROM THE UI TOKENS. This is artwork: it is
 * the brand's mark without its frame, so it follows the designer's master file
 * rather than the design language. The two differ by a couple of points — the
 * UI's gold is #E8B44C, the mark's sun is #e3b15c — and that gap is deliberate;
 * see the header of brand-ink.ts.
 */
import { MARK_SUN, MARK_WAVE } from "@/lib/brand-ink";

export function SwellSun({
  size = 64,
  className,
  title,
}: {
  size?: number;
  className?: string;
  /** Give a title when it stands alone; omit when a visible label follows. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g strokeLinecap="round">
        {/* rays */}
        <g stroke={MARK_SUN} strokeWidth="5">
          <path d="M50 14v9M26 24l6 6M74 24l-6 6M12 47h9M79 47h9" />
        </g>
        {/* the sun, rising */}
        <path d="M31 60a19 19 0 0 1 38 0z" fill={MARK_SUN} />
        {/* the water */}
        <g fill="none" stroke={MARK_WAVE} strokeWidth="5">
          <path d="M12 60h76" />
          <path d="M16 74q9-8 18 0t18 0 18 0" />
        </g>
      </g>
    </svg>
  );
}

export default SwellSun;
