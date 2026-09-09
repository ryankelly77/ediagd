import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { getAdminContext } from "@/lib/guards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentFilters } from "@/components/admin/content/ContentFilters";
import { ContentResultRow } from "@/components/admin/content/ContentResultRow";
import { BulkPublish } from "@/components/admin/content/BulkPublish";
import {
  ALL_SERVICES,
  NO_SERVICE,
  PAGE_SIZE,
  STATUS_META,
  serviceLabel,
  TYPE_META,
  slugToService,
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
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

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

  /*
   * ---- RETIRED IS NOT DRAFT, THOUGH IT WEARS THE SAME STATUS -------------
   *
   * Retiring is this app's replacement for delete: it sets retired_at AND
   * unpublishes, so a retired row has status='draft'. Filtering on status
   * alone therefore listed 129 retired items as things waiting to be
   * published — and with bulk publish on that screen, one "Select all" would
   * have resurrected every deleted item in the library.
   *
   * The detail screen has always shown these as Retired. The list never
   * asked. Ryan found it on the first row: "it's labeled as retired but shows
   * up when you have draft selected."
   *
   * Scoped to the DRAFT filter deliberately. Browsing everything should still
   * show a retired row — it exists, and hiding it is how somebody concludes
   * content vanished. It just is not a draft.
   */
  if (statusFilter === "draft") query = query.is("retired_at", null);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

  const rows = (data ?? []) as ContentRow[];

  /* What the bulk control may act on: the drafts actually rendered here. The
     ids come from the page rather than from the filter, so the number in the
     button is the number that moves. */
  const drafts = rows.filter((r) => r.status === "draft").map((r) => r.id);
  const draftLabels = Object.fromEntries(
    rows.filter((r) => r.status === "draft").map((r) => [r.id, r.title])
  );
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /*
   * THE TYPE NAMES THE PAGE WHEN THERE IS NO SERVICE TO NAME IT.
   * Arriving from the "Quotes" card gave a screen headed "All services", which
   * is true and useless — a quote has no service, so the only honest label for
   * that list is what is in it. Services keep their own name when there is one;
   * the type is appended so a filtered service list still says which filter is
   * on rather than silently showing a subset.
   */
  const heading = isAllServices
    ? typeFilter
      ? TYPE_META[typeFilter].plural
      : "All services"
    : serviceLabel(isNoService ? null : service) +
      (typeFilter ? ` · ${TYPE_META[typeFilter].plural}` : "");

  const newHref = isAllServices
    ? "/admin/content/item/new"
    : `/admin/content/item/new?service=${encodeURIComponent(service ?? "")}`;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/content", label: "All services" }}
        title={heading}
        subtitle={`${total.toLocaleString()} ${total === 1 ? "item" : "items"}${
          statusFilter ? ` · ${STATUS_META[statusFilter].label.toLowerCase()}` : ""
        }`}
        action={
          <Link
            href={newHref}
            className="rounded-xl bg-gold px-3 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            New content
          </Link>
        }
      />

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

      {/*
        BULK PUBLISH, ONLY WHERE IT MAKES SENSE.
        Shown when the list is filtered to drafts — publishing a list that
        already contains published items would mean ticking boxes to no effect,
        and "select all" would claim more than it does. The drafts view is the
        one the landing page's "Everything unpublished" already links to.
      */}
      {statusFilter === "draft" && (
        <div className="mt-4">
          {drafts.length > 0 ? (
            <BulkPublish ids={drafts} labels={draftLabels} />
          ) : (
            /* SAY SO. An empty drafts list with no message reads as a screen
               that failed to load — the reader cannot tell "nothing is waiting"
               from "something went wrong". */
            <Card className="p-5">
              <p className="text-base font-extrabold text-navy">
                Nothing waiting to publish
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Every item here is already published.
              </p>
            </Card>
          )}
        </div>
      )}

      {rows.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <ContentResultRow item={row} showService={isAllServices} />
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
