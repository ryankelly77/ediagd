import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { getAdminContext } from "@/lib/guards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentResultRow } from "@/components/admin/content/ContentResultRow";
import { ContentSearchBar } from "@/components/admin/content/ContentSearchBar";
import { byRelevance, type ContentRow, type ContentStatus } from "@/lib/content";

/** Results are capped so a two-letter query can't pull the whole library. */
const RESULT_CAP = 100;

/**
 * PostgREST parses `or=(...)` as a comma-separated list, so a comma or bracket
 * in the query would break the filter. Wrapping each value in double quotes
 * makes those literal; backslashes and quotes still need escaping first.
 *
 * Note: % and _ remain ilike wildcards — searching "50%" matches loosely rather
 * than literally. Acceptable for a content search; worth revisiting if it bites.
 */
function escapeForOrFilter(query: string): string {
  return query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const STATUS_TABS: { label: string; value: ContentStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Published", value: "published" },
  { label: "Draft", value: "draft" },
];

export default async function ContentSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const statusFilter = (params.status ?? "") as ContentStatus | "";

  let rows: ContentRow[] = [];
  let total = 0;
  let errorMessage: string | null = null;

  if (query.length > 0) {
    const safe = escapeForOrFilter(query);

    // Two queries, deliberately.
    //
    // Sorting only what a single capped query returns would still bury the best
    // matches: with 183 hits for "warranty", a cue TITLED "Warranty…" sitting at
    // database position 120 never reaches the sort. So we fetch title matches
    // explicitly, then fill the remaining slots from the full match set. The
    // exact count still comes from the full set, so the header stays honest.
    let titleRequest = supabase
      .from("content")
      .select("*")
      .ilike("title", `%${query}%`)
      .order("title", { ascending: true })
      .limit(RESULT_CAP);

    let allRequest = supabase
      .from("content")
      .select("*", { count: "exact" })
      .or(`title.ilike."%${safe}%",body.ilike."%${safe}%"`)
      .order("updated_at", { ascending: false })
      .limit(RESULT_CAP);

    if (statusFilter) {
      titleRequest = titleRequest.eq("status", statusFilter);
      allRequest = allRequest.eq("status", statusFilter);
    }

    const [titleResult, allResult] = await Promise.all([titleRequest, allRequest]);

    if (allResult.error) errorMessage = allResult.error.message;
    else if (titleResult.error) errorMessage = titleResult.error.message;

    const seen = new Set<string>();
    const merged: ContentRow[] = [];
    for (const row of [
      ...((titleResult.data ?? []) as ContentRow[]),
      ...((allResult.data ?? []) as ContentRow[]),
    ]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }

    // count is the true match total across title AND body; merged is capped.
    total = allResult.count ?? merged.length;
    rows = merged.sort(byRelevance(query)).slice(0, RESULT_CAP);
  }

  const capped = total > rows.length;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/content", label: "All services" }}
        eyebrow="Coaching content"
        title="Search"
        subtitle={
          query.length > 0
            ? `${total.toLocaleString()} ${total === 1 ? "match" : "matches"} for “${query}”`
            : "Search titles and body text across every service."
        }
      />

      {/* autoNavigate off: on the results page we don't want to re-navigate
          mid-typing — the user submits when they're ready. */}
      <ContentSearchBar initialQuery={query} autoNavigate={false} />

      {query.length > 0 && (
        <nav
          aria-label="Filter by status"
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const href = tab.value
              ? `/admin/content/search?q=${encodeURIComponent(query)}&status=${tab.value}`
              : `/admin/content/search?q=${encodeURIComponent(query)}`;
            return (
              <Link
                key={tab.label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-pill px-3 py-1.5 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  active
                    ? "bg-navy text-white"
                    : "border border-line bg-surface-card text-navy hover:bg-teal-soft/20"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}

          {/* Explicit way out of a search, back to the full library. */}
          <Link
            href="/admin/content"
            className="ml-auto text-sm font-bold text-ocean hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Clear search ✕
          </Link>
        </nav>
      )}

      {errorMessage && (
        <Card className="mt-4 p-5">
          <p className="text-sm font-bold text-clay">
            Couldn&apos;t run that search: {errorMessage}
          </p>
        </Card>
      )}

      {capped && !errorMessage && (
        <p className="mt-4 rounded-xl border border-line bg-gold-soft/40 px-4 py-3 text-sm font-semibold text-navy">
          Showing the first {rows.length} of {total.toLocaleString()} matches —
          refine your search to narrow it down.
        </p>
      )}

      {query.length === 0 ? (
        <Card className="mt-4 p-5">
          <p className="text-base font-extrabold text-navy">
            What are you looking for?
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Search matches partial words in both the title and the body of every
            cue — drafts included.
          </p>
        </Card>
      ) : rows.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <ContentResultRow item={row} showService />
            </li>
          ))}
        </ul>
      ) : (
        !errorMessage && (
          <Card className="mt-4 p-5">
            <p className="text-base font-extrabold text-navy">
              No content matches “{query}”
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Try a shorter or more general term
              {statusFilter ? ", or switch the status filter back to All" : ""}.
            </p>
          </Card>
        )
      )}
    </main>
  );
}
