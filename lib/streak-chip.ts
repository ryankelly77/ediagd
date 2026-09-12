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

/*
 * ---------------------------------------------------------------------------
 * THE NUMBER IS ALWAYS THERE. THE GLYPH IS WHAT CHANGES.
 * ---------------------------------------------------------------------------
 * The resting face used to drop the count entirely and show a rest mark on its
 * own. Ryan's ruling, seeing it on his phone: keep the pill with the streak
 * number in it on rest days, and change the icon to indicate the rest — the
 * wave is a work day.
 *
 * He is right, and the old version gave away the one thing the chip exists for.
 * The Swell is the number this product retains people with; a rest day is
 * precisely when an advisor most wants to be told the number is INTACT, and
 * showing a mark with no figure beside it makes them go and look. "12, resting"
 * answers both questions at a glance. It also means the pill never changes
 * shape between days, so the number does not jump around the header.
 *
 * So every state now carries `streak`, and `icon` is the whole difference:
 * waves on a working day, flat water on any day off.
 */
export type ChipForm =
  | {
      kind: "resting";
      streak: number;
      /** One glyph for every rest reason — see the note below. */
      icon: "calm";
      label: string;
    }
  | {
      kind: "counting";
      streak: number;
      icon: "wave";
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
  /*
   * ZERO IS A NUMBER LIKE ANY OTHER. No dimmed variant, no hiding it until day
   * one, no apologetic wording — Ryan's ruling is that zero is pre-dawn, not a
   * failure. The payoff is watching it turn over, and you cannot watch a
   * number turn over that was not on screen a moment earlier.
   *
   * Read before the rest branch now, because the rest branch shows it too.
   */
  const n = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;

  if (rest) {
    return {
      kind: "resting",
      streak: n,
      /* THE SAME GLYPH FOR ALL THREE REASONS. Ryan's call: the chip answers
         "is anything being asked of me today", and that has two answers. Which
         KIND of rest it is stays in the label below, where Island Time and the
         closure are both still named — so the distinction is not lost, it is
         just not spent on twelve pixels of gold. */
      icon: "calm",
      /* The number goes FIRST in the label for the same reason it is on the
         screen: a screen reader should answer "what is my Swell" before it
         explains why nothing is being asked of them today. */
      label:
        rest.kind === "island_time"
          ? `${n}-day Swell — Island Time today, your Swell holds. View your streak`
          : rest.kind === "store_closed"
            ? `${n}-day Swell — ${rest.label ?? "the store is closed"}, your Swell holds. View your streak`
            : `${n}-day Swell — a day off, your Swell holds. View your streak`,
    };
  }

  return {
    kind: "counting",
    streak: n,
    icon: "wave",
    risen: completedToday,
    label: `${n}-day Swell${completedToday ? ", today complete" : ", today still open"}. View your streak`,
  };
}
