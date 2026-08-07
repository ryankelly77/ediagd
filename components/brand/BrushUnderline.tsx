/**
 * A hand-painted brush stroke under a word.
 *
 * An SVG rather than a border or a gradient, because a straight rule reads as
 * chrome and this is meant to look drawn — tapered at both ends, thicker
 * through the middle, with the edges slightly out of true. preserveAspectRatio
 * is "none" so it stretches to whatever word it sits under and always spans it.
 *
 * Decorative only: the stroke is aria-hidden and the word stays ordinary text,
 * so it's still read, selected and searched normally.
 */
export function BrushUnderline({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      {/* The word sits above the paint. */}
      <span className="relative z-10">{children}</span>

      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 200 24"
        preserveAspectRatio="none"
        // Overshoots the word slightly on both sides and sits a hair off level,
        // the way a stroke laid down by hand does.
        className="absolute -left-[4%] -bottom-[0.05em] -z-0 h-[0.36em] w-[108%] -rotate-[0.9deg]"
      >
        {/* Blunt where the brush lands on the left, tapering to a flick on the
            right; the edges wander a little so it never reads as a rule. */}
        <path
          d="M3.5 13.2C30 9.8 62 7.6 96 7c32-.5 64 .4 95 2.2 4 .25 7.5 1 6.2 2.8
             -1 1.4-5.2 1.6-9.2 1.6-32 .3-64 1-96 2-28 .9-56 2-83 2.8
             -3.5.1-7-1.2-6.6-3.2.2-1 .6-1.7 1.1-2z"
          fill="rgb(var(--ediagd-gold))"
        />
      </svg>
    </span>
  );
}

export default BrushUnderline;
