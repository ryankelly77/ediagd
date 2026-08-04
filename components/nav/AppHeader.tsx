"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { isImmersive } from "./routes";

/**
 * The app identity bar: who you are, what you've banked, and the way into your
 * account. Pairs with the footer TabBar — footer is navigation, header is
 * identity and status.
 *
 * All data is resolved server-side in the (app) layout and passed in; this
 * component only decides whether to show at all and how to present it.
 */
export function AppHeader({
  greetingName,
  initials,
  balance,
}: {
  greetingName: string;
  initials: string;
  /** Sand Dollars, or null when the user has no ledger yet. */
  balance: number | null;
}) {
  const pathname = usePathname() ?? "";
  if (isImmersive(pathname)) return null;

  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-surface-card/95 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-app items-center gap-3 px-4 py-2.5">
        <img
          src="/brand/svg/ediagd-mark-primary-light.svg"
          alt=""
          className="h-7 w-auto shrink-0"
        />

        <p className="min-w-0 flex-1 truncate text-base font-extrabold text-navy">
          {BRAND.greeting}, {greetingName}
        </p>

        {/* Sand Dollars — glanceable; the full breakdown lives on /streak. */}
        <Link
          href="/streak"
          aria-label={`${balance ?? 0} Sand Dollars — view your Swell`}
          className="flex shrink-0 items-center gap-1.5 rounded-pill bg-gold-soft/60 px-2.5 py-1 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <span aria-hidden="true" className="text-sm leading-none">
            🐚
          </span>
          <span className="text-sm font-extrabold tabular-nums text-navy">
            {(balance ?? 0).toLocaleString()}
          </span>
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
