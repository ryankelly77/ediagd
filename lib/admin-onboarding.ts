/* ============================================================================
   EDIAGD — who is actually set up
   SERVER ONLY (takes a Supabase client).

   ---------------------------------------------------------------------------
   THE QUESTION THIS ANSWERS IS NOT "ARE THEY ENGAGED"
   ---------------------------------------------------------------------------
   Engagement asks whether somebody who is set up is turning up. This asks
   whether they are set up at all, and the two look nothing alike: an advisor
   with no operator linked scores zero on engagement forever and there is
   nothing wrong with them — Eddie's Pick simply has no volume to read, so the
   loop has never had anything to coach them on.

   Before sixty-odd advisors onboard, that distinction is the whole job. A
   rollout-day list of "who still needs something" going down to zero is a
   different artefact from a league table, and mixing them would put people who
   have never been given an account at the bottom of a performance ranking.

   ---------------------------------------------------------------------------
   READY MEANS TWO THINGS, AND ONLY TWO
   ---------------------------------------------------------------------------
   A confirmed schedule and a linked operator.

   Without the schedule, /today cannot tell a work day from a rest day and the
   app blocks at the onboarding gate anyway. Without the operator, loadAdvisorDay
   returns null, no coaching block ever opens, and the advisor gets the quote and
   the video and nothing that is about them. Everything else on the row —
   invited, first login, first completion — is context for the conversation, not
   part of the test. Somebody can be ready and not have finished a day yet; that
   is rollout working, not rollout failing.
   ============================================================================ */

import { describeSchedule, rowToSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from "@/lib/work-schedule";
import { scheduleFlags, workDaysPerWeek, type ScheduleFlag } from "@/lib/schedule-flags";
import type { IsoDate, WorkSchedule } from "@/lib/gamification/streak";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

const day = (v: unknown): IsoDate | null =>
  typeof v === "string" && v.length >= 10 ? (v.slice(0, 10) as IsoDate) : null;

const daysBetweenDates = (from: IsoDate, to: IsoDate): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );

export type OnboardingRow = {
  userId: string;
  rooftopId: string;
  rooftopName: string;
  name: string;
  /** app_user.created_at — the day the account was made for them. */
  invitedOn: IsoDate | null;
  /** Earliest day daily_activity recorded them opening the app. */
  firstLoginOn: IsoDate | null;
  /** work_schedule.schedule_set_at. Null means a row exists but nobody confirmed it. */
  scheduleSetOn: IsoDate | null;
  /** "Mon–Fri", "Mon–Sat alternating", "Not set yet". */
  scheduleLine: string;
  workDays: number;
  /** membership.op_code_id — without it Eddie's Pick has nothing to read. */
  operatorLinked: boolean;
  firstCompletionOn: IsoDate | null;
  ready: boolean;
  flags: ScheduleFlag[];
};

export type OnboardingStatus = {
  rows: OnboardingRow[];
  ready: number;
  total: number;
};

/**
 * Onboarding state for every advisor in the caller's scope.
 *
 * READ THROUGH THE CALLER'S OWN CLIENT, so RLS decides who is in scope: a
 * dealer admin sees their rooftops' advisors and the platform owner sees
 * everyone. No `admin_rooftops()` filter is applied here on top of that —
 * adding one would be a second, quieter answer to a question the policies
 * already answer, and the two would drift.
 *
 * INCOMPLETE FIRST. The list exists to be worked through, so it is ordered by
 * what is missing rather than alphabetically: not ready, then ready-but-flagged,
 * then done. On rollout day the top of the list is the work.
 */
export async function loadOnboardingStatus(
  client: Client,
  rooftopId?: string
): Promise<OnboardingStatus> {
  let membershipQuery = client
    .from("membership")
    .select("user_id, rooftop_id, op_code_id, rooftop:rooftop_id(name)")
    .eq("role", "advisor")
    .eq("active", true);
  if (rooftopId) membershipQuery = membershipQuery.eq("rooftop_id", rooftopId);

  const { data: memberships } = await membershipQuery;
  const rows = (memberships ?? []) as {
    user_id: string;
    rooftop_id: string;
    op_code_id: string | null;
    rooftop: unknown;
  }[];

  if (rows.length === 0) return { rows: [], ready: 0, total: 0 };

  const ids = [...new Set(rows.map((r) => r.user_id))];

  const [{ data: users }, { data: schedules }, { data: activity }, { data: completions }] =
    await Promise.all([
      client.from("app_user").select("id, full_name, created_at").in("id", ids),
      client.from("work_schedule").select(`user_id, ${SCHEDULE_COLUMNS}`).in("user_id", ids),
      /* FIRST login, so ascending and unbounded. daily_activity only began
         being written live recently — an advisor who used the app before that
         may show no first login, which is a gap in the record and not a person
         who never signed in. The column is labelled "recorded", not "happened". */
      client
        .from("daily_activity")
        .select("user_id, activity_date, logged_in")
        .in("user_id", ids)
        .eq("logged_in", true)
        .order("activity_date", { ascending: true }),
      client
        .from("daily_completion")
        .select("user_id, completion_date")
        .in("user_id", ids)
        .order("completion_date", { ascending: true }),
    ]);

  const nameOf = new Map(
    ((users ?? []) as { id: string; full_name: string | null }[]).map((u) => [
      u.id,
      u.full_name?.trim() || "(unnamed)",
    ])
  );
  const invitedOf = new Map(
    ((users ?? []) as { id: string; created_at: string }[]).map((u) => [
      u.id,
      day(u.created_at),
    ])
  );

  const scheduleOf = new Map<string, WorkSchedule | null>();
  const setOnOf = new Map<string, IsoDate | null>();
  for (const s of (schedules ?? []) as (ScheduleRow & { user_id: string })[]) {
    scheduleOf.set(s.user_id, rowToSchedule(s));
    setOnOf.set(s.user_id, day(s.schedule_set_at));
  }

  /* Ordered ascending by the query, so the FIRST row seen for a user is the
     earliest. Later rows are dropped rather than compared. */
  const firstOf = (
    list: unknown,
    userKey: string,
    dateKey: string
  ): Map<string, IsoDate> => {
    const out = new Map<string, IsoDate>();
    for (const r of (list ?? []) as Record<string, unknown>[]) {
      const u = r[userKey] as string;
      if (out.has(u)) continue;
      const d = day(r[dateKey]);
      if (d) out.set(u, d);
    }
    return out;
  };

  const firstLogin = firstOf(activity, "user_id", "activity_date");
  const firstCompletion = firstOf(completions, "user_id", "completion_date");

  const today = new Date().toISOString().slice(0, 10) as IsoDate;

  const out: OnboardingRow[] = rows.map((m) => {
    const embed = m.rooftop as unknown;
    const rooftop = (Array.isArray(embed) ? embed[0] : embed) as
      | { name: string | null }
      | null
      | undefined;

    const schedule = scheduleOf.get(m.user_id) ?? null;
    const scheduleSetOn = setOnOf.get(m.user_id) ?? null;
    const firstLoginOn = firstLogin.get(m.user_id) ?? null;
    const operatorLinked = Boolean(m.op_code_id);

    return {
      userId: m.user_id,
      rooftopId: m.rooftop_id,
      rooftopName: rooftop?.name ?? "—",
      name: nameOf.get(m.user_id) ?? "(unnamed)",
      invitedOn: invitedOf.get(m.user_id) ?? null,
      firstLoginOn,
      scheduleSetOn,
      scheduleLine: describeSchedule(schedule),
      workDays: workDaysPerWeek(schedule),
      operatorLinked,
      firstCompletionOn: firstCompletion.get(m.user_id) ?? null,
      ready: Boolean(scheduleSetOn) && operatorLinked,
      flags: scheduleFlags(schedule, {
        confirmed: Boolean(scheduleSetOn),
        daysSinceFirstLogin: firstLoginOn ? daysBetweenDates(firstLoginOn, today) : null,
      }),
    };
  });

  /* Not ready first, then ready-but-flagged, then done — and alphabetically
     inside each group so a name stays findable while the list shrinks. */
  const rank = (r: OnboardingRow) => (r.ready ? (r.flags.length ? 1 : 2) : 0);
  out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return { rows: out, ready: out.filter((r) => r.ready).length, total: out.length };
}
