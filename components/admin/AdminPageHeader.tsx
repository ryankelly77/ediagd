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
 */
export function AdminPageHeader({
  back,
  title,
  subtitle,
  action,
}: {
  back: { href: string; label: string };
  title: string;
  subtitle?: React.ReactNode;
  /** Optional right-aligned control, e.g. a "New content" button. */
  action?: React.ReactNode;
}) {
  return (
    <header>
      <Link
        href={back.href}
        className="text-xs font-bold uppercase tracking-[0.18em] text-ocean hover:underline"
      >
        ‹ {back.label}
      </Link>

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
