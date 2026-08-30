"use server";

/* ============================================================================
   EDIAGD — keeping a quote

   A save is the one piece of content data that belongs entirely to the advisor.
   It is not progress, not coaching, not a number anybody reports on. Nobody but
   its owner ever reads it — see the policy in 0059, which has no manager or
   admin read at all, deliberately.

   THE ACTION TAKES NO USER ID. A server action is reachable by direct POST, so
   a userId parameter would be a "save to anyone's list" endpoint. The user comes
   from the session, every time.

   It runs through the USER's client rather than the service role, so the row
   level policy is doing the work rather than being bypassed. That is the point
   of having written it.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: string };

/**
 * Toggle whether the signed-in advisor has kept a piece of content.
 *
 * Idempotent in both directions: saving a saved item reports it saved rather
 * than erroring on the unique constraint, so a double tap on a slow connection
 * cannot leave the heart disagreeing with the database.
 */
export async function toggleSaveAction(contentId: string): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // The rooftop is resolved here rather than passed in, for the same reason the
  // user is: it is part of what the row asserts, so the browser does not get to
  // choose it. The policy checks the membership too — this just picks which of
  // several a multi-rooftop user files under.
  const { data: memberships } = await supabase
    .from("membership")
    .select("rooftop_id, role")
    .eq("user_id", user.id)
    .eq("active", true);

  const membership =
    memberships?.find((m) => m.role === "advisor") ?? memberships?.[0];
  if (!membership) return { ok: false, error: "No active membership." };

  const { data: existing } = await supabase
    .from("saved_content")
    .select("id")
    .eq("user_id", user.id)
    .eq("content_id", contentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("saved_content").delete().eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/today");
    revalidatePath("/saved");
    return { ok: true, saved: false };
  }

  const { error } = await supabase.from("saved_content").insert({
    user_id: user.id,
    rooftop_id: membership.rooftop_id,
    content_id: contentId,
  });
  // 23505: someone tapped twice and the first insert won. That is the state the
  // caller asked for, so it is a success, not an error.
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/saved");
  return { ok: true, saved: true };
}
