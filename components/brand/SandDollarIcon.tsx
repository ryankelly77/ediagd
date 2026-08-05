/**
 * The Sand Dollar — EDIAGD's currency mark. This is the app's "$": it appears
 * wherever an amount does.
 *
 * Purpose-built to survive at 16px, which the badge art can't: a solid disc
 * with five short petal slots cut near the centre, plus a small centre dot.
 * Earlier versions radiated the petals out to the rim, which read as an
 * asterisk/starburst once it got small — the petals have to stay tucked in for
 * the flower to register.
 *
 * Flat, two-tone, no gradients. `tone` sets the disc; the petals are cut in a
 * translucent navy so the mark works on gold, cream, and navy alike.
 */
export function SandDollarIcon({
  size,
  className,
  title,
  tone = "gold",
}: {
  size?: number;
  className?: string;
  /** Only when it stands alone; omit when an amount follows it. */
  title?: string;
  tone?: "gold" | "sand" | "current";
}) {
  const disc =
    tone === "gold"
      ? "rgb(var(--ediagd-gold))"
      : tone === "sand"
        ? "rgb(var(--ediagd-gold-soft))"
        : "currentColor";

  // Five petals at 72°, short and close in — that's what reads as a flower.
  const petals = [0, 72, 144, 216, 288];

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle cx="12" cy="12" r="10" fill={disc} />

      <g fill="rgb(var(--ediagd-navy))" fillOpacity="0.42">
        {petals.map((angle) => (
          <rect
            key={angle}
            x="11.1"
            y="4.9"
            width="1.8"
            height="4.4"
            rx="0.9"
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="1.05" />
      </g>
    </svg>
  );
}

export default SandDollarIcon;
