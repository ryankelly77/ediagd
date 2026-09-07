"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isImmersive } from "./routes";

export type TabIcon = "sun" | "wave" | "shell" | "team" | "swag" | "more";

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
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
                >
                  <TabGlyph icon={tab.icon} active={active} />
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

/**
 * Inline SVGs — no icon package, and they inherit brand colour. Shapes lean on
 * the brand's own vocabulary: sunrise, wave, shell.
 */
function TabGlyph({ icon, active }: { icon: TabIcon; active: boolean }) {
  const color = active ? "var(--color-teal)" : "var(--color-ink-soft)";
  const common = {
    /* Up from 22 with the label, so the glyph and its caption grow together
       rather than the icon shrinking against bigger type. */
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "sun":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M7 18a5 5 0 0 1 10 0" />
          <path d="M12 5v2M5.6 7.6l1.4 1.4M18.4 7.6 17 9" />
        </svg>
      );
    case "wave":
      return (
        <svg {...common}>
          <path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 5-3" />
          <path d="M2 18c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 5-3" />
        </svg>
      );
    case "shell":
      return (
        <svg {...common}>
          <path d="M12 21a9 9 0 1 0-9-9c0 4 3 9 9 9Z" />
          <path d="M12 21c-2-4-2-9 0-13M12 21c2-4 2-9 0-13" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 6.5a3 3 0 0 1 0 5.8M17 20a6 6 0 0 0-2-4.4" />
        </svg>
      );
    case "swag":
      // The tote from /brand/icons/swag_shack.svg, inlined so it inherits the
      // active/inactive colour like every other tab glyph.
      return (
        <svg {...common}>
          <path d="M4.8 8h14.4l-1.1 11.1a1.6 1.6 0 0 1-1.6 1.4H7.5a1.6 1.6 0 0 1-1.6-1.4L4.8 8Z" />
          <path d="M9 8.6V6.4a3 3 0 0 1 6 0v2.2" />
          <path d="M8.9 14.6c1-1 2.1-1 3.1 0s2.1 1 3.1 0" strokeWidth={1.7} />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
  }
}

export default TabBar;
