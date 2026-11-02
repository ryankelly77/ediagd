/* ============================================================================
   EDIAGD — the cut-point handover, proved

   `replace:video` no longer trims, so a film that needs cutting leaves that
   script live with its slate on. The one thing standing between that and a
   forgotten film is the notice it prints at the end — and that notice fires
   only after a real 4K upload, a sync pass, a swap and a vertical derive, which
   is to say: never, in a test.

   So the words are pure (lib/video/cut-point-notice.ts) and this proves all
   four cases, including against the REAL reports/trim-plan.json rather than a
   fixture of its shape. A plan whose field names drifted would pass a fixture
   test and say nothing useful on the day it mattered.

   Run with `npm run test:cut-point`.
   ============================================================================ */

import { existsSync, readFileSync } from "node:fs";
import { cutPointNotice, type PlanCutRow } from "@/lib/video/cut-point-notice";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass++;
    console.log(`    ✓ ${name}`);
  } else {
    fail++;
    console.log(`    ✗ ${name}\n        got  ${a}\n        want ${b}`);
  }
}

function section(t: string) {
  console.log(`\n${t}`);
}

/* ---- 1 · the four cases, on rows written here ---------------------------- */
section("1 · every case says something");

const ROWS: PlanCutRow[] = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", title: "A head cut", proposedStart: 4.26, proposedEnd: null, confident: true },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", title: "Both ends", proposedStart: 10.6, proposedEnd: 152.32, confident: true },
  { id: "aaaaaaaa-0000-4000-8000-000000000003", title: "Measured but nothing proposed", proposedStart: null, proposedEnd: null },
  { id: "aaaaaaaa-0000-4000-8000-000000000004", title: "Not confident", proposedStart: 3.1, proposedEnd: null, confident: false },
];

check("a proposed cut reports `cut`", cutPointNotice(ROWS, ROWS[0].id).kind, "cut");
check("a row with nothing proposed reports `no-cut`", cutPointNotice(ROWS, ROWS[2].id).kind, "no-cut");
check("a film absent from the plan reports `no-row`", cutPointNotice(ROWS, "aaaaaaaa-0000-4000-8000-00000000ffff").kind, "no-row");
check("no plan file at all reports `no-plan`", cutPointNotice(null, ROWS[0].id).kind, "no-plan");

/* NONE OF THEM IS SILENT. That is the property, not an aesthetic: a run that
   ends "Done." over a film the plan says to cut is a silence exactly where the
   handover is. */
for (const rows of [ROWS, null] as (PlanCutRow[] | null)[]) {
  for (const id of [ROWS[0].id, ROWS[2].id, "aaaaaaaa-0000-4000-8000-00000000ffff"]) {
    const n = cutPointNotice(rows, id);
    check(
      `${n.kind} prints at least one line`,
      n.lines.length > 0 && n.lines.every((l) => typeof l === "string"),
      true
    );
  }
}

/* ---- 2 · the command it hands over to ------------------------------------ */
section("2 · the handover names the command, with this film's id");

const cut = cutPointNotice(ROWS, ROWS[1].id);
check(
  "the report command carries the content id",
  cut.lines.some((l) => l.includes(`npm run trim:apply -- --only=${ROWS[1].id}`)),
  true
);
check(
  "the cut command carries --apply and the content id",
  cut.lines.some((l) => l.includes(`--apply --only=${ROWS[1].id}`)),
  true
);
check(
  "the proposed window is printed",
  cut.lines.some((l) => l.includes("10.6s -> 152.32s")),
  true
);
check(
  "a head-only cut says `end` rather than null",
  cutPointNotice(ROWS, ROWS[0].id).lines.some((l) => l.includes("4.26s -> end")),
  true
);
check(
  "the plan's own `confident: false` is surfaced, not smoothed over",
  cutPointNotice(ROWS, ROWS[3].id).lines.some((l) => l.includes("NOT confident")),
  true
);
check(
  "and a confident row does not carry that warning",
  cutPointNotice(ROWS, ROWS[0].id).lines.some((l) => l.includes("NOT confident")),
  false
);
check(
  "no-row still points at the measurer rather than stopping at a shrug",
  cutPointNotice(ROWS, "aaaaaaaa-0000-4000-8000-00000000ffff").lines.some((l) => l.includes("trim:measure")),
  true
);

/* ---- 3 · against the REAL plan, not a fixture of its shape --------------- */
section("3 · against the real reports/trim-plan.json");

const PLAN = "reports/trim-plan.json";
if (!existsSync(PLAN)) {
  console.log(`    — ${PLAN} is not in this checkout; the shape assertions are skipped.`);
  console.log(`      THIS IS REPORTED, NOT PASSED: a fixture-only run cannot tell you the`);
  console.log(`      plan's field names still match what the notice reads.`);
  fail++;
} else {
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as { rows?: PlanCutRow[] };
  const rows = plan.rows ?? [];
  console.log(`    ${PLAN}: ${rows.length} rows`);

  /* THE FIELD NAMES ARE THE POINT. If `proposedStart` were renamed, every
     assertion above would still pass against the fixture and this notice would
     silently report "no cut point" for every film in the plan. */
  const withACut = rows.filter((r) => r.proposedStart != null || r.proposedEnd != null);
  check(
    "the real plan has rows the notice reads as a cut",
    withACut.length > 0,
    true
  );
  check(
    "and every one of them reports `cut`",
    withACut.every((r) => cutPointNotice(rows, r.id).kind === "cut"),
    true
  );
  const withoutACut = rows.filter((r) => r.proposedStart == null && r.proposedEnd == null);
  check(
    "a real row proposing nothing reports `no-cut`",
    withoutACut.length === 0 || cutPointNotice(rows, withoutACut[0].id).kind === "no-cut",
    true
  );
  check(
    "a uuid that is not in the real plan reports `no-row`",
    cutPointNotice(rows, "00000000-0000-4000-8000-000000000000").kind,
    "no-row"
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
