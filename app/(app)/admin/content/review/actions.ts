"use server";

/* ============================================================================
   EDIAGD — answering a review question

   Each answer does TWO things in one act: it writes the words onto the content
   row, and it closes the question. Making those separate steps is how a queue
   ends up permanently displaying work that is already finished — somebody fixes
   the cue, forgets to tick the box, and the item sits there looking open.

   The closing half is handled by the trigger in 0061 for the three reasons that
   are about words, so this file mostly just saves the edit. `dismiss` is the
   one case with nothing to write: "I looked, it is fine as it stands."
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/guards";

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Server Functions are reachable by direct POST, so admin is re-checked here
 * rather than trusted from the page that rendered the form. The RLS policy on
 * content_review is the second line.
 */
async function requireAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.userId) return { ctx: null, error: "You need to sign in." };
  if (!ctx.hasAdminAccess) return { ctx: null, error: "Admins only." };
  return { ctx, error: null };
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * Write the answer onto the content row.
 *
 * `field` is constrained to the three the queue can ask about. It arrives from
 * a form, so it is checked against a list rather than interpolated — otherwise
 * this is an "update any column on any content row" endpoint.
 */
export async function answerReview(
  contentId: string,
  field: "body" | "coaching_nugget" | "voice",
  value: string
): Promise<ReviewResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  if (!["body", "coaching_nugget", "voice"].includes(field)) {
    return { ok: false, error: "Not a field this queue can change." };
  }
  const text = clean(value);
  if (!text) return { ok: false, error: "Nothing to save." };

  const { error: writeError } = await ctx.supabase
    .from("content")
    .update({ [field]: text })
    .eq("id", contentId);
  if (writeError) return { ok: false, error: writeError.message };

  /*
   * The trigger closes 'truncated', 'pick_ending', 'missing_nugget' and
   * 'needs_op_code' on its own, because those are answered by the words
   * changing. 'attribution' is not — a voice can legitimately already be right,
   * so an unchanged value would mean nothing — and is closed explicitly here.
   */
  if (field === "voice") {
    await ctx.supabase
      .from("content_review")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: ctx.userId })
      .eq("content_id", contentId)
      .eq("reason", "attribution")
      .eq("status", "open");
  }

  revalidatePath("/admin/content/review");
  revalidatePath("/admin/content");
  return { ok: true };
}

/** "I looked at this and it is fine." A real answer, and the queue keeps it. */
export async function dismissReview(reviewId: string): Promise<ReviewResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const { error: writeError } = await ctx.supabase
    .from("content_review")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.userId,
    })
    .eq("id", reviewId);
  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath("/admin/content/review");
  revalidatePath("/admin/content");
  return { ok: true };
}
