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
 * SIZING IS THE CONSTRAINT. At 375px the right cluster (balance pill + avatar +
 * gaps) takes ~134px and the page padding 32px, leaving ~209px for the lockup.
 * With a 56px mark and its gap, the text block has ~145px. The tagline is 24
 * characters, so it sits at 8px with 0.1em tracking (~139px) — 9px or looser
 * tracking overflows into the pill. `truncate` is a last-resort guard only; the
 * type is sized to fit rather than relying on it.
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
      className="sticky top-0 z-40 border-b border-line bg-surface-card/95 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* py-1: the mark sets the height, so vertical padding stays minimal. */}
      <div className="mx-auto flex max-w-app items-center gap-2 px-4 py-1">
        {/* ---- The lockup ------------------------------------------------ */}
        <Link
          href="/"
          aria-label={`${BRAND.name} — ${BRAND.tagline}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {/* -primary-light is the navy-inked mark — the one for light surfaces. */}
          <img
            src="/brand/svg/ediagd-mark-primary-light.svg"
            alt=""
            className="h-14 w-auto shrink-0"
          />

          {/* Two lines, tight: leading-none on both, 2px between. */}
          <span className="min-w-0">
            <span className="block truncate font-display text-lg font-normal leading-none tracking-[0.2em] text-navy">
              {BRAND.name}
            </span>
            <span className="mt-[3px] block truncate text-[8px] font-semibold uppercase leading-none tracking-[0.1em] text-teal">
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
