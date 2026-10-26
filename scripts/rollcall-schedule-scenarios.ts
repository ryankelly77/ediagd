/* ============================================================================
   EDIAGD — when does the Rollcall post, and when does it hold its tongue

   PURE SCENARIOS. No database, no clock, no network — every case below is a
   date string and a closure row, so a Saturday in November is as cheap to test
   in October as it is in November. That is the whole reason the rule is a pure
   function rather than four `if`s in the route handler.

   ---------------------------------------------------------------------------
   BOTH HALVES OF EVERY GATE
   ---------------------------------------------------------------------------
   A refusal is not self-verifying. "It does not post on a Saturday" is
   compatible with a function that never posts at all, so every skip below is
   paired with the neighbouring day that MUST post. Section 1 is the
   acceptances and it comes first.

     npm run test:rollcall-schedule
   ============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";
import { isoWeekday, isWeekend, storeDateOf, weekdayName } from "@/lib/store-day";
import { rollcallPostDue, type DayClosure } from "@/lib/rollcall-schedule";

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

const decide = (localDate: string, closure: DayClosure | null = null) =>
  rollcallPostDue({ localDate: localDate as IsoDate, closure });

/* A real week in the store's calendar. 19 October 2026 is a Monday. */
const MON = "2026-10-19";
const TUE = "2026-10-20";
const WED = "2026-10-21";
const THU = "2026-10-22";
const FRI = "2026-10-23";
const SAT = "2026-10-24";
const SUN = "2026-10-25";

/* ======================================================================
   1. THE ACCEPTANCES. FIRST, so nothing below can pass against a function
      that simply never posts.
   ====================================================================== */
section("1. It posts on every working weekday");

for (const [name, day] of [
  ["Monday", MON],
  ["Tuesday", TUE],
  ["Wednesday", WED],
  ["Thursday", THU],
  ["Friday", FRI],
] as const) {
  const d = decide(day);
  ok(
    `${name} ${day} posts`,
    d.due && d.skip === null,
    `due=${d.due} skip=${d.skip} reason=${d.reason}`
  );
}

ok(
  "the weekday name on the decision is the store's, and matches the date",
  decide(MON).weekday === "Mon" && decide(SAT).weekday === "Sat",
  `${decide(MON).weekday} / ${decide(SAT).weekday}`
);

/* ======================================================================
   2. THE WEEKEND
   ====================================================================== */
section("2. It holds its tongue at the weekend");

for (const [name, day] of [
  ["Saturday", SAT],
  ["Sunday", SUN],
] as const) {
  const d = decide(day);
  ok(
    `${name} ${day} is skipped, and says which rule decided`,
    !d.due && d.skip === "weekend",
    `due=${d.due} skip=${d.skip}`
  );
  ok(
    `${name}'s reason names the day rather than just saying "skipped"`,
    d.reason.includes(name.slice(0, 3)) && d.reason.includes(day),
    d.reason
  );
}

/* NON-VACUOUS, and this is the pair that makes the two above mean anything:
   the days either side of that weekend post. A function returning `due: false`
   unconditionally would pass section 2 and fail here. */
ok(
  "the Friday before and the Monday after that same weekend both post",
  decide(FRI).due && decide(MON).due,
  `fri=${decide(FRI).due} mon=${decide(MON).due}`
);

/* ======================================================================
   3. THE LOCATION'S DAYS OFF
   ====================================================================== */
section("3. A confirmed closure stops it; a proposal does not");

const thanksgiving: DayClosure = { label: "Thanksgiving", status: "confirmed" };
const proposed: DayClosure = { label: "Thanksgiving", status: "proposed" };

/* 26 November 2026 is a Thursday — a working day but for the holiday, which is
   exactly the case Ryan asked about. A Sunday closure would prove nothing,
   because the weekend rule would have fired first. */
const THANKSGIVING = "2026-11-26";
ok(
  "that date really is a Thursday, so the weekend rule is not what is being tested",
  weekdayName(THANKSGIVING) === "Thu",
  weekdayName(THANKSGIVING)
);
ok(
  "a CONFIRMED closure on a working Thursday skips the post",
  (() => {
    const d = decide(THANKSGIVING, thanksgiving);
    return !d.due && d.skip === "closed";
  })(),
  JSON.stringify(decide(THANKSGIVING, thanksgiving))
);
ok(
  "and the reason names the holiday, so the channel's silence is explicable",
  decide(THANKSGIVING, thanksgiving).reason.includes("Thanksgiving"),
  decide(THANKSGIVING, thanksgiving).reason
);

/* THE ACCEPTANCE HALF OF THE CLOSURE GATE: the same Thursday with no closure
   posts. Without this, "it skipped" is the only evidence, and that is
   compatible with the closure lookup being broken in a way that returns a row
   for every date. */
ok(
  "the same Thursday with NO closure posts",
  decide(THANKSGIVING, null).due,
  JSON.stringify(decide(THANKSGIVING, null))
);

/*
 * A PROPOSAL IS A QUESTION, NOT A DECISION — and the post is not suppressed.
 *
 * This is the hole in "exclude the rows marked confirmed": it exempts every
 * row nobody confirmed. The assertion is that the function does NOT quietly
 * treat a proposal as a closure AND does not stay quiet about it.
 */
{
  const d = decide(THANKSGIVING, proposed);
  ok(
    "an UNRULED proposal does not suppress the post — a proposal is a question",
    d.due && d.skip === null,
    JSON.stringify(d)
  );
  ok(
    "but it is flagged, loudly, because this is the one state where the rule looks like it works and does not",
    d.unruledClosure === true &&
      d.reason.includes("PROPOSED") &&
      d.reason.includes("rule on the closure calendar"),
    d.reason
  );
  ok(
    "a day with no closure at all is NOT flagged — the warning has to mean something",
    decide(THANKSGIVING, null).unruledClosure === false,
    JSON.stringify(decide(THANKSGIVING, null))
  );
  ok(
    "and a CONFIRMED closure is not flagged either — it was ruled on",
    decide(THANKSGIVING, thanksgiving).unruledClosure === false,
    JSON.stringify(decide(THANKSGIVING, thanksgiving))
  );
}

/* ======================================================================
   4. PRECEDENCE
   ====================================================================== */
section("4. The first rule to fire is the one reported");

{
  /* A Saturday that is also a confirmed closure. Both rules apply; the weekend
     is the one that decided, and the closure still rides along on the decision
     so the heartbeat can mention it. Reporting "closed" here would be a true
     statement about the wrong cause, and somebody reading back through a
     month of heartbeats would conclude the store shuts every Saturday. */
  const d = decide(SAT, thanksgiving);
  ok(
    "a closed Saturday reports `weekend`, not `closed`",
    !d.due && d.skip === "weekend",
    JSON.stringify(d)
  );
  ok(
    "and the closure is still carried, so nothing is lost by the precedence",
    d.closure?.label === "Thanksgiving",
    JSON.stringify(d.closure)
  );
}

/* ======================================================================
   5. THE DATE ITSELF — the boundary this rule is most likely to get wrong
   ====================================================================== */
section("5. The store's date, not the server's");

/*
 * THE CRON FIRES AT 22:30 UTC. For Central that is 17:30 the same day; for a
 * store east of Greenwich it is already TOMORROW. ROLLCALL_ROOFTOP_ID is a
 * variable, so "it happens to work for Beaumont" is a coincidence and not a
 * property — and the day it stops being true, the post goes out on a Saturday
 * and nothing errors.
 */
{
  /* Friday 22:30 UTC. */
  const instant = "2026-10-23T22:30:00Z";
  const chicago = storeDateOf(instant, "America/Chicago");
  const tokyo = storeDateOf(instant, "Asia/Tokyo");
  ok(
    "22:30 UTC on a Friday is still Friday in Chicago",
    chicago === "2026-10-23" && weekdayName(chicago) === "Fri",
    `${chicago} (${weekdayName(chicago)})`
  );
  ok(
    "…and is already SATURDAY in Tokyo — the case a UTC day-of-week cron gets wrong",
    tokyo === "2026-10-24" && weekdayName(tokyo) === "Sat",
    `${tokyo} (${weekdayName(tokyo)})`
  );
  ok(
    "so the same instant posts for Chicago and is skipped for Tokyo",
    decide(chicago).due && !decide(tokyo).due && decide(tokyo).skip === "weekend",
    `chicago=${decide(chicago).due} tokyo=${decide(tokyo).skip}`
  );
}

{
  /* The other edge: Sunday 22:30 UTC is Sunday afternoon in Honolulu and
     Monday morning in Tokyo. Both are the store's answer, not the server's. */
  const instant = "2026-10-25T22:30:00Z";
  ok(
    "Sunday 22:30 UTC is Sunday in Honolulu (skipped) and Monday in Tokyo (posts)",
    !decide(storeDateOf(instant, "Pacific/Honolulu")).due &&
      decide(storeDateOf(instant, "Asia/Tokyo")).due,
    `${storeDateOf(instant, "Pacific/Honolulu")} / ${storeDateOf(instant, "Asia/Tokyo")}`
  );
}

ok(
  "isoWeekday matches SQL's extract(isodow): Monday 1 … Sunday 7",
  isoWeekday(MON) === 1 &&
    isoWeekday(FRI) === 5 &&
    isoWeekday(SAT) === 6 &&
    isoWeekday(SUN) === 7,
  `${isoWeekday(MON)} ${isoWeekday(FRI)} ${isoWeekday(SAT)} ${isoWeekday(SUN)}`
);
ok(
  "isWeekend is exactly Saturday and Sunday — not Friday, not Monday",
  !isWeekend(FRI) && isWeekend(SAT) && isWeekend(SUN) && !isWeekend(MON),
  `${isWeekend(FRI)} ${isWeekend(SAT)} ${isWeekend(SUN)} ${isWeekend(MON)}`
);

/*
 * A YEAR OF WEEKDAYS, counted. The cases above are hand-picked, and a
 * hand-picked sample is evidence about the sample: an off-by-one in the
 * isodow conversion could shift every day by one and still satisfy every
 * assertion above that happens to be symmetric.
 *
 * 2026 has 365 days starting on a Thursday, which gives exactly 261 weekdays
 * and 104 weekend days. Counting them is a second route to the same quantity.
 */
{
  let due = 0;
  let weekend = 0;
  for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    if (decide(day).due) due++;
    else weekend++;
  }
  ok(
    "across all of 2026 the rule posts on 261 days and skips 104 — the arithmetic of a 365-day year starting on a Thursday",
    due === 261 && weekend === 104,
    `due=${due} skipped=${weekend} total=${due + weekend}`
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
