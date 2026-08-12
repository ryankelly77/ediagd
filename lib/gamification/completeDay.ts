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

export type CompleteDayInput = {
  quoteId?: string | null;
  cueId?: string | null;
  videoId?: string | null;
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

  // ---- 2 & 3. Claim the day. The unique index IS the idempotency guard. ---
  const { data: completion, error: completionError } = await supabase
    .from("daily_completion")
    .insert({
      user_id: userId,
      rooftop_id: rooftopId,
      completion_date: today,
      quote_content_id: content.quoteId ?? null,
      cue_content_id: content.cueId ?? null,
      video_content_id: content.videoId ?? null,
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
