import "server-only";

/*
 * Structurally typed, the same as lib/service-family.ts and for the same
 * reason: `advisor_story` and `game_settings.story_required` are 0127, and the
 * generated Database types are regenerated on a different cadence from the
 * migrations. Typing the client against them would make this file fail to
 * compile until someone remembered to regenerate — a build break that says
 * nothing about whether the code is right.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any };

/* ============================================================================
   EDIAGD — the Good News Story

   The third leg of the credential: the advisor's own account of something they
   did differently on the drive because of what a track taught them. One per
   track, eight per credential, at TRACK EXIT — mirroring the track film at
   track entry. Never per module, never per day.

   THE GATE LIVES IN lib/certification.ts. This file only fetches what that gate
   needs. Two things must not drift apart, so they are read together and handed
   over as one object.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   WHEN THE SUBMISSION FORM IS BUILT, IT SHIPS WITH ONE LINE OF COPY
   ---------------------------------------------------------------------------
   THERE IS NO FORM YET. 0127 built the record, the RLS and the gate; nothing in
   the product writes an advisor_story, and nothing can before February because
   no track completes sooner.

   Whenever it is built, this goes above the textarea:

       Don't use customer names.

   Advisors will otherwise write "Mrs. Henderson in the blue Pacifica wouldn't
   buy the alignment until…", because that is how people describe their work.
   Nothing currently tells them not to.

   It is copy, not policy. It costs nothing and it prevents most of what the
   retention and deletion policy would otherwise have to clean up — and that
   policy is still unruled (Mitch and Ryan, before February).

   RELATEDLY, THE WARM-UP STORY WAS RULED OUT, 20 September. Onboarding could
   have invited an optional first story — "tell us about a win you've already
   had" — counting toward no track. Declined, and the reason is this same
   paragraph: as built, nothing can be written until February, so the customer
   name question is a February question. A warm-up would have made it a nine-day
   one, for a feature nobody asked for. Revisit in November, once Doggett has
   used the product for a month and we know whether advisors want to write or
   have to be asked.
--------------------------------------------------------------------------- */

export type StoryGate = {
  /** game_settings.story_required — THE flag, read nowhere else. */
  storyRequired: boolean;
  /** Certification ids this advisor has a live story for. */
  toldFor: Set<string>;
};

/**
 * THE ONE PLACE `story_required` IS READ.
 *
 * Turning the story off is `update game_settings set story_required = false;`
 * and nothing else — no migration, no deploy. That is only true while this is
 * the single read site, so if a second one ever appears, it is a bug and not a
 * convenience.
 *
 * DEFAULTS TO TRUE WHEN THE ROW OR THE READ IS MISSING, and that is the
 * deliberate direction. The alternative — a failed read quietly turning the
 * requirement off — is a credential handed out because a query failed, which is
 * precisely the class of silent wrong answer this codebase keeps finding. An
 * advisor briefly told they still owe a story is recoverable; a certification
 * granted without one is not.
 */
export async function loadStoryGate(
  client: Client,
  userId: string
): Promise<StoryGate> {
  const [{ data: settings, error: settingsError }, { data: mine, error: mineError }] =
    await Promise.all([
      client.from("game_settings").select("story_required").limit(1).maybeSingle(),
      client
        .from("advisor_story")
        .select("certification_id")
        .eq("user_id", userId)
        .is("retired_at", null),
    ]);

  /*
   * TAKE THE ERRORS. `?? []` here would turn an RLS refusal or a missing
   * relation into "this advisor has told no stories", which reads as a track
   * that is one sentence short forever — indistinguishable from the truth and
   * impossible to notice. Ninth-instance shape; not repeating it.
   */
  if (settingsError) {
    throw new Error(`story gate: game_settings unreadable — ${settingsError.message}`);
  }
  if (mineError) {
    throw new Error(`story gate: advisor_story unreadable — ${mineError.message}`);
  }

  return {
    storyRequired: settings?.story_required !== false,
    toldFor: new Set(
      ((mine ?? []) as { certification_id: string }[]).map((r) => r.certification_id)
    ),
  };
}

export type StoryRow = {
  id: string;
  certificationId: string;
  body: string;
  sharedToTeam: boolean;
  submittedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

/** An advisor's own story for one track, or null. RLS decides; no service client. */
export async function loadMyStory(
  client: Client,
  userId: string,
  certificationId: string
): Promise<StoryRow | null> {
  const { data, error } = await client
    .from("advisor_story")
    .select("id, certification_id, body, shared_to_team, submitted_at, updated_at, reviewed_at")
    .eq("user_id", userId)
    .eq("certification_id", certificationId)
    .is("retired_at", null)
    .maybeSingle();

  if (error) throw new Error(`loadMyStory: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id as string,
    certificationId: data.certification_id as string,
    body: data.body as string,
    sharedToTeam: Boolean(data.shared_to_team),
    submittedAt: data.submitted_at as string,
    updatedAt: data.updated_at as string,
    reviewedAt: (data.reviewed_at as string | null) ?? null,
  };
}
