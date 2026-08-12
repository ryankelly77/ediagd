import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ComingSoon, ItemRow, NotIncluded } from "@/components/library/LibraryPieces";
import { getAdminContext } from "@/lib/guards";
import { checkEntitlement } from "@/lib/entitlements";
import {
  LIBRARY_PAGE_STEP,
  MANAGER_GENERAL_TOPIC,
  listManagerTopics,
  loadManagerVideos,
  resolveLibraryLimit,
} from "@/lib/library";

/**
 * Manager Meetings — a separately paid add-on for managers.
 *
 * ORGANISED DIFFERENTLY FROM THE ADVISOR LIBRARY ON PURPOSE. These videos are
 * about HOW TO COACH, not how to sell, so service family is only sometimes the
 * right grouping: "coaching the brake conversation" belongs to a service,
 * "running a one-to-one" belongs to none. Forcing the second kind into a
 * service bucket would file leadership material under whichever service it
 * mentioned in passing, so anything without a service lands in a general
 * bucket that sorts first.
 */
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ent, admin] = await Promise.all([
    checkEntitlement(supabase, user.id, ["manager"], "manager_meetings"),
    getAdminContext(),
  ]);
  const mayBrowse = ent.entitled || admin.hasAdminAccess;

  const { topic, show } = await searchParams;
  const limit = resolveLibraryLimit(show);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/more", label: "More" }}
        title="Manager Meetings"
        subtitle="How to coach it, not how to sell it."
      />

      {!mayBrowse ? (
        <NotIncluded product="Manager Meetings" hasRole={ent.hasRole} roleName="manager">
          Manager Meetings is the coaching library for the people running the
          drive: how to hold a one-to-one, how to run a save, how to coach a
          specific service without doing the job for someone.
        </NotIncluded>
      ) : (
        <Browse supabase={supabase} topic={topic ?? null} limit={limit} show={show} />
      )}
    </main>
  );
}

async function Browse({
  supabase,
  topic,
  limit,
  show,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  topic: string | null;
  limit: number;
  show?: string;
}) {
  const topics = await listManagerTopics(supabase);

  if (topics.length === 0) {
    return (
      <ComingSoon title="Manager Meetings is coming soon">
        <p>
          Short sessions on coaching the team — running a one-to-one, handling a
          slump, coaching a specific service without taking it over.
        </p>
        <p>
          The section is built and waiting. Sessions appear here by topic as
          soon as they&apos;re published.
        </p>
      </ComingSoon>
    );
  }

  const { items, total } = await loadManagerVideos(supabase, topic, limit);
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ topic: topic ?? undefined, show, ...next }))
      if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/meetings?${qs}` : "/meetings";
  };

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip href={href({ topic: undefined, show: undefined })} active={!topic}>
          All topics
        </Chip>
        {topics.map((t) => (
          <Chip
            key={t.topic}
            href={href({ topic: t.topic, show: undefined })}
            active={topic === t.topic}
          >
            {t.topic === MANAGER_GENERAL_TOPIC ? "Leadership" : t.topic} ({t.videos})
          </Chip>
        ))}
      </div>

      {items.length === 0 ? (
        <ComingSoon title="Nothing published here yet">
          <p>No sessions in this topic so far.</p>
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
    </>
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
