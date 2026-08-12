import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ComingSoon, ItemRow } from "@/components/library/LibraryPieces";
import { getAdminContext } from "@/lib/guards";
import { checkEntitlement } from "@/lib/entitlements";
import { LIBRARY_PAGE_STEP, loadMakeVideos, resolveLibraryLimit } from "@/lib/library";

/**
 * One make's videos, with an optional service filter.
 *
 * The same entitlement check as the index, repeated rather than assumed: this
 * route is reachable by typing a URL, and a guard that only runs on the way in
 * is not a guard.
 */
export default async function MakePage({
  params,
  searchParams,
}: {
  params: Promise<{ make: string }>;
  searchParams: Promise<{ show?: string; service?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ent, admin] = await Promise.all([
    checkEntitlement(supabase, user.id, ["advisor", "manager"], "joe_the_pro"),
    getAdminContext(),
  ]);
  if (!ent.entitled && !admin.hasAdminAccess) redirect("/joe-the-pro");

  const { make: rawMake } = await params;
  const make = decodeURIComponent(rawMake);
  const { show, service } = await searchParams;
  const limit = resolveLibraryLimit(show);

  const { items, total, services } = await loadMakeVideos(
    supabase,
    make,
    limit,
    service || null
  );

  if (total === 0 && !service) notFound();

  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ service, show, ...next })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/joe-the-pro/${encodeURIComponent(make)}?${qs}` : `/joe-the-pro/${encodeURIComponent(make)}`;
  };

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/joe-the-pro", label: "Joe the Pro" }}
        title={make}
        subtitle={`${total} ${total === 1 ? "video" : "videos"}`}
      />

      {/* Service is a filter within the vehicle, never the way in. */}
      {services.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip href={href({ service: undefined, show: undefined })} active={!service}>
            All services
          </Chip>
          {services.map((s) => (
            <Chip key={s} href={href({ service: s, show: undefined })} active={service === s}>
              {s}
            </Chip>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <ComingSoon title="Nothing here yet">
          <p>
            No {make} videos{service ? ` for ${service}` : ""} have been
            published.
          </p>
        </ComingSoon>
      ) : (
        <>
          <Card className="mt-3 px-4">
            <ul className="divide-y divide-line">
              {items.map((v) => (
                <li key={v.id}>
                  <ItemRow item={v} />
                </li>
              ))}
            </ul>
          </Card>

          {total > items.length && (
            <Link
              href={href({ show: String(limit + LIBRARY_PAGE_STEP) })}
              scroll={false}
              className="mt-3 flex w-full items-center justify-center rounded-xl border border-line bg-surface-card p-3.5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Show more ({(total - items.length).toLocaleString()} left)
            </Link>
          )}
        </>
      )}

      <p className="mt-6 px-1 text-xs leading-relaxed text-ink-soft">
        A video can cover a range of years, so the same one appears for every
        year it applies to. The range is shown on each row.
      </p>
    </main>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={`inline-flex min-h-[2.25rem] items-center rounded-pill border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
        active
          ? "border-teal bg-teal-soft/30 text-navy"
          : "border-line bg-surface-card text-ink-soft hover:bg-teal-soft/15"
      }`}
    >
      {children}
    </Link>
  );
}
