/* ============================================================================
   EDIAGD — what one person's one day amounts to

   This is the manager Team screen's answer, and it is built on restDayFor()
   rather than on a fresh copy of the rule.

   ---------------------------------------------------------------------------
   IT IS NOT YET THE ONLY ANSWER, AND THAT IS RECORDED RATHER THAN HIDDEN
   ---------------------------------------------------------------------------
   The admin engagement strip decides the same question inline — compose() in
   lib/admin-advisor-detail.ts, around the status branch. The two differ in two
   ways, and BOTH differences were found while writing this file:

     1. compose() is CLOSURE-BLIND. It loads the rooftop's confirmed closures
        and never reads them in the day loop, so a day the store was shut
        renders as "missed" on the admin strip. This file is not blind to it,
        because restDayFor is not.

     2. THEY DISAGREE ABOUT ISLAND TIME ON A DAY OFF, in writing, each with a
        comment arguing its own way:
          restDayFor  "DAY OFF OUTRANKS EVERYTHING ... 'scheduled day off' is
                       the truer thing to say about it"
          compose()   "Ahead of 'off' on purpose ... a day that is both off and
                       Island Time reads better as Island Time"
        Two documents disagreeing about the same fact is the bug. It does not
        change any answer THIS file gives — both arms mean "not a gap" to a
        manager — so it is not quietly settled here. It needs a ruling, and
        then one of the two comments deleted.

   compose() was deliberately left alone: unifying it would change an admin
   screen nobody asked to have changed, on a judgement that is not mine. The
   question is written down instead of left for the next reader to re-derive.

   ---------------------------------------------------------------------------
   THE PRECEDENCE, AND WHY IT IS THIS WAY ROUND
   ---------------------------------------------------------------------------
   Doing the work outranks everything. Somebody who ran their five minutes on a
   Saturday they do not work has DONE IT, and a strip that showed that day as
   "off" would be hiding the best thing in the record.

   Rest outranks "nothing happened". This is the whole point of the function. A
   day off, a booked absence or a shut store is not a day anybody owed us, and
   reporting it as a miss is a manager chasing somebody who was never due in.
   The same mistake as reading swell.current_len raw: a number that is right
   about the arithmetic and wrong about the person.

   NO SCHEDULE ON FILE MEANS SCHEDULED, matching the streak engine and
   restDayFor: with no row, countMissedWorkDays counts every day, so claiming a
   rest day here would be a promise nothing behind it keeps.
   ============================================================================ */

import { restDayFor } from "@/lib/work-schedule";
import type { IsoDate, ScheduleContext } from "@/lib/gamification/streak";

export type DayStatus =
  /** Finished the daily loop — did the work. Outranks every rest state. */
  | "completed"
  /** Opened the app but didn't finish the loop. */
  | "logged-in"
  /** Scheduled, store open, and nothing happened. The only status that is a gap. */
  | "missed"
  /** Not a work day for this person, OR the store was shut. Never counts against them. */
  | "off"
  /** Planned absence (0025). Not a missed day, not a day off. */
  | "island";

/**
 * What this person's `date` amounts to.
 *
 * `completed` and `loggedIn` are sets of dates rather than booleans so a caller
 * walking a window passes them once; a single-day caller passes a set of one.
 *
 * STORE CLOSURE COLLAPSES TO `off` DELIBERATELY. It is a distinct fact and
 * callers that want to say "Store closed" in words read the closure list
 * themselves — but as a STATUS it means exactly what `off` means: a day nobody
 * was asked to be on the drive. Giving it its own status would have added a
 * case every existing renderer would silently fall through, which is how a new
 * value becomes an unhandled branch that shows nothing at all.
 */
export function dayStatusFor(
  date: IsoDate,
  context: ScheduleContext,
  seen: { completed: ReadonlySet<IsoDate>; loggedIn: ReadonlySet<IsoDate> }
): DayStatus {
  if (seen.completed.has(date)) return "completed";
  if (seen.loggedIn.has(date)) return "logged-in";

  /* restDayFor owns day_off / store_closed / island_time and their order, and
     returns null when there is no schedule on file. */
  const rest = restDayFor(date, context);
  if (rest?.kind === "island_time") return "island";
  if (rest) return "off";

  return "missed";
}

/** Does this status describe a gap somebody should be asked about? */
export function isGap(status: DayStatus): boolean {
  return status === "missed";
}
