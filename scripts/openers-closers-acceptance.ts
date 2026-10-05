/* ============================================================================
   EDIAGD — 0159 acceptance: the openers, the closers and the Walk-Around films,
   proven AS THE ADVISOR who will really meet them.

   Run against a LOCAL Supabase whose data is a restore of the production dump
   with 0159 applied — never against production; it writes.

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:openers

   ---------------------------------------------------------------------------
   WHY EVERY CHECK NAMES ITS VIEWER, AND WHY NONE OF THEM IS AN ADMIN
   ---------------------------------------------------------------------------
   AGENTS.md records the Daily Loop preview walking the real morning AS AN
   ADMIN, who has no DMS book, and therefore serving a two-slot morning every
   time — the one screen the phase existed to show was unreachable from the
   menu claiming to show it. An opener is a MANDATORY morning for an advisor,
   so the only role that proves it is an advisor: each scenario below gets its
   own real advisor account, signed in over PostgREST, reading through RLS.

   The service client appears only where the application uses one — the
   advisor_track_entry lookup inside pickItem(), the writes a completion
   performs, and recompute over the pg_safeupdate path.

   ---------------------------------------------------------------------------
   ONE ADVISOR PER SCENARIO, BECAUSE THERE IS ONE rooftop_today
   ---------------------------------------------------------------------------
   completeDay() resolves the day from rooftop_today() and refuses a stamp
   minted for another date, and there is one daily_completion row per user per
   date. So an advisor can complete exactly ONE real day — which is the truth
   rather than a limitation, and it is why each scenario arrives with its own
   history pre-loaded instead of fast-forwarding a clock.

   WHAT IT PROVES
     A  a fresh advisor with no advisor_track_entry row for Setting up the MPI
        gets a track_entry morning whose film is that track's opener, with the
        pitch and item slots withheld — and the day completes on that film
        alone, writing the entry row with the opener as film_content_id
     B  an advisor already on the track gets an ordinary morning: no opener,
        the item slot serving the track's first lesson. SCOPE: `normal` needs a
        servable pitch and a pitch needs a DMS book, which a fixture advisor
        has none of — so this morning is correctly two-slot, and the suite says
        so rather than calling two slots three. The pitch slot is covered by
        npm run accept:loop, which seeds a book for exactly that.
     C  Name Tag's closer is the LAST item the loop serves; after it the
        modules leg is met and trackComplete() reads FALSE because
        story_required is on and no story is told — then true once it is, and
        the real engine (accrueFromModule) grants the track.
     D  Walk Around module 4 serves 30 Second Part 2 as a GATED FILM item, not
        a cue — items_done flips on the FILM ALONE while six cues stay
        unwatched, because a cue never gates (0143). The module's own published
        quiz still withholds the completion row until it is passed, which is
        asserted in both directions so "it completed" cannot be misread as
        "the film was enough".
   ============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assembleMorning, pickItem } from "@/lib/loop";
import { mintDayStamp } from "@/lib/day-stamp";
import { completeDay } from "@/lib/gamification/completeDay";
import { completeModuleIfReady } from "@/lib/lms";
import { accrueFromModule } from "@/lib/certification-server";
import { loadStoryGate } from "@/lib/story";
import { trackComplete } from "@/lib/certification";
import type { IsoDate } from "@/lib/gamification/streak";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;

if (!URL || !KEY || !ANON) {
  console.error("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(1);
}
/* THIS SUITE WRITES. The guard is a refusal, not a default. */
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`\n  REFUSING to run against ${URL} — this suite writes. Local only.\n`);
  process.exit(1);
}

/* completeDay() builds its own service client from the environment, and
   .env.local holds PRODUCTION values. Overwritten (not defaulted) so local
   wins even if .env.local is loaded by something else in this process. */
process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;

/*
 * ---- MUX SIGNING, OR THE OPENER SHAPES TO NULL AND PROVES NOTHING --------
 *
 * shapeVideo() returns null when no playback token can be minted, so without
 * Mux signing keys `track.film` is null, `assembleMorning` falls through to a
 * two-slot morning, and THIS SUITE WOULD BE ASSERTING THAT AN ENTRY MORNING
 * DOES NOT HAPPEN. loop-acceptance.ts documents the same trap.
 *
 * It is worth recording that this was not caught by reading the code: the
 * suite FAILED on first run — "the morning is a track_entry morning (got
 * two_slot)" — because the positive half is asserted by default. A suite that
 * only checked "no opener leaks to a mid-track advisor" would have passed
 * here, with every film null, and proven nothing at all.
 *
 * Keys are borrowed from .env.local only when the environment lacks them.
 * Nothing leaves the machine — minting a token is a local HMAC. Missing keys
 * are FATAL and loud, because "no film" must read as a broken harness rather
 * than as a finding.
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

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const TAG = `oc-${randomUUID().slice(0, 8)}`;
const PASSWORD = `${TAG}-scratch-pw`;
const madeUsers: string[] = [];
let orgId = "";
let rooftopId = "";
let TODAY = "" as IsoDate;

let passed = 0;
let failed = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing ${what}`);
  return v;
}

/* ---- the cast ------------------------------------------------------------ */

async function makeAdvisor(label: string): Promise<string> {
  const email = `${TAG}-${label}@example.test`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);
  await sb.from("app_user").upsert({ id, full_name: `${TAG} ${label}` });
  const { error: mErr } = await sb
    .from("membership")
    .insert({ user_id: id, rooftop_id: rooftopId, role: "advisor", active: true });
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

/* ---- the catalogue, read by id and never by name where a name would do --- */

async function certByName(name: string) {
  const { data } = await sb
    .from("certification")
    .select("id, slug, name, sort, entry_film_content_id")
    .eq("name", name)
    .eq("is_core", true)
    .maybeSingle();
  return need(data, `certification ${name}`) as any;
}

/** Every module of a core track, in the order the loop walks them. */
async function modulesOf(certId: string) {
  const { data: cc } = await sb
    .from("certification_course")
    .select("course_id, sort")
    .eq("certification_id", certId);
  const courseIds = ((cc ?? []) as any[]).sort((a, b) => a.sort - b.sort).map((x) => x.course_id);
  const out: any[] = [];
  for (const cid of courseIds) {
    const { data: ms } = await sb
      .from("module")
      .select("id, name, sort_order")
      .eq("course_id", cid)
      .order("sort_order", { ascending: true });
    out.push(...((ms ?? []) as any[]));
  }
  return out;
}

async function itemsOf(moduleIds: string[]) {
  if (!moduleIds.length) return [];
  const { data } = await sb
    .from("content")
    .select("id, title, type, module_id, module_order, mux_playback_id")
    .in("module_id", moduleIds)
    .eq("status", "published")
    .is("retired_at", null);
  return (data ?? []) as any[];
}

/* ---- finishing things, the way the product finishes them ---------------- */

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
  if (error) throw new Error(`content_progress: ${error.message}`);
}

/**
 * The watch gate the server would have written. completeDay reads the GATE
 * RECORD, not a percentage the browser claims, so a fixture that wants a film
 * to count has to leave the same evidence a real watch does.
 */
async function meetGate(userId: string, contentId: string) {
  const { error } = await sb.from("watch_gate").upsert(
    {
      user_id: userId,
      rooftop_id: rooftopId,
      content_id: contentId,
      store_date: TODAY,
      watched_pct: 100,
      watch_error: false,
    },
    { onConflict: "user_id,content_id,store_date" }
  );
  if (error) throw new Error(`watch_gate: ${error.message}`);
}

/** A passing attempt, for a module that carries a published quiz. */
async function passQuiz(userId: string, moduleId: string) {
  const { error } = await sb.from("quiz_attempt").insert({
    user_id: userId,
    module_id: moduleId,
    score_pct: 100,
    passed: true,
  });
  if (error) throw new Error(`quiz_attempt: ${error.message}`);
}

function stampFor(
  userId: string,
  morning: Awaited<ReturnType<typeof assembleMorning>>
): string {
  return mintDayStamp({
    u: userId,
    d: TODAY,
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

/**
 * Finish every item on every track that sorts BEFORE this one, so the loop's
 * sequential walk arrives where the scenario needs it. pickItem returns the
 * first track with an unfinished item, so this is the only honest way to put
 * an advisor on track N — short of writing the answer, which would test
 * nothing.
 */
async function consumeTracksBefore(userId: string, sort: number) {
  const { data: certs } = await sb
    .from("certification")
    .select("id, name, sort")
    .eq("is_core", true)
    .lt("sort", sort)
    .order("sort", { ascending: true });
  let n = 0;
  for (const c of (certs ?? []) as any[]) {
    const mods = await modulesOf(c.id);
    const items = await itemsOf(mods.map((m) => m.id));
    for (const it of items) {
      await consume(userId, it.id);
      n++;
    }
    /* The entry row too: without it the loop would treat each of these as a
       track the advisor is ENTERING, which is a different morning. */
    await sb
      .from("advisor_track_entry")
      .upsert(
        { user_id: userId, certification_id: c.id, rooftop_id: rooftopId },
        { onConflict: "user_id,certification_id", ignoreDuplicates: true }
      );
  }
  return n;
}

/* ========================================================================== */

async function setup() {
  const { data: o } = await sb.from("org").insert({ name: `${TAG} Org` }).select("id").single();
  orgId = need(o, "org").id;
  const { data: r } = await sb
    .from("rooftop")
    .insert({ org_id: orgId, name: `${TAG} Store`, timezone: "America/Chicago" })
    .select("id")
    .single();
  rooftopId = need(r, "rooftop").id;

  /* The entitlement the whole library sits behind — advisor_video resolves to
     product 'advisor_base'. Without it the fixture advisor can read nothing. */
  await sb.from("rooftop_product").insert({ rooftop_id: rooftopId, product: "advisor_base" });

  const { data: t } = await sb.rpc("rooftop_today", { _rooftop: rooftopId });
  TODAY = need(t, "rooftop_today") as IsoDate;
  console.log(`\n  rooftop ${rooftopId}   store today ${TODAY}`);
}

async function run() {
  await setup();

  /* ---- 0 · recompute over PostgREST as the SERVICE ROLE ------------------
     The migration ran the function as postgres, which proves nothing about
     the API path: Supabase runs pg_safeupdate for the API roles and a
     WHERE-less UPDATE inside the function throws for every PostgREST caller
     while psql-as-postgres is perfectly happy. */
  {
    const { error } = await sb.rpc("recompute_certification_content");
    ok(
      `recompute_certification_content() over PostgREST as service role${
        error ? ` — ${error.message}` : ""
      }`,
      !error
    );
  }

  const mpi = await certByName("Setting up the MPI");
  const nameTag = await certByName("Name Tag");
  const walk = await certByName("Walk Around");

  /* ---------------------------------------------------------------------- */
  console.log(`\n  A · the entry morning, as a fresh advisor on Setting up the MPI`);
  /* ---------------------------------------------------------------------- */
  {
    const advA = await makeAdvisor("entry");
    const asA = await signedInAs(advA);
    const consumed = await consumeTracksBefore(advA, mpi.sort);
    console.log(`        (setup) ${consumed} items on the tracks before it, consumed`);

    /* The precondition stated rather than assumed. */
    const { data: entryRow } = await sb
      .from("advisor_track_entry")
      .select("certification_id")
      .eq("user_id", advA)
      .eq("certification_id", mpi.id)
      .maybeSingle();
    ok("no advisor_track_entry row for Setting up the MPI", !entryRow);

    const m = await assembleMorning(asA as never, sb as never, advA, rooftopId, TODAY);

    ok(
      `the morning is a track_entry morning (got "${m.kind}")`,
      m.kind === "track_entry"
    );
    ok(
      `its film is the track's own opener (got "${m.track?.film?.title ?? "none"}")`,
      m.track?.film?.title === "Setting up the MPI — Opener"
    );
    ok(
      "the film is the row the migration pointed at",
      m.track?.film?.contentId === mpi.entry_film_content_id
    );
    ok("the pitch slot is withheld — the film is the day", m.pitch === null);
    ok("the item slot is withheld — the film is the day", m.item === null);
    ok(`the track is named (got "${m.track?.name}")`, m.track?.name === "Setting up the MPI");

    /* ---- and the day completes on that film alone ---------------------- */
    if (m.mindset) await meetGate(advA, m.mindset.contentId);
    if (m.track?.film) await meetGate(advA, m.track.film.contentId);

    const res = await completeDay(advA, rooftopId, { dayStamp: stampFor(advA, m) });
    ok(
      `the day completes on the opener alone (streak ${res.streak})`,
      res.streak >= 1
    );

    const { data: after } = await sb
      .from("advisor_track_entry")
      .select("certification_id, film_content_id, entered_on")
      .eq("user_id", advA)
      .eq("certification_id", mpi.id)
      .maybeSingle();
    ok("completing it wrote the advisor_track_entry row", Boolean(after));
    ok(
      "the entry row records the opener as the film that opened it",
      (after as any)?.film_content_id === mpi.entry_film_content_id
    );

    /* The opener is served ONCE. The primary key is the guard, but the
       behaviour is what matters: tomorrow is an ordinary morning. */
    const next = await pickItem(asA as never, sb as never, advA, TODAY);
    ok(
      "the next morning is no longer an entry morning",
      next.track?.entering === false && next.track?.film === null
    );
  }

  /* ---------------------------------------------------------------------- */
  console.log(`\n  B · an advisor already on the track gets no opener`);
  /* ---------------------------------------------------------------------- */
  {
    const advB = await makeAdvisor("midtrack");
    const asB = await signedInAs(advB);
    await consumeTracksBefore(advB, mpi.sort);
    /* Already entered — the state an advisor is in on every morning but one. */
    await sb.from("advisor_track_entry").upsert(
      { user_id: advB, certification_id: mpi.id, rooftop_id: rooftopId },
      { onConflict: "user_id,certification_id", ignoreDuplicates: true }
    );

    const m = await assembleMorning(asB as never, sb as never, advB, rooftopId, TODAY);
    ok(`not a track_entry morning (got "${m.kind}")`, m.kind !== "track_entry");
    ok("no opener is served", m.track?.film === null);
    ok("the track does not report entering", m.track?.entering === false);
    ok(
      `the item slot serves the track's first lesson (got "${m.item?.title ?? "none"}")`,
      m.item?.title === "Get the Hell Out of Here, Part 1"
    );
    ok("the item is a film", m.item?.format === "video");
    ok("the mindset slot is served", m.mindset !== null);
    /*
     * THE THIRD SLOT, SCOPED HONESTLY. `normal` needs a servable pitch, which
     * needs a DMS book: pickPitch derives the family from advisor_op_metric.
     * This fixture advisor has no book, so the morning is correctly `two_slot`
     * — mindset + item. That is the loop behaving as designed, not a failure,
     * and calling it "three slots" here would be the confident wrong answer
     * this project keeps finding. The pitch slot is proven by
     * npm run accept:loop, which seeds a book for exactly that purpose.
     */
    ok(
      `two slots without a DMS book, three with one (got "${m.kind}", pitch ${
        m.pitch ? "served" : "none"
      })`,
      m.kind === "two_slot" || m.kind === "normal"
    );
  }

  /* ---------------------------------------------------------------------- */
  console.log(`\n  C · Name Tag's closer is the last item, and the track then completes`);
  /* ---------------------------------------------------------------------- */
  {
    const advC = await makeAdvisor("closer");
    const asC = await signedInAs(advC);
    await consumeTracksBefore(advC, nameTag.sort);

    const mods = await modulesOf(nameTag.id);
    const closerName = "Name Tag — Closer";
    const closerMod = need(
      mods.find((m) => m.name === closerName),
      "the Name Tag closer module"
    );
    ok(
      `the closer is the last module of the track (sort ${closerMod.sort_order} of ${mods.length})`,
      mods[mods.length - 1].name === closerName
    );

    /* Everything EXCEPT the closer, so the closer is what the loop has left. */
    const lessonMods = mods.filter((m) => m.id !== closerMod.id);
    const lessonItems = await itemsOf(lessonMods.map((m) => m.id));
    for (const it of lessonItems) {
      await consume(advC, it.id);
      if (it.mux_playback_id) await meetGate(advC, it.id);
    }
    await sb.from("advisor_track_entry").upsert(
      { user_id: advC, certification_id: nameTag.id, rooftop_id: rooftopId },
      { onConflict: "user_id,certification_id", ignoreDuplicates: true }
    );
    console.log(`        (setup) ${lessonItems.length} Name Tag lesson items consumed`);

    const served = await pickItem(asC as never, sb as never, advC, TODAY);
    ok(
      `the loop serves the closer (got "${served.item?.title ?? "none"}")`,
      served.item?.title === closerName
    );
    ok(
      `in the closer module (got "${served.item?.moduleName ?? "none"}")`,
      served.item?.moduleName === closerName
    );
    ok("the closer is a film", served.item?.format === "video");
    ok(
      `it is the LAST item of the track (position ${served.item?.position} of ${served.item?.total})`,
      served.item?.position === served.item?.total
    );

    /* ---- finish it, then ask the real credential engine --------------- */
    if (served.item) {
      await consume(advC, served.item.contentId);
      await meetGate(advC, served.item.contentId);
    }
    /* The quizzes the track really carries, passed; and every module's
       completion row written by the LMS's own writer, not by this file. */
    for (const m of mods) {
      const { data: q } = await sb
        .from("quiz_question")
        .select("id")
        .eq("module_id", m.id)
        .eq("status", "published")
        .limit(1);
      if ((q ?? []).length) await passQuiz(advC, m.id);
    }
    const allItems = await itemsOf(mods.map((m) => m.id));
    for (const it of allItems) {
      await completeModuleIfReady(sb as never, advC, it.id, rooftopId, 0);
    }

    const storyGate = await loadStoryGate(sb as never, advC);
    console.log(
      `        story_required is ${storyGate.storyRequired} (read from game_settings, not assumed)`
    );

    /* craftModuleProgress is private, so the modules leg is read the way the
       page reads it: gating modules, completion from module_completion. */
    const { data: gating } = await sb
      .from("module_completion")
      .select("module_id")
      .eq("user_id", advC);
    const done = new Set(((gating ?? []) as any[]).map((g) => g.module_id));
    const gatingMods: { contentComplete: boolean; quizPassed: boolean | null }[] = [];
    for (const m of mods) {
      const items = allItems.filter((i) => i.module_id === m.id);
      if (!items.some((i) => i.type === "advisor_video")) continue; // a cue never gates
      const { data: q } = await sb
        .from("quiz_question")
        .select("id")
        .eq("module_id", m.id)
        .eq("status", "published")
        .limit(1);
      gatingMods.push({
        contentComplete: done.has(m.id),
        quizPassed: (q ?? []).length ? true : null,
      });
    }
    const complete = trackComplete({
      modules: gatingMods as never,
      storyRequired: storyGate.storyRequired,
      storySubmitted: storyGate.toldFor.has(nameTag.id),
    });
    ok(
      `trackComplete() reads ${complete} after the closer — story_required ${
        storyGate.storyRequired
      }, story ${storyGate.toldFor.has(nameTag.id) ? "told" : "not told"}`,
      storyGate.storyRequired ? complete === false : complete === true
    );
    if (storyGate.storyRequired) {
      console.log(
        `        the modules leg is met and the STORY leg is not — which is the\n` +
          `        documented gate (Ryan's 30 September ruling), not a failure. The\n` +
          `        closer finishes the modules; the Good News Story finishes the track.`
      );
      /* So prove the other half: with the story told, the track completes. */
      const { error: sErr } = await sb.from("advisor_story").insert({
        user_id: advC,
        certification_id: nameTag.id,
        rooftop_id: rooftopId,
        body: `${TAG} acceptance story`,
      });
      if (!sErr) {
        const gate2 = await loadStoryGate(sb as never, advC);
        const complete2 = trackComplete({
          modules: gatingMods as never,
          storyRequired: gate2.storyRequired,
          storySubmitted: gate2.toldFor.has(nameTag.id),
        });
        ok("with the Good News Story told, trackComplete() reads true", complete2 === true);
        /*
         * AND THE REAL ENGINE AGREES. accrueFromModule() is what the LMS calls
         * when a module completes: it walks accrueCraft -> trackComplete ->
         * grantCertification. Asserting through it rather than through this
         * file's reconstruction is the point — a second accounting that agreed
         * with itself would prove nothing.
         */
        const accrual = await accrueFromModule(sb as never, advC, rooftopId, closerMod.id);
        const { data: heldRow } = await sb
          .from("advisor_certification")
          .select("certification_id")
          .eq("user_id", advC)
          .eq("certification_id", nameTag.id)
          .maybeSingle();
        ok(
          `the real engine grants Name Tag through accrueFromModule (earned: [${accrual.earned.join(
            ", "
          )}])`,
          Boolean(heldRow)
        );
      } else {
        console.log(`        (advisor_story insert refused: ${sErr.message})`);
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  console.log(`\n  D · Walk Around module 4 serves Part 2 as a gated film, not a cue`);
  /* ---------------------------------------------------------------------- */
  {
    const advD = await makeAdvisor("walk");
    const asD = await signedInAs(advD);

    const mods = await modulesOf(walk.id);
    const m4 = need(
      mods.find((m) => m.name === "4. Raising a Problem Well"),
      "Walk Around module 4"
    );
    /* Modules 1-3 finished; module 4 untouched. */
    const before = mods.filter((m) => m.sort_order < m4.sort_order);
    const beforeItems = await itemsOf(before.map((m) => m.id));
    for (const it of beforeItems) {
      await consume(advD, it.id);
      if (it.mux_playback_id) await meetGate(advD, it.id);
    }
    await sb.from("advisor_track_entry").upsert(
      { user_id: advD, certification_id: walk.id, rooftop_id: rooftopId },
      { onConflict: "user_id,certification_id", ignoreDuplicates: true }
    );
    console.log(`        (setup) ${beforeItems.length} items on modules 1-3 consumed`);

    const served = await pickItem(asD as never, sb as never, advD, TODAY);
    ok(
      `the loop serves 30 Second Part 2 (got "${served.item?.title ?? "none"}")`,
      served.item?.title === "30 Second Walk-Around, Part 2, Four Goals, Two Words"
    );
    ok(
      `in module 4 (got "${served.item?.moduleName ?? "none"}")`,
      served.item?.moduleName === "4. Raising a Problem Well"
    );
    ok("served as a FILM, not a cue", served.item?.format === "video");

    /* GATED, by the database's own definition rather than this file's. */
    const { data: gt } = await sb.rpc("gating_content_types");
    const gatingTypes = (gt ?? []) as string[];
    const { data: filmRow } = await sb
      .from("content")
      .select("type")
      .eq("id", served.item!.contentId)
      .maybeSingle();
    ok(
      `its type is in gating_content_types() (${(filmRow as any)?.type} in [${gatingTypes.join(
        ", "
      )}])`,
      gatingTypes.includes((filmRow as any)?.type)
    );

    /* ---- and the module completes through the WATCH GATE, on the film
            alone, while the cues stay unwatched — 0143's rule, from the
            advisor's own view of it. */
    const m4items = await itemsOf([m4.id]);
    const cues = m4items.filter((i) => i.type === "cue");
    await consume(advD, served.item!.contentId);
    await meetGate(advD, served.item!.contentId);

    const { data: prog } = await asD
      .from("my_module_progress")
      .select("items_done, total_items, completed_items")
      .eq("module_id", m4.id)
      .maybeSingle();
    ok(
      `items_done is true on the film alone (${(prog as any)?.completed_items} of ${
        (prog as any)?.total_items
      } items done, ${cues.length} cues unwatched)`,
      (prog as any)?.items_done === true
    );
    ok(
      "and the module is NOT fully consumed — a cue never gates",
      Number((prog as any)?.completed_items) < Number((prog as any)?.total_items)
    );

    /*
     * THE WATCH GATE IS THE ITEMS LEG, NOT THE WHOLE MODULE — and the
     * distinction is the LMS's, not this file's. Walk Around module 4 carries
     * published quiz questions (0145), so moduleRequirementsMet() correctly
     * withholds the completion row until that quiz is passed. Asserted in both
     * directions so "it completed" cannot be read as "the film was enough".
     */
    const notYet = await completeModuleIfReady(
      sb as never,
      advD,
      served.item!.contentId,
      rooftopId,
      0
    );
    const { count: qCount } = await sb
      .from("quiz_question")
      .select("id", { count: "exact", head: true })
      .eq("module_id", m4.id)
      .eq("status", "published");
    ok(
      `the film alone does NOT complete the module — its ${qCount} published questions still gate it`,
      notYet === null && Number(qCount) > 0
    );

    await passQuiz(advD, m4.id);
    const wrote = await completeModuleIfReady(
      sb as never,
      advD,
      served.item!.contentId,
      rooftopId,
      0
    );
    ok(
      "with the quiz passed, the LMS writes the module_completion row",
      wrote?.moduleId === m4.id
    );

    /* Walk Around still cannot be COMPLETED, because module 7 has no film and
       therefore no gating item. Stated here so the limit is measured rather
       than discovered later. */
    const m7 = need(mods.find((m) => m.name === "7. The Handback"), "module 7");
    const m7items = await itemsOf([m7.id]);
    ok(
      `module 7 still holds no film, so it can never gate-complete (${m7items.length} cues, 0 films)`,
      m7items.every((i) => i.type !== "advisor_video")
    );
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
}

/* ---- cleanup: the fixture leaves nothing behind ------------------------- */
async function cleanup() {
  for (const u of madeUsers) {
    for (const t of [
      "advisor_credential",
      "advisor_certification",
      "advisor_story",
      "advisor_track_entry",
      "advisor_pool_seen",
      "advisor_focus_family",
      "quiz_attempt",
      "module_completion",
      "content_progress",
      "watch_gate",
      "sand_dollar_entry",
      "paddle_out_entry",
      "user_badge",
      "swell",
      "daily_completion",
      "membership",
    ]) {
      await sb.from(t).delete().eq("user_id", u);
    }
    await sb.from("app_user").delete().eq("id", u);
    await sb.auth.admin.deleteUser(u);
  }
  if (rooftopId) {
    await sb.from("rooftop_product").delete().eq("rooftop_id", rooftopId);
    await sb.from("rooftop").delete().eq("id", rooftopId);
  }
  if (orgId) await sb.from("org").delete().eq("id", orgId);
}

run()
  .catch((e) => {
    console.error(`\n  threw: ${e?.message ?? e}\n`);
    failed++;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error(`  cleanup: ${e?.message ?? e}`));
    process.exit(failed === 0 ? 0 : 1);
  });
