/* ============================================================================
   EDIAGD — focus-family acceptance, against a real database

   THE TEST 0123 EXISTS TO PASS. AGENTS.md: "A migration applying cleanly is not
   evidence that a function works. A function shipped in a migration must be
   exercised BY THE ROLE AND THE PATH THAT WILL ACTUALLY CALL IT, or it is
   untested."

   So every assertion below goes over PostgREST, as the role that will really
   make the call:

     derive_focus_family()        the SERVICE ROLE, which is how the loop calls
                                  it — and the role for which auth.uid() is null
                                  and family_store_benchmark returned zero rows
                                  before 0123 section 0.
     set_focus_family_override()  an AUTHENTICATED manager, signed in properly.
     the refusals                 an AUTHENTICATED advisor, asserting that each
                                  one is actually refused rather than merely
                                  undocumented.

   A suite that proved the happy path as `postgres` would be testing the one
   context in which none of this can fail.

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:focus-family

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
   Same posture as certification-acceptance: it creates a rooftop, auth users,
   a period, DMS metrics, op codes and films, and removes them again. It
   refuses any SB_URL that is not localhost.
============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

/* ---- harness -------------------------------------------------------------- */
let passed = 0;
let failed = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);
function need<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new Error(`fixture expected ${what}, got nothing`);
  return v;
}

/* ---- fixtures ------------------------------------------------------------- */
const TAG = `ff-${randomUUID().slice(0, 8)}`;
const madeUsers: string[] = [];
const madeContent: string[] = [];
const madeCodes: string[] = [];
const madeLines: string[] = [];
let orgId = "";
let rooftopId = "";
let otherRooftopId = "";
let periodId = "";

/** Two families, deliberately different sizes and different gaps. */
const RICH = `${TAG} Rich Family`;
const THIN = `${TAG} Thin Family`;
/** Ranked top on missed ROs but with NO film — the supply gate's target. */
const UNFILMED = `${TAG} Unfilmed Family`;

const PASSWORD = "Fixture-passw0rd!";

async function makeUser(role: "advisor" | "manager", rooftop: string, opCode?: string) {
  const email = `${TAG}-${role}-${randomUUID().slice(0, 6)}@example.test`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);
  await sb.from("app_user").upsert({ id, full_name: `${TAG} ${role}` });
  const { error: mErr } = await sb.from("membership").insert({
    user_id: id,
    rooftop_id: rooftop,
    role,
    active: true,
    op_code_id: opCode ?? null,
  });
  if (mErr) throw new Error(`membership: ${mErr.message}`);
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

/** A published, playable pitch film for a catalog code. */
async function makeFilm(code: string, stage: string) {
  const { data, error } = await sb
    .from("content")
    .insert({
      type: "advisor_video",
      collection: "Pitches by Op Code",
      status: "published",
      title: `${TAG} ${code} ${stage}`,
      op_code: code,
      stage,
      duration_sec: 180,
      mux_playback_id: `fixture-${randomUUID().slice(0, 8)}`,
      mux_playback_policy: "signed",
      captions_ready: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`film: ${error.message}`);
  madeContent.push(data.id);
  return data.id as string;
}

/** A catalog code in a family, mapped through op_code_family. */
async function makeCode(code: string, family: string, coachable = true) {
  const { error: cErr } = await sb
    .from("op_code_catalog")
    .insert({ code, name: `${TAG} ${code}`, category: "Fixture", sort_order: 9000 });
  if (cErr) throw new Error(`op_code_catalog: ${cErr.message}`);
  const { error: fErr } = await sb
    .from("op_code_family")
    .insert({ code, family, coachable, confidence: "ruled", note: TAG });
  if (fErr) throw new Error(`op_code_family: ${fErr.message}`);
  madeCodes.push(code);
}

/**
 * One advisor's book for one period.
 *
 * The store average family_store_benchmark computes is the AVERAGE over the
 * advisors in the period, so two advisors are seeded per family: a strong one
 * that lifts the average and the subject who sits below it. With one advisor
 * the average would equal their own rate and every gap would be zero, which
 * would make the whole suite pass by measuring nothing.
 */
async function seedBook(
  advisorOpId: string,
  totalRos: number,
  perFamily: { family: string; ros: number; labor: number }[]
) {
  const { error: tErr } = await sb.from("advisor_period_total_src").insert({
    period_id: periodId,
    rooftop_id: rooftopId,
    advisor_op_id: advisorOpId,
    total_ros: totalRos,
    total_labor_sales: perFamily.reduce((a, f) => a + f.labor, 0),
    total_ro_lines: totalRos,
  });
  if (tErr) throw new Error(`totals: ${tErr.message}`);

  for (const f of perFamily) {
    /* advisor_op_metric.op_code is FK'd to service_line — the DMS vocabulary,
       not the catalog. resolved_family is what the views coalesce FIRST, so the
       line's own family is deliberately left null: a fixture that agreed with
       itself twice would not prove the resolution order. */
    const line = `${TAG}-${f.family}`.slice(0, 40);
    if (!madeLines.includes(line)) {
      const { error: lErr } = await sb
        .from("service_line")
        .insert({ op_code: line, category: "Fixture", description: TAG });
      if (lErr) throw new Error(`service_line: ${lErr.message}`);
      madeLines.push(line);
    }
    const { error } = await sb.from("advisor_op_metric").insert({
      period_id: periodId,
      rooftop_id: rooftopId,
      advisor_op_id: advisorOpId,
      op_code: line,
      ros: f.ros,
      labor_sales: f.labor,
      resolved_family: f.family,
    });
    if (error) throw new Error(`metric: ${error.message}`);
  }
}

async function setup() {
  const { data: o, error: oErr } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();
  if (oErr) throw new Error(`org: ${oErr.message}`);
  orgId = o.id;

  const { data: r, error: rErr } = await sb
    .from("rooftop")
    .insert({ org_id: orgId, name: `${TAG} Store`, timezone: "America/Chicago" })
    .select("id")
    .single();
  if (rErr) throw new Error(`rooftop: ${rErr.message}`);
  rooftopId = r.id;

  const { data: r2 } = await sb
    .from("rooftop")
    .insert({ org_id: orgId, name: `${TAG} Other Store`, timezone: "America/Chicago" })
    .select("id")
    .single();
  otherRooftopId = need(r2, "second rooftop").id;

  const { data: p, error: pErr } = await sb
    .from("perf_period")
    .insert({
      rooftop_id: rooftopId,
      starts_on: "2026-08-01",
      ends_on: "2026-08-31",
    })
    .select("id")
    .single();
  if (pErr) throw new Error(`perf_period: ${pErr.message}`);
  periodId = p.id;

  /* Catalog codes. RICH gets three films, THIN one, UNFILMED none. */
  await makeCode(`${TAG.slice(0, 6)}R1`.toUpperCase(), RICH);
  await makeCode(`${TAG.slice(0, 6)}R2`.toUpperCase(), RICH);
  await makeCode(`${TAG.slice(0, 6)}T1`.toUpperCase(), THIN);
  await makeCode(`${TAG.slice(0, 6)}U1`.toUpperCase(), UNFILMED);

  await makeFilm(madeCodes[0], "MPI Setup");
  await makeFilm(madeCodes[0], "On the Drive");
  await makeFilm(madeCodes[1], "At the Kiosk");
  await makeFilm(madeCodes[2], "MPI Setup");
  // madeCodes[3] (UNFILMED) deliberately gets none.

}

/* ============================================================================
   The suite
   ============================================================================ */
async function run() {
  await setup();

  const subjectOp = `${TAG}-sub`;
  const strongOp = `${TAG}-str`;

  /*
   * The subject is below store average in all three families. UNFILMED carries
   * the BIGGEST gap on purpose: if the supply gate is not working, the
   * derivation picks it and the assertion below catches it.
   *
   *   total 200 ROs
   *   RICH      40 ROs = 20%   store avg 60%   gap 40pp   missed 80 ROs
   *   THIN      20 ROs = 10%   store avg 45%   gap 35pp   missed 70 ROs
   *   UNFILMED  10 ROs =  5%   store avg 52.5% gap 47.5pp missed 95 ROs
   */
  await seedBook(subjectOp, 200, [
    { family: RICH, ros: 40, labor: 4000 },
    { family: THIN, ros: 20, labor: 6000 },
    { family: UNFILMED, ros: 10, labor: 1000 },
  ]);
  await seedBook(strongOp, 100, [
    { family: RICH, ros: 100, labor: 9000 },
    { family: THIN, ros: 80, labor: 9000 },
    { family: UNFILMED, ros: 100, labor: 9000 },
  ]);

  const advisor = await makeUser("advisor", rooftopId, subjectOp);
  const manager = await makeUser("manager", rooftopId);
  const stranger = await makeUser("manager", otherRooftopId);

  /* -------------------------------------------------------------------- */
  section("The supply gate");

  const { data: supply, error: supplyErr } = await sb
    .from("family_pitch_supply")
    .select("family, film_count, op_code_count, stage_count, fully_captioned")
    .in("family", [RICH, THIN, UNFILMED]);
  ok("family_pitch_supply readable over PostgREST", !supplyErr, supplyErr?.message);

  const byFam = new Map((supply ?? []).map((s) => [s.family as string, s]));
  ok("a family with three films reports film_count 3", byFam.get(RICH)?.film_count === 3,
    `got ${byFam.get(RICH)?.film_count}`);
  ok("it reports the two op codes behind them", byFam.get(RICH)?.op_code_count === 2,
    `got ${byFam.get(RICH)?.op_code_count}`);
  ok("a family with no film is ABSENT, not zero", !byFam.has(UNFILMED));

  /*
   * THE ROLE GATE THAT 0123 SECTION 0 OPENED. Asserted directly, because it is
   * the reason the whole derivation works, and because a benchmark that returns
   * nothing looks exactly like a store with no history.
   */
  const { data: bench } = await sb
    .from("family_store_benchmark")
    .select("family, store_avg_pct")
    .eq("period_id", periodId);
  ok(
    "the SERVICE ROLE can see family_store_benchmark at all",
    (bench ?? []).length > 0,
    `got ${(bench ?? []).length} rows — has_performance_surface() is shut for the backend`
  );

  /* -------------------------------------------------------------------- */
  section("derive_focus_family — called the way the loop calls it (service role)");

  const { data: derived, error: dErr } = await sb.rpc("derive_focus_family", {
    _user: advisor,
    _rooftop: rooftopId,
    _period: periodId,
  });
  ok("it returns a row rather than erroring", !dErr, dErr?.message);

  /*
   * A NULL COMPOSITE COMES BACK AS A ROW OF NULLS, NOT AS null.
   *
   * `returns advisor_focus_family` with `return null` reaches PostgREST as
   * {"id":null,"user_id":null,...}, which is truthy in JavaScript. A caller
   * testing `if (row)` would treat "nothing was rankable" as a successful
   * assignment and read a null family out of it. 3b must test the FAMILY, and
   * so does this suite.
   */
  const row = derived as Record<string, unknown> | null;
  ok("it returns an assignment rather than a null composite", row?.family != null,
    "all-null row — nothing was rankable; check the benchmark gate");
  ok(
    "it picks the family with a film, NOT the bigger unfilmed gap",
    row?.family === RICH,
    `picked ${row?.family}; UNFILMED had the larger gap and no film`
  );
  ok("it records source 'derived'", row?.source === "derived");
  ok("it records the period the numbers came from", row?.period_id === periodId);
  ok("it records missed_ros as evidence", Number(row?.missed_ros) > 0,
    `got ${row?.missed_ros}`);
  ok(
    "it records the shelf depth at assignment",
    Number(row?.film_count) === 3,
    `got ${row?.film_count}`
  );
  ok("the row is active (ended_on null)", row?.ended_on === null);

  /* Idempotence: the loop calls this every morning. */
  const { data: again } = await sb.rpc("derive_focus_family", {
    _user: advisor,
    _rooftop: rooftopId,
    _period: periodId,
  });
  ok(
    "calling it again does not open a second assignment",
    (again as Record<string, unknown>)?.id === row?.id,
    "a second row would mean two live assignments"
  );
  const { count: activeCount } = await sb
    .from("advisor_focus_family")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisor)
    .is("ended_on", null);
  ok("exactly one active row exists", activeCount === 1, `got ${activeCount}`);

  /* -------------------------------------------------------------------- */
  section("The refusals — asserted, not assumed");

  const asAdvisor = await signedInAs(advisor);

  const { error: rpcErr } = await asAdvisor.rpc("derive_focus_family", {
    _user: advisor,
    _rooftop: rooftopId,
    _period: periodId,
  });
  ok(
    "an advisor CANNOT call derive_focus_family",
    rpcErr != null,
    "it ran — the definer function is reachable and would derive off the caller's own book"
  );

  const { error: insErr } = await asAdvisor.from("advisor_focus_family").insert({
    user_id: advisor,
    rooftop_id: rooftopId,
    family: THIN,
    source: "manager",
    assigned_by: advisor,
  });
  ok(
    "an advisor CANNOT insert their own assignment",
    insErr != null,
    "it wrote — an advisor can choose the family they are already good at"
  );

  const { error: updErr, count: updCount } = await asAdvisor
    .from("advisor_focus_family")
    .update({ family: THIN }, { count: "exact" })
    .eq("user_id", advisor)
    .is("ended_on", null);
  ok(
    "an advisor CANNOT move their own assignment",
    updErr != null || updCount === 0,
    "the update landed"
  );

  const { error: ovrErr } = await asAdvisor.rpc("set_focus_family_override", {
    _user: advisor,
    _rooftop: rooftopId,
    _family: THIN,
  });
  ok(
    "an advisor CANNOT override themselves through the manager function",
    ovrErr != null,
    "managed_users() let a non-manager through"
  );

  const asStranger = await signedInAs(stranger);
  const { error: strangerErr } = await asStranger.rpc("set_focus_family_override", {
    _user: advisor,
    _rooftop: rooftopId,
    _family: THIN,
  });
  ok(
    "a manager at ANOTHER rooftop is refused",
    strangerErr != null,
    "cross-store override succeeded"
  );

  /* And the read side still works for the person it is about. */
  const { data: ownRead } = await asAdvisor
    .from("advisor_focus_family")
    .select("id, family")
    .eq("user_id", advisor);
  ok("an advisor CAN read their own assignment", (ownRead ?? []).length === 1,
    `got ${(ownRead ?? []).length}`);

  const asStrangerRead = await asStranger
    .from("advisor_focus_family")
    .select("id")
    .eq("user_id", advisor);
  ok(
    "a manager at another rooftop reads nothing",
    (asStrangerRead.data ?? []).length === 0
  );

  /* -------------------------------------------------------------------- */
  section("set_focus_family_override — as a signed-in manager");

  const asManager = await signedInAs(manager);

  const { error: noFilmErr } = await asManager.rpc("set_focus_family_override", {
    _user: advisor,
    _rooftop: rooftopId,
    _family: UNFILMED,
  });
  ok(
    "a family with no film is refused even by hand",
    noFilmErr != null,
    "the override reached the empty shelf the gate exists to prevent"
  );

  const { data: overridden, error: mErr } = await asManager.rpc(
    "set_focus_family_override",
    { _user: advisor, _rooftop: rooftopId, _family: THIN, _note: "manager says so" }
  );
  ok("a manager of the advisor CAN override", !mErr, mErr?.message);
  const ov = overridden as Record<string, unknown> | null;
  ok("the override lands on the named family", ov?.family === THIN, `got ${ov?.family}`);
  ok("it records source 'manager'", ov?.source === "manager");
  ok("it records who ruled", ov?.assigned_by === manager);

  const { count: stillOne } = await sb
    .from("advisor_focus_family")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisor)
    .is("ended_on", null);
  ok("the previous assignment was ended, not duplicated", stillOne === 1,
    `got ${stillOne} active`);

  const { count: history } = await sb
    .from("advisor_focus_family")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisor);
  ok("history is retained", (history ?? 0) === 2, `got ${history} total rows`);

  /*
   * TWO_LADDERS RULE 2, AND THE REASON THE `source` COLUMN EXISTS.
   * "A mid-week DMS drop would move an advisor off the family their manager
   * mentioned on Monday." This is that drop.
   */
  const { data: afterOverride } = await sb.rpc("derive_focus_family", {
    _user: advisor,
    _rooftop: rooftopId,
    _period: periodId,
  });
  ok(
    "a re-derivation does NOT overwrite a manager's ruling",
    (afterOverride as Record<string, unknown>)?.family === THIN,
    `the DMS moved them to ${(afterOverride as Record<string, unknown>)?.family}`
  );
  ok(
    "and it returns the ruling rather than null",
    (afterOverride as Record<string, unknown>)?.source === "manager"
  );

  /* -------------------------------------------------------------------- */
  section("The honest nulls");

  const noDms = await makeUser("advisor", rooftopId);
  const { data: noDmsOut, error: noDmsErr } = await sb.rpc("derive_focus_family", {
    _user: noDms,
    _rooftop: rooftopId,
    _period: periodId,
  });
  ok("an advisor with no DMS link errors nothing", !noDmsErr, noDmsErr?.message);
  ok(
    "and gets NO family rather than a guessed one",
    (noDmsOut as Record<string, unknown> | null)?.family == null,
    "a default family was invented — that is Mitch's open question 4"
  );

  const { count: noDmsRows } = await sb
    .from("advisor_focus_family")
    .select("id", { count: "exact", head: true })
    .eq("user_id", noDms);
  ok("and no row was written for them", noDmsRows === 0, `got ${noDmsRows}`);

  /* -------------------------------------------------------------------- */
  section("The consumption record");

  const filmId = madeContent[0];
  const { error: cpErr } = await sb.from("content_progress").insert({
    user_id: advisor,
    rooftop_id: rooftopId,
    content_id: filmId,
    watched_pct: 100,
    completed_at: new Date().toISOString(),
    source: "card",
  });
  ok("a consumption row records which surface produced it", !cpErr, cpErr?.message);

  const { error: badSource } = await sb.from("content_progress").insert({
    user_id: advisor,
    rooftop_id: rooftopId,
    content_id: madeContent[1],
    watched_pct: 10,
    source: "nonsense",
  });
  ok("an unknown source is refused", badSource != null, "the check constraint is not biting");

  const { error: dupe } = await sb.from("content_progress").insert({
    user_id: advisor,
    rooftop_id: rooftopId,
    content_id: filmId,
    watched_pct: 100,
    source: "loop",
  });
  ok(
    "the loop cannot create a second row for a film the card already recorded",
    dupe != null,
    "watch-ahead would be re-served"
  );

  /* -------------------------------------------------------------------- */
  section("Track entry");

  const { data: core } = await sb
    .from("certification")
    .select("id, slug, entry_film_content_id")
    .eq("is_core", true)
    .limit(1)
    .single();
  const certId = need(core, "a core certification").id;
  ok(
    "certification.entry_film_content_id exists and is empty",
    core!.entry_film_content_id === null,
    "something has already ruled which film opens a track"
  );

  const { error: teErr } = await sb.from("advisor_track_entry").insert({
    user_id: advisor,
    certification_id: certId,
    rooftop_id: rooftopId,
    film_content_id: filmId,
  });
  ok("the loop can record a track entry", !teErr, teErr?.message);

  const { error: teDupe } = await sb.from("advisor_track_entry").insert({
    user_id: advisor,
    certification_id: certId,
    rooftop_id: rooftopId,
  });
  ok("a track cannot be entered twice", teDupe != null, "the entry film would re-serve");

  const { error: teSelf } = await asAdvisor.from("advisor_track_entry").insert({
    user_id: advisor,
    certification_id: certId,
    rooftop_id: rooftopId,
  });
  ok(
    "an advisor CANNOT record their own entry",
    teSelf != null,
    "the entry film could be skipped"
  );

  const { data: teRead } = await asAdvisor
    .from("advisor_track_entry")
    .select("certification_id")
    .eq("user_id", advisor);
  ok("an advisor CAN read their own entry", (teRead ?? []).length === 1);

  /* -------------------------------------------------------------------- */
  section("The technician is still shut out");

  /*
   * 0123 section 0 widened has_performance_surface(). This is the assertion
   * that it widened it for the BACKEND and not for everyone — 0096's rule has
   * to survive, or this migration quietly hands performance data to a role the
   * product says has none.
   */
  const tech = await makeUser("advisor", rooftopId);
  await sb.from("membership").update({ role: "technician" }).eq("user_id", tech);
  const asTech = await signedInAs(tech);
  const { data: techBench } = await asTech
    .from("family_store_benchmark")
    .select("family")
    .eq("period_id", periodId);
  ok(
    "a technician still sees no benchmark",
    (techBench ?? []).length === 0,
    `got ${(techBench ?? []).length} rows — 0096's role gate was widened too far`
  );
}

/* ---- cleanup -------------------------------------------------------------- */
async function cleanup() {
  for (const u of madeUsers) {
    await sb.from("advisor_track_entry").delete().eq("user_id", u);
    await sb.from("advisor_focus_family").delete().eq("user_id", u);
    await sb.from("content_progress").delete().eq("user_id", u);
    await sb.from("membership").delete().eq("user_id", u);
    await sb.from("app_user").delete().eq("id", u);
    await sb.auth.admin.deleteUser(u);
  }
  if (madeContent.length) await sb.from("content").delete().in("id", madeContent);
  if (madeCodes.length) {
    await sb.from("op_code_family").delete().in("code", madeCodes);
    await sb.from("op_code_catalog").delete().in("code", madeCodes);
  }
  if (periodId) {
    await sb.from("advisor_op_metric").delete().eq("period_id", periodId);
    await sb.from("advisor_period_total_src").delete().eq("period_id", periodId);
    await sb.from("perf_period").delete().eq("id", periodId);
  }
  if (madeLines.length) await sb.from("service_line").delete().in("op_code", madeLines);
  for (const r of [rooftopId, otherRooftopId]) {
    if (r) await sb.from("rooftop").delete().eq("id", r);
  }
  if (orgId) await sb.from("org").delete().eq("id", orgId);
}

run()
  .catch((e) => {
    failed++;
    console.error(`\n  HARNESS ERROR: ${e instanceof Error ? e.message : e}`);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error(`  cleanup: ${e}`));
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  });
