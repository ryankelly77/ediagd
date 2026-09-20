/* ============================================================================
   EDIAGD — the Brakes acceptance test, at FAMILY grain

   The loop contract's acceptance test reads:

     "a test advisor whose brake fluid attach (BFF-012) is 4% against a 22%
      benchmark gets the brake fluid pitch"

   That cannot be expressed against today's data and never could: advisor_op_metric
   is keyed by DMS op codes, zero of the 208 DMS codes at Doggett appear in
   op_code_catalog, and there is no per-op-code benchmark anywhere. So this
   tests the thing that IS true — the pick is made at FAMILY grain, and the op
   code is chosen inside the family through op_code_family.

   ---------------------------------------------------------------------------
   REWRITTEN IN 3D. WHAT WAS REMOVED, AND WHY
   ---------------------------------------------------------------------------
   This suite was red for weeks before anybody looked, and when phase 3d looked
   it turned out to be red for a GOOD reason: 3b retired the three things its
   last section asserted.

     the four-rung cue ladder    pickCoachingCueForBlock. The item slot serves
                                 the craft curriculum in module order now; there
                                 is no family cue ladder and no `cue_match`.
     pitch_video_skipped         the pitch slot no longer looks up by stage, so
                                 there is no "we wanted one and had none" flag.
     the generic passage         the no-block fallback went with the block.

     the six-stage block         0124 retired coaching_block from the loop
                                 entirely: advisor_focus_family owns the family
                                 and consumption order owns the position. The
                                 pure functions still exist in
                                 lib/coaching-block.ts and nothing calls them.

   A red suite that is red for a good reason teaches everyone to ignore red
   suites, so it does not stay as it was. What is KEPT is everything still load
   bearing, and section 2 is re-pointed at the resolution that replaced the
   ladder:

     4% against a 22% benchmark  ->  Eddie's Pick = Brake Service
                                 ->  under the floor, NO pick at all
                                 ->  the op-code bridge reaches real content
                                 ->  the SAME floor gates the loop's derivation

   That last one is new, and it is the bug 3d found: eddiesPick() has always
   floored at min_ros_for_coaching() and derive_focus_family() floored at zero,
   so 42% of measured operators were getting a confident focus family off a
   handful of ROs. The two agreeing is now asserted here rather than assumed.

   READ-ONLY. Nothing is written. Run with `npm run test:brakes`.
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";
import {
  MIN_ROS_FOR_COACHING,
  buildServiceFamilies,
  eddiesPick,
  type FamilyAttach,
  type FamilyBenchmark,
} from "@/lib/advisor";
import { cueTierForRate } from "@/lib/daily";
/* loadCoachableCodes survives the block's retirement: it reads op_code_family,
   which is the bridge, not the block. STAGES, stageForIndex and opCodeForBlock
   are no longer imported — 0124 retired the block from the loop. */
import { loadCoachableCodes } from "@/lib/coaching-block";

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

async function main() {
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
     2 · The floor — the two parts of the product now agree
     ========================================================================= */
  section("2 · Below the floor, neither part of the product coaches");

  /*
   * THE BUG 3D FOUND, ASSERTED SO IT CANNOT COME BACK.
   *
   * eddiesPick() has always returned null below min_ros_for_coaching().
   * derive_focus_family() floored at `advisor_ros > 0` until 0124, so 25 of the
   * 59 operators with rows in Doggett's latest period — 42% — were getting a
   * confident focus family off a handful of ROs, one of them off a single
   * missed RO. A pick derived from one missed RO is indistinguishable on screen
   * from a pick derived from two hundred.
   *
   * This asserts the SQL floor against the TypeScript one by value, so a later
   * ruling that moves the number has to move it in min_ros_for_coaching() and
   * both follow.
   */
  const { data: sqlFloor } = await sb.rpc("min_ros_for_coaching");
  check(
    "the database and lib/advisor agree on the floor",
    Number(sqlFloor),
    MIN_ROS_FOR_COACHING
  );

  check("at the floor there is still a pick", eddiesPick(families, MIN_ROS_FOR_COACHING) !== null, true);
  check("one RO below it there is none", eddiesPick(families, MIN_ROS_FOR_COACHING - 1), null);

  /*
   * THAT THE LOOP'S DERIVATION USES THE SAME FLOOR is asserted where it can be
   * asserted honestly — accept:loop derives for a real below-floor advisor and
   * checks they get no family, then lifts their volume and checks they do.
   * This suite is read-only and has no advisor to derive for, so it proves the
   * half it can: that the two definitions of the NUMBER agree.
   */

  /* =========================================================================
     3 · The bridge — live, against the real catalog and the real library
     ========================================================================= */
  section("3 · The bridge reaches real Brake Service content");

  const codes = await loadCoachableCodes(sb, "Brake Service");
  ok("Brake Service has coachable catalog codes", codes.length > 0, `${codes.length} codes`);

  /*
   * THE BRIDGE IS WHAT SURVIVED. The cue ladder that used to be tested here is
   * gone (see the header), but op_code -> op_code_family -> content is exactly
   * what the pitch slot, the family shelf and the certification catalogue all
   * ride on now — 0125 made it one view, and this is the live check that the
   * view reaches real Brake Service rows.
   */
  const { data: bridged, error: bridgeErr } = await sb
    .from("service_family_content")
    .select("content_id, via")
    .eq("family", "Brake Service");

  /*
   * A MISSING RELATION MUST NOT READ AS AN EMPTY ONE.
   *
   * supabase-js hands back `data: null` with the error in a separate field, so
   * `?? []` turns "this view does not exist" into "zero mappings" — the exact
   * confident-wrong-answer shape this whole phase is about, committed by the
   * suite that is supposed to catch it. Written out the first time this ran
   * against production, where 0125 is not yet applied.
   */
  if (bridgeErr) {
    ok(
      "service_family_content exists",
      false,
      `${bridgeErr.code ?? "error"}: ${bridgeErr.message} — 0125 is probably not applied here`
    );
  }

  const rows = (bridged ?? []) as { content_id: string; via: string }[];
  ok(
    "service_family_content resolves Brake Service",
    rows.length > 0,
    bridgeErr ? "relation absent, see above" : `${rows.length} mappings`
  );
  ok(
    "…by the op-code path, not only the family tag",
    rows.some((r) => r.via === "op_code"),
    "the op-code bridge resolved nothing — films would be invisible again"
  );

  const ids = [...new Set(rows.map((r) => r.content_id))];
  const { data: real } = await sb
    .from("content")
    .select("id, type, mux_playback_id")
    .eq("status", "published")
    .is("retired_at", null)
    .in("id", ids.slice(0, 200));

  const found = (real ?? []) as { id: string; type: string; mux_playback_id: string | null }[];
  ok("and they are real published rows", found.length > 0, `${found.length} rows`);
  ok(
    "including at least one playable film",
    found.some((r) => r.type === "advisor_video" && r.mux_playback_id),
    "Brake Service has 4 films in production; none resolved"
  );

  /* ---- Report ----------------------------------------------------------- */
  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\n  FAILURES");
    failures.forEach((f) => console.log(`    ${f}`));
    process.exit(1);
  }
}

/*
 * NOT ON IMPORT.
 *
 * A bare IIFE runs the moment anything requires this file — which is how a test
 * that only wanted one helper triggered a full production import and truncated
 * 15 cue bodies. Nothing imports this today; the guard is for the person who
 * first wants to.
 */
if (require.main === module) {
  main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
}
