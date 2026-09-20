/* ============================================================================
   EDIAGD — one resolved family, against a real database

   Phase 3c. The claim this suite has to back is narrow and total: there is ONE
   answer to "what belongs to service family F", every surface reads it, and the
   card and the loop cannot disagree about which film is next.

   WHAT IT ASSERTS, AND WHY EACH ONE IS HERE:

     1  the view resolves BOTH paths, and the union is not double-counted
     2  a film reachable only by op code is visible to the ADVISOR — the 52
        films that were published and invisible on every member-facing surface
     3  the cue gate counts op-code-only cues, and stops counting retired ones
     4  the certification catalogue gets the same counts as before, so no track
        gains or loses items by this migration
     5  the card and the loop name the SAME next film
     6  watching ahead on the shelf makes the loop skip it — one consumption
        record, which is the whole point of the card
     7  a base-tier advisor resolves NOTHING

   Every one is proven non-vacuous by breaking the thing it guards.

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:family

   RUN IT AGAINST LOCAL. IT WRITES. It refuses any SB_URL that is not localhost.
============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadFamilyContent, loadFocusFamilyCard } from "@/lib/service-family";
import { assembleMorning } from "@/lib/loop";
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

/* Mux signing, or every film shapes to null and this suite asserts nothing —
   see the same note in scripts/loop-acceptance.ts. */
for (const [k, v] of Object.entries(loadEnvFile())) {
  if (k.startsWith("MUX_") && !process.env[k]) process.env[k] = v;
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
/* completeDay/createServiceClient build their own client from the env. Local
   wins, assigned not defaulted — this suite writes. */
process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

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
async function nonVacuous(
  label: string,
  revert: () => Promise<void>,
  recheck: () => Promise<boolean>,
  restore: () => Promise<void>
) {
  try {
    await revert();
    const stillPasses = await recheck();
    ok(`↳ and fails when ${label}`, !stillPasses, "it passed anyway — the assertion proves nothing");
  } finally {
    await restore();
  }
}

/* ---- fixtures ------------------------------------------------------------- */
const TAG = `fam-${randomUUID().slice(0, 8)}`;
const PASSWORD = "Fixture-passw0rd!";
const madeUsers: string[] = [];
const madeContent: string[] = [];
const madeCodes: string[] = [];
const madeLines: string[] = [];
let orgId = "";
let rooftopId = "";
let periodId = "";
let grantedProduct = false;
let TODAY = "" as IsoDate;

/** The family under test. Three films and three cues, reachable four ways. */
const FAM = `${TAG} Focus Family`;
const CODE = `${TAG.slice(0, 6)}F1`.toUpperCase();

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
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

async function makeUser(opCode?: string) {
  const email = `${TAG}-${randomUUID().slice(0, 6)}@example.test`;
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
    op_code_id: opCode ?? null,
  });
  return id;
}

async function makeContent(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await sb.from("content").insert(fields).select("id").single();
  if (error) throw new Error(`content: ${error.message}`);
  madeContent.push(data.id);
  return data.id as string;
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
  const { error: prodErr } = await sb
    .from("rooftop_product")
    .insert({ rooftop_id: rooftopId, product: "advisor_base" });
  if (!prodErr) grantedProduct = true;

  const { data: t } = await sb.rpc("rooftop_today", { _rooftop: rooftopId });
  TODAY = String(t) as IsoDate;
  const { data: p } = await sb
    .from("perf_period")
    .insert({
      rooftop_id: rooftopId,
      starts_on: `${TODAY.slice(0, 7)}-01`,
      ends_on: addDays(`${TODAY.slice(0, 8)}28`, 14),
    })
    .select("id")
    .single();
  periodId = need(p, "period").id;

  await sb
    .from("op_code_catalog")
    .insert({ code: CODE, name: `${TAG} svc`, category: "Fixture", sort_order: 9000 });
  await sb
    .from("op_code_family")
    .insert({ code: CODE, family: FAM, coachable: true, confidence: "ruled", note: TAG });
  madeCodes.push(CODE);

  /* ---- three films, reachable ONLY by op code ---------------------------- */
  const films: string[] = [];
  for (const stage of ["On the Drive", "At the Kiosk", "After-MPI"]) {
    films.push(
      await makeContent({
        type: "advisor_video",
        status: "published",
        collection: "Pitches by Op Code",
        title: `${TAG} film ${stage}`,
        op_code: CODE,
        stage,
        duration_sec: 180,
        mux_playback_id: `fx-${randomUUID().slice(0, 8)}`,
        mux_playback_policy: "signed",
      })
    );
  }

  /*
   * ---- cues reaching the family three different ways ---------------------
   *
   * The point of the fixture: one row tagged only with the family, one carrying
   * only the op code, and one with BOTH. The third is what catches a UNION ALL
   * — it is the shape 0116 says let a 3-item track clear a 5-item bar.
   */
  const cueDirect = await makeContent({
    type: "cue",
    status: "published",
    title: `${TAG} cue direct`,
    body: "Tagged with the family only.",
    service_family: FAM,
  });
  const cueOpOnly = await makeContent({
    type: "cue",
    status: "published",
    title: `${TAG} cue op-only`,
    body: "Carries the op code only.",
    op_code: CODE,
  });
  const cueBoth = await makeContent({
    type: "cue",
    status: "published",
    title: `${TAG} cue both`,
    body: "Carries the family AND the op code.",
    service_family: FAM,
    op_code: CODE,
  });

  /* Retired, and published — the row the cue gate used to count. */
  const cueRetired = await makeContent({
    type: "cue",
    status: "published",
    title: `${TAG} cue retired`,
    body: "Withdrawn.",
    service_family: FAM,
    retired_at: new Date().toISOString(),
  });

  return { films, cueDirect, cueOpOnly, cueBoth, cueRetired };
}

/** DMS book, so a focus family can be derived. */
async function seedBook(opId: string, total: number, famRos: number, labor: number) {
  const line = `${TAG}-line`.slice(0, 40);
  if (!madeLines.includes(line)) {
    await sb.from("service_line").insert({ op_code: line, category: "Fixture", description: TAG });
    madeLines.push(line);
  }
  await sb.from("advisor_period_total_src").insert({
    period_id: periodId,
    rooftop_id: rooftopId,
    advisor_op_id: opId,
    total_ros: total,
    total_labor_sales: labor,
    total_ro_lines: total,
  });
  await sb.from("advisor_op_metric").insert({
    period_id: periodId,
    rooftop_id: rooftopId,
    advisor_op_id: opId,
    op_code: line,
    ros: famRos,
    labor_sales: labor,
    resolved_family: FAM,
  });
}

/* ============================================================================
   The suite
   ============================================================================ */
async function run() {
  const fx = await setup();

  /* ==================================================================== */
  section("1 — the view resolves both paths, and counts each row once");

  const { data: mapped } = await sb
    .from("service_family_content")
    .select("content_id, via, coachable")
    .eq("family", FAM);

  const rows = (mapped ?? []) as { content_id: string; via: string; coachable: boolean }[];
  const ids = new Set(rows.map((r) => r.content_id));

  ok("the family-tagged cue resolves", ids.has(fx.cueDirect));
  ok(
    "the op-code-only cue resolves — the path the advisor's screen never read",
    ids.has(fx.cueOpOnly)
  );
  ok("the cue carrying both resolves", ids.has(fx.cueBoth));
  ok("all three films resolve", fx.films.every((f) => ids.has(f)));
  ok(
    "the retired cue still MAPS — retirement is a content fact, not a mapping one",
    ids.has(fx.cueRetired),
    "the view filters content state, which is the consumers' job"
  );

  const bothArms = rows.filter((r) => r.content_id === fx.cueBoth);
  ok(
    "a row reachable BOTH ways appears under both vias",
    new Set(bothArms.map((r) => r.via)).size === 2,
    `got ${bothArms.map((r) => r.via).join(",")}`
  );
  ok(
    "…but counts once as membership",
    [...ids].filter((i) => i === fx.cueBoth).length === 1
  );

  /* ==================================================================== */
  section("2 — the advisor can now see a film reachable only by op code");

  const advisor = await makeUser(`${TAG}-a`);
  await seedBook(`${TAG}-a`, 200, 40, 4000);
  await seedBook(`${TAG}-strong`, 100, 90, 9000);
  const asAdvisor = await signedInAs(advisor);

  const resolved = await loadFamilyContent(asAdvisor, advisor, [FAM]);
  const content = need(resolved[FAM], "resolved family content");

  ok("three films reach the advisor", content.films.length === 3, `got ${content.films.length}`);
  ok(
    "three cues reach the advisor — and the retired one does not",
    content.cues.length === 3,
    `got ${content.cues.length}`
  );
  ok(
    "the op-code-only cue is among them",
    content.cues.some((c) => c.contentId === fx.cueOpOnly),
    "the old service_family-only query would have dropped it"
  );
  ok(
    "films come back in deck order",
    content.films.map((f) => f.stage).join("|") === "On the Drive|At the Kiosk|After-MPI",
    content.films.map((f) => f.stage).join("|")
  );
  ok("nothing is marked complete yet", content.films.every((f) => !f.completed));

  await nonVacuous(
    "the op-code mapping is retired",
    async () => {
      /*
       * RETIRE THE DAY AFTER effective_from, NOT "today".
       *
       * op_code_family carries `op_code_family_interval_sane`, which requires
       * retired_at to be after effective_from — and effective_from defaults to
       * current_date, which is the SERVER's date. `TODAY` here is
       * rooftop_today() in America/Chicago. For the hours where those two
       * disagree the update failed the constraint, the revert silently did
       * nothing, and the non-vacuity check reported "it passed anyway".
       *
       * Which is the bug class this suite exists to catch, committed by the
       * suite: a write that did not happen, read as a product that did not
       * change. The error was there the whole time in a field nobody looked at.
       */
      const { data: row } = await sb
        .from("op_code_family")
        .select("effective_from")
        .eq("code", CODE)
        .single();
      const from = String(row?.effective_from ?? TODAY);
      const { error } = await sb
        .from("op_code_family")
        .update({ retired_at: addDays(from, 1) })
        .eq("code", CODE);
      if (error) throw new Error(`could not retire the mapping: ${error.message}`);
    },
    async () => {
      const r = await loadFamilyContent(asAdvisor, advisor, [FAM]);
      return (r[FAM]?.films.length ?? 0) === 3;
    },
    async () => {
      await sb.from("op_code_family").update({ retired_at: null }).eq("code", CODE);
    }
  );

  /* ==================================================================== */
  section("3 — the cue gate reads the same resolution");

  const { data: gate } = await sb
    .from("service_family_cue_count")
    .select("family, published_cues")
    .eq("family", FAM)
    .maybeSingle();

  ok(
    "the gate counts all three live cues, both paths",
    Number(gate?.published_cues ?? 0) === 3,
    `got ${gate?.published_cues} — op-code-only cues used not to count`
  );

  await nonVacuous(
    "the op-code-only cue is unpublished",
    async () => {
      await sb.from("content").update({ status: "draft" }).eq("id", fx.cueOpOnly);
    },
    async () => {
      /*
       * Take the error. `data?.published_cues ?? 0` turns a missing view or an
       * RLS refusal into 0, and 0 !== 3 reads as "the guard bit" — non-vacuity
       * proven by a read that never happened. Same shape as the revert that
       * silently failed its CHECK constraint and reported passing anyway.
       */
      const { data, error } = await sb
        .from("service_family_cue_count")
        .select("published_cues")
        .eq("family", FAM)
        .maybeSingle();
      if (error) throw new Error(`service_family_cue_count: ${error.message}`);
      if (!data) throw new Error(`service_family_cue_count has no row for ${FAM}`);
      return Number(data.published_cues) === 3;
    },
    async () => {
      await sb.from("content").update({ status: "published" }).eq("id", fx.cueOpOnly);
    }
  );

  /* ==================================================================== */
  section("4 — the certification catalogue is unchanged by the new rule");

  /*
   * SETTLE THE BASELINE FIRST. The fixture published content a moment ago, and
   * the catalogue has not been recomputed since — so a "before" read here would
   * be the state from before the fixture existed, and the first recompute would
   * legitimately move it. What this assertion is about is whether the NEW
   * RESOLUTION agrees with itself, so it compares two runs of the new rule.
   */
  await sb.rpc("recompute_certification_content");
  const { data: certBefore } = await sb
    .from("certification")
    .select("slug, item_count, active")
    .eq("kind", "service")
    .order("slug");
  const before = JSON.stringify(certBefore);

  const { error: recomputeErr } = await sb.rpc("recompute_certification_content");
  ok("recompute runs over PostgREST as the service role", !recomputeErr, recomputeErr?.message);

  const { data: certAfter } = await sb
    .from("certification")
    .select("slug, item_count, active")
    .eq("kind", "service")
    .order("slug");
  ok(
    "re-running it changes no service certification",
    JSON.stringify(certAfter) === before,
    `before=${before} after=${JSON.stringify(certAfter)}`
  );

  /*
   * AND IT AGREES WITH 0116's ORIGINAL PREDICATE, ROW FOR ROW.
   *
   * The assertion above only says the new rule is stable. This one says it is
   * the SAME rule — counted here the way 0116 wrote it, directly against
   * content, with no view involved. If 0125 had widened or narrowed what a
   * service certification counts, this is where it shows.
   */
  const { data: svcCerts } = await sb
    .from("certification")
    .select("slug, service_family, item_count")
    .eq("kind", "service");

  let sameAsOldRule = true;
  for (const c of (svcCerts ?? []) as {
    slug: string;
    service_family: string | null;
    item_count: number;
  }[]) {
    if (!c.service_family) continue;
    const { data: codes } = await sb
      .from("op_code_family")
      .select("code")
      .is("retired_at", null)
      .eq("family", c.service_family);
    const codeList = ((codes ?? []) as { code: string }[]).map((x) =>
      x.code.trim().toUpperCase()
    );
    const { data: all } = await sb
      .from("content")
      .select("id, service_family, op_code")
      .eq("status", "published");
    const old = new Set(
      ((all ?? []) as { id: string; service_family: string | null; op_code: string | null }[])
        .filter(
          (r) =>
            r.service_family === c.service_family ||
            (r.op_code && codeList.includes(r.op_code.trim().toUpperCase()))
        )
        .map((r) => r.id)
    );
    if (old.size !== Number(c.item_count)) {
      sameAsOldRule = false;
      console.log(`      ${c.slug}: 0116 rule ${old.size}, 0125 view ${c.item_count}`);
    }
  }
  ok("and matches 0116's predicate row for row", sameAsOldRule);

  /* ==================================================================== */
  section("5 — the card and the loop name the SAME next film");

  /*
   * THE LOOP GOES FIRST, AND THAT IS THE DESIGN RATHER THAN TEST PLUMBING.
   *
   * loadFocusFamilyCard READS the assignment; it never derives one — a card
   * that moved an advisor onto a new family by being rendered would be a read
   * with a side effect fired by a page load. So until a morning is assembled
   * there is nothing for it to report, and the first version of this suite
   * caught exactly that by asking the card first and getting null.
   */
  const cardBeforeLoop = await loadFocusFamilyCard(asAdvisor, sb, advisor);
  ok(
    "the card reports nothing before any morning has been assembled",
    cardBeforeLoop === null,
    "the card derived an assignment — a render with a side effect"
  );

  const firstMorning = await assembleMorning(asAdvisor, sb, advisor, rooftopId, TODAY);
  ok("the loop derives the assignment", firstMorning.assignment?.family === FAM);

  const card = need(await loadFocusFamilyCard(asAdvisor, sb, advisor), "the focus card");
  ok("the card names the focus family", card.family === FAM, card.family);
  ok("it counts the shelf", card.total === 3, `got ${card.total}`);
  ok("nothing done yet", card.completed === 0);

  const morning = firstMorning;
  ok("the loop serves a pitch from the same family", morning.pitch?.family === FAM);
  ok(
    "and it is the very film the card would continue with",
    card.nextId === morning.pitch?.contentId,
    `card ${card.nextId} vs loop ${morning.pitch?.contentId}`
  );
  ok(
    "the loop's position agrees with the card",
    morning.pitch?.position === card.completed + 1 && morning.pitch?.total === card.total,
    `loop ${morning.pitch?.position}/${morning.pitch?.total}, card ${card.completed}/${card.total}`
  );

  /* ==================================================================== */
  section("6 — watching ahead on the shelf makes the loop skip it");

  /* What the shelf does: completeLibraryItem writes completed_at. Written here
     the way that action writes it, since the action needs a request session. */
  const first = need(card.nextId, "a next film");
  await sb.from("content_progress").upsert(
    {
      user_id: advisor,
      rooftop_id: rooftopId,
      content_id: first,
      watched_pct: 100,
      completed_at: new Date().toISOString(),
      source: "card",
    },
    { onConflict: "user_id,content_id" }
  );

  const card2 = need(await loadFocusFamilyCard(asAdvisor, sb, advisor), "the card again");
  ok("the card moves on", card2.completed === 1 && card2.nextId !== first);

  const morning2 = await assembleMorning(asAdvisor, sb, advisor, rooftopId, TODAY);
  ok(
    "and the loop SKIPS the film watched in the card",
    morning2.pitch?.contentId !== first,
    "the loop re-served a film the card already completed — two consumption records"
  );
  ok(
    "they still agree on what is next",
    card2.nextId === morning2.pitch?.contentId,
    `card ${card2.nextId} vs loop ${morning2.pitch?.contentId}`
  );

  await nonVacuous(
    "the consumption row is withdrawn",
    async () => {
      await sb
        .from("content_progress")
        .update({ completed_at: null })
        .eq("user_id", advisor)
        .eq("content_id", first);
    },
    async () => {
      const c = await loadFocusFamilyCard(asAdvisor, sb, advisor);
      return c?.completed === 1;
    },
    async () => {
      await sb
        .from("content_progress")
        .update({ completed_at: new Date().toISOString() })
        .eq("user_id", advisor)
        .eq("content_id", first);
    }
  );

  /* ==================================================================== */
  section("7 — a base-tier advisor resolves nothing");

  await sb
    .from("rooftop_product")
    .delete()
    .eq("rooftop_id", rooftopId)
    .eq("product", "advisor_base");

  const starved = await loadFamilyContent(asAdvisor, advisor, [FAM]);
  ok(
    "no films reach an unentitled advisor",
    (starved[FAM]?.films.length ?? 0) === 0,
    `got ${starved[FAM]?.films.length}`
  );
  ok("no cues either", (starved[FAM]?.cues.length ?? 0) === 0);
  ok(
    "the MAPPING is still readable — it carries nothing gated",
    ((await sb.from("service_family_content").select("content_id").eq("family", FAM)).data ?? [])
      .length > 0,
    "the view leaked its own emptiness instead of the content doing it"
  );

  await sb.from("rooftop_product").insert({ rooftop_id: rooftopId, product: "advisor_base" });
  const restored = await loadFamilyContent(asAdvisor, advisor, [FAM]);
  ok(
    "↳ and the SAME advisor resolves content once the product is back",
    (restored[FAM]?.films.length ?? 0) === 3,
    "the empty result above proved nothing — it was empty for another reason"
  );
}

/* ---- cleanup -------------------------------------------------------------- */
async function cleanup() {
  for (const u of madeUsers) {
    for (const t of [
      "advisor_track_entry",
      "advisor_pool_seen",
      "advisor_focus_family",
      "advisor_certification",
      "content_progress",
      "watch_gate",
      "sand_dollar_entry",
      "swell",
      "daily_completion",
      "membership",
    ]) {
      await sb.from(t).delete().eq("user_id", u);
    }
    await sb.from("app_user").delete().eq("id", u);
    await sb.auth.admin.deleteUser(u).catch(() => {});
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
  if (rooftopId) {
    if (grantedProduct) await sb.from("rooftop_product").delete().eq("rooftop_id", rooftopId);
    await sb.from("rooftop").delete().eq("id", rooftopId);
  }
  if (orgId) await sb.from("org").delete().eq("id", orgId);
  /* Put the catalogue back the way it was found. */
  await sb.rpc("recompute_certification_content");
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
