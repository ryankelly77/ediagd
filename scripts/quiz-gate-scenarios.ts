/* ============================================================================
   EDIAGD — the film opens the quiz, and the cues do not

   Ryan's ruling, 10 November 2026, after Valerie Patterson reported that the
   Name Tag quiz never appeared. She had watched the film; the deck's terminal
   card said "Quiz is waiting, N items still to finish" and offered no button,
   while the quiz ROUTE — gating on my_module_progress.items_done — would have
   served it. Two definitions of one gate in two layers.

   PURE. The rule is a function over a list and a set, so every case is cheap
   and none of them needs a database.

     npm run test:quiz-gate

   ---------------------------------------------------------------------------
   BOTH HALVES, AND THE SECOND ONE IS THE ONE THAT WOULD HAVE CAUGHT THIS
   ---------------------------------------------------------------------------
   "The cues do not hold the quiz" is satisfied by a gate that opens for
   everybody, which would put an advisor into a quiz on material they have not
   watched and make a pass mean nothing. So every open below is paired with the
   refusal that must survive it:

     * watched film + unmarked cues        → OPEN    (the reported bug)
     * unwatched film + every cue marked   → CLOSED  (the gate still works)
     * no gating item at all               → CLOSED  (not vacuously open)

   The third is the one AGENTS.md's rule about empty catalogs is about: a gate
   written as "every gating item is done" is TRUE of a module with no gating
   items, and would have opened a quiz the route refuses — the client and the
   server disagreeing again, in the other direction.
============================================================================ */

import { quizGate, type GateItem } from "@/lib/library-gate";

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

const film = (id: string): GateItem => ({ id, completable: true, gates: true });
const cue = (id: string): GateItem => ({ id, completable: true, gates: false });
/** A synthesized video_placeholder: not a row, never completable. */
const placeholder = (id: string): GateItem => ({
  id,
  completable: false,
  gates: false,
});

/* ===========================================================================
   1. THE REPORTED BUG. Name Tag module 1 as Valerie met it.
   =========================================================================== */
section("1. A watched film with unmarked cues opens the quiz");

{
  const items = [film("f1"), cue("c1"), cue("c2"), cue("c3")];
  const g = quizGate(items, new Set(["f1"]));

  ok(
    "the gate is OPEN — this is what the deck now renders as 'Start the quiz'",
    g.open === true,
    `open=${g.open}`
  );
  ok(
    "it reports the three cues as still there, so they can be invited",
    g.cuesLeft === 3,
    `cuesLeft=${g.cuesLeft}`
  );
  ok("it knows the module has a gating item", g.hasGatingItem === true);
}

{
  /* THE OLD PREDICATE, COMPUTED HERE SO THE REGRESSION IS NAMED RATHER THAN
     REMEMBERED. `allDone` counted every completable card; this asserts that
     the two now disagree on exactly the case that was broken. If somebody
     reverts the deck to allDone, this line is what fails. */
  const items = [film("f1"), cue("c1"), cue("c2"), cue("c3")];
  const done = new Set(["f1"]);
  const allDone =
    items.filter((i) => i.completable).every((i) => done.has(i.id)) &&
    items.some((i) => i.completable);

  ok(
    "the superseded `allDone` predicate would have refused this very case",
    allDone === false && quizGate(items, done).open === true,
    `allDone=${allDone}`
  );
}

/* ===========================================================================
   2. THE REFUSAL THAT MUST SURVIVE IT
   =========================================================================== */
section("2. An unwatched film still holds the quiz shut");

{
  const items = [film("f1"), cue("c1"), cue("c2")];
  const g = quizGate(items, new Set(["c1", "c2"]));

  ok(
    "every cue marked and the film unwatched → CLOSED",
    g.open === false,
    `open=${g.open}`
  );
  ok("no cues left to invite", g.cuesLeft === 0);
  ok("and it is closed for the right reason, not for a missing gate", g.hasGatingItem === true);
}

{
  const items = [film("f1"), cue("c1")];
  ok(
    "nothing done at all → CLOSED",
    quizGate(items, new Set()).open === false
  );
}

/* ===========================================================================
   3. THE EMPTY-SET TRAP
   =========================================================================== */
section("3. A module with no gating item is not vacuously open");

{
  /* A cue-only module. `every` over an empty list is TRUE, so a gate written
     without hasGatingItem would open here — and the quiz route would redirect,
     because my_module_progress.items_done is false for a module with nothing
     to gate on. The deck must not offer a door that is shut. */
  const items = [cue("c1"), cue("c2")];
  const g = quizGate(items, new Set(["c1", "c2"]));

  ok(
    "all cues marked, no film → CLOSED, matching items_done",
    g.open === false,
    `open=${g.open}`
  );
  ok("and it says why: there is no gating item", g.hasGatingItem === false);
}

{
  /* The synthesized placeholder the module page unshifts when a module has no
     film. It is not completable, so it can never satisfy the gate — the
     construction, not a convention. */
  const items = [placeholder("placeholder:video:m1"), cue("c1")];
  const g = quizGate(items, new Set(["placeholder:video:m1", "c1"]));

  ok(
    "a placeholder marked done cannot open the gate",
    g.open === false && g.hasGatingItem === false,
    `open=${g.open} hasGatingItem=${g.hasGatingItem}`
  );
}

{
  const g = quizGate([], new Set());
  ok(
    "an empty deck is CLOSED and says it has no gating item",
    g.open === false && g.hasGatingItem === false && g.cuesLeft === 0
  );
}

/* ===========================================================================
   4. MORE THAN ONE GATING ITEM
   =========================================================================== */
section("4. Two films means both films");

{
  /* Walk Around module 4 serves a second gated film. items_done requires
     every gating item, so one of two is not enough. */
  const items = [film("f1"), film("f2"), cue("c1")];

  ok(
    "one of two films → CLOSED",
    quizGate(items, new Set(["f1", "c1"])).open === false
  );
  ok(
    "both films, cue unmarked → OPEN",
    quizGate(items, new Set(["f1", "f2"])).open === true
  );
}

{
  /* A manager_video in a module is kind "video" and type manager_video, which
     is NOT in gating_content_types(). The deck is handed gates=false for it, so
     it cannot hold a quiz shut — this is the case that made `gates` come from
     the type rather than from `kind`. */
  const managerVideo: GateItem = { id: "mv", completable: true, gates: false };
  const items = [film("f1"), managerVideo];

  ok(
    "a non-gating video does not hold the quiz shut",
    quizGate(items, new Set(["f1"])).open === true
  );
  ok(
    "and it counts as reinforcement, like a cue",
    quizGate(items, new Set(["f1"])).cuesLeft === 1
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
