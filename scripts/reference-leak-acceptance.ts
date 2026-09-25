/**
 * ===========================================================================
 * REFERENCE FILMS MUST NEVER REACH A MORNING
 * ===========================================================================
 *
 * The mileage shelf is a lookup chart. There is exactly one failure that
 * matters: a reference film appearing in slot 1, 2 or 3. Everything else about
 * the shelf is cosmetic by comparison — a wrong duration is a blemish, a
 * reference film in the pitch slot is the product lying about what an advisor
 * should sell today.
 *
 * So this suite does two things, and the second is the one that makes it worth
 * running:
 *
 *   1  Seed a reference film in the MOST DANGEROUS shape available and run the
 *      real `assembleMorning` — the same function `/today` calls. Assert the
 *      film is in none of the three slots.
 *
 *   2  INVERT THE FIXTURE and assert the suite FAILS. A test that cannot fail
 *      is not a check, and this project has shipped three of those. Each
 *      assertion below is re-run against a deliberately broken world and has to
 *      come back red.
 *
 * ---------------------------------------------------------------------------
 * WHY `service_family` IS SET ON THE FIXTURE
 * ---------------------------------------------------------------------------
 *
 * The obvious fixture — a reference film with no family and no op code — proves
 * almost nothing, because it would be unreachable even without 0128. The real
 * hazard found in `service_family_content` is its first arm:
 *
 *     select c.service_family as family, ..., true as coachable
 *       from content c where c.service_family is not null
 *
 * `true as coachable`, unconditionally, with the comment "A DIRECTLY TAGGED ROW
 * IS COACHABLE BY DEFINITION." So the fixture tags the reference film with the
 * EXACT family the advisor is being coached on. Before 0128 that film arrives in
 * slot 2 announcing itself as coachable. That is the leak this suite exists for,
 * and case 2b below is the one that would have caught it.
 *
 * Run against LOCAL Supabase only. The guard below refuses anything else.
 *
 *   npx supabase start && npx supabase db reset --local
 *   export SB_URL=http://127.0.0.1:55321 \
 *          SB_KEY=<local service role> SB_ANON_KEY=<local anon>
 *   npm run accept:reference
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assembleMorning } from "@/lib/loop";
import { loadMileageFilms, loadMileageRungs } from "@/lib/mileage";
import type { IsoDate } from "@/lib/gamification/streak";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;

if (!URL || !KEY || !ANON) {
  console.error("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(2);
}

/*
 * THE LOCALHOST GUARD IS NOT A FORMALITY. This suite inserts films, flips
 * placements and deliberately breaks its own world to prove the assertions can
 * fail. Pointed at production it would publish reference content into a
 * morning — the exact thing it exists to prevent.
 */
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) {
  console.error(`\n  REFUSING — SB_URL is not localhost: ${URL}\n`);
  process.exit(2);
}

/* Mux signing keys, for shapeVideo. Read from .env.local, never printed. */
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 0 || line.trim().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k.startsWith("MUX_") && !process.env[k]) process.env[k] = v;
  }
} catch {
  /* absent is fine — signing only matters if a slot actually returns a film */
}

process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const TAG = `ref-${randomUUID().slice(0, 8)}`;
const PASSWORD = "Fixture-passw0rd!";
const FAM = `${TAG} Focus Family`;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`    PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`    FAIL  ${label}${detail ? `  — ${detail}` : ""}`);
  }
  return cond;
}
const section = (t: string) => console.log(`\n${t}`);

let orgId = "";
let rooftopId = "";
let periodId = "";
let TODAY = "" as IsoDate;
const madeUsers: string[] = [];
const madeContent: string[] = [];
const madeCodes: string[] = [];

function need<T>(v: T | null, what: string): T {
  if (!v) throw new Error(`could not create ${what}`);
  return v;
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

  await sb.from("rooftop_product").insert({ rooftop_id: rooftopId, product: "advisor_base" });

  const { data: storeToday } = await sb.rpc("rooftop_today", { _rooftop: rooftopId });
  TODAY = String(storeToday) as IsoDate;

  const { data: p } = await sb
    .from("perf_period")
    .insert({
      rooftop_id: rooftopId,
      starts_on: `${TODAY.slice(0, 7)}-01`,
      ends_on: `${TODAY.slice(0, 7)}-28`,
    })
    .select("id")
    .single();
  periodId = need(p, "period").id;

  /* A coachable op code in the advisor's family, so slot 2 has somewhere to go.
     content.op_code is FK'd to op_code_catalog, so the catalog row comes first. */
  const code = `${TAG.slice(0, 8)}C1`.toUpperCase();
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
  return code;
}

async function makeUser(opCode: string) {
  const email = `${TAG}-adv-${randomUUID().slice(0, 6)}@example.test`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);
  await sb.from("app_user").upsert({ id, full_name: `${TAG} advisor` });
  await sb.from("membership").insert({
    user_id: id,
    rooftop_id: rooftopId,
    role: "advisor",
    active: true,
    op_code_id: opCode,
  });
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
  madeContent.push(data.id as string);
  return data.id as string;
}

/**
 * Give the advisor a book with a real, large gap in FAM.
 *
 * `advisor_op_metric.op_code` is a SERVICE LINE code, not an op_code_catalog
 * code — a different namespace, and the family comes off `resolved_family`.
 * Mirrors scripts/loop-acceptance.ts rather than inventing a second seeding
 * story, because the first attempt here produced a two-slot morning and made
 * the whole suite pass vacuously.
 */
const madeLines: string[] = [];

async function seedMetric(advisorOpId: string, ros: number, labor: number, totalRos: number) {
  await sb.from("advisor_period_total_src").insert({
    period_id: periodId,
    rooftop_id: rooftopId,
    advisor_op_id: advisorOpId,
    total_ros: totalRos,
    total_labor_sales: labor,
    total_ro_lines: totalRos,
  });
  const line = `${TAG}-fam`.slice(0, 40);
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
    ros,
    labor_sales: labor,
    resolved_family: FAM,
  });
  if (error) throw new Error(`metric: ${error.message}`);
}

/** The advisor is far below a peer at the same store — an unambiguous gap. */
async function seedBook(advisorOpId: string) {
  await seedMetric(advisorOpId, 20, 4000, 200);
  await seedMetric(`${advisorOpId}-peer`, 170, 34000, 200);
}

/** Every content id the morning would put in front of the advisor. */
function idsInMorning(m: Awaited<ReturnType<typeof assembleMorning>>): string[] {
  const out: string[] = [];
  if (m.mindset?.contentId) out.push(String(m.mindset.contentId));
  if (m.pitch?.contentId) out.push(String(m.pitch.contentId));
  if (m.item?.contentId) out.push(String(m.item.contentId));
  /* The track-entry film is a LifestyleVideoData nested under `film`, not a
     contentId on the entry itself — a reference film wired as an entry gate
     would arrive here. */
  if (m.track?.film?.contentId) out.push(String(m.track.film.contentId));
  return out;
}

async function main() {
  console.log(`\n  REFERENCE LEAK ACCEPTANCE   tag=${TAG}   ${URL}`);

  const code = await setup();
  const advisorOpId = `${TAG.slice(0, 10)}-op`;
  const userId = await makeUser(advisorOpId);
  await seedBook(advisorOpId);
  const asAdvisor = await signedInAs(userId);

  /* A real, servable pitch film in the family, so slot 2 is not empty for the
     wrong reason. If slot 2 were empty anyway, "no reference film in slot 2"
     would pass vacuously. */
  const goodPitch = await makeFilm({
    title: `${TAG} legitimate pitch film`,
    collection: "Pitches by Op Code",
    placement: "daily_pitch",
    op_code: code,
    stage: "On the Drive",
  });

  /* A mindset film, so slot 1 is populated for the same reason. */
  await makeFilm({
    title: `${TAG} legitimate mindset film`,
    collection: "Mindset",
    placement: "daily_lifestyle",
  });

  section("  the fixture: reference films in their most dangerous shapes");

  /* 2a — tagged with the family directly. The `true as coachable` arm. */
  const refTagged = await makeFilm({
    title: `${TAG} 25,000 Mile Dealer Upsell Menu`,
    collection: "Menu",
    placement: "reference",
    mileage_rung: 25000,
    service_family: FAM,
  });

  /* 2b — carrying a COACHABLE op code in the family. The op_code arm. */
  const refByCode = await makeFilm({
    title: `${TAG} 30,000 Mile Dealer Upsell Menu`,
    collection: "Menu",
    placement: "reference",
    mileage_rung: 30000,
    op_code: code,
    stage: "On the Drive",
  });

  /* 2c — the shape most likely to be created by accident: reference placement
     but the Mindset collection, which is what slot 1 filters on. */
  const refMindsetish = await makeFilm({
    title: `${TAG} 35,000 Mile Dealer Upsell Menu`,
    collection: "Mindset",
    placement: "reference",
    mileage_rung: 35000,
  });

  const refs = { refTagged, refByCode, refMindsetish };
  console.log(`    seeded 3 reference films; 1 legitimate pitch film (${goodPitch.slice(0, 8)})`);

  /* ---- the assertions, as a function so they can be re-run inverted ------- */
  async function check(label: string) {
    const morning = await assembleMorning(asAdvisor, sb, userId, rooftopId, TODAY);
    const ids = idsInMorning(morning);

    const notEmpty = ok(
      `${label}: the morning is not vacuously empty (pitch slot filled)`,
      morning.pitch !== null,
      `kind=${morning.kind} pitch=${morning.pitch?.contentId ?? "null"}`
    );

    const results: boolean[] = [];
    for (const [name, id] of Object.entries(refs)) {
      results.push(
        ok(
          `${label}: ${name} is in NO slot`,
          !ids.includes(id),
          `slots=[${ids.map((x) => x.slice(0, 8)).join(", ")}]`
        )
      );
    }

    /* And the view directly, because that is where the hazard lives. */
    const { data: sfc } = await sb
      .from("service_family_content")
      .select("content_id, via, coachable")
      .in("content_id", Object.values(refs));
    results.push(
      ok(
        `${label}: no reference film resolves to a service family`,
        (sfc ?? []).length === 0,
        `rows=${JSON.stringify(sfc ?? [])}`
      )
    );

    return { allHeld: results.every(Boolean), notEmpty };
  }

  /* ---------------------------------------------------------------------------
     THE OTHER HALF. Excluded from the loop is only half the requirement — the
     same films have to APPEAR on the shelf. A gate that achieved exclusion by
     making reference rows unreadable everywhere would pass every assertion below
     and ship an empty catalog, confidently.
  --------------------------------------------------------------------------- */
  section("  0. the shelf can see them");
  {
    const rungs = await loadMileageRungs(asAdvisor);
    const byMiles = new Map(rungs.map((r) => [r.miles, r]));
    ok(
      "all three rungs appear on the shelf",
      [25000, 30000, 35000].every((m) => byMiles.has(m)),
      `rungs=${JSON.stringify(rungs.map((r) => r.miles))}`
    );
    ok(
      "the rung label is formatted once, in lib/mileage",
      byMiles.get(25000)?.label === "25,000",
      `label=${byMiles.get(25000)?.label}`
    );
    ok(
      "a rung reports the films it has, not a progress fraction",
      byMiles.get(25000)?.filmCount === 1,
      `filmCount=${byMiles.get(25000)?.filmCount}`
    );
    const films = await loadMileageFilms(asAdvisor, 25000);
    ok(
      "the rung's film is playable and carries renditions",
      films.length === 1 && films[0].contentId === refTagged && Boolean(films[0].renditions),
      `films=${JSON.stringify(films.map((f) => f.contentId.slice(0, 8)))}`
    );
    const all = (
      await Promise.all([25000, 30000, 35000].map((m) => loadMileageFilms(asAdvisor, m)))
    ).flat();
    ok(
      "a loop-placed film never appears on the shelf",
      !all.some((f) => f.contentId === goodPitch),
      "the shelf filters placement positively, as an allow-list"
    );
  }

  section("  1. the gate holds");
  const first = await check("held");

  /* ---------------------------------------------------------------------------
     2. THE SAME ASSERTIONS, AGAINST A BROKEN WORLD.
     ---------------------------------------------------------------------------
     If flipping the placement off 'reference' does NOT break them, the
     assertions were never reading the placement and the suite above is
     decoration. So the inversion has to come back red, and a green inversion is
     itself a failure — reported as such below rather than passed over.
  --------------------------------------------------------------------------- */
  section("  2. inverted — the same checks must now FAIL");

  /*
   * The inverted run's own results are REPORTED but not counted: a failure
   * there is the expected outcome, and adding it to this suite's failure tally
   * would make a working gate look broken. What IS counted is the assertion in
   * section 3 — that the inversion leaked at all.
   */
  const note = (label: string, held: boolean) =>
    console.log(`    (inverted) ${held ? "still passes" : "fails as expected"}  ${label}`);

  /*
   * RETIRE THE LEGITIMATE PITCH FILM FOR THE INVERTED RUN.
   *
   * The first inverted run reported "still passes — a de-referenced film stays
   * out of every slot", and that was not the gate working: the deck is ordered
   * op_code, then stage, then content_id, and the legitimate film simply sorted
   * first, so slot 2 served it and the reference film sat second. The slot
   * assertion was therefore unproven — it had never been given a world where a
   * reference film was the NEXT thing the deck would serve.
   *
   * So the competition is removed. If the placement gate is what keeps
   * reference films out of slot 2, this run must now put one there.
   */
  await sb.from("content").update({ retired_at: new Date().toISOString() }).eq("id", goodPitch);

  await sb.from("content").update({ placement: "daily_pitch" }).eq("id", refTagged);
  await sb.from("content").update({ placement: "daily_pitch" }).eq("id", refByCode);
  await sb.from("content").update({ placement: "daily_lifestyle" }).eq("id", refMindsetish);

  const morningBroken = await assembleMorning(asAdvisor, sb, userId, rooftopId, TODAY);
  const brokenIds = idsInMorning(morningBroken);
  const { data: sfcBroken } = await sb
    .from("service_family_content")
    .select("content_id, via, coachable")
    .in("content_id", Object.values(refs));

  const leakedToView = (sfcBroken ?? []).length > 0;
  const leakedToSlot = Object.values(refs).some((id) => brokenIds.includes(id));

  note("a de-referenced film resolves to a family", !leakedToView);
  note("a de-referenced film stays out of every slot", !leakedToSlot);

  /* Restore, so the fixture is not left in the broken state. */
  await sb.from("content").update({ retired_at: null }).eq("id", goodPitch);
  await sb.from("content").update({ placement: "reference" }).eq("id", refTagged);
  await sb.from("content").update({ placement: "reference" }).eq("id", refByCode);
  await sb.from("content").update({ placement: "reference" }).eq("id", refMindsetish);

  section("  3. the inversion is the real check");
  ok(
    "flipping placement off 'reference' DOES leak — so the gate is load-bearing",
    leakedToView,
    leakedToView
      ? ""
      : "nothing leaked even with the placement removed — these films are " +
        "unreachable for some other reason and the placement proves nothing"
  );
  ok(
    "with the gate removed, a reference film DOES reach a slot",
    leakedToSlot,
    leakedToSlot
      ? ""
      : "even with placement flipped and the competing film retired, no reference " +
        "film reached a slot — so the slot assertion above is not proven non-vacuous"
  );
  ok(
    "the held run had a real pitch slot to compete with",
    first.notEmpty,
    "slot 2 was empty, so 'no reference film in slot 2' passed vacuously"
  );

  /* ---- cleanup ----------------------------------------------------------- */
  section("  cleanup");
  for (const id of madeContent) await sb.from("content").delete().eq("id", id);
  for (const id of madeUsers) await sb.auth.admin.deleteUser(id);
  for (const c of madeCodes) {
    await sb.from("op_code_family").delete().eq("code", c);
    await sb.from("op_code_catalog").delete().eq("code", c);
  }
  await sb.from("advisor_op_metric").delete().eq("period_id", periodId);
  for (const l of madeLines) await sb.from("service_line").delete().eq("op_code", l);
  await sb.from("advisor_period_total_src").delete().eq("period_id", periodId);
  await sb.from("perf_period").delete().eq("id", periodId);
  await sb.from("rooftop_product").delete().eq("rooftop_id", rooftopId);
  await sb.from("rooftop").delete().eq("id", rooftopId);
  await sb.from("org").delete().eq("id", orgId);
  console.log("    fixture removed");

  console.log(`\n  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\n  failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("\n  threw:", e?.message ?? e, "\n");
  process.exit(1);
});
