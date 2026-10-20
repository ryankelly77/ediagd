/* ============================================================================
   EDIAGD — should the Rollcall post go out today?

   Ryan, 19 October: "roll call slack message should only be sent on weekdays
   and honor the location's days off, so you don't send on holidays either."

   PURE. Takes the store's local date and whatever closure row that date has,
   returns a decision and a sentence explaining it. No client, no clock — so
   every rule below is testable for any day of any year without waiting for it
   (`npm run test:rollcall-schedule`).

   ---------------------------------------------------------------------------
   WHY THE RULE IS NOT IN vercel.json
   ---------------------------------------------------------------------------
   `30 22 * * 1-5` would do the weekday half in one character, and it is the
   wrong place for two reasons.

   First, a cron expression cannot know about Thanksgiving. Half the rule would
   live in the schedule and half here, which is TWO SOURCES OF TRUTH ABOUT WHEN
   THE POST GOES OUT — the exact thing app/api/cron/rollcall/route.ts's own
   header already warns against ("not a second schedule, which would mean two
   sources of truth").

   Second, Vercel crons are UTC. `22:30 UTC` happens to land on the same
   calendar day as Central, so a UTC day-of-week filter would be right for
   Beaumont today and silently wrong the day ROLLCALL_ROOFTOP_ID points at a
   store east of Greenwich — where 22:30 UTC is already tomorrow. A rule keyed
   on the server's idea of the day is the mistake 0056 wrote four paragraphs
   about.

   So the cron keeps firing every day and THIS decides. One rule, one place,
   and the decision is recorded on every run including the ones that skip.

   ---------------------------------------------------------------------------
   THE ORDER MATTERS, AND THE FIRST RULE TO FIRE IS THE ONE REPORTED
   ---------------------------------------------------------------------------
     1  weekend   Saturday or Sunday AT THE STORE
     2  closed    a CONFIRMED rooftop_closed_day for that date
     3  otherwise due

   A Saturday that is also a confirmed holiday reports `weekend`, because that
   is the rule that decided — the same shape as the push audit naming the first
   generator condition that failed. The closure is still carried on the
   decision so the detail can mention both.

   ---------------------------------------------------------------------------
   A PROPOSED CLOSURE IS NOT A DAY OFF, AND THE HOLE IS NAMED RATHER THAN HIDDEN
   ---------------------------------------------------------------------------
   `rooftop_closed_day.status` is 'proposed' until a manager confirms it, and
   0101's own comment is explicit: "Only status='confirmed' rows affect
   anything". This follows that — a proposal is a question, not a decision, and
   suppressing a post on one would be acting on an answer nobody gave.

   THE CONSEQUENCE IS A REAL HOLE AND IT MUST NOT BE SILENT. "Exclude the rows
   marked X" exempts every row that never got marked, and a store whose
   calendar nobody has ruled on will get a post on Thanksgiving while this file
   looks like it prevents exactly that. So the decision carries
   `unruledClosure`, the route records it on the heartbeat, and the report says
   it out loud. The fix is a manager confirming the calendar — which
   /admin/engagement already asks for, in those words ("N still to rule").

   A DISMISSED proposal is a decision the other way and is not carried at all:
   0101 keeps the row with `dismissed_at` set rather than deleting it, so the
   annual seeder cannot resurrect it, and the caller filters on that.
   ============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";
import { isWeekend, weekdayName } from "@/lib/store-day";

/** The closure row for the day in question, or null. Dismissed rows excluded. */
export type DayClosure = {
  label: string;
  status: "proposed" | "confirmed";
};

export type RollcallSkip = "weekend" | "closed";

export type RollcallPostDecision = {
  /** Post today. */
  due: boolean;
  /** Which rule stopped it, or null when it is due. */
  skip: RollcallSkip | null;
  /** One sentence, for the heartbeat and the response body. */
  reason: string;
  /** The store's date the decision was made for. */
  localDate: IsoDate;
  /** "Mon" … "Sun", at the store. */
  weekday: string;
  /** The closure row, whether or not it was the deciding rule. */
  closure: DayClosure | null;
  /**
   * There is a closure proposal for today that NOBODY HAS RULED ON, so the
   * post was not suppressed by it.
   *
   * Stated rather than swallowed: this is the one state where the feature
   * looks like it is working and is not. See the header.
   */
  unruledClosure: boolean;
};

export function rollcallPostDue({
  localDate,
  closure,
}: {
  localDate: IsoDate;
  closure: DayClosure | null;
}): RollcallPostDecision {
  const weekday = weekdayName(localDate);
  const unruledClosure = closure?.status === "proposed";

  const base = { localDate, weekday, closure, unruledClosure };

  /* 1. The weekend. Checked first because it is the rule that decided, even on
        a Saturday that is also a confirmed holiday. */
  if (isWeekend(localDate)) {
    return {
      ...base,
      due: false,
      skip: "weekend",
      reason: `${localDate} is a ${weekday} at the store — the Rollcall posts on weekdays only.`,
    };
  }

  /* 2. A confirmed day off. */
  if (closure?.status === "confirmed") {
    return {
      ...base,
      due: false,
      skip: "closed",
      reason: `the store is closed on ${localDate} for ${closure.label} — confirmed, so no post.`,
    };
  }

  /* 3. Due. */
  return {
    ...base,
    due: true,
    skip: null,
    reason: unruledClosure
      ? `${weekday} ${localDate}: posting. ${closure!.label} is PROPOSED for today but has not been confirmed, so it did not suppress the post — somebody needs to rule on the closure calendar.`
      : `${weekday} ${localDate}: a working day at the store.`,
  };
}
