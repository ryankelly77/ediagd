/* ============================================================================
   EDIAGD — the Rollcall post, rendered from fixtures and read line by line

   `npm run accept:rollcall` proves the DATABASE half: who may read app_event,
   what the constraints refuse, and that loadRollcall and loadRollcallChanges
   report what actually happened. It needs a local Supabase, and it writes.

   This file proves the POST. buildRollcallMessage is pure — a Rollcall in, a
   string out — so the one thing that genuinely cannot be checked by reading the
   code is whether the characters land in the right columns, and that is exactly
   what Ryan reads every evening. No database, no network, runs in a second.

   ---------------------------------------------------------------------------
   WHAT IS PROVED
   ---------------------------------------------------------------------------
     1  THE 6 NOVEMBER BEAUMONT SHAPE: eight advisors, fifteen lines, the
        roster in the order the rules specify, and the three sentences at the
        top saying who did their morning and who did not.
     2  the meter rounds from the fraction and prints ten cells
     3  the earned column is blank at zero and keeps its width, so the mornings
        column sits on one offset down the whole block
     4  nobody missed reads as "Everybody did their morning today."
     5  THE MISSED ARE NAMED IN THE ROSTER'S OWN ORDER. Found by running the
        real store through `npm run preview:rollcall` on 8 November: line 2
        listed seven people in the loader's order while the block below had the
        same seven in another, so one set of people read as two.
     6  a day with no store calendar says so and marks nobody as having done it
     7  a refused APNs delivery NAMES the advisor
     8  the first post says movement starts tomorrow instead of implying
        nobody did anything
     9  the cap is loud

   The one claim this file deliberately cannot make is about the numbers: every
   figure below is a fixture. `accept:rollcall` is where they come from a
   database, and `npm run preview:rollcall` is where they come from the real
   store — read-only, and it is what caught case 5.

     npm run test:rollcall-message
   ============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";
import type { Rollcall, RollcallChange, RollcallRow } from "@/lib/rollcall";
import { buildRollcallMessage } from "@/lib/rollcall-message";

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

/* ---------------------------------------------------------------------------
   FIXTURES

   One builder with defaults, so a case says only what it is ABOUT. A test that
   restated thirty fields per row would hide its own subject.
--------------------------------------------------------------------------- */

const TODAY = "2026-11-06" as IsoDate;

function advisor(over: {
  name: string;
  mornings?: number;
  lastOn?: IsoDate | null;
  firstOn?: IsoDate | null;
  done?: number;
  total?: number;
  earned?: string[];
  lastWorkedOn?: IsoDate | null;
  tracksOpened?: number;
  firstLoginOn?: IsoDate | null;
  scheduleSetOn?: IsoDate | null;
  lessonsInLoop?: number;
  apnsReason?: string | null;
}): RollcallRow {
  const mornings = over.mornings ?? 0;
  const zero = { count: 0, lastOn: null };
  return {
    userId: `user-${over.name.toLowerCase().replace(/\W+/g, "-")}`,
    rooftopId: "roof-beaumont",
    rooftopName: "Doggett Ford of Beaumont",
    name: over.name,
    invitedOn: "2026-10-09" as IsoDate,
    firstLoginOn: over.firstLoginOn === undefined ? ("2026-10-09" as IsoDate) : over.firstLoginOn,
    scheduleSetOn:
      over.scheduleSetOn === undefined ? ("2026-10-09" as IsoDate) : over.scheduleSetOn,
    scheduleLine: "Mon–Fri",
    workDays: 5,
    operatorLinked: true,
    firstCompletionOn: over.firstOn ?? (mornings > 0 ? ("2026-10-10" as IsoDate) : null),
    completionCount: mornings,
    lastCompletionOn: over.lastOn === undefined ? (mornings > 0 ? TODAY : null) : over.lastOn,
    ready: true,
    flags: [],
    firstNativeSignInOn: null,
    firstNativePlatform: null,
    platforms: [],
    certsOpened: zero,
    tracksOpened: { count: over.tracksOpened ?? 1, lastOn: TODAY },
    trackNames: [],
    libraryOpened: zero,
    lessonsOpened: zero,
    lessonsOutsideLoop: zero,
    lessonsInLoop: { count: over.lessonsInLoop ?? 0, lastOn: null },
    lessonsUnattributed: zero,
    storiesSubmitted: zero,
    reach: null,
    lastPush:
      over.apnsReason === undefined
        ? null
        : {
            kind: "streak_saver",
            storeDate: TODAY,
            attemptedAt: "2026-11-06T22:00:00.000Z",
            deliveredOk: false,
            apnsReason: over.apnsReason,
            returnGapMinutes: null,
            returnSource: null,
            returned: false,
          },
    certs: {
      gatingDone: over.done ?? 0,
      gatingTotal: over.total ?? 100,
      earned: over.earned ?? [],
      lastWorkedOn:
        over.lastWorkedOn === undefined
          ? (over.done ?? 0) > 0
            ? ("2026-11-05" as IsoDate)
            : null
          : over.lastWorkedOn,
    },
  };
}

function rollcall(rows: RollcallRow[], over: Partial<Rollcall> = {}): Rollcall {
  const gatingTotal = rows[0]?.certs.gatingTotal ?? 0;
  return {
    rows,
    ready: rows.length,
    total: rows.length,
    rosterSeats: rows.length,
    rosterRooftops: 1,
    closureCalendars: [],
    nativeInstalled: 0,
    onboarded: rows.filter((r) => r.scheduleSetOn !== null).length,
    completedToday: rows.filter((r) => r.lastCompletionOn === TODAY).length,
    rooftops: [{ id: "roof-beaumont", name: "Doggett Ford of Beaumont", accounts: rows.length }],
    rooftopId: "roof-beaumont",
    today: TODAY,
    recordingSince: "2026-10-09" as IsoDate,
    pushes: {
      sent: 0,
      delivered: 0,
      returned: 0,
      failedDeliveries: 0,
      rate: null,
      days: 30,
      firstOn: null,
      lastOn: null,
    },
    pushesToday: {
      sent: 0,
      delivered: 0,
      returned: 0,
      failedDeliveries: 0,
      rate: null,
      days: 1,
      firstOn: null,
      lastOn: null,
    },
    unreachable: rows.length,
    coreTracks: 9,
    teamGatingDone: rows.reduce((n, r) => n + r.certs.gatingDone, 0),
    teamGatingTotal: gatingTotal * rows.length,
    teamEarned: rows.reduce((n, r) => n + r.certs.earned.length, 0),
    ...over,
  };
}

const NOW = new Date("2026-11-06T22:30:00.000Z");
const SINCE = new Date("2026-11-05T22:30:00.000Z");

function build(
  roll: Rollcall,
  changes: Map<string, RollcallChange> = new Map(),
  since: Date | null = SINCE
) {
  return buildRollcallMessage({
    rollcall: roll,
    rooftopName: "Doggett Ford of Beaumont",
    timezone: "America/Chicago",
    now: NOW,
    since,
    changes,
  });
}

const change = (over: Partial<RollcallChange>): RollcallChange => ({
  lessons: 0,
  earned: [],
  story: false,
  firstMorning: false,
  onboarded: false,
  installedApp: false,
  ...over,
});

/**
 * The lines that are CONTENT.
 *
 * The two ``` fences are delimiters that tell Slack to use a monospaced font,
 * not lines of the post — so a line count that included them would be counting
 * the frame as part of the picture. Dropped here and nowhere else, so a case
 * that cares about the fences can still look for them.
 */
const content = (text: string) => text.split("\n").filter((l) => l !== "```");

/* ======================================================================
   1. THE 6 NOVEMBER BEAUMONT POST
   ====================================================================== */
section("1. The 6 November Beaumont shape");

/*
 * The names and the morning counts are the real 6 November figures. The cert
 * numbers are a fixture over a round denominator of 100 — the real denominator
 * is a property of the catalogue on the day, and what is under test here is the
 * rendering, not the catalogue.
 */
const BEAUMONT = [
  advisor({ name: "Valerie Patterson", mornings: 19, done: 82, earned: ["Walk Around", "CSI"] }),
  advisor({ name: "Austin Abate", mornings: 17, done: 46 }),
  advisor({ name: "Heather Sztaba", mornings: 14, done: 15 }),
  advisor({ name: "Konner Upshaw", mornings: 13, done: 9, lessonsInLoop: 20 }),
  advisor({ name: "Destiny Booker", mornings: 9, done: 8 }),
  advisor({ name: "Amanda Tiner", mornings: 5, done: 5, lastWorkedOn: "2026-10-27" as IsoDate }),
  advisor({ name: "Matthew Reck", mornings: 15, done: 0, tracksOpened: 0 }),
  advisor({
    name: "Test Advisor",
    mornings: 0,
    firstLoginOn: null,
    scheduleSetOn: null,
    done: 0,
    tracksOpened: 0,
  }),
];

const beaumontChanges = new Map<string, RollcallChange>([
  [BEAUMONT[0].userId, change({ lessons: 3, earned: ["Walk Around"] })],
  [BEAUMONT[1].userId, change({ lessons: 2, story: true })],
]);

const post = build(
  rollcall(BEAUMONT, { rosterSeats: BEAUMONT.length + 6 }),
  beaumontChanges
);
const postLines = content(post.text);

console.log("\n  ---- the post, as it would appear ----\n");
console.log(
  post.text
    .split("\n")
    .map((l) => `  | ${l}`)
    .join("\n")
);
console.log("");

ok(
  "fifteen lines: three header, blank, eight roster, blank, footer, warning",
  postLines.length === 15,
  `got ${postLines.length}:\n        ${postLines.join("\n        ")}`
);

ok(
  "line 1 names the store and the day, with no time",
  postLines[0] === "*EDIAGD Rollcall* · Doggett Ford of Beaumont · Fri 6 Nov",
  `got ${JSON.stringify(postLines[0])}`
);

ok(
  "line 2 says how many did their morning and NAMES who did not, with a reason",
  postLines[1] ===
    "*7 of 8 did their morning today.* Missed: Test Advisor (never signed in).",
  `got ${JSON.stringify(postLines[1])}`
);

ok(
  "line 3 is the team meter and the tracks earned",
  postLines[2] ===
    "Team toward EDIAGD Certified: ▰▰▱▱▱▱▱▱▱▱ 21% of core lessons · 2 tracks earned",
  `got ${JSON.stringify(postLines[2])}`
);

ok(
  "the roster is fenced, so Slack renders it monospaced and the columns line up",
  post.text.split("\n").filter((l) => l === "```").length === 2,
  "without the fence every column in the block is ragged"
);

/* THE ORDER IS THE RULE'S, NOT THE LOADER'S: everybody who did their morning
   by meter descending, then those who missed, then those who never have. */
ok(
  "the roster is ordered: completers by meter descending, then the missed, then the never",
  (() => {
    const names = postLines.slice(4, 12).map((l) => l.slice(2, 20).trim());
    return (
      JSON.stringify(names) ===
      JSON.stringify([
        "Valerie Patterson",
        "Austin Abate",
        "Heather Sztaba",
        "Konner Upshaw",
        "Destiny Booker",
        "Amanda Tiner",
        "Matthew Reck",
        "Test Advisor",
      ])
    );
  })(),
  `got ${JSON.stringify(postLines.slice(4, 12).map((l) => l.slice(2, 20).trim()))}`
);

ok(
  "a completer's line carries the mark, the meter, the earned count, the mornings and what moved",
  postLines[4] ===
    "✓ Valerie Patterson  ▰▰▰▰▰▰▰▰▱▱ 82%  earned 2  19 mornings  +3 lessons, Walk Around earned",
  `got ${JSON.stringify(postLines[4])}`
);

ok(
  "a 0% meter beside a completed morning explains itself rather than sitting there",
  postLines[10].endsWith("no track opened yet"),
  `got ${JSON.stringify(postLines[10])}`
);

ok(
  "somebody who has never completed a morning is marked — and told why, in the roster too",
  postLines[11].startsWith("— Test Advisor") && postLines[11].endsWith("never signed in"),
  `got ${JSON.stringify(postLines[11])}`
);

ok(
  "the footer carries the unprovisioned roster and the push answer, one line",
  postLines[13] === "6 DMS advisors still have no account · no devices registered, so no pushes",
  `got ${JSON.stringify(postLines[13])}`
);

ok(
  "the integrity warning NAMES the advisor — the 6 November post did not",
  postLines[14] ===
    "⚠ Konner Upshaw: more in-morning lesson events than mornings. Numbers suspect until explained.",
  `got ${JSON.stringify(postLines[14])}`
);

ok(
  "none of the dropped facts came back: no phone/pw/onboarded dates, no tap counts",
  !/\bpw \d|phone —|Certs \d|tracks \d|outside the morning/.test(post.text),
  "a fact that stopped changing is back in the post"
);

ok(
  "two advisors are reported as having moved",
  post.changed === 2 && post.listed === 8 && post.dropped === 0,
  `changed ${post.changed}, listed ${post.listed}, dropped ${post.dropped}`
);

/* ======================================================================
   2. THE METER
   ====================================================================== */
section("2. The meter rounds from the fraction, in ten cells");

const tenOfTwelve = build(
  rollcall([advisor({ name: "Rounder", mornings: 3, done: 10, total: 12 })])
);
ok(
  "10 of 12 draws eight cells and says 83%",
  content(tenOfTwelve.text)[4].includes("▰▰▰▰▰▰▰▰▱▱ 83%"),
  `got ${JSON.stringify(content(tenOfTwelve.text)[4])}`
);

const allDone = build(rollcall([advisor({ name: "Finisher", mornings: 3, done: 12, total: 12 })]));
ok(
  "12 of 12 fills every cell and says 100%",
  content(allDone.text)[4].includes("▰▰▰▰▰▰▰▰▰▰ 100%"),
  `got ${JSON.stringify(content(allDone.text)[4])}`
);

const noTrack = build(
  rollcall([advisor({ name: "Early Days", mornings: 1, done: 0, total: 0 })], {
    teamGatingTotal: 0,
    coreTracks: 0,
  })
);
ok(
  "no active core track says so instead of drawing an empty bar nobody can fill",
  content(noTrack.text)[2] === "No active core tracks yet.",
  `got ${JSON.stringify(content(noTrack.text)[2])}`
);

/* ======================================================================
   3. THE COLUMNS HOLD WHEN A CELL IS EMPTY
   ====================================================================== */
section("3. The earned column keeps its width when it is empty");

const mixed = build(
  rollcall([
    advisor({ name: "Aa", mornings: 4, done: 50, earned: ["Walk Around", "CSI"] }),
    advisor({ name: "Bb", mornings: 4, done: 40 }),
  ])
);
const [withEarned, withoutEarned] = content(mixed.text).slice(4, 6);
ok(
  "earned reads 'earned 2' at two and is blank at zero",
  withEarned.includes("earned 2") && !withoutEarned.includes("earned"),
  `${JSON.stringify(withEarned)} / ${JSON.stringify(withoutEarned)}`
);
ok(
  "and the mornings column starts at the same offset in both lines",
  withEarned.indexOf("4 mornings") === withoutEarned.indexOf("4 mornings") &&
    withEarned.indexOf("4 mornings") > 0,
  `${withEarned.indexOf("4 mornings")} vs ${withoutEarned.indexOf("4 mornings")}`
);

const oneMorning = build(rollcall([advisor({ name: "Newcomer", mornings: 1, done: 3 })]));
ok(
  "one morning reads as English, not '1 mornings'",
  /\b1 morning\b/.test(content(oneMorning.text)[4]) &&
    !content(oneMorning.text)[4].includes("1 mornings"),
  `got ${JSON.stringify(content(oneMorning.text)[4])}`
);

/* ======================================================================
   4. THE DAY NOBODY MISSED, AND THE DAY THERE IS NO DAY
   ====================================================================== */
section("4. Everybody, nobody, and no store day at all");

const everybody = build(
  rollcall([
    advisor({ name: "Aa", mornings: 4, done: 50 }),
    advisor({ name: "Bb", mornings: 4, done: 40 }),
  ])
);
ok(
  "nobody missed reads as a sentence, not as '2 of 2'",
  content(everybody.text)[1] === "*Everybody did their morning today.*",
  `got ${JSON.stringify(content(everybody.text)[1])}`
);

/*
 * THE SAME PEOPLE IN THE SAME ORDER. Found against the real store on
 * 8 November: line 2 listed seven missed advisors in the loader's order while
 * the block below had them in the roster's, so the two lists of one set of
 * people read as two different sets.
 */
const mostlyMissed = build(
  rollcall([
    advisor({ name: "Did It", mornings: 6, done: 20 }),
    advisor({ name: "Gone Monday", mornings: 4, done: 30, lastOn: "2026-11-02" as IsoDate }),
    advisor({ name: "Gone Yesterday", mornings: 5, done: 10, lastOn: "2026-11-05" as IsoDate }),
    advisor({ name: "Never Started", mornings: 0, done: 0, firstLoginOn: null }),
  ])
);
ok(
  "the missed are named in the roster's own order, most recent morning first",
  content(mostlyMissed.text)[1] ===
    "*1 of 4 did their morning today.* Missed: Gone Yesterday, Gone Monday, Never Started (never signed in).",
  `got ${JSON.stringify(content(mostlyMissed.text)[1])}`
);
ok(
  "and the roster block lists them in exactly that order underneath",
  JSON.stringify(content(mostlyMissed.text).slice(4, 8).map((l) => l.slice(2, 16).trim())) ===
    JSON.stringify(["Did It", "Gone Yesterday", "Gone Monday", "Never Started"]),
  `got ${JSON.stringify(content(mostlyMissed.text).slice(4, 8))}`
);

const noStoreDay = build(
  rollcall(
    [
      advisor({ name: "Aa", mornings: 4, done: 50, lastOn: "2026-11-05" as IsoDate }),
      advisor({ name: "Bb", mornings: 0, done: 0 }),
    ],
    { today: null, completedToday: 0 }
  )
);
ok(
  "no store day says so",
  content(noStoreDay.text)[1] === "No store day today.",
  `got ${JSON.stringify(content(noStoreDay.text)[1])}`
);
ok(
  "and marks nobody as having done it — a ✓ would be a claim about a day that does not exist",
  !noStoreDay.text.includes("✓"),
  "somebody is ticked on a day with no calendar"
);

/* ======================================================================
   5. THE WARNINGS NAME PEOPLE
   ====================================================================== */
section("5. A refused delivery names the advisor and carries Apple's word");

const refused = build(
  rollcall([
    advisor({ name: "Aa", mornings: 4, done: 50 }),
    advisor({ name: "Unreachable Person", mornings: 2, done: 10, apnsReason: "BadDeviceToken" }),
  ])
);
ok(
  "the warning names them and says what Apple said",
  refused.text.includes("⚠ Unreachable Person: push refused by Apple (BadDeviceToken)"),
  `got:\n        ${refused.text.split("\n").filter((l) => l.startsWith("⚠")).join("\n        ")}`
);

/* ======================================================================
   6. THE FIRST POST, AND THE CAP
   ====================================================================== */
section("6. The first post, and the cap");

const first = build(rollcall([advisor({ name: "Aa", mornings: 4, done: 50 })]), new Map(), null);
ok(
  "a first post says movement starts tomorrow rather than implying nobody did anything",
  content(first.text)[3] === "_First post. Movement starts tomorrow._",
  `got ${JSON.stringify(content(first.text).slice(0, 5))}`
);
ok(
  "and leaves the movement column empty rather than dressing an absence up as context",
  content(first.text)[5].trimEnd().endsWith("4 mornings"),
  `got ${JSON.stringify(content(first.text)[5])}`
);

const crowd = Array.from({ length: 45 }, (_, i) =>
  advisor({ name: `Advisor ${String(i).padStart(2, "0")}`, mornings: 3, done: 45 - i })
);
const capped = build(rollcall(crowd));
ok(
  "the cap bites at 40 and SAYS how many it dropped",
  capped.listed === 40 &&
    capped.dropped === 5 &&
    capped.text.includes("⚠ 5 more advisors not listed"),
  `listed ${capped.listed}, dropped ${capped.dropped}`
);

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
