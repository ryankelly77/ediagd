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
};

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

  return (
    <>
      {/* Spacer so fixed-position chrome never covers the last row of content. */}
      <div
        aria-hidden="true"
        style={{ height: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
      />

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="mx-auto flex max-w-app items-stretch">
          {tabs.map((tab) => {
            const active = tab.match.some(
              (p) => pathname === p || pathname.startsWith(`${p}/`)
            );
            return (
              <li key={tab.label} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <TabGlyph icon={tab.icon} active={active} />
                  <span
                    className={`text-[11px] font-bold tracking-wide ${
                      active ? "text-navy" : "text-ink-soft"
                    }`}
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
    width: 22,
    height: 22,
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
