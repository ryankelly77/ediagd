"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
