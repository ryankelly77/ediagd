import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { getAdminContext } from "@/lib/guards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentSearchBar } from "@/components/admin/content/ContentSearchBar";
import {
  ALL_SERVICES,
  CONTENT_TYPES,
  TYPE_META,
  serviceLabel,
  serviceToSlug,
  type ContentStatus,
  type ContentType,
} from "@/lib/content";

type Tally = { total: number; published: number; draft: number };

type ServiceBucket = Tally & { service: string | null };

const emptyTally = (): Tally => ({ total: 0, published: 0, draft: 0 });

function count(tally: Tally, status: ContentStatus) {
  tally.total++;
  if (status === "published") tally.published++;
  else tally.draft++;
}

/**
 * PostgREST can't GROUP BY, and adding an RPC would mean a migration, so we
 * page through a small projection (type, service_family, status) and tally in
 * memory. ~1,700 rows of three small columns is cheap, and ONE pass yields both
 * the per-service buckets and the per-type totals — no extra count queries.
 * Revisit with a view if the library grows an order of magnitude.
 */
async function loadBuckets(
  supabase: Awaited<ReturnType<typeof getAdminContext>>["supabase"]
): Promise<{
  buckets: ServiceBucket[];
  byType: Record<ContentType, Tally>;
  totalDrafts: number;
  total: number;
}> {
  const pageSize = 1000; // PostgREST caps a single response; page until short.
  const rows: {
    type: ContentType;
    service_family: string | null;
    status: ContentStatus;
  }[] = [];

  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("content")
      .select("type, service_family, status")
      .order("service_family", { ascending: true, nullsFirst: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error || !data || data.length === 0) break;
    rows.push(
      ...data.map((r) => ({
        type: r.type as ContentType,
        service_family: (r.service_family as string | null) ?? null,
        status: r.status as ContentStatus,
      }))
    );
    if (data.length < pageSize) break;
  }

  // Every type starts at zero, so a type with no content still gets a card —
  // "0 items" is real information (the videos aren't built yet).
  const byType = Object.fromEntries(
    CONTENT_TYPES.map((t) => [t, emptyTally()])
  ) as Record<ContentType, Tally>;

  const byService = new Map<string, ServiceBucket>();

  for (const row of rows) {
    const key = row.service_family ?? " none";
    const bucket =
      byService.get(key) ?? { service: row.service_family, ...emptyTally() };
    count(bucket, row.status);
    byService.set(key, bucket);

    if (byType[row.type]) count(byType[row.type], row.status);
  }

  const buckets = [...byService.values()].sort((a, b) => {
    // Named services first, alphabetical; the "no service" bucket last.
    if (a.service == null) return 1;
    if (b.service == null) return -1;
    return a.service.localeCompare(b.service);
  });

  return {
    buckets,
    byType,
    totalDrafts: buckets.reduce((sum, b) => sum + b.draft, 0),
    total: rows.length,
  };
}

export default async function ContentHomePage() {
  const { supabase, userId, isAdmin } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!isAdmin) return <AdminsOnly />;

  const { buckets, byType, totalDrafts, total } = await loadBuckets(supabase);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        eyebrow="Coaching content"
        title="Browse by service"
        subtitle={`${total.toLocaleString()} items across ${buckets.length} ${
          buckets.length === 1 ? "grouping" : "groupings"
        }.`}
      />

      <ContentSearchBar />

      {/* ---- Library shape, by content type ------------------------------ */}
      <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CONTENT_TYPES.map((type) => {
          const tally = byType[type];
          return (
            <li key={type}>
              <Card className="h-full p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                  {TYPE_META[type].plural}
                </p>
                <p className="mt-1 text-3xl font-extrabold tracking-tight text-navy">
                  {tally.total.toLocaleString()}
                </p>
                <p className="mt-1 text-xs font-semibold">
                  <span className="text-palm">
                    {tally.published.toLocaleString()} published
                  </span>
                  <span className="text-ink-soft"> · </span>
                  <span className="text-clay">
                    {tally.draft.toLocaleString()} draft
                  </span>
                </p>
              </Card>
            </li>
          );
        })}
      </ul>

      {/* ---- Mitch's to-do list: everything still in draft ---------------- */}
      <Link
        href={`/admin/content/service/${ALL_SERVICES}?status=draft`}
        className="mt-5 block rounded-card bg-navy p-5 shadow-card transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
          Drafts / needs review
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight text-white">
            {totalDrafts.toLocaleString()}
          </span>
          <span className="text-sm font-bold text-ice-dim">
            {totalDrafts === 1 ? "item waiting" : "items waiting"}
          </span>
        </p>
        <p className="mt-2 text-sm text-ice-dim">
          Everything unpublished, across every service. →
        </p>
      </Link>

      <div className="mt-5 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Services
        </h2>
        <Link
          href="/admin/content/item/new"
          className="rounded-xl bg-gold px-3 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          New content
        </Link>
      </div>

      {buckets.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {buckets.map((bucket) => (
            <li key={bucket.service ?? "__none__"}>
              <Card>
                <Link
                  href={`/admin/content/service/${serviceToSlug(bucket.service)}`}
                  className="flex items-center gap-3 p-4 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-extrabold text-navy">
                      {serviceLabel(bucket.service)}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      {bucket.total.toLocaleString()} total ·{" "}
                      <span className="font-bold text-palm">
                        {bucket.published.toLocaleString()} published
                      </span>{" "}
                      ·{" "}
                      <span className="font-bold text-clay">
                        {bucket.draft.toLocaleString()} draft
                      </span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-lg text-ink-soft">
                    ›
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="mt-2 p-5">
          <p className="text-base font-extrabold text-navy">No content yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            Add your first cue with “New content”.
          </p>
        </Card>
      )}
    </main>
  );
}
