/* ============================================================================
   EDIAGD — the Good News Story, proved as refusals

   Ruling 3 of 3e: the RLS is the feature, not a detail. This is the first place
   in the product where an advisor writes free text about their own work, their
   customers and their colleagues, and somebody else reads it — their manager
   since 0127, and EDIAGD since 0180, which is what the form now tells them.

   Four rules, and every one is proved HERE AS A REFUSAL, over PostgREST, as the
   role that really calls — not as the service role, which bypasses the thing
   under test.

     1. an advisor reads and writes their OWN stories, always
     2. a manager reads stories of advisors AT THEIR OWN ROOFTOP, nothing else
     3. a shared story reaches advisors at that rooftop, and only when shared
     4. no DEALER STAFF read across rooftops — not a manager at another store,
        not an admin at another store. EDIAGD does; see 9 below.

   AND SINCE 0161 A FIFTH, which is about WHEN rather than who:

     5. a story cannot be written until the track's GATING lessons are done
        (section 8 — and its acceptance half is the one that catches a gate
        keyed on 0117's unfiltered module denominator, which is false forever
        on six of the nine core tracks)

   AND SINCE 0180 FOUR MORE, which are about WHAT A REVIEW DOES (sections 9-12):

     6. a PLATFORM OWNER reads every story at every rooftop — and a rooftop
        ADMIN at store A still reads nothing at store B, which is the half that
        proves the new arm did not widen rule 4 for dealer staff
     7. review_story() accepts a PLATFORM OWNER AND NOBODY ELSE — refused for
        the rooftop's own manager, for a colleague, for the author, and for an
        author who is ALSO a manager at their own rooftop (the real case: an
        advisor with a manager row manages the rooftop their own story is
        stamped with, so a managed_rooftops() arm let them mark themselves
        Good). It also refuses `pending` and junk as a status
     8. a kickback returns the leg to unmet — my_story_for() goes false AND
        loadStoryGate().toldFor drops the track, asserted through the real
        reader rather than a restatement of it
     9. a rewritten body returns the story to the queue and clears the note; a
        NO-OP save does not; and the author can never write review_status at all
    10. a kickback on an EARNED track leaves advisor_certification untouched —
        retire, never revoke (0127 §2)

   AND EVERY REFUSAL IS PROVED NON-VACUOUS. A test that asserts "this query
   returns nothing" passes just as well when the relation is missing, the login
   failed, or the fixture was never written. So each refusal is paired with the
   same read succeeding for somebody who IS entitled to it. An assertion that
   cannot distinguish a working lock from a missing door is not a test.

   THE SAME RULE APPLIED TO 0180's TWO NEW GATES, because both are the shape
   this codebase keeps getting wrong:

     - the COLUMN GRANT is proved by refusing the author review_status AND by
       accepting the author's own body through the same client. A grant that
       revoked everything would pass the refusal half and lock an advisor out of
       the one record that is their own words — a false refusal wearing the
       costume of care.
     - the PLATFORM-OWNER ARM is proved by a read that succeeds across rooftops
       AND by the rooftop admin's read that still fails. An arm written as
       `true` would pass the first and nothing else would notice.

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:story
   ============================================================================ */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
/*
 * THE REAL READER AND THE REAL BUILDER, IMPORTED RATHER THAN RESTATED.
 *
 * loadStoryGate is what certifications.ts and certification-server.ts feed
 * `storySubmitted` from, so asserting ITS answer is asserting what the screens
 * and the accrual will say. A hand-written query here that happened to filter
 * on review_status would prove this file and nothing about the application.
 *
 * Same for storySlackText: the "never the body" assertion is worth something
 * only against the string the action actually posts.
 */
import { loadStoryGate } from "@/lib/story";
import { storySlackText } from "@/lib/story-slack";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;

if (!URL || !KEY || !ANON) {
  console.error("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`REFUSING to run against ${URL} — this suite writes. Local only.`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const TAG = `story-acc-${randomUUID().slice(0, 6)}`;
const PASSWORD = "Fixture-passw0rd!";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? `\n        ${detail}` : ""}`);
    console.log(`    ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

const madeUsers: string[] = [];

/**
 * A fixture account.
 *
 * `admin` IS A MEMBERSHIP ROLE AND `platformOwner` IS NOT — 0015's distinction,
 * and getting it wrong is how a test proves the wrong thing. managed_rooftops()
 * returns manager AND admin rows, so a rooftop admin reaches a story through
 * arm 2 and is bounded by the rooftop; is_platform_owner() reads a column on
 * app_user and is bounded by nothing. Section 9 needs both to tell 0180's new
 * arm apart from the old one.
 *
 * A PLATFORM OWNER STILL GETS A MEMBERSHIP HERE, at store A, deliberately: it
 * makes the cross-rooftop read in section 9 a real crossing rather than a
 * person with no rooftop reading the only rooftop there is.
 */
async function makeUser(
  label: string,
  rooftop: string,
  role: "advisor" | "manager" | "admin",
  opts: { platformOwner?: boolean } = {}
): Promise<string> {
  const email = `${TAG}-${label}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);
  const { error: uErr } = await sb.from("app_user").upsert({
    id,
    full_name: `${TAG} ${label}`,
    is_platform_owner: Boolean(opts.platformOwner),
  });
  if (uErr) throw new Error(`app_user ${label}: ${uErr.message}`);
  const { error: mErr } = await sb
    .from("membership")
    .insert({ user_id: id, rooftop_id: rooftop, role, active: true });
  if (mErr) throw new Error(`membership ${label}: ${mErr.message}`);
  return id;
}

async function signedInAs(userId: string): Promise<SupabaseClient> {
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: u.user!.email!,
    password: PASSWORD,
  });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

async function main() {
  /* ---- Fixtures: two rooftops, so "across rooftops" is a real boundary --- */
  const { data: org } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();

  const mkRooftop = async (n: string) => {
    const { data, error } = await sb
      .from("rooftop")
      .insert({ name: `${TAG} ${n}`, org_id: org!.id, timezone: "America/Chicago" })
      .select("id")
      .single();
    if (error) throw new Error(`rooftop: ${error.message}`);
    return data!.id as string;
  };

  const roofA = await mkRooftop("Store A");
  const roofB = await mkRooftop("Store B");

  const { data: cert, error: cErr } = await sb
    .from("certification")
    .insert({
      slug: `${TAG}-track`,
      name: `${TAG} Track`,
      kind: "craft",
      is_core: false,
      glyph_key: "craft_walk_around",
      sort: 900,
    })
    .select("id")
    .single();
  if (cErr) throw new Error(`certification: ${cErr.message}`);
  const certId = cert!.id as string;

  /* ---- The track needs real lessons now (0161) ---------------------------
     Until 0161 this fixture track had no courses and no modules at all, and the
     insert policy did not care. It does now: `my_track_lessons_complete()` must
     be true, so the track gets ONE gating lesson and — deliberately — one
     cue-only module beside it.

     THE CUE-ONLY MODULE IS NOT DECORATION. It is what makes section 8's
     acceptance half mean something: under 0117's `done_modules >=
     total_modules` this track could never qualify, so a suite without it would
     pass just as happily with the wrong rollup in the policy. Same reason the
     migration's own probe builds one. */
  const { data: course, error: coErr } = await sb
    .from("course")
    .insert({ track: "craft", name: `${TAG} Course`, slug: `${TAG}-course` })
    .select("id")
    .single();
  if (coErr) throw new Error(`course: ${coErr.message}`);
  await sb
    .from("certification_course")
    .insert({ certification_id: certId, course_id: course!.id, sort: 1 });

  const mkModule = async (name: string, sort: number) => {
    const { data, error } = await sb
      .from("module")
      .insert({ course_id: course!.id, name: `${TAG} ${name}`, sort_order: sort })
      .select("id")
      .single();
    if (error) throw new Error(`module ${name}: ${error.message}`);
    return data!.id as string;
  };
  const lessonMod = await mkModule("Lesson", 1);
  const cueMod = await mkModule("Reinforcement", 2);

  const mkContent = async (title: string, type: string, moduleId: string) => {
    const { data, error } = await sb
      .from("content")
      .insert({ title: `${TAG} ${title}`, type, status: "published", module_id: moduleId })
      .select("id")
      .single();
    if (error) throw new Error(`content ${title}: ${error.message}`);
    return data!.id as string;
  };
  const filmId = await mkContent("film", "advisor_video", lessonMod);
  await mkContent("cue", "cue", cueMod);

  /**
   * Make this advisor genuinely finished with the track's gating lessons.
   *
   * AS THE SERVICE ROLE, because this is fixture-building and not the thing
   * under test — what is under test is whether the POLICY then accepts the
   * story, asked as the advisor over PostgREST.
   */
  const finishLessons = async (userId: string, rooftopId: string) => {
    const { error: cpErr } = await sb.from("content_progress").upsert({
      user_id: userId,
      rooftop_id: rooftopId,
      content_id: filmId,
      completed_at: new Date().toISOString(),
    });
    if (cpErr) throw new Error(`content_progress: ${cpErr.message}`);
    const { error: mcErr } = await sb
      .from("module_completion")
      .upsert({ user_id: userId, module_id: lessonMod, rooftop_id: rooftopId });
    if (mcErr) throw new Error(`module_completion: ${mcErr.message}`);
  };

  const author = await makeUser("author", roofA, "advisor");
  const peerA = await makeUser("peer-a", roofA, "advisor");
  const mgrA = await makeUser("mgr-a", roofA, "manager");
  const mgrB = await makeUser("mgr-b", roofB, "manager");

  /*
   * THE PLATFORM OWNER IS BUILT WITH THE REST, not down in section 9, because
   * since 10 November they are the ONLY caller review_story() accepts — so
   * section 5 onwards needs them to do anything at all.
   *
   * AN `advisor` MEMBERSHIP AT STORE A, AND THAT IS WHAT MAKES SECTION 9 MEAN
   * SOMETHING. Give them `manager` and every cross-rooftop read down there is
   * explained by arm 2 of the read policy, and the test would pass with 0180's
   * new arm deleted. As an advisor they are in nobody's managed_rooftops(), the
   * stories are unshared and none are theirs, so arm 4 is the only door.
   */
  const owner = await makeUser("owner", roofA, "advisor", { platformOwner: true });

  /*
   * EVERY ADVISOR WHO WRITES A STORY BELOW IS FINISHED FIRST — including the
   * peer, who only ever writes one to prove a refusal is non-vacuous.
   *
   * This matters more than it looks. `my_track_lessons_complete()` is evaluated
   * for `auth.uid()`, not for the row's `user_id`, so an unfinished peer would
   * be refused by the LESSONS arm — and "a colleague cannot write a story in
   * the advisor's name" would pass while proving nothing about the user_id arm
   * it names. A refusal with two possible causes tests neither.
   */
  await finishLessons(author, roofA);
  await finishLessons(peerA, roofA);

  const authorC = await signedInAs(author);
  const peerC = await signedInAs(peerA);
  const mgrAC = await signedInAs(mgrA);
  const mgrBC = await signedInAs(mgrB);
  const ownerC = await signedInAs(owner);

  /* ==================================================================== */
  section("1 — an advisor writes their own story, and only their own");

  const { data: mine, error: insErr } = await authorC
    .from("advisor_story")
    .insert({
      user_id: author,
      rooftop_id: roofA,
      certification_id: certId,
      body: "I walked the belt on a 2019 Pilot and the customer said yes.",
    })
    .select("id")
    .single();
  ok("the advisor can write their own story", !insErr && Boolean(mine), insErr?.message);
  const storyId = mine?.id as string;

  const { error: forgeErr } = await peerC.from("advisor_story").insert({
    user_id: author,
    rooftop_id: roofA,
    certification_id: certId,
    body: "written by somebody else",
  });
  ok(
    "REFUSED: a colleague cannot write a story in the advisor's name",
    Boolean(forgeErr),
    forgeErr ? undefined : "the insert succeeded — the credential's own words are forgeable"
  );

  const { data: readOwn, error: readOwnErr } = await authorC
    .from("advisor_story")
    .select("id, body")
    .eq("id", storyId);
  ok(
    "…and non-vacuous: the author reads their own story back",
    !readOwnErr && (readOwn ?? []).length === 1,
    readOwnErr?.message
  );

  /* ==================================================================== */
  section("2 — a colleague at the same rooftop cannot read an unshared story");

  const { data: peerSees, error: peerErr } = await peerC
    .from("advisor_story")
    .select("id")
    .eq("id", storyId);
  ok(
    "REFUSED: an advisor cannot read another advisor's unshared story",
    !peerErr && (peerSees ?? []).length === 0,
    peerErr ? `errored instead of refusing: ${peerErr.message}` : `saw ${(peerSees ?? []).length}`
  );

  /* NON-VACUITY: the same client, the same table, a row it IS entitled to. */
  const { data: peerOwn } = await peerC
    .from("advisor_story")
    .insert({
      user_id: peerA,
      rooftop_id: roofA,
      certification_id: certId,
      body: "my own, to prove the client and the table both work",
    })
    .select("id")
    .single();
  const { data: peerReadsOwn } = await peerC
    .from("advisor_story")
    .select("id")
    .eq("id", peerOwn?.id as string);
  ok(
    "  ↳ non-vacuous: the SAME client reads its OWN story from the SAME table",
    (peerReadsOwn ?? []).length === 1,
    "the refusal above may be a broken client rather than a working policy"
  );

  /* ==================================================================== */
  section("3 — sharing is opt-in, and reaches only that rooftop");

  const { data: beforeShare } = await peerC
    .from("advisor_story")
    .select("id")
    .eq("id", storyId);
  ok("before sharing, the peer sees nothing", (beforeShare ?? []).length === 0);

  const { error: shareErr } = await authorC
    .from("advisor_story")
    .update({ shared_to_team: true })
    .eq("id", storyId);
  ok("the author can share their own story", !shareErr, shareErr?.message);

  const { data: afterShare } = await peerC
    .from("advisor_story")
    .select("id")
    .eq("id", storyId);
  ok(
    "  ↳ and the SAME read now returns it — the refusal was the flag, not the wiring",
    (afterShare ?? []).length === 1
  );

  /* ==================================================================== */
  section("4 — a manager reads their own rooftop, and nothing across the fence");

  const { data: mgrASees, error: mgrAErr } = await mgrAC
    .from("advisor_story")
    .select("id, body")
    .eq("id", storyId);
  ok(
    "the rooftop's own manager reads it",
    !mgrAErr && (mgrASees ?? []).length === 1,
    mgrAErr?.message
  );

  /* Unshare first, so what the manager reads is the manager policy and not the
     shared-to-team arm — otherwise rule 2 is proved by rule 3 and neither is. */
  await authorC.from("advisor_story").update({ shared_to_team: false }).eq("id", storyId);
  const { data: mgrAUnshared } = await mgrAC
    .from("advisor_story")
    .select("id")
    .eq("id", storyId);
  ok(
    "  ↳ still, with sharing OFF — it is the manager arm, not the shared arm",
    (mgrAUnshared ?? []).length === 1
  );

  const { data: mgrBSees, error: mgrBErr } = await mgrBC
    .from("advisor_story")
    .select("id")
    .eq("id", storyId);
  ok(
    "REFUSED: a manager at another rooftop reads nothing",
    !mgrBErr && (mgrBSees ?? []).length === 0,
    mgrBErr ? `errored instead of refusing: ${mgrBErr.message}` : `saw ${(mgrBSees ?? []).length}`
  );

  /* NON-VACUITY for rule 4: give store B its own story and prove mgrB reads
     THAT. Same client, same table, same query — only the rooftop differs. */
  const fenceUser = await makeUser("fence", roofB, "advisor");
  await finishLessons(fenceUser, roofB);
  const fenceC = await signedInAs(fenceUser);
  const { data: fenceStory } = await fenceC
    .from("advisor_story")
    .insert({
      user_id: fenceUser,
      rooftop_id: roofB,
      certification_id: certId,
      body: "store B's own",
    })
    .select("id")
    .single();
  const { data: mgrBOwn } = await mgrBC
    .from("advisor_story")
    .select("id")
    .eq("id", fenceStory?.id as string);
  ok(
    "  ↳ non-vacuous: the SAME manager client reads a story at ITS OWN rooftop",
    (mgrBOwn ?? []).length === 1,
    "the cross-rooftop refusal may be a broken manager client"
  );

  /* ==================================================================== */
  section("5 — review records who, when and WHAT (0180 replaced the 0127 stamp)");

  /*
   * 0127's mark_story_reviewed(uuid) is DROPPED, not deprecated. Asserted
   * first, because a suite that still passed against the old function would be
   * proving a surface the application no longer calls — and 0180's whole point
   * is that a review now carries an outcome.
   */
  const { error: oldFnErr } = await mgrAC.rpc("mark_story_reviewed", { _story: storyId });
  ok(
    "GONE: 0127's mark_story_reviewed is dropped, not left beside its replacement",
    Boolean(oldFnErr),
    oldFnErr ? undefined : "it still exists — a story can be stamped with no outcome"
  );

  const { error: revErr } = await ownerC.rpc("review_story", {
    _story: storyId,
    _status: "good",
  });
  ok("a platform owner can mark a story Good", !revErr, revErr?.message);

  /*
   * ---- THE ROOFTOP'S OWN MANAGER IS REFUSED (Ryan, 10 November) ----------
   *
   * This was an ACCEPTANCE until 10 November, mirroring the read policy on the
   * reasoning that "a second door into the same room needs the same lock".
   * Right about the read, wrong here: READING AND REVIEWING ARE DIFFERENT
   * PERMISSIONS. A manager reads their team's words through arm 2 — asserted
   * in section 4 and untouched — and marks none of them, because a mark
   * decides a leg of somebody's credential and that judgement is Mitch's.
   *
   * mgrA manages roofA and the story is AT roofA, so this is the strongest
   * form of the refusal: everything managed_rooftops() ever checked is true
   * and the answer is still no.
   */
  const { error: mgrRevErr } = await mgrAC.rpc("review_story", {
    _story: storyId,
    _status: "good",
  });
  ok(
    "REFUSED: the rooftop's OWN manager cannot review — they read, they do not mark",
    Boolean(mgrRevErr),
    mgrRevErr
      ? undefined
      : "a store manager marked a story; the managed_rooftops() arm is back, and " +
        "with it an advisor who holds a manager row reviewing their own story"
  );

  const { error: revCrossErr } = await mgrBC.rpc("review_story", {
    _story: storyId,
    _status: "good",
  });
  ok(
    "REFUSED: …and so is a manager at another rooftop",
    Boolean(revCrossErr),
    revCrossErr ? undefined : "the review succeeded across the rooftop fence"
  );

  const { data: gateRow } = await sb
    .from("advisor_story")
    .select("reviewed_by, reviewed_at, review_status")
    .eq("id", storyId)
    .single();
  ok(
    "  ↳ and it recorded who, when and the verdict",
    gateRow?.reviewed_by === owner &&
      Boolean(gateRow?.reviewed_at) &&
      gateRow?.review_status === "good",
    `reviewed_by=${gateRow?.reviewed_by} status=${gateRow?.review_status}`
  );

  /*
   * A `good` STORY STILL SATISFIES THE LEG, and this is the acceptance half of
   * section 11's refusal. Without it, a my_story_for() that excluded every
   * REVIEWED story — not just kicked-back ones — would pass every assertion
   * about kickbacks and silently lock the leg for everybody Mitch approved.
   * That is the exact shape of a gate that is wrong in the cautious direction.
   */
  const { data: goodStillTold } = await authorC.rpc("my_story_for", {
    _certification: certId,
  });
  ok(
    "  ↳ and a story marked GOOD still satisfies the leg",
    goodStillTold === true,
    "my_story_for excluded an approved story — the leg is locked for everyone Mitch approves"
  );

  const { data: toldBefore } = await sb.rpc("my_story_for", { _certification: certId });
  void toldBefore;
  const { data: authorTold } = await authorC.rpc("my_story_for", {
    _certification: certId,
  });
  ok("my_story_for is true for the author", authorTold === true);

  const fresh = await makeUser("nostory", roofA, "advisor");
  const freshC = await signedInAs(fresh);
  const { data: freshTold } = await freshC.rpc("my_story_for", {
    _certification: certId,
  });
  ok(
    "  ↳ and false for an advisor who has not written one",
    freshTold === false,
    "the function cannot distinguish told from untold"
  );

  /* ==================================================================== */
  section("6 — an edit keeps the previous words");

  await authorC
    .from("advisor_story_revision")
    .insert({ story_id: storyId, body: "the original text" });
  const { error: editErr } = await authorC
    .from("advisor_story")
    .update({ body: "the edited text", updated_at: new Date().toISOString() })
    .eq("id", storyId);
  ok("the author can edit their own story", !editErr, editErr?.message);

  const { data: revs } = await mgrAC
    .from("advisor_story_revision")
    .select("body")
    .eq("story_id", storyId);
  ok(
    "the manager can see what it said before the edit",
    (revs ?? []).length === 1 && (revs ?? [])[0].body === "the original text"
  );

  const { data: revsCross } = await mgrBC
    .from("advisor_story_revision")
    .select("body")
    .eq("story_id", storyId);
  ok(
    "REFUSED: a manager at another rooftop cannot read the revisions either",
    (revsCross ?? []).length === 0,
    `saw ${(revsCross ?? []).length}`
  );

  /* ==================================================================== */
  section("7 — retire, never delete");

  const { error: delErr } = await authorC
    .from("advisor_story")
    .delete()
    .eq("id", storyId);
  const { data: stillThere } = await sb
    .from("advisor_story")
    .select("id")
    .eq("id", storyId);
  ok(
    "REFUSED: a story cannot be deleted, by anyone",
    (stillThere ?? []).length === 1,
    delErr ? undefined : "the delete was not refused"
  );

  const { error: retErr } = await authorC
    .from("advisor_story")
    .update({ retired_at: new Date().toISOString(), retired_reason: "withdrawn" })
    .eq("id", storyId);
  ok("  ↳ but it can be retired by its author", !retErr, retErr?.message);

  const { data: afterRetire } = await authorC.rpc("my_story_for", {
    _certification: certId,
  });
  ok("  ↳ and a retired story no longer satisfies the leg", afterRetire === false);

  const { data: reStory, error: reErr } = await authorC
    .from("advisor_story")
    .insert({
      user_id: author,
      rooftop_id: roofA,
      certification_id: certId,
      body: "a second attempt",
    })
    .select("id")
    .single();
  ok(
    "  ↳ and the slot is free again — one LIVE story per track, not one ever",
    !reErr && Boolean(reStory),
    reErr?.message
  );

  /* ==================================================================== */
  section("8 — the story waits for the lessons (0161)");

  /*
   * Ryan, 5 October: "I can submit my good news story ahead of completing all
   * of the videos. This should not be possible."
   *
   * A FRESH ADVISOR, so the refusal is about the lessons and nothing else: same
   * rooftop as the author, same track, their own user_id, every other arm of
   * the policy satisfied.
   */
  const earlyUser = await makeUser("early", roofA, "advisor");
  const earlyC = await signedInAs(earlyUser);

  const { error: earlyErr } = await earlyC.from("advisor_story").insert({
    user_id: earlyUser,
    rooftop_id: roofA,
    certification_id: certId,
    body: "day one, nothing watched",
  });
  ok(
    "REFUSED: a story cannot be written with the lessons outstanding",
    Boolean(earlyErr),
    earlyErr ? undefined : "the insert succeeded — the story does not wait for the lessons"
  );

  const { data: earlyGate } = await earlyC.rpc("my_track_lessons_complete", {
    _certification: certId,
  });
  ok(
    "  ↳ and the predicate agrees, asked as the advisor: not complete",
    earlyGate === false,
    `my_track_lessons_complete returned ${JSON.stringify(earlyGate)}`
  );

  /*
   * THE ACCEPTANCE HALF, and it is the one that would have caught the gate this
   * change nearly shipped. Keying on `my_certification_progress` — 0117's
   * `done_modules >= total_modules` — refuses this insert too, because the track
   * holds a cue-only module that can never earn a module_completion row. On
   * production that is six of the nine core tracks, locked forever and silently.
   *
   * Same client, same table, same row shape. Only the lessons changed.
   */
  await finishLessons(earlyUser, roofA);

  const { data: lateGate } = await earlyC.rpc("my_track_lessons_complete", {
    _certification: certId,
  });
  ok(
    "the GATING lessons done, the predicate opens — the cue-only module does not block it",
    lateGate === true,
    `my_track_lessons_complete returned ${JSON.stringify(lateGate)} — if false, the ` +
      `condition is counting every module rather than the gating ones`
  );

  const { data: lateStory, error: lateErr } = await earlyC
    .from("advisor_story")
    .insert({
      user_id: earlyUser,
      rooftop_id: roofA,
      certification_id: certId,
      body: "and now it is earned",
    })
    .select("id")
    .single();
  ok(
    "  ↳ and the SAME insert now succeeds — the refusal was the gate, not the wiring",
    !lateErr && Boolean(lateStory),
    lateErr?.message
  );

  /*
   * THE PREDICATE CANNOT BE POINTED AT SOMEBODY ELSE. It takes no user
   * argument, so there is nothing to forge — asked by the peer about the same
   * track it answers about the PEER. Proved by asking as a user who has NOT
   * finished and getting false for a track somebody else has finished.
   */
  const probeUser = await makeUser("probe", roofA, "advisor");
  const probeC = await signedInAs(probeUser);
  const { data: probeGate } = await probeC.rpc("my_track_lessons_complete", {
    _certification: certId,
  });
  ok(
    "the predicate answers about the CALLER, not about the track",
    probeGate === false,
    "it returned true for an advisor who has finished nothing — it is reading " +
      "somebody else's progress"
  );

  /* ====================================================================
     0180 — THE REVIEW QUEUE, THE KICKBACK, AND THE LEG
     ==================================================================== */

  section("9 — EDIAGD reads every rooftop; a dealer's admin still does not");

  /*
   * `owner` and `ownerC` are built with the other fixtures — see the note
   * there for why the membership is `advisor` and not `manager`, which is what
   * makes every read below attributable to 0180's arm and nothing else.
   * Section 2 already proved a plain advisor at roofA reads none of this, and
   * that is the non-vacuity for the whole section.
   */
  const { data: ownerFlag } = await ownerC.rpc("is_platform_owner");
  ok(
    "the fixture owner really is one, asked as themselves",
    ownerFlag === true,
    `is_platform_owner() returned ${JSON.stringify(ownerFlag)} — every assertion ` +
      `below would be about an ordinary advisor`
  );

  /* Store A's story — unshared, somebody else's, and they manage nothing. */
  await authorC.from("advisor_story").update({ shared_to_team: false }).eq("id", reStory!.id);
  const { data: ownerSeesA, error: ownerAErr } = await ownerC
    .from("advisor_story")
    .select("id")
    .eq("id", reStory!.id as string);
  ok(
    "a platform owner reads an unshared story at their own rooftop",
    !ownerAErr && (ownerSeesA ?? []).length === 1,
    ownerAErr?.message ?? `saw ${(ownerSeesA ?? []).length}`
  );

  /* Store B's story — the crossing itself. */
  const { data: ownerSeesB, error: ownerBErr } = await ownerC
    .from("advisor_story")
    .select("id")
    .eq("id", fenceStory?.id as string);
  ok(
    "  ↳ and a story at a rooftop they have no membership at",
    !ownerBErr && (ownerSeesB ?? []).length === 1,
    ownerBErr?.message ?? `saw ${(ownerSeesB ?? []).length}`
  );

  /*
   * THE OTHER HALF, AND IT IS THE ONE THAT PROVES 0180 DID NOT WIDEN RULE 4.
   *
   * A ROOFTOP ADMIN — a dealer's own admin, `admin` on a membership row, in
   * managed_rooftops() — reads store A and must still read nothing at store B.
   * 0127's header called rule 4 an absolute; 0180 edits it to "no dealer staff",
   * and this pair is what that edit claims.
   */
  const adminA = await makeUser("admin-a", roofA, "admin");
  const adminAC = await signedInAs(adminA);

  const { data: adminSeesA, error: adminAErr } = await adminAC
    .from("advisor_story")
    .select("id")
    .eq("id", reStory!.id as string);
  ok(
    "a rooftop admin reads their OWN store's story",
    !adminAErr && (adminSeesA ?? []).length === 1,
    adminAErr?.message ?? `saw ${(adminSeesA ?? []).length}`
  );

  const { data: adminSeesB, error: adminBErr } = await adminAC
    .from("advisor_story")
    .select("id")
    .eq("id", fenceStory?.id as string);
  ok(
    "REFUSED: and still reads NOTHING at store B — rule 4 holds for dealer staff",
    !adminBErr && (adminSeesB ?? []).length === 0,
    adminBErr
      ? `errored instead of refusing: ${adminBErr.message}`
      : `saw ${(adminSeesB ?? []).length} — the platform-owner arm has leaked to rooftop admins`
  );

  /* Revisions inherit the story's audience exactly, so the fourth arm has to be
     on both policies or the queue shows a body with no history behind it. */
  const { data: ownerRevs, error: ownerRevErr } = await ownerC
    .from("advisor_story_revision")
    .select("body")
    .eq("story_id", storyId);
  ok(
    "a platform owner reads the revisions too — the arm is on both policies",
    !ownerRevErr && (ownerRevs ?? []).length >= 1,
    ownerRevErr?.message ?? `saw ${(ownerRevs ?? []).length}`
  );

  /* ==================================================================== */
  section("10 — who may review, and what a review may say");

  /*
   * CROSS-ROOFTOP, which is the strongest form of the permission: Mitch
   * reviewing store B's story while holding no membership there. If this passes
   * and section 9's admin refusal also passes, the two doors are correctly
   * different.
   */
  const { error: ownerRevB } = await ownerC.rpc("review_story", {
    _story: fenceStory?.id as string,
    _status: "good",
  });
  ok(
    "a platform owner reviews a story at a rooftop they do not belong to",
    !ownerRevB,
    ownerRevB?.message
  );

  /*
   * THE AUTHOR IS REFUSED, and this is the one that matters most: review_status
   * decides a leg of the credential, so an author who could call this would be
   * marking their own homework.
   */
  const { error: selfRev } = await authorC.rpc("review_story", {
    _story: reStory!.id as string,
    _status: "good",
  });
  ok(
    "REFUSED: the author cannot review their own story",
    Boolean(selfRev),
    selfRev ? undefined : "an advisor marked their own story Good — the gate is decorative"
  );

  /* A colleague is not a reviewer either, and they are the likeliest
     accidental caller. */
  const { error: peerRev } = await peerC.rpc("review_story", {
    _story: reStory!.id as string,
    _status: "good",
  });
  ok(
    "REFUSED: a colleague at the same rooftop cannot review it",
    Boolean(peerRev),
    peerRev ? undefined : "any advisor at the store can review anybody's story"
  );

  /*
   * ---- THE CASE THE OLD SUITE COULD NOT SEE, AND THE REASON FOR THE CHANGE -
   *
   * AN AUTHOR WHO IS ALSO A MANAGER AT THEIR OWN ROOFTOP.
   *
   * "REFUSED: the author cannot review their own story" passed from the day it
   * was written — because the fixture author is a plain ADVISOR. It was
   * evidence about the sample it had built, stated as a fact about authors.
   *
   * managed_rooftops() names the rooftops the CALLER manages and says nothing
   * about WHOSE story it is, so an advisor who also holds a manager row
   * manages the rooftop their own story is stamped with. Valerie Patterson
   * holds one at Beaumont and has three stories there; under the first version
   * of review_story() she could have marked all three Good.
   *
   * So the fixture is built: one person, an advisor membership AND a manager
   * membership at the same rooftop, writing their own story and then trying to
   * mark it. This assertion is what fails if the managed_rooftops() arm ever
   * comes back.
   */
  const bothHats = await makeUser("both-hats", roofA, "advisor");
  const { error: hatErr } = await sb
    .from("membership")
    .insert({ user_id: bothHats, rooftop_id: roofA, role: "manager", active: true });
  ok("fixture: one person holding advisor AND manager at the same rooftop", !hatErr, hatErr?.message);

  const bothHatsC = await signedInAs(bothHats);
  const { data: hatManages } = await bothHatsC.rpc("managed_rooftops");
  ok(
    "  ↳ and managed_rooftops() really does name their own rooftop",
    JSON.stringify(hatManages ?? []).includes(roofA),
    `managed_rooftops() returned ${JSON.stringify(hatManages)} — if it omits roofA ` +
      `the refusal below is about nothing`
  );

  await finishLessons(bothHats, roofA);
  const { data: hatStory, error: hatStoryErr } = await bothHatsC
    .from("advisor_story")
    .insert({
      user_id: bothHats,
      rooftop_id: roofA,
      certification_id: certId,
      body: "my own story, at the store I manage",
    })
    .select("id")
    .single();
  ok("  ↳ and they can write their own story", !hatStoryErr && Boolean(hatStory), hatStoryErr?.message);

  const { error: hatSelfRev } = await bothHatsC.rpc("review_story", {
    _story: hatStory?.id as string,
    _status: "good",
  });
  ok(
    "REFUSED: an author who MANAGES their own rooftop still cannot review their own story",
    Boolean(hatSelfRev),
    hatSelfRev
      ? undefined
      : "they marked their own story Good. This is the Valerie Patterson case and " +
        "it is what the managed_rooftops() arm admitted — the author refusal above " +
        "passed the whole time because its fixture was a plain advisor"
  );

  const { data: hatRow } = await sb
    .from("advisor_story")
    .select("review_status")
    .eq("id", hatStory?.id as string)
    .single();
  ok(
    "  ↳ and the row is untouched — still pending, still in Mitch's queue",
    hatRow?.review_status === "pending",
    `review_status=${hatRow?.review_status}`
  );

  /*
   * ---- THE STATUS CHECKS RUN AS THE OWNER, AND THAT IS NOT INCIDENTAL -----
   *
   * These were a manager's calls until 10 November. Now that a manager is
   * refused outright, a refusal from one would have TWO possible causes — the
   * role or the status — and this file's own header says a refusal with two
   * possible causes tests neither. Asked as the one caller the function
   * accepts, so the only thing left to refuse is the value.
   */
  const { error: pendingRev } = await ownerC.rpc("review_story", {
    _story: reStory!.id as string,
    _status: "pending",
  });
  ok(
    "REFUSED: `pending` is not a verdict a reviewer may set — asked as the OWNER",
    Boolean(pendingRev),
    pendingRev ? undefined : "a reviewer can silently un-kick a story and leave the leg unmet"
  );

  for (const junk of ["GOOD", "approved", "", "kickback; drop table"]) {
    const { error: junkErr } = await ownerC.rpc("review_story", {
      _story: reStory!.id as string,
      _status: junk,
    });
    ok(
      `REFUSED: a status of ${JSON.stringify(junk)}`,
      Boolean(junkErr),
      junkErr ? undefined : "an unknown verdict was written to the column the leg reads"
    );
  }

  /*
   * NON-VACUOUS: the SAME client, the SAME story, a status that IS allowed. A
   * function that refused everything would pass every refusal above — which,
   * now that the permission is narrow, is exactly the failure mode to fear.
   */
  const { error: realRev } = await ownerC.rpc("review_story", {
    _story: reStory!.id as string,
    _status: "good",
  });
  ok(
    "  ↳ non-vacuous: the SAME caller and story with a real verdict succeeds",
    !realRev,
    realRev?.message ?? "the refusals above may be a function that refuses everything"
  );

  /* ==================================================================== */
  section("11 — a kickback returns the leg to unmet");

  /*
   * THE BEFORE READING IS TAKEN FIRST, through the real reader. Without it
   * "toldFor excludes the track" passes just as well against a loadStoryGate
   * that returns an empty set for everybody — a relation renamed, an RLS
   * refusal swallowed, a userId that matches nothing.
   */
  const gateBefore = await loadStoryGate(authorC as never, author);
  ok(
    "before the kickback, loadStoryGate().toldFor holds the track",
    gateBefore.toldFor.has(certId),
    `toldFor had ${gateBefore.toldFor.size} entries and not this one — every ` +
      `assertion below would pass against a reader that returns nothing`
  );
  ok(
    "  ↳ and kickedBackFor does not",
    !gateBefore.kickedBackFor.has(certId)
  );

  const { error: kickErr } = await ownerC.rpc("review_story", {
    _story: reStory!.id as string,
    _status: "kickback",
    _note: "say what you actually did differently",
  });
  ok("a platform owner can kick a story back", !kickErr, kickErr?.message);

  const { data: kickedTold } = await authorC.rpc("my_story_for", {
    _certification: certId,
  });
  ok(
    "my_story_for() goes FALSE — the leg is unmet",
    kickedTold === false,
    `my_story_for returned ${JSON.stringify(kickedTold)}; the kickback has no teeth`
  );

  const gateAfter = await loadStoryGate(authorC as never, author);
  ok(
    "  ↳ and loadStoryGate().toldFor drops the track, so every screen agrees",
    !gateAfter.toldFor.has(certId),
    "the credential derivation and the certifications wall would still read the " +
      "leg as met — my_story_for and loadStoryGate have diverged"
  );
  ok(
    "  ↳ and kickedBackFor names it, so the wall can say WHY rather than 'write one'",
    gateAfter.kickedBackFor.has(certId)
  );

  /* THE NOTE REACHES THE ADVISOR. It is the only part of a kickback that tells
     them what to do, and it is read through their own client. */
  const { data: noteRow } = await authorC
    .from("advisor_story")
    .select("review_note, review_status")
    .eq("id", reStory!.id as string)
    .single();
  ok(
    "  ↳ and the advisor can read the note Mitch left them",
    noteRow?.review_note === "say what you actually did differently" &&
      noteRow?.review_status === "kickback",
    `note=${JSON.stringify(noteRow?.review_note)} status=${noteRow?.review_status}`
  );

  /* ==================================================================== */
  section("12 — a rewrite clears it; a no-op save does not; the verdict is not the author's");

  /*
   * THE EXACT STATEMENT submitStory() ISSUES — body plus updated_at, through
   * the advisor's own client over PostgREST. There is only ONE path to test
   * because 0180 put the reset in a trigger rather than in the action: the
   * action writes no review_status (it holds no grant on it), so "through the
   * action" and "through a raw update" are the same UPDATE, and the trigger
   * covers both. That is the point of putting it there.
   */
  const { error: rewriteErr } = await authorC
    .from("advisor_story")
    .update({
      body: "I started opening the hood on every write-up and sold three belts that week.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reStory!.id as string);
  ok("the author can rewrite the body of a kicked-back story", !rewriteErr, rewriteErr?.message);

  const { data: afterRewrite } = await sb
    .from("advisor_story")
    .select("review_status, review_note")
    .eq("id", reStory!.id as string)
    .single();
  ok(
    "  ↳ the rewrite returns it to PENDING and clears the note",
    afterRewrite?.review_status === "pending" && afterRewrite?.review_note === null,
    `status=${afterRewrite?.review_status} note=${JSON.stringify(afterRewrite?.review_note)}`
  );

  const { data: rewrittenTold } = await authorC.rpc("my_story_for", {
    _certification: certId,
  });
  ok(
    "  ↳ and the leg is met again — editing is what clears a kickback",
    rewrittenTold === true,
    "the advisor rewrote it and the leg stayed unmet; there is nothing left for them to do"
  );

  /*
   * A NO-OP SAVE IS NOT A REWRITE, and this is the assertion the obvious
   * trigger fails. Without `new.body is distinct from old.body`, pressing Save
   * on unchanged text clears the kickback and re-satisfies the leg — the thin
   * story getting through by a second route.
   */
  const unchanged = "I started opening the hood on every write-up and sold three belts that week.";
  await ownerC.rpc("review_story", {
    _story: reStory!.id as string,
    _status: "kickback",
    _note: "still not substantial",
  });
  await authorC
    .from("advisor_story")
    .update({ body: unchanged, updated_at: new Date().toISOString() })
    .eq("id", reStory!.id as string);
  const { data: afterNoop } = await sb
    .from("advisor_story")
    .select("review_status, review_note")
    .eq("id", reStory!.id as string)
    .single();
  ok(
    "REFUSED: saving UNCHANGED text does not clear the kickback",
    afterNoop?.review_status === "kickback" && afterNoop?.review_note === "still not substantial",
    `status=${afterNoop?.review_status} — a rewrite that rewrote nothing satisfied the leg`
  );

  /*
   * ---- THE COLUMN GRANT, BOTH HALVES -----------------------------------
   *
   * 0127 granted `update` on the whole table to `authenticated` and said why a
   * definer function was used for review anyway. That grant was harmless while
   * review gated nothing; since 0180 §1 it would be an advisor writing their own
   * verdict. The grant is now column-level, and BOTH halves are proved — a
   * revoke that took the body with it would pass the refusal and lock an advisor
   * out of their own words, which is a false refusal wearing the costume of care.
   */
  const { error: forgeVerdict } = await authorC
    .from("advisor_story")
    .update({ review_status: "good" })
    .eq("id", reStory!.id as string);
  ok(
    "REFUSED: the author cannot write review_status directly",
    Boolean(forgeVerdict),
    forgeVerdict
      ? undefined
      : "an advisor marked their own story Good over PostgREST, past review_story() entirely"
  );

  const { error: forgeNote } = await authorC
    .from("advisor_story")
    .update({ review_note: "nothing to see here" })
    .eq("id", reStory!.id as string);
  ok(
    "REFUSED: …nor review_note, so they cannot erase the ask",
    Boolean(forgeNote),
    forgeNote ? undefined : "an advisor cleared the note telling them what to do"
  );

  const { error: forgeStamp } = await authorC
    .from("advisor_story")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", reStory!.id as string);
  ok(
    "REFUSED: …nor the reviewed_at stamp",
    Boolean(forgeStamp),
    forgeStamp ? undefined : "an advisor can forge the record of having been read"
  );

  const { error: ownWords } = await authorC
    .from("advisor_story")
    .update({ body: "and the words are still mine to change", updated_at: new Date().toISOString() })
    .eq("id", reStory!.id as string);
  ok(
    "  ↳ non-vacuous: the SAME client still writes its OWN body",
    !ownWords,
    ownWords?.message ??
      "the column grant revoked more than it meant to — an advisor cannot edit " +
        "the one record that is supposed to be their own words"
  );

  const { error: ownSharing } = await authorC
    .from("advisor_story")
    .update({ shared_to_team: true })
    .eq("id", reStory!.id as string);
  ok(
    "  ↳ …and still decides their own sharing",
    !ownSharing,
    ownSharing?.message
  );
  await authorC.from("advisor_story").update({ shared_to_team: false }).eq("id", reStory!.id as string);

  /* ==================================================================== */
  section("13 — a kickback never revokes a credential (0127 §2)");

  /*
   * RETIRE, NEVER REVOKE. A review that arrives late must not yank a credential
   * somebody already holds — 0127 ruled it and 0180 touches
   * advisor_certification not at all. Asserted as a POSITIVE, because "nothing
   * changed" is the kind of claim that passes when the row was never written.
   */
  const { error: grantErr } = await sb.from("advisor_certification").insert({
    user_id: author,
    certification_id: certId,
    current_through: "2099-12-31",
    source: "accrued",
  });
  ok("fixture: the author holds the track", !grantErr, grantErr?.message);

  const { data: heldBefore } = await sb
    .from("advisor_certification")
    .select("id, earned_at")
    .eq("user_id", author)
    .eq("certification_id", certId)
    .single();
  ok("  ↳ and the fixture is real", Boolean(heldBefore?.id), "nothing to protect");

  await ownerC.rpc("review_story", {
    _story: reStory!.id as string,
    _status: "kickback",
    _note: "on a track they already earned",
  });

  const { data: heldAfter } = await sb
    .from("advisor_certification")
    .select("id, earned_at")
    .eq("user_id", author)
    .eq("certification_id", certId)
    .maybeSingle();
  ok(
    "the credential survives a kickback, untouched",
    Boolean(heldAfter?.id) &&
      heldAfter?.id === heldBefore?.id &&
      heldAfter?.earned_at === heldBefore?.earned_at,
    `before=${JSON.stringify(heldBefore)} after=${JSON.stringify(heldAfter)}`
  );

  const { data: legNow } = await authorC.rpc("my_story_for", { _certification: certId });
  ok(
    "  ↳ while the LEG is unmet — the two are different questions, and that is the ruling",
    legNow === false,
    "the kickback did nothing at all, so this section proved nothing either"
  );

  /* ==================================================================== */
  section("14 — the #ediagd notice says who, where and which track, never the words");

  /*
   * THE BUILDER THE ACTION ACTUALLY CALLS, imported rather than restated. A
   * local copy of the format string here would assert the copy.
   *
   * SLACK SITS OUTSIDE THE RLS. 0127 spent a migration on who may read a story;
   * a channel post is a copy of the text somewhere none of that applies, and the
   * one thing a webhook cannot take back is a body it has already posted.
   */
  const body = "I walked the belt on a 2019 Pilot and the customer said yes.";
  const text = storySlackText({
    advisorName: "Valerie Patterson",
    rooftopName: "Doggett Ford of Beaumont",
    trackName: "Walk Around",
    appUrl: "https://app.ediagd.ai",
  });

  ok("the notice names the advisor", text.includes("Valerie Patterson"), text);
  ok("  ↳ and the rooftop", text.includes("Doggett Ford of Beaumont"), text);
  ok("  ↳ and the track", text.includes("Walk Around"), text);
  ok(
    "  ↳ and links to the queue",
    text.includes("https://app.ediagd.ai/admin/stories"),
    text
  );
  ok(
    "NEVER the story's words",
    !text.includes(body),
    "the body reached a channel that sits outside the RLS, and a webhook post " +
      "cannot be taken back"
  );
  /* The email is not in it either. The feedback post carries one because
     feedback is a ticket somebody answers; this is not. */
  ok(
    "  ↳ and no email address",
    !/@/.test(text),
    `an address reached the channel: ${text}`
  );

  /* ==================================================================== */
  section("15 — the SERVICE ROLE still reads the gate (the accrual's own path)");

  /*
   * ---------------------------------------------------------------------
   * THE BACKEND IS A CALLER, AND IT IS THE ONE THIS CODEBASE KEEPS LOSING
   * ---------------------------------------------------------------------
   * AGENTS.md names this three times: has_performance_surface() keyed on
   * auth.uid() shut out the service role it was written to serve;
   * op_code_family read as the advisor returned zero rows and no error;
   * dms_advisor_read excluded the only people the disclosure protects.
   *
   * certification-server.ts:221 calls loadStoryGate with the SERVICE client,
   * during credential accrual — and 0180 added `is_platform_owner()` to the
   * read policy, which keys on auth.uid() and is therefore FALSE for the
   * backend.
   *
   * ---------------------------------------------------------------------
   * WHAT THIS SECTION CAN AND CANNOT PROVE. MEASURED, NOT ASSUMED
   * ---------------------------------------------------------------------
   * The first assertion below CANNOT FAIL BY POLICY, and saying so is the
   * point. This was checked rather than reasoned about: the read policy was
   * rewritten with `bypasses_rls()` deleted, `force row level security` set on
   * the table, and this suite re-run — 75 passed, 0 failed. `service_role`
   * carries the BYPASSRLS **role attribute**, so policies are skipped for it
   * before any arm is evaluated, and `force` binds only the table owner.
   *
   * So "the backend can still read advisor_story" is not a claim any policy
   * change can falsify, and an assertion dressed as proof of it would be a
   * check that cannot fail. It stays as a smoke test on the QUERY — a column
   * renamed, a relation moved, a select that stops parsing.
   *
   * THE SECOND ASSERTION DOES HAVE TEETH, over the thing 0180 actually
   * changed: that the accrual's `toldFor` and the screens' `toldFor` are the
   * same partition. Proved by breaking it — with loadStoryGate's
   * review_status filter removed, this section and section 11 both fail (2
   * failed), and the message names the divergence.
   *
   * IT IS THE DIVERGENCE THAT WOULD HAVE BEEN SILENT. The accrual reading a
   * `toldFor` that still held a kicked-back track would grant the credential
   * the screens were telling the advisor they had not finished — no error
   * anywhere, and the one surface claiming otherwise is the one nobody audits.
   *
   * `sb` IS THE SERVICE CLIENT, so this is the real role and not a stand-in.
   */
  const serviceGate = await loadStoryGate(sb as never, author);
  ok(
    "the service role's gate query parses and answers (a smoke test, not a policy proof)",
    serviceGate.storyRequired === true || serviceGate.storyRequired === false,
    "loadStoryGate threw or returned nothing for the backend — the accrual " +
      "would grant no credentials and say nothing"
  );
  ok(
    "  ↳ and sees the same kickback the advisor sees",
    serviceGate.kickedBackFor.has(certId) && !serviceGate.toldFor.has(certId),
    `toldFor=${serviceGate.toldFor.has(certId)} kickedBack=${serviceGate.kickedBackFor.has(certId)} ` +
      `— the accrual and the screens disagree about the leg`
  );

  /* AND THE SAME FOR THE FUNCTION THE ACCRUAL CALLS. my_story_for() is granted
     to service_role (0127, kept by 0180) and keys on auth.uid(), which is NULL
     for the backend — so it answers `false` rather than erroring, and that is
     what certification-server.ts relies on loadStoryGate for instead. Asserted
     so the division of labour is recorded rather than assumed. */
  const { data: serviceStoryFor, error: serviceStoryErr } = await sb.rpc("my_story_for", {
    _certification: certId,
  });
  ok(
    "my_story_for() is callable by the service role and returns a boolean, not an error",
    !serviceStoryErr && typeof serviceStoryFor === "boolean",
    serviceStoryErr?.message ?? `returned ${JSON.stringify(serviceStoryFor)}`
  );

  /* ---- Cleanup -------------------------------------------------------- */
  await sb.from("advisor_certification").delete().eq("certification_id", certId);
  await sb.from("advisor_story").delete().eq("certification_id", certId);
  await sb.from("module_completion").delete().in("module_id", [lessonMod, cueMod]);
  await sb.from("content_progress").delete().eq("content_id", filmId);
  await sb.from("certification_course").delete().eq("certification_id", certId);
  await sb.from("certification").delete().eq("id", certId);
  await sb.from("content").delete().in("module_id", [lessonMod, cueMod]);
  await sb.from("module").delete().in("id", [lessonMod, cueMod]);
  await sb.from("course").delete().eq("id", course!.id);
  await sb.from("membership").delete().in("user_id", madeUsers);
  await sb.from("app_user").delete().in("id", madeUsers);
  for (const id of madeUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("rooftop").delete().in("id", [roofA, roofB]);
  await sb.from("org").delete().eq("id", org!.id);
}

main()
  .then(() => {
    console.log("\n" + "=".repeat(64));
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed) {
      console.log("\nFailures:");
      for (const f of failures) console.log("  ✗ " + f);
    }
    console.log("=".repeat(64));
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("\nSUITE ERROR:", e.message);
    process.exit(1);
  });
