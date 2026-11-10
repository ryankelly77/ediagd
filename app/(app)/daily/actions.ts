"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mintWatchTicket } from "@/lib/watch-ticket";
import { storeToday } from "@/lib/mapping/epoch";
import { createServiceClient } from "@/lib/supabase/service";
import { recordGateMet } from "@/lib/watch-gate";
import { chooseRooftop } from "@/lib/rooftop-choice";
import type { IsoDate } from "@/lib/gamification/streak";
import {
  completeDay,
  type CompleteDayError,
  type CompleteDayInput,
  type CompleteDayResult,
} from "@/lib/gamification/completeDay";

export type CompleteDayActionResult =
  | { ok: true; result: CompleteDayResult }
  | {
      ok: false;
      error: string;
      /**
       * WHICH KIND OF FAILURE, AS A VALUE.
       *
       * The screen has to tell two things apart that used to look identical:
       * a failure a retry can fix, and a `day.gate` refusal, which no retry can
       * ever fix because nothing about posting again makes an unwatched film
       * watched. The old screen offered "Try again" for both — and for the
       * refusal it was a `router.refresh()` against an error held in client
       * state, so it changed nothing on screen and could not have helped if it
       * had. Matching on the sentence would work until somebody improved the
       * wording, so the stage travels.
       */
      stage?: string;
      /** On a gate refusal: the legs the server says are still outstanding. */
      outstanding?: string[];
    };

/**
 * The daily loop's entry point for the UI.
 *
 * SECURITY: the user id and rooftop are resolved from the SESSION, never taken
 * as arguments. Server Actions are reachable by direct POST, so accepting a
 * caller-supplied userId would let anyone complete days — and mint Sand Dollars
 * — on someone else's account. Only the content ids come from the client, and
 * those are just provenance on the completion row.
 */
export async function completeDayAction(
  content: CompleteDayInput = {}
): Promise<CompleteDayActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You need to sign in." };

  // Which rooftop's day is this? Prefer an advisor membership, else any active
  // one — the rooftop decides the timezone, so it must be a real membership.
  const { data: memberships, error: membershipError } = await supabase
    .from("membership")
    .select("rooftop_id, role")
    .eq("user_id", user.id)
    .eq("active", true);

  if (membershipError) return { ok: false, error: membershipError.message };
  if (!memberships || memberships.length === 0) {
    return { ok: false, error: "No active membership found for this account." };
  }

  /*
   * ---- THE TECHNICIAN FALLBACK, RECONCILED --------------------------------
   *
   * This used to read
   *
   *     advisor ?? technician ?? memberships[0]
   *
   * which meant a technician-only account could complete a day: write a
   * daily_completion row, start a streak, and mint Sand Dollars for a ritual
   * that does not exist for them. Nobody decided that — it was a fallback
   * reaching for the next role in a list.
   *
   * There is now one deliberate path. The technician screen has no completion
   * button (see TechnicianDay), and this refuses by name if anything ever posts
   * here anyway. When technicians get a daily contract, the refusal is the one
   * place that has to change, and it will be obvious.
   *
   * MIXED ACCOUNTS ARE UNAFFECTED: an advisor who is also a technician matches
   * the first arm and completes days exactly as before.
   */
  const roles = new Set(memberships.map((m) => m.role as string));
  if (roles.has("technician") && !roles.has("advisor")) {
    return {
      ok: false,
      error:
        "Technician accounts don't have a daily loop to complete yet — your training is on the Today screen.",
    };
  }

  /* THE CHOOSER NOW LIVES IN lib/, because it was also written out longhand in
     completeLibraryItem — as an unordered `limit(1)` with no role preference at
     all, which stamped a manager-advisor's library completions at whichever
     rooftop Postgres happened to return. Same question, two answers, nothing
     comparing them. The `memberships[0]` fallback here had its own smaller
     version of the hole: no ORDER BY, so two reads need not agree.

     The technician refusal above stays here. It is a statement about who has a
     daily loop to complete, not about which rooftop owns the record. */
  const chosenRooftop = chooseRooftop(
    memberships as { rooftop_id: string; role: string }[]
  );
  if (!chosenRooftop) {
    return { ok: false, error: "No active membership found for this account." };
  }

  try {
    const result = await completeDay(
      user.id,
      chosenRooftop,
      content
    );
    revalidatePath("/advisor");
    /*
     * ---- AND THE SHELL, BECAUSE THE STREAK NOW LIVES IN IT ----------------
     *
     * The header's streak chip is rendered by the (app) layout, not by any
     * page, and revalidatePath("/advisor") only invalidates that one route's
     * page segment. Completing the day is the single moment the number
     * changes, and /today is immersive — the header is hidden while the loop
     * runs — so the very first time an advisor sees the chip after finishing
     * is the navigation OUT of the loop. Without this it would still read
     * yesterday's number until something else forced a fresh render, which is
     * the one moment the 0 -> 1 flip was supposed to be worth watching.
     *
     * "layout" from the root invalidates every nested route, which is heavier
     * than a page revalidation and is the right weight for a value printed on
     * every screen in the app. It fires once a day, per advisor.
     */
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (error) {
    const e = error as Partial<CompleteDayError> & Error;
    return {
      ok: false,
      error: e.message,
      stage: typeof e.stage === "string" ? e.stage : undefined,
      outstanding: Array.isArray(e.outstanding) ? e.outstanding : undefined,
    };
  }
}

/**
 * Mint a watch ticket for one video, at the moment its player is opened.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS AN ACTION AND NOT A PROP
 * ---------------------------------------------------------------------------
 * A ticket minted when the page rendered says when the PAGE opened. That is a
 * fact about the page and almost nothing about the video: open the day at 7:00,
 * do nothing, and at 7:05 claim a full watch of a three-minute video — five
 * minutes had passed, so the old check passed. The stamp has to be made when
 * there is something to watch, and only the client knows when that is.
 *
 * SECURITY: the user and the store-local date are resolved from the SESSION.
 * `contentId` is the only thing taken from the caller, and it is not trusted to
 * mean anything on its own — completeDay will only accept a ticket whose
 * content id matches the day stamp, so minting one for a video that was never
 * served buys nothing.
 *
 * NEVER THROWS INTO THE PLAYER. A failure returns null and the caller releases
 * the gate the same way it does for a broken video: nobody is held behind our
 * own machinery.
 */
export async function openWatchTicketAction(
  contentId: string | null
): Promise<{ ticket: string | null }> {
  try {
    if (!contentId) return { ticket: null };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ticket: null };

    const { data: membership } = await supabase
      .from("membership")
      .select("rooftop_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    const rooftopId = membership?.rooftop_id as string | undefined;
    if (!rooftopId) return { ticket: null };

    const { data: todayRaw } = await supabase.rpc("rooftop_today", {
      _rooftop: rooftopId,
    });
    const today = (todayRaw as string | null) ?? storeToday();

    return { ticket: mintWatchTicket(user.id, contentId, today) };
  } catch {
    return { ticket: null };
  }
}

/**
 * Write down that a watch gate opened, so a refresh does not shut it again.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The gate's contract is that it never resets once met for the day, and a
 * reload broke it: coverage is a ref and a gated player starts at zero, so
 * refreshing /today asked an advisor who had just watched the whole video to
 * watch it again. Neither of those two properties may be relaxed — they are the
 * anti-assembly rule and the scrub-lockout fix — so the FACT is persisted
 * instead of the position. See lib/watch-gate.ts.
 *
 * SECURITY: user and rooftop come from the SESSION, and the store-local date
 * from the rooftop, never from the caller. What the caller supplies is the
 * content id, the measured percentage and the ticket — and none of the three is
 * trusted on its own: the ticket has to be signed for this user, this video and
 * this day, and enough wall clock has to have passed since it was minted for
 * the video to have played. A claim that fails either is not written.
 *
 * NEVER THROWS AND NEVER BLOCKS. It returns a flag the caller ignores. Somebody
 * standing in front of a video they have just watched must not meet an error
 * because our clock disagreed; they keep the gate they earned in this session
 * and finish the day. What a refused claim loses is only its persistence.
 */
export async function recordGateMetAction(input: {
  contentId: string | null;
  pct: number | null;
  watchError: boolean;
  ticket: string | null;
}): Promise<{ persisted: boolean }> {
  try {
    if (!input.contentId) return { persisted: false };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { persisted: false };

    const { data: memberships } = await supabase
      .from("membership")
      .select("rooftop_id, role")
      .eq("user_id", user.id)
      .eq("active", true);

    /*
     * THE SAME PREFERENCE ORDER completeDayAction USES — and now that is a
     * fact rather than a claim.
     *
     * The comment here already said this, and it was wrong: the order was
     * `advisor ?? technician ?? [0]` while completeDayAction used
     * `advisor ?? manager ?? [0]`. For a technician-and-manager account the
     * watch gate was filed at the technician rooftop and the day completed at
     * the manager one — two different store days, so a gate met this evening
     * could belong to a date the completion never asks about. A comment
     * asserting an invariant that the code does not hold is worse than no
     * comment: it tells the next reader not to check.
     *
     * Found by following the library-path chooser out to every other site that
     * asks "which rooftop". chooseRooftop keeps a technician arm precisely so
     * adopting it here is a no-op for everyone except that one shape, where it
     * is the fix.
     */
    const rooftopId =
      chooseRooftop((memberships ?? []) as { rooftop_id: string; role: string }[]) ??
      undefined;
    if (!rooftopId) return { persisted: false };

    const { data: todayRaw } = await supabase.rpc("rooftop_today", {
      _rooftop: rooftopId,
    });
    const today = ((todayRaw as string | null) ?? storeToday()) as IsoDate;

    /*
     * The SERVICE client writes. 0086 gives watch_gate no insert policy on
     * purpose — a row here opens a gate, and an advisor who could write their
     * own would open every gate in the app from a console.
     */
    const outcome = await recordGateMet(createServiceClient(), {
      userId: user.id,
      rooftopId,
      contentId: input.contentId,
      storeDate: today,
      pct: input.pct,
      watchError: input.watchError,
      ticket: input.ticket,
    });

    return { persisted: outcome.persisted };
  } catch {
    return { persisted: false };
  }
}
