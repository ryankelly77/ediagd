"use server";

/* ============================================================================
   EDIAGD — Good News Story writes

   The advisor's own words, at track exit. 0127 built the record and the RLS;
   this is the only path that writes one.

   ---------------------------------------------------------------------------
   THE USER COMES FROM THE SESSION, NEVER FROM A PARAMETER
   ---------------------------------------------------------------------------
   A server action is reachable by direct POST, so a `userId` argument would be
   a "write a story in anyone's name" endpoint — and this is the one record in
   the product that is supposed to be a person's own words. 0127's insert policy
   refuses it a second time at the database, which is the belt to this braces.

   WRITTEN THROUGH THE USER'S OWN CLIENT, not the service role, for the same
   reason: the RLS is the feature here, and a service-role write would route
   around the thing accept:story exists to prove.

   NOTE: a "use server" module may only export async functions. Types and the
   read side live in lib/story.ts.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StoryResult = { ok: true } | { ok: false; error: string };

/**
 * REJECT EMPTY. NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO CHARACTER MINIMUM, AND THAT IS A DECISION
 * ---------------------------------------------------------------------------
 * A minimum is a proxy for effort and it fails in both directions: somebody
 * types `aaaaaaaaaaaaaaa` and clears it, while somebody genuinely brief and
 * specific — "started opening the hood on every write-up; sold three belts that
 * week" — gets blocked by a product telling them their work was not long
 * enough.
 *
 * IF YOU ARE HERE IN SIX MONTHS ABOUT STORY QUALITY: adding `length < 120` is
 * the obvious move and it is the wrong one. The manager reading the story is
 * the check. That is what the review surface is for, and it is why review
 * records who and when. A character count would replace a person's judgement
 * with a number that measures typing.
 */
function cleaned(body: string): string | null {
  const trimmed = (body ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");
  return { supabase, userId: user.id };
}

/**
 * Write the story for a track, or edit the one already there.
 *
 * ONE FUNCTION FOR BOTH, because the screen is one screen and "submitted" is
 * not a different kind of story. The branch is on whether a live row exists,
 * not on what the caller claims.
 */
export async function submitStory(
  certificationId: string,
  body: string
): Promise<StoryResult> {
  const text = cleaned(body);
  if (!text) return { ok: false, error: "Write a line or two before saving." };

  const { supabase, userId } = await session();

  const { data: membership, error: mErr } = await supabase
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (mErr) return { ok: false, error: mErr.message };
  if (!membership?.rooftop_id) {
    return { ok: false, error: "No active rooftop for this account." };
  }

  const { data: existing, error: readErr } = await supabase
    .from("advisor_story")
    .select("id, body")
    .eq("user_id", userId)
    .eq("certification_id", certificationId)
    .is("retired_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  if (existing) {
    /*
     * AN EDIT KEEPS THE PREVIOUS WORDS. A story that changed after a manager
     * read it is a thing the manager should be able to see, so the old text is
     * filed BEFORE the overwrite — and if that file fails we do not overwrite.
     * Losing the revision silently would make the history a label with nothing
     * behind it.
     */
    if (existing.body !== text) {
      const { error: revErr } = await supabase
        .from("advisor_story_revision")
        .insert({ story_id: existing.id, body: existing.body });
      if (revErr) return { ok: false, error: `keeping the previous version: ${revErr.message}` };
    }

    const { error: upErr } = await supabase
      .from("advisor_story")
      .update({ body: text, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { error: insErr } = await supabase.from("advisor_story").insert({
      user_id: userId,
      rooftop_id: membership.rooftop_id,
      certification_id: certificationId,
      body: text,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/certifications");
  return { ok: true };
}

/**
 * Show it to the rooftop, or stop showing it.
 *
 * Its own action rather than a field on submitStory: sharing is a separate
 * decision from writing, and an advisor who edits their words should not have
 * to re-confirm who can see them.
 */
export async function setStoryShared(
  certificationId: string,
  shared: boolean
): Promise<StoryResult> {
  const { supabase, userId } = await session();

  const { error } = await supabase
    .from("advisor_story")
    .update({ shared_to_team: shared })
    .eq("user_id", userId)
    .eq("certification_id", certificationId)
    .is("retired_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/certifications");
  return { ok: true };
}
