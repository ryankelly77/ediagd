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
  /**
   * Certification ids this advisor has a live, NOT-KICKED-BACK story for.
   *
   * The kickback clause is part of the definition rather than a filter applied
   * afterwards by whoever remembers — see the comment on loadStoryGate.
   */
  toldFor: Set<string>;
  /**
   * Certification ids whose story Mitch kicked back — a SUBSET of the tracks
   * that are NOT in `toldFor`, and the reason they are not.
   *
   * ---------------------------------------------------------------------------
   * THIS IS WORDING, NEVER THE GATE
   * ---------------------------------------------------------------------------
   * `toldFor` alone already decides the leg, and trackComplete() needs nothing
   * from here — a kicked-back track is simply absent from `toldFor`, which is
   * what makes the leg unmet by construction rather than by a second condition
   * somebody has to remember.
   *
   * What this set exists for is that "no story yet" and "a story Mitch asked
   * more of" are the same UNMET state and must not read as the same SENTENCE.
   * Without it the certifications wall says "Story to write" to somebody who
   * already wrote one, and the track page offers them a blank prompt — which
   * is a screen telling an advisor their work vanished.
   */
  kickedBackFor: Set<string>;
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
 *
 * ---------------------------------------------------------------------------
 * A KICKED-BACK STORY IS NOT A TOLD STORY, AND THE FILTER BELONGS HERE
 * ---------------------------------------------------------------------------
 * 0180 lets Mitch mark a story `kickback` when it is not substantial, which
 * returns the track's story leg to unmet until the advisor rewrites it.
 *
 * `storySubmitted` is read in three places — certifications.ts at 170 and 619,
 * certification-server.ts at 229 — and all three take it from THIS function's
 * `toldFor`. So the clause goes in the one read and none of the call sites
 * change. That is deliberate and it is the `swell.current_len` lesson: the
 * stale-streak bug was correctly defended in the notification layer, nobody
 * asked who else read the value raw, and twenty-four migrations later the
 * screens were still wrong. A value filtered in one of four readers is the same
 * defect waiting.
 *
 * IT MATCHES my_story_for() IN 0180 BY CONSTRUCTION — same predicate, live and
 * not kicked back — because the credential accrual asks the function and the
 * screens ask this, and a screen that disagreed with the accrual would tell
 * somebody a track was finished and then not finish it.
 */
export async function loadStoryGate(
  client: Client,
  userId: string
): Promise<StoryGate> {
  const [{ data: settings, error: settingsError }, { data: mine, error: mineError }] =
    await Promise.all([
      client.from("game_settings").select("story_required").limit(1).maybeSingle(),
      /*
       * EVERY LIVE STORY, AND THE SPLIT HAPPENS BELOW ON ONE SET OF ROWS.
       *
       * The obvious shape is `.neq("review_status", "kickback")` here plus a
       * second query for the kicked-back ones. Two reads of the same table a
       * moment apart can disagree — a story reviewed between them lands in
       * BOTH sets or in NEITHER, and "neither" is a track whose leg is unmet
       * with no sentence explaining why. One read, partitioned, cannot.
       */
      client
        .from("advisor_story")
        .select("certification_id, review_status")
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

  const rows = (mine ?? []) as { certification_id: string; review_status: unknown }[];

  /*
   * `=== "kickback"` FOR THE EXCLUSION, AND THE DIRECTION IS DELIBERATE.
   *
   * An unreadable or unexpected status counts as told — the same direction
   * asReviewStatus() falls back in, and the opposite of how `storyRequired`
   * defaults. The asymmetry is right: defaulting the FLAG on risks telling
   * somebody they still owe a story, which is recoverable; defaulting a STATUS
   * to kickback would put a banner on their screen about a rewrite nobody
   * asked for and hold a credential they have earned. The recoverable error
   * goes in each direction.
   */
  const kicked = rows.filter((r) => r.review_status === "kickback");

  return {
    storyRequired: settings?.story_required !== false,
    toldFor: new Set(
      rows.filter((r) => r.review_status !== "kickback").map((r) => r.certification_id)
    ),
    kickedBackFor: new Set(kicked.map((r) => r.certification_id)),
  };
}

/** pending | good | kickback — 0180's advisor_story.review_status. */
export type ReviewStatus = "pending" | "good" | "kickback";

/**
 * Read a status off a row without inventing one.
 *
 * `pending` IS THE SAFE FALL-BACK AND `kickback` WOULD NOT BE. An unreadable or
 * unexpected value must not put a banner on somebody's screen telling them
 * Mitch asked for a rewrite he never asked for — and must not silently satisfy
 * the leg either. Pending is the only value that claims nothing: no banner, leg
 * met, exactly where a story sits before anybody reads it.
 */
function asReviewStatus(value: unknown): ReviewStatus {
  return value === "good" || value === "kickback" ? value : "pending";
}

export type StoryRow = {
  id: string;
  certificationId: string;
  body: string;
  sharedToTeam: boolean;
  submittedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  /** 0180 — the outcome of the latest review. */
  reviewStatus: ReviewStatus;
  /** Mitch's line to the advisor, shown above the textarea on a kickback. */
  reviewNote: string | null;
};

/** An advisor's own story for one track, or null. RLS decides; no service client. */
export async function loadMyStory(
  client: Client,
  userId: string,
  certificationId: string
): Promise<StoryRow | null> {
  const { data, error } = await client
    .from("advisor_story")
    .select(
      "id, certification_id, body, shared_to_team, submitted_at, updated_at, " +
        "reviewed_at, review_status, review_note"
    )
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
    reviewStatus: asReviewStatus(data.review_status),
    reviewNote: (data.review_note as string | null) ?? null,
  };
}

/* ============================================================================
   0180 — WHAT MITCH ASKED FOR, AND WHO IS WAITING ON HIM
============================================================================ */

export type Kickback = {
  certificationId: string;
  /** The track's slug, for the link to the rewrite. */
  slug: string;
  trackName: string;
  reviewNote: string | null;
  reviewedAt: string | null;
};

/**
 * The caller's own kicked-back stories — what the banner on /advisor renders.
 *
 * THE ADVISOR'S OWN CLIENT, NEVER THE SERVICE ROLE. Arm 1 of 0127's read policy
 * (`user_id = auth.uid()`) is what returns these, so the banner can only ever
 * be built from rows the viewer is entitled to. A service-role read here would
 * route around the one policy that makes this record personal, and `userId` is
 * taken from the session by every caller for the same reason.
 *
 * ORDERED, because an advisor with two kicked-back tracks must see them in a
 * stable order — a paged or unordered read is how two renders of the same state
 * disagree. Newest review first: the most recent thing Mitch said.
 */
export async function loadKickback(
  client: Client,
  userId: string
): Promise<Kickback[]> {
  const { data, error } = await client
    .from("advisor_story")
    .select(
      "certification_id, review_note, reviewed_at, certification:certification_id(slug, name)"
    )
    .eq("user_id", userId)
    .is("retired_at", null)
    .eq("review_status", "kickback")
    .order("reviewed_at", { ascending: false });

  /*
   * TAKE THE ERROR. `?? []` would turn an unreadable row into "nothing was
   * kicked back", which renders as a track that is silently one rewrite short
   * forever — the advisor's leg is unmet (my_story_for says so) and the only
   * screen that explains why has decided there is nothing to say. That is the
   * confident wrong answer, and it is worse than the page failing.
   */
  if (error) throw new Error(`loadKickback: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    /* PostgREST spells an embedded to-one as an object or a one-element array
       depending on how it resolves the relationship; both shapes are read
       rather than assumed, the same as getManagerContext does with a
       set-returning function. */
    const embed = r.certification;
    const cert = (Array.isArray(embed) ? embed[0] : embed) as
      | { slug?: string; name?: string }
      | null
      | undefined;
    return {
      certificationId: r.certification_id as string,
      slug: (cert?.slug as string | undefined) ?? "",
      trackName: (cert?.name as string | undefined) ?? "your track",
      reviewNote: (r.review_note as string | null) ?? null,
      reviewedAt: (r.reviewed_at as string | null) ?? null,
    };
  });
}

export type QueueStory = {
  id: string;
  advisorName: string;
  rooftopName: string;
  trackName: string;
  body: string;
  submittedAt: string;
  updatedAt: string;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  /** Previous versions, newest first. 0127 kept them; this is what for. */
  revisions: { body: string; replacedAt: string }[];
};

/**
 * Every story Mitch can read, pending first. The /admin/stories queue.
 *
 * ---------------------------------------------------------------------------
 * THE VIEWER'S OWN CLIENT, AND THAT IS THE POINT OF THE PAGE
 * ---------------------------------------------------------------------------
 * A service-role read would work, show the same rows, and prove nothing. 0180's
 * whole substance is a fourth arm on 0127's read policy — `is_platform_owner()`
 * — and reading as the viewer is what makes the page EVIDENCE that the arm is
 * there and correctly scoped. Read as the service role, a page that rendered
 * every story would look identical whether the policy admitted Mitch or not.
 *
 * It also means a ROOFTOP MANAGER who reaches this data gets their own rooftop
 * and nothing else, from the same code, because arm 2 is what answers for them.
 * The page itself is platform-owner only (getAdminContext), but the read does
 * not depend on that guard being right.
 *
 * PENDING FIRST, THEN NEWEST. Ordered in the query rather than in the component
 * so one answer decides the list — and `review_status` sorts
 * good < kickback < pending alphabetically, which is not the order wanted, so
 * the split is done here in two reads' worth of sorting rather than trusted to
 * a clever ORDER BY nobody will re-read.
 */
export async function loadReviewQueue(client: Client): Promise<QueueStory[]> {
  const { data, error } = await client
    .from("advisor_story")
    .select(
      "id, body, submitted_at, updated_at, review_status, review_note, reviewed_at, " +
        "advisor:user_id(full_name), reviewer:reviewed_by(full_name), " +
        "rooftop:rooftop_id(name), certification:certification_id(name), " +
        "advisor_story_revision(body, replaced_at)"
    )
    .is("retired_at", null)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(`loadReviewQueue: ${error.message}`);

  const one = (embed: unknown): { full_name?: string; name?: string } | null => {
    const v = Array.isArray(embed) ? embed[0] : embed;
    return (v ?? null) as { full_name?: string; name?: string } | null;
  };

  const rows: QueueStory[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    /*
     * A NAME IS FOR PRINTING, NEVER FOR MATCHING. Every action on this page
     * carries `id` — the story's own uuid, which review_story() takes — and
     * these strings are only ever rendered. Two advisors sharing a name is a
     * real thing in this database and it must not be able to send a review to
     * the wrong row.
     */
    advisorName: one(r.advisor)?.full_name ?? "Unnamed advisor",
    rooftopName: one(r.rooftop)?.name ?? "No rooftop",
    trackName: one(r.certification)?.name ?? "Unknown track",
    body: r.body as string,
    submittedAt: r.submitted_at as string,
    updatedAt: r.updated_at as string,
    reviewStatus: asReviewStatus(r.review_status),
    reviewNote: (r.review_note as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    reviewedByName: one(r.reviewer)?.full_name ?? null,
    revisions: ((r.advisor_story_revision ?? []) as { body: string; replaced_at: string }[])
      .map((v) => ({ body: v.body, replacedAt: v.replaced_at }))
      .sort((a, b) => b.replacedAt.localeCompare(a.replacedAt)),
  }));

  /* Pending at the top — the only ones that are anybody's to act on. Stable
     within each group, because the query already ordered by submitted_at. */
  const rank = (s: ReviewStatus) => (s === "pending" ? 0 : 1);
  return rows.sort((a, b) => rank(a.reviewStatus) - rank(b.reviewStatus));
}
