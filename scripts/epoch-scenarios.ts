/* ============================================================================
   EDIAGD — measurement-epoch scenarios

   Offline. The Correction/Change arithmetic decides which months keep their
   numbers and which recompute, and an off-by-one month there is invisible until
   somebody reconciles a figure with the dealership. So it is proved here rather
   than eyeballed in a form.

     npm run test:epoch
   ============================================================================ */

import {
  GENESIS,
  describeEdit,
  effectiveFromFor,
  firstAffectedMonth,
  monthLabel,
  storeToday,
} from "../lib/mapping/epoch";

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
const section = (t: string) => console.log(`\n${t}`);

/* ---- 1 · The brief's own example --------------------------------------- */
section("1 · A change dated 15 September starts with October");

check("15 Sept lands on the October period", firstAffectedMonth("2026-09-15"), "2026-10-01");
check("and it reads as October 2026", monthLabel(firstAffectedMonth("2026-09-15")), "October 2026");
check(
  "the sentence names both sides",
  describeEdit("change", "2026-09-15", 220),
  "Takes effect with the October 2026 period. September 2026 and earlier keep the current mapping."
);

/* ---- 2 · The boundary that decides a whole month ------------------------ */
section("2 · The first of the month is already under the new rule");

/*
 * A period is measured under the rules in force on its FIRST day, so a rule
 * effective ON the 1st governs that month. Effective on the 2nd does not — the
 * month had already started. This is the single comparison that decides whether
 * a month keeps its numbers, and it is one character of difference in SQL.
 */
check("the 1st governs its own month", firstAffectedMonth("2026-10-01"), "2026-10-01");
check("the 2nd does not", firstAffectedMonth("2026-10-02"), "2026-11-01");
check("the last day of a month rolls forward", firstAffectedMonth("2026-10-31"), "2026-11-01");

/* ---- 3 · Year boundaries ------------------------------------------------ */
section("3 · December rolls into the next year");

check("mid-December -> January", firstAffectedMonth("2026-12-15"), "2027-01-01");
check("1 December -> December", firstAffectedMonth("2026-12-01"), "2026-12-01");
check("31 December -> January", firstAffectedMonth("2026-12-31"), "2027-01-01");
check(
  "and the sentence crosses the year correctly",
  describeEdit("change", "2026-12-15", 5),
  "Takes effect with the January 2027 period. December 2026 and earlier keep the current mapping."
);

/* ---- 4 · Correction reaches back to the beginning ----------------------- */
section("4 · A correction is not a dated change");

check("a correction is always genesis", effectiveFromFor("correction"), GENESIS);
check("even when a date is supplied", effectiveFromFor("correction", "2026-09-15"), GENESIS);
check("genesis is before any data", GENESIS < "2025-01-01", true);
check(
  "and it says every period recomputes",
  describeEdit("correction", GENESIS, 220),
  "Every period recomputes — 220 periods are affected."
);
check(
  "singular when there is one",
  describeEdit("correction", GENESIS, 1),
  "Every period recomputes — 1 period is affected."
);

/* ---- 5 · A change takes the date it is given, or today ------------------ */
section("5 · A change defaults to today, store-local");

check("an explicit date is kept", effectiveFromFor("change", "2026-09-15"), "2026-09-15");
check("a blank date falls back to today", effectiveFromFor("change", ""), storeToday());
check("so does a malformed one", effectiveFromFor("change", "next tuesday"), storeToday());
check("and a null", effectiveFromFor("change", null), storeToday());

/*
 * THE UTC TRAP, PINNED. Every op_code_family row carries 2026-09-01 because the
 * seed ran at 20:31 Central on 31 August and `default current_date` is UTC. An
 * effective date a day ahead of the ruling puts an epoch boundary in the middle
 * of a month that has already been measured.
 */
const lateEvening = new Date("2026-08-31T20:31:00-05:00");
check("20:31 Central on 31 Aug is still 31 Aug", storeToday(lateEvening), "2026-08-31");
check(
  "which UTC would have called the 1st",
  lateEvening.toISOString().slice(0, 10),
  "2026-09-01"
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
