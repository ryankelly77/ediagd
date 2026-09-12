"use client";

import Link from "next/link";
import { RestingMark } from "@/components/brand/badges/RestingMark";
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
   A day off, a booked Island Time day, a store closure — the chip drops the
   number entirely and shows the resting mark. Nothing is greyed out and
   nothing says "0 today": the streak has not broken, it is simply not being
   asked about. This is also the ONLY ambient Island Time indicator in the app,
   deliberately — one glance answers "am I resting today?" and there is no
   second thing to keep in sync with it.

   The pill itself does not change colour between the two states; only what is
   in it does. See the note at the resting branch for why the light pill was
   withdrawn.

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
      {form.kind === "resting" ? (
        /*
          ---------------------------------------------------------------------
          ONE PILL, NAVY, IN BOTH STATES — AND THE LIGHT ONE WAS A MISTAKE
          ---------------------------------------------------------------------
          The resting form used to be a pale `bg-teal-soft/60` pill, on the
          stated grounds that "RestingMark is inked in navy and teal and would
          disappear on the dark fill anyway". That sentence is simply wrong
          about the artwork. Every ink in the mark is a LIGHT ink — the wave and
          swell lines are MARK_WAVE #6fbcc6, the palm and hammock MARK_CREAM
          #f2efe8, the low sun MARK_SUN #e3b15c — so it was drawn for a dark
          fill and was being painted onto a light one.

          Measured against the pill it actually sat on:

              palm / hammock   1.14:1      on navy  15.01:1
              wave / swell     1.66:1      on navy   7.95:1
              low sun          1.50:1      on navy   8.79:1

          1.14:1 is not low contrast, it is not drawn. Ryan reported it from his
          phone as "the light logo on top of the light blue background".

          So the pill is navy in both states and the mark is used the way it was
          inked — which is also how the rest card uses it, on bg-navy. The
          two states are still told apart at a glance, by the thing that
          actually differs: a resting mark, or gold waves and a number. Colour
          was never carrying that distinction, because one of the two colours
          was invisible.
        */
        <RestingMark variant={form.mark} size={30} className="shrink-0" />
      ) : (
        <>
          {/*
            THE STREAK TAB'S OWN WAVE, imported rather than redrawn — see
            TabGlyph. The chip is a shortcut to that tab, so it wears that
            tab's mark; the brand's SwellSun was both inconsistent with the
            footer and unreadable at this size.

            currentColor, so it takes the white from the pill.
          */}
          {/*
            TWO VOICES, AND THAT IS THE WHOLE STRUCTURE. Gold waves, cream
            number — Ryan's ruling: the chip must never collapse into a solid
            gold object. The gold is the Swell (DESIGN_LANGUAGE names the Swell
            as one of gold's sanctioned uses); the number is just the count,
            and it reads as a count because it is not competing.
          */}
          <TabGlyph icon="wave" size={20} color="rgb(var(--ediagd-gold))" />
          <span className="ediagd-numeral text-sm font-extrabold tabular-nums text-cream">
            {form.streak}
          </span>
        </>
      )}
    </Link>
  );
}

export default StreakChip;
