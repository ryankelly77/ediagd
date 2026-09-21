/* ============================================================================
   EDIAGD — the Good News Story, proved as refusals

   Ruling 3 of 3e: the RLS is the feature, not a detail. This is the first place
   in the product where an advisor writes free text about their own work, their
   customers and their colleagues, and a manager reads it.

   Four rules, and every one is proved HERE AS A REFUSAL, over PostgREST, as the
   role that really calls — not as the service role, which bypasses the thing
   under test.

     1. an advisor reads and writes their OWN stories, always
     2. a manager reads stories of advisors AT THEIR OWN ROOFTOP, nothing else
     3. a shared story reaches advisors at that rooftop, and only when shared
     4. nobody reads across rooftops — not a manager at another store

   AND EVERY REFUSAL IS PROVED NON-VACUOUS. A test that asserts "this query
   returns nothing" passes just as well when the relation is missing, the login
   failed, or the fixture was never written. So each refusal is paired with the
   same read succeeding for somebody who IS entitled to it. An assertion that
   cannot distinguish a working lock from a missing door is not a test.

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:story
   ============================================================================ */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

async function makeUser(
  label: string,
  rooftop: string,
  role: "advisor" | "manager"
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
  await sb.from("app_user").upsert({ id, full_name: `${TAG} ${label}` });
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

  const author = await makeUser("author", roofA, "advisor");
  const peerA = await makeUser("peer-a", roofA, "advisor");
  const mgrA = await makeUser("mgr-a", roofA, "manager");
  const mgrB = await makeUser("mgr-b", roofB, "manager");

  const authorC = await signedInAs(author);
  const peerC = await signedInAs(peerA);
  const mgrAC = await signedInAs(mgrA);
  const mgrBC = await signedInAs(mgrB);

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
  section("5 — review records who and when, and gates nothing");

  const { error: revErr } = await mgrAC.rpc("mark_story_reviewed", { _story: storyId });
  ok("the rooftop's manager can mark a story reviewed", !revErr, revErr?.message);

  const { error: revCrossErr } = await mgrBC.rpc("mark_story_reviewed", {
    _story: storyId,
  });
  ok(
    "REFUSED: a manager at another rooftop cannot review it",
    Boolean(revCrossErr),
    revCrossErr ? undefined : "the review succeeded across the rooftop fence"
  );

  const { data: gateRow } = await sb
    .from("advisor_story")
    .select("reviewed_by, reviewed_at")
    .eq("id", storyId)
    .single();
  ok(
    "  ↳ and it recorded who and when",
    gateRow?.reviewed_by === mgrA && Boolean(gateRow?.reviewed_at)
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

  /* ---- Cleanup -------------------------------------------------------- */
  await sb.from("advisor_story").delete().eq("certification_id", certId);
  await sb.from("certification").delete().eq("id", certId);
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
