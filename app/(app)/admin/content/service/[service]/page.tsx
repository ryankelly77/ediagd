import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { getAdminContext } from "@/lib/guards";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentFilters } from "@/components/admin/content/ContentFilters";
import {
  ALL_SERVICES,
  NO_SERVICE,
  PAGE_SIZE,
  STATUS_META,
  TIER_LABEL,
  TYPE_META,
  serviceLabel,
  slugToService,
  snippet,
  type ContentRow,
  type ContentStatus,
  type ContentTier,
  type ContentType,
} from "@/lib/content";

type SearchParams = {
  type?: string;
  tier?: string;
  status?: string;
  page?: string;
};

export default async function ContentServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { supabase, userId, isAdmin } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!isAdmin) return <AdminsOnly />;

  const { service: slug } = await params;
  const filters = await searchParams;

  const isAllServices = slug === ALL_SERVICES;
  const isNoService = slug === NO_SERVICE;
  const service = slugToService(slug);

  const page = Math.max(1, Number(filters.page ?? "1") || 1);
  const typeFilter = (filters.type ?? "") as ContentType | "";
  const tierFilter = (filters.tier ?? "") as ContentTier | "";
  // Default status is "all" — Mitch usually wants the whole picture; the drafts
  // shortcut on the landing page arrives with ?status=draft already set.
  const statusFilter = (filters.status ?? "") as ContentStatus | "";

  let query = supabase
    .from("content")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (isNoService) query = query.is("service_family", null);
  else if (!isAllServices) query = query.eq("service_family", service);

  if (typeFilter) query = query.eq("type", typeFilter);
  if (tierFilter) query = query.eq("tier", tierFilter);
  if (statusFilter) query = query.eq("status", statusFilter);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

  const rows = (data ?? []) as ContentRow[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const heading = isAllServices
    ? "All services"
    : serviceLabel(isNoService ? null : service);

  const newHref = isAllServices
    ? "/admin/content/item/new"
    : `/admin/content/item/new?service=${encodeURIComponent(service ?? "")}`;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <header>
        <Link
          href="/admin/content"
          className="text-xs font-bold uppercase tracking-[0.18em] text-ocean hover:underline"
        >
          ‹ All services
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold text-navy">
              {heading}
            </h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              {total.toLocaleString()} {total === 1 ? "item" : "items"}
              {statusFilter ? ` · ${STATUS_META[statusFilter].label.toLowerCase()}` : ""}
            </p>
          </div>
          <Link
            href={newHref}
            className="rounded-xl bg-gold px-3 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            New content
          </Link>
        </div>
      </header>

      <ContentFilters
        basePath={`/admin/content/service/${slug}`}
        type={typeFilter}
        tier={tierFilter}
        status={statusFilter}
      />

      {error && (
        <Card className="mt-4 p-5">
          <p className="text-sm font-bold text-clay">
            Couldn&apos;t load content: {error.message}
          </p>
        </Card>
      )}

      {rows.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <Link
                  href={`/admin/content/item/${row.id}`}
                  className="block p-4 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-navy">{row.title}</p>
                      {row.body && (
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                          {snippet(row.body)}
                        </p>
                      )}
                    </div>
                    <span aria-hidden="true" className="text-lg text-ink-soft">
                      ›
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge>{TYPE_META[row.type].short}</Badge>
                    {row.tier && <Badge>{TIER_LABEL[row.tier]}</Badge>}
                    {isAllServices && row.service_family && (
                      <Badge>{row.service_family}</Badge>
                    )}
                    <StatusBadge status={row.status} />
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        !error && (
          <Card className="mt-4 p-5">
            <p className="text-base font-extrabold text-navy">Nothing here</p>
            <p className="mt-1 text-sm text-ink-soft">
              No content matches these filters. Try widening them, or add
              something new.
            </p>
          </Card>
        )
      )}

      {lastPage > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-5 flex items-center justify-between gap-3"
        >
          <PageLink
            basePath={`/admin/content/service/${slug}`}
            filters={filters}
            page={page - 1}
            disabled={page <= 1}
          >
            ‹ Previous
          </PageLink>
          <span className="text-sm font-semibold text-ink-soft">
            Page {page} of {lastPage}
          </span>
          <PageLink
            basePath={`/admin/content/service/${slug}`}
            filters={filters}
            page={page + 1}
            disabled={page >= lastPage}
          >
            Next ›
          </PageLink>
        </nav>
      )}
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-pill bg-teal-soft/50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-navy">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: ContentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="rounded-pill px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
      style={{
        color: `var(--color-${meta.color})`,
        backgroundColor: `color-mix(in srgb, var(--color-${meta.color}) 15%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  );
}

function PageLink({
  basePath,
  filters,
  page,
  disabled,
  children,
}: {
  basePath: string;
  filters: SearchParams;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink-soft opacity-50">
        {children}
      </span>
    );
  }

  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.tier) query.set("tier", filters.tier);
  if (filters.status) query.set("status", filters.status);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();

  return (
    <Link
      href={qs ? `${basePath}?${qs}` : basePath}
      className="rounded-xl border border-line bg-surface-card px-3 py-2 text-sm font-bold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {children}
    </Link>
  );
}
