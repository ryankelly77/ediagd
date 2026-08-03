import { TIER_META, type Tier } from "../../lib/brand";

/** Advisor tier pill (Elite / Strong / Low / Zero). */
export function TierBadge({ tier, small }: { tier: Tier; small?: boolean }) {
  const meta = TIER_META[tier];
  return (
    <span
      className={`inline-flex items-center rounded-pill font-extrabold uppercase tracking-wide ${
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{ backgroundColor: meta.tint, color: `rgb(var(--tier-${tier.toLowerCase()}))` }}
    >
      {meta.label}
    </span>
  );
}

export default TierBadge;
