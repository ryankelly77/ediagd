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
  "scheduled day off (Saturday, Mon-Fri advisor) -> resting, low sun",
  streakChipForm({ streak: 12, rest: restDayFor(SATURDAY, bare), completedToday: false }),
  { kind: "resting", mark: "sun" }
);

check(
  "inside a booked Island Time range -> resting, hammock",
  streakChipForm({ streak: 12, rest: restDayFor(WEDNESDAY, onIsland), completedToday: false }),
  { kind: "resting", mark: "palm" }
);

check(
  "confirmed store closure -> resting, low sun, closure named",
  streakChipForm({ streak: 12, rest: restDayFor(WEDNESDAY, storeShut), completedToday: false }),
  { kind: "resting", mark: "sun" }
);

/* Rest outranks a completed block: doing the loop on your day off does not
   turn the chip back into a countdown. */
check(
  "rest day where the block was completed anyway -> still resting",
  streakChipForm({ streak: 12, rest: restDayFor(SATURDAY, bare), completedToday: true }),
  { kind: "resting", mark: "sun" }
);

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
