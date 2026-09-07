import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getManagerContext } from "@/lib/guards";
import {
  calendarSettledThroughYearEnd,
  openProposalCount,
  type Closure,
} from "@/lib/closures";
import { formatDayLabel } from "@/lib/work-schedule";
import { RooftopCalendar, type CalendarItem } from "@/components/admin/closures/RooftopCalendar";
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
 * EVERYTHING HERE IS INERT UNTIL CONFIRMED
 * ---------------------------------------------------------------------------
 * The eleven federal dates are proposals. Nothing in the daily loop, the streak
 * engine or the coaching block reads a row that is not confirmed — the loader
 * filters on it — so a manager who never opens this screen has a store that
 * behaves exactly as it did before the feature existed. That is the property
 * that made it safe to seed every rooftop unattended.
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

export default async function ClosuresPage() {
  const { supabase, managedRooftopIds, isPlatformOwner, hasManagerAccess } =
    await getManagerContext();

  if (!hasManagerAccess) redirect("/advisor");

  /*
   * The rooftop list is read through the caller's own client, so RLS decides
   * which rooftops exist for them. A platform owner sees every one; a manager
   * sees theirs. No `in` filter is applied for the owner, because that is the
   * one case where the managed set is deliberately empty and filtering by it
   * would show Mitch nothing.
   */
  const rooftopQuery = supabase.from("rooftop").select("id, name").order("name");
  const { data: rooftopRows } = isPlatformOwner
    ? await rooftopQuery
    : await rooftopQuery.in("id", managedRooftopIds.length ? managedRooftopIds : [""]);

  const rooftops = (rooftopRows ?? []) as { id: string; name: string }[];

  /* Today in ISO. The calendar is a set of dates, not a moment, so the
     rooftop's own clock does not change which proposals are still open. */
  const today = new Date().toISOString().slice(0, 10) as IsoDate;

  /*
   * FROM TODAY FORWARD, not from January.
   *
   * The first cut listed the whole year and asked "is the store shut?" about
   * dates that had already passed — a question with no useful answer, and one
   * that made the header disagree with the list: the readiness count has always
   * been today-to-year-end, so a screen showing January's proposals said "5
   * still to rule" above eleven rows and offered to confirm all 22.
   *
   * A date that has gone is not work anybody can do. The window a manager acts
   * on is the window the count already meant.
   */
  const { data: closureRows } = await supabase
    .from("rooftop_closed_day")
    .select("id, rooftop_id, closed_on, label, status, origin, dismissed_at")
    .in("rooftop_id", rooftops.length ? rooftops.map((r) => r.id) : [""])
    .gte("closed_on", today)
    .order("closed_on");

  const byRooftop = new Map<string, Closure[]>();
  for (const raw of (closureRows ?? []) as Row[]) {
    const list = byRooftop.get(raw.rooftop_id) ?? [];
    list.push({
      id: raw.id,
      rooftopId: raw.rooftop_id,
      date: raw.closed_on as IsoDate,
      label: raw.label,
      status: raw.status === "confirmed" ? "confirmed" : "proposed",
      origin: raw.origin === "federal" ? "federal" : "store",
      dismissed: raw.dismissed_at !== null,
    });
    byRooftop.set(raw.rooftop_id, list);
  }

  const unsettled = rooftops.filter(
    (r) => !calendarSettledThroughYearEnd(today, byRooftop.get(r.id) ?? [])
  ).length;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Closure calendar"
        subtitle={
          rooftops.length === 0
            ? "No rooftops to set up."
            : `${rooftops.length} rooftop${rooftops.length === 1 ? "" : "s"}` +
              (unsettled > 0
                ? ` · ${unsettled} still need${unsettled === 1 ? "s" : ""} a ruling`
                : " · all settled through year-end")
        }
      />

      <Card className="mt-4 p-5">
        <p className="text-sm leading-relaxed text-ink">
          A closure is a day your store is <strong>shut</strong>. On a confirmed
          date your advisors get a rest card instead of the daily loop, their
          Swell is safe, and no coaching is opened — and anyone who takes the rep
          anyway still earns it in full.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The federal dates below are suggestions and do nothing until you
          confirm them. If your store trades that day, dismiss it and we
          won&apos;t ask again.
        </p>
      </Card>

      {rooftops.length === 0 && (
        <Card className="mt-4 border-dashed p-5">
          <p className="text-base font-extrabold text-navy">Nothing to show</p>
          <p className="mt-1 text-sm text-ink-soft">
            You don&apos;t manage any rooftops yet.
          </p>
        </Card>
      )}

      <div className="mt-6 space-y-8">
        {rooftops.map((r) => {
          const closures = byRooftop.get(r.id) ?? [];
          return (
            <RooftopCalendar
              key={r.id}
              rooftopId={r.id}
              rooftopName={r.name}
              /* Dates are formatted HERE. formatDayLabel is a function, and a
                 function cannot cross into a client component — so the label
                 travels as the string it was always going to be. */
              items={closures.map(
                (c): CalendarItem => ({
                  id: c.id,
                  date: c.date,
                  dateLabel: formatDayLabel(c.date, today),
                  label: c.label,
                  status: c.status,
                  origin: c.origin,
                  dismissed: c.dismissed,
                })
              )}
              openCount={openProposalCount(today, closures)}
              settled={calendarSettledThroughYearEnd(today, closures)}
              /* "Apply to all my rooftops" is only offered to somebody who has
                 more than one — a single-store manager does not need the
                 question, and offering it would imply there are others. */
              siblingRooftops={rooftops.filter((o) => o.id !== r.id)}
            />
          );
        })}
      </div>
    </main>
  );
}
