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
     8  loadRollcall reports the six facts correctly, including a zero row for
        somebody who has done nothing, and does not leak the other rooftop
     9  the Slack message carries all six facts in a fixed order for everybody,
        and lists the advisor who did nothing

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:rollcall

   PROVEN NON-VACUOUS: with app_event_team_read replaced by `using (true)` the
   four refusals in sections 2 and 3 fail. The run is recorded in the report.
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

/** Store-local today for a Chicago rooftop, which is what the fixtures use. */
function chicagoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

  const advisorA = await makeUser("advisorA", roofA, "advisor");
  const quietA = await makeUser("quietA", roofA, "advisor");
  const managerA = await makeUser("managerA", roofA, "manager");
  const adminA = await makeUser("adminA", roofA, "admin");
  const managerB = await makeUser("managerB", roofB, "manager");
  const advisorB = await makeUser("advisorB", roofB, "advisor");
  const owner = await makeUser("owner", roofB, "advisor", { platformOwner: true });

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
    "platform owner reads rooftop A's events (9 written)",
    ownerAtA.rows === 9,
    `got ${ownerAtA.rows}${ownerAtA.error ? ` (${ownerAtA.error})` : ""}`
  );

  const adminAtA = await countFor(adminC, roofA);
  ok(
    "admin at A reads A's events",
    adminAtA.rows === 9,
    `got ${adminAtA.rows}${adminAtA.error ? ` (${adminAtA.error})` : ""}`
  );

  const mgrAtA = await countFor(managerAC, roofA);
  ok(
    "manager at A reads A's events",
    mgrAtA.rows === 9,
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
    "admin reads the same 9 through app_event_rollcall, and the view agrees with the table",
    aggTotal === 9,
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
    "the header counts agree: 2 accounts, 1 from a phone, 2 onboarded, 1 completed today",
    rollcall.total === 2 &&
      rollcall.nativeInstalled === 1 &&
      rollcall.onboarded === 2 &&
      rollcall.completedToday === 1,
    `got ${rollcall.total}/${rollcall.nativeInstalled}/${rollcall.onboarded}/${rollcall.completedToday}`
  );

  /* THE OTHER STORE IS NOT IN IT. Scoped-measurement discipline: the number
     has to be about the population it names. */
  ok(
    "rooftop B's advisor and their event are absent",
    rollcall.rows.every((r) => r.userId !== advisorB),
    "the rooftop filter leaked"
  );

  /* ---- The changes map, keyed on an instant and not on a date ----------- */
  const longAgo = new Date(Date.now() - 86_400_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changedSinceYesterday = await loadRollcallChanges(sb as any, roofA, longAgo, [
    advisorA,
    quietA,
  ]);
  ok(
    "everything advisorA did counts as new since yesterday",
    (changedSinceYesterday.get(advisorA)?.size ?? 0) >= 5,
    `got ${JSON.stringify([...(changedSinceYesterday.get(advisorA) ?? [])])}`
  );

  const inAMoment = new Date(Date.now() + 60_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changedSinceNow = await loadRollcallChanges(sb as any, roofA, inAMoment, [
    advisorA,
    quietA,
  ]);
  ok(
    "and nothing counts as new since a minute from now — the window is real, not always-true",
    changedSinceNow.size === 0,
    `got ${changedSinceNow.size} users with changes`
  );

  /* ======================================================================
     9. THE MESSAGE
     ====================================================================== */
  section("9. The Slack message");

  const message = buildRollcallMessage({
    rollcall,
    rooftopName: `${TAG} Store A`,
    timezone: "America/Chicago",
    now: new Date(),
    since: longAgo,
    changes: changedSinceYesterday,
  });

  ok("every advisor is listed", message.listed === 2, `listed ${message.listed}`);
  ok("nothing was silently dropped", message.dropped === 0, `dropped ${message.dropped}`);
  ok(
    "the quiet advisor's line is there, with all six facts and not a shorter line",
    message.text.includes("quietA") &&
      message.text.includes("0 mornings") &&
      message.text.includes("Certs 0, tracks 0") &&
      message.text.includes("0 outside the morning"),
    "a line that omitted the empty facts would make the people who did nothing the hardest to spot"
  );
  ok(
    "the six facts appear in the stated order on the active advisor's line",
    (() => {
      const line = message.text
        .split("\n")
        .find((l) => l.includes("advisorA") && l.startsWith("•"));
      if (!line) return false;
      const order = ["phone iOS", "pw ", "onboarded ", " morning", "Certs ", "outside the morning"];
      let at = -1;
      for (const token of order) {
        const next = line.indexOf(token, at + 1);
        if (next <= at) return false;
        at = next;
      }
      return true;
    })(),
    "the fixed order is the whole requirement — the message has to read the same every day"
  );
  /*
   * BOTH advisors have something new, and that is the point of the assertion:
   * the quiet one's schedule was confirmed in this run, so "new" has to be able
   * to say "onboarded, and nothing else" about somebody who has still never
   * opened a screen. An assertion that only checked a count would pass with the
   * two advisors' change sets swapped.
   */
  ok(
    "it names what changed, per advisor, and the quiet one's ONLY change is being onboarded",
    message.changed === 2 &&
      /* The line is matched EXACTLY, not with includes() — a substring test
         would also pass on advisorA's "new: ..., onboarded, first sign-in". */
      message.text.split("\n").some((l) => l.trim() === "↳ new: onboarded") &&
      (changedSinceYesterday.get(quietA)?.size ?? 0) === 1 &&
      (changedSinceYesterday.get(advisorA)?.size ?? 0) >= 6,
    `changed ${message.changed}; quiet=${JSON.stringify([
      ...(changedSinceYesterday.get(quietA) ?? []),
    ])}`
  );

  console.log("\n  ---- the message, as it would be posted ----\n");
  console.log(
    message.text
      .split("\n")
      .map((l) => `  | ${l}`)
      .join("\n")
  );

  /* ---- Cleanup -------------------------------------------------------- */
  await sb.from("app_event").delete().in("rooftop_id", [roofA, roofB]);
  await sb.from("daily_completion").delete().in("user_id", madeUsers);
  await sb.from("work_schedule").delete().in("user_id", madeUsers);
  await sb.from("module").delete().eq("id", moduleId);
  await sb.from("course").delete().eq("id", course!.id);
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
