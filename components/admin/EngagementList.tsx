import Link from "next/link";
import { Card } from "@/components/brand/Card";
import { BAND_META, type EngagementBand } from "@/lib/admin";

/* ============================================================================
   EDIAGD — the exceptions list
   Worst first, and deliberately NOT everything. An owner opens this screen to
   find out who to call; a 300-row table answers that question worse than ten
   rows does. The count line says plainly how much is being withheld.
   ============================================================================ */

export type EngagementRow = {
  id: string;
  name: string;
  score: number | null;
  band: EngagementBand;
  /** "5 advisors" or "12 of 20 days" — one line of context. */
  detail: string;
  href?: string;
  /**
   * Opens in place instead of navigating. Already rendered by the server —
   * the page batch-loads detail for the rows it is about to show, so opening
   * a card is free. Mutually exclusive with href: a row either goes
   * somewhere or opens, never both.
   */
  expand?: React.ReactNode;
};

export function EngagementList({
  rows,
  total,
  shown,
  moreHref,
  heading,
  emptyLine,
}: {
  rows: EngagementRow[];
  /** How many match the current filter in the database, not in this page. */
  total: number;
  shown: number;
  moreHref: string | null;
  heading: string;
  emptyLine: string;
}) {
  if (rows.length === 0) {
    return (
      <>
        <h2 className="ediagd-eyebrow mt-6 px-1">{heading}</h2>
        <Card className="mt-2 p-6 text-center">
          <p className="text-base font-extrabold text-navy">Nothing to chase</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {emptyLine}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="mt-6 flex items-baseline justify-between gap-3 px-1">
        <h2 className="ediagd-eyebrow">{heading}</h2>
        <span className="ediagd-numeral text-xs font-bold text-ink-soft">
          {shown} of {total}
        </span>
      </div>

      <Card className="mt-2 px-4">
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id}>
              <RowBody row={row} />
            </li>
          ))}
        </ul>
      </Card>

      {moreHref && total > shown && (
        <Link
          href={moreHref}
          // The new rows land underneath the button you just pressed; jumping
          // to the top of the page would lose them.
          scroll={false}
          className="mt-3 flex w-full items-center justify-center rounded-xl border border-line bg-surface-card p-3.5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Show more ({(total - shown).toLocaleString()} left)
        </Link>
      )}
    </>
  );
}

/**
 * <details> rather than state: no client component, no navigation, and so
 * nothing can move the page under the admin's thumb. The marker is hidden and
 * replaced by the chevron the rest of the list already uses.
 */
function ExpandableRow({ row }: { row: EngagementRow }) {
  return (
    <details className="group">
      <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
        <RowInner row={row} />
        <span
          aria-hidden="true"
          className="text-lg leading-none text-ink-soft transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      {row.expand}
    </details>
  );
}

function RowBody({ row }: { row: EngagementRow }) {
  if (row.expand) return <ExpandableRow row={row} />;

  if (!row.href) {
    return (
      <div className="flex items-center gap-3 py-3.5">
        <RowInner row={row} />
      </div>
    );
  }

  return (
    <Link
      href={row.href}
      className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <RowInner row={row} />
      <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
        ›
      </span>
    </Link>
  );
}

/** The row itself — identical whether it links, opens, or just sits there. */
function RowInner({ row }: { row: EngagementRow }) {
  const meta = BAND_META[row.band];

  return (
    <>
      {/* The score carries the colour; no red anywhere. */}
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-card"
        style={{
          background: `color-mix(in srgb, rgb(var(--ediagd-${meta.color})) 16%, transparent)`,
        }}
      >
        <span
          className="ediagd-numeral text-base font-extrabold"
          style={{ color: `rgb(var(--ediagd-${meta.color}))` }}
        >
          {row.score ?? "—"}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-navy">
          {row.name}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {meta.label} · {row.detail}
        </span>
      </span>
    </>
  );
}

export default EngagementList;
