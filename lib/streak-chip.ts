/* ============================================================================
   EDIAGD — which face the header's streak chip is wearing

   PURE, AND SEPARATE FROM THE COMPONENT, so the five states can be asserted
   without a browser. The chip has more states than it looks: a number that may
   be zero, a sun that may have risen, and three different reasons it might not
   be counting at you today. That is the sort of thing that gets one branch
   wrong and nobody notices until an advisor on holiday is told their streak is
   at stake.

   NO ARITHMETIC LIVES HERE. `streak` arrives from swell.current_len — the same
   row /streak prints — and `rest` from restDayFor, which is what /today builds
   its rest card from. This only chooses how to draw what it was handed.
   ============================================================================ */

import type { RestDay } from "@/lib/work-schedule";

export type ChipForm =
  | {
      kind: "resting";
      /** `palm` is the hammock — Island Time only. */
      mark: "sun" | "palm";
      label: string;
    }
  | {
      kind: "counting";
      streak: number;
      /** Today's block is done: the sun is at full strength. */
      risen: boolean;
      label: string;
    };

export function streakChipForm({
  streak,
  rest,
  completedToday,
}: {
  streak: number;
  rest: RestDay | null;
  completedToday: boolean;
}): ChipForm {
  /*
   * REST WINS OVER EVERYTHING, INCLUDING A COMPLETED BLOCK. Somebody who
   * opened the app on their day off and did the loop anyway has not put their
   * Swell at risk and is not owed a countdown — the honest thing on a rest day
   * is "you're resting", whatever else happened.
   */
  if (rest) {
    return {
      kind: "resting",
      mark: rest.kind === "island_time" ? "palm" : "sun",
      label:
        rest.kind === "island_time"
          ? "Island Time today — your Swell holds. View your streak"
          : rest.kind === "store_closed"
            ? `${rest.label ?? "The store is closed"} — your Swell holds. View your streak`
            : "A day off — your Swell holds. View your streak",
    };
  }

  /*
   * ZERO IS A NUMBER LIKE ANY OTHER. No dimmed variant, no hiding it until day
   * one, no apologetic wording — Ryan's ruling is that zero is pre-dawn, not a
   * failure. The payoff is watching it turn over, and you cannot watch a
   * number turn over that was not on screen a moment earlier.
   */
  const n = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;

  return {
    kind: "counting",
    streak: n,
    risen: completedToday,
    label: `${n}-day Swell${completedToday ? ", today complete" : ", today still open"}. View your streak`,
  };
}
