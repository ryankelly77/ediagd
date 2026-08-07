import { refreshEngagementRollup } from "@/lib/admin-actions";

/* ============================================================================
   EDIAGD — when these numbers were worked out

   Engagement is recomputed overnight (0028), not on page load, so the score
   sitting on this screen at 4pm is the one from this morning. Saying so is not
   a footnote: without it an admin nudges someone, watches the number not move,
   and stops trusting the screen.

   The stamp is rendered in America/Chicago with the zone named. Rooftops span
   five timezones and the rollup is one global number, so there is no "local"
   time for it to be in — 0013's default zone, labelled, beats a time that
   silently means something different in Honolulu.
   ============================================================================ */

export function RollupStamp({
  computedAt,
  canRefresh,
}: {
  /** Null when the rollup has never run. */
  computedAt: string | null;
  /** Platform owner only — refresh_engagement_rollup() refuses everyone else. */
  canRefresh: boolean;
}) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-ink-soft">
      <span>
        {computedAt ? (
          <>Last updated {formatStamp(computedAt)}</>
        ) : (
          <>Not calculated yet</>
        )}
      </span>

      {canRefresh && (
        <form action={refreshEngagementRollup}>
          <button
            type="submit"
            className="rounded-pill px-2 py-0.5 text-xs font-bold text-ocean underline underline-offset-2 transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Recalculate now
          </button>
        </form>
      )}
    </p>
  );
}

/**
 * "Aug 7 at 3:02 AM CDT".
 *
 * The DATE is always shown, not just the time. If the nightly job ever stops,
 * "3:02 AM" alone still looks like this morning — a date is what makes a
 * four-day-old number obvious.
 */
function formatStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "recently";

  const time = at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/Chicago",
  });
  const day = at.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "America/Chicago",
  });

  return `${day} at ${time}`;
}

export default RollupStamp;
