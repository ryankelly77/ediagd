"use server";

/* ============================================================================
   EDIAGD — writes from the content detail screen

   Server Functions are reachable by direct POST, so each re-checks admin rather
   than trusting the page that rendered the form. The RLS policy on `content` is
   the second line.

   THERE IS NO DELETE IN HERE. Retiring is the only way to remove something from
   the library, and it is a column, not a DELETE — see retireContent().
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/guards";

export type DetailResult = { ok: true } | { ok: false; error: string };

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

export type DetailDraft = {
  title: string;
  voice: string | null;
  collection: string | null;
  op_code: string | null;
  stage: string | null;
  type: string;
  body: string | null;
};

/**
 * Save the editable half of the screen.
 *
 * The Mux fields, version, filenames and structure are NOT here — they are
 * written by ingest and the webhook, and a form that could overwrite an asset
 * id would let a typo unplayable a video that is fine.
 */
export async function saveDetail(id: string, draft: DetailDraft): Promise<DetailResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const title = clean(draft.title);
  if (!title) return { ok: false, error: "Title is required." };

  /*
   * The same two rules the database enforces, checked here so the admin gets a
   * sentence instead of a constraint name. The DB is still the boundary — this
   * is a courtesy, and 0063 is what actually stops a bad row.
   */
  if (draft.collection === "Pitches by Op Code" && !draft.op_code) {
    return { ok: false, error: "A pitch needs an op code — that is what the collection is organised by." };
  }
  if (!draft.op_code && draft.stage) {
    return { ok: false, error: "A stage only means something with an op code set." };
  }

  const { error: writeError } = await ctx.supabase
    .from("content")
    .update({
      title,
      voice: clean(draft.voice),
      collection: draft.collection,
      op_code: draft.op_code,
      // Stage travels with the op code or not at all.
      stage: draft.op_code ? draft.stage : null,
      type: draft.type,
      body: clean(draft.body),
    })
    .eq("id", id);
  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath(`/admin/content/item/${id}`);
  revalidatePath("/admin/content");
  return { ok: true };
}

/** Publish or unpublish. Separate from save so it reads as its own decision. */
export async function setPublished(id: string, published: boolean): Promise<DetailResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const { error: writeError } = await ctx.supabase
    .from("content")
    .update({ status: published ? "published" : "draft" })
    .eq("id", id);
  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath(`/admin/content/item/${id}`);
  revalidatePath("/admin/content");
  return { ok: true };
}

/**
 * Retire — the replacement for Delete, and not a soft rename of it.
 *
 * A hard delete on this table cascades `content_progress`, `saved_content` and
 * `content_review`, and is refused outright by `daily_completion` — so the old
 * button either destroyed somebody's saves and an open review item, or threw a
 * foreign-key error at the admin. Neither is a way to tidy a library.
 *
 * Retiring sets a date and unpublishes. Every foreign key survives: lesson
 * credit, saves, view history and completed-day records all still point at a
 * row that still exists. It is reversible by clearing the date.
 */
export async function retireContent(id: string, retire: boolean): Promise<DetailResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const { error: writeError } = await ctx.supabase
    .from("content")
    .update(
      retire
        ? { retired_at: new Date().toISOString(), status: "draft" }
        : { retired_at: null }
    )
    .eq("id", id);
  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath(`/admin/content/item/${id}`);
  revalidatePath("/admin/content");
  return { ok: true };
}

/**
 * Make an older take the live one.
 *
 * SWAPS THE POINTER, DELETES NOTHING. The Mux assets for every version stay
 * where they are — a restore has to be undoable, and re-shooting is expensive
 * while Mux storage is not. The row being restored loses its superseded date;
 * the one being replaced gains one.
 */
export async function restoreVersion(id: string, version: number): Promise<DetailResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const { data: target } = await ctx.supabase
    .from("content_version")
    .select("version, mux_asset_id, mux_playback_id, vertical_playback_id, source_filename")
    .eq("content_id", id)
    .eq("version", version)
    .maybeSingle();
  if (!target) return { ok: false, error: `No version ${version} on record.` };
  if (!target.mux_playback_id) {
    return { ok: false, error: `Version ${version} has no playable asset to restore.` };
  }

  const { data: current } = await ctx.supabase
    .from("content")
    .select("version")
    .eq("id", id)
    .maybeSingle();

  const { error: writeError } = await ctx.supabase
    .from("content")
    .update({
      version: target.version,
      mux_asset_id: target.mux_asset_id,
      mux_playback_id: target.mux_playback_id,
      vertical_playback_id: target.vertical_playback_id,
      source_filename: target.source_filename,
    })
    .eq("id", id);
  if (writeError) return { ok: false, error: writeError.message };

  // The restored one is live again; the one it displaced is now history.
  await ctx.supabase
    .from("content_version")
    .update({ superseded_at: null })
    .eq("content_id", id)
    .eq("version", target.version);
  if (current?.version && current.version !== target.version) {
    await ctx.supabase
      .from("content_version")
      .update({ superseded_at: new Date().toISOString() })
      .eq("content_id", id)
      .eq("version", current.version);
  }

  revalidatePath(`/admin/content/item/${id}`);
  return { ok: true };
}

/**
 * Link this row to another format of the same idea, or unlink it.
 *
 * One idea, one item, however many formats: a quote and the video of Mitch
 * saying it are not two library entries. The pointer goes on the row being
 * linked, so the text row stays the primary and the video hangs off it.
 */
export async function linkArtifact(id: string, targetId: string | null): Promise<DetailResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };
  if (targetId === id) return { ok: false, error: "An item cannot be its own twin." };

  const { error: writeError } = await ctx.supabase
    .from("content")
    .update({ artifact_id: targetId })
    .eq("id", id);
  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath(`/admin/content/item/${id}`);
  return { ok: true };
}

/** Search candidates to link to — the other format of this idea. */
export async function searchLinkTargets(
  q: string,
  excludeId: string
): Promise<{ id: string; title: string; format: string | null; voice: string | null }[]> {
  const { ctx } = await requireAdmin();
  if (!ctx || q.trim().length < 2) return [];

  const { data } = await ctx.supabase
    .from("content")
    .select("id, title, format, voice, body")
    .neq("id", excludeId)
    .is("retired_at", null)
    .or(`title.ilike.%${q}%,body.ilike.%${q}%,voice.ilike.%${q}%`)
    .limit(12);

  return (data ?? []) as { id: string; title: string; format: string | null; voice: string | null }[];
}
