/* ============================================================================
   EDIAGD — the Rollcall, as a Slack message

   PURE. Takes a loaded Rollcall and a change map, returns a string. No client,
   no fetch, no clock of its own — the instant is passed in. That is so the
   message can be built and read in a test, and so the route handler is only
   responsible for fetching and posting.

   ---------------------------------------------------------------------------
   THE SHAPE IS FIXED, AND THAT IS THE WHOLE REQUIREMENT
   ---------------------------------------------------------------------------
   Ryan: "one line per advisor with the six facts in a fixed order so the
   message reads the same every day". So every advisor's line carries all six
   whether or not there is anything in them, in the same order, with the same
   separators. A line that omitted the empty facts would be shorter for the
   people who have done nothing — which is exactly backwards, because they are
   the ones the message exists to surface, and a reader scanning for a gap
   would have to read the words rather than the position.

   The six, in order:
     1  installed      first sign-in from a phone build, and which platform
     2  password set   first recorded sign-in
     3  onboarded      work schedule confirmed
     4  mornings       daily loops completed, and the last one
     5  Certs/tracks   taps on the Certs tab and into a track
     6  lessons out    lessons finished away from the morning

   ---------------------------------------------------------------------------
   EVERYBODY IS LISTED, EVEN WHEN NOTHING CHANGED
   ---------------------------------------------------------------------------
   Also Ryan's instruction, and it is the right one: a message that only showed
   movement would be silent on the day nobody did anything, and silence cannot
   be told apart from the cron not running. 0108 learned that about the streak
   saver and it cost five queries to establish.

   What CHANGED is marked with a `new:` continuation line, so the message can
   be skimmed for movement without losing the standing roll.

   ---------------------------------------------------------------------------
   NO SILENT CAPS
   ---------------------------------------------------------------------------
   Slack truncates a long message in the client, so there is a cap — and if it
   bites, the message says how many people it dropped and why. A roll that
   quietly stopped at forty would read as a complete roll of forty.
   ============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";
import type { Rollcall, RollcallFact, RollcallRow, Tally } from "@/lib/rollcall";
import { loopCompletionMismatches } from "@/lib/rollcall";

/** Beyond this many advisors the message is truncated — and says so. */
const MAX_ADVISORS = 40;

/** "10 Oct". */
function shortDate(iso: IsoDate | string | null): string {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/** "Fri 10 Oct, 07:30" at the store. */
export function storeStamp(instant: Date, timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone ?? "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
}

/** "4 (last 9 Oct)" or "0". */
function countAndLast(t: Tally): string {
  return t.count === 0 ? "0" : `${t.count} (last ${shortDate(t.lastOn)})`;
}

const FACT_LABEL: Record<RollcallFact, string> = {
  installed: "signed in from a phone",
  password: "first sign-in",
  onboarded: "onboarded",
  mornings: "a morning",
  certs: "Certs",
  tracks: "a track",
  library: "the library",
  lessons: "a lesson outside the morning",
  story: "a Good News Story",
};

/** The six facts, always all six, always in this order. */
function advisorLine(row: RollcallRow): string {
  const platform =
    row.firstNativePlatform === "android"
      ? "Android"
      : row.firstNativePlatform === "ios"
        ? "iOS"
        : null;

  const facts = [
    /* 1 */ platform
      ? `phone ${platform} ${shortDate(row.firstNativeSignInOn)}`
      : "phone —",
    /* 2 */ `pw ${shortDate(row.firstLoginOn)}`,
    /* 3 */ `onboarded ${shortDate(row.scheduleSetOn)}`,
    /* 4 */ row.completionCount === 0
      ? "0 mornings"
      : `${row.completionCount} ${
          row.completionCount === 1 ? "morning" : "mornings"
        } (last ${shortDate(row.lastCompletionOn)})`,
    /* 5 */ `Certs ${countAndLast(row.certsOpened)}, tracks ${countAndLast(row.tracksOpened)}`,
    /* 6 */ `${row.lessonsOutsideLoop.count} outside the morning${
      row.lessonsOutsideLoop.count > 0
        ? ` (last ${shortDate(row.lessonsOutsideLoop.lastOn)})`
        : ""
    }`,
  ];

  return `• *${row.name}* — ${facts.join(" · ")}`;
}

export type RollcallMessage = {
  text: string;
  /** How many advisors made it into the message. */
  listed: number;
  /** How many were dropped by the cap. Zero in every normal case. */
  dropped: number;
  /** How many have something new since `since`. */
  changed: number;
};

/**
 * Build the post.
 *
 * `since` is the last instant this message was SUCCESSFULLY posted, or null
 * the first time. Null is reported as "first post" rather than as "nothing
 * changed" — those are different statements and only one of them is true.
 */
export function buildRollcallMessage({
  rollcall,
  rooftopName,
  timezone,
  now,
  since,
  changes,
}: {
  rollcall: Rollcall;
  rooftopName: string;
  timezone: string | null;
  now: Date;
  since: Date | null;
  changes: Map<string, Set<RollcallFact>>;
}): RollcallMessage {
  const lines: string[] = [];

  lines.push(`*EDIAGD Rollcall* · ${rooftopName} · ${storeStamp(now, timezone)}`);

  /* ---- The counts. Same four the screen leads with, from the same loader. */
  const header = [
    `${rollcall.total} ${rollcall.total === 1 ? "account" : "accounts"}`,
    `${rollcall.nativeInstalled} signed in from a phone`,
    `${rollcall.onboarded} onboarded`,
  ];
  if (rollcall.today) header.push(`${rollcall.completedToday} completed today`);
  lines.push(header.join(" · "));

  const unprovisioned = Math.max(0, rollcall.rosterSeats - rollcall.total);
  if (unprovisioned > 0) {
    /* The number that actually measures a rollout, and the reason the screen
       carries it too: "5 of 5 ready" is true and reads like the job is done. */
    lines.push(
      `${unprovisioned} advisor${unprovisioned === 1 ? "" : "s"} the DMS measures here still ${
        unprovisioned === 1 ? "has" : "have"
      } no account.`
    );
  }

  const changed = rollcall.rows.filter((r) => (changes.get(r.userId)?.size ?? 0) > 0);
  if (since === null) {
    lines.push("_First post — everything below is the standing position, not a change._");
  } else if (changed.length === 0) {
    lines.push(`_Nothing new since ${storeStamp(since, timezone)}._`);
  } else {
    lines.push(
      `_${changed.length} ${changed.length === 1 ? "advisor has" : "advisors have"} something new since ${storeStamp(since, timezone)}._`
    );
  }

  /* ---- The two integrity notes, if either fires ------------------------- */
  const unattributed = rollcall.rows.reduce((s, r) => s + r.lessonsUnattributed.count, 0);
  if (unattributed > 0) {
    lines.push(
      `:warning: ${unattributed} lesson completion${unattributed === 1 ? "" : "s"} recorded with no surface, counted in neither column.`
    );
  }
  const mismatches = loopCompletionMismatches(rollcall);
  if (mismatches.length > 0) {
    lines.push(
      `:warning: ${mismatches.length} advisor${mismatches.length === 1 ? "" : "s"} with more in-morning lesson events than completed mornings — the activity numbers are not trustworthy until that is explained.`
    );
  }

  lines.push("");

  /* ---- The roll. Not ready first, which is loadOnboardingStatus's order
          already: on rollout week the top of the list is the work. */
  const shown = rollcall.rows.slice(0, MAX_ADVISORS);
  const dropped = rollcall.rows.length - shown.length;

  for (const row of shown) {
    lines.push(advisorLine(row));

    const facts = [...(changes.get(row.userId) ?? [])];
    if (facts.length > 0) {
      lines.push(`      ↳ new: ${facts.map((f) => FACT_LABEL[f]).join(", ")}`);
    }
    if (row.trackNames.length > 0) {
      lines.push(`      ↳ tracks: ${row.trackNames.join(", ")}`);
    }
    if (row.storiesSubmitted.count > 0) {
      lines.push(`      ↳ Good News Stories: ${countAndLast(row.storiesSubmitted)}`);
    }
  }

  if (rollcall.rows.length === 0) {
    lines.push(
      "_No accounts at this rooftop yet, so there is nobody to call. The DMS roster line above is the number to watch._"
    );
  }

  if (dropped > 0) {
    /* Loud. A roll that quietly stopped at forty would read as a complete roll
       of forty, and a reader would conclude the store has forty advisors. */
    lines.push("");
    lines.push(
      `:warning: ${dropped} more advisor${dropped === 1 ? "" : "s"} not listed — the message is capped at ${MAX_ADVISORS} so Slack does not truncate it. The full roll is on /admin/engagement.`
    );
  }

  return {
    text: lines.join("\n"),
    listed: shown.length,
    dropped,
    changed: changed.length,
  };
}
