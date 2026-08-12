import Link from "next/link";

/**
 * The header every admin page uses: a back link, the title, then the content.
 *
 * One component rather than a hand-rolled header per page, so they can't drift
 * apart — which they had, with the Impact screens carrying their own arrow-and-
 * heading markup while the CMS and settings used this.
 *
 * There is deliberately no eyebrow above the title. It said "Admin tools" on
 * every admin screen, which is a label for something the reader already knows:
 * they arrived from the Admin hub, and the back link right above it says so.
 *
 * The back link always steps up ONE level (editor → its service list → all
 * services → Admin), so there's a path home from anywhere.
 *
 * `trail` is the ancestry ABOVE that one level, for screens buried deeper than
 * two — the library runs Lesson Library → course → module → quiz, and a back
 * link that skipped from the module straight home was both a lie about where
 * "back" goes and a dead end for anyone wanting the next module in the same
 * course. Passing the ancestors separately keeps `back` meaning exactly one
 * level, with no page having to restate its own parent twice.
 */
export type Crumb = { href: string; label: string };

export function AdminPageHeader({
  back,
  trail,
  title,
  subtitle,
  action,
}: {
  back: Crumb;
  /** Ancestors above `back`, nearest last. Omit on two-level screens. */
  trail?: Crumb[];
  title: string;
  subtitle?: React.ReactNode;
  /** Optional right-aligned control, e.g. a "New content" button. */
  action?: React.ReactNode;
}) {
  const crumbs = [...(trail ?? []), back];

  return (
    <header>
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-x-1.5 gap-y-1"
      >
        <span aria-hidden="true" className="text-xs font-bold text-ocean">
          ‹
        </span>
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-x-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-[11px] text-ink-soft">
                ›
              </span>
            )}
            <Link
              href={c.href}
              className="text-xs font-bold uppercase tracking-[0.18em] text-ocean hover:underline"
            >
              {c.label}
            </Link>
          </span>
        ))}
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-navy">{title}</h1>
          {subtitle && (
            <div className="mt-0.5 text-sm text-ink-soft">{subtitle}</div>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}

export default AdminPageHeader;
