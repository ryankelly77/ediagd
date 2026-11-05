#!/usr/bin/env node
/* ============================================================================
   npm run log:report -- 2026-11

   Total hours for a month, the per-workstream split, and the value at the
   stated rate. Plain Node, no dependencies.

   IT PARSES ROWS, NOT HEADINGS. A row is counted because its DATE falls in the
   month asked for, not because it sits under a `## 2026-11` heading. A row
   filed under the wrong heading would otherwise be counted in a month it does
   not belong to, and the heading is the easier of the two to get wrong.

   RECONSTRUCTED ROWS ARE COUNTED AND SAID SO. They are hours worked. But a
   month that is partly estimated must not report a single confident total
   with nothing to distinguish it, so the split is always shown when both
   kinds are present.
   ============================================================================ */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const RATE = 175;
const LOG = path.join(process.cwd(), "docs", "WORK_LOG.md");
const month = process.argv[2];

if (!month || !/^\d{4}-\d{2}$/.test(month)) {
  console.error("\n  Usage: npm run log:report -- YYYY-MM     e.g. 2026-11\n");
  process.exit(1);
}
if (!existsSync(LOG)) {
  console.error(`\n  No ${path.relative(process.cwd(), LOG)}.\n`);
  process.exit(1);
}

const rows = [];
for (const line of readFileSync(LOG, "utf8").split("\n")) {
  const t = line.trim();
  if (!t.startsWith("|")) continue;
  /* Split on unescaped pipes only: work-log.mjs writes a literal pipe as \\|. */
  const cells = t.slice(1, t.endsWith("|") ? -1 : undefined)
    .split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  if (cells.length < 4) continue;
  const [date, hours, workstream, description] = cells;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;   // skips the header and the rule
  const n = Number(hours);
  if (!Number.isFinite(n)) {
    console.error(`  SKIPPED — unreadable hours on ${date}: ${JSON.stringify(hours)}`);
    continue;
  }
  if (date.slice(0, 7) !== month) continue;
  rows.push({ date, hours: n, workstream, description,
              reconstructed: /\[reconstructed\]/i.test(description) });
}

const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (n) => (Math.round(n * 100) / 100).toString();

console.log(`\n  Work log — ${month}`);
if (!rows.length) {
  console.log(`\n  No entries for ${month}.\n`);
  process.exit(0);
}

const total = rows.reduce((a, r) => a + r.hours, 0);
const days = new Set(rows.map((r) => r.date)).size;
console.log(`  ${rows.length} entr${rows.length === 1 ? "y" : "ies"} across ${days} day${days === 1 ? "" : "s"}\n`);

const byStream = new Map();
for (const r of rows) byStream.set(r.workstream, (byStream.get(r.workstream) ?? 0) + r.hours);
const width = Math.max(...[...byStream.keys()].map((k) => k.length), 10);

console.log("  Workstream".padEnd(width + 4) + "Hours".padStart(8) + "Share".padStart(9) + "Value".padStart(13));
console.log("  " + "-".repeat(width + 2 + 8 + 9 + 13));
for (const [stream, h] of [...byStream].sort((a, b) => b[1] - a[1])) {
  console.log("  " + stream.padEnd(width + 2) +
    hrs(h).padStart(8) + `${((h / total) * 100).toFixed(1)}%`.padStart(9) + money(h * RATE).padStart(13));
}
console.log("  " + "-".repeat(width + 2 + 8 + 9 + 13));
console.log("  " + "TOTAL".padEnd(width + 2) + hrs(total).padStart(8) + "".padStart(9) + money(total * RATE).padStart(13));

const rec = rows.filter((r) => r.reconstructed).reduce((a, r) => a + r.hours, 0);
console.log(`\n  At ${money(RATE)}/hour: ${money(total * RATE)}`);
if (rec > 0) {
  const logged = total - rec;
  console.log(`\n  OF WHICH:`);
  console.log(`    logged as it happened  ${hrs(logged).padStart(6)} h   ${money(logged * RATE)}`);
  console.log(`    [reconstructed]        ${hrs(rec).padStart(6)} h   ${money(rec * RATE)}`);
  if (rec === total) {
    console.log(`\n  EVERY HOUR IN THIS MONTH IS RECONSTRUCTED — an after-the-fact`);
    console.log(`  estimate, not a contemporaneous record. See docs/WORK_LOG.md.`);
  }
}
console.log("");
