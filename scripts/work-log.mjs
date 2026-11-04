#!/usr/bin/env node
/* ============================================================================
   npm run log — append one row to docs/WORK_LOG.md, interactively.

   PLAIN NODE, NO DEPENDENCIES. readline from the standard library and nothing
   else, so this keeps working whatever happens to the dependency tree.

   IT ONLY RUNS WHEN YOU RUN IT. There is no hook and no automation behind this
   file by design: the log is a claim about somebody's time, so every row is
   typed. If you ever find yourself wanting to call this from a commit hook,
   that is the moment to re-read the top of docs/WORK_LOG.md.

   The month heading is created on first use of a new month, so the table stays
   grouped and `log:report` has something to key on.
   ============================================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import path from "node:path";

const LOG = path.join(process.cwd(), "docs", "WORK_LOG.md");
const HEADER = "| Date | Hours | Workstream | Description |";
const RULE = "|---|---|---|---|";

if (!existsSync(LOG)) {
  console.error(`\n  No ${path.relative(process.cwd(), LOG)} — create it first.\n`);
  process.exit(1);
}

/* Local date, never toISOString(): that is UTC, and after ~5pm here it would
   stamp tomorrow onto today's work. */
const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

/* A LINE ITERATOR, NOT readline/promises.question().
   question() leaves an unsettled top-level await the moment stdin is a pipe
   rather than a terminal: the first prompt resolves, the second never does,
   and the script exits having written nothing while looking like it worked.
   Iterating lines behaves the same on a terminal and on a pipe, which also
   makes this testable without a human at the keyboard. */
const rl = createInterface({ input: stdin });
const lines = rl[Symbol.asyncIterator]();

async function ask(question, validate) {
  for (;;) {
    stdout.write(question);
    const { value, done } = await lines.next();
    if (done) {
      stdout.write("\n");
      console.error("  Input ended before the row was complete — nothing was written.");
      process.exit(1);
    }
    const raw = String(value).trim();
    const problem = validate(raw);
    if (!problem) return raw;
    console.log(`  ${problem}`);
  }
}

try {
  console.log(`\n  Work log — ${today}\n`);

  const hours = await ask("  Hours worked:   ", (v) => {
    if (!v) return "Enter a number of hours.";
    const n = Number(v);
    if (!Number.isFinite(n)) return "That is not a number.";
    if (n <= 0) return "Hours must be greater than zero.";
    /* A guard, not a rule: 16 is already a very long day, and the usual cause
       of a number above it is a typo (80 for 8.0). It can be overridden. */
    if (n > 16) return `${n} hours in one day — retype it if that is right.`;
    return null;
  });

  const workstream = await ask("  Workstream:     ", (v) =>
    v ? null : "Enter a workstream, e.g. Trim Pipeline."
  );

  const description = await ask("  What you did:   ", (v) =>
    v ? null : "One line on what the time went to."
  );

  /* Pipes would break the table; the cell is escaped rather than refused. */
  const clean = (s) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const row = `| ${today} | ${Number(hours)} | ${clean(workstream)} | ${clean(description)} |`;

  const month = today.slice(0, 7);
  let text = readFileSync(LOG, "utf8");

  if (text.includes(`\n## ${month}\n`)) {
    /* Append after the LAST row of that month's table. Finding the end of the
       section rather than the end of the file keeps months in order even when
       an older month is written to later. */
    const start = text.indexOf(`\n## ${month}\n`);
    const nextHeading = text.indexOf("\n## ", start + 1);
    const end = nextHeading === -1 ? text.length : nextHeading;
    const section = text.slice(start, end);
    const trimmed = section.replace(/\s*$/, "");
    text = text.slice(0, start) + trimmed + "\n" + row + "\n" + text.slice(end);
  } else {
    text = text.replace(/\s*$/, "") + `\n\n## ${month}\n\n${HEADER}\n${RULE}\n${row}\n`;
  }

  writeFileSync(LOG, text);
  console.log(`\n  Added to ${path.relative(process.cwd(), LOG)}:`);
  console.log(`  ${row}\n`);
} finally {
  rl.close();
}
