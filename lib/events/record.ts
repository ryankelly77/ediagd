/* ============================================================================
   EDIAGD — writing a Rollcall event
   SERVER ONLY.

   ---------------------------------------------------------------------------
   FIRE AND FORGET, AND NEVER THROW
   ---------------------------------------------------------------------------
   This is bookkeeping hung off somebody's morning. markActiveToday settled the
   rule already and it is the same one: a missing event costs a tick on an
   admin screen; an exception here costs an advisor the page they came for. So
   every failure is caught, logged, and swallowed.

   The ONE thing that is not swallowed quietly is a missing rooftop — see
   below.

   ---------------------------------------------------------------------------
   THE SERVICE CLIENT, AND THE USER ID NEVER COMES FROM A CALLER'S REQUEST
   ---------------------------------------------------------------------------
   app_event has no insert policy and no insert grant for `authenticated`
   (0163), for the reason 0081 removed daily_activity's self-write policy: a
   person who can write their own attendance can manufacture a record of
   turning up. So the write is the service role's, and every caller resolves
   the user id from the SESSION before getting here. Nothing in this file takes
   an id on trust; it simply has no way to tell, which is why the callers carry
   that rule in their own headers.
   ============================================================================ */

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { storeToday } from "@/lib/mapping/epoch";
import type { AppEventKind, SignInPlatform } from "@/lib/events/kinds";

export type RecordEventInput = {
  /** From the session. Never from a request body. */
  userId: string;
  /**
   * MANDATORY, and a caller that cannot supply one gets a refusal rather than
   * a null.
   *
   * 0163's read policy is `rooftop_id in (select managed_rooftops())`. A row
   * with a null rooftop would be invisible to the gate that selects on it and
   * excluded by nothing — which is 0128's placement NULL exactly: the worst of
   * both, and a count that omits it looks complete. The column is `not null`
   * so the unsafe row cannot be represented; this is where that refusal gets
   * its sentence in the log.
   */
  rooftopId: string | null | undefined;
  kind: AppEventKind;
  /** Polymorphic; the kind names the table. Null where the kind has no target. */
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
  /** Only signed_in sets one. See recordSignIn. */
  dedupKey?: string | null;
};

/**
 * Write one event. Returns nothing and throws nothing.
 *
 * A duplicate on the dedup key (23505) is the EXPECTED outcome of a second
 * sign-in ping in the same store-day and is not logged — logging it would fill
 * the log with the constraint doing its job.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    const { userId, rooftopId, kind } = input;
    if (!userId) {
      console.warn(`[rollcall] ${kind} dropped: no user id`);
      return;
    }
    if (!rooftopId) {
      /*
       * LOUD, because this is the one failure that is not transient. An
       * account with no active membership generates no events at all, and the
       * Rollcall row for that person would read "never opened Certs" when the
       * truth is "we refused to write it". Said out loud so the gap has a
       * cause somebody can find.
       */
      console.warn(
        `[rollcall] ${kind} dropped for user ${userId}: no active rooftop, and app_event.rooftop_id is mandatory`
      );
      return;
    }

    const service = createServiceClient();
    const { error } = await service.from("app_event").insert({
      user_id: userId,
      rooftop_id: rooftopId,
      kind,
      target_id: input.targetId ?? null,
      meta: input.meta ?? null,
      dedup_key: input.dedupKey ?? null,
    });

    /* 23505 on the dedup key is the guard working. Anything else is news. */
    if (error && error.code !== "23505") {
      console.error(`[rollcall] ${kind} insert failed`, {
        userId,
        rooftopId,
        error: error.message,
      });
    }
  } catch (error) {
    console.error(`[rollcall] ${input.kind} threw`, error);
  }
}

/**
 * Record that this person opened the app today, and on what.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT AN ATTENDANCE COUNTER, AND MUST NOT BECOME ONE
 * ---------------------------------------------------------------------------
 * daily_activity already answers "which days did they open the app", and two
 * counters for one fact drift — the one nobody looks at drifts silently, and
 * afterwards there is no way to tell which is right. What daily_activity
 * CANNOT say is which shell the session came from, and that is the only thing
 * Rollcall reads out of this kind: the FIRST `signed_in` carrying platform
 * `ios` is the closest the app can honestly get to a TestFlight install, which
 * is visible per tester in App Store Connect and nowhere the app can reach.
 *
 * The per-store-day dedup key is therefore a cheap guard against a reload
 * loop, not a daily tick. A shell left open across midnight will not write a
 * second row and nothing is wrong with that.
 */
export async function recordSignIn(
  userId: string,
  rooftopId: string | null | undefined,
  platform: SignInPlatform
): Promise<void> {
  if (!userId || !rooftopId) {
    /* recordEvent logs it; call through so there is exactly one place that
       decides what a missing rooftop means. */
    await recordEvent({ userId, rooftopId, kind: "signed_in" });
    return;
  }

  /* THE ROOFTOP'S DATE, the same one markActiveToday uses. A store-day is how
     engagement is counted everywhere else, and keying the dedup on a UTC date
     would give a Hawaii store two sign-ins on one of its evenings. */
  let today: string = storeToday();
  try {
    const service = createServiceClient();
    const { data } = await service.rpc("rooftop_today", { _rooftop: rooftopId });
    if (typeof data === "string" && data.length >= 10) today = data.slice(0, 10);
  } catch {
    /* storeToday() already holds a sensible answer. */
  }

  await recordEvent({
    userId,
    rooftopId,
    kind: "signed_in",
    meta: { platform },
    dedupKey: `${userId}:signed_in:${today}`,
  });
}
