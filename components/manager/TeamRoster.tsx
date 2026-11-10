"use client";

import { useState } from "react";
import { ServiceList } from "@/components/advisor/ServiceList";
import { Modal } from "@/components/brand/Modal";
import { formatCurrency } from "@/lib/advisor";
/* formatDayLabel, not a local formatter: `new Date("2026-10-26")` is UTC
   midnight, so toLocaleDateString in any negative-offset zone renders the day
   BEFORE. That one is already written to parse and format in UTC. */
import { formatDayLabel } from "@/lib/work-schedule";
import type { IsoDate } from "@/lib/gamification/streak";
import type { AdvisorSummary } from "@/lib/manager";

/**
 * Movement against the advisor's own last period, on matched worked days.
 *
 * Palm up, clay down, ink level — the same scale as the status words a few
 * pixels to the right, and the same ±$50 band the advisor's own screen uses, so
 * a manager and an advisor can never read different verdicts off the same
 * numbers.
 */
function TrendChip({
  trend,
}: {
  trend: NonNullable<AdvisorSummary["trend"]>;
}) {
  const tone =
    trend.direction === "up"
      ? { c: "rgb(var(--ediagd-palm))", t: 18, mark: "▲" }
      : trend.direction === "down"
        ? { c: "rgb(var(--ediagd-clay))", t: 14, mark: "▼" }
        : { c: "rgb(var(--ediagd-ink-soft))", t: 12, mark: "=" };

  return (
    <span
      className="ediagd-numeral inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-extrabold"
      style={{
        background: `color-mix(in srgb, ${tone.c} ${tone.t}%, transparent)`,
        color: tone.c,
      }}
      title={`${trend.workedDays} worked days: ${formatCurrency(trend.currentSales)} vs ${formatCurrency(trend.priorSales)}`}
    >
      <span aria-hidden="true">{tone.mark}</span>
      {trend.direction === "flat"
        ? "level"
        : formatCurrency(Math.abs(trend.salesDiff))}
    </span>
  );
}

/**
 * The one line Reck asked for on the LIST: "something simple like 'videos
 * completed today' or 'no videos completed today'".
 *
 * ---------------------------------------------------------------------------
 * A REST DAY SAYS SO INSTEAD OF SAYING ZERO
 * ---------------------------------------------------------------------------
 * "No videos today" is TRUE of somebody on their day off and is the wrong
 * thing to tell their manager, because the list is scanned for who to talk to.
 * On a rest day the row says why — the same rule as the chip below, applied to
 * the one surface a manager actually reads every morning.
 *
 * NOT A COUNT WHEN THERE IS NOBODY TO COUNT. An advisor with no app account
 * gets no number at all; "0 videos" about somebody who was never given the
 * product is a measurement of us, not of them.
 */
function TodayLine({ today }: { today: AdvisorSummary["today"] }) {
  if (!today) {
    return <span className="text-ink-soft">No EDIAGD account</span>;
  }
  if (today.status === "island") {
    return <span className="text-ink-soft">Island Time</span>;
  }
  if (today.status === "off") {
    return <span className="text-ink-soft">{today.closureLabel ?? "Day off"}</span>;
  }
  if (today.videoCount > 0) {
    return (
      <span className="font-bold" style={{ color: "rgb(var(--ediagd-palm))" }}>
        {today.videoCount} video{today.videoCount === 1 ? "" : "s"} completed today
      </span>
    );
  }
  /* INK-SOFT, NOT CLAY. At 8am this is true of the whole team and means only
     that the morning has not happened yet. A red list every morning teaches a
     manager to stop reading it. */
  return <span className="text-ink-soft">No videos completed today</span>;
}

/**
 * Today's five minutes, on the drill-in. Reck's ask, in his words: "show if
 * they watched today and if they had not".
 *
 * ---------------------------------------------------------------------------
 * THE WORDS ARE THE DESIGN HERE, NOT THE COLOUR
 * ---------------------------------------------------------------------------
 * "NOT YET TODAY", NEVER "DIDN'T WATCH". This is a morning product: at 8am the
 * honest reading of an empty record is "the day has not happened yet", and the
 * whole team reads not-yet for the first part of every morning. A red "missed"
 * would be wrong before lunch and would turn the one screen a manager opens
 * daily into a list of people to tell off. Clay is reserved for a number that
 * is genuinely behind; this is ink-soft and factual.
 *
 * A REST DAY IS NOT A GAP AND MUST NEVER RENDER AS ONE. A day off, a booked
 * absence or a shut store reads as exactly that, because the alternative is a
 * manager chasing somebody who was never due in — the same defect as quoting a
 * streak that a missed work day has already ended.
 *
 * NO ACCOUNT IS ITS OWN STATE. An advisor can sit in the DMS performance data
 * with no membership and no login. Reporting that as "not yet" would blame a
 * person for not using something nobody gave them.
 */
function TodayChip({ today }: { today: AdvisorSummary["today"] }) {
  /* No app account behind this op code — see AdvisorSummary.today. */
  if (!today) {
    return (
      <span
        title="This advisor appears in the dealership's performance data but has no EDIAGD account yet."
        className="rounded-pill border border-line px-2.5 py-1 text-xs font-bold text-ink-soft"
      >
        No account yet
      </span>
    );
  }

  const look = {
    completed: {
      text: "Finished today",
      c: "rgb(var(--ediagd-palm))",
      t: 18,
      title: "They finished the daily loop today.",
    },
    "logged-in": {
      text: "Opened, not finished",
      c: "rgb(var(--ediagd-gold))",
      t: 22,
      title: "They opened the app today but have not finished the loop.",
    },
    missed: {
      text: "Not yet today",
      c: "rgb(var(--ediagd-ink-soft))",
      t: 12,
      title: "Nothing recorded today. A morning that has not happened yet reads the same way.",
    },
    island: {
      text: "Island Time",
      c: "rgb(var(--ediagd-ink-soft))",
      t: 12,
      title: "Booked absence. Not a missed day.",
    },
    off: {
      text: today.closureLabel ?? "Day off",
      c: "rgb(var(--ediagd-ink-soft))",
      t: 12,
      title: today.closureLabel
        ? `The store is closed today: ${today.closureLabel}. Not a missed day.`
        : "Not a work day for them. Not a missed day.",
    },
  }[today.status];

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        title={look.title}
        className="rounded-pill px-2.5 py-1 text-xs font-extrabold"
        style={{
          background: `color-mix(in srgb, ${look.c} ${look.t}%, transparent)`,
          color: look.c,
        }}
      >
        {look.text}
      </span>
      {/* WITHOUT A SCHEDULE THE ENGINE COUNTS EVERY DAY AS A WORK DAY, so
          "not yet" is a ceiling rather than a fact. Said out loud instead of
          quietly implying a gap — and only on the status where it changes the
          reading. */}
      {!today.scheduleKnown && today.status === "missed" && (
        <span className="text-[0.7rem] text-ink-soft">
          no schedule set — every day counts as a work day until they set one
        </span>
      )}
    </span>
  );
}

/**
 * The team roster plus the manager's drill-in. Tapping an advisor opens that
 * advisor's own service list — the same component the advisor sees, so the two
 * screens can never tell different stories about the same numbers.
 */
export function TeamRoster({
  advisors,
  storeToday,
}: {
  advisors: AdvisorSummary[];
  /** The ROOFTOP's today, so the drill-in names the day it is reporting. */
  storeToday?: string;
}) {
  const [selected, setSelected] = useState<AdvisorSummary | null>(null);

  return (
    <>
      <ul className="divide-y divide-line">
        {advisors.map((advisor) => (
          <li key={advisor.advisorOpId}>
            <button
              onClick={() => setSelected(advisor)}
              className="flex w-full items-center gap-3 px-1.5 py-3 text-left transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-base font-bold text-navy">
                    {advisor.name}
                  </span>
                  {/* A TEXT PILL, AND ONLY WHEN HELD. Not a seal — this is a
                      roster row, and thirty seals down a list would turn a
                      working screen into a trophy cabinet. Advisors without a
                      credential carry no marker at all: an "uncertified" chip
                      would mark the whole team as failing a bar nobody can
                      currently clear. */}
                  {advisor.credential && (
                    <span className="shrink-0 rounded-pill bg-gold-soft px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-navy">
                      {advisor.credential}
                    </span>
                  )}
                  {/* THE LIGHT TRACK (0147). A quiet chip, not a warning: the
                      two-slot morning is by design, and this is what stops a
                      manager reading it as a broken account. Turns itself off
                      on the first period that clears the floor. */}
                  {advisor.light && (
                    <span
                      title="Light mornings — the coaching pitch starts when their repair orders come in."
                      className="shrink-0 rounded-pill border border-line px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-ink-soft"
                    >
                      Light
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                  <span>
                    {advisor.totalRos} ROs · {formatCurrency(advisor.totalLaborSales)}
                  </span>
                  {advisor.trend && <TrendChip trend={advisor.trend} />}
                </span>
                {/* TODAY, ON ITS OWN LINE. The line above is last month's
                    period; this is the only thing on the row about right now,
                    so it does not share a line with figures from a different
                    span of time. */}
                <span className="mt-0.5 block text-xs">
                  <TodayLine today={advisor.today} />
                </span>
              </span>

              <span className="text-right">
                {advisor.hasVolume ? (
                  advisor.pursueCount > 0 ? (
                    <span className="text-sm font-bold text-clay">
                      {advisor.pursueCount} to pursue
                    </span>
                  ) : (
                    <span className="text-sm font-bold text-palm">On track</span>
                  )
                ) : (
                  <span className="text-sm font-semibold text-ink-soft">
                    Building data
                  </span>
                )}
              </span>
              <span className="text-lg leading-none text-ink-soft">›</span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <Modal
        label={`${selected.name} services`}
        onClose={() => setSelected(null)}
        width="md"
        showClose
      >
            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold text-navy">
                {selected.name}
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                {selected.totalRos} ROs · {formatCurrency(selected.totalLaborSales)}
              </p>
            </div>

            {/* TODAY, DIRECTLY UNDER THE NAME — the spot Reck asked for. It
                sits above the service list on purpose: the numbers below are
                last month's period and this is the only thing on the card
                about right now. The day is NAMED rather than called "today",
                because a manager reading this at 7am on a phone that thinks it
                is tomorrow deserves to see which day the answer is about. */}
            <div className="mt-3 rounded-xl border border-line p-3">
              <p className="text-[0.7rem] font-extrabold uppercase tracking-wide text-ink-soft">
                {storeToday
                  ? `Today — ${formatDayLabel(storeToday as IsoDate, storeToday as IsoDate)}`
                  : "Today"}
              </p>
              <div className="mt-1.5">
                <TodayChip today={selected.today} />
              </div>

              {/* WHICH ONES — the detail Reck asked for behind the count.
                  Titles come from the SAME aggregate as the number on the
                  list, so the two cannot disagree; a card that said "3
                  videos" over a list of two would be worse than no detail. */}
              {selected.today && selected.today.videoCount > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {selected.today.videoTitles.map((title, i) => (
                    <li
                      key={`${title}-${i}`}
                      className="flex gap-2 text-sm text-navy"
                    >
                      <span aria-hidden="true" className="text-ink-soft">
                        ·
                      </span>
                      <span className="min-w-0">{title}</span>
                    </li>
                  ))}
                  {/* The count is the measurement; the titles are a label on
                      it. If they ever disagree, SAY SO rather than quietly
                      showing the shorter list — a silent mismatch here is the
                      kind that gets discovered in a coaching conversation. */}
                  {selected.today.videoTitles.length !==
                    selected.today.videoCount && (
                    <li className="text-xs text-clay">
                      {selected.today.videoCount} completed, but{" "}
                      {selected.today.videoTitles.length} could be named — tell
                      Ryan, the titles and the count came from one query and
                      should never differ.
                    </li>
                  )}
                </ul>
              )}
            </div>

            {selected.hasVolume ? (
              <div className="mt-4">
                <ServiceList families={selected.families} />
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                Just {selected.totalRos}{" "}
                {selected.totalRos === 1 ? "RO" : "ROs"} so far this period —
                coaching signals unlock as their volume grows.
              </p>
            )}

            <button
              onClick={() => setSelected(null)}
              className="mt-5 w-full rounded-xl bg-navy p-3 font-extrabold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Close
            </button>
        </Modal>
      )}
    </>
  );
}

export default TeamRoster;
