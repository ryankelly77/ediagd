/* ============================================================================
   EDIAGD — the met gate, written down
   SERVER ONLY.

   ---------------------------------------------------------------------------
   WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
   ---------------------------------------------------------------------------
   The gate's contract is that it never resets once it has been met for the day.
   Inside a tab that was already true; across a reload it was not, because
   coverage lives in a ref and a gated player starts at zero.

   Both of those stay. Session-only coverage is what stops a watch being
   assembled out of five-second visits across a week, and start-at-zero is the
   fix for the scrub lockout, where a stored resume point pinned the playhead
   four seconds from the end forever.

   So the position is not stored and the coverage is not stored. What is stored
   is one fact — this gate was met, for this video, on this store-local day —
   and the percentage that met it, because a completion that happens after a
   reload has to be able to record a real number rather than a shrug.

   ---------------------------------------------------------------------------
   THE WRITE IS SERVER-SIDE AND CHECKED
   ---------------------------------------------------------------------------
   A row here opens a gate, so it is written through the service client and only
   after the two checks a completion makes: the ticket's signature, and the wall
   clock since that ticket was minted. See 0086 for why the browser has no
   insert policy at all.
   ============================================================================ */

import "server-only";
import { gateMetIsPlausible } from "@/lib/watch-coverage";
import { readWatchTicket } from "@/lib/watch-ticket";
import type { IsoDate } from "@/lib/gamification/streak";

/*
 * Structural, matching lib/daily.ts. These helpers only ever call `from`, and
 * they are handed both the request-scoped client (which reads through RLS) and
 * the service client (which writes past it) — naming the full SupabaseClient
 * here would make the two incompatible for no gain.
 */
type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** A gate already met today. */
export type GateRecord = {
  /** Coverage when it opened, or null when the failure valve opened it. */
  pct: number | null;
  /** Opened because the player broke, not because the video was watched. */
  error: boolean;
};

export type RecordGateMetOutcome =
  | { persisted: true }
  | { persisted: false; reason: string };

/**
 * One gate: has this advisor met it for this video, on this store-local day?
 *
 * Called per video rather than once per day. Both callers — shapeVideo, which
 * dresses one row at a time, and verifyWatch, which asks about one step — have
 * a single content id in hand, and /today serves at most two gated videos. A
 * batched variant is worth writing when the pitch library makes that false.
 */
export async function readGate(
  client: Client,
  userId: string,
  contentId: string,
  storeDate: IsoDate
): Promise<GateRecord | null> {
  const { data } = await client
    .from("watch_gate")
    .select("watched_pct, watch_error")
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .eq("store_date", storeDate)
    .maybeSingle();

  if (!data) return null;
  return {
    pct: data.watched_pct == null ? null : Number(data.watched_pct),
    error: Boolean(data.watch_error),
  };
}

/**
 * Write down that a gate opened, if the claim survives the same checks a
 * completion would make.
 *
 * ---------------------------------------------------------------------------
 * TWO WAYS A GATE OPENS, AND THEY ARE CHECKED DIFFERENTLY
 * ---------------------------------------------------------------------------
 * BY WATCHING. A ticket is required and the wall clock has to allow it. The
 * ticket proves the claim belongs to this viewer, this video and this day; the
 * clock proves that enough time has passed since the player opened for the
 * video to have played. Neither is skippable.
 *
 * BY FAILING. The 20-second valve releases a gate when the player never
 * produces a frame, and there is no ticket to check because there was nothing
 * to watch. That is recorded as-is, with a null percentage and watch_error set.
 *
 * Recording an unverified failure claim gives a forger nothing: the client
 * already controls its own gate within the session, so this buys no access it
 * did not have, and what it writes is a day marked as having had a broken
 * player with no watch credited. The cost of claiming it is losing the credit.
 *
 * ---------------------------------------------------------------------------
 * A REFUSAL IS QUIET
 * ---------------------------------------------------------------------------
 * The caller does not surface it. Somebody sitting in front of a video they
 * have genuinely just watched must not be shown an error because our clock
 * disagreed — they keep their local gate and finish the day. What they lose is
 * the persistence: refresh, and the gate is shut again. That is the honest
 * outcome of a claim we could not stand behind.
 */
export async function recordGateMet(
  service: Client,
  args: {
    userId: string;
    rooftopId: string;
    contentId: string;
    storeDate: IsoDate;
    pct: number | null;
    watchError: boolean;
    ticket: string | null;
  }
): Promise<RecordGateMetOutcome> {
  const { userId, rooftopId, contentId, storeDate, watchError, ticket } = args;

  let pct = args.pct;

  if (watchError) {
    /* The valve fired. There is no measurement and no ticket to check. */
    pct = null;
  } else {
    /* Authoritative duration — never the client's. A forgery that could declare
       the video four seconds long would satisfy its own check, and it also sets
       the ticket's TTL, so both halves read the same number. */
    const { data: row } = await service
      .from("content")
      .select("duration_sec")
      .eq("id", contentId)
      .maybeSingle();
    const durationSec = row?.duration_sec == null ? null : Number(row.duration_sec);

    const check = readWatchTicket(ticket, userId, contentId, storeDate, durationSec);
    if (!check.ok) return { persisted: false, reason: check.reason };

    if (!gateMetIsPlausible(durationSec, check.elapsedSec)) {
      return {
        persisted: false,
        reason: `met claimed ${Math.round(check.elapsedSec)}s after the player opened, ` +
          `which is less time than the video runs`,
      };
    }

    if (pct == null || !Number.isFinite(pct)) {
      return { persisted: false, reason: "no percentage to record" };
    }
    pct = Math.round(Math.max(0, Math.min(100, pct)) * 100) / 100;
  }

  /*
   * UPSERT, NOT INSERT. Rewatching is allowed and changes nothing, so a second
   * claim for a gate already open must not raise a 23505 into a screen. The
   * conflict target is the natural key from 0086.
   */
  const { error } = await service
    .from("watch_gate")
    .upsert(
      {
        user_id: userId,
        rooftop_id: rooftopId,
        content_id: contentId,
        store_date: storeDate,
        watched_pct: pct,
        watch_error: watchError,
      },
      { onConflict: "user_id,content_id,store_date" }
    );

  if (error) return { persisted: false, reason: error.message };
  return { persisted: true };
}
