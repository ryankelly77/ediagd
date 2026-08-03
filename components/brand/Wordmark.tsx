import { Logo } from "./Logo";
import { BRAND } from "../../lib/brand";

/**
 * The EDIAGD lockup: the sun-and-wave badge + the "EDIAGD" wordmark in serif
 * (brand book sets the wordmark in a Times-family serif, tracked, uppercase),
 * with the tagline beneath. `onDark` switches text for the navy header.
 */
type WordmarkProps = {
  onDark?: boolean;
  showTagline?: boolean;
  size?: number;
  className?: string;
};

export function Wordmark({
  onDark = false,
  showTagline = true,
  size = 48,
  className,
}: WordmarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <Logo size={size} />
      <div className="leading-tight">
        <div
          className={`font-display text-2xl font-semibold uppercase tracking-[0.22em] ${
            onDark ? "text-white" : "text-navy"
          }`}
        >
          EDIAGD
        </div>
        {showTagline && (
          <div
            className={`text-[11px] uppercase tracking-[0.28em] ${
              onDark ? "text-teal-soft" : "text-teal"
            }`}
          >
            {BRAND.tagline}
          </div>
        )}
      </div>
    </div>
  );
}

/** The "Mahalo" sign-off, set in the brand's script accent. */
export function Mahalo({ className }: { className?: string }) {
  return (
    <span
      className={`text-teal ${className ?? ""}`}
      style={{ fontFamily: "var(--font-script)", fontSize: "1.6em", lineHeight: 1 }}
    >
      {BRAND.signoff}
    </span>
  );
}

export default Wordmark;
