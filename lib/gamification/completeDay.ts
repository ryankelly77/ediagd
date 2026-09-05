/* ============================================================================
   EDIAGD — completeDay(): the server-authoritative daily-loop engine
   SERVER ONLY. Uses the service-role client because 0012 made the economy
   tables (sand_dollar_entry, swell, user_badge) read-only to users — earns are
   granted here, after the completion is verified, and nowhere else.

   Every amount and cap is read from game_settings at runtime. No magic numbers.

   ATOMICITY — read this before changing the order of operations.
   PostgREST gives us no multi-statement transaction from JS, so this is a saga:
     * The daily_completion INSERT goes FIRST and is the idempotency guard. The
       unique (user_id, completion_date) index means a second concurrent call
       loses the race and gets 23505 — checking with a SELECT first would leave
       a TOCTOU window where two requests both pay out.
     * Everything after it is compensated on failure (see `rollback`): ledger
       rows are keyed by ref_id = completion id so they can be removed, the
       prior swell row is captured up front and restored, and a badge is only
       revoked if this run inserted it.
   Residual risk: compensation is itself a network call and can fail, which
   would leave a completion with partial grants. The clean fix is to move this
   whole body into a plpgsql function and call it over RPC, which Postgres would
   run in one transaction. That's a migration and a second implementation of the
   grace maths in SQL, so it isn't done here — but it is the right end state,
   and the pure logic in streak.ts is deliberately separate to make porting easy.
   ============================================================================ */

import { createServiceClient } from "@/lib/supabase/service";
import {
  MILESTONE_BADGE,
  MILESTONE_REASON,
  applyDailyCompletion,
  scheduledOn,
  milestoneSand,
  type GameSettings,
  type IsoDate,
  type Milestone,
  type SwellState,
} from "./streak";
import { loadScheduleContext } from "@/lib/work-schedule";
import { readOpenBlock } from "@/lib/coaching-block";
import type { CueMatch } from "@/lib/daily";
import { readWatchTicket, watchTicketRef } from "@/lib/watch-ticket";
import { readGate } from "@/lib/watch-gate";
import { readDayStamp, type ServedDay } from "@/lib/day-stamp";
import { clampWatchPct, isWatched, watchIsPlausible } from "@/lib/watch-coverage";

export type CompleteDayInput = {
  /**
   * THE DAY THAT WAS SERVED, SIGNED BY THE PAGE THAT SERVED IT.
   *
   * The five content ids, the cue rung, the tier and the skipped flag used to
   * arrive here as loose fields, described as "just provenance". They are not:
   * impact_coaching joins cue_content_id to content.service_family to decide
   * whether an advisor was coached on a family, and that feeds the ROI figure a
   * dealer principal reads. A client could post any published cue id and
   * manufacture coverage in the number the product is sold on.
   *
   * Now the client carries a stamp it cannot alter and this function writes
   * what it VERIFIES. See lib/day-stamp.ts.
   */
  dayStamp?: string | null;
  /*
   * MEASURED BY THE CLIENT, VERIFIED HERE. The percentages are what the player
   * observed; the tickets say when each player was OPENED, which is what makes
   * the observation checkable. Neither is trusted on its own.
   */
  pitchWatchPct?: number | null;
  lifestyleWatchPct?: number | null;
  watchError?: boolean | null;
  pitchWatchTicket?: string | null;
  lifestyleWatchTicket?: string | null;
};

export type CompleteDayResult = {
  alreadyComplete: boolean;
  date: IsoDate;
  streak: number;
  longest: number;
  paddleOutAvailable: number;
  paddleOutSpent: number;
  paddleOutGranted: number;
  graceUsed: boolean;
  streakReset: boolean;
  sandEarned: number;
  badgeEarned: string | null;
  newBalance: number;
};

/** Daily picks needed for Eddie's Pick. */
const EDDIES_PICK_TARGET = 20;

export class CompleteDayError extends Error {
  constructor(
    message: string,
    readonly stage: string
  ) {
    super(message);
    this.name = "CompleteDayError";
  }
}

const DEFAULT_SWELL: Omit<SwellState, "lastCompletedOn" | "paddleOutLastGranted"> = {
  currentLen: 0,
  longestLen: 0,
  paddleOutAvailable: 0,
};

export async function completeDay(
  userId: string,
  rooftopId: string,
  content: CompleteDayInput = {}
): Promise<CompleteDayResult> {
  const supabase = createServiceClient();

  // ---- 1. Today, in the rooftop's timezone -------------------------------
  const { data: todayRaw, error: todayError } = await supabase.rpc("rooftop_today", {
    _rooftop: rooftopId,
  });
  if (todayError) throw new CompleteDayError(todayError.message, "rooftop_today");
  if (!todayRaw) {
    throw new CompleteDayError(
      `No timezone resolved for rooftop ${rooftopId}.`,
      "rooftop_today"
    );
  }
  const today = todayRaw as IsoDate;

  // ---- 1b. The user's calendar ------------------------------------------
  // Read BEFORE the day is claimed: if this fails we throw without having
  // written anything, so there is no half-claimed day to compensate for.
  // No schedule row means "not onboarded", and the engine then treats every
  // day as scheduled — identical to the behaviour before 0025.
  const scheduleContext = await loadScheduleContext(supabase, userId);

  // Three-valued on purpose: null when there's no schedule on file, because
  // "we don't know" is not the same claim as "they weren't scheduled". Stamped
  // now rather than derived later, so changing shifts can't rewrite history.
  const wasScheduled = scheduledOn(today, scheduleContext);

  /*
   * ---- 1c. The coaching block, READ SERVER-SIDE AND NOT TAKEN FROM THE CLIENT
   *
   * The block decides which family an advisor is coached on, which op code
   * inside it, and where in the six stages they are. Accepting those from the
   * request would let anyone POST themselves a block id — including someone
   * else's — and write a coaching history that never happened. They are derived
   * here from the same function the page rendered from, so the record and the
   * screen agree without the screen being trusted.
   *
   * Read BEFORE the day is claimed, for the same reason as the schedule above:
   * a failure here throws with nothing written. It also matters arithmetically —
   * the block's stage cursor is a COUNT of completions against it, so reading it
   * after the insert would report tomorrow's stage as today's.
   */
  const block = await readOpenBlock(supabase, userId);

  /*
   * ---- 1d. WHAT WAS ACTUALLY SERVED --------------------------------------
   *
   * The stamp is checked against this session's user and the rooftop's today,
   * so a valid stamp for yesterday or for somebody else is still not this
   * completion. Everything the row records as provenance comes out of it.
   *
   * A MISSING OR BAD STAMP IS A REFUSAL, NOT A DEGRADED WRITE. Recording the
   * day with null ids would look like a day with no content served, which is a
   * different and untrue statement — and it is the shape a forger would aim
   * for. The advisor is told to reload, which re-mints the stamp.
   */
  const stampCheck = readDayStamp(content.dayStamp, userId, today);
  if (!stampCheck.ok) {
    throw new CompleteDayError(
      `Could not verify today's screen (${stampCheck.reason}). Reload the day and try again.`,
      "day.stamp"
    );
  }
  const served: ServedDay = stampCheck.day;

  /*
   * THE STAMP AND THE OPEN BLOCK HAVE TO BE THE SAME DAY.
   *
   * The block is read server-side and is the authority on the coaching
   * position; the stamp is the authority on what content was put in front of
   * the advisor. If they disagree, the day being submitted is not the day that
   * is open — a block closed in another tab, or a stamp held over from an
   * earlier render — and writing either version would record a conversation
   * that did not happen in the order it claims.
   */
  if ((served.b ?? null) !== (block?.id ?? null)) {
    throw new CompleteDayError(
      "This day was served against a different coaching block. Reload the day and try again.",
      "day.block"
    );
  }

  const watch = await verifyWatch(supabase, userId, today, content, served);

  /*
   * ---- 1e. Did the cue that was served actually carry this stage? ---------
   *
   * The block's cursor says which of the six stages today is, and that is the
   * right thing to serve FROM. It is not evidence that the cue served was
   * written for that stage — no published cue carries a stage at all today, so
   * every completion was recording "At the Kiosk" for a passage that has no
   * position in the pitch. A column read later as a measurement of where an
   * advisor has been coached would have been reading a fiction.
   *
   * So the stage is written only when the served cue agrees with it. The rung
   * is still recorded in `cue_match`, which is where "we wanted a stage and
   * dropped to the family shelf" already lives.
   */
  const stage = await servedStage(supabase, served.cue, block);

  // ---- 2 & 3. Claim the day. The unique index IS the idempotency guard. ---
  const { data: completion, error: completionError } = await supabase
    .from("daily_completion")
    .insert({
      user_id: userId,
      rooftop_id: rooftopId,
      completion_date: today,
      /* From the stamp, never from the request body. */
      quote_content_id: served.q1,
      quote2_content_id: served.q2,
      cue_content_id: served.cue,
      video_content_id: served.vid,
      pitch_video_content_id: served.pitch,
      pitch_video_skipped: served.skipped,
      block_id: block?.id ?? null,
      op_code: block?.opCode ?? null,
      // A stage without an op code violates daily_completion_stage_needs_op_code
      // (0067), and is meaningless anyway — a position in a pitch that isn't
      // named is not a position. Null too when the cue served carried no stage
      // of its own; see servedStage().
      stage,
      cue_tier: block?.tier ?? null,
      cue_match: (served.match as CueMatch | null) ?? null,
      pitch_video_watch_pct: watch.pitchPct,
      lifestyle_video_watch_pct: watch.lifestylePct,
      watch_error: watch.error,
      /* Which tickets this day spent, so neither can be spent again. */
      pitch_watch_ticket: watch.pitchTicketRef,
      lifestyle_watch_ticket: watch.lifestyleTicketRef,
      was_scheduled: wasScheduled,
    })
    .select("id")
    .maybeSingle();

  if (completionError) {
    // 23505 = unique violation: this day is already done. Grant nothing.
    if (completionError.code === "23505") {
      return await currentState(supabase, userId, today, true);
    }
    throw new CompleteDayError(completionError.message, "daily_completion");
  }
  const completionId = completion?.id as string | undefined;
  if (!completionId) {
    throw new CompleteDayError("No completion id returned.", "daily_completion");
  }

  // Best-effort compensation so a failure can't leave a completion with
  // partial grants — the user must be able to retry the day cleanly.
  const awardedBadgeKeys: string[] = [];
  let priorSwell: Record<string, unknown> | null = null;
  let swellExisted = false;

  const rollback = async () => {
    try {
      await supabase.from("sand_dollar_entry").delete().eq("ref_id", completionId);
      await supabase.from("paddle_out_entry").delete().eq("ref_id", completionId);
      for (const key of awardedBadgeKeys) {
        await supabase
          .from("user_badge")
          .delete()
          .eq("user_id", userId)
          .eq("badge_key", key);
      }
      if (swellExisted && priorSwell) {
        await supabase.from("swell").upsert(priorSwell, { onConflict: "user_id" });
      } else if (!swellExisted) {
        await supabase.from("swell").delete().eq("user_id", userId);
      }
      await supabase.from("daily_completion").delete().eq("id", completionId);
    } catch {
      // Swallow: the original error is what the caller needs to see.
    }
  };

  try {
    // ---- 4. Settings — every number below comes from here ----------------
    const { data: settingsRow, error: settingsError } = await supabase
      .from("game_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (settingsError) throw new CompleteDayError(settingsError.message, "game_settings");
    if (!settingsRow) {
      throw new CompleteDayError("No game_settings row found.", "game_settings");
    }

    const settings: GameSettings = {
      paddleOutCap: Number(settingsRow.paddle_out_cap),
      paddleOutPerMonth: Number(settingsRow.paddle_out_per_month),
      sandDailyLoop: Number(settingsRow.sand_daily_loop),
      sandSwell7: Number(settingsRow.sand_swell_7),
      sandSwell30: Number(settingsRow.sand_swell_30),
      sandSwell90: Number(settingsRow.sand_swell_90),
      sandSwell365: Number(settingsRow.sand_swell_365 ?? 0),
      sandBadge: Number(settingsRow.sand_badge),
      sandCertification: Number(settingsRow.sand_certification),
    };

    // ---- 5. Load (or initialise) the Swell ------------------------------
    const { data: swellRow, error: swellReadError } = await supabase
      .from("swell")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (swellReadError) throw new CompleteDayError(swellReadError.message, "swell.read");

    swellExisted = Boolean(swellRow);
    priorSwell = swellRow ?? null;

    const state: SwellState = swellRow
      ? {
          currentLen: Number(swellRow.current_len ?? 0),
          longestLen: Number(swellRow.longest_len ?? 0),
          lastCompletedOn: (swellRow.last_completed_on as IsoDate | null) ?? null,
          paddleOutAvailable: Number(swellRow.paddle_out_available ?? 0),
          paddleOutLastGranted:
            (swellRow.paddle_out_last_granted as IsoDate | null) ?? null,
        }
      : { ...DEFAULT_SWELL, lastCompletedOn: null, paddleOutLastGranted: null };

    // ---- 6 & 7. All the streak/grace rules (pure, testable) -------------
    const { next, outcome } = applyDailyCompletion(
      state,
      today,
      settings,
      scheduleContext
    );

    // ---- 8. Mint the daily loop earn ------------------------------------
    let sandEarned = 0;
    const { error: dailySandError } = await supabase.from("sand_dollar_entry").insert({
      user_id: userId,
      amount: settings.sandDailyLoop,
      reason: "daily_loop",
      ref_id: completionId,
      note: null,
    });
    if (dailySandError) throw new CompleteDayError(dailySandError.message, "sand.daily");
    sandEarned += settings.sandDailyLoop;

    // ---- Persist the Swell ----------------------------------------------
    const { error: swellWriteError } = await supabase.from("swell").upsert(
      {
        user_id: userId,
        current_len: next.currentLen,
        longest_len: next.longestLen,
        last_completed_on: next.lastCompletedOn,
        paddle_out_available: next.paddleOutAvailable,
        paddle_out_last_granted: next.paddleOutLastGranted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (swellWriteError) throw new CompleteDayError(swellWriteError.message, "swell.write");

    // ---- Log what happened to the Paddle Back Out bank (0021) -------------
    // The counter above is authoritative; these rows only explain it. Written
    // after the counter so a failure here can't claim something that didn't
    // happen, and rolled back with everything else via ref_id.
    const paddleRows: {
      user_id: string;
      delta: number;
      kind: string;
      ref_id: string;
      note: string | null;
    }[] = [];

    if (outcome.paddleOutGranted > 0) {
      paddleRows.push({
        user_id: userId,
        delta: outcome.paddleOutGranted,
        kind: "monthly_grant",
        ref_id: completionId,
        note: null,
      });
    }
    if (outcome.paddleOutSpent > 0) {
      paddleRows.push({
        user_id: userId,
        delta: -outcome.paddleOutSpent,
        kind: "spent",
        ref_id: completionId,
        note:
          outcome.paddleOutSpent === 1
            ? "Covered a missed day"
            : `Covered ${outcome.paddleOutSpent} missed days`,
      });
    }

    if (paddleRows.length > 0) {
      const { error: paddleLogError } = await supabase
        .from("paddle_out_entry")
        .insert(paddleRows);
      if (paddleLogError) {
        throw new CompleteDayError(paddleLogError.message, "paddle.log");
      }
    }

    // ---- 9. Badges + their sand dollars ----------------------------------
    // Two ways to earn on a completion: the very first one earns First Light,
    // and hitting a streak milestone earns that Swell badge. Both pay ONCE —
    // re-reaching a milestone after a reset must not pay again.
    const candidates: { key: string; amount: number; reason: string; note: string }[] = [];

    /*
     * FREE SURF — the first day they showed up when nobody asked.
     *
     * FIRST IN THE LIST ON PURPOSE. `badgeEarned` takes the LAST candidate that
     * actually awards, so this is the one every other badge outranks for the
     * celebration headline: a first-ever completion that happens to fall on a
     * Saturday is First Light's moment, not this one. Both are still awarded and
     * both still pay.
     *
     * `onScheduledDay === false` and not `!onScheduledDay`, because the field is
     * three-valued: null means no schedule is on file, and "we don't know
     * whether they were rostered" must never be celebrated as "they came in on
     * their day off".
     */
    if (outcome.onScheduledDay === false) {
      candidates.push({
        key: "free_surf",
        amount: settings.sandBadge,
        reason: "badge",
        note: "free_surf",
      });
    }

    if (outcome.firstEver) {
      candidates.push({
        key: "first_light",
        amount: settings.sandBadge,
        reason: "badge",
        note: "first_light",
      });
    }

    // Eddie's Pick: twenty daily picks worked all the way through. Counted from
    // daily_completion, which this function has just written to — so the count
    // includes today by definition. The pay-once guard below is the same one
    // every other badge uses, so re-reaching twenty cannot pay twice.
    const { count: picksDone } = await supabase
      .from("daily_completion")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (Number(picksDone ?? 0) >= EDDIES_PICK_TARGET) {
      candidates.push({
        key: "eddies_pick",
        amount: settings.sandBadge,
        reason: "badge",
        note: "eddies_pick",
      });
    }

    if (outcome.milestone !== null) {
      const milestone = outcome.milestone as Milestone;
      candidates.push({
        key: MILESTONE_BADGE[milestone],
        // Settings win over the catalog column: game_settings is the tunable
        // the admin edits, badge.sand_dollars is seed data.
        amount: milestoneSand(milestone, settings),
        reason: MILESTONE_REASON[milestone],
        note: `${MILESTONE_BADGE[milestone]} milestone`,
      });
    }

    let badgeEarned: string | null = null;

    for (const candidate of candidates) {
      // The badge must exist in the catalog; skip quietly if it doesn't.
      const { data: badgeRow, error: badgeCatalogError } = await supabase
        .from("badge")
        .select("key")
        .eq("key", candidate.key)
        .maybeSingle();
      if (badgeCatalogError) {
        throw new CompleteDayError(badgeCatalogError.message, "badge.catalog");
      }
      if (!badgeRow) continue;

      const { data: already, error: ownedError } = await supabase
        .from("user_badge")
        .select("badge_key")
        .eq("user_id", userId)
        .eq("badge_key", candidate.key)
        .maybeSingle();
      if (ownedError) throw new CompleteDayError(ownedError.message, "badge.owned");
      if (already) continue;

      const { error: awardError } = await supabase
        .from("user_badge")
        .insert({ user_id: userId, badge_key: candidate.key });
      if (awardError) throw new CompleteDayError(awardError.message, "badge.award");
      awardedBadgeKeys.push(candidate.key);

      const { error: badgeSandError } = await supabase.from("sand_dollar_entry").insert({
        user_id: userId,
        amount: candidate.amount,
        reason: candidate.reason,
        ref_id: completionId,
        note: candidate.note,
      });
      if (badgeSandError) {
        throw new CompleteDayError(badgeSandError.message, "sand.badge");
      }
      sandEarned += candidate.amount;

      // A milestone outranks First Light for the celebration headline.
      badgeEarned = candidate.key;
    }

    // ---- 10. Balance + result -------------------------------------------
    const newBalance = await readBalance(supabase, userId);

    return {
      alreadyComplete: false,
      date: today,
      streak: next.currentLen,
      longest: next.longestLen,
      paddleOutAvailable: next.paddleOutAvailable,
      paddleOutSpent: outcome.paddleOutSpent,
      paddleOutGranted: outcome.paddleOutGranted,
      graceUsed: outcome.graceUsed,
      streakReset: outcome.streakReset,
      sandEarned,
      badgeEarned,
      newBalance,
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Check each video's claimed watch against the time that has actually passed.
 *
 * Returns the values to store. A claim that fails the check does not silently
 * become a smaller number — it throws, because quietly storing 40% when the
 * client said 100% would hide an attempted forgery in a column somebody later
 * reads as a measurement.
 *
 * A MISSING TICKET IS NOT A REJECTION. Tickets are minted per video, so a step
 * with no video has none, and a client that lost one has a completion worth
 * saving. What it loses is the ability to claim a full watch: with nothing to
 * check against, an at-or-above-bar claim is refused and anything below it is
 * stored as reported. The client downgrades such a claim to null before it ever
 * gets here — see the `verifiable` helper in DailyFlow.
 *
 * NEITHER IS AN EXPIRED ONE. Same treatment, for the same reason, and it is the
 * case an honest advisor actually reaches: see the note at the check below.
 *
 * MINTING IS UNLIMITED; SPENDING IS ONCE. A ticket may be minted as often as a
 * player is opened — every refresh mints another, and it has to, or a reload
 * would leave the viewer with no way to prove anything for the rest of the day.
 * What is single-use is CONSUMPTION: a ticket whose hash already sits on a
 * completion cannot be spent again. That check is below, against
 * daily_completion, which is the only place a ticket is ever spent.
 */
async function verifyWatch(
  supabase: ServiceClient,
  userId: string,
  today: IsoDate,
  content: CompleteDayInput,
  served: ServedDay
): Promise<{
  pitchPct: number | null;
  lifestylePct: number | null;
  error: boolean;
  pitchTicketRef: string | null;
  lifestyleTicketRef: string | null;
}> {
  const one = async (
    contentId: string | null,
    rawPct: number | null | undefined,
    ticket: string | null | undefined,
    label: string
  ): Promise<{ pct: number | null; ref: string | null; degraded?: boolean }> => {
    // No video on this step: null means unmeasured, which is not zero.
    if (!contentId) return { pct: null, ref: null };

    /*
     * ---- THE GATE THIS ADVISOR ALREADY MET TODAY -------------------------
     *
     * Written when the gate opened, after the same ticket and wall-clock checks
     * this function makes — so it is a measurement this server already stood
     * behind, not a claim arriving from a browser.
     *
     * It is what makes a completion after a RELOAD honest. Coverage is
     * session-only and the ticket was minted in the tab that has since gone, so
     * the client comes back with nothing to claim: without this the day would
     * record a null percentage for a video that was demonstrably watched.
     */
    const gate = await readGate(supabase, userId, contentId, today);

    if (rawPct == null) {
      if (gate) return { pct: gate.pct, ref: null, degraded: gate.error };
      return { pct: null, ref: null };
    }

    const pct = clampWatchPct(rawPct);
    if (!isWatched(pct)) {
      /* Below the bar this session. If the gate was met earlier today the
         recorded figure is the better measurement of the two — it is the one
         that was checked. */
      if (gate && gate.pct != null && gate.pct > pct) {
        return { pct: gate.pct, ref: null, degraded: gate.error };
      }
      return { pct, ref: null, degraded: gate?.error };
    }

    /* Authoritative duration. Never the client's — a forgery that could declare
       the video four seconds long would satisfy its own check. It also sets the
       ticket's TTL, so both halves of the test read the same number. */
    const { data: row } = await supabase
      .from("content")
      .select("duration_sec")
      .eq("id", contentId)
      .maybeSingle();
    const durationSec = row?.duration_sec == null ? null : Number(row.duration_sec);

    const check = readWatchTicket(ticket, userId, contentId, today, durationSec);
    if (!check.ok) {
      /*
       * ---- AN EXPIRED TICKET IS NOT A FORGERY, AND MUST NOT LOCK THE DAY ---
       *
       * The TTL is three times the video plus five minutes, measured from the
       * moment the player opened. That is generous to a service drive and it is
       * not generous to somebody who got stuck: fight a gate for eight minutes
       * on a fifty-second video and the ticket you are holding is stale before
       * you ever clear it. Refusing there means our own clock costs a streak.
       *
       * So it degrades exactly like a missing one: null percentage — we cannot
       * say what they watched — and watch_error, and the DAY SAVES. Nothing is
       * gained by sending a stale ticket, because nothing is credited for it.
       *
       * Everything else here is a ticket that was made up rather than one that
       * went stale: a bad signature, another user's, another video's, another
       * day's. Those are still refused.
       */
      if (check.code === "expired") return { pct: null, ref: null, degraded: true };

      throw new CompleteDayError(
        `Could not verify the ${label} video watch (${check.reason}). Reload the day and try again.`,
        "watch.ticket"
      );
    }

    /*
     * ---- SINGLE USE ------------------------------------------------------
     *
     * The ticket is bound to the store-local date and there is one completion
     * per user per day, so the unique index is already a backstop. This is the
     * explicit refusal in front of it, and it is not redundant: it names the
     * failure ("already been used") instead of surfacing a 23505, and it holds
     * if the day ever stops being the unit of completion.
     *
     * A rollback DELETES the completion, so a retry after a failed payout finds
     * no spent ticket and proceeds — which is the behaviour that matters most,
     * because that is the path an honest advisor actually hits.
     */
    const ref = watchTicketRef(ticket!);
    const column = label === "pitch" ? "pitch_watch_ticket" : "lifestyle_watch_ticket";
    const { count: spent } = await supabase
      .from("daily_completion")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq(column, ref);
    if (Number(spent ?? 0) > 0) {
      throw new CompleteDayError(
        `That ${label} video watch has already been counted. Open the video again to record a new one.`,
        "watch.replay"
      );
    }

    /*
     * THE WALL CLOCK, FROM WHEN THE PLAYER OPENED.
     *
     * `check.elapsedSec` is time since the ticket was minted, and the ticket is
     * minted on first play intent — so this asks "has the video been open long
     * enough to have played through", not "has the page been open long enough",
     * which was the question that made the old check almost free to pass.
     */
    if (!watchIsPlausible(pct, durationSec, check.elapsedSec)) {
      throw new CompleteDayError(
        `That ${label} video reports ${pct}% watched ${Math.round(check.elapsedSec)}s after it was opened, ` +
          `which is less time than the video runs. Play it through and the day will save.`,
        "watch.implausible"
      );
    }
    return { pct, ref };
  };

  /* The ids come from the STAMP, not the request — a watch can only be claimed
     against a video that was actually served today. */
  const pitch = await one(served.pitch, content.pitchWatchPct, content.pitchWatchTicket, "pitch");
  const lifestyle = await one(served.vid, content.lifestyleWatchPct, content.lifestyleWatchTicket, "lifestyle");

  /*
   * `watch_error` is only meaningful where a video was actually served. A day
   * with no videos at all has nothing that could have failed, and recording
   * true there would put a broken-player marker on a day that had no player.
   */
  const wasServed = Boolean(served.pitch || served.vid);
  /* A watch we could not verify is a watch we could not measure, and that is
     what watch_error records — the same marker a broken player leaves. */
  const degraded = Boolean(pitch.degraded || lifestyle.degraded);
  return {
    pitchPct: pitch.pct,
    lifestylePct: lifestyle.pct,
    error: wasServed ? Boolean(content.watchError) || degraded : false,
    pitchTicketRef: pitch.ref,
    lifestyleTicketRef: lifestyle.ref,
  };
}

/**
 * The stage to record: the block's, but only if the cue served carries it.
 *
 * `stage` on daily_completion is meant to say where in the pitch this advisor
 * was coached, and the six stages are a sequence a certification will be
 * credited from. The block's cursor is the right thing to SERVE from; it is not
 * on its own evidence about the content that came back.
 *
 * The cue id is the client's claim about what it rendered, and everything the
 * server derives here is checked against the database rather than taken from
 * it — the content row's own `stage` is what decides. A cue that carries no
 * stage, or a different one, records null: the block still says which stage was
 * intended, and `cue_match` says which rung actually fired.
 *
 * NULL ON ANY DOUBT. A missing block, a missing op code, a cue id that does not
 * resolve, a read that fails — all of them mean "we cannot say", and a column
 * somebody later reads as a measurement must not hold a guess.
 */
async function servedStage(
  supabase: ServiceClient,
  cueId: string | null | undefined,
  block: { opCode: string | null; stage: string } | null
): Promise<string | null> {
  if (!block?.opCode || !block.stage || !cueId) return null;

  const { data, error } = await supabase
    .from("content")
    .select("stage")
    .eq("id", cueId)
    .maybeSingle();
  if (error || !data) return null;

  return data.stage === block.stage ? block.stage : null;
}

async function readBalance(supabase: ServiceClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("sand_dollar_balance")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return Number(data?.balance ?? 0);
}

/** The unchanged state to return when the day was already completed. */
async function currentState(
  supabase: ServiceClient,
  userId: string,
  today: IsoDate,
  alreadyComplete: boolean
): Promise<CompleteDayResult> {
  const [{ data: swellRow }, balance] = await Promise.all([
    supabase.from("swell").select("*").eq("user_id", userId).maybeSingle(),
    readBalance(supabase, userId),
  ]);

  return {
    alreadyComplete,
    date: today,
    streak: Number(swellRow?.current_len ?? 0),
    longest: Number(swellRow?.longest_len ?? 0),
    paddleOutAvailable: Number(swellRow?.paddle_out_available ?? 0),
    paddleOutSpent: 0,
    paddleOutGranted: 0,
    graceUsed: false,
    streakReset: false,
    sandEarned: 0,
    badgeEarned: null,
    newBalance: balance,
  };
}
