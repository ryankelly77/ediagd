"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mintWatchTicket } from "@/lib/watch-ticket";
import { storeToday } from "@/lib/mapping/epoch";
import { createServiceClient } from "@/lib/supabase/service";
import { recordGateMet } from "@/lib/watch-gate";
import type { IsoDate } from "@/lib/gamification/streak";
import {
  completeDay,
  type CompleteDayInput,
  type CompleteDayResult,
} from "@/lib/gamification/completeDay";

export type CompleteDayActionResult =
  | { ok: true; result: CompleteDayResult }
  | { ok: false; error: string };

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

  const chosen =
    memberships.find((m) => m.role === "advisor") ??
    memberships.find((m) => m.role === "technician") ??
    memberships[0];

  try {
    const result = await completeDay(
      user.id,
      chosen.rooftop_id as string,
      content
    );
    revalidatePath("/advisor");
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
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

    /* The same preference order completeDayAction uses, so the day this is
       filed against is the day that will be completed. */
    const chosen =
      memberships?.find((m) => m.role === "advisor") ??
      memberships?.find((m) => m.role === "technician") ??
      memberships?.[0];
    const rooftopId = chosen?.rooftop_id as string | undefined;
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
