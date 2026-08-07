import { ENGAGEMENT_TARGET } from "@/lib/brand";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";

/**
 * The headline number, with the target as visual context rather than a
 * footnote — an arc you can read at a glance from across the service drive.
 *
 * The arc is a semicircle: 0 on the left, 100 on the right, with a tick where
 * the target sits. Stroke only, so it scales cleanly and costs nothing.
 */
export function EngagementHero({
  score,
  scopeLine,
}: {
  /** Group engagement, or null when nothing has been recorded yet. */
  score: number | null;
  scopeLine: string;
}) {
  const clamped = Math.max(0, Math.min(100, score ?? 0));

  // Semicircle path, r=70, from (10,80) to (150,80).
  const CIRCUMFERENCE = Math.PI * 70;
  const progress = (clamped / 100) * CIRCUMFERENCE;

  // Where the target tick sits along that arc.
  const targetAngle = Math.PI * (1 - ENGAGEMENT_TARGET / 100);
  const tick = {
    x1: 80 + Math.cos(targetAngle) * 58,
    y1: 80 - Math.sin(targetAngle) * 58,
    x2: 80 + Math.cos(targetAngle) * 82,
    y2: 80 - Math.sin(targetAngle) * 82,
  };

  const meetsTarget = (score ?? 0) >= ENGAGEMENT_TARGET;

  return (
    <section className="ediagd-hero">
      <SunWaveMotif />
      <div className="relative flex items-center gap-5">
        <svg
          viewBox="0 0 160 92"
          className="h-24 w-40 shrink-0"
          aria-hidden="true"
        >
          <path
            d="M10 80 A70 70 0 0 1 150 80"
            fill="none"
            stroke="rgb(255 255 255 / 0.18)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {score != null && (
            <path
              d="M10 80 A70 70 0 0 1 150 80"
              fill="none"
              stroke={
                meetsTarget
                  ? "rgb(var(--ediagd-palm))"
                  : "rgb(var(--ediagd-gold))"
              }
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${progress} ${CIRCUMFERENCE}`}
            />
          )}
          {/* Target marker — where "good" starts. */}
          <line
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgb(255 255 255 / 0.65)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        <div className="min-w-0">
          <p className="ediagd-eyebrow">Group engagement</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="ediagd-figure text-white">
              {score == null ? "—" : score}
            </span>
            {score != null && (
              <span className="ediagd-numeral text-xl font-extrabold text-ice-dim">
                %
              </span>
            )}
          </p>
          <p className="mt-1 text-xs font-bold text-ice-dim">
            Target{" "}
            <span className="ediagd-numeral">{ENGAGEMENT_TARGET}%</span>
          </p>
        </div>
      </div>

      <p className="relative mt-4 border-t border-white/15 pt-3 text-xs leading-relaxed text-ice-dim">
        {scopeLine}
      </p>
    </section>
  );
}

export default EngagementHero;
