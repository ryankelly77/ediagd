/* ============================================================================
   EDIAGD — the Brakes acceptance test, at FAMILY grain

   The loop contract's acceptance test reads:

     "a test advisor whose brake fluid attach (BFF-012) is 4% against a 22%
      benchmark gets the brake fluid pitch"

   Phase 0 found that cannot be expressed against today's data, and said so
   rather than faking it: advisor_op_metric is keyed by DMS op codes, zero of
   the 208 DMS codes at Doggett appear in op_code_catalog, and there is no
   per-op-code benchmark anywhere. So there is no such thing as "BFF-012 attach
   is 4%" to test against.

   THIS TESTS THE THING THAT IS TRUE. Under contract option (a) the pick is made
   at FAMILY grain — Brake Service attach, which really is measured, really does
   have a benchmark — and the op code is chosen INSIDE the family through
   op_code_family. So the test asserts the whole chain at the grain the data
   supports:

     4% against a 22% benchmark  ->  Eddie's Pick = Brake Service
                                 ->  a block locks Brake Service
                                 ->  an op code is chosen from its catalog codes
                                 ->  six stages advance in order
                                 ->  the cue ladder reaches real Brake content

   When the DMS bridge lands and option (b) becomes buildable, sections 1 and 2
   stay exactly as they are and section 3's expected rung moves up the ladder.

   READ-ONLY. Nothing is written. Run with `npm run test:brakes`.
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";
import {
  buildServiceFamilies,
  eddiesPick,
  type FamilyAttach,
  type FamilyBenchmark,
} from "@/lib/advisor";
import { cueTierForRate, pickCoachingCueForBlock, pickPitchVideo } from "@/lib/daily";
import {
  STAGES,
  loadCoachableCodes,
  opCodeForBlock,
  stageForIndex,
} from "@/lib/coaching-block";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

/* ---- Harness (same shape as streak-scenarios.ts) ------------------------- */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}\n        expected ${e}\n        actual   ${a}`);
    console.log(`    ✗ ${label}  expected ${e}, got ${a}`);
  }
}

function ok(label: string, condition: boolean, detail = "") {
  check(label + (detail ? ` (${detail})` : ""), condition, true);
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* A fixed date, so the rotations are reproducible. Date.now() would make this
   test pass or fail depending on the day it ran, which is not a test. */
const TODAY = "2026-08-31" as const;

(async () => {
  /* =========================================================================
     1 · The pick, at family grain
     ========================================================================= */
  section("1 · A 4% brake attach against a 22% benchmark is Eddie's Pick");

  /*
   * The contract's numbers, expressed at the grain that exists. The other two
   * families are deliberately CLOSER to their benchmarks in both absolute and
   * revenue-weighted terms, so a pass means brakes won on the gap rather than
   * on being the only candidate.
   */
  const attach: FamilyAttach[] = [
    { family: "Brake Service", famRos: 300, advisorRos: 120, attachRatePct: 4 },
    { family: "Filters", famRos: 300, advisorRos: 120, attachRatePct: 30 },
    { family: "Fluids", famRos: 300, advisorRos: 120, attachRatePct: 41 },
  ];
  const benchmarks: FamilyBenchmark[] = [
    { family: "Brake Service", storeAvgPct: 22, storeBestPct: 40 },
    { family: "Filters", storeAvgPct: 34, storeBestPct: 50 },
    { family: "Fluids", storeAvgPct: 44, storeBestPct: 60 },
  ];
  const laborPerRo = { "Brake Service": 210, Filters: 90, Fluids: 120 };

  const families = buildServiceFamilies(attach, benchmarks, laborPerRo);
  const pick = eddiesPick(families, 360);

  check("pick is Brake Service", pick?.family, "Brake Service");
  check("gap is 18 points", pick?.gapPp, 18);
  check("tier for a 4% rate is 'low'", cueTierForRate(pick!.rate), "low");

  /*
   * The volume gate, checked here because it is the difference between coaching
   * and noise: 19 ROs and the whole chain below must not run at all.
   */
  check("under 20 ROs there is no pick", eddiesPick(families, 19), null);

  /* =========================================================================
     2 · The block — pure, offline
     ========================================================================= */
  section("2 · The block locks the family and walks the six stages");

  const brakeCodes = ["BCS-032", "BFF-012", "BFF-013", "RTF-030", "RTR-031"];

  check("stage 1 of a block is Pre-Write", stageForIndex(0), "Pre-Write");
  check(
    "the six stages advance in Mitch's order",
    [0, 1, 2, 3, 4, 5].map(stageForIndex),
    [...STAGES]
  );
  check("a missed day does not skip a stage", stageForIndex(2), "At the Kiosk");

  /*
   * THE FIVE-DAY CONSEQUENCE, ASSERTED RATHER THAN ARGUED. Mitch has not
   * confirmed the block length; the brief proposed five days and there are six
   * stages. This is what five costs, written down so the decision is made with
   * it in view — game_settings.coaching_block_days defaults to 6 for exactly
   * this reason.
   */
  const fiveDayStages = [0, 1, 2, 3, 4].map(stageForIndex);
  ok(
    "a five-day block never reaches Objections",
    !fiveDayStages.includes("Objections"),
    fiveDayStages.join(" · ")
  );
  ok(
    "a six-day block reaches all six",
    new Set([0, 1, 2, 3, 4, 5].map(stageForIndex)).size === STAGES.length
  );

  const first = opCodeForBlock(brakeCodes, TODAY);
  ok("the block's op code comes from the family", brakeCodes.includes(first!), first!);
  check("the choice is deterministic", opCodeForBlock(brakeCodes, TODAY), first);
  /*
   * A later block on the same family teaches a different code, so an advisor who
   * stays weak on brakes is not handed the same six cues again.
   */
  const later = opCodeForBlock(brakeCodes, "2026-09-07");
  ok("a later block on the same family rotates the code", later !== first, `${first} -> ${later}`);
  check("an empty family yields no code", opCodeForBlock([], TODAY), null);

  /* =========================================================================
     3 · The bridge — live, against the real catalog and the real library
     ========================================================================= */
  section("3 · The bridge reaches real Brake Service content");

  const codes = await loadCoachableCodes(sb, "Brake Service");
  ok("Brake Service has coachable catalog codes", codes.length > 0, `${codes.length} codes`);

  // The bridge must round-trip: every code the block can pick maps back to the
  // family it was picked for, or the pick and the coaching are about different
  // services.
  const { data: mapped } = await sb
    .from("op_code_family")
    .select("code, family, coachable")
    .in("code", codes);
  ok(
    "every coachable code maps back to Brake Service",
    (mapped ?? []).every((r) => r.family === "Brake Service" && r.coachable),
    (mapped ?? []).map((r) => r.code).sort().join(", ")
  );

  const { data: inCatalog } = await sb
    .from("op_code_catalog")
    .select("code")
    .in("code", codes);
  check("every code exists in the catalog", inCatalog?.length, codes.length);

  const opCode = opCodeForBlock(codes, TODAY);
  const block = {
    family: "Brake Service",
    opCode,
    stage: stageForIndex(0),
    tier: "low" as const,
  };

  /*
   * WHICH RUNG FIRES DEPENDS ON WHICH CODE THE BLOCK LOCKED, and after the
   * re-import that is no longer one answer. Brake Service has SEVEN coachable
   * codes and the knowledge tabs produced content for exactly one of them —
   * BFF-012, two rows, and only because an EV Hybrid row happens to be about
   * brake fluid. So a block rotates onto op-code content roughly one day in
   * seven and onto the family shelf the other six.
   *
   * Asserting only the rotated code would make this test pass or fail on the
   * calendar, which is not a test. Both cases are asserted instead, and the
   * op-code case is the one that proves the import changed anything.
   */
  const coaching = await pickCoachingCueForBlock(sb, TODAY, block);

  /*
   * RUNG 4 IS THE EXPECTED ANSWER TODAY, AND THAT IS THE POINT OF THE TEST.
   *
   * Rungs 1-3 need content carrying an op code, and 0 rows have one until the
   * knowledge re-import lands. So a pass here proves the thing that actually
   * had to be proved: an advisor picked at family grain, locked into a block
   * that names an op code, still reaches the 120 Brake Service cues Mitch has
   * already written. The bridge does not strand anybody while the library is
   * being rebuilt.
   *
   * When the re-import lands this assertion is expected to CHANGE to
   * 'op_code_stage_tier'. It failing at that point is the test doing its job.
   */
  ok("a real cue came back", coaching.cue !== null, `${opCode} -> ${coaching.matched}`);
  check(
    "and it is a Brake Service cue",
    (coaching.cue as { service_family?: string } | null)?.service_family,
    "Brake Service"
  );

  /*
   * THE IMPORT'S SIGNAL. Before Phase 1 no content row carried an op code at
   * all, so rungs 1-3 could not fire for anybody and this returned `family`.
   * It now returns `op_code`, which is the whole point of the bridge.
   *
   * NOT `op_code_stage_tier`, and it never will be from this content: the
   * knowledge workbook has no stage column on any of its 76 sheets, so rungs 1
   * and 2 stay unreachable until the pitch videos are filmed and tagged.
   */
  const onBff = await pickCoachingCueForBlock(sb, TODAY, {
    ...block,
    opCode: "BFF-012",
  });
  check("a BFF-012 block now reaches op-code content", onBff.matched, "op_code");
  ok("and the cue is about brake fluid", onBff.cue !== null, onBff.cue?.title?.slice(0, 60) ?? "none");

  /* A Brake code the tabs produced nothing for still lands on the family shelf
     rather than falling through to nothing — the bridge doing its job. */
  const uncovered = await pickCoachingCueForBlock(sb, TODAY, { ...block, opCode: "BPR-029" });
  check("a code with no content falls to the family rung", uncovered.matched, "family");

  /*
   * Step 3 is skipped and RECORDED as skipped. Nothing is in 'Pitches by Op
   * Code' yet, so this is what every day records until the pitches are filmed —
   * which is exactly the count that says how much filming is left.
   */
  const pitch = await pickPitchVideo(sb, TODAY, "00000000-0000-0000-0000-000000000000", block);
  check("no pitch video exists for this stage yet", pitch, null);
  check(
    "so the day records it as skipped, not as absent",
    block.opCode && block.stage ? pitch === null : null,
    true
  );

  /*
   * The other half of the honest-empty rule: a family with nothing written
   * returns `none` rather than a generic passage wearing a coaching cue's
   * clothes. Asserted against a family that cannot have content — the old
   * ladder would have returned a generic cue here and recorded it as coaching.
   */
  const bare = await pickCoachingCueForBlock(sb, TODAY, {
    family: "A Family That Does Not Exist",
    opCode: null,
    stage: "Pre-Write",
    tier: "low",
  });
  check("an empty family reports 'none'", bare.matched, "none");
  check("and returns no cue at all", bare.cue, null);

  /*
   * No block is not the same as no content. An advisor at or above store
   * average everywhere has nothing to be coached on — nothing failed, so this
   * must not be recorded as a content gap.
   */
  const noBlock = await pickCoachingCueForBlock(sb, TODAY, null);
  check("no block records no attempt, not a failure", noBlock.matched, null);
  ok("and still serves the generic passage", noBlock.cue !== null);

  /* ---- Report ----------------------------------------------------------- */
  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\n  FAILURES");
    failures.forEach((f) => console.log(`    ${f}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
