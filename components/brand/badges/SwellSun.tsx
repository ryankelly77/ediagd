/**
 * The Swell sun — EDIAGD's core motif, the rising sun over water.
 *
 * Deliberately the same drawing as the First Light badge's motif, without the
 * badge frame: the streak hero and the celebration should read as the same
 * family as the badge wall, because the rising sun IS the brand's mark.
 *
 * Flat Sunrise Gold on the water's teal — no gradients, per the brand book.
 *
 * NOW IN THE MASTER'S COORDINATES, and carrying the master's palm. It used to
 * be a simplified sun-and-two-lines in its own 100x100 space, which was fine
 * while it was only a motif — but the mark grew a palm, and a motif that omits
 * it is a second logo. Redrawing it against the master's 120x120 geometry means
 * the sun, the water and the tree are literally the same paths the brand file
 * uses, so this cannot drift from the logo again.
 *
 * The RING is still deliberately absent: this is the badge motif, and the frame
 * is what the badge itself provides.
 *
 * INKS COME FROM lib/brand-ink, NOT FROM THE UI TOKENS. This is artwork: it is
 * the brand's mark without its frame, so it follows the designer's master file
 * rather than the design language. The two differ by a couple of points — the
 * UI's gold is #E8B44C, the mark's sun is #e3b15c — and that gap is deliberate;
 * see the header of brand-ink.ts.
 */
import {
  MARK_CREAM,
  MARK_PALM_PATHS,
  MARK_RAYS,
  MARK_SUN,
  MARK_SUN_CIRCLE,
  MARK_SWELL_PATHS,
  MARK_VIEWBOX,
  MARK_WAVE,
  MARK_WAVE_PATH,
} from "@/lib/brand-ink";

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
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g strokeLinecap="round">
        {/* The rays, thrown wide — this is the RISING sun, the one the app uses
            where it is asking for something or celebrating it. RestingMark is
            the same sun settled, for the days it is asking for nothing. */}
        <g stroke={MARK_SUN} strokeWidth="2.2" fill="none">
          {MARK_RAYS.map((r, i) => (
            <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
          ))}
        </g>

        <circle
          cx={MARK_SUN_CIRCLE.cx}
          cy={MARK_SUN_CIRCLE.cy}
          r={MARK_SUN_CIRCLE.r}
          fill={MARK_SUN}
        />

        {/* Painted before the water so the trunk tucks behind it, exactly as
            the master does. That occlusion is what makes the two read as one
            drawing rather than a motif with a tree added to it. */}
        <g fill="none" stroke={MARK_CREAM} strokeWidth="2.4">
          {MARK_PALM_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        <path d={MARK_WAVE_PATH} fill={MARK_WAVE} />
        {MARK_SWELL_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={MARK_WAVE}
            strokeWidth="2.2"
            opacity={i === 0 ? 1 : 0.6}
          />
        ))}
      </g>
    </svg>
  );
}

export default SwellSun;
