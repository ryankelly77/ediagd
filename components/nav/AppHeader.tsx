"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { StreakChip } from "./StreakChip";
import { formatSandDollarsCompact } from "@/lib/sand-dollars";
import type { RestDay } from "@/lib/work-schedule";
import { BRAND } from "@/lib/brand";
import { isImmersive } from "./routes";

/**
 * The app identity bar: the brand lockup, what you've banked, and the way into
 * your account. Pairs with the footer TabBar — footer is navigation, header is
 * identity and status.
 *
 * SIZING IS THE CONSTRAINT, AND IT USED TO BE SOLVED THE WRONG WAY. The lockup
 * was flex-1 with `truncate` on both lines, so when the right cluster grew the
 * text column was squeezed and the words were cut. That is invisible at the
 * default text size and catastrophic above it: the audit measured the wordmark's
 * column at 102px of a needed 116 at 125%, 45px at 150%, and ZERO at 200% — the
 * brand name gone from every screen in the app.
 *
 * `truncate` was described here as "a last-resort guard only". It was not a
 * guard; it was the mechanism, and it fired for anybody who had turned text up
 * one notch in Display & Brightness — which for this audience is not an
 * accessibility edge case, it is a common setting.
 *
 * So nothing truncates now and the header GROWS instead. The row wraps: when
 * the lockup and the status cluster cannot share a line, the cluster drops to a
 * second one and the header gets taller. The hierarchy when space runs out is
 * explicit — the tagline wraps first, and the wordmark never shrinks, never
 * clips and never disappears.
 *
 * The greeting used to live here. It moved out rather than becoming a third
 * line — see the layout note in the report.
 */
export function AppHeader({
  balance,
  streak,
  rest,
  completedToday,
}: {
  /** Sand Dollars, or null when the user has no ledger yet. */
  balance: number | null;
  /** swell.current_len. The chip never recomputes it — see StreakChip. */
  streak: number;
  /** Today's rest reason, or null on a working day. */
  rest: RestDay | null;
  /** Whether today's block is already done. */
  completedToday: boolean;
}) {
  const pathname = usePathname() ?? "";
  if (isImmersive(pathname)) return null;

  return (
    <header
      /*
        THE SURFACE RUNS THROUGH THE TOP INSET.
        The inset is padding INSIDE this element, so its own background paints
        the status-bar area — never a margin above it, which would leave a band
        of the body colour between the system clock and the app.
        Opaque, for the same reason the tab bar is: at /95 the strip behind the
        status bar took a wash of the page gradient, which on a device reads as
        a seam rather than as translucency.
      */
      className="sticky top-0 z-40 border-b border-line bg-surface-card"
      /*
       * ALL THREE INSETS, not just the top. In landscape on a notched phone the
       * notch moves to the SIDE — about 59px of it — and the header's own px-4
       * is 16. The wordmark would have sat under it. The padding goes on this
       * element, the one carrying the background, so the surface still runs
       * edge to edge while the content steps clear.
       */
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {/* WRAPS RATHER THAN SQUEEZES. flex-wrap is what lets the header grow a
          row instead of crushing the lockup; py-1.5 and the gap give the two
          rows breathing room on the sizes where that happens. */}
      <div className="ediagd-header-bar mx-auto flex max-w-app flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5">
        {/* ---- The lockup ------------------------------------------------ */}
        {/* mr-auto rather than flex-1: the lockup takes the width it needs and
            pushes the cluster right, instead of being the thing that gives. */}
        <Link
          href="/"
          aria-label={`${BRAND.name} — ${BRAND.tagline}`}
          className="mr-auto flex items-center gap-2 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {/* -primary-light is the navy-inked mark — the one for light surfaces. */}
          {/*
            CAPPED, because a logo is not type. h-14 is 3.5rem, so at 200% text
            the mark would render 112px tall and own the screen. min() keeps it
            at its designed size once the text passes 100% — the words scale for
            legibility, the artwork does not need to.
          */}
          <img
            src="/brand/svg/ediagd-mark-primary-light.svg"
            alt=""
            className="w-auto shrink-0"
            style={{ height: "min(3.5rem, 56px)" }}
          />

          <span className="min-w-0">
            {/*
              CAPPED, FOR THE SAME REASON THE MARK IS: this is artwork, not
              content. Left to scale it reached 185px at 200% and pushed the
              account cluster onto a second row — Ryan saw the wrap and asked
              whether the wordmark should be hidden at large sizes.
              It should not: the ruling is that the wordmark never disappears,
              and it does not have to. Text scaling exists so words can be READ,
              and "EDIAGD" is a logo — nobody turned their text up in order to
              see the brand name bigger. Holding it at its designed size keeps
              the header one row and keeps the identity intact, which is both
              halves of what was asked for.
            */}
            <span
              className="block whitespace-nowrap font-display font-normal leading-none tracking-[0.2em] text-navy"
              style={{ fontSize: "min(1.125rem, 18px)" }}
            >
              {BRAND.name}
            </span>
            {/* YIELDS FIRST, and the ONE EXEMPTION TO THE 13px FLOOR.
                
                Everything else in the app was lifted to Apple's Footnote size;
                this stayed at 8px because it is part of the mark, not reading
                text — the same reason the wordmark beside it is capped and
                never scales. Measured at 13px: the lockup gets wide enough
                that the header wraps to two rows AT DEFAULT SIZE and grows
                from 68px to 116. Nobody turned their text up to read a
                tagline they have already seen on the login screen, and paying
                48px of every screen for it is not a trade worth making.
                
                It is also the first thing to go, so at any size where reading
                it would matter, it is not there. */}
            <span className="ediagd-yields-first mt-[3px] block text-[8px] font-semibold uppercase leading-tight tracking-[0.1em] text-teal">
              {BRAND.tagline}
            </span>
          </span>
        </Link>

        {/* ---- Status: exactly two things, at every size ---------------- */}
        {/*
          THE BELL AND THE AVATAR ARE BOTH GONE, and that is the point of this
          composition rather than a casualty of it.

          The bell was ambient guilt: a permanent "9+" in the chrome, telling
          you something was waiting every second of every day, whether or not
          you had any intention of reading it. Its unread state is now a single
          dot on the More tab — "there is something here when you want it" —
          and counts and lists live inside the notifications screen, where
          somebody has chosen to look at them. The avatar was a shortcut to a
          screen More already offers, so it cost a tap and no capability.

          What is left is the two numbers worth carrying everywhere: what you
          have banked, and how many days you have strung together.
        */}
        <Link
          href="/sand-dollars"
          aria-label={`${(balance ?? 0).toLocaleString()} Sand Dollars — view your ledger`}
          /*
            YIELDS SECOND. Folds at the largest sizes, where its balance is
            reprinted at the top of the More menu — so the number stays
            reachable and only the tap depth changes.
          */
          className="ediagd-yields-second flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill bg-gold-soft/60 px-2.5 py-1.5 text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <SandDollarIcon size={18} className="shrink-0" />
          {/*
            COMPACT HERE, EXACT EVERYWHERE ELSE. Three or four characters, so
            the pill cannot be the reason the header wraps — and floored, so a
            glance never overstates what is spendable. lib/sand-dollars.ts.
          */}
          <span className="ediagd-numeral text-sm font-extrabold tabular-nums">
            {formatSandDollarsCompact(balance)}
          </span>
        </Link>

        {/* The floor, alongside the wordmark. Nothing displaces the streak. */}
        <StreakChip streak={streak} rest={rest} completedToday={completedToday} />

      </div>
    </header>
  );
}

export default AppHeader;
