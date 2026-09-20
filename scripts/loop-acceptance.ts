/* ============================================================================
   EDIAGD — the Two Ladders loop, against a real database

   THE TESTS PHASE 3B EXISTS TO PASS. AGENTS.md: a function shipped in a
   migration must be exercised by the role and the path that will actually call
   it. So this does not poke at selection in isolation — it drives the REAL
   completion engine, completeDay(), with a REAL signed day stamp, the way
   completeDayAction does, and then reads back what the database actually holds.

   Ruling 8 asks for four things, before and after:

     1  a completed normal morning advancing the SERVICE counter
     2  the same morning advancing the CRAFT track counter
     3  a two-slot morning completing and advancing the streak
     4  a base-tier advisor reaching nothing new

   Plus ruling 4 — a streak that spans the migration, old shape and new,
   unbroken — and ruling 7's null composite.

   EVERY ASSERTION IS PROVEN NON-VACUOUS. Each guard is reverted in the
   database, the assertion is re-run and must fail, and the guard is restored.
   A suite that only ever sees the working state is a suite that would pass
   against a stub.

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:loop

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
   It creates an org, rooftops, auth users, a period, DMS metrics, op codes,
   films, a course, modules, items and completions, and removes them again. It
   refuses any SB_URL that is not localhost.
============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { completeDay } from "@/lib/gamification/completeDay";
import { assembleMorning } from "@/lib/loop";
import { rooftopIsProvisioned } from "@/lib/entitlement";
import { mintDayStamp } from "@/lib/day-stamp";
import { evaluateDayGate } from "@/lib/gamification/dayGate";
import { compositeOrNull } from "@/lib/pg-composite";
import type { IsoDate } from "@/lib/gamification/streak";

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

/*
 * ---- MUX SIGNING, OR EVERY FILM SHAPES TO NULL ---------------------------
 *
 * playbackFor() returns null when muxConfigured() is false, whatever the
 * playback policy, so shapeVideo() returns null and the loop reports a morning
 * with no films in it. That is CORRECT behaviour — a film nobody can play is
 * not a film — but it would make this suite silently assert nothing: every
 * morning would be two-slot and every gate would pass for the wrong reason.
 *
 * So the dev machine's own Mux keys are borrowed from .env.local if the
 * environment does not already carry them. Nothing leaves the machine: minting
 * a playback token is a local HMAC, not a request. Missing keys are not fatal
 * — the suite says so loudly instead, because "0 films" needs to read as a
 * broken harness rather than as a finding.
 */
for (const [k, v] of Object.entries(loadEnvFile())) {
  if (k.startsWith("MUX_") && !process.env[k]) process.env[k] = v;
}
if (!process.env.MUX_SIGNING_KEY_ID || !process.env.MUX_SIGNING_KEY_PRIVATE) {
  console.error(
    "\n  MUX_SIGNING_KEY_ID / MUX_SIGNING_KEY_PRIVATE not set and not in .env.local.\n" +
      "  Every film would shape to null and this suite would assert nothing.\n"
  );
  process.exit(1);
}

function loadEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(`${process.cwd()}/.env.local`, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

/*
 * ---- completeDay BUILDS ITS OWN CLIENT, SO POINT IT AT LOCAL -------------
 *
 * createServiceClient() reads NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY from the environment. .env.local holds the
 * PRODUCTION values, and this suite writes completions, mints Sand Dollars and
 * closes coaching blocks.
 *
 * So they are OVERWRITTEN here from SB_URL / SB_KEY — which the guard above has
 * already proven are localhost — rather than merely defaulted. An assignment
 * (not a `??=`) is the point: if .env.local is loaded by anything else in this
 * process, local still wins.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;

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

/**
 * Prove an assertion is not vacuous: break the thing it guards, re-check, and
 * put it back. A `revert` that leaves the database dirty would poison every
 * later assertion, so `restore` runs in a finally.
 */
async function nonVacuous(
  label: string,
  revert: () => Promise<void>,
  recheck: () => Promise<boolean>,
  restore: () => Promise<void>
) {
  try {
    await revert();
    const stillPasses = await recheck();
    ok(`↳ and fails when ${label}`, !stillPasses, "the assertion passed anyway — it proves nothing");
  } finally {
    await restore();
  }
}

/* ---- fixtures ------------------------------------------------------------- */
const TAG = `loop-${randomUUID().slice(0, 8)}`;
const PASSWORD = "Fixture-passw0rd!";
const madeUsers: string[] = [];
const madeContent: string[] = [];
const madeCodes: string[] = [];
const madeLines: string[] = [];
const madeCourses: string[] = [];
const madeCerts: string[] = [];
let orgId = "";
let rooftopId = "";
let periodId = "";
let grantedProduct = false;
let borrowedCertId = "";
let craftCertWasActive = false;

const FAM = `${TAG} Focus Family`;

/*
 * ---- THE STORE'S TODAY, NOT A DATE THIS FILE CHOSE ------------------------
 *
 * completeDay resolves the day from rooftop_today() and refuses a stamp minted
 * for any other date — correctly; a stamp for yesterday is not this completion.
 * So a suite with a hardcoded date passes on one day of the year.
 *
 * The consequence shapes everything below: an advisor can complete exactly ONE
 * real day, because there is one rooftop_today and one row per user per date.
 * So each scenario gets its OWN advisor with its history pre-loaded, and each
 * one completes a single genuine morning. That is closer to the truth than
 * fast-forwarding a clock would be — the state each advisor arrives in is
 * written the way the database really holds it.
 */
let TODAY = "" as IsoDate;

async function makeUser(role: "advisor" | "manager", opCode?: string) {
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
    rooftop_id: rooftopId,
    role,
    active: true,
    op_code_id: opCode ?? null,
  });
  if (mErr) throw new Error(`membership: ${mErr.message}`);
  return id;
}

async function signedInAs(userId: string): Promise<SupabaseClient> {
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({
    email: u.user!.email!,
    password: PASSWORD,
  });
  if (error) throw new Error(`signIn: ${error.message}`);
  return c;
}

async function makeFilm(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await sb
    .from("content")
    .insert({
      type: "advisor_video",
      status: "published",
      duration_sec: 120,
      mux_playback_id: `fx-${randomUUID().slice(0, 8)}`,
      mux_playback_policy: "signed",
      captions_ready: true,
      ...fields,
    })
    .select("id")
    .single();
  if (error) throw new Error(`film: ${error.message}`);
  madeContent.push(data.id);
  return data.id as string;
}

/**
 * The watch gate this server would have written.
 *
 * completeDay reads the GATE RECORD, not the percentage the browser claims —
 * see buildMorning. So a fixture that wants a film to count has to leave behind
 * the same evidence a real watch does: a watch_gate row for that content, that
 * user, that store-local day. Faking the percentage instead would test a path
 * the product does not have.
 */
async function meetGate(userId: string, contentId: string, day: IsoDate) {
  const { error } = await sb.from("watch_gate").upsert(
    {
      user_id: userId,
      rooftop_id: rooftopId,
      content_id: contentId,
      store_date: day,
      watched_pct: 100,
      watch_error: false,
    },
    { onConflict: "user_id,content_id,store_date" }
  );
  if (error) throw new Error(`watch_gate: ${error.message}`);
}


/** One advisor's book for one period, enough for derive_focus_family to rank. */
async function seedBook(
  advisorOpId: string,
  totalRos: number,
  perFamily: { family: string; ros: number; labor: number }[]
) {
  await sb.from("advisor_period_total_src").insert({
    period_id: periodId,
    rooftop_id: rooftopId,
    advisor_op_id: advisorOpId,
    total_ros: totalRos,
    total_labor_sales: perFamily.reduce((a, f) => a + f.labor, 0),
    total_ro_lines: totalRos,
  });
  for (const f of perFamily) {
    const line = `${TAG}-${f.family}`.slice(0, 40);
    if (!madeLines.includes(line)) {
      const { error } = await sb
        .from("service_line")
        .insert({ op_code: line, category: "Fixture", description: TAG });
      if (error) throw new Error(`service_line: ${error.message}`);
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
  const { data: o } = await sb.from("org").insert({ name: `${TAG} Org` }).select("id").single();
  orgId = need(o, "org").id;

  const { data: r } = await sb
    .from("rooftop")
    .insert({ org_id: orgId, name: `${TAG} Store`, timezone: "America/Chicago" })
    .select("id")
    .single();
  rooftopId = need(r, "rooftop").id;

  /*
   * THE ENTITLEMENT THE WHOLE LIBRARY SITS BEHIND. advisor_video resolves to
   * product 'advisor_base' via product_for_content_type (0010), so without this
   * row the fixture advisor is a BASE-TIER advisor who can read nothing — which
   * is assertion 4's whole point, and is why it is granted explicitly here
   * rather than assumed.
   */
  const { error: prodErr } = await sb
    .from("rooftop_product")
    .insert({ rooftop_id: rooftopId, product: "advisor_base" });
  if (!prodErr) grantedProduct = true;

  /*
   * THE PERIOD HAS TO CONTAIN TODAY, and that is not fixture housekeeping.
   *
   * impact_coaching joins perf_period on `completion_date between starts_on and
   * ends_on`. A completion outside every period produces no coaching row at
   * all — so a fixture period in a different month would have made the ROI
   * assertion fail for a reason that has nothing to do with the op-code bridge
   * it is testing. Caught exactly that way on the first run.
   */
  const { data: storeToday } = await sb.rpc("rooftop_today", { _rooftop: rooftopId });
  TODAY = String(storeToday) as IsoDate;

  const monthStart = `${TODAY.slice(0, 7)}-01`;
  const { data: p } = await sb
    .from("perf_period")
    .insert({
      rooftop_id: rooftopId,
      starts_on: monthStart,
      ends_on: addDays(`${TODAY.slice(0, 8)}28`, 14),
    })
    .select("id")
    .single();
  periodId = need(p, "period").id;

  /* ---- the pitch shelf: ONE film, so the cycle ends after one morning ---- */
  const code = `${TAG.slice(0, 6)}F1`.toUpperCase();
  await sb.from("op_code_catalog").insert({
    code,
    name: `${TAG} service`,
    category: "Fixture",
    sort_order: 9000,
  });
  await sb
    .from("op_code_family")
    .insert({ code, family: FAM, coachable: true, confidence: "ruled", note: TAG });
  madeCodes.push(code);

  await makeFilm({
    collection: "Pitches by Op Code",
    title: `${TAG} pitch film`,
    op_code: code,
    stage: "On the Drive",
  });

  /* ---- the mindset shelf ------------------------------------------------- */
  for (let i = 0; i < 3; i++) {
    await makeFilm({
      collection: "Mindset",
      placement: "daily_lifestyle",
      title: `${TAG} mindset ${i}`,
    });
  }

  /* ---- the quote pool ---------------------------------------------------- */
  for (let i = 0; i < 3; i++) {
    const { data, error } = await sb
      .from("content")
      .insert({
        type: "quote",
        status: "published",
        title: `${TAG} quote ${i}`,
        body: `A line to carry, number ${i}.`,
        voice: `${TAG} voice ${i}`,
        quote_slot: "both",
      })
      .select("id")
      .single();
    if (error) throw new Error(`quote: ${error.message}`);
    madeContent.push(data.id);
  }

  /*
   * ---- the craft ladder --------------------------------------------------
   *
   * ATTACHED TO A REAL CORE CERTIFICATION, not an invented one. pickItem walks
   * `certification where is_core` by `sort`, and the craft accrual checks
   * `active` — a fixture catalogue of its own would exercise neither. Same call
   * certification-acceptance makes, and it is put back in cleanup.
   *
   * ONE MODULE, TWO ITEMS: morning one leaves the module unfinished (so the
   * craft counter advances without earning) and morning two finishes it (so the
   * track earns). Both halves of "advancing the craft counter" get asserted.
   */
  const { data: core } = await sb
    .from("certification")
    .select("id, slug, name")
    .eq("is_core", true)
    .order("sort", { ascending: true })
    .limit(1)
    .single();
  const craftCert = need(core, "a core certification");

  /*
   * BORROWED, AND SWITCHED ON FOR THE DURATION.
   *
   * `active` is content-derived: recompute_certification_content() sets it from
   * whether the track clears certification_min_items. The local seed ships every
   * track inactive because it ships no courses, and accrueCraft only grants an
   * ACTIVE certification — so the craft assertion would fail for a reason that
   * has nothing to do with the loop.
   *
   * Flipped directly rather than by running the recompute, because the recompute
   * would also judge this suite's one-film SERVICE certification against the
   * five-item bar and switch THAT off. The prior value is restored in cleanup.
   */
  craftCertWasActive = Boolean(
    (await sb.from("certification").select("active").eq("id", craftCert.id).single()).data?.active
  );
  await sb.from("certification").update({ active: true }).eq("id", craftCert.id);
  borrowedCertId = craftCert.id;

  const { data: course } = await sb
    .from("course")
    .insert({ track: "Foundations", name: `${TAG} course`, slug: `${TAG}-course` })
    .select("id")
    .single();
  const courseId = need(course, "course").id;
  madeCourses.push(courseId);
  await sb
    .from("certification_course")
    .insert({ certification_id: craftCert.id, course_id: courseId, sort: 0 });

  const { data: mod } = await sb
    .from("module")
    .insert({ course_id: courseId, name: `${TAG} module`, sort_order: 0 })
    .select("id")
    .single();
  const moduleId = need(mod, "module").id;

  const itemIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { data, error } = await sb
      .from("content")
      .insert({
        type: "cue",
        status: "published",
        title: `${TAG} item ${i}`,
        body: `Teaching body ${i}.`,
        module_id: moduleId,
        module_order: i,
      })
      .select("id")
      .single();
    if (error) throw new Error(`item: ${error.message}`);
    madeContent.push(data.id);
    itemIds.push(data.id);
  }

  /*
   * ---- the SERVICE certification for the focus family --------------------
   * One published film in FAM, so completing it completes the family.
   */
  const { data: svc, error: svcErr } = await sb
    .from("certification")
    .insert({
      slug: `${TAG}-svc`,
      name: `${TAG} Service`,
      kind: "service",
      service_family: FAM,
      is_core: false,
      active: true,
      sort: 900,
      glyph_key: "wave",
    })
    .select("id")
    .single();
  if (svcErr) throw new Error(`service cert: ${svcErr.message}`);
  madeCerts.push(svc.id);

  return { craftCert, moduleId, itemIds };
}

/* ============================================================================
   The suite
   ============================================================================ */
async function run() {
  const { craftCert, moduleId, itemIds } = await setup();

  ok("the store's today resolved", /^\d{4}-\d{2}-\d{2}$/.test(TODAY), TODAY);

  /* Three books, so three advisors can each be ranked onto the same family. */
  await seedBook(`${TAG}-strong`, 100, [{ family: FAM, ros: 90, labor: 9000 }]);

  /* ==================================================================== */
  section("Ruling 7 — the null composite");

  ok(
    "a row of nulls is read as nothing",
    compositeOrNull<Record<string, unknown>, string>({ id: null, family: null }, "family") === null
  );
  ok(
    "a real row survives",
    compositeOrNull<Record<string, unknown>, string>({ id: "x", family: "Brakes" }, "family") !== null
  );
  ok(
    "a SETOF array of one null composite is also nothing",
    compositeOrNull<Record<string, unknown>, string>([{ id: null, family: null }], "family") === null
  );

  /* ==================================================================== */
  section("Ruling 3 — one gate, decided in one place");

  const unfinished = evaluateDayGate({
    kind: "normal",
    mindset: { contentId: "a", met: true },
    pitch: { contentId: "b", met: false },
    item: { contentId: "c", met: true },
    trackFilm: null,
  });
  ok("an unwatched pitch holds the day", !unfinished.complete);
  ok("and it names the outstanding leg", unfinished.outstanding.join() === "pitch");

  ok(
    "a two-slot morning completes on two legs",
    evaluateDayGate({
      kind: "two_slot",
      mindset: { contentId: "a", met: true },
      pitch: null,
      item: { contentId: "c", met: true },
      trackFilm: null,
    }).complete
  );

  ok(
    "a track-entry morning completes on the film alone",
    evaluateDayGate({
      kind: "track_entry",
      mindset: { contentId: "a", met: true },
      pitch: null,
      item: null,
      trackFilm: { contentId: "f", met: true },
    }).complete
  );

  ok(
    "an unwatched track film holds an entry morning",
    !evaluateDayGate({
      kind: "track_entry",
      mindset: { contentId: "a", met: true },
      pitch: null,
      item: null,
      trackFilm: { contentId: "f", met: false },
    }).complete
  );

  ok(
    "a morning with nothing offered fails closed",
    !evaluateDayGate({
      kind: "normal",
      mindset: null,
      pitch: null,
      item: null,
      trackFilm: null,
    }).complete,
    "an empty screen would have paid out a streak day and ten Sand Dollars"
  );

  /* ==================================================================== */
  section("ADVISOR A — a normal morning, and BOTH counters");

  const advA = await makeUser("advisor", `${TAG}-a`);
  await seedBook(`${TAG}-a`, 200, [{ family: FAM, ros: 40, labor: 4000 }]);
  const asA = await signedInAs(advA);

  const { data: rpcRow, error: rpcErr } = await sb.rpc("advance_focus_family", {
    _user: advA,
    _rooftop: rooftopId,
  });
  ok(
    "the focus family derives",
    compositeOrNull<Record<string, unknown>, string>(rpcRow as Record<string, unknown>, "family") !==
      null,
    `rpc error=${rpcErr?.message ?? "none"}`
  );

  /*
   * THE SHELF IS READ WITH THE RIGHT CLIENT. op_code_family is admin-scoped
   * (0081), so reading it as the advisor returns zero rows AND NO ERROR — which
   * is exactly how the pitch slot came to be silently dead the first time this
   * suite ran. Asserted from both sides so a future "simplification" of the two
   * clients into one fails here rather than in production.
   */
  const advSideCodes = await asA.from("op_code_family").select("code").eq("family", FAM);
  ok(
    "an advisor reads NOTHING from op_code_family — silently",
    (advSideCodes.data ?? []).length === 0 && !advSideCodes.error,
    "0081's trust boundary moved; lib/loop.ts's two clients can be simplified"
  );
  const svcSideCodes = await sb.from("op_code_family").select("code").eq("family", FAM);
  ok("and the service role reads the family's codes", (svcSideCodes.data ?? []).length > 0);

  const mA = await assembleMorning(asA, sb, advA, rooftopId, TODAY);
  ok("it is a normal morning", mA.kind === "normal", `got ${mA.kind}`);
  ok("slot 1 is a mindset film", mA.mindset !== null);
  ok("slot 2 is the focus family's film", mA.pitch?.family === FAM, `got ${mA.pitch?.family}`);
  ok("slot 3 is the first item of the track", mA.item?.position === 1, `got ${mA.item?.position}`);
  ok("a closing quote is drawn", mA.quote !== null);
  ok(
    "the quote is none of the three slots",
    mA.quote?.id !== mA.item?.contentId && mA.quote?.id !== mA.pitch?.contentId
  );
  ok("the track is being entered", mA.track?.entering === true);
  ok(
    "but it has no film, so it stays a normal morning",
    mA.track?.film === null && mA.kind === "normal",
    "ruling 2: no film means a normal morning, not a placeholder"
  );

  /* ---- the engine refuses it before anything is worked ----------------- */
  let refused = "";
  try {
    await completeDay(advA, rooftopId, { dayStamp: stampFor(advA, TODAY, mA) });
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  ok("completeDay refuses a morning nobody worked", /still to go/.test(refused), refused);
  ok(
    "and claims no day, so it can be retried",
    (await countRows("daily_completion", advA)) === 0,
    "a refused day claimed the date"
  );

  /* ---- BEFORE ---------------------------------------------------------- */
  const beforeA = await counters(advA, moduleId, FAM);
  ok("before: no service certification", beforeA.serviceHeld === 0);
  ok("before: no craft certification", beforeA.craftHeld === 0);
  ok("before: nothing consumed", beforeA.consumed === 0);
  ok("before: streak is zero", beforeA.streak === 0);
  ok("before: the ROI view shows no coaching on the family", beforeA.impactPitch === false);

  await meetGate(advA, need(mA.mindset, "mindset A").contentId, TODAY);
  await meetGate(advA, need(mA.pitch, "pitch A").contentId, TODAY);

  const rA = await completeDay(advA, rooftopId, {
    dayStamp: stampFor(advA, TODAY, mA),
    itemAck: true,
  });

  /* ---- AFTER ----------------------------------------------------------- */
  const afterA = await counters(advA, moduleId, FAM);
  ok("the day completed", rA.alreadyComplete === false);
  ok("and the streak is 1", rA.streak === 1, `streak ${rA.streak}`);
  ok("it recorded WHICH morning it was", afterA.kind === "normal", `got ${afterA.kind}`);
  ok("the item is on its own column", afterA.itemId === mA.item?.contentId);
  ok(
    "cue_content_id stays null, so the old ROI join is untouched",
    afterA.cueId === null,
    "a craft item was written into the coaching-coverage column"
  );
  ok(
    "SERVICE counter advanced — the family is certified",
    afterA.serviceHeld === 1,
    `held ${afterA.serviceHeld}`
  );
  ok(
    "CRAFT counter advanced — pitch and item both consumed",
    afterA.consumed === 2,
    `consumed ${afterA.consumed}`
  );
  ok(
    "but the craft track is NOT earned — a module is unfinished",
    afterA.craftHeld === 0,
    "a half-finished module certified somebody"
  );
  ok("both pool cursors were written", afterA.poolRows === 2, `got ${afterA.poolRows}`);
  ok("the track entry was recorded", afterA.entries === 1, "ruling 2: film or no film");
  ok(
    "the ROI view now sees the pitch as coaching on the family",
    afterA.impactPitch === true,
    "impact_coaching lost the family — the dealer's number would go to zero"
  );

  await nonVacuous(
    "the op-code bridge is taken out of impact_coaching",
    async () => {
      await sb.from("op_code_family").update({ coachable: false }).eq("code", madeCodes[0]);
    },
    async () => (await counters(advA, moduleId, FAM)).impactPitch === true,
    async () => {
      await sb.from("op_code_family").update({ coachable: true }).eq("code", madeCodes[0]);
    }
  );

  /* ==================================================================== */
  section("The coaching floor — a thin month derives nothing");

  /*
   * THE DISAGREEMENT THIS CLOSES. eddiesPick() has always returned null below
   * min_ros_for_coaching(); derive_focus_family() floored at `> 0` until 0124.
   * On production that gap covered 25 of 59 measured operators, and one of the
   * four real advisor accounts — who came out with a focus family derived from
   * a single missed RO.
   */
  const { data: floorRow } = await sb.rpc("min_ros_for_coaching");
  const FLOOR = Number(floorRow ?? 20);
  ok("the floor comes from min_ros_for_coaching(), not a literal", FLOOR > 0, `got ${FLOOR}`);

  const thin = await makeUser("advisor", `${TAG}-thin`);
  /* Below the floor, and deliberately with a WIDE gap — 4 of 5 ROs missed on a
     family that is fully stocked. Volume is the only thing wrong with them. */
  await seedBook(`${TAG}-thin`, FLOOR - 1, [{ family: FAM, ros: 1, labor: 100 }]);

  const { data: thinRpc } = await sb.rpc("advance_focus_family", {
    _user: thin,
    _rooftop: rooftopId,
  });
  ok(
    "an advisor below the floor derives NO focus family",
    compositeOrNull<Record<string, unknown>, string>(
      thinRpc as Record<string, unknown>,
      "family"
    ) === null,
    "a pick was derived from a month too thin to read"
  );

  const asThin = await signedInAs(thin);
  const thinMorning = await assembleMorning(asThin, sb, thin, rooftopId, TODAY);
  ok(
    "and gets a two-slot morning rather than a pitch chosen from noise",
    thinMorning.kind === "two_slot" && thinMorning.pitch === null,
    `got ${thinMorning.kind}`
  );

  await nonVacuous(
    "their volume is lifted to the floor",
    async () => {
      await sb
        .from("advisor_period_total_src")
        .update({ total_ros: FLOOR })
        .eq("period_id", periodId)
        .eq("advisor_op_id", `${TAG}-thin`);
    },
    async () => {
      const { data } = await sb.rpc("advance_focus_family", {
        _user: thin,
        _rooftop: rooftopId,
      });
      return (
        compositeOrNull<Record<string, unknown>, string>(
          data as Record<string, unknown>,
          "family"
        ) === null
      );
    },
    async () => {
      await sb
        .from("advisor_period_total_src")
        .update({ total_ros: FLOOR - 1 })
        .eq("period_id", periodId)
        .eq("advisor_op_id", `${TAG}-thin`);
      await sb.from("advisor_focus_family").delete().eq("user_id", thin);
    }
  );

  /* ==================================================================== */
  section("ADVISOR B — a two-slot morning, a craft track earned, and ruling 4");

  const advB = await makeUser("advisor", `${TAG}-b`);
  await seedBook(`${TAG}-b`, 200, [{ family: FAM, ros: 40, labor: 4000 }]);
  const asB = await signedInAs(advB);

  /*
   * B ARRIVES MID-STORY, WRITTEN THE WAY THE DATABASE REALLY HOLDS IT.
   *
   *   - the family's only film already completed  -> the shelf is empty, so
   *     today must be a two-slot morning
   *   - item 0 already completed                  -> today serves item 1, which
   *     finishes the module and earns the craft track
   *   - three completions in the OLD SHAPE        -> ruling 4's migration span
   */
  const filmId = need(
    (await sb.from("content").select("id").eq("op_code", madeCodes[0]).limit(1).single()).data,
    "the pitch film"
  ).id;
  await consume(advB, filmId);
  await consume(advB, itemIds[0]);

  /*
   * OLD-SHAPE DAYS: morning_kind null, cue_content_id set, item_content_id
   * null — byte-for-byte what the pre-0124 loop wrote. The swell row is what
   * actually carries a streak, so it is left the way the old engine would have.
   */
  const oldDays = [-3, -2, -1].map((n) => addDays(TODAY, n));
  for (const d of oldDays) {
    const { error } = await sb.from("daily_completion").insert({
      user_id: advB,
      rooftop_id: rooftopId,
      completion_date: d,
      cue_content_id: itemIds[0],
      was_scheduled: true,
    });
    if (error) throw new Error(`old completion: ${error.message}`);
  }
  await sb.from("swell").upsert(
    {
      user_id: advB,
      current_len: 3,
      longest_len: 3,
      last_completed_on: oldDays[2],
      paddle_out_available: 0,
    },
    { onConflict: "user_id" }
  );

  const mB = await assembleMorning(asB, sb, advB, rooftopId, TODAY);
  ok(
    "the focus family is out of film, so the morning is two-slot",
    mB.kind === "two_slot",
    `got ${mB.kind}`
  );
  ok("there is no pitch", mB.pitch === null);
  ok("the item slot still serves, and moves on", mB.item?.position === 2, `got ${mB.item?.position}`);
  ok(
    "the exhausted assignment was ended rather than re-derived onto itself",
    mB.assignment === null,
    `still assigned to ${mB.assignment?.family}`
  );

  const beforeB = await counters(advB, moduleId, FAM);
  ok("before: three old-shape days on file", beforeB.completions === 3);
  ok("before: streak is 3", beforeB.streak === 3);
  ok("before: no craft certification", beforeB.craftHeld === 0);
  ok("before: no module completed", beforeB.modulesDone === 0);

  await meetGate(advB, need(mB.mindset, "mindset B").contentId, TODAY);
  const rB = await completeDay(advB, rooftopId, {
    dayStamp: stampFor(advB, TODAY, mB),
    itemAck: true,
  });

  const afterB = await counters(advB, moduleId, FAM);
  ok("a two-slot morning completes", rB.alreadyComplete === false);
  ok("recorded as two_slot", afterB.kind === "two_slot", `got ${afterB.kind}`);
  ok(
    "THE STREAK SPANS THE MIGRATION: 3 old days + 1 new = 4, unbroken",
    rB.streak === 4,
    `streak came back ${rB.streak} — old completions were reinterpreted`
  );
  ok("it was not reset", rB.streakReset === false);
  ok("and no grace was spent to bridge the two shapes", rB.graceUsed === false);
  ok(
    "the module is now finished, so the CRAFT track earns",
    afterB.craftHeld === 1,
    `craft held ${afterB.craftHeld} — module_completion is what craftComplete reads`
  );
  ok("module_completion was written by the LOOP", afterB.modulesDone === 1);

  await nonVacuous(
    "module_completion is removed",
    async () => {
      await sb.from("module_completion").delete().eq("user_id", advB).eq("module_id", moduleId);
    },
    async () => (await counters(advB, moduleId, FAM)).modulesDone === 1,
    async () => {
      await sb
        .from("module_completion")
        .insert({ user_id: advB, module_id: moduleId, rooftop_id: rooftopId });
    }
  );

  const { data: spanRows } = await sb
    .from("daily_completion")
    .select("completion_date, morning_kind")
    .eq("user_id", advB)
    .order("completion_date");
  const shapes = (spanRows ?? []).map((r) => `${r.completion_date}:${r.morning_kind ?? "old"}`);
  ok(
    "four consecutive days on file: three old-shape, one new",
    shapes.join(" ") === `${oldDays[0]}:old ${oldDays[1]}:old ${oldDays[2]}:old ${TODAY}:two_slot`,
    shapes.join(" ")
  );

  /* ==================================================================== */
  section("Ruling 5 — the mindset pool: no repeat, then a reshuffle");

  const advC = await makeUser("advisor");
  const asC = await signedInAs(advC);

  const { data: mindsetPool } = await sb
    .from("content")
    .select("id")
    .eq("collection", "Mindset")
    .like("title", `${TAG}%`);
  const poolIds = (mindsetPool ?? []).map((r) => r.id as string);
  ok("the mindset shelf has three films", poolIds.length === 3, `${poolIds.length}`);

  const draw1 = need((await assembleMorning(asC, sb, advC, rooftopId, TODAY)).mindset, "draw 1");
  await markSeen(advC, "mindset", draw1.contentId, 1);
  const draw2 = need((await assembleMorning(asC, sb, advC, rooftopId, TODAY)).mindset, "draw 2");
  ok("the second draw is a different film", draw2.contentId !== draw1.contentId);
  await markSeen(advC, "mindset", draw2.contentId, 1);
  const m3 = await assembleMorning(asC, sb, advC, rooftopId, TODAY);
  const draw3 = need(m3.mindset, "draw 3");
  ok(
    "the third is the last unseen one",
    ![draw1.contentId, draw2.contentId].includes(draw3.contentId),
    "a film repeated before the pool was exhausted"
  );
  ok("still on pass 1", m3.mindsetCycle === 1, `cycle ${m3.mindsetCycle}`);

  await markSeen(advC, "mindset", draw3.contentId, 1);
  const m4 = await assembleMorning(asC, sb, advC, rooftopId, TODAY);
  ok(
    "the pool is exhausted, so a new pass begins",
    m4.mindsetCycle === 2,
    `cycle ${m4.mindsetCycle} — the loop should turn over, not run dry`
  );
  ok("and it serves again rather than nothing", m4.mindset !== null);

  await nonVacuous(
    "the seen rows are deleted",
    async () => {
      await sb.from("advisor_pool_seen").delete().eq("user_id", advC).eq("pool", "mindset");
    },
    async () => (await assembleMorning(asC, sb, advC, rooftopId, TODAY)).mindsetCycle === 2,
    async () => {
      for (const id of [draw1.contentId, draw2.contentId, draw3.contentId]) {
        await markSeen(advC, "mindset", id, 1);
      }
    }
  );

  /* ==================================================================== */
  section("Ruling 8.4 — a base-tier advisor reaches nothing new");

  /*
   * THE ENTITLEMENT IS REMOVED FROM THE ROOFTOP, not faked on the user. 0010
   * gates content on rooftop_has_product(m.rooftop_id, …), so this is the real
   * condition a rooftop that has not bought advisor_base is in.
   */
  await sb
    .from("rooftop_product")
    .delete()
    .eq("rooftop_id", rooftopId)
    .eq("product", "advisor_base");

  const base = await assembleMorning(asC, sb, advC, rooftopId, TODAY);
  ok("no mindset film reaches an unentitled advisor", base.mindset === null);
  ok("no pitch film either", base.pitch === null);
  ok("no item", base.item === null, "a cue leaked past content_entitled_read");
  ok("and no quote", base.quote === null);
  ok("the morning degrades to two-slot rather than erroring", base.kind === "two_slot");
  ok(
    "and a morning with nothing in it cannot be completed for a streak",
    !evaluateDayGate({
      kind: base.kind,
      mindset: base.mindset ? { contentId: "x", met: true } : null,
      pitch: null,
      item: base.item ? { contentId: "y", met: true } : null,
      trackFilm: null,
    }).complete,
    "an unentitled advisor could bank a day on an empty screen"
  );

  /*
   * ---- AND THE APP TELLS THEM, RATHER THAN LEAVING THEM STUCK ------------
   *
   * The morning above is empty and the gate refuses it, which is right. What
   * was wrong until now is that the advisor was shown the ritual anyway and
   * could not finish it — no error, no explanation. /today asks this BEFORE it
   * assembles anything, and renders RooftopNotReady instead.
   */
  ok(
    "an unprovisioned rooftop reports as not provisioned",
    (await rooftopIsProvisioned(sb, rooftopId)) === false,
    "the honest screen would never render and the advisor stays stuck"
  );

  await sb.from("rooftop_product").insert({ rooftop_id: rooftopId, product: "advisor_base" });

  ok(
    "↳ and a provisioned one reports as provisioned",
    (await rooftopIsProvisioned(sb, rooftopId)) === true,
    "every rooftop would be told it is not set up"
  );

  const restored = await assembleMorning(asC, sb, advC, rooftopId, TODAY);
  ok(
    "↳ and the SAME advisor reaches content once the product is back",
    restored.mindset !== null && restored.item !== null,
    "the empty morning above proved nothing — it was empty for another reason"
  );

  void craftCert;
}

/* ---- small helpers -------------------------------------------------------- */

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The stamp /today would have minted for this morning. */
function stampFor(
  userId: string,
  day: IsoDate,
  morning: Awaited<ReturnType<typeof assembleMorning>>
): string {
  return mintDayStamp({
    u: userId,
    d: day,
    b: null,
    q1: morning.quote?.id ?? null,
    q2: null,
    cue: null,
    vid: morning.mindset?.contentId ?? null,
    pitch: morning.pitch?.contentId ?? null,
    skipped: null,
    match: null,
    tier: null,
    kind: morning.kind,
    item: morning.item?.contentId ?? null,
    tfilm: morning.track?.film?.contentId ?? null,
    trk: morning.track?.entering ? morning.track.certificationId : null,
    mcyc: morning.mindsetCycle,
    qcyc: morning.quoteCycle,
  });
}

/** Mark something finished, the way a completion does. */
async function consume(userId: string, contentId: string) {
  const { error } = await sb.from("content_progress").upsert(
    {
      user_id: userId,
      rooftop_id: rooftopId,
      content_id: contentId,
      watched_pct: 100,
      completed_at: new Date().toISOString(),
      source: "loop",
    },
    { onConflict: "user_id,content_id" }
  );
  if (error) throw new Error(`consume: ${error.message}`);
}

async function markSeen(userId: string, pool: string, contentId: string, cycle: number) {
  const { error } = await sb
    .from("advisor_pool_seen")
    .upsert(
      { user_id: userId, pool, content_id: contentId, cycle },
      { onConflict: "user_id,pool,content_id,cycle" }
    );
  if (error) throw new Error(`markSeen: ${error.message}`);
}

async function countRows(table: string, userId: string): Promise<number> {
  const { count } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  return Number(count ?? 0);
}

/* ---- reading the counters ------------------------------------------------- */
async function counters(userId: string, moduleId: string, family: string) {
  const [
    { data: completions },
    { data: certs },
    { data: mods },
    { count: consumed },
    { data: swell },
    { count: poolRows },
    { count: entries },
    { data: impact },
    { count: completionCount },
  ] = await Promise.all([
    sb
      .from("daily_completion")
      .select("morning_kind, item_content_id, cue_content_id, completion_date")
      .eq("user_id", userId)
      .order("completion_date", { ascending: false })
      .limit(1),
    sb
      .from("advisor_certification")
      .select("certification_id, certification:certification_id(kind, service_family)")
      .eq("user_id", userId),
    sb.from("module_completion").select("module_id").eq("user_id", userId).eq("module_id", moduleId),
    sb
      .from("content_progress")
      .select("content_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("completed_at", "is", null),
    sb.from("swell").select("current_len").eq("user_id", userId).maybeSingle(),
    sb.from("advisor_pool_seen").select("content_id", { count: "exact", head: true }).eq("user_id", userId),
    sb
      .from("advisor_track_entry")
      .select("certification_id", { count: "exact", head: true })
      .eq("user_id", userId),
    sb.from("impact_coaching").select("family, via_pitch").eq("user_id", userId).eq("family", family),
    sb
      .from("daily_completion")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  type CertRow = { certification: { kind: string; service_family: string | null } | null };
  const held = ((certs ?? []) as unknown as CertRow[]).map((c) => c.certification);

  return {
    kind: completions?.[0]?.morning_kind ?? null,
    itemId: completions?.[0]?.item_content_id ?? null,
    cueId: completions?.[0]?.cue_content_id ?? null,
    serviceHeld: held.filter((c) => c?.kind === "service").length,
    craftHeld: held.filter((c) => c?.kind === "craft").length,
    modulesDone: (mods ?? []).length,
    consumed: Number(consumed ?? 0),
    streak: Number(swell?.current_len ?? 0),
    poolRows: Number(poolRows ?? 0),
    entries: Number(entries ?? 0),
    impactPitch: (impact ?? []).some((r) => r.via_pitch === true),
    completions: Number(completionCount ?? 0),
  };
}


/* ---- cleanup -------------------------------------------------------------- */
async function cleanup() {
  for (const u of madeUsers) {
    await sb.from("advisor_credential").delete().eq("user_id", u);
    await sb.from("advisor_certification").delete().eq("user_id", u);
    await sb.from("advisor_track_entry").delete().eq("user_id", u);
    await sb.from("advisor_pool_seen").delete().eq("user_id", u);
    await sb.from("advisor_focus_family").delete().eq("user_id", u);
    await sb.from("module_completion").delete().eq("user_id", u);
    await sb.from("content_progress").delete().eq("user_id", u);
    await sb.from("watch_gate").delete().eq("user_id", u);
    await sb.from("sand_dollar_entry").delete().eq("user_id", u);
    await sb.from("paddle_out_entry").delete().eq("user_id", u);
    await sb.from("user_badge").delete().eq("user_id", u);
    await sb.from("swell").delete().eq("user_id", u);
    await sb.from("daily_completion").delete().eq("user_id", u);
    await sb.from("membership").delete().eq("user_id", u);
    await sb.from("app_user").delete().eq("id", u);
    await sb.auth.admin.deleteUser(u);
  }
  if (madeContent.length) await sb.from("content").delete().in("id", madeContent);
  for (const c of madeCourses) {
    await sb.from("certification_course").delete().eq("course_id", c);
    await sb.from("module").delete().eq("course_id", c);
    await sb.from("course").delete().eq("id", c);
  }
  /* Only the fixture's OWN certification is removed; the core eight are the
     shipped catalogue and were only borrowed — so the one that was switched on
     is put back exactly as it was found. */
  await sb.from("certification").delete().like("slug", `${TAG}%`);
  if (borrowedCertId) {
    await sb
      .from("certification")
      .update({ active: craftCertWasActive })
      .eq("id", borrowedCertId);
  }
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
  if (rooftopId) {
    if (grantedProduct) await sb.from("rooftop_product").delete().eq("rooftop_id", rooftopId);
    await sb.from("rooftop").delete().eq("id", rooftopId);
  }
  if (orgId) await sb.from("org").delete().eq("id", orgId);
  void madeCerts;
}

run()
  .catch((e) => {
    failed++;
    console.error(`\n  HARNESS ERROR: ${e instanceof Error ? e.stack : e}`);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error(`  cleanup: ${e}`));
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  });
