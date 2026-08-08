import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Delta } from "@/components/admin/ImpactPieces";
import { LIST_PAGE_STEP, resolveLimit } from "@/lib/admin-engagement";
import {
  loadQuadrantAdvisors,
  loadThresholds,
  type Quadrant,
} from "@/lib/admin-impact";

/**
 * One box of the 2x2, opened.
 *
 * The quadrant is the whole point of the grid: "engaged but flat" is a content
 * problem and "not engaged, not moving" is a call list, and they need different
 * actions. So each opens onto the actual people, ordered by the money at stake.
 *
 * One query, filtered to the quadrant in Postgres and paged — the grid can hold
 * thousands of advisors at 500 rooftops and this never fetches them all.
 */

const META: Record<
  Quadrant,
  { title: string; blurb: string; action: string }
> = {
  engaged_improving: {
    title: "Engaged and improving",
    blurb: "Showing up, and the numbers followed.",
    action:
      "Nothing to fix. Worth knowing who they are — they're the ones to ask what's working.",
  },
  engaged_flat: {
    title: "Engaged but flat",
    blurb: "Doing the work; the numbers haven't moved.",
    action:
      "This is the most useful box on the screen. These people did their part, so a flat result points at the coaching content, not at them.",
  },
  quiet_improving: {
    title: "Improving without us",
    blurb: "Numbers up, engagement low.",
    action:
      "Improvement we can't take credit for. Worth understanding why before assuming the app caused anything.",
  },
  quiet_flat: {
    title: "Not engaged, not moving",
    blurb: "Neither the habit nor the numbers.",
    action:
      "The list to work — and the conversation starts with what's in the way, not with the numbers.",
  },
};

const QUADRANTS = Object.keys(META) as Quadrant[];

const money = (v: number | null): string =>
  v == null
    ? "—"
    : `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;

export default async function QuadrantPage({
  params,
  searchParams,
}: {
  params: Promise<{ quadrant: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { quadrant } = await params;
  if (!QUADRANTS.includes(quadrant as Quadrant)) notFound();
  const q = quadrant as Quadrant;

  const { show } = await searchParams;
  const limit = resolveLimit(show);

  const [{ rows, total }, thresholds] = await Promise.all([
    loadQuadrantAdvisors(supabase, q, limit),
    loadThresholds(supabase),
  ]);

  const meta = META[q];

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/impact", label: "Impact & ROI" }}
        title={meta.title}
        subtitle={meta.blurb}
      />

      <Card className="mt-4 p-4">
        <p className="text-sm leading-relaxed text-navy">{meta.action}</p>
        <p className="mt-2.5 border-t border-line pt-2.5 text-xs leading-relaxed text-ink-soft">
          In this box: engagement score{" "}
          {q.startsWith("engaged") ? "of at least" : "below"}{" "}
          <span className="ediagd-numeral font-bold text-navy">
            {thresholds.engagedScoreMin}
          </span>
          , and coached services{" "}
          {q.endsWith("improving") ? "gaining at least" : "gaining less than"}{" "}
          <span className="ediagd-numeral font-bold text-navy">
            {thresholds.improvingPtsMin}
          </span>{" "}
          points a month on average.
        </p>
      </Card>

      <div className="mt-6 flex items-baseline justify-between gap-3 px-1">
        <h2 className="ediagd-eyebrow">Advisors</h2>
        <span className="ediagd-numeral text-xs font-bold text-ink-soft">
          {rows.length} of {total}
        </span>
      </div>

      {rows.length === 0 ? (
        <Card className="mt-2 p-6 text-center">
          <p className="text-base font-extrabold text-navy">Nobody here</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            No advisor in your rooftops falls in this box right now.
          </p>
        </Card>
      ) : (
        <Card className="mt-2 px-4">
          <ul className="divide-y divide-line">
            {rows.map((a) => (
              <li key={`${a.userId}:${a.rooftopId}`}>
                <Link
                  href={`/admin/impact/${a.rooftopId}`}
                  className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-navy">
                      {a.advisorName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-soft">
                      {a.rooftopName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="ediagd-numeral block text-sm font-extrabold text-navy">
                      {money(a.incrementalLabor)}
                    </span>
                    <span className="ediagd-numeral block text-xs text-ink-soft">
                      score {a.engagementScore ?? "—"}
                    </span>
                  </span>
                  <span className="w-14 shrink-0 text-right">
                    <Delta value={a.coachedDelta} />
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-lg leading-none text-ink-soft"
                  >
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {total > rows.length && (
        <Link
          href={`/admin/impact/quadrant/${q}?show=${limit + LIST_PAGE_STEP}`}
          scroll={false}
          className="mt-3 flex w-full items-center justify-center rounded-xl border border-line bg-surface-card p-3.5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Show more ({(total - rows.length).toLocaleString()} left)
        </Link>
      )}

      <p className="mt-4 px-1 text-xs leading-relaxed text-ink-soft">
        Dollars are that advisor&apos;s share of the incremental labor on the
        headline; the figure on the right is their average movement on coached
        services, in percentage points.
      </p>
    </main>
  );
}
