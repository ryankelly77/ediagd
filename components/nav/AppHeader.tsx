"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
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
  initials,
  balance,
  unreadCount = 0,
}: {
  initials: string;
  /** Sand Dollars, or null when the user has no ledger yet. */
  balance: number | null;
  /** Unread notifications. Resolved in the layout; the nav never queries. */
  unreadCount?: number;
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
      <div className="mx-auto flex max-w-app flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5">
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
            {/* NEVER WRAPS, NEVER TRUNCATES. If it cannot fit beside the status
                cluster, the cluster is what moves — see flex-wrap above. */}
            <span className="block whitespace-nowrap font-display text-lg font-normal leading-none tracking-[0.2em] text-navy">
              {BRAND.name}
            </span>
            {/* The tagline yields first: it is allowed to wrap onto a second
                line rather than being cut, which is the one of the two that can
                afford to take up room. */}
            <span className="mt-[3px] block text-[8px] font-semibold uppercase leading-tight tracking-[0.1em] text-teal">
              {BRAND.tagline}
            </span>
          </span>
        </Link>

        {/* ---- Status + account ------------------------------------------ */}
        <Link
          href="/sand-dollars"
          aria-label={`${balance ?? 0} Sand Dollars — view your ledger`}
          className="flex shrink-0 items-center gap-1.5 rounded-pill bg-gold-soft/60 px-2.5 py-1.5 text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <SandDollarIcon size={18} className="shrink-0" />
          <span className="ediagd-numeral text-sm font-extrabold">
            {(balance ?? 0).toLocaleString()}
          </span>
        </Link>

        {/* The count is a WIN-FIRST inbox, so the badge is gold rather than a
            warning colour — an unread notification is more often good news
            than bad, and the header should not imply otherwise. */}
        <Link
          href="/notifications"
          aria-label={
            unreadCount > 0
              ? `Notifications — ${unreadCount} unread`
              : "Notifications"
          }
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-navy transition hover:bg-teal-soft/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="ediagd-numeral absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-gold px-1 text-[10px] font-extrabold text-navy"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        <Link
          href="/profile"
          aria-label="Your account"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-teal text-sm font-extrabold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}

export default AppHeader;

/** A bell, drawn rather than imported — one shape, no icon dependency. */
function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7" />
      <path d="M13.7 20a1.94 1.94 0 0 1-3.4 0" />
    </svg>
  );
}
