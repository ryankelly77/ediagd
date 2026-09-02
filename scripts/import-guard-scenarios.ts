/* ============================================================================
   EDIAGD — the knowledge importer's "did this row move?" guard

   The importer keys on (source_tab, source_row), which survives the TEXT
   changing — a revision — and does not survive the ROW moving. Insert one row
   at position 50 of a 200-row tab and every key below it shifts: row 50 takes
   the new row's words, 51 takes 50's, and 151 published cues each receive their
   neighbour's text. Nothing errors and the run reports "updated 151".

   The guard has to let a genuine rewrite through and stop a shift. Those pull
   in opposite directions, so the line between them is proved here rather than
   eyeballed.

     npm run test:import-guard
   ============================================================================ */

import {
  looksLikeSameRow,
  countByTab,
  tabsToAbort,
  REFUSALS_PER_TAB_BEFORE_ABORT,
} from "./import-knowledge";

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

/* ---- 1 · A revision must still apply ------------------------------------ */
section("1 · A revision is still the same row");

const original =
  "Your fuel filter has done its job catching debris and contaminants before they reach your injectors.";

check("identical text", looksLikeSameRow(original, original), true);
check(
  "whitespace and case differences",
  looksLikeSameRow(original, "  YOUR FUEL FILTER HAS DONE ITS JOB catching debris\n and contaminants before they reach your injectors. "),
  true
);
check(
  "a stump extended to the full Fact — the repair this importer exists for",
  looksLikeSameRow("Your fuel filter has done its job catch", original),
  true
);
check(
  "a genuine reword that keeps the subject",
  looksLikeSameRow(
    original,
    "The fuel filter has been catching debris and contaminants for you, keeping them away from the injectors — now it is time to replace it."
  ),
  true
);
check(
  "an empty stored body — nothing to compare, so fill it in",
  looksLikeSameRow("", original),
  true
);

/* ---- 2 · A shifted row must not ----------------------------------------- */
section("2 · A row that slid into this position is refused");

const neighbour =
  "Brake fluid absorbs moisture from the air over time, which lowers its boiling point and softens the pedal.";

check("a completely different Fact", looksLikeSameRow(original, neighbour), false);
check("and the same in reverse", looksLikeSameRow(neighbour, original), false);
check(
  "two Facts about different services that share filler words",
  looksLikeSameRow(
    "It is time to replace your cabin air filter with a brand new one built for your vehicle.",
    "Rotating your tires every visit keeps the wear even across all four corners of the car."
  ),
  false
);

/* ---- 3 · One refusal is an edit, several are an insertion --------------- */
section("3 · A tab is dropped whole, or not at all");

const four = [1, 2, 3, 4].map((row) => ({ tab: "Belts", row }));
const five = [1, 2, 3, 4, 5].map((row) => ({ tab: "Belts", row }));

check("the threshold is 5", REFUSALS_PER_TAB_BEFORE_ABORT, 5);
check("four refusals in a tab do not abort it", [...tabsToAbort(countByTab(four))], []);
check("five do", [...tabsToAbort(countByTab(five))], ["Belts"]);
check(
  "and only the tab that shifted",
  [
    ...tabsToAbort(
      countByTab([...five, { tab: "Wipers", row: 9 }, { tab: "Wipers", row: 12 }])
    ),
  ],
  ["Belts"]
);
check(
  "refusals are counted per tab, not in total",
  [
    ...tabsToAbort(
      countByTab([
        ...[1, 2, 3].map((row) => ({ tab: "Belts", row })),
        ...[1, 2, 3].map((row) => ({ tab: "Wipers", row })),
      ])
    ),
  ],
  []
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
