/* ============================================================================
   EDIAGD — render reports/trim-plan.json as the table Ryan reads

     npm run trim:table                      # -> reports/trim-plan.md
     npm run trim:table -- --out=<path>

   The plan JSON is the record; this is the reading of it. It is a separate
   script so the measure pass has one job, and so the table can be re-rendered
   from a plan without re-measuring 447 films.

   IT COMPUTES NOTHING. Every number here is read out of the plan. The one thing
   it derives is the sort order and the totals, and the totals are summed from
   the rows rather than copied from the summary block — so if the two disagree,
   that disagreement is visible in the output rather than hidden by it.
   ============================================================================ */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PLAN = "reports/trim-plan.json";
const argv = process.argv.slice(2);
const OUT = argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "reports/trim-plan.md";

type Row = {
  id: string;
  title: string;
  collection: string | null;
  placement: string | null;
  assetDuration: number | null;
  durationSec: number | null;
  inOldLedger: boolean;
  head: number | null;
  tail: number | null;
  headMeasuredBy: string;
  tailMeasuredBy: string;
  proposedStart: number | null;
  proposedEnd: number | null;
  notes: string[];
  headHeard: string;
  tailHeard: string;
  error: string | null;
};

if (!existsSync(PLAN)) {
  console.error(`\n  missing ${PLAN} — run npm run trim:measure first\n`);
  process.exit(1);
}
const plan = JSON.parse(readFileSync(PLAN, "utf8")) as {
  summary: Record<string, unknown>;
  rows: Row[];
};
const rows = plan.rows;
const s = plan.summary;

const n = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));
const cut = (r: Row) => r.proposedStart != null || r.proposedEnd != null;
/** What the cut actually removes, which is the number Ryan is deciding about —
 *  not the head and tail measurements, since a side under threshold is kept. */
const removed = (r: Row) => {
  if (r.assetDuration == null) return 0;
  const a = r.proposedStart ?? 0;
  const b = r.proposedEnd ?? r.assetDuration;
  return Math.max(0, r.assetDuration - (b - a));
};

const toCut = rows.filter(cut).sort((a, b) => removed(b) - removed(a));
const ruling = rows.filter(
  (r) =>
    !cut(r) &&
    (r.notes.includes("no-greeting") ||
      r.notes.includes("no-signoff") ||
      r.notes.some((x) => x.startsWith("offset-suspect")) ||
      r.error)
);
const fine = rows.filter((r) => !cut(r) && !ruling.includes(r));

const totalRemoved = toCut.reduce((t, r) => t + removed(r), 0);
const totalDuration = rows.reduce((t, r) => t + (r.assetDuration ?? 0), 0);

const out: string[] = [];
out.push(`# Every film opens on Aloha and closes on Mahalo`);
out.push("");
out.push(
  `*Measured ${String(s.generatedAt).slice(0, 10)} by \`npm run trim:measure\`, read-only, ` +
    `over ${s.scope}. Nothing has been cut.*`
);
out.push("");
out.push(
  `Thresholds: head > ${(s.thresholds as Record<string, number>).headThreshold}s, ` +
    `tail > ${(s.thresholds as Record<string, number>).tailThreshold}s. ` +
    `Pads: ${(s.pads as Record<string, number>).padHead}s before Aloha, ` +
    `${(s.pads as Record<string, number>).padTail}s after Mahalo. ` +
    `Model: \`${s.model}\`.`
);
out.push("");

out.push(`## Counts`);
out.push("");
out.push(`| | films |`);
out.push(`|---|---:|`);
out.push(`| published, measured | ${s.measured} |`);
out.push(`| screened into the word pass | ${s.screenedIntoWordPass} |`);
out.push(`| **to cut, head only** | **${s.flaggedHeadOnly}** |`);
out.push(`| **to cut, tail only** | **${s.flaggedTailOnly}** |`);
out.push(`| **to cut, both ends** | **${s.flaggedBoth}** |`);
out.push(`| **to cut, total** | **${s.toCut}** |`);
out.push(`| fine as they are | ${s.fine} |`);
if (s.pendingWordPass) out.push(`| pending the word pass | ${s.pendingWordPass} |`);
out.push(`| no greeting heard | ${s.noGreeting} |`);
out.push(`| no sign-off heard | ${s.noSignoff} |`);
out.push(`| offset suspect, nothing proposed | ${s.offsetSuspect} |`);
out.push(`| no English text track | ${s.noTextTrack} |`);
out.push(`| errored | ${s.errored} |`);
out.push("");
out.push(
  `Dead air to be removed: **${(totalRemoved / 60).toFixed(1)} minutes** across ` +
    `${toCut.length} films, out of ${(totalDuration / 60).toFixed(0)} minutes of library ` +
    `(${((100 * totalRemoved) / totalDuration).toFixed(1)}%).`
);
out.push("");

out.push(`## The cut, sorted by how much comes off`);
out.push("");
out.push(
  `\`start\` and \`end\` are what \`trim:apply\` passes to ` +
    `\`replace:video --trim-only\`. A dash means that side is **not touched** — ` +
    `which is how a film whose head was already cut by \`trim:slates\` gets its ` +
    `tail cut and its head left alone.`
);
out.push("");
out.push(`| # | head | tail | off | dur | start | end | by | ledger | collection | title |`);
out.push(`|---:|---:|---:|---:|---:|---:|---:|:--|:--|:--|---|`);
toCut.forEach((r, i) => {
  const by = `${r.headMeasuredBy[0]}${r.tailMeasuredBy[0]}`;
  out.push(
    `| ${i + 1} | ${n(r.head)} | ${n(r.tail)} | ${n(removed(r))} | ${n(r.assetDuration)} | ` +
      `${n(r.proposedStart)} | ${n(r.proposedEnd)} | ${by} | ${r.inOldLedger ? "yes" : "—"} | ` +
      `${r.collection ?? "—"} | ${r.title.replace(/\|/g, "\\|")} |`
  );
});
out.push("");

if (ruling.length) {
  out.push(`## For Ryan to rule on — nothing proposed for these`);
  out.push("");
  for (const r of ruling) {
    out.push(`### ${r.title}`);
    out.push("");
    out.push(
      `\`${r.id}\` · ${r.collection ?? "—"} · ${n(r.assetDuration)}s · ` +
        `head ${n(r.head)} · tail ${n(r.tail)} · **${r.notes.join("; ") || r.error}**`
    );
    out.push("");
    if (r.headHeard) out.push(`- opens: *${r.headHeard.slice(0, 300)}*`);
    if (r.tailHeard) out.push(`- closes: *${r.tailHeard.slice(0, 300)}*`);
    if (r.error) out.push(`- error: \`${r.error}\``);
    out.push("");
  }
}

out.push(`## Measured fine, and therefore not in the apply run`);
out.push("");
out.push(`${fine.length} films. Head and tail both inside the thresholds.`);
out.push("");
out.push(`| head | tail | dur | by | collection | title |`);
out.push(`|---:|---:|---:|:--|:--|---|`);
for (const r of fine.sort((a, b) => (b.head ?? 0) + (b.tail ?? 0) - ((a.head ?? 0) + (a.tail ?? 0)))) {
  out.push(
    `| ${n(r.head)} | ${n(r.tail)} | ${n(r.assetDuration)} | ` +
      `${r.headMeasuredBy[0]}${r.tailMeasuredBy[0]} | ${r.collection ?? "—"} | ` +
      `${r.title.replace(/\|/g, "\\|")} |`
  );
}
out.push("");
out.push(
  `*\`by\` reads head-then-tail: \`w\` word-level, \`c\` caption, \`n\` neither. ` +
    `No cut is proposed from a caption measurement alone.*`
);
out.push("");

writeFileSync(OUT, `${out.join("\n")}\n`);
console.log(`\n  wrote ${OUT}`);
console.log(`    ${toCut.length} to cut, ${ruling.length} for a ruling, ${fine.length} fine`);
/* Summed from the rows, not copied from the summary, so a disagreement shows. */
if (toCut.length !== s.toCut) {
  console.error(
    `\n  MISMATCH: ${toCut.length} rows carry a proposal but the summary says ${s.toCut}.\n` +
      `  The plan is internally inconsistent; do not apply it.\n`
  );
  process.exit(1);
}
console.log("");
