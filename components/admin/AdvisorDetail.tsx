import type { AdvisorDetail as Detail, DayStatus } from "@/lib/admin-advisor-detail";
import { formatDayLabel } from "@/lib/work-schedule";
import type { IslandTime, IsoDate } from "@/lib/gamification/streak";

/* ============================================================================
   EDIAGD — the advisor detail card

   What an admin needs to answer "is this a real problem, and what do I say?":
   the SHAPE of the last 30 days, the calendar that shape should be judged
   against, and the two rates that separate showing up from doing the work.
   Nothing else. Sand Dollars and badges are the advisor's business, not their
   manager's — the Swell is here only because consistency IS the manager's
   business, and it's the word the advisor already uses.

   Colour follows the status language: palm on track, gold close, clay to
   pursue. Never red — a missed day is a call to make, not a failure.
   ============================================================================ */

const STATUS_META: Record<DayStatus, { label: string; fill: string }> = {
  completed: { label: "Finished the loop", fill: "rgb(var(--ediagd-palm))" },
  "logged-in": { label: "Opened only", fill: "rgb(var(--ediagd-gold))" },
  missed: { label: "Missed", fill: "rgb(var(--ediagd-clay))" },
  // The two that must never read as a failure: they recede into the surface.
  island: { label: "Island Time", fill: "rgb(var(--ediagd-teal-soft))" },
  off: { label: "Day off", fill: "rgb(var(--ediagd-line) / 0.55)" },
};

/** Monday-first, matching isoWeekday and the work_schedule columns. */
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

/** Booked absences named in full before the rest become a count. */
const ISLAND_LINES = 2;

export function AdvisorDetail({
  detail,
  loginRatePct,
  watchRatePct,
  today,
}: {
  detail: Detail;
  loginRatePct: number | null;
  watchRatePct: number | null;
  today: IsoDate;
}) {
  // Pad the first row so every column is one weekday. Reading down a column is
  // how "he never works Saturdays" and "she always misses Mondays" become
  // visible — the whole point of a strip over a number.
  const firstDate = detail.days[0]?.date;
  const lead = firstDate ? isoWeekdayIndex(firstDate) : 0;

  return (
    <div className="border-t border-line px-1 pb-4 pt-4">
      <p className="ediagd-eyebrow">Last 30 days</p>

      {/* ---- The strip ------------------------------------------------- */}
      <div className="mt-2.5 max-w-[18rem]">
        <div
          aria-hidden="true"
          className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-ink-soft"
        >
          {WEEKDAY_INITIALS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div aria-hidden="true" className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {detail.days.map((day) => (
            <span
              key={day.date}
              title={`${formatDayLabel(day.date, today)} — ${STATUS_META[day.status].label}`}
              className="aspect-square rounded-[5px]"
              style={{ background: STATUS_META[day.status].fill }}
            />
          ))}
        </div>
      </div>

      {/* The pattern is visual; this is the same information as a sentence. */}
      <p className="sr-only">
        Over the last 30 days: finished the loop on {detail.completedDays}{" "}
        {plural(detail.completedDays, "day")}, opened the app on{" "}
        {detail.loggedInDays}. {detail.scheduledDays} scheduled work{" "}
        {plural(detail.scheduledDays, "day")} in the window
        {detail.islandDays > 0
          ? `, plus ${detail.islandDays} on Island Time`
          : ""}
        .
      </p>

      <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
        {(Object.keys(STATUS_META) as DayStatus[]).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: STATUS_META[status].fill }}
            />
            <span className="text-xs text-ink-soft">
              {STATUS_META[status].label}
            </span>
          </li>
        ))}
      </ul>

      {/* ---- The context the strip should be read against --------------- */}
      <dl className="mt-4 space-y-2.5 border-t border-line pt-3.5">
        <Row label="Schedule">
          {detail.scheduleLine}
          {!detail.scheduleKnown && (
            <span className="text-ink-soft">
              {" "}
              — every day counts as a work day until they set it
            </span>
          )}
        </Row>

        <Row label="This window">
          <span className="ediagd-numeral">
            {detail.completedDays} of {detail.scheduledDays}
          </span>{" "}
          scheduled {plural(detail.scheduledDays, "day")} finished
          {detail.islandDays > 0 && (
            <span className="text-ink-soft">
              {" · "}
              <span className="ediagd-numeral">{detail.islandDays}</span> more on
              Island Time
            </span>
          )}
        </Row>

        {detail.upcomingIsland.length > 0 && (
          <Row label="Island Time">
            <span className="inline-flex items-baseline gap-1.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-[3px]"
                style={{ background: STATUS_META.island.fill }}
              />
              <span>
                {detail.upcomingIsland
                  .slice(0, ISLAND_LINES)
                  .map((r) => describeRange(r, today))
                  .join(" · ")}
                {detail.upcomingIsland.length > ISLAND_LINES && (
                  <span className="text-ink-soft">
                    {" · "}
                    {detail.upcomingIsland.length - ISLAND_LINES} more booked
                  </span>
                )}
              </span>
            </span>
          </Row>
        )}

        <Row label="Engagement">
          {loginRatePct == null && watchRatePct == null ? (
            <span className="text-ink-soft">No activity recorded yet</span>
          ) : (
            <>
              Opened the app{" "}
              <span className="ediagd-numeral">{loginRatePct ?? 0}%</span> of
              days · watched video{" "}
              <span className="ediagd-numeral">{watchRatePct ?? 0}%</span>
              <span className="text-ink-soft"> · all data, not just this window</span>
            </>
          )}
        </Row>

        <Row label="Swell">
          {detail.swell ? (
            <>
              <span className="ediagd-numeral">{detail.swell.current}</span>-day
              Swell · longest{" "}
              <span className="ediagd-numeral">{detail.swell.longest}</span>
              {detail.swell.lastCompletedOn && (
                <span className="text-ink-soft">
                  {" · last "}
                  {formatDayLabel(detail.swell.lastCompletedOn, today)}
                </span>
              )}
            </>
          ) : (
            <span className="text-ink-soft">Not started</span>
          )}
        </Row>
      </dl>
    </div>
  );
}

/* ---- Bits ---------------------------------------------------------------- */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-ink-soft sm:w-28">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm leading-relaxed text-navy">
        {children}
      </dd>
    </div>
  );
}

/**
 * "Out until Fri 15 Aug" for absence already under way, plain dates for absence
 * still to come. The tense matters: an admin reading "out until Friday" knows
 * not to call today, which is the whole reason this line exists.
 */
function describeRange(range: IslandTime, today: IsoDate): string {
  if (range.start <= today) {
    return range.end === today
      ? "Out today"
      : `Out until ${formatDayLabel(range.end, today)}`;
  }
  if (range.start === range.end) return formatDayLabel(range.start, today);
  return `${formatDayLabel(range.start, today)} – ${formatDayLabel(range.end, today)}`;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

/** Monday = 0 … Sunday = 6, so it indexes the grid columns directly. */
function isoWeekdayIndex(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return day === 0 ? 6 : day - 1;
}

export default AdvisorDetail;
