/* ============================================================================
   EDIAGD — 0144/0145 + the quiz-waiting link, against a real database

   The acceptance for the 1 October basic-certification lock. Run against a
   LOCAL Supabase whose data is a restore of the production dump with 0144 and
   0145 applied — never against production; it writes.

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     rm -rf .tmp-lba && tsc -p scripts/tsconfig.lockbasic.json && \
       mkdir -p .tmp-lba/node_modules/server-only && \
       echo "module.exports={};" > .tmp-lba/node_modules/server-only/index.js && \
       ln -sfn .. .tmp-lba/node_modules/@ && node .tmp-lba/scripts/lock-basic-acceptance.js

   WHAT IT PROVES, and as whom — every check names its viewer, because a gate
   is only tested in the context of the role that will really call it:

     as the SERVICE ROLE over PostgREST
       1  recompute_certification_content() runs without throwing — the
          pg_safeupdate path, which psql-as-postgres cannot exercise
     as an AUTHENTICATED ADMIN over PostgREST
       2  every published question carries module_id AND content_id (112),
          and no library question carries a module — the whole bank, which
          only an admin may read
     as a REAL ADVISOR (advisor-only membership, provisioned rooftop, by id)
       3  quiz_question itself returns NOTHING — the RLS refusal, proven as
          a refusal rather than assumed
       4  quiz_question_public serves the Lasting Impressions questions
          (3-4 per module, twelve modules) and refuses a `correct` column
       5  THE LOOP WALKS THE NEW MODULES: with Walk Around consumed, pickItem
          serves "Get the Hell Out of Here, Part 1" in the module named from
          the slate, on the track "Setting up the MPI"; completing it serves
          Part 2
       6  pendingQuiz surfaces "1. The Walk-Around Routine" first, moves to
          module 2 after a pass, and goes QUIET once every quizzed module is
          passed — while Setting up the MPI's finished, question-less module
          is never offered (the negative half)
   ============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pickItem, pendingQuiz } from "@/lib/loop";

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

const service = createClient(URL, KEY, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`  ok    ${label}`);
}
function bad(label: string) {
  failed += 1;
  console.error(`  FAIL  ${label}`);
}
function assert(cond: boolean, label: string) {
  if (cond) ok(label);
  else bad(label);
}

async function signedInAs(userId: string): Promise<SupabaseClient> {
  const password = `lba-${userId.slice(0, 8)}-scratch`;
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
  /* ---- the cast, by id and role, never by name -------------------------- */
  const { data: mems } = await service
    .from("membership")
    .select("user_id, role, rooftop_id, active")
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
  const adminRow = rows.find((m) => m.role === "admin");
  if (!advisorRow || !adminRow) throw new Error("no advisor-only or admin membership found");
  const advisorId = advisorRow.user_id;
  console.log(`\n  advisor-only account ${advisorId} at rooftop ${advisorRow.rooftop_id}`);
  console.log(`  admin account        ${adminRow.user_id}\n`);

  const asAdvisor = await signedInAs(advisorId);
  const asAdmin = await signedInAs(adminRow.user_id);

  /* ---- 1 · recompute over PostgREST as the service role ------------------ */
  {
    const { error } = await service.rpc("recompute_certification_content");
    assert(!error, `recompute_certification_content() over PostgREST as service role${error ? ` — ${error.message}` : ""}`);
  }

  /* ---- 2 · the whole bank, as an authenticated admin --------------------- */
  {
    const { data, error } = await asAdmin
      .from("quiz_question")
      .select("id, module_id, content_id")
      .eq("status", "published")
      .limit(1000);
    const all = (data ?? []) as { module_id: string | null; content_id: string | null }[];
    assert(!error && all.length === 112, `admin reads 112 published questions (got ${all.length})`);
    const missing = all.filter((q) => !q.module_id || !q.content_id).length;
    assert(missing === 0, `every published question carries module_id and content_id (${missing} missing)`);

    const { data: lib } = await asAdmin
      .from("quiz_question")
      .select("id")
      .eq("status", "library")
      .not("module_id", "is", null);
    assert((lib ?? []).length === 0, "no library question carries a module_id");
  }

  /* ---- 3 · the base table refuses the advisor ---------------------------- */
  {
    const { data } = await asAdvisor.from("quiz_question").select("id").limit(10);
    assert((data ?? []).length === 0, "quiz_question returns nothing to a plain advisor (RLS refusal)");
  }

  /* ---- 4 · the public view serves Lasting Impressions, minus the answers - */
  {
    const { data: mods } = await asAdvisor
      .from("my_module_progress")
      .select("module_id, module_name, has_quiz, course_id")
      .eq("has_quiz", true);
    const rowsM = (mods ?? []) as { module_id: string; course_id: string }[];

    const { data: liCourse } = await asAdvisor
      .from("course")
      .select("id")
      .eq("name", "Lasting Impressions")
      .maybeSingle();
    const liMods = rowsM.filter((m) => m.course_id === (liCourse?.id as string));
    assert(liMods.length === 12, `all 12 Lasting Impressions modules show has_quiz to the advisor (got ${liMods.length})`);

    const { data: qs } = await asAdvisor
      .from("quiz_question_public")
      .select("id, module_id")
      .in("module_id", liMods.map((m) => m.module_id));
    const perModule = new Map<string, number>();
    for (const q of (qs ?? []) as { module_id: string }[]) {
      perModule.set(q.module_id, (perModule.get(q.module_id) ?? 0) + 1);
    }
    const counts = [...perModule.values()];
    assert(
      (qs ?? []).length === 38 && counts.every((c) => c === 3 || c === 4),
      `quiz_question_public serves 38 LI questions, 3-4 per module (got ${(qs ?? []).length})`
    );

    const { error: correctErr } = await asAdvisor
      .from("quiz_question_public")
      .select("correct")
      .limit(1);
    assert(Boolean(correctErr), "quiz_question_public refuses a `correct` column");
  }

  /* ---- 5 · the loop walks the new modules -------------------------------- */
  const today = new Date().toISOString().slice(0, 10) as never;
  {
    const { data: waCourse } = await service
      .from("course")
      .select("id")
      .eq("name", "The Walk-Around")
      .maybeSingle();
    const { data: waMods } = await service
      .from("module")
      .select("id")
      .eq("course_id", waCourse!.id as string);
    const { data: waItems } = await service
      .from("content")
      .select("id")
      .in("module_id", (waMods ?? []).map((m) => m.id as string))
      .eq("status", "published")
      .is("retired_at", null);
    for (const it of (waItems ?? []) as { id: string }[]) {
      await service.from("content_progress").upsert(
        {
          user_id: advisorId,
          rooftop_id: advisorRow.rooftop_id,
          content_id: it.id,
          watched_pct: 100,
          completed_at: new Date().toISOString(),
          source: "loop",
        },
        { onConflict: "user_id,content_id" }
      );
    }
    console.log(`  (setup) ${(waItems ?? []).length} Walk Around items marked complete for the advisor`);

    const first = await pickItem(asAdvisor as never, service as never, advisorId, today);
    assert(
      first.item?.trackName === "Setting up the MPI" &&
        first.item?.title === "Get the Hell Out of Here, Part 1" &&
        first.item?.moduleName === "The easiest sell you'll ever make" &&
        first.item?.format === "video",
      `pickItem serves GTHOOH Part 1 in "The easiest sell you'll ever make" on Setting up the MPI ` +
        `(got ${first.item?.trackName} / ${first.item?.moduleName} / ${first.item?.title})`
    );

    if (first.item) {
      await service.from("content_progress").upsert(
        {
          user_id: advisorId,
          rooftop_id: advisorRow.rooftop_id,
          content_id: first.item.contentId,
          watched_pct: 100,
          completed_at: new Date().toISOString(),
          source: "loop",
        },
        { onConflict: "user_id,content_id" }
      );
    }
    const second = await pickItem(asAdvisor as never, service as never, advisorId, today);
    assert(
      second.item?.title === "Get the Hell Out of Here, Part 2" &&
        second.item?.moduleName === "The speech",
      `completing it serves Part 2 in "The speech" (got ${second.item?.moduleName} / ${second.item?.title})`
    );
  }

  /* ---- 6 · the quiz-waiting link's predicate ------------------------------ */
  {
    const q1 = await pendingQuiz(asAdvisor as never);
    assert(
      q1?.trackName === "Walk Around" && q1?.moduleName === "1. The Walk-Around Routine",
      `pendingQuiz names "1. The Walk-Around Routine" on Walk Around first (got ${q1?.trackName} / ${q1?.moduleName})`
    );

    /* a pass moves it to module 2 — unlimited retries are the attempt row's
       absence, so only a PASSED attempt moves it */
    const { data: waCourse } = await service
      .from("course")
      .select("id")
      .eq("name", "The Walk-Around")
      .maybeSingle();
    const { data: waMods } = await service
      .from("module")
      .select("id, name, sort_order")
      .eq("course_id", waCourse!.id as string)
      .order("sort_order", { ascending: true });
    const mods = (waMods ?? []) as { id: string; name: string; sort_order: number }[];

    await service.from("quiz_attempt").insert({
      user_id: advisorId,
      module_id: mods[0]!.id,
      score_pct: 100,
      passed: true,
      answers: {},
    });
    const q2 = await pendingQuiz(asAdvisor as never);
    assert(
      q2?.moduleName === "2. What the Vehicle Tells You",
      `after a pass, pendingQuiz moves to module 2 (got ${q2?.moduleName})`
    );

    /* pass every module the advisor can complete (1-3 hold the films; 4-7 are
       cue-only, items_done is false there by 0143 and they can never surface) */
    for (const m of mods.slice(1, 3)) {
      await service.from("quiz_attempt").insert({
        user_id: advisorId,
        module_id: m.id,
        score_pct: 100,
        passed: true,
        answers: {},
      });
    }
    const q3 = await pendingQuiz(asAdvisor as never);

    /* THE NEGATIVE HALF: Setting up the MPI module 1 is items-done for this
       advisor (step 5) and carries NO published questions — it must never be
       offered. With Walk Around passed, the correct answer is silence. */
    const { count: mpiQs } = await service
      .from("quiz_question")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .in(
        "module_id",
        ((
          await service
            .from("module")
            .select("id, course:course_id!inner(name)")
            .eq("course.name", "The Multi-Point Inspection")
        ).data ?? []).map((m: { id: string }) => m.id)
      );
    assert(Number(mpiQs ?? 0) === 0, "Setting up the MPI has no published questions (population for the negative)");
    assert(
      q3 === null,
      `an items-done module with no published questions is never offered — pendingQuiz is quiet (got ${q3?.moduleName ?? "null"})`
    );
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  acceptance crashed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
