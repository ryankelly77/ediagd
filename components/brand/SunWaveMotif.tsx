/**
 * The brand's signature — a sun over waves — as whisper-quiet corner texture on
 * hero surfaces. Decorative only: aria-hidden, and opacity comes from
 * `.ediagd-motif` so it can never shout.
 *
 * See DESIGN_LANGUAGE.md §2C: texture, not decoration.
 */
export function SunWaveMotif({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      className={`ediagd-motif ${className ?? ""}`}
    >
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        {/* sun */}
        <circle cx="50" cy="44" r="15" />
        {/* rays */}
        <path d="M50 17v7M50 64v7M23 44h7M70 44h7M31 25l5 5M69 25l-5 5" />
        {/* waves */}
        <path d="M12 74q10-7 19 0t19 0 19 0 19 0" />
        <path d="M12 86q10-7 19 0t19 0 19 0 19 0" />
      </g>
    </svg>
  );
}

export default SunWaveMotif;
