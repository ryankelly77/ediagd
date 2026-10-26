/* ============================================================================
   EDIAGD — did each advisor do their five minutes today
   SERVER ONLY (takes a Supabase client).

   Reck asked for it, in these words: "could we add a spot for each advisor's
   name when we click into it that would show if they watched today and if they
   had not?"

   ---------------------------------------------------------------------------
   "WATCHED" IS NOT WHAT ANY COLUMN HERE MEANS, SO THE LABEL SAYS WHAT IT READS
   ---------------------------------------------------------------------------
   There is no per-day "watched" signal in the schema. What exists is:

     daily_completion   one row per (user_id, completion_date) — they FINISHED
                        the loop. Existence of the row IS the answer; 0011.
     daily_activity     one row per (user_id, activity_date) — but the ROW IS
                        NOT THE SIGNAL: it is written for any day something
                        happened and carries logged_in, which can be false.
                        Only logged_in = true means they opened the app, which
                        is why this filters on the column and not on existence.

   Finishing the loop is the thing worth reporting and the thing Reck means, so
   that is what the status reads — and the words on screen say "finished",
   never "watched", because a label that names what it shows has to be checked
   against what it actually shows. Somebody who opened the app and stopped
   halfway gets their own state rather than being rounded to either end.

   ---------------------------------------------------------------------------
   TODAY IS THE STORE'S TODAY
   ---------------------------------------------------------------------------
   Via 0013's rooftop_today(), never `new Date()`. A Texas store at 7pm CST is
   already tomorrow in UTC, so a server-dated today would show the whole team
   as not-yet-done every evening and roll over at six in the afternoon.
   app/(app)/manager/page.tsx dates its closure prompt that way today, which is
   why this is stated here rather than assumed.

   ---------------------------------------------------------------------------
   THE ROLE THAT WILL REALLY CALL IT
   ---------------------------------------------------------------------------
   The MANAGER's own client, so RLS decides what comes back and this code adds
   no filter that could be more generous than the policy:

     daily_completion    completion_team_read      managed_rooftops()   0027
     daily_activity      daily_activity_team_read  managed_rooftops()   0027
     work_schedule       by managed_users()                             0027
     island_time         by managed_users()                             0027
     rooftop_closed_day                                                 0101

   An ADVISOR calling this reads their own rows and nothing else, which is
   correct, and the Team screen is role-gated above it either way. SERVICE ROLE
   is not a caller today; if it becomes one, check every policy above for an
   auth.uid() arm before trusting the answer — that gate has shut the backend
   out of this product three times.
   ============================================================================ */

import { dayStatusFor, type DayStatus } from "@/lib/day-status";
import { SCHEDULE_COLUMNS, rowToSchedule, type ScheduleRow } from "@/lib/work-schedule";
import {
  isWorkDay,
  type IsoDate,
  type IslandTime,
  type StoreClosure,
  type WorkSchedule,
} from "@/lib/gamification/streak";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any; rpc: (fn: string, args: any) => any };

/** work_schedule's own column list plus the key, which SCHEDULE_COLUMNS omits. */
const SCHEDULE_COLUMNS_WITH_USER = `user_id, ${SCHEDULE_COLUMNS}`;

export type TeamToday = {
  userId: string;
  status: DayStatus;
  /**
   * The words for a shut store, when that is why the day is `off`.
   *
   * dayStatusFor collapses a closure into `off` on purpose (see its header), so
   * this is how a caller recovers the distinction in order to SAY it. Null for
   * an ordinary day off.
   */
  closureLabel: string | null;
  /**
   * False when this person has no work_schedule row. The streak engine treats
   * that as "every day is a work day", so `missed` is then a ceiling rather
   * than a fact, and the screen has to say so instead of implying a gap.
   */
  scheduleKnown: boolean;
  /**
   * Videos finished today, and which ones. Reck's ask: the count on the list,
   * the titles on the drill-in.
   *
   * ONE SOURCE FOR BOTH, deliberately — `team_videos_completed` returns the
   * count and the titles from the same aggregate, so the list can never say
   * "3 videos" over a drill-in that names two. Two queries for one number is
   * how a card disagrees with itself.
   *
   * This is NOT the same measurement as `status`. `status` is whether they
   * finished the daily loop; this is how many films they completed, which
   * includes films watched from the library outside the loop. Somebody can
   * have watched three videos and not finished the loop, and both facts are
   * true at once — the screen shows them as two separate statements rather
   * than inventing a single verdict.
   */
  videoCount: number;
  videoTitles: string[];
};

export type TeamTodayResult = {
  /** The ROOFTOP's today — the date every status in `byUserId` is about. */
  today: IsoDate;
  byUserId: Map<string, TeamToday>;
};

/**
 * The rooftop's today, falling back to the server's date.
 *
 * The fallback is a worse answer rather than a wrong one: it is only reachable
 * if the rpc is missing or refuses, and a date one day out beats a screen that
 * renders nothing. Same shape as lib/admin-advisor-detail.ts's.
 */
async function rooftopToday(client: Client, rooftopId: string): Promise<IsoDate> {
  const { data, error } = await client.rpc("rooftop_today", { _rooftop: rooftopId });
  if (error || !data) return new Date().toISOString().slice(0, 10) as IsoDate;
  return String(data).slice(0, 10) as IsoDate;
}

/**
 * Today's status for each of `userIds`.
 *
 * ONE ROUND OF QUERIES FOR THE WHOLE ROSTER, never one per advisor — the Team
 * screen renders every name, so the drill-in has to cost nothing: the data is
 * already on the server by the time anybody taps a row.
 *
 * An empty `userIds` returns early without querying. PostgREST turns `.in()` on
 * an empty list into a filter matching nothing, which is harmless here but
 * costs five round trips to find out.
 */
export async function loadTeamToday(
  client: Client,
  userIds: string[],
  rooftopId: string
): Promise<TeamTodayResult> {
  const today = await rooftopToday(client, rooftopId);
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { today, byUserId: new Map() };

  const [completion, activity, schedules, islands, closures, videos] = await Promise.all([
    client
      .from("daily_completion")
      .select("user_id")
      .in("user_id", ids)
      .eq("completion_date", today),
    /* logged_in = true, not row existence — see the header. */
    client
      .from("daily_activity")
      .select("user_id")
      .in("user_id", ids)
      .eq("activity_date", today)
      .eq("logged_in", true),
    client.from("work_schedule").select(SCHEDULE_COLUMNS_WITH_USER).in("user_id", ids),
    /* Any booked absence CONTAINING today. Both bounds: a range that started
       before today and ends after it is the common case, and a one-sided
       filter would miss exactly the people who are away. */
    client
      .from("island_time")
      .select("user_id, start_date, end_date")
      .in("user_id", ids)
      .lte("start_date", today)
      .gte("end_date", today),
    /* CONFIRMED closures only. A proposed closure is a question the manager
       has not answered yet, and treating it as rest would excuse a day nobody
       has agreed was shut. */
    client
      .from("rooftop_closed_day")
      .select("closed_on, label")
      .eq("rooftop_id", rooftopId)
      .eq("status", "confirmed")
      .eq("closed_on", today),
    /* VIDEOS, AND WHY THIS IS AN RPC RATHER THAN A SELECT.
       Counting videos means telling a video from a cue, which means reading
       `content` — and content_entitled_read gates on the VIEWER'S ROLE:
       roles_for_content_type('advisor_video') = {advisor}. A pure manager
       reads ZERO content rows, so a join here would have returned no videos
       and the screen would have said "No videos completed today" for every
       advisor, every day, with no error. 0166 moves the join into a definer
       that owns the content read and re-applies managed_rooftops() itself. */
    client.rpc("team_videos_completed", { _rooftop: rooftopId, _day: today }),
  ]);

  const rows = (r: { data: unknown }) =>
    (Array.isArray(r?.data) ? r.data : []) as Record<string, unknown>[];

  const finished = new Set(rows(completion).map((r) => String(r.user_id)));
  const opened = new Set(rows(activity).map((r) => String(r.user_id)));

  const scheduleByUser = new Map<string, WorkSchedule>();
  for (const r of rows(schedules)) {
    /* rowToSchedule only returns null for a null row, which cannot happen
       while iterating returned rows — GUARDED RATHER THAN ASSERTED, because a
       skip here degrades to scheduleKnown=false, which the screen already
       says out loud. A `!` would turn the same surprise into a crash. */
    const parsed = rowToSchedule(r as unknown as ScheduleRow);
    if (parsed) scheduleByUser.set(String(r.user_id), parsed);
  }

  const islandByUser = new Map<string, IslandTime[]>();
  for (const r of rows(islands)) {
    const uid = String(r.user_id);
    const list = islandByUser.get(uid) ?? [];
    list.push({ start: r.start_date as IsoDate, end: r.end_date as IsoDate });
    islandByUser.set(uid, list);
  }

  /* One aggregate per user, so the count and the titles cannot disagree. A
     user with no videos simply has no row — absent means zero, which is the
     honest reading here because the function returns only completions. */
  const videosByUser = new Map<string, { count: number; titles: string[] }>();
  for (const r of rows(videos)) {
    videosByUser.set(String(r.user_id), {
      count: Number(r.video_count ?? 0),
      titles: Array.isArray(r.titles) ? (r.titles as string[]) : [],
    });
  }

  const storeClosures: StoreClosure[] = rows(closures).map((r) => ({
    date: r.closed_on as IsoDate,
    label: (r.label as string)?.trim() || "Closed",
  }));

  /* dayStatusFor takes sets of dates so a window caller passes them once. A
     single-day caller passes either the one date or nothing. */
  const TODAY_ONLY: ReadonlySet<IsoDate> = new Set<IsoDate>([today]);
  const NONE: ReadonlySet<IsoDate> = new Set<IsoDate>();

  const byUserId = new Map<string, TeamToday>();
  for (const userId of ids) {
    const schedule = scheduleByUser.get(userId) ?? null;
    const status = dayStatusFor(
      today,
      {
        schedule,
        islandTime: islandByUser.get(userId) ?? [],
        closures: storeClosures,
      },
      {
        completed: finished.has(userId) ? TODAY_ONLY : NONE,
        loggedIn: opened.has(userId) ? TODAY_ONLY : NONE,
      }
    );

    /* "Store closed" is only the honest reason when the closure is what made
       the day off. A day they do not work that happens to fall on a closure is
       still their day off — saying "Store closed" about it would be true of
       the store and wrong about the person. */
    const closedIsTheReason =
      status === "off" &&
      storeClosures.length > 0 &&
      schedule != null &&
      isWorkDay(today, schedule);

    const seen = videosByUser.get(userId);
    byUserId.set(userId, {
      userId,
      status,
      closureLabel: closedIsTheReason ? storeClosures[0].label : null,
      scheduleKnown: schedule != null,
      videoCount: seen?.count ?? 0,
      videoTitles: seen?.titles ?? [],
    });
  }

  return { today, byUserId };
}
