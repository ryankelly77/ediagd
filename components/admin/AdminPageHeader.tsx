import Link from "next/link";

/**
 * The header every admin sub-page uses: back link, eyebrow, title.
 *
 * One component rather than five hand-rolled headers, so the CMS and the
 * settings editor can't drift apart again. The back link always steps up ONE
 * level (editor → its service list → all services → /admin), so there's a path
 * home from anywhere.
 */
export function AdminPageHeader({
  back,
  eyebrow,
  title,
  subtitle,
  action,
}: {
  back: { href: string; label: string };
  eyebrow: string;
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

      <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
        {eyebrow}
      </p>

      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
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
