/* ============================================================================
   EDIAGD — who stays on the manager's roster, and who comes off it

   Matthew Reck, 20 October: "I am going through some of the other parts of the
   App and noticed a few old advisors… Can you please clean the list."

   PURE. The rule is a function over a list and a map, so every case is cheap
   and none of them needs a database.

     npm run test:manager-roster

   ---------------------------------------------------------------------------
   BOTH HALVES, AND THE SECOND ONE IS THE ONE THAT MATTERS HERE
   ---------------------------------------------------------------------------
   "It hides departed advisors" is satisfied by a function that hides
   everybody, and hiding a working advisor is a far worse outcome than leaving
   a stale one on the list — it takes somebody off their manager's screen. So
   every hide below is paired with the people who must survive it.
   ============================================================================ */

import { splitDeparted, rankRoster, type AdvisorSummary } from "@/lib/manager";

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

/** Only the two fields the rule reads; the rest of AdvisorSummary is noise. */
const who = (advisorOpId: string, name: string) =>
  ({ advisorOpId, name }) as AdvisorSummary;

/* Beaumont's actual September roster, which is the case this was written for. */
const TEAM = [
  who("500573", "Amanda Tiner"),
  who("902050", "Austin Abate"),
  who("274", "Destiny Booker"),
  who("831000", "Heather Sztaba"),
  who("710", "Konner Upshaw"),
  who("747", "Mathew Martin"),
  who("500570", "Valerie Patterson"),
];

/* ======================================================================
   1. THE ACCEPTANCE. Nobody marked gone, nobody hidden.
   ====================================================================== */
section("1. With no departures, the whole team is shown");

{
  const none = new Map<string, string | null>(TEAM.map((t) => [t.advisorOpId, null]));
  const { shown, hidden } = splitDeparted(TEAM, none);
  ok(
    "all seven shown, none hidden",
    shown.length === 7 && hidden.length === 0,
    `shown=${shown.length} hidden=${hidden.length}`
  );
}

/* ======================================================================
   2. THE REAL CASE
   ====================================================================== */
section("2. Beaumont: Amanda Tiner and Mathew Martin come off");

{
  const departures = new Map<string, string | null>([
    ...TEAM.map((t) => [t.advisorOpId, null] as [string, string | null]),
    ["500573", "2026-10-20"],
    ["747", "2026-10-20"],
  ]);
  const { shown, hidden } = splitDeparted(TEAM, departures);

  ok(
    "exactly those two are hidden, named",
    hidden.length === 2 &&
      hidden.map((h) => h.name).sort().join(", ") === "Amanda Tiner, Mathew Martin",
    hidden.map((h) => h.name).join(", ")
  );
  /* THE PAIR THAT MATTERS. A function that hid everybody would pass the
     assertion above. These are the five who must survive — Reck's list. */
  ok(
    "and the five who are still there all survive",
    shown.map((s) => s.name).sort().join(", ") ===
      "Austin Abate, Destiny Booker, Heather Sztaba, Konner Upshaw, Valerie Patterson",
    shown.map((s) => s.name).join(", ")
  );
  ok(
    "Heather Sztaba in particular — she has no app account and is still here",
    shown.some((s) => s.advisorOpId === "831000"),
    "the unmapped but current advisor was dropped"
  );
}

/* ======================================================================
   3. THE EXCLUSION-BY-VALUE TRAP
   ====================================================================== */
section("3. A missing roster row is not a departure");

{
  /*
   * An operator who appears in the performance data and in NO roster row at
   * all. The rule keys on a column, and a rule keyed on a column is only as
   * strong as the guarantee that the column is written — this one has no such
   * guarantee, so an absent row must mean "still here" and not "gone".
   *
   * Getting this backwards would take a brand-new advisor off their manager's
   * screen on their first month, which is the worst failure this rule has.
   */
  const sparse = new Map<string, string | null>([["747", "2026-10-20"]]);
  const { shown, hidden } = splitDeparted(TEAM, sparse);
  ok(
    "six shown — only the one actually marked gone is hidden",
    shown.length === 6 && hidden.length === 1 && hidden[0].advisorOpId === "747",
    `shown=${shown.length} hidden=${hidden.map((h) => h.advisorOpId).join(",")}`
  );
  ok(
    "an operator with no roster row at all is SHOWN, not hidden",
    shown.some((s) => s.advisorOpId === "500573"),
    "a missing roster row was treated as a departure"
  );
}

{
  /* An empty map is the shape of a failed read. It must not blank the roster —
     the page renders a warning for that case rather than an empty list. */
  const { shown, hidden } = splitDeparted(TEAM, new Map());
  ok(
    "an EMPTY map (a failed roster read) hides nobody",
    shown.length === 7 && hidden.length === 0,
    `shown=${shown.length} hidden=${hidden.length}`
  );
}

/* ======================================================================
   4. IT IS "NOW", NOT "THIS PERIOD" — the deliberate difference
   ====================================================================== */
section("4. A departure hides them immediately, whatever month they worked");

{
  /*
   * family_store_benchmark keeps a departed advisor in the months they worked:
   *   departed_on is null OR departed_on >= period.starts_on
   * Under that rule somebody who left on 30 September is still IN September.
   *
   * This roster hides them anyway, because it answers "who is on my team" and
   * Ryan asked for it clean now. The two therefore disagree about September,
   * on purpose, and the screen says so. Asserted here so that nobody later
   * "fixes" the inconsistency without reading why it exists.
   */
  const leftDuringTheMonth = new Map<string, string | null>([["747", "2026-09-30"]]);
  const { shown, hidden } = splitDeparted(TEAM, leftDuringTheMonth);
  ok(
    "somebody who left mid-period is off the roster even for the period they worked",
    hidden.length === 1 && hidden[0].advisorOpId === "747",
    `hidden=${hidden.map((h) => h.advisorOpId).join(",")}`
  );
  ok(
    "which is stricter than the benchmark rule (departed_on >= starts_on would have kept them)",
    "2026-09-30" >= "2026-09-01" && !shown.some((s) => s.advisorOpId === "747"),
    "the two rules did not actually differ on this input, so the case proves nothing"
  );
}

/* ======================================================================
   5. IT COMPOSES WITH THE ORDERING
   ====================================================================== */
section("5. The surviving roster still sorts the way it did");

{
  const departures = new Map<string, string | null>([["500573", "2026-10-20"]]);
  const { shown } = splitDeparted(TEAM, departures);
  const ranked = rankRoster(
    shown.map((s) => ({ ...s, hasVolume: true }) as AdvisorSummary)
  );
  ok(
    "alphabetical, as rankRoster has always been — filtering did not reorder anybody",
    ranked.map((r) => r.name).join(", ") ===
      "Austin Abate, Destiny Booker, Heather Sztaba, Konner Upshaw, Mathew Martin, Valerie Patterson",
    ranked.map((r) => r.name).join(", ")
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
