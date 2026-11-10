/* ============================================================================
   EDIAGD — which rooftop a record counts against

   Valerie Patterson holds a manager membership AND an advisor one at Beaumont,
   and on 10 November her Team tab said "No videos completed today" on a day she
   had been paid Sand Dollars. `team_videos_completed` filters on
   `content_progress.rooftop_id`, and `completeLibraryItem` was choosing that
   rooftop with an unordered `limit(1)` and no role preference.

   PURE. The rule is a function over a list, so every case is cheap.

     npm run test:rooftop-choice

   ---------------------------------------------------------------------------
   THE DETERMINISM HALF IS THE ONE THAT CANNOT BE TESTED BY INSPECTION
   ---------------------------------------------------------------------------
   `limit(1)` with no ORDER BY is not a choice, it is a coin: Postgres may
   return either row, and nothing requires it to return the same one twice. The
   cases below feed the SAME memberships in several input orders and assert one
   answer, which is the only way to state "two reads agree" as a test.
============================================================================ */

import { chooseRooftop, type RooftopCandidate } from "@/lib/rooftop-choice";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? `\n        ${detail}` : ""}`);
    console.log(`    ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

/* Ids, never names — and two that sort the "wrong" way on purpose, so a test
   that passes only because the preferred rooftop happens to sort first would
   fail here. BEAUMONT sorts AFTER the other store. */
const BEAUMONT = "b0000000-0000-4000-8000-000000000002";
const OTHER = "a0000000-0000-4000-8000-000000000001";

const m = (rooftop_id: string, role: string): RooftopCandidate => ({
  rooftop_id,
  role,
});

/** Every ordering of a list, so "order does not matter" is asserted not hoped. */
function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of permutations(rest)) out.push([xs[i], ...p]);
  }
  return out;
}

function sameForEveryOrder(
  label: string,
  memberships: readonly RooftopCandidate[],
  expected: string | null
) {
  const answers = new Set(
    permutations(memberships).map((p) => chooseRooftop(p) ?? "null")
  );
  ok(
    label,
    answers.size === 1 && [...answers][0] === (expected ?? "null"),
    `answers=${[...answers].join(" | ")}  expected=${expected ?? "null"}`
  );
}

/* ===========================================================================
   1. THE REPORTED CASE
   =========================================================================== */
section("1. A manager who is also an advisor files at the advisor rooftop");

{
  /* Beaumont, both memberships, same rooftop. This is the shape 0166 records
     for both of Beaumont's managers — so the rooftop is the same either way and
     what mattered was that SOMETHING deterministic came back. */
  sameForEveryOrder(
    "advisor + manager at one rooftop → that rooftop, whatever the row order",
    [m(BEAUMONT, "manager"), m(BEAUMONT, "advisor")],
    BEAUMONT
  );
}

{
  /* The harder shape, and the one that corrupts data: the memberships span two
     stores. The advisor membership is the one carrying an op code and a DMS
     book, so it is the rooftop every other number about this person is keyed
     to. Note BEAUMONT sorts second — a stable-order-only rule would answer
     OTHER here, so this case separates "deterministic" from "right". */
  sameForEveryOrder(
    "advisor at Beaumont, manager elsewhere → Beaumont",
    [m(OTHER, "manager"), m(BEAUMONT, "advisor")],
    BEAUMONT
  );
}

/* ===========================================================================
   2. DETERMINISM, WHICH IS THE HALF `limit(1)` NEVER HAD
   =========================================================================== */
section("2. The same memberships always choose the same rooftop");

{
  /* No advisor and no manager — the arm that used to be `memberships[0]`. */
  sameForEveryOrder(
    "two memberships of the same non-preferred role → one stable answer",
    [m(BEAUMONT, "platform_owner"), m(OTHER, "platform_owner")],
    OTHER
  );
}

{
  /* TWO ADVISOR MEMBERSHIPS. A real advisor can work two stores, and the old
     role preference did not make this deterministic — `find` over an unordered
     list is still unordered. */
  sameForEveryOrder(
    "an advisor at two rooftops → one stable answer, not whichever row came back",
    [m(BEAUMONT, "advisor"), m(OTHER, "advisor")],
    OTHER
  );
}

{
  const three = [m(BEAUMONT, "manager"), m(OTHER, "technician"), m("c0000000-0000-4000-8000-000000000003", "manager")];
  sameForEveryOrder(
    "two managers and a technician → the stable manager, every order",
    three,
    BEAUMONT
  );
}

/* ===========================================================================
   3. THE ORDER OF PREFERENCE
   =========================================================================== */
section("3. advisor, then manager, then technician, then stable-first");

{
  ok(
    "advisor beats manager",
    chooseRooftop([m(OTHER, "manager"), m(BEAUMONT, "advisor")]) === BEAUMONT
  );
  ok(
    "advisor beats technician",
    chooseRooftop([m(OTHER, "technician"), m(BEAUMONT, "advisor")]) === BEAUMONT
  );
  ok(
    "manager beats technician",
    chooseRooftop([m(OTHER, "technician"), m(BEAUMONT, "manager")]) === BEAUMONT
  );
  /* THE TECHNICIAN ARM EARNS ITS KEEP HERE. recordGateMetAction, /today and /
     all prefer technician over the fallback today; a helper without this arm
     would silently move their watch gate and their routing on adoption. */
  ok(
    "technician beats an unrelated role",
    chooseRooftop([
      m(OTHER, "platform_owner"),
      m(BEAUMONT, "technician"),
    ]) === BEAUMONT
  );
}

/* ===========================================================================
   4. NOTHING TO CHOOSE FROM
   =========================================================================== */
section("4. No memberships is null, and the caller says what that means");

{
  ok("an empty list is null", chooseRooftop([]) === null);
  ok(
    "a single membership of any role is simply itself",
    chooseRooftop([m(BEAUMONT, "manager")]) === BEAUMONT
  );
  /* NOT A SILENT FALLBACK. Returning null rather than a sentinel is what lets
     completeLibraryItem say "You're not on a rooftop yet" and the daily action
     name its own refusal — two surfaces, two sentences, one rule. */
  ok(
    "and null is returned rather than an empty string, which a row would accept",
    chooseRooftop([]) !== ""
  );
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
