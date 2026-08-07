/* ============================================================================
   EDIAGD — the advisor detail card's data
   SERVER ONLY (takes a Supabase client).

   ONE QUESTION THIS ANSWERS: "is this a real problem, and what do I say to
   this person?" Everything here exists to make that conversation fair — which
   mostly means showing WHEN the gaps were and WHICH days were never theirs to
   begin with.

   THE FETCH RULE: batched per PAGE, never per card and never for everyone.
   The list renders ten rows, so we load detail for those ten user ids in one
   round of queries and render every card from it. Opening a card costs nothing
   — the data is already on the server. See loadAdvisorDetails for the chunking
   that keeps this true when someone pages out to LIST_MAX.

   WINDOW: the trailing 30 days, anchored on the ROOFTOP's today (0013's
   rooftop_today), not the server's. A store in Hawaii is a day behind UTC in
   the evening, and rendering a day that hasn't started yet as "missed" is
   exactly the unfair conversation this card is meant to prevent.
   ============================================================================ */

import {
  addDays,
  isIslandTime,
  isWorkDay,
  type IsoDate,
  type IslandTime,
  type WorkSchedule,
} from "@/lib/gamification/streak";
import {
  SCHEDULE_COLUMNS,
  describeSchedule,
  rowToSchedule,
  type ScheduleRow,
} from "@/lib/work-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any; rpc: (fn: string, args: any) => any };

/** Days in the strip. 30 is four-and-a-bit weeks — long enough for a pattern. */
export const DETAIL_WINDOW_DAYS = 30;

/**
 * User ids per batched request.
 *
 * 25 users x 30 days = 750 activity rows, comfortably inside PostgREST's
 * 1000-row cap, and 25 uuids is nowhere near the ~200-id URL limit that 0026's
 * header documents. Pages larger than this (?show= goes to LIST_MAX) split
 * into several chunks that run in parallel rather than silently truncating.
 */
export const DETAIL_CHUNK = 25;

export type DayStatus =
  /** Finished the daily loop — did the work. */
  | "completed"
  /** Opened the app but didn't finish the loop. */
  | "logged-in"
  /** Scheduled, and nothing happened. */
  | "missed"
  /** Not a work day for this person. Never counts against them. */
  | "off"
  /** Planned absence (0025). Not a missed day, not a day off. */
  | "island";

export type DayCell = { date: IsoDate; status: DayStatus };

export type AdvisorDetail = {
  userId: string;
  /** Oldest first, exactly DETAIL_WINDOW_DAYS entries, ending on `today`. */
  days: DayCell[];
  /** "Mon–Fri + every other Saturday", or "Not set yet". */
  scheduleLine: string;
  /**
   * False when there's no work_schedule row. The streak engine treats that as
   * "every day is a work day", so the numbers below are a ceiling, not a fact
   * — the card says so rather than quietly implying a bad week.
   */
  scheduleKnown: boolean;
  /** Work days in the window that were genuinely theirs (Island Time removed). */
  scheduledDays: number;
  /** Work days lost to planned absence — the honest asterisk on any low score. */
  islandDays: number;
  /**
   * Island Time running now or still to come, earliest first.
   *
   * The strip is a record of what happened, so a day that hasn't occurred yet
   * has no square. But "they've gone quiet" and "they're out until Friday" is
   * the same unfair conversation pointed forwards, so upcoming absence is
   * stated in words instead.
   */
  upcomingIsland: IslandTime[];
  /** Days they finished the loop, from daily_completion. */
  completedDays: number;
  /** Days they opened the app at all, from daily_activity. */
  loggedInDays: number;
  swell: {
    current: number;
    longest: number;
    lastCompletedOn: IsoDate | null;
  } | null;
};

/* ---- Today --------------------------------------------------------------- */

/**
 * The rooftop's today. Falls back to the server's date if the rpc is
 * unavailable — a card anchored a few hours off is worth far more than no card.
 */
export async function rooftopToday(client: Client, rooftopId: string): Promise<IsoDate> {
  const { data } = await client.rpc("rooftop_today", { _rooftop: rooftopId });
  if (typeof data === "string" && data.length >= 10) return data.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/* ---- Loading ------------------------------------------------------------- */

type RawRows = {
  activity: Map<string, Set<IsoDate>>;
  completion: Map<string, Set<IsoDate>>;
  schedule: Map<string, WorkSchedule | null>;
  island: Map<string, IslandTime[]>;
  swell: Map<string, AdvisorDetail["swell"]>;
};

const emptyRaw = (): RawRows => ({
  activity: new Map(),
  completion: new Map(),
  schedule: new Map(),
  island: new Map(),
  swell: new Map(),
});

/**
 * Detail for a page of advisors, keyed by user id.
 *
 * Five queries per chunk of 25 users, all five in parallel, chunks in parallel
 * too. A default page of ten rows is therefore ONE round of five queries no
 * matter how many rooftops the admin covers.
 *
 * Keyed by user id alone, deliberately: daily_activity and daily_completion are
 * both UNIQUE (user_id, date), so a person who advises at two rooftops still
 * has one row per day. Splitting by rooftop here would invent gaps.
 */
export async function loadAdvisorDetails(
  client: Client,
  userIds: string[],
  today: IsoDate
): Promise<Map<string, AdvisorDetail>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, AdvisorDetail>();
  if (ids.length === 0) return out;

  const from = addDays(today, -(DETAIL_WINDOW_DAYS - 1));

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += DETAIL_CHUNK) {
    chunks.push(ids.slice(i, i + DETAIL_CHUNK));
  }

  const loaded = await Promise.all(
    chunks.map((chunk) => loadChunk(client, chunk, from, today))
  );

  for (const raw of loaded) {
    // Every requested id is seeded into raw.schedule, so an advisor with no
    // rows at all still gets a card rather than vanishing.
    for (const userId of raw.schedule.keys()) {
      out.set(userId, compose(userId, raw, from, today));
    }
  }

  return out;
}

async function loadChunk(
  client: Client,
  ids: string[],
  from: IsoDate,
  today: IsoDate
): Promise<RawRows> {
  const raw = emptyRaw();

  const [activity, completion, schedule, island, swell] = await Promise.all([
    client
      .from("daily_activity")
      .select("user_id, activity_date, logged_in")
      .in("user_id", ids)
      .gte("activity_date", from)
      .lte("activity_date", today),
    client
      .from("daily_completion")
      .select("user_id, completion_date")
      .in("user_id", ids)
      .gte("completion_date", from)
      .lte("completion_date", today),
    client.from("work_schedule").select(`user_id, ${SCHEDULE_COLUMNS}`).in("user_id", ids),
    // Overlap, not containment: a fortnight that started before the window
    // still covers days inside it. No upper bound on start_date, because
    // absence that hasn't begun yet is exactly what the card wants to say out
    // loud — the strip ignores it, the Island Time line reports it.
    client
      .from("island_time")
      .select("user_id, start_date, end_date")
      .in("user_id", ids)
      .gte("end_date", from)
      .order("start_date", { ascending: true }),
    client
      .from("swell")
      .select("user_id, current_len, longest_len, last_completed_on")
      .in("user_id", ids),
  ]);

  for (const id of ids) raw.schedule.set(id, null);

  for (const r of rows(activity)) {
    // A row exists only for days something happened, but logged_in can still be
    // false on it — only a true means they opened the app.
    if (!r.logged_in) continue;
    const set = raw.activity.get(r.user_id as string) ?? new Set<IsoDate>();
    set.add(r.activity_date as IsoDate);
    raw.activity.set(r.user_id as string, set);
  }

  for (const r of rows(completion)) {
    const set = raw.completion.get(r.user_id as string) ?? new Set<IsoDate>();
    set.add(r.completion_date as IsoDate);
    raw.completion.set(r.user_id as string, set);
  }

  for (const r of rows(schedule)) {
    raw.schedule.set(r.user_id as string, rowToSchedule(r as unknown as ScheduleRow));
  }

  for (const r of rows(island)) {
    const list = raw.island.get(r.user_id as string) ?? [];
    list.push({ start: r.start_date as IsoDate, end: r.end_date as IsoDate });
    raw.island.set(r.user_id as string, list);
  }

  for (const r of rows(swell)) {
    raw.swell.set(r.user_id as string, {
      current: Number(r.current_len ?? 0),
      longest: Number(r.longest_len ?? 0),
      lastCompletedOn: (r.last_completed_on as IsoDate | null) ?? null,
    });
  }

  return raw;
}

function rows(result: unknown): Record<string, unknown>[] {
  const data = (result as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/* ---- Composition --------------------------------------------------------- */

function compose(
  userId: string,
  raw: RawRows,
  from: IsoDate,
  today: IsoDate
): AdvisorDetail {
  const schedule = raw.schedule.get(userId) ?? null;
  const island = raw.island.get(userId) ?? [];
  const loggedIn = raw.activity.get(userId) ?? new Set<IsoDate>();
  const completed = raw.completion.get(userId) ?? new Set<IsoDate>();

  const days: DayCell[] = [];
  let scheduledDays = 0;
  let islandDays = 0;
  let completedDays = 0;
  let loggedInDays = 0;

  for (let i = 0; i < DETAIL_WINDOW_DAYS; i++) {
    const date = addDays(from, i);
    const onIsland = isIslandTime(date, island);
    const workDay = isWorkDay(date, schedule);

    if (workDay && onIsland) islandDays++;
    if (workDay && !onIsland) scheduledDays++;

    let status: DayStatus;
    if (completed.has(date)) {
      completedDays++;
      loggedInDays++;
      status = "completed";
    } else if (loggedIn.has(date)) {
      loggedInDays++;
      status = "logged-in";
    } else if (onIsland) {
      // Ahead of "off" on purpose: planned absence is a fact worth seeing, and
      // a day that is both off and Island Time reads better as Island Time.
      status = "island";
    } else if (!workDay) {
      status = "off";
    } else {
      status = "missed";
    }

    days.push({ date, status });
  }

  return {
    userId,
    days,
    scheduleLine: describeSchedule(schedule),
    scheduleKnown: schedule != null,
    scheduledDays,
    islandDays,
    // isCurrentOrFuture's rule, applied to ranges: still running today, or
    // entirely ahead of us. Already ordered by start_date from the query.
    upcomingIsland: island.filter((r) => r.end >= today),
    completedDays,
    loggedInDays,
    swell: raw.swell.get(userId) ?? null,
  };
}
