/* ============================================================================
   EDIAGD — the dates that decide which day, and which month

   Two different UTC leaks, both proved here rather than eyeballed, because both
   are invisible until somebody reconciles a figure:

     SERVING   the cue rotation is seeded on a date. /today resolves it through
               rooftop_today(); /advisor used new Date().toISOString(). From
               about 7pm Central the two disagreed about what today is, so the
               two screens named different cues as today's.

     IMPORT    a tab called "Jul 01" carries no year, and the parser took the
               year the import happened to run. A December workbook imported in
               January filed twelve months of revenue into the wrong one.

     npm run test:dates
   ============================================================================ */

import ExcelJS from "exceljs";
import { storeToday } from "../lib/mapping/epoch";
import { epochDay } from "../lib/daily";
import { parseWorkbook } from "../lib/dms/parse";

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

/* ---- 1 · 19:05 Central, the hour the two screens used to disagree -------- */
section("1 · The cue rotation is seeded on the store's date");

/* 19:05 America/Chicago on 1 September 2026 is 00:05 UTC on the 2nd. */
const evening = new Date("2026-09-01T19:05:00-05:00");

check("the store calls it 1 September", storeToday(evening), "2026-09-01");
check(
  "UTC calls it the 2nd — this is the whole bug",
  evening.toISOString().slice(0, 10),
  "2026-09-02"
);

/*
 * rotationIndex() is (epochDay + offset) % count, so a date one day ahead moves
 * every pool by exactly one. With any pool bigger than one that is a different
 * cue, and the advisor sees one on /today and the next one in the pitch dialog.
 */
check(
  "which rotates the pool by exactly one",
  epochDay(evening.toISOString().slice(0, 10)) - epochDay(storeToday(evening)),
  1
);
check(
  "the store's date is the one the rotation should use",
  epochDay(storeToday(evening)),
  epochDay("2026-09-01")
);

/* Midday is unambiguous in both zones — the fix must not move that. */
const midday = new Date("2026-09-01T12:00:00-05:00");
check("midday is the same day either way", storeToday(midday), "2026-09-01");
check(
  "and UTC agrees at midday",
  midday.toISOString().slice(0, 10),
  "2026-09-01"
);

/* ---- 2 · The workbook says which year, or nothing is imported ----------- */
section("2 · A tab named 'Dec 01' takes its year from the file");

/** One Index row pointing at one (empty) daily tab. */
async function workbook(opts: { withIndex: boolean }): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  if (opts.withIndex) {
    const index = wb.addWorksheet("Index");
    // ExcelJS materialises a date cell at UTC midnight; that is the shape a
    // real Index sheet arrives in.
    index.addRow([new Date(Date.UTC(2025, 11, 1)), "Dec 01"]);
  }
  const day = wb.addWorksheet("Dec 01");
  day.addRow(["Dealer", "Advisor", "Sub Category", "Op Code"]);
  day.addRow(["", "", "", "Code"]);
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

async function main() {
  const withIndex = await parseWorkbook(await workbook({ withIndex: true }));
  check(
    "a 2025 index files December 2025, whatever year it is today",
    withIndex.dates,
    ["2025-12-01"]
  );
  check("and the tab is read rather than skipped", withIndex.counts.sheetsRead, 1);

  let refusal: string | null = null;
  try {
    await parseWorkbook(await workbook({ withIndex: false }));
  } catch (e) {
    refusal = (e as Error).message;
  }
  check("no index and no year in the tab name is a refusal", refusal !== null, true);
  check(
    "and the refusal names the tab rather than guessing",
    refusal?.includes("Dec 01") ?? false,
    true
  );
  check(
    "and says nothing was imported",
    refusal?.includes("Nothing was imported") ?? false,
    true
  );

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
  main();
}
