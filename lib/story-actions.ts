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

   ---------------------------------------------------------------------------
   THE UI CHECKS ARE NOT THE BOUNDARY. THIS FILE IS
   ---------------------------------------------------------------------------
   Since 8 October the story waits for the lessons (Ryan, 5 October: "I can
   submit my good news story ahead of completing all of the videos. This should
   not be possible."). THREE things enforce that and only one of them counts:

     the track page      locks the row and does not navigate   — courtesy
     the story page      redirects an early arrival            — courtesy
     submitStory()       refuses                               — THE BOUNDARY

   A locked row is markup and a redirect is advice to a browser. A server action
   takes a POST from anywhere, which is the same reason the user comes from the
   session above. Both courtesies read the same predicate this does —
   storyLessonsMet() in lib/certifications.ts — so no surface can invite a write
   this function will refuse.

   NOTE: a "use server" module may only export async functions. Types and the
   read side live in lib/story.ts.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadStoryLessons } from "@/lib/certifications";
import { recordEvent } from "@/lib/events/record";
import { postToSlack } from "@/lib/slack/send";
import { appBaseUrl, storySlackText } from "@/lib/story-slack";

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
 *
 * ---------------------------------------------------------------------------
 * 9 NOVEMBER: THE CHECK THIS PARAGRAPH PROMISED NOW EXISTS, AND IT IS A PERSON
 * ---------------------------------------------------------------------------
 * "The manager reading the story is the check. That is what the review surface
 * is for" was a forward reference for two years — 0127 built the stamp and no
 * surface. 0180 builds it: Mitch reads every story and marks it Good, or
 * Kickback when it is not substantial, and a kickback returns the leg to unmet
 * with a banner asking for something more.
 *
 * SO THE ARGUMENT AGAINST A MINIMUM IS STRONGER NOW, NOT WEAKER. The reason a
 * character count fails is that it measures typing, and "I learned a lot" is
 * 15 characters of nothing while "started opening the hood on every write-up;
 * sold three belts that week" is a real answer that a 120 floor would have
 * blocked. A person reading it can tell those apart and a `length` cannot. The
 * minimum stays out.
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
    .select("rooftop_id, rooftop:rooftop_id(name)")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (mErr) return { ok: false, error: mErr.message };
  if (!membership?.rooftop_id) {
    return { ok: false, error: "No active rooftop for this account." };
  }

  /*
   * `review_status` COMES BACK TOO, because what this function does on the edit
   * branch depends on whether somebody was waiting for it — see below.
   */
  const { data: existing, error: readErr } = await supabase
    .from("advisor_story")
    .select("id, body, review_status")
    .eq("user_id", userId)
    .eq("certification_id", certificationId)
    .is("retired_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  /*
   * ---- THE LESSONS COME FIRST --------------------------------------------
   *
   * Read AFTER the existing-story lookup and applied only to a NEW story, for
   * the reason the story page spells out: an advisor who already wrote one keeps
   * the ability to edit it whatever the lesson count now says. The words are
   * already theirs and already filed; the gate is about writing a first one
   * early, not about freezing what is written.
   *
   * THE ADVISOR'S OWN CLIENT, so the gate is evaluated for the caller —
   * loadStoryLessons takes no userId precisely because `my_module_progress`
   * keys on auth.uid(), and a gate that could be pointed at the wrong viewer is
   * the mistake this codebase has made three times.
   */
  if (!existing) {
    const lessons = await loadStoryLessons(supabase as never, certificationId);
    if (!lessons.complete) {
      return {
        ok: false,
        error: "Finish the track's lessons before writing your story",
      };
    }
  }

  if (existing) {
    /*
     * AN EDIT KEEPS THE PREVIOUS WORDS. A story that changed after a manager
     * read it is a thing the manager should be able to see, so the old text is
     * filed BEFORE the overwrite — and if that file fails we do not overwrite.
     * Losing the revision silently would make the history a label with nothing
     * behind it.
     */
    const changed = existing.body !== text;
    if (changed) {
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

    /*
     * ---- THE KICKBACK IS CLEARED BY THE DATABASE, NOT BY THIS LINE --------
     *
     * The brief asked for `review_status: 'pending'` in the update above as
     * belt and braces to 0180's trigger, in the 0161 shape. IT IS NOT WRITTEN
     * HERE AND THAT IS DELIBERATE: `authenticated` holds no column grant on
     * review_status (0180 §5), because granting one is exactly the hole — an
     * advisor who may write that column may PostgREST their own story to
     * `good`, marking their own homework past the gate that exists to put Mitch
     * in the loop. A belt that opens the lock it is holding shut is not a belt.
     *
     * So the reset lives in `advisor_story_edit_resets_review`, a BEFORE UPDATE
     * OF body trigger, which is strictly stronger than this line would have
     * been: it covers this action AND a raw update from a browser session, and
     * it refuses to fire on a save that changed nothing. accept:story proves
     * both paths and the no-op.
     *
     * The 0161 asymmetry is worth naming because this looks like it: there the
     * application is the boundary and the policy is the belt. Here the database
     * is the boundary and there is no belt the application could hold without
     * being handed the key.
     */

    /*
     * ---- A REWRITE AFTER A KICKBACK IS AN EVENT; AN ORDINARY EDIT IS NOT ---
     *
     * The insert branch's comment below explains why an edit writes nothing:
     * updated_at already records it, and an event per save would make "stories
     * submitted" a count of keystroke sessions. A rewrite after a kickback is
     * the exception, and not because it is a bigger edit — because SOMEBODY WAS
     * WAITING ON IT. It is the advisor answering Mitch, which is a thing that
     * happened on a day, and it is the only record of how often a story comes
     * back.
     *
     * `changed` AND NOT JUST THE OLD STATUS. A no-op Save leaves the story
     * kicked back (the trigger declines to reset it), so recording a
     * resubmission would be an event claiming a rewrite the row does not have —
     * and the next reader would find a resubmitted story still sitting in
     * kickback with nothing to explain it. The event follows the row.
     */
    if (changed && existing.review_status === "kickback") {
      await recordEvent({
        userId,
        rooftopId: membership.rooftop_id as string,
        kind: "story_resubmitted",
        targetId: certificationId,
      });
    }
  } else {
    const { error: insErr } = await supabase.from("advisor_story").insert({
      user_id: userId,
      rooftop_id: membership.rooftop_id,
      certification_id: certificationId,
      body: text,
    });
    if (insErr) return { ok: false, error: insErr.message };

    /*
     * ---- THE ROLLCALL EVENT, ON THE INSERT BRANCH ONLY -------------------
     *
     * A FIRST story filed is a thing that happened on a day. An edit is not,
     * which is why this sits inside the else and not after the branch:
     * advisor_story.updated_at already records the edit, and an event per save
     * would make "stories submitted" a count of keystroke sessions.
     *
     * AFTER the insert succeeded, never before. The whole point of this
     * record is that it is evidence, and an event written ahead of the row it
     * describes would survive a failed insert as a claim about nothing.
     */
    await recordEvent({
      userId,
      rooftopId: membership.rooftop_id as string,
      kind: "story_submitted",
      targetId: certificationId,
    });

    /*
     * ---- AND #ediagd HEARS ABOUT IT. BEST EFFORT, AND LAST ----------------
     *
     * Ryan, 9 November: "A new story posts a notice to #ediagd." The ORDER is
     * the feedback action's rule and it is the same rule: the row is the record
     * and a dropped Slack message must not take down the write that already
     * succeeded. So this is after the insert, after the event, and nothing
     * below it can change the advisor's "Saved".
     *
     * THE INSERT BRANCH ONLY. An edit is not news, and a rewrite after a
     * kickback is already news in the only place that is waiting for it —
     * Mitch's queue, which shows it back as pending. A channel post per save
     * would make the signal worthless within a week.
     *
     * WHO, WHERE, WHICH TRACK, AND A LINK. Never the body — see
     * lib/story-slack.ts for why that is a rule rather than a preference.
     */
    await notifyStoryFiled(supabase, userId, certificationId, membership);
  }

  revalidatePath("/certifications");
  /* The banner and the leg hint both read the story's status, and an advisor who
     has just answered a kickback should not find the banner still up. */
  revalidatePath("/advisor");
  return { ok: true };
}

/**
 * Post the #ediagd notice. Returns nothing and throws nothing.
 *
 * ---------------------------------------------------------------------------
 * EVERY NAME IS READ THROUGH THE ADVISOR'S OWN CLIENT
 * ---------------------------------------------------------------------------
 * Not the service role, which the feedback action uses — it needs to, because
 * an advisor cannot read the feedback table. Here there is nothing to step
 * over: the author's own name (app_user_self), their own rooftop, and a
 * certification from the public catalogue. Reaching for the service client
 * would be routing around the RLS for no gain, which is the habit 0127 and this
 * file's own header exist to prevent.
 *
 * A NAME IS FOR PRINTING, NEVER FOR MATCHING. These three strings are
 * interpolated into a Slack message and nothing else; the row was already
 * inserted, keyed on ids from the session.
 *
 * FALLS BACK RATHER THAN FAILING. A name that would not load must not cost the
 * notice — Mitch can open the queue and see whose it is. "Unnamed advisor" in a
 * channel is a bad post; no post at all is a story nobody knows was written.
 */
async function notifyStoryFiled(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  supabase: any,
  userId: string,
  certificationId: string,
  membership: { rooftop_id: unknown; rooftop?: unknown }
): Promise<void> {
  try {
    const [{ data: profile }, { data: cert }] = await Promise.all([
      supabase.from("app_user").select("full_name").eq("id", userId).maybeSingle(),
      supabase.from("certification").select("name").eq("id", certificationId).maybeSingle(),
    ]);

    /* PostgREST spells an embedded to-one as an object or a one-element array
       depending on how it resolves the relationship. Both read, neither
       assumed. */
    const embed = membership.rooftop;
    const roof = (Array.isArray(embed) ? embed[0] : embed) as { name?: string } | null;

    const text = storySlackText({
      advisorName: (profile?.full_name as string | undefined) ?? "An advisor",
      rooftopName: (roof?.name as string | undefined) ?? "No rooftop",
      trackName: (cert?.name as string | undefined) ?? "a track",
      appUrl: appBaseUrl(),
    });

    await postToSlack(process.env.SLACK_STORY_WEBHOOK, text, "story-slack");
  } catch (error) {
    /* postToSlack never throws; this catches a failed name read. The label, not
       the text — the text names a person and a store, and `label` is all
       lib/slack/send.ts puts in a log for exactly that reason. */
    console.error("[story-slack] notice not posted", error);
  }
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

/* ============================================================================
   0180 — MITCH MARKS IT
============================================================================ */

export type ReviewVerdict = "good" | "kickback";

/**
 * Mark a story Good, or kick it back with an optional note.
 *
 * ---------------------------------------------------------------------------
 * THE RPC IS THE BOUNDARY, NOT THIS FUNCTION AND NOT THE PAGE'S GUARD
 * ---------------------------------------------------------------------------
 * /admin/stories requires `isPlatformOwner`, and that is a courtesy — the same
 * relationship the track page's locked row has to submitStory(). A server action
 * takes a POST from anywhere, so the permission is decided inside
 * `review_story()`: platform owner at any rooftop, or the rooftop's own
 * manager/admin, and nobody else. An advisor calling this gets a 42501 from the
 * database, which accept:story asserts as a refusal.
 *
 * SO THERE IS NO GUARD HERE, DELIBERATELY. A `getAdminContext()` check in this
 * function would read as the control and would be the weaker of the two —
 * duplicating a decision the definer function already makes correctly is how
 * the two drift, and the one that drifts is always the copy. What this function
 * does is carry the session, call the function, and tell the screen what
 * happened.
 *
 * `storyId`, NEVER a name and never an advisor id. 0180's function takes the
 * story's own uuid and resolves the rooftop from the row, so there is no way to
 * point this at the wrong person's record.
 */
export async function reviewStory(
  storyId: string,
  status: ReviewVerdict,
  note?: string
): Promise<StoryResult> {
  /*
   * REFUSED HERE TOO, BEFORE THE ROUND TRIP. Not the boundary — review_story()
   * refuses `pending` and anything else with a 22023 — but a typed union is
   * what TypeScript can check call sites against, and the same claim made twice
   * is the posture lib/events/kinds.ts takes with 0163's CHECK constraint.
   */
  if (status !== "good" && status !== "kickback") {
    return { ok: false, error: "A review is Good or Kickback." };
  }

  const { supabase, userId } = await session();

  /*
   * WHOSE STORY, READ BEFORE THE WRITE AND THROUGH THE REVIEWER'S OWN CLIENT.
   *
   * The event needs the ADVISOR's rooftop, not the reviewer's: app_event.
   * rooftop_id is `not null` and 0163's read policy selects on it, so filing
   * Mitch's review under Mitch's rooftop would put it where the store it
   * concerns cannot see it — and Mitch, a platform owner, may hold no
   * membership row at all, which would drop the event entirely with a warning
   * nobody reads.
   *
   * Through the viewer's client so the read is the new RLS arm answering. If
   * they cannot read the row they cannot review it, and the RPC below will say
   * so with the same 42501 — one decision, asked twice, never two decisions.
   */
  const { data: story, error: readErr } = await supabase
    .from("advisor_story")
    .select("id, user_id, rooftop_id, certification_id")
    .eq("id", storyId)
    .is("retired_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!story) return { ok: false, error: "That story is not yours to review." };

  const { error } = await supabase.rpc("review_story", {
    _story: storyId,
    _status: status,
    _note: note && note.trim().length > 0 ? note.trim() : null,
  });
  if (error) {
    /*
     * The raw Postgres message is for the log, not the screen — the discipline
     * the feedback action records. 42501 is the only one with a sentence of its
     * own, because it is the only one that is about the caller rather than
     * about us.
     */
    console.error("[story-review] review_story failed", { storyId, status, error });
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "That story is not yours to review."
          : "We couldn't save that just now. Try once more.",
    };
  }

  /*
   * ---- THE EVENT, AFTER THE WRITE SUCCEEDED -----------------------------
   *
   * ONE KIND WITH THE OUTCOME IN `meta`, not story_marked_good and
   * story_kicked_back. 0163 made meta free-form precisely so a kind's context
   * could change without a migration, and the thing being counted is reviews —
   * two kinds would make "how many has he read" a sum, which is the arithmetic
   * that breaks when a third outcome appears.
   *
   * `targetId` IS THE STORY, not the certification. Every other kind points at
   * a track or a module; this one is about one person's row, and the id is what
   * lets a reader find it. `reviewerId` in meta because the event is filed
   * under the ADVISOR — without it the row says a review happened to them and
   * not who did it.
   */
  await recordEvent({
    userId: story.user_id as string,
    rooftopId: story.rooftop_id as string,
    kind: "story_reviewed",
    targetId: storyId,
    meta: {
      status,
      reviewer_id: userId,
      certification_id: story.certification_id as string,
      note_given: Boolean(note && note.trim().length > 0),
    },
  });

  /*
   * THREE SURFACES READ THIS ROW AND ALL THREE ARE REVALIDATED.
   *
   * /admin/stories    the card Mitch just pressed
   * /advisor          the kickback banner above labor sales
   * /certifications   the track's story leg, and the tile's "Story to write"
   *
   * The advisor's two are revalidated for a path, not for a person — Next's
   * cache is keyed per path and per user session, so this clears the reviewer's
   * render of them and the advisor's next request rebuilds from the row. Said
   * plainly because "revalidate /advisor" looks like it reaches into somebody
   * else's session and it does not; what makes the advisor's screen correct is
   * that /advisor is dynamic and reads loadKickback on every request.
   */
  revalidatePath("/admin/stories");
  revalidatePath("/advisor");
  revalidatePath("/certifications");
  return { ok: true };
}
