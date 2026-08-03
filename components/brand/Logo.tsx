/**
 * EDIAGD logo mark — the brand-book badge: a gold sunrise over a teal wave,
 * inside a navy ring. Colors are driven by brand CSS variables.
 *
 * This replaces the prototype's "Eddie" tiki, which was not in the brand book.
 * (If you keep Eddie as an in-app guide *character*, treat it as a separate
 * illustration, not the logo.)
 */
type LogoProps = { size?: number; className?: string; title?: string };

const v = (name: string) => `rgb(var(${name}))`;

export function Logo({ size = 56, className, title = "EDIAGD" }: LogoProps) {
  const navy = v("--ediagd-navy");
  const teal = v("--ediagd-teal");
  const gold = v("--ediagd-gold");
  const cream = v("--ediagd-cream");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <clipPath id="ediagd-ring">
          <circle cx="50" cy="50" r="44" />
        </clipPath>
      </defs>

      {/* paper fill inside the ring */}
      <circle cx="50" cy="50" r="44" fill={cream} />

      <g clipPath="url(#ediagd-ring)">
        {/* sun */}
        <circle cx="50" cy="46" r="15" fill={gold} />
        {/* sun rays */}
        <g stroke={gold} strokeWidth="3" strokeLinecap="round">
          <line x1="50" y1="18" x2="50" y2="26" />
          <line x1="30" y1="26" x2="35" y2="31" />
          <line x1="70" y1="26" x2="65" y2="31" />
          <line x1="22" y1="46" x2="30" y2="46" />
          <line x1="70" y1="46" x2="78" y2="46" />
        </g>
        {/* two teal waves */}
        <path d="M4 66 q 12 -9 23 0 t 23 0 t 23 0 t 23 0 v 40 H4 Z" fill={teal} opacity="0.55" />
        <path d="M4 74 q 12 -9 23 0 t 23 0 t 23 0 t 23 0 v 30 H4 Z" fill={teal} />
      </g>

      {/* navy ring */}
      <circle cx="50" cy="50" r="44" fill="none" stroke={navy} strokeWidth="4" />
    </svg>
  );
}

export default Logo;
