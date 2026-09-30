/* ============================================================================
   EDIAGD — the certifications page, proven as the viewer

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:certifications-page

   Runs against a LOCAL Supabase carrying a restore of production data with
   0144-0146 applied. It writes (progress, attempts, completions for one
   advisor) and refuses any non-local URL.

   WHAT IT PROVES, and as whom:

     as a REAL ADVISOR-ONLY ACCOUNT (by id, provisioned rooftop), over
     PostgREST as `authenticated` — the client the page itself uses:

       1  fresh: the credential card reads 0 of 9 core tracks, every core
          tile reads "0 of N modules", and the Walk Around tile's next line
          names module 1's lesson
       2  with module 1's films watched: the next line becomes the QUIZ —
          named by pendingQuizzes(), not by a second predicate
       3  after the quiz passes through gradeAttempt() — the REAL grading
          path — and completeModuleIfReady() writes the row the credential
          reads: the tile reads "1 of 7 modules", the track page marks
          module 1 complete and module 2 not started
       4  cue-only modules are labeled reinforcement, and the track bar's
          denominator (gating lessons) excludes them: 3 for Walk Around,
          never 7
       5  the negative: an inactive Master track comes back comingSoon with
          NO modules, NO progress, NO links to render
   ============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  loadCertificationsOverview,
  loadTrackDetail,
} from "@/lib/certifications";
import { gradeAttempt } from "@/lib/quiz";
import { completeModuleIfReady } from "@/lib/lms";

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

/* gradeAttempt builds its own service client from the app's env names. Point
   them at the same local instance so the REAL grading path runs here. */
process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;

const service = createClient(URL, KEY, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}`);
  }
}

async function signedInAs(userId: string): Promise<SupabaseClient> {
  const password = `cpa-${userId.slice(0, 8)}-scratch`;
  const { error: up } = await service.auth.admin.updateUserById(userId, { password });
  if (up) throw new Error(`set password: ${up.message}`);
  const { data: u, error: ge } = await service.auth.admin.getUserById(userId);
  if (ge || !u.user?.email) throw new Error(`getUser: ${ge?.message ?? "no email"}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: u.user.email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

async function main() {
  /* ---- the advisor, by id: advisor-only membership, provisioned rooftop -- */
  const { data: mems } = await service
    .from("membership")
    .select("user_id, role, rooftop_id")
    .eq("active", true);
  const rows = (mems ?? []) as { user_id: string; role: string; rooftop_id: string }[];
  const rolesByUser = new Map<string, Set<string>>();
  for (const m of rows) {
    const s = rolesByUser.get(m.user_id) ?? new Set<string>();
    s.add(m.role);
    rolesByUser.set(m.user_id, s);
  }
  const provisioned = new Set<string>();
  for (const m of rows) {
    const { count } = await service
      .from("rooftop_product")
      .select("rooftop_id", { count: "exact", head: true })
      .eq("rooftop_id", m.rooftop_id);
    if (Number(count ?? 0) > 0) provisioned.add(m.rooftop_id);
  }
  const advisorRow = rows.find(
    (m) =>
      m.role === "advisor" &&
      provisioned.has(m.rooftop_id) &&
      rolesByUser.get(m.user_id)?.size === 1
  );
  if (!advisorRow) throw new Error("no advisor-only membership at a provisioned rooftop");
  const advisorId = advisorRow.user_id;
  console.log(`\n  advisor-only account ${advisorId} at rooftop ${advisorRow.rooftop_id}\n`);

  /* ---- reset this advisor's craft state, so "fresh" means fresh ---------- */
  await service.from("module_completion").delete().eq("user_id", advisorId);
  await service.from("quiz_attempt").delete().eq("user_id", advisorId);
  await service.from("content_progress").delete().eq("user_id", advisorId);
  console.log("  (setup) advisor craft state reset\n");

  const asAdvisor = await signedInAs(advisorId);
  const today = new Date().toISOString().slice(0, 10) as never;

  /* ---- 1 · fresh ---------------------------------------------------------- */
  {
    const view = await loadCertificationsOverview(asAdvisor as never, advisorId, today);
    assert(view.coreHeld === 0 && view.coreCount === 9, `fresh: 0 of 9 core tracks (got ${view.coreHeld} of ${view.coreCount})`);
    assert(view.coreModulesDone === 0, `fresh: credential bar starts at 0 modules (got ${view.coreModulesDone})`);
    const wa = view.coreTracks.find((t) => t.name === "Walk Around");
    assert(
      wa?.doneModules === 0 && wa?.totalModules === 7,
      `fresh: Walk Around tile reads 0 of 7 modules (got ${wa?.doneModules} of ${wa?.totalModules})`
    );
    assert(
      wa?.nextLine === "Next: 1. The Walk-Around Routine",
      `fresh: next line names module 1's lesson (got "${wa?.nextLine}")`
    );
    assert(
      view.coreTracks.every((t) => t.doneModules === 0),
      "fresh: every core tile reads 0 modules done"
    );
    /* the ordering is the loop's */
    assert(
      view.coreTracks.map((t) => t.sort).every((s, i, a) => i === 0 || a[i - 1]! <= s),
      "core tiles are in certification.sort order"
    );
  }

  /* ---- 2 · films watched: the next line becomes the quiz ------------------ */
  const { data: waCert } = await service
    .from("certification")
    .select("id")
    .eq("name", "Walk Around")
    .maybeSingle();
  const { data: waCc } = await service
    .from("certification_course")
    .select("course_id")
    .eq("certification_id", waCert!.id as string);
  const waCourseIds = ((waCc ?? []) as { course_id: string }[]).map((c) => c.course_id);
  const { data: waMods } = await service
    .from("module")
    .select("id, name, sort_order")
    .in("course_id", waCourseIds)
    .order("sort_order", { ascending: true });
  const mod1 = (waMods ?? [])[0] as { id: string; name: string };

  const { data: mod1Films } = await service
    .from("content")
    .select("id")
    .eq("module_id", mod1.id)
    .eq("type", "advisor_video")
    .eq("status", "published")
    .is("retired_at", null);
  for (const f of (mod1Films ?? []) as { id: string }[]) {
    await service.from("content_progress").upsert(
      {
        user_id: advisorId,
        rooftop_id: advisorRow.rooftop_id,
        content_id: f.id,
        watched_pct: 100,
        completed_at: new Date().toISOString(),
        source: "library",
      },
      { onConflict: "user_id,content_id" }
    );
  }
  console.log(`  (setup) ${(mod1Films ?? []).length} module-1 film(s) marked watched\n`);

  {
    const view = await loadCertificationsOverview(asAdvisor as never, advisorId, today);
    const wa = view.coreTracks.find((t) => t.name === "Walk Around");
    assert(
      wa?.nextLine === `Next: quiz for ${mod1.name}`,
      `films watched: next line is the quiz, from pendingQuizzes() (got "${wa?.nextLine}")`
    );
    const detail = await loadTrackDetail(asAdvisor as never, advisorId, wa!.slug);
    assert(
      detail?.modules[0]?.state === "quiz_waiting",
      `track page: module 1 is quiz_waiting (got ${detail?.modules[0]?.state})`
    );
  }

  /* ---- 3 · the quiz passes through the REAL grading path ------------------ */
  {
    const { data: qs } = await service
      .from("quiz_question")
      .select("id, correct")
      .eq("module_id", mod1.id)
      .eq("status", "published");
    const answers = Object.fromEntries(
      ((qs ?? []) as { id: string; correct: string }[]).map((q) => [q.id, q.correct.trim()])
    );
    const result = await gradeAttempt(advisorId, mod1.id, answers);
    assert(!("error" in result) && result.passed === true, "gradeAttempt passes with the keyed answers");

    const done = await completeModuleIfReady(
      service as never,
      advisorId,
      ((mod1Films ?? [])[0] as { id: string }).id,
      advisorRow.rooftop_id,
      0
    );
    assert(done?.moduleId === mod1.id, "completeModuleIfReady writes the completion row");

    const view = await loadCertificationsOverview(asAdvisor as never, advisorId, today);
    const wa = view.coreTracks.find((t) => t.name === "Walk Around");
    assert(
      wa?.doneModules === 1 && wa?.totalModules === 7,
      `tile reads 1 of 7 modules (got ${wa?.doneModules} of ${wa?.totalModules})`
    );
    assert(view.coreModulesDone === 1, `credential bar counts 1 module (got ${view.coreModulesDone})`);

    const detail = await loadTrackDetail(asAdvisor as never, advisorId, wa!.slug);
    assert(detail?.modules[0]?.state === "complete", `track page: module 1 complete (got ${detail?.modules[0]?.state})`);
    assert(detail?.modules[1]?.state === "not_started", `track page: module 2 not started (got ${detail?.modules[1]?.state})`);

    /* ---- 4 · reinforcement never counts ---------------------------------- */
    const reinforcement = detail?.modules.filter((m) => m.state === "reinforcement") ?? [];
    assert(
      reinforcement.length === 4,
      `Walk Around's four cue-only modules are reinforcement (got ${reinforcement.length})`
    );
    assert(
      detail?.gatingTotal === 3 && detail?.gatingDone === 1,
      `track bar is 1 of 3 lessons, never of 7 (got ${detail?.gatingDone} of ${detail?.gatingTotal})`
    );
  }

  /* ---- 5 · the negative: an inactive Master track ------------------------- */
  {
    const { data: masterSoon } = await service
      .from("certification")
      .select("slug, name")
      .eq("is_master_track", true)
      .eq("active", false)
      .limit(1)
      .maybeSingle();
    if (!masterSoon) {
      assert(false, "no inactive Master track found to test the negative");
    } else {
      const detail = await loadTrackDetail(
        asAdvisor as never,
        advisorId,
        masterSoon.slug as string
      );
      assert(
        detail?.comingSoon === true &&
          detail.modules.length === 0 &&
          detail.gatingTotal === 0 &&
          detail.entryFilm === null,
        `inactive Master track (${masterSoon.name}) shows no progress and no module links`
      );
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  acceptance crashed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
