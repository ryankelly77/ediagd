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
 * ISLAND TIME LEANS. A booked absence gets the palm, because a scheduled day
 * off is the week's own shape and Island Time is somewhere you went.
 */
export function RestingMark({
  variant,
  size = 96,
  className,
}: {
  /** `palm` for Island Time, `sun` for a day off or a store closure. */
  variant: "sun" | "palm";
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <g strokeLinecap="round">
        {variant === "sun" ? (
          <>
            {/*
              Rays short and close to the sun rather than thrown wide, and only
              the upper three — the two that would sit at the horizon are gone,
              because a sun this low has nothing to throw sideways past.
            */}
            <g stroke="rgb(var(--ediagd-gold))" strokeWidth="4" opacity="0.75">
              <path d="M50 34v6M33 40l4 4M67 40l-4 4" />
            </g>
            {/*
              SITTING IN THE WATER, not above it. A shallow cap where SwellSun
              draws a full half-disc — the difference between a sun coming up
              and one that has settled.
            */}
            <path d="M34 60a16 16 0 0 1 32 0z" fill="rgb(var(--ediagd-gold))" opacity="0.9" />
          </>
        ) : (
          <>
            {/* The trunk, leaning — it is the lean that reads as Island Time. */}
            <path
              d="M56 60c0-10 2-18 6-24"
              fill="none"
              stroke="rgb(var(--ediagd-teal))"
              strokeWidth="4"
            />
            {/* Fronds, falling away from the lean rather than radiating. */}
            <g fill="none" stroke="rgb(var(--ediagd-teal))" strokeWidth="4">
              <path d="M62 36q-11-5-17 1" />
              <path d="M62 36q11-6 16 1" />
              <path d="M62 36q-3-11 3-14" />
              <path d="M62 36q9 3 10 11" />
            </g>
            <circle cx="62" cy="36" r="2.5" fill="rgb(var(--ediagd-gold))" />
          </>
        )}

        {/* The horizon is IDENTICAL to SwellSun's, deliberately — it is what
            makes the resting mark read as the same place at a different hour. */}
        <g fill="none" stroke="rgb(var(--ediagd-teal))" strokeWidth="5">
          <path d="M12 60h76" />
          <path d="M16 74q9-8 18 0t18 0 18 0" />
        </g>
      </g>
    </svg>
  );
}
