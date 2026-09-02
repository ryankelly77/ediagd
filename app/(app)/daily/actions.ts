"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mintWatchTicket } from "@/lib/watch-ticket";
import { storeToday } from "@/lib/mapping/epoch";
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
