import Link from "next/link";
import { Card } from "@/components/brand/Card";
import {
  STATUS_META,
  TIER_LABEL,
  TYPE_META,
  snippet,
  type ContentRow,
  type ContentStatus,
} from "@/lib/content";
import { libraryLabel } from "@/lib/library";

/**
 * One content row — title, body snippet, type/tier/status badges.
 * Shared by the per-service list and search results so the two can't diverge.
 */
export function ContentResultRow({
  item,
  showService = false,
}: {
  item: ContentRow;
  /** Show the service badge (search spans services; a service list doesn't). */
  showService?: boolean;
}) {
  return (
    <Card>
      <Link
        href={`/admin/content/item/${item.id}`}
        className="block p-4 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* COMPOSED, NOT REWRITTEN. Thirteen films are titled "On the
                Drive" and three more stage names repeat a dozen times each —
                the op code is what tells them apart, and it lives in its own
                column rather than in the title. See libraryLabel in lib/library. */}
            <p className="text-base font-bold text-navy">
              {libraryLabel({
                title: item.title,
                opCode: item.op_code,
                resolvedServiceFamily: item.resolved_service_family ?? item.service_family,
              })}
            </p>
            {item.body && (
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {snippet(item.body, 120)}
              </p>
            )}
          </div>
          <span aria-hidden="true" className="text-lg text-ink-soft">
            ›
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge>{TYPE_META[item.type].short}</Badge>
          {item.tier && <Badge>{TIER_LABEL[item.tier]}</Badge>}
          {/* The family badge is dropped when the label already names it —
              otherwise a search result says "Belts & Cooling" twice. */}
          {showService && item.service_family && !item.op_code && (
            <Badge>{item.service_family}</Badge>
          )}
          <StatusBadge status={item.status} />
        </div>
      </Link>
    </Card>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-pill bg-teal-soft/50 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-navy">
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ContentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="rounded-pill px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide"
      style={{
        color: `var(--color-${meta.color})`,
        backgroundColor: `color-mix(in srgb, var(--color-${meta.color}) 15%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  );
}

export default ContentResultRow;
