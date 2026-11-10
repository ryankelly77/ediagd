/* ============================================================================
   EDIAGD — the Rollcall, as a Slack message

   PURE. Takes a loaded Rollcall and a change map, returns a string. No client,
   no fetch, no clock of its own — the instant is passed in. That is so the
   message can be built and read in a test, and so the route handler is only
   responsible for fetching and posting.

   ---------------------------------------------------------------------------
   WHAT THIS USED TO SAY, AND WHY IT NO LONGER DOES
   ---------------------------------------------------------------------------
   The header here used to argue that the shape was the whole requirement:
   "one line per advisor with the six facts in a fixed order so the message
   reads the same every day" — installed, password set, onboarded, mornings,
   Certs/tracks opened, lessons outside the morning, all six on every line
   whether or not there was anything in them.

   That was right for rollout week and is wrong now, and the argument is
   superseded rather than softened. Ryan, 6 November, on the Beaumont post:
   thirty lines for eight advisors with the three things that matter buried.

     1  FOUR OF THE SIX WERE ONBOARDING FACTS. Phone, password and onboarded
        dates were the thing to watch while people were being invited. Four
        weeks in everybody has them, so they repeated unchanged every evening
        and cost two thirds of the message to say nothing.
     2  "Certs 44 · tracks 28" WERE TAP COUNTS. certsOpened and tracksOpened
        count taps on a tab and into a track — they go UP when somebody
        browses and say nothing whatever about progress toward a credential.
        A number that moves for a reason nobody cares about is noise with a
        label on it.
     3  WHO MISSED TODAY WAS NOWHERE ON THE POST. It had to be deduced by
        scanning eight "(last 6 Nov)" fragments and noticing the one that was
        not — which is the one question the post exists to answer.

   So the facts that stop changing are gone, the tap counts are replaced by a
   meter over the thing the loop is actually for (gating modules completed
   toward EDIAGD Certified), and the post opens by SAYING who did their
   morning and who did not.

   ---------------------------------------------------------------------------
   EVERYBODY IS STILL LISTED, EVEN WHEN NOTHING CHANGED
   ---------------------------------------------------------------------------
   Unchanged, and it is still the right instruction: a message that only showed
   movement would be silent on the day nobody did anything, and silence cannot
   be told apart from the cron not running. 0108 learned that about the streak
   saver and it cost five queries to establish.

   What is dropped is the per-person fact that never moves, never the person.
   The message gets SHORTER on a quiet day because the movement column empties,
   not because a row disappears.

   ---------------------------------------------------------------------------
   THE ROSTER IS A CODE BLOCK, AND THAT IS A RENDERING DECISION
   ---------------------------------------------------------------------------
   Slack mrkdwn renders `*bold*` and triple-backtick blocks. The columns only
   line up in a monospaced font, so the roster is fenced; the heading lines and
   the footer are not, so they keep bold. No emoji inside the fence — Slack
   does not render them in code font — which is why the marks and the meter are
   box-drawing characters and the warnings live outside the block.

   ---------------------------------------------------------------------------
   NO SILENT CAPS
   ---------------------------------------------------------------------------
   Slack truncates a long message in the client, so there is a cap — and if it
   bites, the message says how many people it dropped and why. A roll that
   quietly stopped at forty would read as a complete roll of forty.
   ============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";
import { meter, meterCells, pctText } from "@/lib/meter";
import type { Rollcall, RollcallChange, RollcallRow } from "@/lib/rollcall";
import { hasMovement, loopCompletionMismatches } from "@/lib/rollcall";

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

/**
 * "Fri 6 Nov" at the store — the same stamp without the time.
 *
 * A SECOND FUNCTION RATHER THAN A FLAG ON storeStamp, which other code still
 * calls to say when a window started. The header dropped the time because this
 * is the evening post and the hour is always 16:30 or 17:30 — a clock that only
 * ever reads two values is furniture — but "nothing new since Fri 6 Nov" would
 * be a worse sentence than the one with the hour in it, so both exist.
 */
export function storeDay(instant: Date, timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone ?? "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/*
 * THE METER'S ARITHMETIC LIVES IN lib/meter.ts, AND THAT MOVE IS THE POINT
 * OF 0179 RATHER THAN TIDYING.
 *
 * It was private to this file while the post was the only surface allowed to
 * draw it. Ryan, 8 November: /admin/engagement draws it too, per advisor — so
 * there are now two renderings of one number, and a second copy of the rounding
 * is how the screen and Slack come to disagree about one advisor with nothing
 * erroring.
 *
 * `meterCells` is still the SLACK rendering: box-drawing characters, because the
 * roster is a code fence and Slack only lines columns up in a monospaced font.
 * The screen draws the brand's progress rule over the same `meterPct`.
 *
 * The number is PADDED BY THE ROSTER rather than by the formatter, to a width
 * taken from the rows actually being printed: fixing it at three would put two
 * spaces before every ordinary "82%" to leave room for a "100%" that may not be
 * on the post, and would misalign the day somebody hits 100. A column's width
 * is a property of its contents.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Why this person has never completed a morning — the parenthetical on line 2
 * and the roster's context for the same row.
 *
 * READ IN THE ORDER THE ROLLOUT ACTUALLY GOES, so the sentence names the step
 * they are stuck ON rather than a later one they could not have reached. Only
 * called for somebody with no completions; "no mornings yet" is the remainder,
 * and it is the one that means the app is in their hands and they have not
 * used it.
 */
function neverReason(row: RollcallRow): string {
  if (!row.firstLoginOn) return "never signed in";
  if (!row.scheduleSetOn) return "not onboarded";
  return "no mornings yet";
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

/** Did this advisor finish their morning on the store's today? */
function completedToday(row: RollcallRow, today: IsoDate | null): boolean {
  return today !== null && row.lastCompletionOn === today;
}

/**
 * The movement column: what is new for this person since the last post.
 *
 * ONLY SUBSTANTIVE THINGS, in a fixed order, as a comma list. Lessons first
 * because it is the number that moves most days; the first-time events last
 * because they happen once and are the only place the onboarding facts still
 * appear — on the day they happen, and never again.
 *
 * LESSONS ARE ONE COUNT, not a morning/library split. The split is a question
 * about surfaces and it is answered on /admin/engagement; in a channel it was
 * two numbers nobody added up.
 */
function movementOf(change: RollcallChange | undefined): string[] {
  if (!change) return [];
  const parts: string[] = [];
  if (change.lessons > 0) {
    parts.push(`+${change.lessons} ${plural(change.lessons, "lesson", "lessons")}`);
  }
  for (const name of change.earned) parts.push(`${name} earned`);
  if (change.story) parts.push("story");
  if (change.firstMorning) parts.push("first morning");
  if (change.onboarded) parts.push("onboarded");
  if (change.installedApp) parts.push("installed app");
  return parts;
}

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
  changes: Map<string, RollcallChange>;
}): RollcallMessage {
  const lines: string[] = [];
  const today = rollcall.today;

  /* ======================================================================
     THE ROSTER

     SORTED SO THE WORK IS AT THE BOTTOM. Everybody who did their morning
     first, by meter descending; then those who missed, most recent morning
     first; then those who have never done one. The eye lands where the run of
     ✓ stops, and that is exactly the list of people who need a conversation.
     ====================================================================== */
  const BAND = (r: RollcallRow): number =>
    completedToday(r, today) ? 0 : r.completionCount > 0 ? 1 : 2;

  const ordered = rollcall.rows
    /* The loader's order is the tie-breaker, so two advisors who are level on
       every sort key keep the order the screen shows them in. */
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const band = BAND(a.row) - BAND(b.row);
      if (band !== 0) return band;
      if (BAND(a.row) === 0) {
        const fa = a.row.certs.gatingTotal > 0 ? a.row.certs.gatingDone / a.row.certs.gatingTotal : 0;
        const fb = b.row.certs.gatingTotal > 0 ? b.row.certs.gatingDone / b.row.certs.gatingTotal : 0;
        if (fb !== fa) return fb - fa;
      } else if (BAND(a.row) === 1) {
        /* Most recent morning first — the person who stopped yesterday is a
           different conversation from the one who stopped three weeks ago. */
        const la = a.row.lastCompletionOn ?? "";
        const lb = b.row.lastCompletionOn ?? "";
        if (la !== lb) return lb.localeCompare(la);
      }
      return a.index - b.index;
    })
    .map((x) => x.row);

  /* ---- 1. Which store, which day ---------------------------------------- */
  lines.push(`*EDIAGD Rollcall* · ${rooftopName} · ${storeDay(now, timezone)}`);

  /* ---- 2. WHO DID THEIR MORNING, AND WHO DID NOT -------------------------
     The sentence the old post could not say. It is first because it is the
     question, and the roster below it is the evidence.

     A STORE DAY IS REQUIRED FOR THE COUNT. `today` is null when the Rollcall
     was not scoped to one rooftop, which for this post means the cron ran
     without a store calendar to count against — and "0 of 8 did their morning"
     would then be a confident wrong answer rather than an absent one. */
  const did = ordered.filter((r) => completedToday(r, today));
  /* IN THE ROSTER'S OWN ORDER — most recent morning first, then the people who
     have never had one. Measured against the real store on 8 November this line
     carried seven names in the loader's order while the block underneath had
     the same seven in another: two orderings of one list, which is a reader
     having to check whether they are even the same people. */
  const missed = ordered.filter((r) => !completedToday(r, today));

  if (today === null) {
    lines.push("No store day today.");
  } else if (missed.length === 0) {
    lines.push("*Everybody did their morning today.*");
  } else {
    const names = missed
      .map((r) => (r.completionCount === 0 ? `${r.name} (${neverReason(r)})` : r.name))
      .join(", ");
    lines.push(
      `*${did.length} of ${rollcall.rows.length} did their morning today.* Missed: ${names}.`
    );
  }

  /* ---- 3. The team's meter toward the credential -------------------------
     SAID AS A SENTENCE WHEN THERE IS NO TRACK TO MEASURE, because a line that
     silently vanished and a feature that is not built look identical on a
     terminal — and an empty bar would claim nobody has done any of it. */
  if (rollcall.teamGatingTotal <= 0) {
    lines.push("No active core tracks yet.");
  } else {
    lines.push(
      `Team toward EDIAGD Certified: ${meter(
        rollcall.teamGatingDone,
        rollcall.teamGatingTotal
      )} of core lessons · ${rollcall.teamEarned} ${plural(
        rollcall.teamEarned,
        "track",
        "tracks"
      )} earned`
    );
  }

  /* On the first post there is no window to diff against, and an empty
     movement column with no explanation reads as "nobody did anything". */
  if (since === null) lines.push("_First post. Movement starts tomorrow._");

  const shown = ordered.slice(0, MAX_ADVISORS);
  const dropped = ordered.length - shown.length;

  /* Column widths from what is actually being printed, never from a guess —
     a hard-coded pad is right until somebody called Konstantinopoulos is
     hired. The earned column keeps its width when it is empty so the mornings
     column stays on one offset down the whole block. */
  const nameWidth = Math.max(0, ...shown.map((r) => r.name.length));
  const morningsWidth = Math.max(1, ...shown.map((r) => String(r.completionCount).length));
  const earnedWidth = Math.max(
    0,
    ...shown.map((r) => (r.certs.earned.length > 0 ? `earned ${r.certs.earned.length}`.length : 0))
  );
  const pctWidth = Math.max(
    3,
    ...shown.map((r) => pctText(r.certs.gatingDone, r.certs.gatingTotal).length)
  );

  const rosterLines: string[] = [];

  for (const row of shown) {
    const mark = completedToday(row, today) ? "✓" : row.completionCount > 0 ? "·" : "—";

    const movement = movementOf(changes.get(row.userId));

    /*
     * THE LAST COLUMN IS MOVEMENT OR CONTEXT, NEVER BOTH.
     *
     * For somebody who did their morning, it is what they did. For somebody
     * who did not, the useful thing is not what moved last week — it is how
     * long they have been gone, or which step they never got past. A 0% meter
     * with nothing beside it is a number with no explanation, so a completer
     * who has never opened a track is told so rather than left looking idle.
     */
    let last: string;
    if (since === null) {
      /* First post: there is no window, so there is no movement to report and
         a context string would be dressing up an absence as a finding. */
      last = "";
    } else if (!completedToday(row, today)) {
      last =
        row.completionCount === 0
          ? neverReason(row)
          : `last morning ${shortDate(row.lastCompletionOn)}`;
    } else if (movement.length > 0) {
      last = movement.join(", ");
    } else if (row.certs.gatingDone === 0 && row.tracksOpened.count === 0) {
      last = "no track opened yet";
    } else if (row.certs.lastWorkedOn) {
      last = `last cert work ${shortDate(row.certs.lastWorkedOn)}`;
    } else {
      last = "";
    }

    const earned =
      row.certs.earned.length > 0 ? `earned ${row.certs.earned.length}` : "";

    rosterLines.push(
      /* The mark is attached to the name with ONE space — it is a glyph on the
         row rather than a column of its own, and two spaces would read as an
         empty cell. Every real column after it is separated by two. */
      `${mark} ` +
      [
        row.name.padEnd(nameWidth),
        `${meterCells(row.certs.gatingDone, row.certs.gatingTotal)} ${pctText(
          row.certs.gatingDone,
          row.certs.gatingTotal
        ).padStart(pctWidth)}`,
        earned.padEnd(earnedWidth),
        /* The unit is padded rather than pluralised away, so one morning reads
           as English and the column after it still starts in one place. */
        `${String(row.completionCount).padStart(morningsWidth)} ${
          row.completionCount === 1 ? "morning " : "mornings"
        }`,
        last,
      ]
        .join("  ")
        /* Trailing pad on an empty last column is invisible in Slack and ugly
           in a diff. */
        .trimEnd()
    );
  }

  lines.push("");
  if (rosterLines.length > 0) {
    lines.push("```");
    lines.push(...rosterLines);
    lines.push("```");
  } else {
    lines.push(
      "_No accounts at this rooftop yet, so there is nobody to call. The DMS roster line below is the number to watch._"
    );
  }

  /* ======================================================================
     THE FOOTER — ONE LINE, ONLY THE CLAUSES THAT APPLY

     Each clause is a standing fact about the store rather than about a person,
     which is why none of them is on a row. They are built into an array and
     the line is printed only if the array has something in it: a footer that
     printed its separators regardless would be decoration.

     THE WHOLE TAIL IS COLLECTED BEFORE ANYTHING IS PRINTED, so a quiet day
     ends at the roster rather than at a blank line and a blank line is not
     separating the block from nothing.
     ====================================================================== */
  const tail: string[] = [];
  const footer: string[] = [];

  const unprovisioned = Math.max(0, rollcall.rosterSeats - rollcall.total);
  if (unprovisioned > 0) {
    /* The number that actually measures a rollout: "8 of 8 ready" is true and
       reads like the job is done. */
    footer.push(
      `${unprovisioned} DMS ${plural(unprovisioned, "advisor", "advisors")} still ${plural(
        unprovisioned,
        "has",
        "have"
      )} no account`
    );
  }

  /* TODAY'S PUSHES, NOT THE PERIOD'S — this is an end-of-day post and every
     other number on it is today's. Mixing a thirty-day total into a line of
     daily figures would be two measurements wearing one label. */
  const p = rollcall.pushesToday;
  if (p) {
    if (p.sent === 0) {
      footer.push(
        rollcall.unreachable === rollcall.total && rollcall.total > 0
          ? "no devices registered, so no pushes"
          : `${rollcall.total - rollcall.unreachable} of ${rollcall.total} reachable, 0 pushes sent`
      );
    } else {
      footer.push(
        `${p.sent} ${plural(p.sent, "push", "pushes")} sent, ${p.returned} back within 24 h`
      );
    }
    if (p.failedDeliveries > 0) {
      /* DEVICE grain, deliberately, and named for it — the ⚠ lines below are
         per PERSON. Somebody carrying two handsets can have one refused and
         still have received the push, so the two counts are different
         quantities and must not be read as one. */
      footer.push(
        `${p.failedDeliveries} push ${plural(
          p.failedDeliveries,
          "delivery",
          "deliveries"
        )} refused by Apple`
      );
    }
  }

  if (footer.length > 0) tail.push(footer.join(" · "));

  /* ======================================================================
     THE WARNINGS — ONE LINE EACH, AND EVERY ONE NAMES ITS ADVISOR

     The 6 November post said "1 advisor with more in-morning lesson events
     than completed mornings" and did not say who, which sends whoever reads it
     to a screen to find out. loopCompletionMismatches has had the name all
     along.
     ====================================================================== */
  const unattributed = rollcall.rows.reduce((s, r) => s + r.lessonsUnattributed.count, 0);
  if (unattributed > 0) {
    tail.push(
      `⚠ ${unattributed} lesson ${plural(
        unattributed,
        "completion",
        "completions"
      )} recorded with no surface, counted in neither column.`
    );
  }

  for (const m of loopCompletionMismatches(rollcall)) {
    tail.push(
      `⚠ ${m.name}: more in-morning lesson events than mornings. Numbers suspect until explained.`
    );
  }

  /*
   * A REFUSED DELIVERY IS NAMED UNTIL IT STOPS BEING TRUE. `lastPush` is the
   * most recent message for that advisor, so this line clears itself the moment
   * a delivery is accepted — and until then the refusal is live, not historic:
   * nothing we send is reaching them. Apple's own word is carried because
   * "failed" sends somebody to the app and "BadDeviceToken" sends them to the
   * device.
   */
  for (const row of shown) {
    if (row.lastPush && !row.lastPush.deliveredOk) {
      tail.push(
        `⚠ ${row.name}: push refused by Apple (${row.lastPush.apnsReason ?? "no reason recorded"})`
      );
    }
  }

  if (dropped > 0) {
    /* Loud. A roll that quietly stopped at forty would read as a complete roll
       of forty, and a reader would conclude the store has forty advisors. */
    tail.push(
      `⚠ ${dropped} more ${plural(
        dropped,
        "advisor",
        "advisors"
      )} not listed — the message is capped at ${MAX_ADVISORS} so Slack does not truncate it. The full roll is on /admin/engagement.`
    );
  }

  if (tail.length > 0) {
    lines.push("");
    lines.push(...tail);
  }

  return {
    text: lines.join("\n"),
    listed: shown.length,
    dropped,
    /* Counted over the WHOLE roster, not the listed slice: the heartbeat's
       `changed` is a fact about the store, and reporting it over the capped
       list would quietly re-scope it the day the cap bites. */
    changed: rollcall.rows.filter((r) => hasMovement(changes.get(r.userId))).length,
  };
}
