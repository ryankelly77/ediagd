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

/* ---- Publishing more than one thing at a time ---------------------------- */

export type BulkPublishResult = {
  ok: boolean;
  published: number;
  /** Refused, with the reason, so the screen can say which and why. */
  held: { id: string; title: string; because: string }[];
  error?: string;
};

/**
 * Publish a set of drafts, refusing any that are not actually playable.
 *
 * ---------------------------------------------------------------------------
 * THE REFUSAL IS THE FEATURE
 * ---------------------------------------------------------------------------
 * The ingest leaves every video as a draft on purpose: a row published before
 * its asset is ready renders a player pointing at nothing, and mid-batch that
 * is a real advisor opening a real screen. A bulk publish that ignored that
 * would undo the one safeguard the pipeline has, seventy-six rows at a time,
 * with one tap.
 *
 * So a video needs a playback id and a duration before it may go live, and a
 * vertical that is present must be ready rather than stale or pending — a
 * stale vertical means the 9:16 was cut from a master that has since been
 * replaced, which is a video a second out of step with itself.
 *
 * Text content has none of those and is published without ceremony.
 *
 * NOTHING IS PUBLISHED SILENTLY THAT WAS NOT ASKED FOR. The ids come from the
 * screen, so the count in the confirm is the count that moves; there is no
 * "publish everything matching this filter", because a filter can quietly widen
 * between the reading of it and the tapping of it.
 */
export async function publishMany(ids: string[]): Promise<BulkPublishResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, published: 0, held: [], error: error! };

  const wanted = [...new Set(ids)].filter(Boolean);
  if (wanted.length === 0) return { ok: true, published: 0, held: [] };

  const { data, error: readError } = await ctx.supabase
    .from("content")
    .select("id, title, type, status, service_family, mux_playback_id, duration_sec, vertical_status")
    .in("id", wanted);
  if (readError) return { ok: false, published: 0, held: [], error: readError.message };

  const rows = (data ?? []) as {
    id: string; title: string; type: string; status: string;
    service_family: string | null; mux_playback_id: string | null;
    duration_sec: number | null; vertical_status: string | null;
  }[];

  const held: BulkPublishResult["held"] = [];
  const ready: string[] = [];
  const services = new Set<string | null>();

  for (const row of rows) {
    if (row.status === "published") continue; // already there; not an error
    const isVideo = row.type.endsWith("_video") || row.type === "joe_the_pro";

    if (isVideo && !row.mux_playback_id) {
      held.push({ id: row.id, title: row.title, because: "no video is attached yet" });
      continue;
    }
    if (isVideo && !row.duration_sec) {
      held.push({ id: row.id, title: row.title, because: "still transcoding — no duration yet" });
      continue;
    }
    if (isVideo && (row.vertical_status === "stale" || row.vertical_status === "failed")) {
      held.push({
        id: row.id, title: row.title,
        because: `its 9:16 is ${row.vertical_status} — rebuild it first`,
      });
      continue;
    }
    ready.push(row.id);
    services.add(row.service_family);
  }

  if (ready.length > 0) {
    const { error: writeError } = await ctx.supabase
      .from("content")
      .update({ status: "published" })
      .in("id", ready);
    if (writeError) {
      return { ok: false, published: 0, held, error: writeError.message };
    }
  }

  for (const service of services) revalidateFor(service);
  revalidatePath("/admin/content");
  return { ok: true, published: ready.length, held };
}
