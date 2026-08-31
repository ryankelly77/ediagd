"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/guards";
import {
  isVideoType,
  serviceToSlug,
  type ContentDraft,
  type ContentStatus,
} from "@/lib/content";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Server Functions are reachable by direct POST, not just through our UI, so
 * every one of these re-checks admin rather than trusting the page that
 * rendered the form. RLS (content_admin_all) is the second line of defence.
 */
async function requireAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.userId) return { ctx: null, error: "You need to sign in." };
  if (!ctx.hasAdminAccess) return { ctx: null, error: "Admins only." };
  return { ctx, error: null };
}

function revalidateFor(service: string | null) {
  revalidatePath("/admin/content");
  revalidatePath(`/admin/content/service/${serviceToSlug(service)}`);
}

/** Normalise empty strings to null so we don't litter the table with "". */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function saveContent(draft: ContentDraft): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const title = clean(draft.title);
  if (!title) return { ok: false, error: "Title is required." };

  const isQuote = draft.type === "quote";
  /*
   * A quote with no slot is invisible. Both daily draws filter on
   * quote_slot IN (slot, 'both'), so a null one is never selected by anything
   * — it would sit in the library looking published and never appear. Better
   * to refuse it here than to let someone write a quote nobody ever sees.
   */
  if (isQuote && !draft.quote_slot) {
    return { ok: false, error: "Pick which slot this quote can fill — otherwise it will never be drawn." };
  }

  const payload = {
    type: draft.type,
    service_family: clean(draft.service_family),
    subcategory: clean(draft.subcategory),
    tier: draft.tier,
    make: clean(draft.make),
    model: clean(draft.model),
    year_range: clean(draft.year_range),
    title,
    body: clean(draft.body),
    // Keep the payload honest to the type: only videos carry a URL/duration, so
    // switching a video back to a cue doesn't leave orphaned playback fields.
    video_url: isVideoType(draft.type) ? clean(draft.video_url) : null,
    duration_sec: isVideoType(draft.type) ? draft.duration_sec ?? null : null,
    status: draft.status,
    /*
     * QUOTE FIELDS ARE NULLED FOR EVERY OTHER TYPE, the same way video_url is.
     * Switching a quote to a cue and leaving a voice and a slot behind would
     * put it back in a daily quote draw it no longer belongs in — the row
     * would be a cue by type and a quote by every filter that matters.
     */
    voice: isQuote ? clean(draft.voice) : null,
    quote_slot: isQuote ? draft.quote_slot ?? null : null,
    coaching_nugget: isQuote ? clean(draft.coaching_nugget) : null,
  };

  if (draft.id) {
    const { data, error: updateError } = await ctx.supabase
      .from("content")
      .update(payload)
      .eq("id", draft.id)
      .select("id, service_family")
      .maybeSingle();

    if (updateError) return { ok: false, error: updateError.message };
    if (!data) {
      return {
        ok: false,
        error: "Nothing was updated — the item may have been removed.",
      };
    }
    revalidateFor(payload.service_family);
    revalidatePath(`/admin/content/item/${draft.id}`);
    return { ok: true, id: data.id as string };
  }

  const { data, error: insertError } = await ctx.supabase
    .from("content")
    .insert({ ...payload, created_by: ctx.userId })
    .select("id")
    .maybeSingle();

  if (insertError) return { ok: false, error: insertError.message };
  if (!data) return { ok: false, error: "Could not create the item." };

  revalidateFor(payload.service_family);
  return { ok: true, id: data.id as string };
}

export async function setContentStatus(
  id: string,
  status: ContentStatus
): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const { data, error: updateError } = await ctx.supabase
    .from("content")
    .update({ status })
    .eq("id", id)
    .select("id, service_family")
    .maybeSingle();

  if (updateError) return { ok: false, error: updateError.message };
  if (!data) return { ok: false, error: "That item no longer exists." };

  revalidateFor((data.service_family as string | null) ?? null);
  revalidatePath(`/admin/content/item/${id}`);
  return { ok: true, id: data.id as string };
}

/*
 * deleteContent() REMOVED.
 *
 * A Server Function is reachable by direct POST whether or not a button renders
 * it, so hiding the control was not enough. A hard delete on `content` cascades
 * content_progress, saved_content and content_review, and is refused outright by
 * daily_completion's foreign key — meaning the old action either destroyed an
 * advisor's saves and an open review item, or threw a raw FK error at the admin.
 *
 * Retiring replaces it: app/(app)/admin/content/item/[id]/actions.ts →
 * retireContent(), which sets retired_at, unpublishes, and keeps every foreign
 * key intact.
 */
