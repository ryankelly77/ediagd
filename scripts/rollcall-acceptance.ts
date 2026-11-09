/* ============================================================================
   EDIAGD — Rollcall, proved as acceptances AND refusals

   0163 puts a record of what every advisor tapped into the database. That is a
   record ABOUT people, kept FOR the team, so who may read it is the feature and
   not a detail — and every claim below is asked over PostgREST AS THE ROLE THAT
   REALLY CALLS, never as the service role, which bypasses the thing under test.

   ---------------------------------------------------------------------------
   THE ACCEPTANCE HALF COMES FIRST, DELIBERATELY
   ---------------------------------------------------------------------------
   "A refusal is not self-verifying." A suite that only asserted "an advisor
   reads nothing" would pass against a missing table, a failed login, a fixture
   that was never written, or a gate that achieved exclusion by making the whole
   relation unreadable to everybody. So section 1 proves the reads that MUST
   work, and every refusal afterwards is paired with the same query succeeding
   for somebody entitled to it.

   WHAT IS PROVED
     1  platform owner, admin and manager READ their rooftop's events — table
        and view — and the view agrees with the table
     2  an advisor reads ZERO, INCLUDING THEIR OWN
     3  a manager at another store reads zero of this store's
     4  `authenticated` cannot INSERT. This is the real control: a person who
        can write their own attendance can manufacture a record of turning up
     5  the kind constraint refuses an unfamiliar kind
     6  rooftop_id is mandatory, so no event can be written invisible to the
        policy that keys on it
     7  the signed_in dedup key makes a second ping in the same store-day a
        no-op rather than a second row
     8  loadRollcall reports what happened, including a zero row for somebody
        who has done nothing, and does not leak the other rooftop
     9  the cert meter counts GATING modules of the ACTIVE CORE tracks, and a
        HELD track reads as full — read as the service role, which is the role
        the cron really uses
    10  THE SAME LOADER, READ AS A MANAGER AND AS AN ADMIN, AGREES WITH IT —
        0179's read path, proved by the roles that really call it, including
        the equality of the numerator and of the denominator; and a manager at
        another rooftop still reads zero, so the policy is proved to SCOPE and
        not merely to open
    10b the manager's DENOMINATOR is zero for a reason 0179 does not touch —
        `content_entitled_read` admits the advisor role for advisor_video and
        the admin is admitted by `content_admin_all` instead — and a
        manager-only account cannot reach /admin/engagement anyway, which is
        asserted rather than claimed
    11  the change window reports lesson completions as one count, and the
        first-time facts are proved to be FIRSTS: a second sign-in and a fourth
        morning fire neither, which is the defect in the 6 November post
    12  the Slack message renders from what the loader actually returned

   The post's COLUMNS AND SENTENCES are proved line by line, without a
   database, in `npm run test:rollcall-message`. This file proves the data.

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:rollcall

   PROVEN NON-VACUOUS, BOTH DIRECTIONS, BOTH RECORDED:

     · with app_event_team_read replaced by `using (true)` the four refusals in
       sections 2 and 3 fail.
     · with 0179 reverted — module_completion_read dropped and 0035's
       own-rows-only policy put back — SEVEN of section 10's acceptances fail,
       including the admin's numerator equality, which is the whole point of the
       change. The advisor's own read keeps passing, which is correct: 0035 did
       that too, and an acceptance that failed there would be testing the wrong
       thing. Measured 8 November; 75 passed / 0 failed with 0179 applied.
   ============================================================================ */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRollcall, loadRollcallChanges } from "@/lib/rollcall";
import { buildRollcallMessage } from "@/lib/rollcall-message";

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
const TAG = `rollcall-acc-${randomUUID().slice(0, 6)}`;
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
  role: "advisor" | "manager" | "admin",
  options: { platformOwner?: boolean } = {}
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
  await sb.from("app_user").upsert({
    id,
    full_name: `${TAG} ${label}`,
    is_platform_owner: options.platformOwner ?? false,
  });
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

/** The store-date an instant fell on, in a named zone. */
function dateIn(timeZone: string, instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Store-local today for a Chicago rooftop, which is what the fixtures use. */
function chicagoToday(): string {
  return dateIn("America/Chicago", new Date());
}

async function main() {
  /* ---- Fixtures: two rooftops, so "across rooftops" is a real boundary --- */
  const { data: org, error: orgErr } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

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

  /* ---- BOTH STORES HAVE BOUGHT THE PRODUCT ------------------------------
     Beaumont has, so a fixture rooftop without it would be testing a store
     that does not exist. It also makes section 10's denominator finding
     unambiguous: with the product in place, an ADVISOR at this rooftop reads
     the films and a MANAGER still does not, so the exclusion is provably about
     the ROLE rather than about entitlement. */
  for (const roof of [roofA, roofB]) {
    const { error } = await sb
      .from("rooftop_product")
      .insert({ rooftop_id: roof, product: "advisor_base" });
    if (error) throw new Error(`rooftop_product: ${error.message}`);
  }

  /* A certification and a module, so track_opened and lesson_opened have real
     targets and the Rollcall can be checked on whether it NAMES the track. */
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
    .select("id, name")
    .single();
  if (cErr) throw new Error(`certification: ${cErr.message}`);
  const certId = cert!.id as string;

  const { data: course, error: coErr } = await sb
    .from("course")
    .insert({ track: "craft", name: `${TAG} Course`, slug: `${TAG}-course` })
    .select("id")
    .single();
  if (coErr) throw new Error(`course: ${coErr.message}`);
  const { data: mod, error: mErr } = await sb
    .from("module")
    .insert({ course_id: course!.id, name: `${TAG} Module`, sort_order: 1 })
    .select("id")
    .single();
  if (mErr) throw new Error(`module: ${mErr.message}`);
  const moduleId = mod!.id as string;

  /* ---- THE CRAFT LADDER, so the cert meter measures something real -------
     Two ACTIVE CORE tracks, each one course, each one module, each module
     holding one PUBLISHED advisor_video — which is what makes a module GATE
     (gatingModuleIds, and gating_content_types() behind it). A module with
     only a cue can never complete, so a track built from one would give the
     meter a denominator nobody can fill. */
  const mkCoreTrack = async (label: string, sort: number) => {
    const { data: c, error: certErr } = await sb
      .from("certification")
      .insert({
        slug: `${TAG}-${label}`,
        name: `${TAG} ${label}`,
        kind: "craft",
        is_core: true,
        active: true,
        glyph_key: "craft_walk_around",
        sort,
      })
      .select("id, name")
      .single();
    if (certErr) throw new Error(`core cert ${label}: ${certErr.message}`);

    const { data: co, error: coErr } = await sb
      .from("course")
      .insert({ track: "craft", name: `${TAG} ${label} Course`, slug: `${TAG}-${label}-course` })
      .select("id")
      .single();
    if (coErr) throw new Error(`core course ${label}: ${coErr.message}`);

    const { data: m, error: modErr } = await sb
      .from("module")
      .insert({ course_id: co!.id, name: `${TAG} ${label} Module`, sort_order: 1 })
      .select("id")
      .single();
    if (modErr) throw new Error(`core module ${label}: ${modErr.message}`);

    const { error: linkErr } = await sb
      .from("certification_course")
      .insert({ certification_id: c!.id, course_id: co!.id, sort: 1 });
    if (linkErr) throw new Error(`certification_course ${label}: ${linkErr.message}`);

    const { data: film, error: filmErr } = await sb
      .from("content")
      .insert({
        type: "advisor_video",
        title: `${TAG} ${label} film`,
        status: "published",
        module_id: m!.id,
      })
      .select("id")
      .single();
    if (filmErr) throw new Error(`gating content ${label}: ${filmErr.message}`);

    return {
      certId: c!.id as string,
      certName: c!.name as string,
      courseId: co!.id as string,
      moduleId: m!.id as string,
      contentId: film!.id as string,
    };
  };

  const advisorA = await makeUser("advisorA", roofA, "advisor");
  const quietA = await makeUser("quietA", roofA, "advisor");
  /* Somebody with a HISTORY: signed in weeks ago, three mornings behind them.
     The 6 November post called seven people like this "first sign-in". */
  const veteranA = await makeUser("veteranA", roofA, "advisor");
  const managerA = await makeUser("managerA", roofA, "manager");
  const adminA = await makeUser("adminA", roofA, "admin");
  const managerB = await makeUser("managerB", roofB, "manager");
  const advisorB = await makeUser("advisorB", roofB, "advisor");
  const owner = await makeUser("owner", roofB, "advisor", { platformOwner: true });

  /* ======================================================================
     THE BASELINE, MEASURED BEFORE THE FIXTURE TRACKS EXIST

     The local database is SEEDED: `supabase start` applies every migration,
     and several of them create real core certifications with real films. So
     "the denominator is 2" was a fixture author's assumption about an empty
     catalogue, and it was wrong the first time it ran — 4, because two seeded
     core tracks already gate. An absolute number here is a claim about the
     seed rather than about the loader.

     So the catalogue is measured FIRST and every assertion below is a
     DIFFERENCE: this suite's two tracks add exactly two gating modules and two
     active core tracks, whatever the seed happens to hold. That is the
     reconciliation discipline the standing rules ask for, and it does not go
     stale the next time a migration publishes a film.

     The advisors exist at this point and have done nothing, so the baseline
     also establishes that their completed count starts at zero — without which
     "1 of n" below could be inherited rather than caused.
     ====================================================================== */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseline = await loadRollcall(sb as any, roofA);
  const baseGating = baseline.rows[0]?.certs.gatingTotal ?? 0;
  const baseCoreTracks = baseline.coreTracks;
  const baseDone = new Map(baseline.rows.map((r) => [r.userId, r.certs.gatingDone]));

  const trackDone = await mkCoreTrack("core-done", 901);
  const trackHeld = await mkCoreTrack("core-held", 902);
  const coreTrackIds = [trackDone.certId, trackHeld.certId];
  const coreCourseIds = [trackDone.courseId, trackHeld.courseId];
  const coreModuleIds = [trackDone.moduleId, trackHeld.moduleId];
  const coreContentIds = [trackDone.contentId, trackHeld.contentId];

  /* Schedules, so "onboarded" has something to say and the row is Ready-ish.
     Fixture-building as the service role: what is under test is the reading.

     THE ERROR IS CHECKED. The first draft of this suite wrote `mon/tue/...`
     instead of `works_mon/...`, ignored the 400, and then reported "0
     onboarded" — a fixture that never landed reading identically to a loader
     that cannot see it. A suite that swallows its own setup errors is testing
     a state nobody established. */
  for (const id of [advisorA, quietA]) {
    const { error } = await sb.from("work_schedule").insert({
      user_id: id,
      works_mon: true,
      works_tue: true,
      works_wed: true,
      works_thu: true,
      works_fri: true,
      works_sun: false,
      saturday_mode: "none",
      schedule_set_at: new Date().toISOString(),
    });
    if (error) throw new Error(`work_schedule fixture: ${error.message}`);
  }

  /* A completed morning for advisorA, so the mornings fact is non-zero and the
     lessonsInLoop reconciliation has something to compare against. */
  {
    const { error } = await sb.from("daily_completion").insert({
      user_id: advisorA,
      rooftop_id: roofA,
      completion_date: chicagoToday(),
    });
    if (error) throw new Error(`daily_completion fixture: ${error.message}`);
  }

  /* ---- The veteran's three mornings, two of them OLD ---------------------
     created_at is written EXPLICITLY, because that is the column the change
     window is keyed on and a default of now() would put all three inside it —
     a fixture that cannot distinguish a first morning from a fourth cannot
     test the thing this section exists for. */
  {
    const days = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - n);
      return d;
    };
    const rows = [
      { date: dateIn("America/Chicago", days(11)), at: days(11) },
      { date: dateIn("America/Chicago", days(10)), at: days(10) },
      /* Today's — the only one inside the window. */
      { date: chicagoToday(), at: new Date() },
    ];
    for (const r of rows) {
      const { error } = await sb.from("daily_completion").insert({
        user_id: veteranA,
        rooftop_id: roofA,
        completion_date: r.date,
        created_at: r.at.toISOString(),
      });
      if (error) throw new Error(`veteran daily_completion: ${error.message}`);
    }
  }

  /* ---- What they have finished, and what one of them HOLDS ---------------
     advisorA has completed trackDone's only gating module. quietA has
     completed nothing and HOLDS trackHeld — which must read as full, because
     a track earned before a tenth lesson was published is still earned. The
     two cases together are the only way to tell the rule from a plain count. */
  for (const [userId, moduleId_, roof] of [
    [advisorA, trackDone.moduleId, roofA],
    /* TWO PEOPLE AT STORE A, and that is not padding. A cross-user read has to
       be shown to pick up somebody OTHER than the one row that might be the
       caller's own, so section 10 compares a manager's answer and the service
       role's over two different advisors. */
    [veteranA, trackHeld.moduleId, roofA],
    /* AND ONE AT STORE B, so section 10's cross-rooftop refusal has something
       to refuse. A manager at B reading zero of A's proves scope only if the
       same manager, the same query, DOES read their own store's — otherwise it
       is also consistent with a broken session or an empty table. */
    [advisorB, trackDone.moduleId, roofB],
  ] as const) {
    const { error } = await sb.from("module_completion").insert({
      user_id: userId,
      module_id: moduleId_,
      rooftop_id: roof,
    });
    if (error) throw new Error(`module_completion fixture: ${error.message}`);
  }
  {
    /* current_through is NOT NULL — earned_at + a year, which is the annual
       currency the credential carries. Dated a year out so the fixture holds a
       CURRENT credential and not a lapsed one. */
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    const { error } = await sb.from("advisor_certification").insert({
      user_id: quietA,
      certification_id: trackHeld.certId,
      current_through: nextYear.toISOString().slice(0, 10),
    });
    if (error) throw new Error(`advisor_certification fixture: ${error.message}`);
  }

  /* And a daily_activity row, which is what "password set" reads. The two are
     separate records on purpose — app_event.signed_in exists for the PLATFORM
     and nothing else, because daily_activity already answers "which days did
     they open the app" and two counters for one fact drift. */
  {
    const { error } = await sb.from("daily_activity").insert({
      user_id: advisorA,
      rooftop_id: roofA,
      activity_date: chicagoToday(),
      logged_in: true,
      videos_watched: 0,
    });
    if (error) throw new Error(`daily_activity fixture: ${error.message}`);
  }

  /* ---- The events. Written as the service role, which is the ONLY writer -- */
  const ev = async (
    userId: string,
    rooftopId: string,
    kind: string,
    extra: Record<string, unknown> = {}
  ) => {
    const { error } = await sb
      .from("app_event")
      .insert({ user_id: userId, rooftop_id: rooftopId, kind, ...extra });
    if (error) throw new Error(`event ${kind}: ${error.message}`);
  };

  await ev(advisorA, roofA, "signed_in", {
    meta: { platform: "ios" },
    dedup_key: `${advisorA}:signed_in:${chicagoToday()}`,
  });
  await ev(advisorA, roofA, "certs_opened");
  await ev(advisorA, roofA, "certs_opened");
  await ev(advisorA, roofA, "track_opened", { target_id: certId });
  await ev(advisorA, roofA, "library_opened");
  await ev(advisorA, roofA, "lesson_opened", { target_id: moduleId });
  await ev(advisorA, roofA, "lesson_completed", {
    target_id: moduleId,
    meta: { source: "library", content_id: null },
  });
  await ev(advisorA, roofA, "lesson_completed", {
    target_id: moduleId,
    meta: { source: "loop", content_id: null },
  });
  await ev(advisorA, roofA, "story_submitted", { target_id: certId });

  /* ---- THE VETERAN'S TWO SIGN-INS, AND THIS IS THE WHOLE POINT -----------
     One forty days ago, one today. Any rule that fires "signed in from a
     phone" on the presence of a native sign-in inside the window would call
     the second one an install — which is exactly what the 6 November post
     did for seven people. `at` is set explicitly for the same reason the
     veteran's completions are. */
  {
    const longAgoAt = new Date();
    longAgoAt.setUTCDate(longAgoAt.getUTCDate() - 40);
    await ev(veteranA, roofA, "signed_in", {
      meta: { platform: "ios" },
      at: longAgoAt.toISOString(),
      dedup_key: `${veteranA}:signed_in:${dateIn("America/Chicago", longAgoAt)}`,
    });
  }
  await ev(veteranA, roofA, "signed_in", {
    meta: { platform: "ios" },
    dedup_key: `${veteranA}:signed_in:${chicagoToday()}`,
  });

  /* The other store, so a cross-rooftop leak has something to leak. */
  await ev(advisorB, roofB, "certs_opened");

  /* ======================================================================
     1. THE ACCEPTANCES. FIRST, so nothing below can pass against an empty
        table or a relation nobody can read.
     ====================================================================== */
  section("1. The team can read it — table and view, as the roles that really call");

  const ownerC = await signedInAs(owner);
  const adminC = await signedInAs(adminA);
  const managerAC = await signedInAs(managerA);
  const managerBC = await signedInAs(managerB);
  const advisorAC = await signedInAs(advisorA);

  const countFor = async (client: SupabaseClient, rooftopId: string) => {
    const { data, error } = await client
      .from("app_event")
      .select("id")
      .eq("rooftop_id", rooftopId);
    return { rows: (data ?? []).length, error: error?.message ?? null };
  };

  const ownerAtA = await countFor(ownerC, roofA);
  ok(
    "platform owner reads rooftop A's events (11 written)",
    ownerAtA.rows === 11,
    `got ${ownerAtA.rows}${ownerAtA.error ? ` (${ownerAtA.error})` : ""}`
  );

  const adminAtA = await countFor(adminC, roofA);
  ok(
    "admin at A reads A's events",
    adminAtA.rows === 11,
    `got ${adminAtA.rows}${adminAtA.error ? ` (${adminAtA.error})` : ""}`
  );

  const mgrAtA = await countFor(managerAC, roofA);
  ok(
    "manager at A reads A's events",
    mgrAtA.rows === 11,
    `got ${mgrAtA.rows}${mgrAtA.error ? ` (${mgrAtA.error})` : ""}`
  );

  /* THE VIEW IS A SEPARATE CLAIM. A view over an RLS'd table defaults to the
     owner's privileges, and left that way it would hand every row to anybody —
     a gate lost in the one place nobody looks for it. */
  const { data: adminAgg, error: aggErr } = await adminC
    .from("app_event_rollcall")
    .select("kind, events")
    .eq("rooftop_id", roofA);
  const aggTotal = ((adminAgg ?? []) as { events: number }[]).reduce(
    (s, r) => s + Number(r.events),
    0
  );
  ok(
    "admin reads the same 11 through app_event_rollcall, and the view agrees with the table",
    aggTotal === 11,
    `view summed to ${aggTotal}${aggErr ? ` (${aggErr.message})` : ""}`
  );

  /* ======================================================================
     2. THE ADVISOR READS NOTHING — INCLUDING THEIR OWN
     ====================================================================== */
  section("2. An advisor reads nothing, not even their own");

  const advisorOwnRows = await countFor(advisorAC, roofA);
  ok(
    "advisor reads ZERO of app_event at their own rooftop",
    advisorOwnRows.rows === 0,
    `got ${advisorOwnRows.rows} — the record about them is readable by them`
  );

  const { data: advisorOwnById } = await advisorAC
    .from("app_event")
    .select("id")
    .eq("user_id", advisorA);
  ok(
    "advisor reads ZERO of their OWN rows asked for by user id",
    (advisorOwnById ?? []).length === 0,
    `got ${(advisorOwnById ?? []).length}`
  );

  const { data: advisorAgg } = await advisorAC
    .from("app_event_rollcall")
    .select("kind")
    .eq("rooftop_id", roofA);
  ok(
    "advisor reads ZERO through the VIEW as well",
    (advisorAgg ?? []).length === 0,
    `got ${(advisorAgg ?? []).length} — the view is bypassing app_event's policy`
  );

  /* ======================================================================
     3. NOBODY READS ACROSS ROOFTOPS
     ====================================================================== */
  section("3. A manager at another store reads none of this one's");

  const mgrBAtA = await countFor(managerBC, roofA);
  ok(
    "manager at B reads ZERO of A's events",
    mgrBAtA.rows === 0,
    `got ${mgrBAtA.rows}`
  );

  /* NON-VACUOUS: the same client, the same query, their OWN store. If this
     returned zero too, the assertion above would be proving nothing more than
     that the login failed. */
  const mgrBAtB = await countFor(managerBC, roofB);
  ok(
    "the same manager DOES read their own store's — so the refusal above is about scope, not a broken session",
    mgrBAtB.rows === 1,
    `got ${mgrBAtB.rows}`
  );

  /* ======================================================================
     4. NOBODY WRITES OVER THE API. THIS IS THE REAL CONTROL.
     ====================================================================== */
  section("4. authenticated cannot write an event");

  const { error: advisorInsert } = await advisorAC
    .from("app_event")
    .insert({ user_id: advisorA, rooftop_id: roofA, kind: "certs_opened" });
  ok(
    "advisor cannot INSERT their own event",
    advisorInsert !== null,
    "the insert succeeded — a person can manufacture a record of turning up"
  );

  const { error: adminInsert } = await adminC
    .from("app_event")
    .insert({ user_id: advisorA, rooftop_id: roofA, kind: "certs_opened" });
  ok(
    "an ADMIN cannot INSERT one either — reading is not writing",
    adminInsert !== null,
    "the insert succeeded for an admin"
  );

  /* ======================================================================
     5-7. THE CONSTRAINTS, EACH PROVED TO REFUSE
     ====================================================================== */
  section("5-7. The constraints refuse what they claim to");

  const { error: badKind } = await sb
    .from("app_event")
    .insert({ user_id: advisorA, rooftop_id: roofA, kind: "definitely_not_a_kind" });
  ok(
    "an unfamiliar kind is refused, even to the service role",
    badKind !== null,
    "a typo'd kind would be stored and counted by nothing"
  );

  const { error: noRooftop } = await sb
    .from("app_event")
    .insert({ user_id: advisorA, rooftop_id: null, kind: "certs_opened" });
  ok(
    "an event with no rooftop is refused — it would be invisible to the policy that keys on it",
    noRooftop !== null,
    "a null rooftop was accepted"
  );

  const { error: dupe } = await sb.from("app_event").insert({
    user_id: advisorA,
    rooftop_id: roofA,
    kind: "signed_in",
    meta: { platform: "ios" },
    dedup_key: `${advisorA}:signed_in:${chicagoToday()}`,
  });
  ok(
    "a second sign-in ping in the same store-day is refused by the dedup key",
    dupe !== null && dupe.code === "23505",
    `got ${dupe ? dupe.code : "no error"}`
  );

  /* And the key does NOT constrain the kinds that leave it null — four taps on
     Certs in a day are four opens, which is the number Ryan asked for. */
  const { error: thirdCerts } = await sb
    .from("app_event")
    .insert({ user_id: advisorA, rooftop_id: roofA, kind: "certs_opened" });
  ok(
    "a repeat open is NOT deduped — the partial index only constrains signed_in",
    thirdCerts === null,
    `refused with ${thirdCerts?.message}`
  );

  /* ======================================================================
     8. THE LOADER REPORTS THE SIX FACTS
     ====================================================================== */
  section("8. loadRollcall says what actually happened");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rollcall = await loadRollcall(sb as any, roofA);

  const rowA = rollcall.rows.find((r) => r.userId === advisorA);
  const rowQuiet = rollcall.rows.find((r) => r.userId === quietA);

  ok("both of A's advisors are listed", Boolean(rowA) && Boolean(rowQuiet),
    `got ${rollcall.rows.length} rows`);
  ok(
    "the advisor who has done NOTHING is still on the roll",
    rowQuiet !== undefined && rowQuiet.certsOpened.count === 0 && rowQuiet.lessonsOutsideLoop.count === 0,
    "a roll that omitted them would be a roll of the keen"
  );

  ok(
    "first iOS sign-in is today, platform ios",
    rowA?.firstNativeSignInOn === chicagoToday() && rowA?.firstNativePlatform === "ios",
    `got ${rowA?.firstNativeSignInOn} / ${rowA?.firstNativePlatform}`
  );
  ok("Certs opened counts 3 (two, plus the repeat above)", rowA?.certsOpened.count === 3,
    `got ${rowA?.certsOpened.count}`);
  ok("tracks opened counts 1", rowA?.tracksOpened.count === 1, `got ${rowA?.tracksOpened.count}`);
  ok(
    "and NAMES the track behind it",
    rowA?.trackNames.includes(cert!.name as string) === true,
    `got ${JSON.stringify(rowA?.trackNames)}`
  );
  ok("library opened counts 1", rowA?.libraryOpened.count === 1, `got ${rowA?.libraryOpened.count}`);
  ok("lessons opened counts 1", rowA?.lessonsOpened.count === 1, `got ${rowA?.lessonsOpened.count}`);
  ok(
    "lessons OUTSIDE the morning counts 1 — the library one, not the loop one",
    rowA?.lessonsOutsideLoop.count === 1,
    `got ${rowA?.lessonsOutsideLoop.count}`
  );
  ok(
    "lessons IN the morning counts 1, separately",
    rowA?.lessonsInLoop.count === 1,
    `got ${rowA?.lessonsInLoop.count}`
  );
  ok(
    "nothing is unattributed — both writers set a source",
    rowA?.lessonsUnattributed.count === 0,
    `got ${rowA?.lessonsUnattributed.count}`
  );
  ok("mornings completed counts 1", rowA?.completionCount === 1, `got ${rowA?.completionCount}`);
  ok("a story is recorded", rowA?.storiesSubmitted.count === 1, `got ${rowA?.storiesSubmitted.count}`);

  ok(
    "the header counts agree: 3 accounts, 2 from a phone, 2 onboarded, 2 completed today",
    rollcall.total === 3 &&
      rollcall.nativeInstalled === 2 &&
      rollcall.onboarded === 2 &&
      rollcall.completedToday === 2,
    `got ${rollcall.total}/${rollcall.nativeInstalled}/${rollcall.onboarded}/${rollcall.completedToday}`
  );

  /* THE OTHER STORE IS NOT IN IT. Scoped-measurement discipline: the number
     has to be about the population it names. */
  ok(
    "rooftop B's advisor and their event are absent",
    rollcall.rows.every((r) => r.userId !== advisorB),
    "the rooftop filter leaked"
  );

  /* ======================================================================
     9. THE CERT METER — THE NUMBER THAT REPLACED THE TAP COUNTS

     Read as the SERVICE ROLE here, which is the role the cron really uses.
     Section 10 then reads the SAME loader as a manager and as an admin and
     requires the same answer, because since 0179 this is no longer the only
     role that can produce one.
     ====================================================================== */
  section("9. The cert meter counts gating modules, and held is full");

  /* MEASURED AS A DIFFERENCE AGAINST THE SEEDED CATALOGUE. See the baseline's
     comment: the absolute number is a fact about the seed, and it was 4 rather
     than 2 the first time this ran. */
  ok(
    `this suite's two tracks add exactly 2 gating modules to the denominator (baseline ${baseGating})`,
    rowA?.certs.gatingTotal === baseGating + 2 &&
      rowQuiet?.certs.gatingTotal === baseGating + 2,
    `got ${rowA?.certs.gatingTotal} / ${rowQuiet?.certs.gatingTotal} against a baseline of ${baseGating}`
  );
  ok(
    "and exactly 2 active core tracks — the NON-CORE one is in neither count",
    /* The fixture's first certification is is_core false AND its module has no
       published film. Either reason alone would exclude it; +2 proves neither
       route let it in. */
    rollcall.coreTracks === baseCoreTracks + 2,
    `got ${rollcall.coreTracks} against a baseline of ${baseCoreTracks}`
  );
  ok(
    "every advisor started from zero completed, so the counts below are caused and not inherited",
    [...baseDone.values()].every((n) => n === 0),
    `baseline done ${JSON.stringify([...baseDone.values()])}`
  );
  ok(
    "advisorA's completed module counts 1",
    rowA?.certs.gatingDone === 1,
    `got ${rowA?.certs.gatingDone}`
  );
  ok(
    "quietA has completed NOTHING and still reads 1, because a HELD track is full",
    rowQuiet?.certs.gatingDone === 1,
    `got ${rowQuiet?.certs.gatingDone} — held-is-full is what trackRowProgress rules`
  );
  ok(
    "and the held track is NAMED, so the post can say which one",
    rowQuiet?.certs.earned.length === 1 &&
      rowQuiet?.certs.earned[0] === `${TAG} core-held` &&
      rowA?.certs.earned.length === 0,
    `got ${JSON.stringify(rowQuiet?.certs.earned)} / ${JSON.stringify(rowA?.certs.earned)}`
  );
  ok(
    "the day of the last cert work is the day it happened at the STORE",
    rowA?.certs.lastWorkedOn === chicagoToday() && rowQuiet?.certs.lastWorkedOn === null,
    `got ${rowA?.certs.lastWorkedOn} / ${rowQuiet?.certs.lastWorkedOn}`
  );
  ok(
    "the team numbers are the rows summed, not a second query that could drift",
    rollcall.teamGatingDone ===
      rollcall.rows.reduce((n, r) => n + r.certs.gatingDone, 0) &&
      rollcall.teamGatingTotal === (baseGating + 2) * rollcall.rows.length &&
      rollcall.teamEarned === 1,
    `done ${rollcall.teamGatingDone}, total ${rollcall.teamGatingTotal}, earned ${rollcall.teamEarned}`
  );
  ok(
    "BOTH completers' rows came back in one pass — the cross-user read the cron's meter depends on",
    rowA?.certs.gatingDone === 1 &&
      rollcall.rows.find((r) => r.userId === veteranA)?.certs.gatingDone === 1,
    `advisorA ${rowA?.certs.gatingDone}, veteranA ${
      rollcall.rows.find((r) => r.userId === veteranA)?.certs.gatingDone
    } — one person's rows would not demonstrate it`
  );

  /* ======================================================================
     10. 0179: THE ROLES THAT RENDER THE METER READ IT, AND NOBODY ELSE DOES

     This section used to assert the opposite — that an admin read ZERO
     completed modules and the loader said so — because `module_completion_own`
     (0035) was own-rows-only and 0117 restated that as a ruling. Ryan reversed
     the ruling on 8 NOVEMBER 2026: managers and admins see the EDIAGD
     Certified meter on /admin/engagement, the same one the evening post
     carries. 0179 is the read path and this is its acceptance.

     BOTH HALVES, AS THE RULE REQUIRES. A policy that merely opens is as wrong
     as one that merely refuses, so every claim below is paired: the manager and
     the admin read a managed advisor's completions AND their figure EQUALS the
     service client's; a manager at another rooftop reads zero AND reads their
     own store's; the advisor still reads their own AND still reads none of a
     colleague's, which is 0035's policy being carried forward by the second arm
     rather than quietly widened.
     ====================================================================== */
  section("10. A manager and an admin read their advisors' completions (0179)");

  /* The gating modules this suite created, asked for BY USER — the same shape
     loadCertProgress uses, so what is proved here is the query the screen
     really issues and not a convenient simplification of it. */
  const completedGatingFor = async (client: SupabaseClient, userId: string) => {
    const { data, error } = await client
      .from("module_completion")
      .select("module_id")
      .eq("user_id", userId)
      .in("module_id", coreModuleIds);
    return {
      ids: ((data ?? []) as { module_id: string }[]).map((r) => r.module_id).sort(),
      error: error?.message ?? null,
    };
  };

  const svcSeesA = await completedGatingFor(sb, advisorA);
  const svcSeesVeteran = await completedGatingFor(sb, veteranA);
  ok(
    "the service role sees one gating completion each for advisorA and veteranA — a known NON-EMPTY answer to compare against",
    svcSeesA.ids.length === 1 && svcSeesVeteran.ids.length === 1,
    `advisorA ${svcSeesA.ids.length}, veteranA ${svcSeesVeteran.ids.length} — comparing against an empty answer would prove nothing`
  );

  const mgrSeesA = await completedGatingFor(managerAC, advisorA);
  const mgrSeesVeteran = await completedGatingFor(managerAC, veteranA);
  ok(
    "a MANAGER at the same rooftop reads advisorA's completion, and the SAME module ids the service role read",
    mgrSeesA.ids.length === 1 &&
      JSON.stringify(mgrSeesA.ids) === JSON.stringify(svcSeesA.ids),
    `manager ${JSON.stringify(mgrSeesA.ids)} vs service ${JSON.stringify(
      svcSeesA.ids
    )}${mgrSeesA.error ? ` (${mgrSeesA.error})` : ""}`
  );
  ok(
    "and veteranA's too — TWO different advisors, so this is a cross-user read and not the caller's own row",
    mgrSeesVeteran.ids.length === 1 &&
      JSON.stringify(mgrSeesVeteran.ids) === JSON.stringify(svcSeesVeteran.ids),
    `manager ${JSON.stringify(mgrSeesVeteran.ids)} vs service ${JSON.stringify(
      svcSeesVeteran.ids
    )}`
  );

  /* THE ADMIN IS THE ROLE THAT ACTUALLY OPENS THIS SCREEN, and is asserted
     separately rather than assumed to behave like a manager: `managed_users()`
     is built from `managed_rooftops()`, which is `role in ('manager','admin')`
     — so the admin is admitted by the same arm, and the standing rule is to
     check the answer for each role rather than to reason about the predicate. */
  const admSeesA = await completedGatingFor(adminC, advisorA);
  ok(
    "an ADMIN at the same rooftop reads it too — the role /admin/engagement is actually gated on",
    admSeesA.ids.length === 1 &&
      JSON.stringify(admSeesA.ids) === JSON.stringify(svcSeesA.ids),
    `admin ${JSON.stringify(admSeesA.ids)} vs service ${JSON.stringify(svcSeesA.ids)}`
  );

  const ownerSeesA = await completedGatingFor(ownerC, advisorA);
  ok(
    "the PLATFORM OWNER reads it by the first arm, with no membership at this store at all",
    ownerSeesA.ids.length === 1,
    `got ${JSON.stringify(ownerSeesA.ids)} — owner is a member of rooftop B only`
  );

  /* ---- The policy SCOPES, and the pair is what proves it ---------------- */
  const mgrBSeesA = await completedGatingFor(managerBC, advisorA);
  const mgrBSeesB = await completedGatingFor(managerBC, advisorB);
  ok(
    "a manager at rooftop B reads ZERO of rooftop A's advisor — managed_users() is a scope, not an opening",
    mgrBSeesA.ids.length === 0,
    `got ${JSON.stringify(mgrBSeesA.ids)} — the policy leaked across rooftops`
  );
  ok(
    "the same manager, the same query, DOES read their own store's advisor — so the refusal above is about scope and not a broken session",
    mgrBSeesB.ids.length === 1,
    `got ${JSON.stringify(mgrBSeesB.ids)}${mgrBSeesB.error ? ` (${mgrBSeesB.error})` : ""}`
  );

  /* ---- 0035's own-row read, carried forward and NOT widened ------------- */
  const advisorSeesSelf = await completedGatingFor(advisorAC, advisorA);
  const advisorSeesColleague = await completedGatingFor(advisorAC, veteranA);
  ok(
    "the advisor still reads their OWN completion — module_completion_own was dropped and the second arm carries it",
    advisorSeesSelf.ids.length === 1,
    `got ${JSON.stringify(advisorSeesSelf.ids)} — /certifications and the loop read this`
  );
  ok(
    "and reads ZERO of a COLLEAGUE's at the same rooftop — an advisor is not in managed_users()",
    advisorSeesColleague.ids.length === 0,
    `got ${JSON.stringify(advisorSeesColleague.ids)} — the ruling changed for managers, not for everybody`
  );

  /* ---- And the LOADER, as the admin: the whole meter, not just a row ---- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asAdmin = await loadRollcall(adminC as any, roofA);
  ok(
    "the admin sees the same roster — so the figures below are over the same population",
    asAdmin.rows.length === 3,
    `got ${asAdmin.rows.length} rows`
  );
  ok(
    "the admin DOES read the earned track, as they always could (0115)",
    asAdmin.rows.find((r) => r.userId === quietA)?.certs.earned.length === 1,
    `got ${JSON.stringify(asAdmin.rows.find((r) => r.userId === quietA)?.certs.earned)}`
  );
  /* THE DENOMINATOR, ASSERTED SEPARATELY FROM THE NUMERATOR. gatingTotal is
     read from `content` under entitlement RLS, so it is a different question
     with a different policy behind it — and a meter can be wrong by having the
     wrong denominator just as easily. An admin reads the whole catalogue
     through content_admin_all, so it must match the service role's exactly. */
  ok(
    "the admin's DENOMINATOR equals the service client's, so the meter is not quietly drawn over a smaller catalogue",
    asAdmin.rows.every(
      (r) => r.certs.gatingTotal === rollcall.rows[0]?.certs.gatingTotal
    ) && asAdmin.teamGatingTotal === rollcall.teamGatingTotal,
    `admin ${JSON.stringify(
      asAdmin.rows.map((r) => r.certs.gatingTotal)
    )} / team ${asAdmin.teamGatingTotal}, service ${
      rollcall.rows[0]?.certs.gatingTotal
    } / team ${rollcall.teamGatingTotal}`
  );
  ok(
    "and the admin's NUMERATOR equals it per advisor, with advisorA's NON-ZERO — the figure the screen prints is the figure Slack prints",
    (asAdmin.rows.find((r) => r.userId === advisorA)?.certs.gatingDone ?? 0) > 0 &&
      rollcall.rows.every(
        (r) =>
          asAdmin.rows.find((a) => a.userId === r.userId)?.certs.gatingDone ===
          r.certs.gatingDone
      ),
    `admin ${JSON.stringify(
      asAdmin.rows.map((r) => [r.name, r.certs.gatingDone])
    )}, service ${JSON.stringify(rollcall.rows.map((r) => [r.name, r.certs.gatingDone]))}`
  );
  ok(
    "the team line agrees too, both halves of it",
    asAdmin.teamGatingDone === rollcall.teamGatingDone &&
      asAdmin.teamEarned === rollcall.teamEarned,
    `admin ${asAdmin.teamGatingDone}/${asAdmin.teamEarned}, service ${rollcall.teamGatingDone}/${rollcall.teamEarned}`
  );

  /* ======================================================================
     10b. WHAT 0179 DOES *NOT* FIX, MEASURED RATHER THAN ASSUMED

     The prompt for this change said a manager at a rooftop that has bought the
     product reads the same gating set the service role does. MEASURED, THAT IS
     FALSE, and it is not about the product: `roles_for_content_type` (0091)
     maps `advisor_video` to `{advisor}`, so `content_entitled_read` admits the
     ADVISOR role and no other. An admin is admitted by a different policy
     altogether — `content_admin_all` — which is why the admin's denominator
     above is correct and complete.

     So a MANAGER-ONLY session reads none of the films, `gatingModuleIds`
     returns an empty set, and the loader reports 0 of 0 — a flat meter with a
     zero denominator, which the component renders as a sentence rather than as
     an empty bar. The numerator 0179 opened is real and unreachable for them.

     THIS COSTS NOTHING TODAY, and the reason is asserted below rather than
     claimed: /admin/engagement is gated on `admin_rooftops()`, which is
     platform owner, admin memberships and org group owners — a manager-only
     account gets the "this screen is for owners and admins" card and never
     reaches the meter at all.

     THE QUESTION IS RECORDED RATHER THAN ANSWERED HERE, because answering it
     means giving managers read access to advisor films, which is a product
     ruling with consequences well outside this screen: a manager arm in
     `roles_for_content_type('advisor_video')` would also open the library and
     the loop's content to them. Ryan's to rule on.
     ====================================================================== */
  section("10b. The manager's DENOMINATOR, and why the screen is unaffected");

  const filmsFor = async (client: SupabaseClient) => {
    const { data } = await client.from("content").select("id").in("id", coreContentIds);
    return (data ?? []).length;
  };
  const mgrFilms = await filmsFor(managerAC);
  const admFilms = await filmsFor(adminC);
  const advisorFilms = await filmsFor(advisorAC);
  ok(
    "the ADVISOR reads both of this suite's gating films — so the rooftop's entitlement is real and the manager's zero below is not about the product",
    advisorFilms === 2,
    `got ${advisorFilms} of 2 — rooftop_product holds advisor_base for this store`
  );
  ok(
    "a MANAGER reads NEITHER, while an ADMIN reads both — roles_for_content_type('advisor_video') is {advisor}, and the admin is admitted by content_admin_all instead",
    mgrFilms === 0 && admFilms === 2,
    `manager ${mgrFilms}, admin ${admFilms}`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asManager = await loadRollcall(managerAC as any, roofA);
  ok(
    "the manager sees the same roster, so the zero below is one relation and not a broken session",
    asManager.rows.length === 3,
    `got ${asManager.rows.length} rows`
  );
  ok(
    "and the manager's meter is 0 of 0 — the DENOMINATOR, not the numerator 0179 opened",
    asManager.rows.every((r) => r.certs.gatingTotal === 0) &&
      asManager.teamGatingTotal === 0,
    `gatingTotal ${JSON.stringify(
      asManager.rows.map((r) => r.certs.gatingTotal)
    )} — if these are non-zero, roles_for_content_type gained a manager arm and this case should be rewritten`
  );
  ok(
    "a manager-only account cannot reach /admin/engagement at all — admin_engagement_coverage reports 0 rooftops in scope, which the page renders as the 'owners and admins' card",
    await (async () => {
      const { data } = await managerAC
        .from("admin_engagement_coverage")
        .select("rooftops_in_scope")
        .maybeSingle();
      return Number((data as { rooftops_in_scope: number } | null)?.rooftops_in_scope ?? 0) === 0;
    })(),
    "if a manager now has rooftops in scope, they can open the screen and will see a 0-of-0 meter — the recorded question above has become live"
  );
  ok(
    "the ADMIN does reach it — so the refusal above is about the role and not about the view being unreadable",
    await (async () => {
      const { data } = await adminC
        .from("admin_engagement_coverage")
        .select("rooftops_in_scope")
        .maybeSingle();
      return Number((data as { rooftops_in_scope: number } | null)?.rooftops_in_scope ?? 0) > 0;
    })(),
    "the admin reads zero rooftops in scope, which would make the refusal above prove nothing"
  );

  /* ======================================================================
     11. WHAT CHANGED — AND A FIRST-TIME FACT PROVED TO BE A FIRST
     ====================================================================== */
  section("11. The changes, keyed on an instant, with first-time facts that are first");

  const longAgo = new Date(Date.now() - 86_400_000);
  const changedSinceYesterday = await loadRollcallChanges(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sb as any,
    roofA,
    longAgo,
    rollcall.rows
  );

  const advisorChange = changedSinceYesterday.get(advisorA);
  ok(
    "advisorA's two lesson completions are ONE count, whatever surface finished them",
    advisorChange?.lessons === 2,
    `got ${advisorChange?.lessons} — the loop one and the library one`
  );
  ok(
    "and the story is reported",
    advisorChange?.story === true,
    `got ${JSON.stringify(advisorChange)}`
  );
  ok(
    "advisorA's ONLY morning is in the window, so it IS their first",
    advisorChange?.firstMorning === true,
    `got ${advisorChange?.firstMorning}`
  );
  ok(
    "and their first native sign-in is in the window, so the app is newly installed",
    advisorChange?.installedApp === true,
    `got ${advisorChange?.installedApp}`
  );

  /*
   * THE CASE THE 6 NOVEMBER POST GOT WRONG, BOTH HALVES OF IT.
   *
   * The veteran signed in from a phone forty days ago and again today, and has
   * three mornings of which one is in the window. The old rule fired
   * "signed in from a phone" on any native sign-in and "first sign-in" on any
   * daily_activity row, so it reported both as new. Neither is.
   */
  const veteranChange = changedSinceYesterday.get(veteranA);
  ok(
    "a SECOND sign-in in the window fires neither installedApp nor firstMorning",
    veteranChange?.installedApp !== true && veteranChange?.firstMorning !== true,
    `got ${JSON.stringify(veteranChange)} — this is the 6 November defect`
  );
  ok(
    "the veteran DID complete a morning in the window, so the refusal above is about FIRSTNESS and not about an empty window",
    rollcall.rows.find((r) => r.userId === veteranA)?.lastCompletionOn === chicagoToday() &&
      (rollcall.rows.find((r) => r.userId === veteranA)?.completionCount ?? 0) === 3,
    "if they had done nothing, the assertion above would prove nothing"
  );
  ok(
    "quietA's confirmed schedule is reported as onboarded, and nothing else",
    changedSinceYesterday.get(quietA)?.onboarded === true &&
      changedSinceYesterday.get(quietA)?.lessons === 0 &&
      changedSinceYesterday.get(quietA)?.firstMorning === false,
    `got ${JSON.stringify(changedSinceYesterday.get(quietA))}`
  );

  const inAMoment = new Date(Date.now() + 60_000);
  const changedSinceNow = await loadRollcallChanges(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sb as any,
    roofA,
    inAMoment,
    rollcall.rows
  );
  ok(
    "and nothing counts as new since a minute from now — the window is real, not always-true",
    changedSinceNow.size === 0,
    `got ${changedSinceNow.size} users with changes`
  );

  /* ======================================================================
     12. THE MESSAGE, BUILT FROM WHAT THE DATABASE ACTUALLY SAID

     The columns and the sentences are proved line by line without a database
     in `npm run test:rollcall-message`. What this section adds is the join:
     the loader's output is a shape the message can actually render, and the
     advisor who has done nothing is still on the roll.
     ====================================================================== */
  section("12. The Slack message, from the loaded Rollcall");

  const message = buildRollcallMessage({
    rollcall,
    rooftopName: `${TAG} Store A`,
    timezone: "America/Chicago",
    now: new Date(),
    since: longAgo,
    changes: changedSinceYesterday,
  });

  ok("every advisor is listed", message.listed === 3, `listed ${message.listed}`);
  ok("nothing was silently dropped", message.dropped === 0, `dropped ${message.dropped}`);
  ok(
    "it opens by saying who did their morning and NAMING who did not",
    message.text.split("\n")[1] ===
      /* "never signed in" and not "no mornings yet": quietA has a confirmed
         schedule but no daily_activity row, so the app has no record of them
         ever opening it — and the reason names the step they are stuck ON. */
      `*2 of 3 did their morning today.* Missed: ${TAG} quietA (never signed in).`,
    `got ${JSON.stringify(message.text.split("\n")[1])}`
  );
  ok(
    "the advisor who has done nothing is still on the roll, marked and explained",
    message.text
      .split("\n")
      .some((l) => l.startsWith("— ") && l.includes("quietA") && l.endsWith("never signed in")),
    "a roll that omitted them would be a roll of the keen"
  );
  /* CHECKED AGAINST THE LOADED ROW, not against a literal: the percentage
     depends on the seeded catalogue, and the exact rendering of every column is
     pinned in test:rollcall-message. What this asserts is the JOIN — the post
     is printing this advisor's own numbers. */
  ok(
    "advisorA's line carries their own meter, their mornings and what moved",
    (() => {
      const line = message.text.split("\n").find((l) => l.includes("advisorA"));
      const pct = Math.round((100 * (rowA?.certs.gatingDone ?? 0)) / (rowA?.certs.gatingTotal ?? 1));
      return (
        line !== undefined &&
        line.startsWith("✓ ") &&
        line.includes(`${pct}%`) &&
        line.includes("1 morning") &&
        line.includes("+2 lessons, story")
      );
    })(),
    `got ${JSON.stringify(message.text.split("\n").find((l) => l.includes("advisorA")))}`
  );
  ok(
    "quietA's held track shows as earned 1 even though they have completed nothing",
    message.text
      .split("\n")
      .some((l) => l.includes("quietA") && l.includes("earned 1")),
    `got ${JSON.stringify(message.text.split("\n").find((l) => l.includes("quietA")))}`
  );
  ok(
    "the team line prints the loader's own team numbers",
    message.text.split("\n")[2] ===
      `Team toward EDIAGD Certified: ${"▰".repeat(
        Math.round((10 * rollcall.teamGatingDone) / rollcall.teamGatingTotal)
      )}${"▱".repeat(
        10 - Math.round((10 * rollcall.teamGatingDone) / rollcall.teamGatingTotal)
      )} ${Math.round(
        (100 * rollcall.teamGatingDone) / rollcall.teamGatingTotal
      )}% of core lessons · 1 track earned`,
    `got ${JSON.stringify(message.text.split("\n")[2])}`
  );
  ok(
    "and the onboarding facts that stopped changing are not in it",
    !/\bpw \d|phone —|Certs \d+, tracks|outside the morning/.test(message.text),
    "a fact that stops changing is noise in a daily post"
  );

  console.log("\n  ---- the message, as it would be posted ----\n");
  console.log(
    message.text
      .split("\n")
      .map((l) => `  | ${l}`)
      .join("\n")
  );

  /* ---- Cleanup --------------------------------------------------------
     IN FK ORDER, and the craft-ladder fixtures come out before the tracks
     they hang off: certification_course references course ON DELETE RESTRICT,
     so a certification deleted first would leave the course undeletable and
     the next run would collide on its slug. */
  await sb.from("app_event").delete().in("rooftop_id", [roofA, roofB]);
  await sb.from("daily_completion").delete().in("user_id", madeUsers);
  await sb.from("work_schedule").delete().in("user_id", madeUsers);
  await sb.from("module_completion").delete().in("user_id", madeUsers);
  await sb.from("advisor_certification").delete().in("user_id", madeUsers);
  await sb.from("content").delete().in("id", coreContentIds);
  await sb.from("certification_course").delete().in("certification_id", coreTrackIds);
  await sb.from("module").delete().in("id", coreModuleIds);
  await sb.from("course").delete().in("id", coreCourseIds);
  await sb.from("certification").delete().in("id", coreTrackIds);
  await sb.from("module").delete().eq("id", moduleId);
  await sb.from("course").delete().eq("id", course!.id);
  await sb.from("certification").delete().eq("id", certId);
  await sb.from("membership").delete().in("user_id", madeUsers);
  await sb.from("app_user").delete().in("id", madeUsers);
  for (const id of madeUsers) await sb.auth.admin.deleteUser(id);
  /* Explicit, though rooftop_product cascades on rooftop_id: a reader counting
     the fixtures back out should not have to know which ones cascade. */
  await sb.from("rooftop_product").delete().in("rooftop_id", [roofA, roofB]);
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
