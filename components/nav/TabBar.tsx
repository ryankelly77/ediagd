"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isImmersive } from "./routes";
import { TabGlyph, type TabIcon } from "./TabGlyph";

export type Tab = {
  href: string;
  label: string;
  icon: TabIcon;
  /** Route prefixes that light this tab up. */
  match: string[];
  /**
   * Light this tab for anything NO tab claims. Exactly one should carry it.
   *
   * More is a drawer, not a destination: /saved, /library, /joe-the-pro,
   * /meetings, /group, /profile and /notifications are all reached through it,
   * and none of them were in any tab's `match`, so the bar went dark the moment
   * you followed a link out of it — the app reading as "you are nowhere"
   * on seven screens. /swag did it too, but only for managers, whose fifth slot
   * is Team.
   *
   * Listing those routes on More would have fixed today and broken again on the
   * next page added behind it, which is exactly how /saved arrived. A fallback
   * cannot go stale.
   */
  fallback?: boolean;
  /**
   * A quiet "there is something here" marker. Used only by More, for unread
   * notifications, now that the bell has left the header.
   *
   * DELIBERATELY NOT A COUNT. A permanent "9+" in the chrome is ambient guilt:
   * it tells you something is waiting every second of every day, whether or
   * not you meant to think about it, and it is the thing this app's design
   * exists to avoid. A dot says the same useful half — "when you want it,
   * there is something" — and says nothing about how far behind you are. The
   * number is on the notifications screen, where somebody chose to look.
   */
  dot?: boolean;
};

/**
 * How tall the bar's CONTENT is, above the home-indicator inset.
 *
 * ONE NUMBER, USED TWICE, because it was previously two and they disagreed:
 * the spacer reserved 4.5rem (72px) while the tabs were min-h 3.5rem (56px),
 * so every scrollable screen ended with 16px of dead space nobody could
 * explain. A fixed bar and the gap it leaves behind are the same measurement.
 *
 * 60 rather than 56: a 24px glyph, a 13px label and the active underline do not
 * fit in 56 without crowding, and this audience is not the one to crowd.
 */
const BAR_CONTENT_PX = 60;

/**
 * Fixed bottom tab bar. Mobile-first: safe-area aware, 56px+ targets.
 * The tab list is computed server-side in the (app) layout — this only decides
 * which one is active and whether to show at all.
 */
export function TabBar({
  tabs,
  showAdminInMore,
}: {
  tabs: Tab[];
  showAdminInMore?: boolean;
}) {
  const pathname = usePathname() ?? "";

  // /today is the immersive daily ritual — no chrome over it.
  if (isImmersive(pathname)) return null;

  /*
   * An explicit match always beats the fallback, so /swag lights the Swag tab
   * for an advisor who has one and More for a manager who does not — from the
   * same tab list, with no branch here. -1 when nothing matches and no tab is
   * marked fallback, which lights nothing, as before.
   */
  const explicit = tabs.findIndex((t) =>
    t.match.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
  const activeIndex = explicit !== -1 ? explicit : tabs.findIndex((t) => t.fallback);

  return (
    <>
      {/* Spacer so fixed-position chrome never covers the last row of content. */}
      <div
        aria-hidden="true"
        style={{ height: `calc(${BAR_CONTENT_PX}px + env(safe-area-inset-bottom, 0px))` }}
      />

      {/*
        THE SURFACE RUNS TO THE PHYSICAL EDGE.
        The inset is padding INSIDE this element, so its background paints the
        whole home-indicator area. It is also fully opaque now: at /95 over the
        body's gradient the last few pixels above the indicator took a faint
        wash of the page colour, which on a device reads as a seam between the
        app and the phone. Cream-on-cream buys nothing from a blur, and an
        opaque bar is the more legible one to put a 13px label on.
      */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-card"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          /* Landscape puts the notch on one side and the home indicator on the
             other. Five equal tabs measured against the full width would push
             the outer two under both. */
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <ul
          className="mx-auto flex max-w-app items-stretch"
          style={{ height: BAR_CONTENT_PX }}
        >
          {tabs.map((tab, i) => {
            const active = i === activeIndex;
            return (
              /* An equal fifth of the width, and the FULL height of the bar —
                 the tap target is the whole cell rather than the glyph and its
                 caption, so a thumb landing anywhere in the column works. */
              <li key={tab.label} className="flex flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  /* The dot is decorative; the fact it carries goes in the
                     accessible name instead, where a screen reader can use it. */
                  aria-label={tab.dot ? `${tab.label} — unread notifications` : undefined}
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
                >
                  {/* The dot rides the glyph, not the cell, so it sits on the
                      icon at every text size rather than drifting as the label
                      below it grows. */}
                  <span className="relative flex items-center justify-center">
                    <TabGlyph icon={tab.icon} color={active ? "var(--color-teal)" : "var(--color-ink-soft)"} />
                    {tab.dot && (
                      <span
                        aria-hidden="true"
                        className="ediagd-more-dot absolute -right-1 -top-0.5 h-2 w-2 rounded-pill bg-gold ring-2 ring-surface-card"
                      />
                    )}
                  </span>
                  {/*
                    13px, and `ink` rather than `ink-soft` when inactive.
                    11px was below the floor Ryan set for this audience, and
                    ink-soft on the bar measured 4.77:1 — over AA by a margin
                    thin enough that any future tint change breaks it silently.
                    ink is 11.2:1. Active stays navy, and the gold underline and
                    teal glyph carry the state, so nothing depended on the
                    inactive label being the faint one.
                  */}
                  <span
                    className={`font-bold tracking-wide ${active ? "text-navy" : "text-ink"}`}
                    style={{ fontSize: 13, lineHeight: "16px" }}
                  >
                    {tab.label}
                  </span>
                  {/* Active underline in gold — the brand's celebration colour. */}
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 h-0.5 w-6 rounded-pill ${
                      active ? "bg-gold" : "bg-transparent"
                    }`}
                  />
                </Link>
              </li>
            );
          })}
          {showAdminInMore && null /* Admin is reachable from /more */}
        </ul>
      </nav>
    </>
  );
}

export default TabBar;
