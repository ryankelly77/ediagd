/* ============================================================================
   EDIAGD — Swell engine scenarios
   Offline. No database, no network, no clock: applyDailyCompletion is pure, so
   every rule here is proved by passing state in and asserting on what comes
   back. Run with `npm run test:streak`.
   ============================================================================ */

import {
  MILESTONES,
  addDays,
  applyDailyCompletion,
  countMissedWorkDays,
  isWorkDay,
  isoWeekday,
  type GameSettings,
  type IsoDate,
  type IslandTime,
  type ScheduleContext,
  type SwellState,
  type WorkSchedule,
} from "../lib/gamification/streak";

/* ---- Harness ------------------------------------------------------------- */

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

function section(title: string) {
  console.log(`\n${title}`);
}

/* ---- Fixtures ------------------------------------------------------------ */

const SETTINGS: GameSettings = {
  paddleOutCap: 5,
  paddleOutPerMonth: 1,
  sandDailyLoop: 10,
  sandSwell7: 250,
  sandSwell30: 500,
  sandSwell90: 1000,
  sandSwell365: 5000,
  sandBadge: 100,
  sandCertification: 750,
};

const MON_FRI: WorkSchedule = {
  mon: true, tue: true, wed: true, thu: true, fri: true, sun: false,
  saturdayMode: "none", saturdayAnchor: null,
};

const MON_SAT: WorkSchedule = {
  mon: true, tue: true, wed: true, thu: true, fri: true, sun: false,
  saturdayMode: "every", saturdayAnchor: null,
};

// Works the Saturday of 2026-08-08, then every other one (22nd, Sep 5th…).
const ALT_SAT: WorkSchedule = {
  mon: true, tue: true, wed: true, thu: true, fri: true, sun: false,
  saturdayMode: "alternating", saturdayAnchor: "2026-08-08",
};

/** A Swell mid-flight, so we can watch it survive or break. */
function state(over: Partial<SwellState> = {}): SwellState {
  return {
    currentLen: 5,
    longestLen: 5,
    lastCompletedOn: "2026-08-07", // a Friday
    paddleOutAvailable: 2,
    paddleOutLastGranted: "2026-08-01",
    ...over,
  };
}

function run(
  s: SwellState,
  today: IsoDate,
  ctx: ScheduleContext = {},
  settings: GameSettings = SETTINGS
) {
  return applyDailyCompletion(s, today, settings, ctx);
}

/* ---- 0. Date primitives -------------------------------------------------- */

section("0. Date primitives");
check("2026-08-07 is a Friday (isodow 5)", isoWeekday("2026-08-07"), 5);
check("2026-08-08 is a Saturday (isodow 6)", isoWeekday("2026-08-08"), 6);
check("2026-08-09 is a Sunday (isodow 7)", isoWeekday("2026-08-09"), 7);
check("2026-08-10 is a Monday (isodow 1)", isoWeekday("2026-08-10"), 1);

/* ---- 1. THE BUG: Mon–Fri worker across a weekend ------------------------- */

section("1. Mon–Fri worker: Friday → Monday is NOT a gap");
{
  const ctx = { schedule: MON_FRI };
  const r = run(state(), "2026-08-10", ctx); // Fri 7th -> Mon 10th
  check("missed work days = 0", r.outcome.gapDays, 0);
  check("streak increments 5 -> 6", r.next.currentLen, 6);
  check("no grace spent", r.outcome.paddleOutSpent, 0);
  check("grace bank untouched", r.next.paddleOutAvailable, 2);
  check("no reset", r.outcome.streakReset, false);
  check("Monday is a scheduled day", r.outcome.onScheduledDay, true);

  // The old behaviour, for contrast: no schedule = every calendar day counts.
  const old = run(state(), "2026-08-10", {});
  check("WITHOUT a schedule the weekend still costs 2 grace", old.outcome.paddleOutSpent, 2);
}

section("1b. Mon–Fri worker: eight consecutive weeks never breaks");
{
  const ctx = { schedule: MON_FRI };
  let s: SwellState = {
    currentLen: 0, longestLen: 0, lastCompletedOn: null,
    paddleOutAvailable: 0, paddleOutLastGranted: null,
  };
  let day: IsoDate = "2026-08-03"; // a Monday
  let spent = 0;
  let resets = 0;
  let completions = 0;
  for (let i = 0; i < 56; i++) {
    if (isWorkDay(day, MON_FRI)) {
      const r = run(s, day, ctx);
      s = r.next;
      spent += r.outcome.paddleOutSpent;
      if (r.outcome.streakReset) resets++;
      completions++;
    }
    day = addDays(day, 1);
  }
  check("worked 40 weekdays in 8 weeks", completions, 40);
  check("streak reached 40 (was resetting to 1 weekly)", s.currentLen, 40);
  check("never reset", resets, 0);
  check("never spent a grace day", spent, 0);
  check("30-day milestone is now reachable", s.longestLen >= 30, true);
}

/* ---- 2. Mon–Sat worker --------------------------------------------------- */

section("2. Mon–Sat worker: Saturday → Monday is NOT a gap");
{
  const ctx = { schedule: MON_SAT };
  const s = state({ lastCompletedOn: "2026-08-08" }); // Saturday
  const r = run(s, "2026-08-10", ctx); // Monday
  check("missed work days = 0 (only Sunday between)", r.outcome.gapDays, 0);
  check("streak increments", r.next.currentLen, 6);
  check("no grace spent", r.outcome.paddleOutSpent, 0);

  // …but skipping their Saturday IS a miss.
  const skipped = run(state(), "2026-08-10", ctx); // Fri -> Mon, Sat worked
  check("skipping a working Saturday = 1 missed day", skipped.outcome.gapDays, 1);
  check("grace covers it", skipped.outcome.paddleOutSpent, 1);
  check("streak survives", skipped.next.currentLen, 6);
}

/* ---- 3. Missing a real work day ------------------------------------------ */

section("3. Missing an actual work day");
{
  const ctx = { schedule: MON_FRI };
  const s = state({ lastCompletedOn: "2026-08-10" }); // Monday
  const r = run(s, "2026-08-12", ctx); // Wednesday — Tuesday missed
  check("gap of 1 work day", r.outcome.gapDays, 1);
  check("one grace spent", r.outcome.paddleOutSpent, 1);
  check("grace bank 2 -> 1", r.next.paddleOutAvailable, 1);
  check("graceUsed flag", r.outcome.graceUsed, true);
  check("streak survives", r.next.currentLen, 6);
  check("no reset", r.outcome.streakReset, false);
}

section("4. Missing more work days than grace held");
{
  const ctx = { schedule: MON_FRI };
  const s = state({ lastCompletedOn: "2026-08-10", paddleOutAvailable: 1 });
  const r = run(s, "2026-08-14", ctx); // Mon -> Fri: Tue/Wed/Thu missed = 3
  check("gap of 3 work days", r.outcome.gapDays, 3);
  check("gentle reset to 1", r.next.currentLen, 1);
  check("streakReset flag", r.outcome.streakReset, true);
  check("spends NOTHING (all-or-nothing)", r.outcome.paddleOutSpent, 0);
  check("grace bank preserved", r.next.paddleOutAvailable, 1);
  check("longest is remembered", r.next.longestLen, 5);
}

/* ---- 5. Alternating Saturdays -------------------------------------------- */

section("5. Alternating Saturdays");
{
  check("anchor Saturday 08-08 is worked", isWorkDay("2026-08-08", ALT_SAT), true);
  check("08-15 (one week later) is off", isWorkDay("2026-08-15", ALT_SAT), false);
  check("08-22 (two weeks later) is worked", isWorkDay("2026-08-22", ALT_SAT), true);
  check("08-29 is off", isWorkDay("2026-08-29", ALT_SAT), false);
  check("09-05 is worked", isWorkDay("2026-09-05", ALT_SAT), true);
  // Parity runs backwards through the anchor too: one week before a worked
  // Saturday is an OFF Saturday, two weeks before is worked again.
  check("BEFORE the anchor: 08-01 (-1 week) is off", isWorkDay("2026-08-01", ALT_SAT), false);
  check("BEFORE the anchor: 07-25 (-2 weeks) is worked", isWorkDay("2026-07-25", ALT_SAT), true);

  const ctx = { schedule: ALT_SAT };
  // Fri 14th -> Mon 17th, skipping the OFF Saturday 15th.
  const off = run(state({ lastCompletedOn: "2026-08-14" }), "2026-08-17", ctx);
  check("non-working Saturday is not a gap", off.outcome.gapDays, 0);
  check("streak increments", off.next.currentLen, 6);

  // Fri 21st -> Mon 24th, skipping the WORKING Saturday 22nd.
  const on = run(state({ lastCompletedOn: "2026-08-21" }), "2026-08-24", ctx);
  check("working Saturday missed = gap of 1", on.outcome.gapDays, 1);
  check("grace spent", on.outcome.paddleOutSpent, 1);
}

/* ---- 6. Island Time ------------------------------------------------------ */

section("6. Island Time spanning a full week");
{
  const island: IslandTime[] = [{ start: "2026-08-10", end: "2026-08-16" }];
  const ctx = { schedule: MON_FRI, islandTime: island };
  // Last worked Fri 7th, away all of the following week, back Mon 17th.
  const r = run(state(), "2026-08-17", ctx);
  check("no missed work days", r.outcome.gapDays, 0);
  check("streak fully preserved 5 -> 6", r.next.currentLen, 6);
  check("no grace consumed", r.outcome.paddleOutSpent, 0);
  check("grace bank untouched", r.next.paddleOutAvailable, 2);
  check("no reset", r.outcome.streakReset, false);
}

section("6b. Island Time abutting a genuinely missed day");
{
  // Away Mon 10th – Fri 14th. Back Mon 17th but skips it; completes Tue 18th.
  const island: IslandTime[] = [{ start: "2026-08-10", end: "2026-08-14" }];
  const ctx = { schedule: MON_FRI, islandTime: island };
  const r = run(state(), "2026-08-18", ctx);
  check("only Monday the 17th counts as missed", r.outcome.gapDays, 1);
  check("one grace spent", r.outcome.paddleOutSpent, 1);
  check("streak survives", r.next.currentLen, 6);
}

section("6c. Training DURING Island Time still counts");
{
  const island: IslandTime[] = [{ start: "2026-08-10", end: "2026-08-16" }];
  const ctx = { schedule: MON_FRI, islandTime: island };
  const r = run(state(), "2026-08-12", ctx); // a Wednesday on holiday
  check("streak increments", r.next.currentLen, 6);
  check("no grace spent", r.outcome.paddleOutSpent, 0);
  check("flagged as NOT scheduled (Free Surf)", r.outcome.onScheduledDay, false);
}

section("6d. Overlapping Island Time ranges are harmless");
{
  const island: IslandTime[] = [
    { start: "2026-08-10", end: "2026-08-14" },
    { start: "2026-08-12", end: "2026-08-18" },
  ];
  const ctx = { schedule: MON_FRI, islandTime: island };
  const r = run(state(), "2026-08-19", ctx);
  check("union covers the whole absence, gap 0", r.outcome.gapDays, 0);
  check("streak preserved", r.next.currentLen, 6);
}

/* ---- 7. Completing on a non-scheduled day -------------------------------- */

section("7. Non-scheduled day = extra effort, never punished");
{
  const ctx = { schedule: MON_FRI };
  const sat = run(state(), "2026-08-08", ctx); // Saturday, day off
  check("streak increments 5 -> 6", sat.next.currentLen, 6);
  check("no reset", sat.outcome.streakReset, false);
  check("no grace spent", sat.outcome.paddleOutSpent, 0);
  check("onScheduledDay = false", sat.outcome.onScheduledDay, false);

  // …and it doesn't strand the following Monday.
  const mon = run(sat.next, "2026-08-10", ctx);
  check("Monday after still gap 0", mon.outcome.gapDays, 0);
  check("streak continues 6 -> 7", mon.next.currentLen, 7);
  check("Monday flagged scheduled", mon.outcome.onScheduledDay, true);

  // No schedule on file: we must not claim they weren't scheduled.
  const unknown = run(state(), "2026-08-08", {});
  check("onScheduledDay = null without a schedule", unknown.outcome.onScheduledDay, null);
}

/* ---- 8. Monthly grace grant ---------------------------------------------- */

section("8. Monthly grace grant still works");
{
  const ctx = { schedule: MON_FRI };
  const s = state({ lastCompletedOn: "2026-08-31", paddleOutLastGranted: "2026-08-31" });
  const r = run(s, "2026-09-01", ctx); // Aug 31 Mon -> Sep 1 Tue
  check("granted 1 on the month boundary", r.outcome.paddleOutGranted, 1);
  check("bank 2 -> 3", r.next.paddleOutAvailable, 3);

  const same = run(state({ paddleOutLastGranted: "2026-08-01" }), "2026-08-10", ctx);
  check("no second grant in the same month", same.outcome.paddleOutGranted, 0);

  const capped = run(
    state({ paddleOutAvailable: 5, lastCompletedOn: "2026-08-31", paddleOutLastGranted: "2026-07-31" }),
    "2026-09-01",
    ctx
  );
  check("grant respects the cap", capped.next.paddleOutAvailable, 5);
  check("granted 0 when already full", capped.outcome.paddleOutGranted, 0);

  // Granted BEFORE consuming, so a returning user can spend what they just got.
  const returning = run(
    state({ lastCompletedOn: "2026-08-31", paddleOutAvailable: 0, paddleOutLastGranted: "2026-07-31" }),
    "2026-09-02", // Sep 1 (Tue) missed
    ctx
  );
  check("gap of 1", returning.outcome.gapDays, 1);
  check("spends the grace granted this run", returning.outcome.paddleOutSpent, 1);
  check("streak survives", returning.next.currentLen, 6);
}

/* ---- 9. Calendar edges --------------------------------------------------- */

section("9. Calendar edges");
{
  const ctx = { schedule: MON_FRI };

  // DST — US spring forward 2026-03-08, fall back 2026-11-01 (both Sundays).
  check("DST spring: 03-06 Fri -> 03-09 Mon, gap 0", run(state({ lastCompletedOn: "2026-03-06" }), "2026-03-09", ctx).outcome.gapDays, 0);
  check("DST autumn: 10-30 Fri -> 11-02 Mon, gap 0", run(state({ lastCompletedOn: "2026-10-30" }), "2026-11-02", ctx).outcome.gapDays, 0);

  // Feb 28 -> Mar 1 (2026 is not a leap year). Sat 28th, Sun 1st.
  check("Feb 28 Sat -> Mar 2 Mon, gap 0", run(state({ lastCompletedOn: "2026-02-27" }), "2026-03-02", ctx).outcome.gapDays, 0);
  // Leap year: 2028-02-28 Mon, 29th Tue, Mar 1 Wed.
  check("leap day is an ordinary work day", isWorkDay("2028-02-29", MON_FRI), true);
  check("2028-02-28 Mon -> 03-01 Wed misses the 29th", run(state({ lastCompletedOn: "2028-02-28" }), "2028-03-01", ctx).outcome.gapDays, 1);

  // Year boundary: Thu 2026-12-31 -> Fri 2027-01-01.
  check("year boundary, consecutive work days", run(state({ lastCompletedOn: "2026-12-31" }), "2027-01-01", ctx).outcome.gapDays, 0);
  check("year boundary grants a new month's grace", run(state({ lastCompletedOn: "2026-12-31", paddleOutLastGranted: "2026-12-31" }), "2027-01-01", ctx).outcome.paddleOutGranted, 1);

  // Clock skew — last completion in the future, and same-day replay.
  const skew = run(state({ lastCompletedOn: "2026-08-20" }), "2026-08-10", ctx);
  check("future lastCompletedOn is a no-op", skew.outcome.noop, true);
  check("no-op changes nothing", skew.next.currentLen, 5);
  const same = run(state({ lastCompletedOn: "2026-08-10" }), "2026-08-10", ctx);
  check("same day twice is a no-op", same.outcome.noop, true);
  check("no-op spends no grace", same.outcome.paddleOutSpent, 0);
}

/* ---- 10. Milestones and first-ever --------------------------------------- */

section("10. Milestones survive the change");
{
  const ctx = { schedule: MON_FRI };
  const r = run(state({ currentLen: 6, lastCompletedOn: "2026-08-07" }), "2026-08-10", ctx);
  check("7-Day Swell fires across a weekend", r.outcome.milestone, 7);

  const first = run(
    { currentLen: 0, longestLen: 0, lastCompletedOn: null, paddleOutAvailable: 0, paddleOutLastGranted: null },
    "2026-08-08", // a Saturday, off-schedule
    ctx
  );
  check("firstEver on a day off still counts", first.outcome.firstEver, true);
  check("streak starts at 1", first.next.currentLen, 1);
  check("…and is flagged off-schedule", first.outcome.onScheduledDay, false);
  check("milestone list unchanged", [...MILESTONES], [7, 30, 90, 365]);
}

/* ---- 11. Counting helper directly ---------------------------------------- */

section("11. countMissedWorkDays");
{
  check("Fri -> Mon, Mon–Fri worker", countMissedWorkDays("2026-08-07", "2026-08-10", { schedule: MON_FRI }), 0);
  check("Fri -> Mon, no schedule (every day)", countMissedWorkDays("2026-08-07", "2026-08-10", {}), 2);
  check("adjacent days", countMissedWorkDays("2026-08-10", "2026-08-11", { schedule: MON_FRI }), 0);
  check("same day", countMissedWorkDays("2026-08-10", "2026-08-10", { schedule: MON_FRI }), 0);
  // Aug 8 – Sep 6 inclusive holds 20 weekdays (Aug 31 is a Monday, Sep 1 a Tuesday).
  check("a full month away, Mon–Fri", countMissedWorkDays("2026-08-07", "2026-09-07", { schedule: MON_FRI }), 20);
  check("…all of it Island Time", countMissedWorkDays("2026-08-07", "2026-09-07", { schedule: MON_FRI, islandTime: [{ start: "2026-08-08", end: "2026-09-06" }] }), 0);
  check("a decade-old completion doesn't hang", countMissedWorkDays("2016-08-07", "2026-08-07", { schedule: MON_FRI }) > 2000, true);
}

/* ---- Summary ------------------------------------------------------------- */

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
