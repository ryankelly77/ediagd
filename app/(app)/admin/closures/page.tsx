import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getManagerContext } from "@/lib/guards";
import { calendarSettledThroughYearEnd, rowsByDate, type Closure } from "@/lib/closures";
import { formatDayLabel } from "@/lib/work-schedule";
import {
  ClosureCalendar,
  ALL_SCOPE,
  type CalendarItem,
} from "@/components/admin/closures/ClosureCalendar";
import type { IsoDate } from "@/lib/gamification/streak";

/**
 * The closure calendar, owned by the person who knows the answer.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MANAGER SCREEN AND NOT MITCH'S
 * ---------------------------------------------------------------------------
 * Whether a store opens on Labor Day is not a fact about the platform. It is a
 * fact about one dealership, and the service manager standing in it is the only
 * person who reliably knows. Building this as a platform-owner screen would
 * have meant Mitch ringing eleven rooftops once a year to ask a question each
 * of them could answer in four taps.
 *
 * So the scope is managed_rooftops() — asked of the database rather than
 * reconstructed here — and the platform owner is the FALLBACK rather than the
 * owner, for a dealer who has not engaged yet.
 *
 * ---------------------------------------------------------------------------
 * ALL ROOFTOPS AT ONCE, BY DEFAULT
 * ---------------------------------------------------------------------------
 * One calendar per rooftop meant eleven stores times eleven dates: a hundred
 * and twenty-one decisions for a dealer whose shops almost certainly close on
 * the same days. Nobody finishes that, and a half-finished calendar is worse
 * than an untouched one, because readiness goes green for the stores that got
 * done and the holiday still breaks the rest.
 *
 * So one row per DATE, folded across every rooftop in scope, with a single
 * store selectable when one genuinely differs. Where they disagree the row says
 * so rather than picking a side.
 *
 * ---------------------------------------------------------------------------
 * EVERYTHING HERE IS INERT UNTIL CONFIRMED
 * ---------------------------------------------------------------------------
 * The eleven federal dates are proposals. Nothing in the daily loop, the streak
 * engine or the coaching block reads a row that is not confirmed — the loader
 * filters on it — so a manager who never opens this screen has a store that
 * behaves exactly as it did before the feature existed.
 */
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  rooftop_id: string;
  closed_on: string;
  label: string;
  status: string;
  origin: string;
  dismissed_at: string | null;
};

export default async function ClosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ rooftop?: string }>;
}) {
  const { supabase, managedRooftopIds, isPlatformOwner, hasManagerAccess } =
    await getManagerContext();

  if (!hasManagerAccess) redirect("/advisor");

  /*
   * Read through the caller's own client, so RLS decides which rooftops exist
   * for them. A platform owner sees every one; a manager sees theirs. No `in`
   * filter for the owner, because that is the one case where the managed set is
   * deliberately empty and filtering by it would show Mitch nothing.
   */
  const rooftopQuery = supabase.from("rooftop").select("id, name").order("name");
  const { data: rooftopRows } = isPlatformOwner
    ? await rooftopQuery
    : await rooftopQuery.in("id", managedRooftopIds.length ? managedRooftopIds : [""]);

  const rooftops = (rooftopRows ?? []) as { id: string; name: string }[];

  const { rooftop: requested } = await searchParams;
  /* An unknown id falls back to the whole group rather than erroring — the
     scope is a view, not a permission, and the policies decide the rest. */
  const scope =
    requested && rooftops.some((r) => r.id === requested) ? requested : ALL_SCOPE;
  const scopeIds = scope === ALL_SCOPE ? rooftops.map((r) => r.id) : [scope];

  const today = new Date().toISOString().slice(0, 10) as IsoDate;

  /*
   * FROM TODAY FORWARD, not from January. The first cut listed the whole year
   * and asked "is the store shut?" about dates that had already passed — a
   * question with no useful answer, and one that made the header disagree with
   * the list.
   */
  const { data: closureRows } = await supabase
    .from("rooftop_closed_day")
    .select("id, rooftop_id, closed_on, label, status, origin, dismissed_at")
    .in("rooftop_id", scopeIds.length ? scopeIds : [""])
    .gte("closed_on", today)
    .order("closed_on");

  const closures: Closure[] = ((closureRows ?? []) as Row[]).map((raw) => ({
    id: raw.id,
    rooftopId: raw.rooftop_id,
    date: raw.closed_on as IsoDate,
    label: raw.label,
    status: raw.status === "confirmed" ? "confirmed" : "proposed",
    origin: raw.origin === "federal" ? "federal" : "store",
    dismissed: raw.dismissed_at !== null,
  }));

  const rows = rowsByDate(scopeIds, closures);
  const items: CalendarItem[] = rows.map((r) => ({
    date: r.date,
    dateLabel: formatDayLabel(r.date, today),
    label: r.label,
    state: r.state,
    closedCount: r.closedCount,
    scopeCount: r.scopeCount,
  }));

  /* Judged per rooftop and then across them: a group where ten stores are ruled
     and the eleventh is not is not ready, and an average would hide exactly the
     store that breaks. */
  const unsettled = rooftops.filter(
    (r) =>
      !calendarSettledThroughYearEnd(
        today,
        closures.filter((c) => c.rooftopId === r.id)
      )
  ).length;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Closure calendar"
        subtitle={
          rooftops.length === 0
            ? "No rooftops to set up."
            : unsettled > 0
              ? `${unsettled} of ${rooftops.length} still need a ruling`
              : "All settled through year-end"
        }
      />

      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-ink">
          A closure is a day your store is <strong>shut</strong>. On a day you
          switch on, your advisors get a rest card instead of the daily loop,
          their Swell is safe, and no coaching is opened — and anyone who takes
          the rep anyway still earns it in full.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Nothing happens until you switch a day on. Leave one off and we take
          it that you trade that day, and we won&apos;t ask again.
        </p>
      </Card>

      {rooftops.length === 0 ? (
        <Card className="mt-4 border-dashed p-5">
          <p className="text-base font-extrabold text-navy">Nothing to show</p>
          <p className="mt-1 text-sm text-ink-soft">
            You don&apos;t manage any rooftops yet.
          </p>
        </Card>
      ) : (
        <ClosureCalendar
          rooftops={rooftops}
          scope={scope}
          items={items}
        />
      )}
    </main>
  );
}
