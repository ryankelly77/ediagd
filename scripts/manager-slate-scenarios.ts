/* ============================================================================
   EDIAGD — the Manager Meetings slate, on three transcripts

   PURE. The slate reader is a function over text and a list of rows, so the
   three cases the prompt names are cheap and need no stack:

     an exact match     the spoken line is in the library, verbatim
     a fold match       the same meeting, differently transcribed
     a miss             a slate that is not in the library — HOLDS

     npm run test:manager-slate

   ---------------------------------------------------------------------------
   THE MISS IS THE CASE THAT MATTERS
   ---------------------------------------------------------------------------
   AGENTS.md: "a slate names the shoot, not the curriculum", and five near-misses
   in one week were all titles pointing at the wrong home. The remedy there was
   that a slate is a HYPOTHESIS and the test is the content. Here the slate is
   being used as an identity rather than as a hypothesis, which is only safe
   because the line is looked up and never approximated: an unknown slate is a
   hold, and this suite asserts it holds rather than resolving to the nearest
   title.

   It also asserts the two ways this could silently over-reach: that a Bank
   Account film is not claimed, and that an ambiguous fold refuses instead of
   taking the first row.
============================================================================ */

import {
  readSlate,
  foldLine,
  matchSlate,
  slateHead,
  type SlateRow,
} from "@/lib/video/manager-slate";

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

/* ---- the library, as the caller would have read it ----------------------- */
/** Ids, never titles, for matching — AGENTS.md. Titles are for printing. */
const LIBRARY: SlateRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    classification_line:
      "Manager Meetings/Op Code Boost Meetings/10 mins/Engine Air Filter Boost Meeting",
    title: "Engine Air Filter Boost Meeting",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    classification_line:
      "Manager Meetings/Leading Yourself/5-15 mins/Teach Mode vs. Preach Mode",
    title: "Teach Mode vs. Preach Mode",
  },
  {
    /* A title containing a literal slash — three of these survive ruling 5. */
    id: "33333333-3333-4333-8333-333333333333",
    classification_line:
      "Manager Meetings/Op Code Boost Meetings/10 mins/A/C Recharge Boost Meeting",
    title: "A/C Recharge Boost Meeting",
  },
  {
    /* The renamed one, per ruling 5. */
    id: "44444444-4444-4444-8444-444444444444",
    classification_line: "Manager Meetings/Op Code Boost Meetings/10 mins/AC Performance",
    title: "AC Performance",
  },
];

/* ---- the three transcripts ---------------------------------------------- */

/** 1. EXACT — the line as the workbook holds it, then the Aloha. */
const T_EXACT =
  "Manager Meetings/Op Code Boost Meetings/10 mins/Engine Air Filter Boost Meeting. " +
  "Aloha, and welcome back. Today we are talking about the engine air filter, and " +
  "I want you to bring a used one in from the shop.";

/**
 * 2. FOLD — the same meeting, transcribed the way a transcriber actually hears
 * it: lower case after the first word, "minutes" for "mins", an em dash for the
 * hyphen, a curly apostrophe, and spaces around the slashes.
 */
const T_FOLD =
  "Manager meetings / leading yourself / 5—15 minutes / Teach Mode vs. Preach Mode. " +
  "Aloha. Every training meeting you run has two modes in it.";

/** 3. MISS — a well-formed slate for a meeting that is not in the library. */
const T_MISS =
  "Manager Meetings/Op Code Boost Meetings/10 mins/Sunroof Drain Boost Meeting. " +
  "Aloha. Nobody has filmed this one, and that is the point of the test.";

/* ------------------------------------------------------------------------- */
console.log("\nThe Manager Meetings slate");

section("1. An exact match identifies the meeting");
{
  const r = matchSlate(T_EXACT, LIBRARY);
  ok("it matches", r.ok === true);
  ok(
    "by the id, not the title",
    r.ok === true && r.row.id === "11111111-1111-4111-8111-111111111111",
    r.ok ? r.row.id : "(no match)"
  );
  ok("and says the match was exact", r.ok === true && r.how === "exact");
  /* The quoted line goes in the report, so it must be what was SPOKEN. */
  ok(
    "and quotes the line it read",
    r.ok === true &&
      r.line ===
        "Manager Meetings/Op Code Boost Meetings/10 mins/Engine Air Filter Boost Meeting",
    r.ok ? r.line : ""
  );
}

section("2. A folded match identifies the same meeting");
{
  const r = matchSlate(T_FOLD, LIBRARY);
  ok("it matches", r.ok === true, r.ok === false ? r.reason : "");
  ok(
    "to the right row",
    r.ok === true && r.row.id === "22222222-2222-4222-8222-222222222222",
    r.ok ? r.row.id : "(no match)"
  );
  ok("and says the match needed folding", r.ok === true && r.how === "folded");
  /* Folding must not rewrite the evidence. The report quotes what Mitch said,
     not the normalised form, or a reader cannot check it against the audio. */
  ok(
    "and still quotes the spoken line, not the folded one",
    r.ok === true && /5—15 minutes/.test(r.line),
    r.ok ? r.line : ""
  );
}

section("3. A slate that is not in the library HOLDS");
{
  const r = matchSlate(T_MISS, LIBRARY);
  ok("it does not match", r.ok === false);
  ok(
    "and it did read the slate, so the hold is informed",
    r.ok === false &&
      r.line === "Manager Meetings/Op Code Boost Meetings/10 mins/Sunroof Drain Boost Meeting",
    r.ok === false ? String(r.line) : ""
  );
  ok(
    "and says it is a hold rather than a guess",
    r.ok === false && /HOLD/i.test(r.reason),
    r.ok === false ? r.reason : ""
  );
  /* The whole point. A nearest-title fallback would have proposed the Engine
     Air Filter meeting here, which shares three of four segments. */
  ok(
    "and proposes no row at all",
    r.ok === false && !("row" in r)
  );
}

section("4. A title containing a slash survives");
{
  const t =
    "Manager Meetings/Op Code Boost Meetings/10 mins/A/C Recharge Boost Meeting. Aloha.";
  const read = readSlate(t);
  ok("the slate is read", read !== null);
  ok(
    "and the title keeps its slash",
    read?.title === "A/C Recharge Boost Meeting",
    JSON.stringify(read?.title)
  );
  ok("and the length segment is not swallowed", read?.length === "10 mins", read?.length);
  const r = matchSlate(t, LIBRARY);
  ok(
    "and it matches the right row",
    r.ok === true && r.row.id === "33333333-3333-4333-8333-333333333333"
  );
}

section("5. No other track is claimed");
{
  /* An advisor pitch film. If this returned a slate, identify-videos.ts would
     stop running the matcher on it and the whole advisor library would go
     unidentified — which is why "do not change how any other track is
     identified" is asserted and not assumed. */
  const advisor =
    "Aloha. Today we are on the drive, and we are talking about the engine air " +
    "filter. When you walk up to that vehicle, the first thing you do is open the hood.";
  ok("an advisor film yields no slate", readSlate(advisor) === null);
  ok(
    "and matchSlate says so plainly",
    matchSlate(advisor, LIBRARY).ok === false
  );

  /* A Bank Account film. Ruling 6: the 17 are separate from this library and
     used a different slate shape. They must not be claimed. */
  const bank =
    "Manager Bank Account, deposit number four. Aloha. Every interaction with " +
    "your advisors is either a deposit or a withdrawal.";
  ok("a Bank Account film yields no slate", readSlate(bank) === null);

  /* A classification line read ALOUD from the card, later in the film, is not
     that film's slate. The Aloha boundary is what makes this work. */
  const quotedLater =
    "Aloha. Before we start, I want to mention the other meeting in this set — " +
    "Manager Meetings/Leading Yourself/5-15 mins/Teach Mode vs. Preach Mode — " +
    "which you should run next week.";
  ok(
    "a line quoted after the Aloha is not read as the slate",
    readSlate(quotedLater) === null
  );
  ok(
    "because the head stops at the Aloha",
    !/Teach Mode/.test(slateHead(quotedLater)),
    slateHead(quotedLater)
  );
}

section("6. An ambiguous fold refuses rather than picking one");
{
  /* Two library rows that differ only in something folding removes. This cannot
     happen through the loader — the unique index is on the exact line — but it
     CAN happen the day somebody adds a meeting by hand, and the failure would
     otherwise be a confident wrong answer. */
  const ambiguous: SlateRow[] = [
    { id: "aaaa", classification_line: "Manager Meetings/Contests/10 mins/Ten and Five" },
    { id: "bbbb", classification_line: "Manager Meetings/Contests/10 mins/Ten & Five" },
  ];
  const r = matchSlate(
    "Manager Meetings/Contests/10 mins/Ten and Five. Aloha.",
    ambiguous
  );
  /* The exact arm wins here, because one of the two IS exact. */
  ok("an exact match still wins over the ambiguity", r.ok === true && r.how === "exact");

  /* Differing only in CASE, which folding removes and `slateHead` does not —
     the first attempt at this case used extra spaces and slateHead collapsed
     them into an exact match, so the test passed for the wrong reason. */
  const r2 = matchSlate("Manager Meetings/Contests/10 mins/Ten And Five. Aloha.", ambiguous);
  ok(
    "but a line that only folds, onto two rows, refuses",
    r2.ok === false && /folds onto 2/.test(r2.reason),
    r2.ok === false ? r2.reason : "(matched)"
  );
  ok(
    "and names both candidates so a person can split them",
    r2.ok === false && (r2.candidates?.length ?? 0) === 2
  );
}

section("7. foldLine folds spelling and never meaning");
{
  ok(
    "case, dashes and spacing fold together",
    foldLine("Manager Meetings/Leading Yourself/5—15 minutes/Teach Mode vs. Preach Mode") ===
      foldLine("manager meetings / leading yourself / 5-15 mins / teach mode vs preach mode")
  );
  /* The guard on the whole idea: two DIFFERENT meetings must not fold together. */
  ok(
    "two different meetings do not fold together",
    foldLine("Manager Meetings/Contests/10 mins/Ten and Five") !==
      foldLine("Manager Meetings/Contests/10 mins/Nine and Five")
  );
  ok(
    "and a different topic stays different",
    foldLine("Manager Meetings/Contests/10 mins/Ten and Five") !==
      foldLine("Manager Meetings/Prospecting/10 mins/Ten and Five")
  );
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
