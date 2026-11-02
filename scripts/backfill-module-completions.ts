/* ============================================================================
   EDIAGD — the one-time pass for lessons that finished while nobody looked

   module_completion is written only when a film or a quiz FINISHES
   (completeModuleIfReady, three callers). A module whose requirements become met
   for any other reason — a gating film retired, unpublished or swapped out, a
   quiz pulled — never gets its row. lib/module-reconcile.ts closes that going
   forward, on the Certs read; this clears whatever is already sitting there, in
   one pass, for every advisor rather than only the ones who happen to visit.

   ---------------------------------------------------------------------------
   AN EMPTY RUN IS THE CORRECT RESULT TODAY, AND THAT IS MEASURED
   ---------------------------------------------------------------------------
   Production, 2 November: 14 advisors x 116 gating modules — 13 complete, 22
   waiting on a quiz, 0 met-without-a-row. Reconciled two ways (the 35 pairs
   with every gating film done equal complete + quiz-waiting + met-without-a-row).
   So this is expected to write NOTHING on its first run, and that is stated here
   so nobody reads a zero as a broken script.

   ---------------------------------------------------------------------------
   THE RULE IS NOT RE-IMPLEMENTED HERE
   ---------------------------------------------------------------------------
   Every write goes through completeModuleIfReadyById — the one writer, which
   re-asks moduleRequirementsMet as the service role. This script decides only
   WHO and WHICH MODULES to ask about. A second copy of "module complete" living
   in a script is exactly the drift TWO_LADDERS forbids.

   --apply writes. Without it this reports and changes nothing.
   Run with `npm run backfill:modules`.
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";
import { completeModuleIfReadyById, gatingModuleIds } from "@/lib/lms";

const APPLY = process.argv.includes("--apply");

const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SB_URL/SB_KEY (or NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) are required.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

type Client = Parameters<typeof completeModuleIfReadyById>[0];

async function main() {
  /*
   * THE POPULATION, NAMED BEFORE THE FINDING. Every advisor membership that is
   * ACTIVE, at a rooftop that is not a seeded demo. The rooftop comes from the
   * membership rather than from a lookup, because module_completion.rooftop_id
   * records where the lesson was finished and an advisor can hold more than one.
   */
  const { data: roofRows } = await sb.from("rooftop").select("id, name");
  const demo = new Set(
    ((roofRows ?? []) as { id: string; name: string }[])
      .filter((r) => /^\[DEMO\]/.test(r.name))
      .map((r) => r.id)
  );

  const { data: memRows } = await sb
    .from("membership")
    .select("user_id, rooftop_id")
    .eq("role", "advisor")
    .eq("active", true);

  /* One (advisor, rooftop) pair each, demo stores dropped. */
  const pairs = ((memRows ?? []) as { user_id: string; rooftop_id: string }[]).filter(
    (m) => !demo.has(m.rooftop_id)
  );

  const gating = [...(await gatingModuleIds(sb as unknown as Client))];

  console.log(
    `POPULATION: ${pairs.length} active advisor memberships at non-demo rooftops, ` +
      `against ${gating.length} gating modules.`
  );
  console.log(APPLY ? "MODE: --apply, writing.\n" : "MODE: dry run, writing nothing.\n");

  /* Rows that already exist, so the dry run reports what it WOULD write rather
     than what the primary key would refuse. */
  const { data: haveRows } = await sb
    .from("module_completion")
    .select("user_id, module_id")
    .limit(10000);
  const have = new Set(
    ((haveRows ?? []) as { user_id: string; module_id: string }[]).map(
      (r) => `${r.user_id}|${r.module_id}`
    )
  );

  /*
   * ---- A CHEAP PRE-FILTER, AND THE WRITER STILL DECIDES -------------------
   *
   * The first version asked moduleRequirementsMet about every (advisor, module)
   * pair with no row: 14 x 116 = 1,624 pairs at three round trips each, which
   * did not finish in two minutes. A backfill nobody can run is a backfill that
   * does not exist.
   *
   * So the pairs are narrowed in BULK first — four reads for the whole catalogue
   * — and only the survivors are handed to the one writer. The pre-filter is a
   * NECESSARY condition, never a sufficient one: it can nominate a pair the
   * writer then refuses, and that is the safe direction. What it must not do is
   * exclude a pair the writer would have accepted, which is why it reads the
   * same three facts moduleRequirementsMet reads, from the same tables, with the
   * same predicates — published gating items, their completions, a published
   * quiz and a passing attempt.
   */
  const { data: filmRows } = await sb
    .from("content")
    .select("id, module_id")
    .eq("type", "advisor_video")
    .eq("status", "published")
    .not("module_id", "is", null)
    .limit(5000);
  const filmsByModule = new Map<string, string[]>();
  for (const f of (filmRows ?? []) as { id: string; module_id: string }[]) {
    filmsByModule.set(f.module_id, [...(filmsByModule.get(f.module_id) ?? []), f.id]);
  }

  const { data: qRows } = await sb
    .from("quiz_question")
    .select("module_id")
    .eq("status", "published")
    .limit(5000);
  const quizzed = new Set(((qRows ?? []) as { module_id: string }[]).map((r) => r.module_id));

  const { data: passRows } = await sb
    .from("quiz_attempt")
    .select("user_id, module_id")
    .eq("passed", true)
    .limit(10000);
  const passed = new Set(
    ((passRows ?? []) as { user_id: string; module_id: string }[]).map(
      (r) => `${r.user_id}|${r.module_id}`
    )
  );

  const { data: cpRows } = await sb
    .from("content_progress")
    .select("user_id, content_id")
    .not("completed_at", "is", null)
    .limit(20000);
  const doneFilm = new Set(
    ((cpRows ?? []) as { user_id: string; content_id: string }[]).map(
      (r) => `${r.user_id}|${r.content_id}`
    )
  );

  let wrote = 0;
  let wouldWrite = 0;
  let asked = 0;
  const perAdvisor: Record<string, string[]> = {};

  for (const { user_id: userId, rooftop_id: rooftopId } of pairs) {
    for (const moduleId of gating) {
      if (have.has(`${userId}|${moduleId}`)) continue;
      const films = filmsByModule.get(moduleId) ?? [];
      if (films.length === 0) continue;                                  // nothing to complete
      if (!films.every((id) => doneFilm.has(`${userId}|${id}`))) continue; // films outstanding
      if (quizzed.has(moduleId) && !passed.has(`${userId}|${moduleId}`)) continue; // quiz waiting
      asked++;
      if (!APPLY) {
        /* Ask the one definition whether it WOULD write, without writing. */
        const { moduleRequirementsMet } = await import("@/lib/lms");
        const req = await moduleRequirementsMet(sb as unknown as Client, userId, moduleId);
        if (req.met) {
          wouldWrite++;
          (perAdvisor[userId] ??= []).push(moduleId);
        }
        continue;
      }
      const r = await completeModuleIfReadyById(
        sb as unknown as Client,
        userId,
        moduleId,
        rooftopId,
        /* NO BONUS. These rows should already have existed; paying sand for a
           backfill would mint currency for work already paid or never done. */
        0
      );
      if (r) {
        wrote++;
        (perAdvisor[userId] ??= []).push(r.moduleId);
      }
    }
  }

  console.log(`${asked} (advisor, module) pair(s) survived the pre-filter and were asked.`);
  for (const [userId, mods] of Object.entries(perAdvisor)) {
    console.log(`  ${userId}: ${mods.length} lesson(s) — ${mods.join(", ")}`);
  }

  /*
   * THE SUMMARY IS COMPUTED FROM WHAT HAPPENED, and the exit code with it. A
   * closing line that prints regardless is decoration; an empty run says so.
   */
  const n = APPLY ? wrote : wouldWrite;
  if (n === 0) {
    console.log(
      "\nNothing to backfill. Every lesson whose requirements are met already has its row."
    );
  } else {
    console.log(`\n${APPLY ? "WROTE" : "WOULD WRITE"} ${n} module_completion row(s).`);
    if (!APPLY) console.log("Re-run with --apply.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
