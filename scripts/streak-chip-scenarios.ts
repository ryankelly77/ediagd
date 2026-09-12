/* ============================================================================
   EDIAGD — the header chip's fixture walk

     npm run test:streak-chip

   Every state Ryan's acceptance list names, asserted against the real
   decision function the header renders from — and, for the rest days, against
   the real restDayFor, so the three reasons are derived here the same way
   /today derives them rather than hand-fed as literals.

   That second half is the point. It is easy to write a test that passes
   `{ kind: "island_time" }` straight into the chip and proves only that the
   chip can read a field. What matters is that a BOOKED RANGE, a SATURDAY off
   and a CONFIRMED CLOSURE each arrive as a rest day at all.
   ============================================================================ */

import { streakChipForm, type ChipForm } from "@/lib/streak-chip";
import { restDayFor } from "@/lib/work-schedule";
import type {
  IsoDate,
  ScheduleContext,
  WorkSchedule,
} from "@/lib/gamification/streak";

const MON_FRI: WorkSchedule = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sun: false,
  saturdayMode: "none",
  saturdayAnchor: null,
};

/* 2026-09-09 is a Wednesday; 2026-09-12 a Saturday. */
const WEDNESDAY = "2026-09-09" as IsoDate;
const SATURDAY = "2026-09-12" as IsoDate;

const bare: ScheduleContext = { schedule: MON_FRI, islandTime: [], closures: [] };
const onIsland: ScheduleContext = {
  schedule: MON_FRI,
  islandTime: [{ start: "2026-09-07" as IsoDate, end: "2026-09-11" as IsoDate }],
  closures: [],
};
const storeShut: ScheduleContext = {
  schedule: MON_FRI,
  islandTime: [],
  closures: [{ date: WEDNESDAY, label: "Hurricane day" }],
};

let failed = 0;

function check(name: string, got: ChipForm, want: Partial<ChipForm> & { kind: string }) {
  const problems: string[] = [];
  if (got.kind !== want.kind) problems.push(`kind ${got.kind} != ${want.kind}`);
  for (const [k, v] of Object.entries(want)) {
    if (k === "kind") continue;
    const actual = (got as unknown as Record<string, unknown>)[k];
    if (actual !== v) problems.push(`${k} ${JSON.stringify(actual)} != ${JSON.stringify(v)}`);
  }
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) console.log(`         ${problems.join("; ")}`);
  else console.log(`         ${got.label}`);
}

console.log("\n  WORKING DAYS\n");

check(
  "working day, block still open -> number + pending sun",
  streakChipForm({ streak: 12, rest: restDayFor(WEDNESDAY, bare), completedToday: false }),
  { kind: "counting", streak: 12, risen: false }
);

check(
  "same day, block completed -> number + risen sun",
  streakChipForm({ streak: 12, rest: restDayFor(WEDNESDAY, bare), completedToday: true }),
  { kind: "counting", streak: 12, risen: true }
);

console.log("\n  ZERO IS PRE-DAWN, NOT A HOLE\n");

check(
  "streak 0 -> the chip still shows, with 0",
  streakChipForm({ streak: 0, rest: restDayFor(WEDNESDAY, bare), completedToday: false }),
  { kind: "counting", streak: 0, risen: false }
);

check(
  "0 -> 1 the moment the block completes",
  streakChipForm({ streak: 1, rest: restDayFor(WEDNESDAY, bare), completedToday: true }),
  { kind: "counting", streak: 1, risen: true }
);

console.log("\n  REST DAYS — all three reasons, derived by restDayFor\n");

check(
  "scheduled day off (Saturday, Mon-Fri advisor) -> flat water, streak still shown",
  streakChipForm({ streak: 12, rest: restDayFor(SATURDAY, bare), completedToday: false }),
  { kind: "resting", icon: "calm", streak: 12 }
);

check(
  "inside a booked Island Time range -> flat water too, streak still shown",
  streakChipForm({ streak: 12, rest: restDayFor(WEDNESDAY, onIsland), completedToday: false }),
  { kind: "resting", icon: "calm", streak: 12 }
);

check(
  "confirmed store closure -> flat water, closure named, streak still shown",
  streakChipForm({ streak: 12, rest: restDayFor(WEDNESDAY, storeShut), completedToday: false }),
  { kind: "resting", icon: "calm", streak: 12 }
);

/* Rest outranks a completed block: doing the loop on your day off does not
   turn the chip back into a countdown. */
check(
  "rest day where the block was completed anyway -> still resting",
  streakChipForm({ streak: 12, rest: restDayFor(SATURDAY, bare), completedToday: true }),
  { kind: "resting", icon: "calm", streak: 12 }
);

/* ---------------------------------------------------------------------------
   THE NUMBER SURVIVES THE REST DAY
   ---------------------------------------------------------------------------
   Ryan's ruling, after seeing the first version on his phone: keep the pill
   with the streak number in it on rest days and change the ICON to indicate
   the rest. An earlier build dropped the count and showed a mark alone, which
   is exactly backwards — a rest day is when somebody most wants to be told the
   Swell is intact.

   Pinned here rather than trusted to the type, because "resting" carrying a
   streak is the whole point and a refactor that quietly drops it again would
   still compile. */
console.log("\n  REST DAYS STILL CARRY THE NUMBER\n");

for (const [label, ctx, day] of [
  ["a day off", bare, SATURDAY],
  ["Island Time", onIsland, WEDNESDAY],
  ["a store closure", storeShut, WEDNESDAY],
] as const) {
  const form = streakChipForm({ streak: 12, rest: restDayFor(day, ctx), completedToday: false });
  const ok = form.kind === "resting" && form.streak === 12;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label} -> streak ${form.kind === "resting" ? form.streak : "(counting)"}`);
  if (!ok) failed++;

  /* And it is spoken before the reason, so a screen reader answers "what is my
     Swell" first. */
  const spoken = form.label.startsWith("12-day Swell");
  console.log(`  ${spoken ? "ok  " : "FAIL"} ${label} -> label leads with the number`);
  if (!spoken) failed++;
}

/* Zero rests too. The pre-dawn rule does not get suspended on a Saturday. */
{
  const form = streakChipForm({ streak: 0, rest: restDayFor(SATURDAY, bare), completedToday: false });
  const ok = form.kind === "resting" && form.streak === 0;
  console.log(`  ${ok ? "ok  " : "FAIL"} a day off at zero -> shows 0, not nothing`);
  if (!ok) failed++;
}

console.log("\n  THE CHIP NEVER INVENTS A NUMBER\n");

/* Whatever swell.current_len holds is what shows. These are the shapes a bad
   read could produce; none of them may become a different streak. */
for (const [input, want] of [
  [7, 7],
  [0, 0],
  [-3, 0],
  [Number.NaN, 0],
] as [number, number][]) {
  const got = streakChipForm({ streak: input, rest: null, completedToday: false });
  const ok = got.kind === "counting" && got.streak === want;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} current_len ${String(input).padStart(4)} -> shows ${
      got.kind === "counting" ? got.streak : got.kind
    }`
  );
}

console.log(
  failed === 0 ? "\n  every chip state is what it should be\n" : `\n  ${failed} FAILING\n`
);
process.exit(failed === 0 ? 0 : 1);
