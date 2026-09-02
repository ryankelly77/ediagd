/* ============================================================================
   EDIAGD — the coaching block
   SERVER ONLY (takes a Supabase client). The pure parts — the stage list, the
   stage cursor, the op-code choice — are exported separately and have no
   imports, so scripts/coaching-block-scenarios.ts can prove them offline.

   A BLOCK IS WHAT MAKES A STAGE MEAN ANYTHING. `content.stage` has existed
   since 0062 and nothing has ever read it, because "At the Kiosk" is only a
   position if something is tracking where the advisor is in the conversation.
   The block is that cursor: one family, one op code, six stages, in order.
   ============================================================================ */

import { epochDay } from "@/lib/daily";
import type { IsoDate } from "@/lib/gamification/streak";

type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/* ---- The six stages ------------------------------------------------------ */

/**
 * Mitch's six stages of a pitch, IN ORDER. The order is the product: a block
 * walks them start to finish, so this array is a sequence and not a set.
 *
 * Identical to the `content_stage_valid` check in 0062 and the
 * `daily_completion_stage_valid` check in 0067, deliberately spelled the same
 * way in all three places. A stage this list can produce that content cannot be
 * tagged with is a cue nobody can write.
 *
 * ---------------------------------------------------------------------------
 * THE TWO MPI STAGES ARE NOT ABOUT MPI-061
 * ---------------------------------------------------------------------------
 * 'MPI Setup' and 'After-MPI' are positions in EVERY pitch — how you set up the
 * inspection before it happens, and how you sell what it found afterwards. They
 * apply to a brake-fluid conversation exactly as much as to any other.
 *
 * They are NOT coaching about the multi-point inspection itself. MPI-061 is
 * `coachable = false` in op_code_family (0066) precisely because the inspection
 * is the PROCESS that generates every other sale rather than a service sold
 * against a benchmark — it can never be a block's op code. So the picker below
 * never selects MPI-061, and these two stages still fire on every block. Two
 * different things that share a name; keeping them separate is the whole reason
 * this comment exists.
 */
export const STAGES = [
  "Pre-Write",
  "On the Drive",
  "At the Kiosk",
  "MPI Setup",
  "After-MPI",
  "Objections",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Which stage the Nth day of a block serves.
 *
 * ADVANCED BY COMPLETIONS, NOT BY THE CALENDAR. If an advisor misses Tuesday,
 * they should meet Tuesday's stage on Wednesday — the block is a conversation
 * in six parts, not six dated appointments. Counting calendar days would let a
 * weekend swallow 'At the Kiosk' and hand them 'Objections' for a pitch they
 * have not been taught to open yet.
 *
 * The modulo only bites when `coaching_block_days` is set above 6, which would
 * walk the pitch twice rather than run off the end of the list.
 */
export function stageForIndex(completionsInBlock: number): Stage {
  const i = Math.max(0, Math.floor(completionsInBlock));
  return STAGES[i % STAGES.length];
}

/**
 * The op code a block coaches, chosen from its family.
 *
 * DETERMINISTIC, AND IT MOVES BETWEEN BLOCKS. Rotating on the block's start day
 * means a second block on the same family teaches a different code — an advisor
 * weak on Brake Service works brake fluid this block and rotors the next,
 * rather than meeting the same six cues again. Sorted first so the choice does
 * not depend on the order Postgres returned the rows.
 *
 * Returns null when the family has no coachable code, which is a content-map
 * problem and not a crash: the block still exists at family grain and the cue
 * ladder falls to its family rung.
 */
export function opCodeForBlock(
  coachableCodes: string[],
  startedOn: IsoDate
): string | null {
  if (coachableCodes.length === 0) return null;
  const sorted = [...coachableCodes].sort();
  return sorted[epochDay(startedOn) % sorted.length];
}

/* ---- The block row ------------------------------------------------------- */

export type CoachingBlock = {
  id: string;
  family: string;
  opCode: string | null;
  tier: "zero" | "low" | null;
  startedOn: IsoDate;
  lengthDays: number;
  /** Completions already recorded against this block — the stage cursor. */
  served: number;
  stage: Stage;
};

/**
 * The catalog codes in a family that may be coached.
 *
 * `coachable = false` is filtered HERE rather than at the cue query, because a
 * block that locked onto MNU-070 would spend six days coaching a menu bundle —
 * there is no menu attach rate to be below benchmark on, so every stage would
 * be advice about a number that does not exist.
 */
export async function loadCoachableCodes(
  client: Client,
  family: string
): Promise<string[]> {
  const { data, error } = await client
      /*
       * THE LIVE VIEW, NOT THE TABLE (0074). op_code_family is append-only now:
       * an edit retires the old row and inserts a new one, so the table holds
       * every version and a raw read would return two answers for one code the
       * first time somebody edits a mapping. This is a ROUTING reader — it wants
       * today's answer, which is what `_live` means.
       */
    .from("op_code_family_live")
    .select("code")
    .eq("family", family)
    .eq("coachable", true);

  if (error || !data) return [];
  return (data as { code: string }[]).map((r) => r.code);
}

/**
 * The block this advisor is in today, opening one if they are between blocks.
 *
 * ---------------------------------------------------------------------------
 * THIS WRITES, AND IT IS CALLED FROM A PAGE RENDER
 * ---------------------------------------------------------------------------
 * Which is worth being uncomfortable about, so: the write is an INSERT of a row
 * that records which coaching the advisor is being shown, and it has to happen
 * before the page can show it. Deferring it to completeDay() would mean day one
 * of every block renders with no stage and no op code — the block would only
 * exist from the second day onward, which is the one day it matters most.
 *
 * It is safe to call repeatedly: `coaching_block_one_open_idx` (0067) permits
 * exactly one open block per advisor, so two concurrent renders race and the
 * loser re-reads the winner's row rather than opening a second block.
 *
 * NEEDS THE SERVICE CLIENT. 0067 gives coaching_block no user-facing insert
 * policy on purpose — a block decides which coaching someone receives and for
 * how long, and an advisor who could open their own would pick their easiest
 * family. Same posture as the economy tables in 0012.
 */
export async function ensureBlockForToday(
  service: Client,
  userId: string,
  rooftopId: string,
  today: IsoDate,
  /** Eddie's Pick for this advisor, or null when there is nothing to coach. */
  pick: { family: string; tier: "zero" | "low" } | null,
  /** game_settings.coaching_block_days. */
  blockDays: number,
  /**
   * True when the pick came from a part-month. A block MUST NOT be opened from
   * one — see the refusal below. Required rather than optional: a caller that
   * forgets would silently reintroduce the defect, and every caller already
   * knows the answer.
   */
  fromPartialPeriod: boolean
): Promise<CoachingBlock | null> {
  const open = await readOpenBlock(service, userId);

  if (open) {
    /*
     * A FINISHED BLOCK IS CLOSED HERE, NOT WHEN ITS LAST DAY WAS SERVED.
     * Closing it at completion time would need completeDay to know the block's
     * length, and would leave a block open forever if the advisor never came
     * back. Closing it on the next render is idempotent and self-healing.
     */
    if (open.served >= open.lengthDays) {
      await service
        .from("coaching_block")
        .update({ ended_on: today, updated_at: new Date().toISOString() })
        .eq("id", open.id);
    } else {
      return open;
    }
  }

  // Nothing to coach: no volume, or at/above store average everywhere. No
  // block, and the loop says so rather than inventing a focus.
  if (!pick) return null;

  /*
   * ---- A PART-MONTH DOES NOT GET TO CHOOSE SIX DAYS OF COACHING -----------
   *
   * A block is a six-day commitment to one family, and it outlives the arrival
   * of the complete file: locking is the point, so a pick that changes mid-block
   * does not steal it. That is right when the pick was made on a month and wrong
   * when it was made on eight days of one — at Doggett CDJR those eight days
   * average 18 ROs against the previous month's 139, and the ranking between
   * families at that volume is noise.
   *
   * An OPEN block is left alone above, because it was opened from a complete
   * period and finishing it is the correct behaviour. What is refused is
   * starting a new one. The day still renders: the advisor gets the quote, the
   * lifestyle video and the honest no-pick state, which is what they already
   * get when they are at or above store average everywhere.
   */
  if (fromPartialPeriod) return null;

  const codes = await loadCoachableCodes(service, pick.family);
  const opCode = opCodeForBlock(codes, today);

  const { data, error } = await service
    .from("coaching_block")
    .insert({
      user_id: userId,
      rooftop_id: rooftopId,
      family: pick.family,
      op_code: opCode,
      tier: pick.tier,
      started_on: today,
      length_days: blockDays,
    })
    .select("id, family, op_code, tier, started_on, length_days")
    .maybeSingle();

  // 23505 = the partial unique index fired: a concurrent render opened it
  // first. Their row is as good as ours.
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return await readOpenBlock(service, userId);
    }
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    family: data.family as string,
    opCode: (data.op_code as string | null) ?? null,
    tier: (data.tier as "zero" | "low" | null) ?? null,
    startedOn: data.started_on as IsoDate,
    lengthDays: Number(data.length_days),
    served: 0,
    stage: stageForIndex(0),
  };
}

/** The open block and its stage cursor, or null. */
export async function readOpenBlock(
  client: Client,
  userId: string
): Promise<CoachingBlock | null> {
  const { data, error } = await client
    .from("coaching_block")
    .select("id, family, op_code, tier, started_on, length_days")
    .eq("user_id", userId)
    .is("ended_on", null)
    .maybeSingle();

  if (error || !data) return null;

  /*
   * The cursor is a COUNT of completions already credited to this block, so it
   * cannot drift from the record of what was actually served. Deriving it from
   * dates would disagree with the completion rows the moment someone misses a
   * day, and the completion rows are the ones a certification is credited from.
   */
  const { count } = await client
    .from("daily_completion")
    .select("id", { count: "exact", head: true })
    .eq("block_id", data.id);

  const served = Number(count ?? 0);

  return {
    id: data.id as string,
    family: data.family as string,
    opCode: (data.op_code as string | null) ?? null,
    tier: (data.tier as "zero" | "low" | null) ?? null,
    startedOn: data.started_on as IsoDate,
    lengthDays: Number(data.length_days),
    served,
    stage: stageForIndex(served),
  };
}

/** game_settings.coaching_block_days, with the migration's default on failure. */
export async function loadBlockDays(client: Client): Promise<number> {
  const { data } = await client
    .from("game_settings")
    .select("coaching_block_days")
    .limit(1)
    .maybeSingle();
  const n = Number(data?.coaching_block_days ?? 0);
  return n > 0 ? n : STAGES.length;
}
