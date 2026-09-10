import Link from "next/link";
import type { YearUsage } from "@/lib/island-budget";

/**
 * "Island Time: 11 of 15 days left this year."
 *
 * The fact, in the two places somebody is already thinking about their year:
 * the Swell screen, where the streak this protects lives, and /profile, where
 * the work schedule that decides which days count is edited.
 *
 * READ-ONLY HERE ON PURPOSE. Booking stays on /island-time — this is the
 * number turning up where it is relevant, not a third place to change it. The
 * link goes to the screen that can.
 *
 * The chip in the header answers "am I resting today?"; this answers "how much
 * have I got left?". Two different questions, and neither is a good home for
 * the other's answer.
 */
export function IslandBalanceLine({
  usage,
  className,
}: {
  usage: YearUsage;
  className?: string;
}) {
  /* Nothing to report when the store does not offer it — a "0 of 0 days left"
     line reads as a punishment rather than as a feature being switched off. */
  if (usage.cap <= 0) return null;

  return (
    <p className={`text-sm text-ink-soft ${className ?? ""}`}>
      <span className="font-bold text-navy">Island Time:</span>{" "}
      <span className="ediagd-numeral tabular-nums">
        {usage.remaining} of {usage.cap}
      </span>{" "}
      days left this year.{" "}
      <Link
        href="/island-time"
        className="font-bold text-ocean underline underline-offset-2"
      >
        Book time off
      </Link>
      .
    </p>
  );
}

export default IslandBalanceLine;
