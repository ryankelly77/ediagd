import {
  MARK_SUN,
  MARK_SWELL_PATHS,
  MARK_VIEWBOX,
  MARK_WAVE,
  MARK_WAVE_PATH,
  MARK_CREAM,
  MARK_PALM_PATHS,
} from "@/lib/brand-ink";

/**
 * The Swell mark, at rest.
 *
 * ---------------------------------------------------------------------------
 * THE SAME DRAWING, NOT A DIFFERENT ONE
 * ---------------------------------------------------------------------------
 * SwellSun is the brand's mark: the sun RISING over water, rays out, used on
 * the streak hero and the badge wall wherever the app is asking for something
 * or celebrating it. A rest day is neither, and putting the rising sun on it
 * would say "here we go" on the one screen whose entire message is "not today".
 *
 * So this is the same sun and the same water, lower. The horizon does not move
 * — that is what keeps the two marks recognisably one family — and the sun sits
 * down in it with its rays short and close instead of thrown wide. Nothing is
 * greyed out or dimmed: a day off is not a lesser day, it is a different one,
 * and the brand rule is celebrate up, never punish down.
 *
 * ---------------------------------------------------------------------------
 * ISLAND TIME GETS A HAMMOCK, AND THAT IS A CORRECTION
 * ---------------------------------------------------------------------------
 * This used to give Island Time a palm tree, which worked only while the
 * everyday mark had none. The master artwork now has a palm in it, so a palm
 * says "EDIAGD" rather than "vacation" — the variant stopped signifying the
 * moment the logo changed.
 *
 * A hammock slung from that palm is the thing only Island Time means. One drawn
 * element, unmistakable at a glance, and it makes the booked-absence card the
 * small delight it deserves rather than a scheduled-day-off card wearing a
 * different tree.
 *
 * All inks come from lib/brand-ink. Four hand-drawn copies of this mark had
 * already drifted to an older palette before anyone noticed; geometry sometimes
 * has to be hand-drawn, ink never does.
 */
export function RestingMark({
  variant,
  size = 96,
  className,
}: {
  /** `palm` for Island Time — palm and hammock. `sun` for a day off or closure. */
  variant: "sun" | "palm";
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <g strokeLinecap="round">
        {/*
          Z-ORDER IS THE WHOLE DRAWING HERE.

          The master paints the wave IN FRONT of the palm, which is what tucks
          the trunk behind the water and gives the mark its depth. That is kept.
          But anything slung FROM the palm then disappears behind the wave too —
          the first hammock was a sliver of rope above the waterline.

          So the palm and the low sun sit behind the water, as in the master,
          and the hammock sits in front of it. A hammock is nearer the viewer
          than the sea is; painting it forward is what the eye expects.
        */}

        {variant === "sun" ? (
          <>
            {/* Rays short and close rather than thrown wide — a sun this low
                has nothing to throw sideways past. */}
            <g stroke={MARK_SUN} strokeWidth="2.6" opacity="0.8" fill="none">
              <path d="M52 26v-6M38 32l-4-4M66 32l4-4" />
            </g>
            {/* Low and partly behind the water: the wave crest cuts its base,
                which is what says "settled" rather than "rising". */}
            <circle cx="52" cy="40" r="11" fill={MARK_SUN} opacity="0.92" />
          </>
        ) : (
          /* The master's palm, unchanged — the same tree the logo has, which is
             what makes the hammock read as hung from it. */
          <g fill="none" stroke={MARK_CREAM} strokeWidth="2.6">
            {MARK_PALM_PATHS.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}

        <path d={MARK_WAVE_PATH} fill={MARK_WAVE} opacity="0.9" />
        {MARK_SWELL_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={MARK_WAVE}
            strokeWidth="2.2"
            opacity={i === 0 ? 0.8 : 0.5}
          />
        ))}

        {variant === "palm" && (
          /*
            IN FRONT OF THE WATER. Slung from the trunk down to the left, deep
            enough to read as occupied rather than as a washing line. The end
            lashings are what say "tied" — without them the curve is a smile.
          */
          <g fill="none" stroke={MARK_CREAM} strokeWidth="2.8">
            <path d="M34 52 C 46 76, 72 76, 84 54" />
            <path d="M34 52 l-2 -5M34 52 l3 -4" strokeWidth="1.8" />
            <path d="M84 54 l2 -5M84 54 l-3 -4" strokeWidth="1.8" />
          </g>
        )}
      </g>
    </svg>
  );
}
