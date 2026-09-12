"use client";

import Link from "next/link";
import { TabGlyph } from "./TabGlyph";
import type { RestDay } from "@/lib/work-schedule";
import { streakChipForm } from "@/lib/streak-chip";

/* ============================================================================
   EDIAGD — the streak, made ambient

   ---------------------------------------------------------------------------
   IT TOOK THE BELL'S SLOT, AND THAT WAS THE TRADE
   ---------------------------------------------------------------------------
   The Swell is the number this product retains people with, and until now it
   was invisible unless you went looking for it on its own tab. The bell was
   the opposite: permanently present, permanently carrying a "9+", telling
   nobody anything they had asked to know. Ryan's ruling from his own phone was
   to swap them — the streak earns the slot, notifications become a dot on More.

   ---------------------------------------------------------------------------
   ZERO SHOWS, AND IT LOOKS LIKE ANY OTHER NUMBER
   ---------------------------------------------------------------------------
   No dimmed variant, no apologetic copy, no hiding it until day one. Ryan:
   zero is not a negative, it is pre-dawn. The whole point of showing it is the
   0 -> 1 flip the moment the day's block completes, and you cannot watch a
   number turn over that was not on screen a second earlier.

   ---------------------------------------------------------------------------
   ON A REST DAY IT STOPS COUNTING AT YOU
   ---------------------------------------------------------------------------
   A day off, a booked Island Time day, a store closure — the chip KEEPS the
   number and changes the glyph: waves on a working day, flat water on any
   kind of rest day. Nothing is greyed out and nothing says "0
   today": the streak has not broken, it is simply not being asked about.

   One glance answers "am I resting today?", which is the question the chip is
   for. It does not distinguish the three REASONS — a day off, a closure and
   Island Time all draw flat water — because that is a second question, and its
   answer is in the aria-label and on the rest card /today already renders.

   TWO EARLIER VERSIONS OF THIS WERE WRONG, both found on Ryan's phone rather
   than in review, which is worth remembering about a 50px object:

     1. A pale teal pill carrying RestingMark. Every ink in that mark is a
        light ink — MARK_WAVE #6fbcc6, MARK_CREAM #f2efe8, MARK_SUN #e3b15c —
        so the hammock sat at 1.14:1 against its own background. Not low
        contrast; not drawn. The pill is navy in both states now.
     2. Dropping the number on rest days. A rest day is precisely when somebody
        most wants to be told the Swell is INTACT, and a mark with no figure
        beside it makes them go and look. The number never leaves.

   ---------------------------------------------------------------------------
   IT HAS NO OPINION OF ITS OWN
   ---------------------------------------------------------------------------
   The number is `swell.current_len`, which is the same row the Streak screen
   reads. Nothing is recomputed here. If this chip and that screen could ever
   disagree, that is a bug in the chip and not a second opinion worth having.
   ============================================================================ */

export function StreakChip({
  streak,
  rest,
  completedToday,
}: {
  /** swell.current_len — the same value /streak prints. Never recomputed. */
  streak: number;
  /** Non-null on any day restDayFor claims. Shows the mark instead of a count. */
  rest: RestDay | null;
  /** Has today's block been completed? Changes the sun, not the number. */
  completedToday: boolean;
}) {
  /* Which face, and the words for it — lib/streak-chip.ts, so the five states
     can be asserted without a browser. See test:streak-chip. */
  const form = streakChipForm({ streak, rest, completedToday });

  return (
    <Link
      href="/streak"
      aria-label={form.label}
      /*
        SIBLING OF THE SAND DOLLARS PILL — same radius, same padding, same
        height — so the right-hand side of the header reads as one family of
        two things rather than a pill and some other widget.

        min-h-11 is 44px and is the tap target, not the visual weight; the fill
        is what you see and it is the same size as the pill's. DESIGN_LANGUAGE
        is explicit that touch targets are the one thing that SHOULD grow with
        the text, so this is a floor rather than a fixed height.
      */
      className="ediagd-streak-chip flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill bg-navy px-2.5 py-1.5 text-cream transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {/*
        ONE SHAPE, EVERY DAY. Glyph then number, on a navy pill, whether the
        Swell is being counted at or resting — see the note above. The only
        thing that moves between states is which glyph.

        THE STREAK TAB'S OWN WAVE on a working day, imported rather than
        redrawn — see TabGlyph. The chip is a shortcut to that tab, so it wears
        that tab's mark; the brand's SwellSun was both inconsistent with the
        footer and unreadable at this size. Flat water is drawn in the same
        hand, in the same file, for the same reason.

        TWO VOICES, AND THAT IS THE WHOLE STRUCTURE. Gold glyph, cream number —
        Ryan's ruling: the chip must never collapse into a solid gold object.
        The gold is the Swell (DESIGN_LANGUAGE names the Swell as one of gold's
        sanctioned uses); the number is just the count, and it reads as a count
        because it is not competing.
      */}
      <TabGlyph icon={form.icon} size={20} color="rgb(var(--ediagd-gold))" />
      <span className="ediagd-numeral text-sm font-extrabold tabular-nums text-cream">
        {form.streak}
      </span>
    </Link>
  );
}

export default StreakChip;
