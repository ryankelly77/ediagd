"use server";

/* ============================================================================
   EDIAGD — answering a duplicate

   Three answers, and each one is final on confirm. No batch submit: Mitch is
   reviewing from his phone between other things, and a queue that only saves
   when you reach the bottom is a queue that loses an afternoon's work to a
   locked screen.

   ---------------------------------------------------------------------------
   THE GUARDS ARE HERE, NOT IN THE CARD
   ---------------------------------------------------------------------------
   Server Functions are reachable by direct POST, so the card's disabled button
   is a courtesy and this file is the rule. Every check the script makes is made
   again here against rows read fresh, because the card was rendered from a
   query that ran when the page loaded and may be minutes old.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/guards";

export type DuplicateResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.userId) return { ctx: null, error: "You need to sign in." };
  if (!ctx.hasAdminAccess) return { ctx: null, error: "Admins only." };
  return { ctx, error: null };
}

/** 'both' absorbs everything, so an idea keeps its reach when a twin retires. */
function unionSlot(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return "both";
}

function done() {
  revalidatePath("/admin/content/review");
  revalidatePath("/admin/content");
}

/**
 * Keep the chosen rows, retire the rest.
 *
 * `keepIds` is a list rather than one id because of the group-10 shape: a
 * passage containing two distinct lines is answered by keeping BOTH lines and
 * retiring the passage, which is one decision and has to be one write.
 */
export async function resolveDuplicate(
  groupId: string,
  keepIds: string[]
): Promise<DuplicateResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };
  if (keepIds.length === 0) return { ok: false, error: "Keep at least one." };

  const { data: members } = await ctx.supabase
    .from("quote_duplicate_member")
    .select("content_id")
    .eq("group_id", groupId);
  const all = ((members ?? []) as { content_id: string }[]).map((m) => m.content_id);
  if (all.length === 0) return { ok: false, error: "That group is gone." };

  const unknown = keepIds.find((k) => !all.includes(k));
  if (unknown) return { ok: false, error: "That row is not in this group." };

  const retireIds = all.filter((id) => !keepIds.includes(id));
  if (retireIds.length === 0) {
    // Keeping everything is a different answer with a different meaning — it
    // has to suppress the pairs, or the scan puts the group straight back.
    return { ok: false, error: 'Use "They are different" to keep them all.' };
  }

  const { data: rows } = await ctx.supabase
    .from("content")
    .select("id, quote_key, voice, quote_slot, retired_at")
    .in("id", all);
  const byId = new Map(
    ((rows ?? []) as Record<string, unknown>[]).map((r) => [r.id as string, r])
  );

  /* ---- A linked row never retires --------------------------------------- */
  const { data: links } = await ctx.supabase
    .from("content")
    .select("id, title, artifact_id")
    .in("artifact_id", all);
  const inbound = new Map<string, { id: string; title: string }[]>();
  ((links ?? []) as { id: string; title: string; artifact_id: string }[]).forEach((v) => {
    const l = inbound.get(v.artifact_id) ?? [];
    l.push({ id: v.id, title: v.title });
    inbound.set(v.artifact_id, l);
  });

  const survivor = keepIds[0];

  /*
   * REFUSE, DO NOT QUIETLY REPOINT.
   *
   * The brief says both "refuse to retire a linked row" and "repoint inbound
   * artifact_id to the survivor", and those pull against each other. The
   * acceptance test settles it: the control on a linked row is DISABLED with a
   * reason, which only means anything if choosing around it is refused too.
   *
   * The reason it should be refused rather than handled: repointing decides,
   * on Mitch's behalf, that the video is a filming of the surviving row. It
   * might not be — the video was matched to those exact words — and the
   * cheapest way to find out is to make him move the link himself on the
   * detail screen, where he can see the video. Retiring the loser afterwards
   * then works with no special case.
   */
  for (const id of retireIds) {
    const pointed = inbound.get(id) ?? [];
    if (pointed.length > 0) {
      const key = (byId.get(id)?.quote_key as string) ?? "That quote";
      return {
        ok: false,
        error:
          `${key} is what "${pointed[0].title}" points at. Move that link first, ` +
          `then this one can retire.`,
      };
    }
  }

  /* ---- Slot membership follows the idea ---------------------------------- */
  let slot: string | null = (byId.get(survivor)?.quote_slot as string) ?? null;
  retireIds.forEach((id) => {
    slot = unionSlot(slot, (byId.get(id)?.quote_slot as string) ?? null);
  });
  if (slot !== ((byId.get(survivor)?.quote_slot as string) ?? null)) {
    await ctx.supabase.from("content").update({ quote_slot: slot }).eq("id", survivor);
  }

  /* ---- Retire ------------------------------------------------------------ */
  const now = new Date().toISOString();
  for (const id of retireIds) {
    if (byId.get(id)?.retired_at) continue; // idempotent
    const { error: e } = await ctx.supabase
      .from("content")
      .update({ retired_at: now, status: "draft" })
      .eq("id", id);
    if (e) return { ok: false, error: e.message };
  }

  await ctx.supabase
    .from("quote_duplicate_group")
    .update({ status: "resolved", resolved_at: now, resolved_by: ctx.userId })
    .eq("id", groupId);

  done();
  return { ok: true };
}

/**
 * "These are not the same thing."
 *
 * Suppresses every pair in the group so no future scan resurfaces it. This is
 * the piece the spreadsheet flow never had: without it, a pair a person has
 * already ruled on comes back the next time the report runs, and a queue that
 * refills itself with answered questions is one people stop opening.
 */
export async function keepAllInDuplicate(groupId: string): Promise<DuplicateResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const { data: group } = await ctx.supabase
    .from("quote_duplicate_group")
    .select("relation, quote_duplicate_member(content_id)")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { ok: false, error: "That group is gone." };

  const ids = ((group.quote_duplicate_member ?? []) as { content_id: string }[])
    .map((m) => m.content_id);

  const pairs: { a_id: string; b_id: string; relation: string; created_by: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      // a_id < b_id is a table constraint, not a convention — the same ruling
      // stored under two orderings is a ruling neither lookup finds.
      const [a, b] = [ids[i], ids[j]].sort();
      pairs.push({
        a_id: a,
        b_id: b,
        relation: (group.relation as string) ?? "",
        created_by: ctx.userId!,
      });
    }
  }

  if (pairs.length) {
    const { error: e } = await ctx.supabase
      .from("quote_duplicate_suppression")
      .upsert(pairs, { onConflict: "a_id,b_id,relation" });
    if (e) return { ok: false, error: e.message };
  }

  const { error: gErr } = await ctx.supabase
    .from("quote_duplicate_group")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.userId,
    })
    .eq("id", groupId);
  if (gErr) return { ok: false, error: gErr.message };

  done();
  return { ok: true };
}

/**
 * Create a sentence out of a retiring passage as a quote of its own.
 *
 * For the group-10 shape, where the passage holds a line that never had a row.
 * Voice is inherited rather than asked for: it is the same person speaking, and
 * a free-text voice field on this card is how a second spelling of a name gets
 * into the library.
 */
export async function createQuoteFromLine(
  groupId: string,
  sourceContentId: string,
  text: string
): Promise<DuplicateResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const body = text.trim();
  if (!body) return { ok: false, error: "Nothing to create." };

  const { data: source } = await ctx.supabase
    .from("content")
    .select("voice, title, quote_slot, type, format, entitlement, collection")
    .eq("id", sourceContentId)
    .maybeSingle();
  if (!source) return { ok: false, error: "The row it came from is gone." };

  const { data: created, error: insErr } = await ctx.supabase
    .from("content")
    .insert({
      type: source.type,
      format: source.format,
      title: source.title,
      body,
      voice: source.voice,
      quote_slot: source.quote_slot,
      entitlement: source.entitlement,
      collection: source.collection,
      // Draft on purpose. It is a new quote nobody has read in isolation yet,
      // and publishing it from a review card would put untested words into
      // tomorrow's loop.
      status: "draft",
      source: "Split from a duplicate passage",
    })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  // Joins the group as a proposed survivor so the same card can keep it.
  await ctx.supabase.from("quote_duplicate_member").insert({
    group_id: groupId,
    content_id: created.id,
    proposed: "survive",
    unretirable: false,
  });

  done();
  return { ok: true };
}
