/* ============================================================================
   EDIAGD — certification acceptance, against a real database

   THESE ARE THE TESTS THE OFFLINE SUITE CANNOT WRITE. test:certification
   asserts the rules with no database at all, which is the right place for
   arithmetic about dates and core counts. Everything here needs schema: RLS
   actually refusing a write, a credential actually being minted by the real
   accrual path, a re-shoot actually not un-completing anybody.

     export SB_URL=http://127.0.0.1:55321 SB_KEY=<local service role>
     npm run accept:certification

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
   It creates courses, modules, content, auth users and completions, and it
   removes them again at the end. Pointing it at production would put fixture
   advisors on somebody's roster, so it refuses any SB_URL that is not
   localhost unless ALLOW_REMOTE=1 is set, which nothing in this repo sets.

   The fixtures attach to the REAL eight core certifications rather than to
   invented ones, because coreCount is the number the completeness guard
   checks: a suite that seeded its own nine-core catalogue would pass while the
   shipped one failed.
============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  accrueFromCompletion,
  accrueFromModule,
  recomputeCredential,
} from "@/lib/certification-server";
import { computeCredential, currentThrough } from "@/lib/certification";
import type { IsoDate } from "@/lib/gamification/streak";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;

if (!/127\.0\.0\.1|localhost/.test(URL) && process.env.ALLOW_REMOTE !== "1") {
  console.error(`REFUSING to run against ${URL} — this suite writes. Local only.`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

/* ---- the little harness --------------------------------------------------- */
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
function section(title: string) {
  console.log(`\n${title}`);
}

/**
 * A fixture row that came back null is a broken harness, not a failed
 * assertion — the difference matters, because reporting "✗ credential minted"
 * when the SELECT itself returned nothing sends the reader hunting through the
 * wrong code.
 */
function need<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new Error(`fixture expected ${what}, got nothing`);
  return v;
}

/* ---- fixture bookkeeping -------------------------------------------------- */
const TAG = `acc-${randomUUID().slice(0, 8)}`;
const madeCourses: string[] = [];
const madeContent: string[] = [];
const madeUsers: string[] = [];
let rooftopId = "";
let grantedProduct = false;

async function makeTrackContent(certId: string, items: number): Promise<string> {
  const { data: course, error: cErr } = await sb
    .from("course")
    /* course is unique on (track, name) as well as slug, so both must vary. */
    .insert({
      track: "Foundations",
      name: `${TAG} course ${certId.slice(0, 8)}`,
      slug: `${TAG}-${certId.slice(0, 8)}`,
    })
    .select("id")
    .single();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  madeCourses.push(course.id);

  const { data: mod, error: mErr } = await sb
    .from("module")
    .insert({ course_id: course.id, name: `${TAG} module` })
    .select("id")
    .single();
  if (mErr) throw new Error(`module: ${mErr.message}`);

  const rows = Array.from({ length: items }, (_, i) => ({
    type: "cue",
    title: `${TAG} item ${i + 1}`,
    body: "fixture",
    status: "published",
    module_id: mod.id,
    module_order: i + 1,
  }));
  const { data: made, error: ctErr } = await sb.from("content").insert(rows).select("id");
  if (ctErr) throw new Error(`content: ${ctErr.message}`);
  madeContent.push(...made.map((r: { id: string }) => r.id));

  const { error: linkErr } = await sb.from("certification_course").insert({
    certification_id: certId,
    course_id: need(course, "course").id,
  });
  if (linkErr) throw new Error(`certification_course: ${linkErr.message}`);

  return mod.id;
}

/** Mark every published item in the module done, then the module itself —
    exactly what the LMS writes. The accrual is what we are testing, not it. */
async function completeModule(userId: string, moduleId: string) {
  const { data: items } = await sb
    .from("content")
    .select("id")
    .eq("module_id", moduleId)
    .eq("status", "published");

  for (const it of (items ?? []) as { id: string }[]) {
    await sb.from("content_progress").insert({
      user_id: userId,
      rooftop_id: rooftopId,
      content_id: it.id,
      watched_pct: 100,
      completed_at: new Date().toISOString(),
    });
  }
  await sb
    .from("module_completion")
    .insert({ user_id: userId, module_id: moduleId, rooftop_id: rooftopId });
}

async function makeUser(role: "advisor" | "manager"): Promise<string> {
  const email = `${TAG}-${role}-${randomUUID().slice(0, 6)}@example.test`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: "Fixture-passw0rd!",
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);

  await sb.from("app_user").upsert({ id, full_name: `${TAG} ${role}` });
  await sb
    .from("membership")
    .insert({ user_id: id, rooftop_id: rooftopId, role, active: true });

  return id;
}

async function signedInAs(userId: string): Promise<SupabaseClient> {
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: u.user!.email!,
    password: "Fixture-passw0rd!",
  });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

/** The catalogue derivation, with its error surfaced. An ignored failure here
    reads downstream as "the bar did not work", which is the wrong bug. */
async function recompute() {
  const { error } = await sb.rpc("recompute_certification_content");
  if (error) throw new Error(`recompute_certification_content: ${error.message}`);
}

/* ---- cleanup -------------------------------------------------------------- */
async function cleanup() {
  for (const u of madeUsers) {
    await sb.from("advisor_credential").delete().eq("user_id", u);
    await sb.from("advisor_certification").delete().eq("user_id", u);
    await sb.from("module_completion").delete().eq("user_id", u);
    await sb.from("content_progress").delete().eq("user_id", u);
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
  if (grantedProduct) {
    await sb
      .from("rooftop_product")
      .delete()
      .eq("rooftop_id", rooftopId)
      .eq("product", "manager_meetings");
  }
  /* Put the catalogue back the way it was found. */
  await recompute();
}

/* ========================================================================== */

async function main() {
  const { data: rt } = await sb.from("rooftop").select("id").limit(1).single();
  rooftopId = need(rt, "a rooftop").id;

  const { data: coreRows } = await sb
    .from("certification")
    .select("id, slug, name")
    .eq("is_core", true)
    .order("sort");
  const core = (coreRows ?? []) as { id: string; slug: string; name: string }[];

  console.log(`\nfixture tag ${TAG} · rooftop ${rooftopId} · ${core.length} core tracks`);

  /* ---------------------------------------------------------------------- */
  section("1. the minimum content bar");

  const { data: gs } = await sb.from("game_settings").select("certification_min_items").single();
  const bar = Number(need(gs, "game_settings").certification_min_items);
  ok("game_settings carries certification_min_items", Number.isFinite(bar), String(bar));
  ok("it defaults to 5", bar === 5, String(bar));

  /* A thin track: 2 items, below the bar. */
  const thinCert = core[0];
  const thinModule = await makeTrackContent(thinCert.id, 2);
  await recompute();

  let { data: thinRaw } = await sb
    .from("certification")
    .select("active, item_count")
    .eq("id", thinCert.id)
    .single();
  let thin = need(thinRaw, "thin certification");
  ok(`a 2-item track is INACTIVE (${thinCert.name})`, thin.active === false, `active=${thin.active}`);
  ok("...and its item_count is recorded, not hidden", thin.item_count === 2, String(thin.item_count));

  /* Raise it above the bar and it becomes earnable. */
  const { data: extra } = await sb
    .from("content")
    .insert(
      Array.from({ length: 3 }, (_, i) => ({
        type: "cue",
        title: `${TAG} extra ${i}`,
        status: "published",
        module_id: thinModule,
        module_order: 90 + i,
      }))
    )
    .select("id");
  madeContent.push(...need(extra, "extra content").map((r: { id: string }) => r.id));
  await recompute();

  ({ data: thinRaw } = await sb
    .from("certification")
    .select("active, item_count")
    .eq("id", thinCert.id)
    .single());
  thin = need(thinRaw, "thin certification after top-up");
  ok("raise it to 5 and the track becomes earnable", thin.active === true && thin.item_count === 5,
    `active=${thin.active} items=${thin.item_count}`);

  /* ---------------------------------------------------------------------- */
  section("2. accrual by the real code path");

  const advisor = await makeUser("advisor");

  /* THE ROOFTOP'S TODAY, NOT THE SERVER'S UTC DATE. accrueFromModule dates the
     currency from rooftop_today, so an advisor finishing at 6pm in Hawaii gets
     a year from THEIR day rather than from tomorrow in UTC. Asserting against
     new Date() would fail for eleven hours a day and pass for the rest, which
     is worse than not asserting at all. */
  const { data: rpcToday } = await sb.rpc("rooftop_today", { _rooftop: rooftopId });
  const today = (
    typeof rpcToday === "string" ? rpcToday.slice(0, 10) : new Date().toISOString().slice(0, 10)
  ) as IsoDate;

  /* Give every remaining core track enough content, and complete them all. */
  const moduleOf = new Map<string, string>([[thinCert.id, thinModule]]);
  for (const c of core.slice(1)) {
    moduleOf.set(c.id, await makeTrackContent(c.id, 5));
  }
  await recompute();

  const { count: activeCore } = await sb
    .from("certification")
    .select("id", { count: "exact", head: true })
    .eq("is_core", true)
    .eq("active", true);
  ok(`all ${core.length} core tracks are active with content behind them`,
    activeCore === core.length, `${activeCore}`);

  /* First track only. */
  await completeModule(advisor, moduleOf.get(core[0].id)!);
  const first = await accrueFromModule(sb as never, advisor, rooftopId, moduleOf.get(core[0].id)!);
  ok("finishing a craft course earns its certification", first.earned.includes(core[0].slug),
    JSON.stringify(first.earned));
  ok("one certification is not yet the credential", first.credential === null);

  const { data: firstRow } = await sb
    .from("advisor_certification")
    .select("earned_at, current_through, source")
    .eq("user_id", advisor)
    .maybeSingle();
  const first1 = need(firstRow, "the first advisor_certification");
  ok("current_through is one year from the rooftop's earning day",
    first1.current_through === currentThrough(today),
    `${today} -> ${first1.current_through} (earned_at ${first1.earned_at.slice(0, 10)} UTC)`);
  ok("source records how it was earned", first1.source === "accrued", first1.source);

  /* Re-running must not double-earn. */
  const again = await accrueFromModule(sb as never, advisor, rooftopId, moduleOf.get(core[0].id)!);
  ok("re-running accrual earns nothing twice", again.earned.length === 0);

  /* ---------------------------------------------------------------------- */
  section("3. the credential");

  /* ACCRUAL IS TARGETED, so each finished module must be offered to it — the
     same way the library and quiz paths call it once per completion. Completing
     seven modules and accruing only the last would grant one certification and
     then wonder why the credential did not compute. */
  let last: Awaited<ReturnType<typeof accrueFromModule>> = { earned: [], credential: null };
  for (const c of core.slice(1)) {
    await completeModule(advisor, moduleOf.get(c.id)!);
    last = await accrueFromModule(sb as never, advisor, rooftopId, moduleOf.get(c.id)!);
  }

  ok("holding all eight core certifications computes EDIAGD Certified",
    last.credential?.level === "certified", JSON.stringify(last.credential));
  ok("a certificate id is minted in the documented shape",
    /^EDG-C-\d{4}-\d{5}$/.test(last.credential?.certificateId ?? ""),
    last.credential?.certificateId);

  const { data: credRow } = await sb
    .from("advisor_credential")
    .select("certificate_id, current_through, level")
    .eq("user_id", advisor)
    .single();
  const cred1 = need(credRow, "the advisor_credential row");
  ok("the credential is persisted, not just returned",
    cred1.certificate_id === last.credential?.certificateId);

  const { data: allHeld } = await sb
    .from("advisor_certification")
    .select("current_through")
    .eq("user_id", advisor);
  const earliest = (allHeld as { current_through: string }[])
    .map((h) => h.current_through)
    .sort()[0];
  ok("its current_through is the EARLIEST constituent",
    cred1.current_through === earliest, `${cred1.current_through} vs ${earliest}`);

  /* ---- the completeness guard, on the real function ---------------------- */
  const holdings = core.map((c) => ({
    slug: c.slug,
    isCore: true,
    currentThrough: "2099-01-01" as IsoDate,
  }));
  ok("the completeness guard REFUSES a filtered input (7 of 8)",
    computeCredential(holdings.slice(0, 7), today, core.length) === null);
  ok("...and concludes when handed the whole core",
    computeCredential(holdings, today, core.length)?.level === "certified");
  ok("...and refuses a zero core count outright",
    computeCredential(holdings, today, 0) === null);

  /* ---------------------------------------------------------------------- */
  section("4. lapse never revokes");

  const lapsed = core[0];
  await sb
    .from("advisor_certification")
    .update({ current_through: "2020-01-01" })
    .eq("user_id", advisor)
    .eq("certification_id", lapsed.id);

  const afterLapse = await recomputeCredential(sb as never, advisor, today);
  ok("with one constituent lapsed the credential does not recompute",
    afterLapse === null || afterLapse.certificateId === cred1.certificate_id);

  const { data: stillHeld } = await sb
    .from("advisor_certification")
    .select("certification_id")
    .eq("user_id", advisor)
    .eq("certification_id", lapsed.id)
    .maybeSingle();
  ok("the lapsed certification is STILL HELD — nothing stripped", stillHeld != null);

  const { count: credStill } = await sb
    .from("advisor_credential")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisor);
  ok("the credential row is not deleted either", credStill === 1);

  /* Renew it. */
  await sb
    .from("advisor_certification")
    .update({ current_through: currentThrough(today), renewed_at: new Date().toISOString() })
    .eq("user_id", advisor)
    .eq("certification_id", lapsed.id);

  const restored = await recomputeCredential(sb as never, advisor, today);
  ok("renewing restores the credential", restored?.level === "certified");
  ok("...and it is the SAME certificate id, not a new one",
    restored?.certificateId === cred1.certificate_id,
    `${restored?.certificateId} vs ${cred1.certificate_id}`);

  /* ---------------------------------------------------------------------- */
  section("5. a re-shoot un-completes nobody");

  const reshot = madeContent[0];
  const { data: before } = await sb
    .from("content_progress")
    .select("id")
    .eq("user_id", advisor)
    .eq("content_id", reshot)
    .maybeSingle();

  await sb.from("content").update({ version: 2, title: `${TAG} reshot` }).eq("id", reshot);

  const { data: after } = await sb
    .from("content_progress")
    .select("id")
    .eq("user_id", advisor)
    .eq("content_id", reshot)
    .maybeSingle();
  ok("bumping content.version leaves the completion intact", before?.id === after?.id);

  const { count: heldAfter } = await sb
    .from("advisor_certification")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisor);
  ok("and the certification is still held", heldAfter === core.length);

  /* ---------------------------------------------------------------------- */
  section("6. RLS — no write path from any session role");

  const manager = await makeUser("manager");
  const asAdvisor = await signedInAs(advisor);
  const asManager = await signedInAs(manager);

  for (const [who, client] of [
    ["advisor", asAdvisor],
    ["manager", asManager],
  ] as const) {
    const { error: certWrite } = await client
      .from("advisor_certification")
      .insert({
        user_id: advisor,
        certification_id: core[1].id,
        current_through: "2099-01-01",
      });
    ok(`${who} cannot INSERT advisor_certification`, certWrite != null, certWrite?.code);

    const { error: credWrite } = await client.from("advisor_credential").insert({
      user_id: advisor,
      level: "certified",
      certificate_id: `EDG-C-2099-${Math.floor(Math.random() * 90000 + 10000)}`,
      current_through: "2099-01-01",
    });
    ok(`${who} cannot INSERT advisor_credential`, credWrite != null, credWrite?.code);

    const { error: credUpdate, count: updated } = await client
      .from("advisor_credential")
      .update({ current_through: "2099-12-31" }, { count: "exact" })
      .eq("user_id", advisor);
    ok(`${who} cannot UPDATE advisor_credential`, credUpdate != null || (updated ?? 0) === 0,
      credUpdate?.code ?? `rows=${updated}`);

    const { error: certDelete, count: deleted } = await client
      .from("advisor_certification")
      .delete({ count: "exact" })
      .eq("user_id", advisor);
    ok(`${who} cannot DELETE advisor_certification`, certDelete != null || (deleted ?? 0) === 0,
      certDelete?.code ?? `rows=${deleted}`);
  }

  /* Reads still work the way the policies say they should. */
  const { data: ownRead } = await asAdvisor
    .from("advisor_certification")
    .select("id")
    .eq("user_id", advisor);
  ok("an advisor CAN read their own certifications", (ownRead ?? []).length === core.length);

  const { data: mgrRead } = await asManager
    .from("advisor_credential")
    .select("id")
    .eq("user_id", advisor);
  ok("a manager CAN read their rooftop's credentials", (mgrRead ?? []).length === 1);

  /* ---------------------------------------------------------------------- */
  section("7. entitlement gates accrual");

  /*
   * TWO DIMENSIONS, TESTED SEPARATELY.
   *
   * The fixture rooftop ships with advisor_base only, so a manager_video is
   * refused for BOTH reasons at once — wrong role and unbought product — and a
   * test that cannot tell which rule fired is a test that still passes when one
   * of them breaks. So the rooftop is granted manager_meetings for the duration:
   *
   *   manager_video  role excludes the advisor, product is present  -> ROLE
   *   joe_the_pro    role allows the advisor, product is absent     -> PRODUCT
   */
  await sb.from("rooftop_product").insert({
    rooftop_id: rooftopId,
    product: "manager_meetings",
    status: "active",
  });
  grantedProduct = true;
  const { data: mm } = await sb
    .from("content")
    .insert({
      type: "manager_video",
      title: `${TAG} manager meeting`,
      status: "published",
    })
    .select("id")
    .single();
  const mmRow = need(mm, "manager meeting content");
  madeContent.push(mmRow.id);

  const { data: visible } = await asAdvisor
    .from("content")
    .select("id")
    .eq("id", mmRow.id)
    .maybeSingle();
  ok("an advisor cannot READ Manager Meetings content — wrong ROLE, product present", visible == null);

  /*
   * ---- THE FORGERY, REFUSED BY THE DATABASE ------------------------------
   *
   * Not by the application. completeLibraryItem's entitlement re-check is a
   * good belt, but PostgREST is reachable with this advisor's JWT and does not
   * run it — so the assertion that matters is this one, made with a raw session
   * client against the table directly. 0118 is what makes it pass.
   */
  const { error: forgedInsert } = await asAdvisor.from("content_progress").insert({
    user_id: advisor,
    rooftop_id: rooftopId,
    content_id: mmRow.id,
    completed_at: new Date().toISOString(),
  });
  ok("...and the DATABASE refuses progress against it", forgedInsert != null, forgedInsert?.code);

  /* The RPC the video player actually calls. It is INSERT ... ON CONFLICT DO
     UPDATE and runs security INVOKER, so it is governed by the same policies —
     and it is the path a forgery would reach for once the plain insert fails. */
  const { error: forgedRpc } = await asAdvisor.rpc("record_watch_progress", {
    _content_id: mmRow.id,
    _pct: 100,
    _position: 0,
  });
  ok("record_watch_progress refuses it too", forgedRpc != null, forgedRpc?.code);

  /* Joe the Pro: a DIFFERENT product on the same advisor, to prove the check
     follows content's own rules rather than a hardcoded manager_video case. */
  const { data: jtp } = await sb
    .from("content")
    .insert({ type: "joe_the_pro", title: `${TAG} joe`, status: "published" })
    .select("id")
    .single();
  const jtpRow = need(jtp, "joe the pro content");
  madeContent.push(jtpRow.id);

  const { error: forgedJtp } = await asAdvisor.from("content_progress").insert({
    user_id: advisor,
    rooftop_id: rooftopId,
    content_id: jtpRow.id,
    completed_at: new Date().toISOString(),
  });
  ok("an unbought Joe the Pro item is refused too — right role, no PRODUCT", forgedJtp != null, forgedJtp?.code);

  /* ---------------------------------------------------------------------- */
  section("8. what must NOT have broken");

  /* An entitled advisor, through the real player path. The fixture content is
     type 'cue' — advisor_base, which every rooftop has — so this is the honest
     everyday write and it must be completely unaffected. */
  /* A FRESH cue, deliberately not one of the module items the fixture advisor
     already completed at 100%: record_watch_progress clamps monotonically, so
     writing 88 over an existing 100 correctly changes nothing and would make
     the "it advanced" assertion a lie either way. */
  const { data: freshItem } = await sb
    .from("content")
    .insert({ type: "cue", title: `${TAG} fresh cue`, status: "published" })
    .select("id")
    .single();
  const entitledItem = need(freshItem, "fresh entitled cue").id;
  madeContent.push(entitledItem);
  const { data: readable } = await asAdvisor
    .from("content")
    .select("id")
    .eq("id", entitledItem)
    .maybeSingle();
  ok("an entitled advisor can still READ their own library content", readable != null);

  const { error: honestRpc } = await asAdvisor.rpc("record_watch_progress", {
    _content_id: entitledItem,
    _pct: 42,
    _position: 7,
  });
  ok("record_watch_progress still works for entitled content", honestRpc == null, honestRpc?.message);

  /* And again, to exercise the ON CONFLICT DO UPDATE branch specifically —
     the update policy, not the insert one. */
  const { error: honestRpcAgain } = await asAdvisor.rpc("record_watch_progress", {
    _content_id: entitledItem,
    _pct: 88,
    _position: 19,
  });
  ok("...including the ON CONFLICT update branch", honestRpcAgain == null, honestRpcAgain?.message);

  const { data: bumped } = await sb
    .from("content_progress")
    .select("watched_pct")
    .eq("user_id", advisor)
    .eq("content_id", entitledItem)
    .maybeSingle();
  ok("...and the progress actually advanced", Number(need(bumped, "progress row").watched_pct) === 88,
    String(bumped?.watched_pct));

  /* The service role is the daily loop, the library completion and the
     certification accrual. RLS does not apply to it and must not start to. */
  const { error: serviceWrite } = await sb.from("content_progress").insert({
    user_id: advisor,
    rooftop_id: rooftopId,
    content_id: mmRow.id,
    completed_at: new Date().toISOString(),
  });
  ok("the SERVICE role is unaffected — the daily loop still writes", serviceWrite == null,
    serviceWrite?.message);
  await sb.from("content_progress").delete().eq("user_id", advisor).eq("content_id", mmRow.id);

  /*
   * A manager keeps everything they had — on the content they were ever
   * entitled to. NOT on a cue: roles_for_content_type('cue') is {advisor}, so a
   * manager could never READ one, before or after this change. Asserting they
   * can record progress on a cue would be asserting the hole is still open.
   */
  const { data: mgrCanRead } = await asManager
    .from("content")
    .select("id")
    .eq("id", mmRow.id)
    .maybeSingle();
  ok("a manager can read Manager Meetings content", mgrCanRead != null);

  const { error: mgrRpc } = await asManager.rpc("record_watch_progress", {
    _content_id: mmRow.id,
    _pct: 30,
    _position: 3,
  });
  ok("...and can still record progress against it", mgrRpc == null, mgrRpc?.message);
  await sb.from("content_progress").delete().eq("user_id", manager).eq("content_id", mmRow.id);

  /* The platform owner reads content through content_platform_all, not through
     content_entitled_read — the case a copied predicate would have broken. */
  await sb.from("app_user").update({ is_platform_owner: true }).eq("id", manager);
  const asOwner = await signedInAs(manager);
  const { error: ownerRpc } = await asOwner.rpc("record_watch_progress", {
    _content_id: mmRow.id,
    _pct: 50,
    _position: 5,
  });
  ok("the PLATFORM OWNER can record progress on anything", ownerRpc == null, ownerRpc?.message);
  await sb.from("content_progress").delete().eq("user_id", manager).eq("content_id", mmRow.id);
  await sb.from("app_user").update({ is_platform_owner: false }).eq("id", manager);

  /* ---------------------------------------------------------------------- */
  section("9. the consequence — forgery cannot mint anything");

  /*
   * A SERVICE CERTIFICATION THE ADVISOR CANNOT REACH, BUILT ON PURPOSE.
   *
   * Service certifications accrue by counting content_progress rows against a
   * family's published items — that is the machinery the forgery was aiming at,
   * so the test has to actually stand one up rather than skip when the local
   * catalogue happens to have none active.
   *
   * The items are type joe_the_pro, which this rooftop has not bought, so they
   * count toward the family's item_count (0116 counts published content by
   * family, regardless of type) while remaining unreadable to the advisor. That
   * is precisely the shape of the hole: a track whose content you cannot see,
   * which you could previously certify in by POSTing rows.
   */
  const { data: targetCert } = await sb
    .from("certification")
    .select("id, slug, service_family")
    .eq("kind", "service")
    .order("sort")
    .limit(1)
    .maybeSingle();
  const target = need(targetCert, "a service certification");

  const unreachable = Array.from({ length: 5 }, (_, i) => ({
    type: "joe_the_pro",
    title: `${TAG} unreachable ${i}`,
    status: "published",
    service_family: target.service_family,
  }));
  const { data: madeUnreachable, error: unreachErr } = await sb
    .from("content")
    .insert(unreachable)
    .select("id");
  if (unreachErr) throw new Error(`unreachable content: ${unreachErr.message}`);
  const unreachableIds = need(madeUnreachable, "unreachable content").map(
    (r: { id: string }) => r.id
  );
  madeContent.push(...unreachableIds);

  await recompute();
  const { data: nowActive } = await sb
    .from("certification")
    .select("active, item_count")
    .eq("id", target.id)
    .single();
  const activeRow = need(nowActive, "target certification");
  ok(`the ${target.service_family} track is now earnable on paper`,
    activeRow.active === true && activeRow.item_count >= 5,
    `active=${activeRow.active} items=${activeRow.item_count}`);

  /* The advisor cannot read any of it. */
  const { data: seen } = await asAdvisor.from("content").select("id").in("id", unreachableIds);
  ok("...but the advisor cannot read a single one of its items", (seen ?? []).length === 0,
    `${(seen ?? []).length} visible`);

  /* The forgery: claim every item in the family. */
  let refusedCount = 0;
  for (const id of unreachableIds) {
    const { error } = await asAdvisor.from("content_progress").insert({
      user_id: advisor,
      rooftop_id: rooftopId,
      content_id: id,
      completed_at: new Date().toISOString(),
    });
    if (error) refusedCount++;
  }
  ok("every forged progress row is refused", refusedCount === unreachableIds.length,
    `${refusedCount}/${unreachableIds.length}`);

  /* And the accrual, run explicitly, finds nothing to grant. */
  const forgedAccrual = await accrueFromCompletion(
    sb as never,
    advisor,
    rooftopId,
    unreachableIds[0]
  );
  ok("accrual grants no certification from forged progress",
    forgedAccrual.earned.length === 0, JSON.stringify(forgedAccrual.earned));

  const { count: heldTarget } = await sb
    .from("advisor_certification")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisor)
    .eq("certification_id", target.id);
  ok("...and the advisor does not hold the service certification", (heldTarget ?? 0) === 0,
    String(heldTarget));

  /* Badge counts read the same rows. */
  const { count: badgeRows } = await sb
    .from("content_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisor)
    .eq("content_id", mmRow.id);
  ok("no unentitled row survives to inflate a badge count", (badgeRows ?? 0) === 0,
    String(badgeRows));

  /* ---------------------------------------------------------------------- */
  console.log(`\n${"=".repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("=".repeat(64));
}

main()
  .then(cleanup)
  .then(() => process.exit(failed > 0 ? 1 : 0))
  .catch(async (e) => {
    console.error("\nFIXTURE ERROR:", e);
    await cleanup().catch(() => {});
    process.exit(1);
  });
