/* ============================================================================
   EDIAGD — the DMS column detector, and the August 2026 failure

     npm run test:dms-columns

   The case that matters is section 3: the exact shape of the file that filed
   11,058 rows under service categories called LOF and Air Filter. It must be
   refused, and the refusal must say which columns disagree — not "an error
   occurred".
============================================================================ */
import {
  advisorShare,
  detectColumns,
  mergeHeaderRows,
  normalizeHeader,
  vocabularyShare,
  type ContentHints,
} from "../lib/dms/columns";
import { collidingRows, guardWorkbook } from "../lib/dms/parse-guards";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

const HINTS: ContentHints = {
  rooftops: [
    "Doggett Ford", "Doggett Honda Med Center", "BMW Of Beaumont",
    "Doggett Toyota of Beaumont", "Volkswagen of Beaumont",
  ],
  opCodes: ["MISC1", "PARTS", "100", "LOF1", "ROT1"],
};

/* A correct file: dealer, advisor, sub category, op code. */
const GOOD_HEADERS = ["Dealer", "Advisor", "Sub Category", "Op Code", "Description", "CP ROs"];
/* Six rows deep, because a content signal is ignored below MIN_SAMPLE — a
   nearly-empty column proves nothing, which is a lesson from a real false
   positive on the August file. */
const GOOD_SAMPLE = [
  ["Doggett Ford", "BMW Of Beaumont", "Doggett Ford", "Doggett Ford", "BMW Of Beaumont", "Doggett Ford"],
  ["Snook, Taylor (700026)", "Williams, Gwendolyn (500242)", "Snook, Taylor (700026)",
   "Morgan, Myah (901891)", "Cahoon, Walter (901954)", "Snook, Taylor (700026)"],
  ["Brake Service", "Tires", "LOF", "Air Filter", "LOF", "Brake Service"],
  ["MISC1", "PARTS", "LOF1", "MISC1", "ROT1", "PARTS"],
  ["CUSTOMER STATES", "PARTS", "OIL", "AIR", "ROTATE", "PARTS"],
  ["3", "1", "7", "2", "4", "1"],
];

section("1. headers are read, not assumed");
check("spelling does not matter", normalizeHeader("Sub Category"), "subcategory");
check("nor punctuation", normalizeHeader("labor_gp_%"), "laborgppct");
check("two header rows merge", mergeHeaderRows(["Op Code", ""], ["Code", "Description"]),
  ["Op Code Code", "Description"]);

section("2. a well-formed file maps cleanly");
{
  const d = detectColumns(GOOD_HEADERS, GOOD_SAMPLE, HINTS);
  check("nothing refused", d.refused, false);
  check("dealer", d.map.dealer, 0);
  check("advisor", d.map.advisor, 1);
  check("sub category", d.map.subCategory, 2);
  check("op code", d.map.opCode, 3);
  /* Header and data agreeing is the strongest state, and it is recorded so a
     later mis-import can be traced to how each column was chosen. */
  check("dealer confirmed by BOTH signals", d.how.dealer, "header+content");
  check("op code confirmed by both", d.how.opCode, "header+content");
}

section("3. THE AUGUST 2026 FILE — dealer and sub-category swapped");
{
  /* Headers unchanged, data swapped: exactly what arrived. Position 1 holds
     service categories, position 3 holds dealerships. */
  const sample = [
    ["Other Repairs", "Parts", "LOF", "Air Filter", "Tires", "Brake Service"],
    ["Snook, Taylor (700026)", "Williams, Gwendolyn (500242)", "Snook, Taylor (700026)",
     "Morgan, Myah (901891)", "Cahoon, Walter (901954)", "Snook, Taylor (700026)"],
    ["BMW Of Beaumont", "Doggett Ford", "Doggett Honda Med Center", "Doggett Ford",
     "BMW Of Beaumont", "Doggett Ford South Loop"],
    ["100", "PARTS", "LOF1", "MISC1", "ROT1", "PARTS"],
    ["CUSTOMER STATES", "PARTS", "OIL", "AIR", "ROTATE", "PARTS"],
    ["3", "1", "7", "2", "4", "1"],
  ];
  const d = detectColumns(GOOD_HEADERS, sample, HINTS);
  check("REFUSED", d.refused, true);
  check("and it names the conflict", d.problems.length > 0, true);
  const msg = d.problems.join(" ");
  check("naming the column the header claims", msg.includes("Column 1"), true);
  check("and the column that really holds rooftop names", msg.includes("column 3"), true);
  check("in words an admin can forward to the vendor",
    msg.includes("not in the order this file's header claims"), true);
}

section("3b. the columns the vendor renamed between exports");
{
  /* Dynatron renamed "% Of Total (1)" to "Sales %" somewhere between the May
     2025 and September 2026 exports. Same column, same position, same values.
     Nothing refused and nothing lost — but it reached us as an UNMAPPED
     warning first, which is the only reason anybody noticed. A column that
     imports as null reads downstream as a store that sold nothing. */
  const headers = ["Dealer", "Advisor", "Sub Category", "Op Code Code", "Op Code Description",
    "CP ROs", "Sales %", "FRHs", "FRHs/RO", "Labor Sales", "Lbr $/RO", "Lbr GP%",
    "Tot $/RO", "ELR", "Num of ROs", "Lbr GP", "Pts GP", "GP", "GP%"];
  const sample = headers.map((_, i) =>
    i === 0 ? GOOD_SAMPLE[0] : i === 1 ? GOOD_SAMPLE[1] : i === 2 ? GOOD_SAMPLE[2]
    : i === 3 ? GOOD_SAMPLE[3] : ["1", "2", "3", "4", "5", "6"]);
  const d = detectColumns(headers, sample, HINTS);
  check("the renamed column is found", d.map.pctOfTotal, 6);
  check("and nothing else went unmapped in its place", d.unmapped.includes("pctOfTotal"), false);
  check("not refused", d.refused, false);
}

section("4. a header nobody has seen before still resolves");
{
  /* The vendor renames the columns. The data is still recognisable, so the
     import proceeds rather than failing on vocabulary. */
  const headers = ["Store Location", "Service Writer", "Work Category", "Operation", "Notes", "Count"];
  const d = detectColumns(headers, GOOD_SAMPLE, HINTS);
  check("not refused", d.refused, false);
  check("dealer found", d.map.dealer, 0);
  check("advisor found", d.map.advisor, 1);
  check("op code found", d.map.opCode, 3);
}

section("5. an unreadable file refuses and shows its headers");
{
  const d = detectColumns(["A", "B", "C"], [["x"], ["y"], ["z"]], HINTS);
  check("refused", d.refused, true);
  check("listing what it saw", d.problems.some((p) => p.includes("Headers in this file")), true);
}

section("6. the content signals themselves");
const SIX_ROOFTOPS = ["Doggett Ford", "BMW Of Beaumont", "Doggett Ford", "Doggett Ford",
  "BMW Of Beaumont", "Volkswagen of Beaumont"];
const SIX_ADVISORS = ["Snook, Taylor (700026)", "Williams, Gwendolyn (500242)",
  "Morgan, Myah (901891)", "Cahoon, Walter (901954)", "Snook, Taylor (700026)", "Morgan, Myah (901891)"];
check("a column of rooftops scores high", vocabularyShare(SIX_ROOFTOPS, HINTS.rooftops), 1);
check("a column of categories scores zero",
  vocabularyShare(["LOF", "Air Filter", "Tires", "Brakes", "HVAC", "Wipers"], HINTS.rooftops), 0);
check("advisor cells are recognised by their id", advisorShare(SIX_ADVISORS), 1);
check("a category is not an advisor",
  advisorShare(["Brake Service", "Tires", "LOF", "HVAC", "Wipers", "Filters"]), 0);

/* THE FALSE POSITIVE THAT REFUSED A GOOD AUGUST TAB: a column with two cells,
   one of which happened to read "100", outscored the real Op Code column. */
check("a nearly-empty column is not evidence of anything",
  vocabularyShare(["100", "125.2"], HINTS.opCodes), 0);
check("nor is a two-cell advisor lookalike", advisorShare(["Snook, Taylor (700026)"]), 0);

section("7. the backstop — a file that cannot be committed is never staged");
{
  /* Even with the columns mapped correctly, a file can still be uncommittable.
     This is the cheap invariant: two rows landing on the live primary key. */
  const rows = [
    { reportDate: "2026-08-28", dealerName: "Doggett Ford", advisorOpId: "50", subCategory: "LOF", opCode: "MISC1" },
    { reportDate: "2026-08-28", dealerName: "Doggett Ford", advisorOpId: "50", subCategory: "LOF", opCode: "MISC1" },
    { reportDate: "2026-08-28", dealerName: "Doggett Ford", advisorOpId: "51", subCategory: "LOF", opCode: "MISC1" },
  ];
  const c = collidingRows(rows);
  check("the duplicate pair is found", c.groups, 1);
  check("and both rows counted", c.rows, 2);

  const g = guardWorkbook(rows, ["Doggett Ford"]);
  check("the file is refused before staging", g.refused, true);
  check("naming the primary key it would break",
    g.findings.some((f) => f.code === "collides" && f.message.includes("primary key")), true);
}

section("8. a clean file passes the backstop untouched");
{
  const rows = [
    { reportDate: "2026-08-28", dealerName: "Doggett Ford", advisorOpId: "50", subCategory: "LOF", opCode: "MISC1" },
    { reportDate: "2026-08-28", dealerName: "Doggett Ford", advisorOpId: "50", subCategory: "Tires", opCode: "ROT1" },
  ];
  const g = guardWorkbook(rows, ["Doggett Ford"]);
  check("nothing refused", g.refused, false);
  check("and nothing to say", g.findings.length, 0);
}

section("9. a brand-new customer is never blocked by the newcomer warning");
{
  /* Their first import matches no rooftop at all — correct, and it must not
     look like the August failure. */
  const rows = Array.from({ length: 8 }, (_, i) => ({
    reportDate: "2026-08-28", dealerName: `New Store ${i}`, advisorOpId: `${i}`,
    subCategory: "LOF", opCode: "MISC1",
  }));
  const g = guardWorkbook(rows, []);
  check("no findings at all when we know no rooftops yet", g.findings.length, 0);

  /* But a flood arriving at an established customer is worth a look. */
  const g2 = guardWorkbook(rows, ["Doggett Ford", "BMW Of Beaumont"]);
  check("warned once rooftops exist", g2.findings.some((f) => f.code === "newcomers"), true);
  check("warned, not refused", g2.refused, false);
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) for (const f of failures) console.log("  ✗ " + f);
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
