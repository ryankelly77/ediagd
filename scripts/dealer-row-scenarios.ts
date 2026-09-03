/* ============================================================================
   EDIAGD — what a Dealer Codes row's button is allowed to do

   Ryan clicked "Rule it…" on two DMS op codes that had no suggested match and
   both were ruled instantly: recorded as "nothing fits", at genesis, across all
   eleven rooftops, with no dialog and nothing chosen. The button was a submit
   inside a form whose text input defaulted to "" and whose placeholder read
   "no match" — so the placeholder became the ruling.

   The rule that was broken is one sentence, which is why it is now one function
   with a test around it:

     A ONE-TAP WRITE IS ONLY LEGITIMATE WHEN THE VALUE SHOWN ON THE ROW IS
     EXACTLY THE VALUE RECORDED.

   A row with nothing shown has nothing to confirm, so its button navigates.

     npm run test:dealer-rows
   ============================================================================ */

import {
  opCodeRowAction,
  subCategoryRowAction,
  type OpCodeRow,
  type SubCategoryRow,
} from "../lib/mapping/dealer-codes";

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
const ok = (label: string, cond: boolean, detail = "") =>
  check(label + (detail ? ` (${detail})` : ""), cond, true);
const section = (t: string) => console.log(`\n${t}`);

const op = (o: Partial<OpCodeRow>): Pick<OpCodeRow, "status" | "canonical" | "suggestion"> => ({
  status: "unruled",
  canonical: null,
  suggestion: null,
  ...o,
});
const sub = (o: Partial<SubCategoryRow>): Pick<SubCategoryRow, "status" | "family"> => ({
  status: "unmapped",
  family: null,
  ...o,
});

/* ---- 1 · The incident ----------------------------------------------------- */
section("1 · An unruled row never writes on click");

/*
 * THE EXACT ROWS. '100' and 'MISC' are Doggett's catch-all buckets: the biggest
 * two by labor, no catalog name close enough for the matcher, so no suggestion.
 * Both were ruled "nothing fits" by a click.
 */
for (const code of ["100", "MISC"]) {
  check(
    `${code}: no suggestion, so the button navigates`,
    opCodeRowAction(op({})).kind,
    "navigate"
  );
}
check(
  "and it is labelled as going somewhere, not as doing something",
  opCodeRowAction(op({})).label,
  "Rule it…"
);
ok(
  "an unruled op-code row carries no value to write",
  !("value" in opCodeRowAction(op({}))),
);
check(
  "an unruled SUB-CATEGORY row navigates too",
  subCategoryRowAction(sub({})).kind,
  "navigate"
);
/* Section 1 was already correct — a Link, not a form. This holds it there. */
ok(
  "no unruled row of either grain can produce a write",
  [
    opCodeRowAction(op({})),
    opCodeRowAction(op({ status: "unruled" })),
    subCategoryRowAction(sub({})),
    subCategoryRowAction(sub({ status: "unmapped", family: null })),
    /* "differs by store" is a disagreement, not a value — also not confirmable */
    subCategoryRowAction(sub({ status: "mixed", family: "Fluids" })),
  ].every((a) => a.kind === "navigate")
);

/* ---- 2 · Where one tap IS legitimate -------------------------------------- */
section("2 · One tap writes only the value already on screen");

const suggested = op({
  suggestion: { code: "OF-008", name: "Oil Filter", score: 1, why: "" },
});
check(
  "a suggested code is confirmable",
  opCodeRowAction(suggested),
  { kind: "write", label: "Confirm", weight: "confirmable", value: "OF-008" }
);
ok(
  "and the value written is exactly the code displayed",
  (opCodeRowAction(suggested) as { value: string }).value === "OF-008"
);
check(
  "an auto-classified sub-category is confirmable with its own family",
  subCategoryRowAction(sub({ status: "auto", family: "Fluids" })),
  { kind: "write", label: "Confirm", weight: "confirmable", value: "Fluids" }
);

/* ---- 3 · Locked, and already decided -------------------------------------- */
section("3 · Locked and decided rows go through the screen");

check(
  "locked turns a confirmable op code into a review",
  opCodeRowAction(suggested, true).kind,
  "navigate"
);
check(
  "locked turns a confirmable sub-category into a review",
  subCategoryRowAction(sub({ status: "auto", family: "Fluids" }), true).kind,
  "navigate"
);
for (const status of ["confirmed", "no_match"] as const) {
  check(
    `an op code already ruled "${status}" navigates`,
    opCodeRowAction(op({ status, canonical: status === "confirmed" ? "OF-008" : null })).kind,
    "navigate"
  );
}
for (const status of ["confirmed", "not_coachable"] as const) {
  check(
    `a sub-category already ruled "${status}" navigates`,
    subCategoryRowAction(sub({ status, family: "Fluids" })).kind,
    "navigate"
  );
}

/* ---- 4 · The invariant, over every combination ---------------------------- */
section("4 · Stated once, over every state a row can be in");

const opStates: OpCodeRow["status"][] = ["unruled", "proposed", "confirmed", "no_match"];
const subStates: SubCategoryRow["status"][] = [
  "unmapped", "auto", "confirmed", "not_coachable", "mixed",
];
let violations = 0;
for (const status of opStates) {
  for (const suggestion of [null, { code: "OF-008", name: "Oil Filter", score: 1, why: "" }]) {
    for (const locked of [false, true]) {
      const row = op({ status, suggestion, canonical: status === "confirmed" ? "OF-008" : null });
      const a = opCodeRowAction(row, locked);
      /* The invariant: a write must carry a non-empty value that the row shows. */
      if (a.kind === "write" && (!a.value || a.value !== row.suggestion?.code)) violations++;
    }
  }
}
for (const status of subStates) {
  for (const family of [null, "Fluids"]) {
    for (const locked of [false, true]) {
      const row = sub({ status, family });
      const a = subCategoryRowAction(row, locked);
      if (a.kind === "write" && (!a.value || a.value !== row.family)) violations++;
    }
  }
}
check("no state produces a write without the value it displays", violations, 0);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
