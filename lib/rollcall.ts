/* ============================================================================
   EDIAGD — Rollcall: the six facts, per advisor, from one place
   SERVER ONLY (takes a Supabase client).

   Ryan, 6 October, before the Beaumont invites: who downloaded the TestFlight
   app and when, who created their password, who completed onboarding, who
   completed a daily loop, who clicked on Certs and other courses, and who
   completed lessons outside the daily loop.

   ---------------------------------------------------------------------------
   ONE LOADER, TWO READERS, AND THAT IS THE POINT
   ---------------------------------------------------------------------------
   The screen at /admin/engagement and the twice-daily Slack post both call
   this. A second reduction for the message would be a second answer to the
   same question, and the one nobody checks is the one that drifts — which is
   why app_event_rollcall does the grouping in Postgres and this file only
   shapes it.

   It is layered ON TOP of loadOnboardingStatus rather than replacing it:
   invited, first login, schedule set, operator linked and the completion tally
   are all already computed there, from the tables that have always held them.
   Nothing here re-derives a fact that already has a home.

   ---------------------------------------------------------------------------
   "INSTALLED" IS A PROXY AND THE TYPE SAYS SO
   ---------------------------------------------------------------------------
   The app cannot see a TestFlight install. App Store Connect shows Invited /
   Installed / last session per tester and the app is not party to any of it.
   What the app CAN observe is the shell a session ran in, so
   `firstNativeSignInOn` is the first sign-in from an iOS or Android build —
   named for what it is, not for the install it stands in for. A column headed
   "Installed" over this number would be the label-without-evidence failure
   this codebase has met five times.

   ---------------------------------------------------------------------------
   DATES ARE THE ROOFTOP'S, NOT UTC
   ---------------------------------------------------------------------------
   app_event.at is an instant; daily_completion and daily_activity already hold
   store-dates. Mixing the two would make a 7pm Hawaii sign-in land on
   tomorrow's row next to today's completion. So each rooftop's timezone is
   read and the instants are formatted in it. One extra query on a table with
   a dozen rows.
   ============================================================================ */

import "server-only";
import {
  loadOnboardingStatus,
  type OnboardingRow,
  type OnboardingStatus,
} from "@/lib/admin-onboarding";
import type { IsoDate } from "@/lib/gamification/streak";
import type { SignInPlatform } from "@/lib/events/kinds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** A count with the day it last happened. Null day means the count is zero. */
export type Tally = { count: number; lastOn: IsoDate | null };

const ZERO: Tally = { count: 0, lastOn: null };

export type RollcallRow = OnboardingRow & {
  /**
   * First sign-in from a NATIVE shell, and which platforms have been seen.
   *
   * The closest honest proxy for "downloaded the TestFlight app". Null means
   * no native session has been recorded — which for anybody who signed in
   * before 0163 shipped means "we were not watching", not "they are on the
   * web". `platforms` is empty in exactly the same case.
   */
  firstNativeSignInOn: IsoDate | null;
  firstNativePlatform: SignInPlatform | null;
  platforms: SignInPlatform[];

  /** Taps on the Certs tab. */
  certsOpened: Tally;
  /** Taps into a certification track, and which tracks they were. */
  tracksOpened: Tally;
  /**
   * The names behind tracksOpened's targets, best effort.
   *
   * A target that no longer resolves is still COUNTED — the count comes from
   * the event, never from this list — so a renamed or retired certification
   * shows as a smaller name list beside an unchanged number. Dropping the
   * event instead would turn "a track that was renamed" into "a track nobody
   * opened".
   */
  trackNames: string[];
  /** Taps into the Lesson Library landing. */
  libraryOpened: Tally;
  /** Taps into a module. Opening is not finishing and is not counted as it. */
  lessonsOpened: Tally;

  /**
   * Lessons finished away from the morning — the library deck and the family
   * card. Ryan's sixth question.
   */
  lessonsOutsideLoop: Tally;
  /**
   * Lessons finished IN the morning, from the same event stream.
   *
   * NOT ASKED FOR, AND HERE BECAUSE THE OTHER NUMBER IS WORTHLESS WITHOUT IT.
   * daily_completion already says how many mornings somebody finished, and
   * each morning finishes at most one item — so this count must not exceed the
   * completion count, and if it does, the event stream is wrong. That is a
   * second route to the same quantity, which is the only way either one earns
   * being quoted.
   */
  lessonsInLoop: Tally;
  /**
   * lesson_completed events carrying no source at all — in NEITHER column.
   *
   * SAID OUT LOUD BECAUSE A DROPPED ROW IS INVISIBLE. The fold refuses to
   * guess which surface an unsourced completion came from: filing it under
   * "outside the loop" because it is not marked 'loop' is the
   * exclusion-by-value mistake pointing the other way. But a silent drop means
   * the two columns can fail to sum to the total and nothing says why, so the
   * remainder gets a name and the screen prints it whenever it is not zero.
   *
   * It should always be zero: both writers set the source. A number here means
   * a third writer appeared and nobody updated this file.
   */
  lessonsUnattributed: Tally;
  /** Good News Stories filed. An edit is not a submission; see story-actions. */
  storiesSubmitted: Tally;
};

export type Rollcall = Omit<OnboardingStatus, "rows"> & {
  rows: RollcallRow[];
  /** Advisors with at least one native sign-in recorded. */
  nativeInstalled: number;
  /** Advisors who have confirmed a schedule — onboarding finished. */
  onboarded: number;
  /** Advisors who completed a morning on the rooftop's today. */
  completedToday: number;
  /**
   * The rooftops in scope that HAVE AT LEAST ONE ACCOUNT, for the filter
   * chips, ordered accounts-descending so the store being rolled out leads.
   *
   * ---------------------------------------------------------------------------
   * "IT NEVER ENUMERATES ANYTHING" IS THIS SCREEN'S OWN RULE, AND I BROKE IT
   * ---------------------------------------------------------------------------
   * /admin/engagement opens by saying it must read the same for a dealer admin
   * with one rooftop and a platform owner with hundreds. The first version of
   * this returned every rooftop, and the screenshot showed it: a hundred-odd
   * demo chips, eight thousand pixels of them, with the actual roll somewhere
   * underneath. Unusable, and unusable in exactly the way the page's header
   * comment warns about.
   *
   * A rooftop with no accounts has nothing to roll-call, so it is not a filter
   * anybody wants. On production that is the whole fix — eleven rooftops, a
   * couple provisioned. The page caps what is left and SAYS how many it did
   * not show, because a list that quietly stopped would read as the whole list.
   */
  rooftops: { id: string; name: string; accounts: number }[];
  /** The rooftop this Rollcall was scoped to, or null for everything in scope. */
  rooftopId: string | null;
  /** Store-local today per rooftop, for the "completed today" count. */
  today: IsoDate | null;
  /**
   * The earliest app_event in scope — when the activity half starts being
   * able to say anything.
   *
   * DERIVED, NOT TYPED INTO THE COPY. The screen has to tell an admin that a
   * zero under "Certs opened" means "nothing recorded since we started
   * recording" and not "never", and a hand-written date in a JSX string is a
   * label that is true the week it is written and wrong afterwards. Null means
   * no event has been recorded at all for anybody in scope, which the screen
   * says in those words rather than naming a date it does not have.
   */
  recordingSince: IsoDate | null;
};

/** A row of app_event_rollcall. */
type AggRow = {
  user_id: string;
  rooftop_id: string;
  kind: string;
  platform: string | null;
  source: string | null;
  events: number;
  first_at: string;
  last_at: string;
  target_ids: string[] | null;
};

/**
 * Format an instant as the date it fell on AT THE STORE.
 *
 * en-CA gives ISO ordering, which is the same trick lib/mapping/epoch.ts uses.
 * An unknown zone falls back to UTC rather than throwing — a date one day out
 * is a smaller lie than a 500 on the rollout screen.
 */
function storeDate(instant: string, timezone: string | null): IsoDate | null {
  if (!instant) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(instant)) as IsoDate;
  } catch {
    return instant.slice(0, 10) as IsoDate;
  }
}

const later = (a: IsoDate | null, b: IsoDate | null): IsoDate | null =>
  !a ? b : !b ? a : a >= b ? a : b;

const earlier = (a: IsoDate | null, b: IsoDate | null): IsoDate | null =>
  !a ? b : !b ? a : a <= b ? a : b;

/** Add an aggregate row into a tally, keeping the later date. */
function fold(into: Tally, events: number, on: IsoDate | null): Tally {
  return { count: into.count + events, lastOn: later(into.lastOn, on) };
}

/**
 * The Rollcall for every advisor in the caller's scope.
 *
 * READ THROUGH THE CALLER'S OWN CLIENT, so RLS decides who is in scope — the
 * same rule loadOnboardingStatus follows, and the reason app_event_rollcall is
 * security_invoker. The cron passes the SERVICE client and a rooftop id, which
 * is the one caller for which the policy is not the scope; it is named in that
 * route's header rather than left implicit here.
 */
export async function loadRollcall(
  client: Client,
  rooftopId?: string | null
): Promise<Rollcall> {
  const status = await loadOnboardingStatus(client, rooftopId ?? undefined);

  /* Rooftop names and timezones for every rooftop the status touched, plus the
     ones with no accounts yet — the chips have to be able to offer a store
     before anybody at it has been invited. */
  const { data: rooftopRows } = await client.from("rooftop").select("id, name, timezone");
  const rooftopMeta = new Map(
    ((rooftopRows ?? []) as { id: string; name: string; timezone: string | null }[]).map(
      (r) => [r.id, r]
    )
  );

  const userIds = [...new Set(status.rows.map((r) => r.userId))];

  /* app_event_rollcall, scoped the same way the rest of the screen is. The
     `in` on user ids is belt to the policy's braces: an advisor who left a
     rooftop keeps their events, and this screen is about the people on it. */
  let aggRows: AggRow[] = [];
  if (userIds.length > 0) {
    let q = client
      .from("app_event_rollcall")
      .select("user_id, rooftop_id, kind, platform, source, events, first_at, last_at, target_ids")
      .in("user_id", userIds);
    if (rooftopId) q = q.eq("rooftop_id", rooftopId);
    const { data } = await q;
    aggRows = (data ?? []) as AggRow[];
  }

  /* ---- Fold the aggregate into one bundle per user ---------------------- */
  type Bundle = {
    firstNativeSignInOn: IsoDate | null;
    firstNativePlatform: SignInPlatform | null;
    platforms: Set<SignInPlatform>;
    certsOpened: Tally;
    tracksOpened: Tally;
    trackIds: Set<string>;
    libraryOpened: Tally;
    lessonsOpened: Tally;
    lessonsOutsideLoop: Tally;
    lessonsInLoop: Tally;
    lessonsUnattributed: Tally;
    storiesSubmitted: Tally;
  };

  const blank = (): Bundle => ({
    firstNativeSignInOn: null,
    firstNativePlatform: null,
    platforms: new Set(),
    certsOpened: ZERO,
    tracksOpened: ZERO,
    trackIds: new Set(),
    libraryOpened: ZERO,
    lessonsOpened: ZERO,
    lessonsOutsideLoop: ZERO,
    lessonsInLoop: ZERO,
    lessonsUnattributed: ZERO,
    storiesSubmitted: ZERO,
  });

  const bundles = new Map<string, Bundle>();

  for (const row of aggRows) {
    const tz = rooftopMeta.get(row.rooftop_id)?.timezone ?? null;
    const last = storeDate(row.last_at, tz);
    const first = storeDate(row.first_at, tz);
    const b = bundles.get(row.user_id) ?? blank();

    switch (row.kind) {
      case "signed_in": {
        const platform = row.platform;
        if (platform === "ios" || platform === "android" || platform === "web") {
          b.platforms.add(platform);
          /* NATIVE ONLY. A web sign-in is a sign-in and is not an install, and
             rolling it into this date is precisely the kind of "same name,
             two measurements" the standing rules are about. */
          if (platform !== "web") {
            const previous = b.firstNativeSignInOn;
            const winner = earlier(previous, first);
            if (winner !== previous || previous === null) {
              b.firstNativeSignInOn = winner;
              /* The platform that owns the EARLIER date. A tester on both an
                 iPhone and an Android handset gets the one they used first. */
              if (winner === first) b.firstNativePlatform = platform;
            }
          }
        }
        break;
      }
      case "certs_opened":
        b.certsOpened = fold(b.certsOpened, row.events, last);
        break;
      case "track_opened":
        b.tracksOpened = fold(b.tracksOpened, row.events, last);
        for (const id of row.target_ids ?? []) b.trackIds.add(id);
        break;
      case "library_opened":
        b.libraryOpened = fold(b.libraryOpened, row.events, last);
        break;
      case "lesson_opened":
        b.lessonsOpened = fold(b.lessonsOpened, row.events, last);
        break;
      case "lesson_completed":
        /*
         * THE SOURCE DECIDES THE COLUMN, and a row with NO source goes in
         * NEITHER. Every lesson_completed event written since 0163 carries one
         * — both writers set it — so a null here would mean a row written by
         * something that has not been reviewed, and counting it as "outside
         * the loop" because it is not marked 'loop' is the exclusion-by-value
         * mistake pointing the other way. It goes in its own counter so the
         * remainder is visible rather than lost.
         */
        if (row.source === "loop") {
          b.lessonsInLoop = fold(b.lessonsInLoop, row.events, last);
        } else if (row.source === "library" || row.source === "card") {
          b.lessonsOutsideLoop = fold(b.lessonsOutsideLoop, row.events, last);
        } else {
          b.lessonsUnattributed = fold(b.lessonsUnattributed, row.events, last);
        }
        break;
      case "story_submitted":
        b.storiesSubmitted = fold(b.storiesSubmitted, row.events, last);
        break;
      default:
        /* An unfamiliar kind reaching here means 0163's constraint gained a
           value and this switch did not. Loud, because the alternative is a
           Rollcall silently not reporting something the app records. */
        console.warn(`[rollcall] no column for app_event kind ${JSON.stringify(row.kind)}`);
    }

    bundles.set(row.user_id, b);
  }

  /* ---- Track names, best effort ---------------------------------------- */
  const allTrackIds = [...new Set(aggRows.flatMap((r) => (r.kind === "track_opened" ? (r.target_ids ?? []) : [])))];
  const trackNameOf = new Map<string, string>();
  if (allTrackIds.length > 0) {
    const { data: certs } = await client
      .from("certification")
      .select("id, name")
      .in("id", allTrackIds);
    for (const c of (certs ?? []) as { id: string; name: string | null }[]) {
      if (c.name) trackNameOf.set(c.id, c.name);
    }
  }

  const rows: RollcallRow[] = status.rows.map((r) => {
    const b = bundles.get(r.userId) ?? blank();
    return {
      ...r,
      firstNativeSignInOn: b.firstNativeSignInOn,
      firstNativePlatform: b.firstNativePlatform,
      platforms: [...b.platforms].sort(),
      certsOpened: b.certsOpened,
      tracksOpened: b.tracksOpened,
      trackNames: [...b.trackIds]
        .map((id) => trackNameOf.get(id))
        .filter((n): n is string => Boolean(n))
        .sort(),
      libraryOpened: b.libraryOpened,
      lessonsOpened: b.lessonsOpened,
      lessonsOutsideLoop: b.lessonsOutsideLoop,
      lessonsInLoop: b.lessonsInLoop,
      lessonsUnattributed: b.lessonsUnattributed,
      storiesSubmitted: b.storiesSubmitted,
    };
  });

  /*
   * ---- "completed today" needs a today, and whose today it is matters -----
   *
   * Scoped to one rooftop there is one answer. Across several there is not,
   * and taking the first rooftop's date would quietly report a Hawaii store
   * against a Texas calendar. So the header count is only computed when the
   * screen is scoped to a single store, and the field is null otherwise —
   * which the component renders as an absent count rather than a zero.
   */
  const scopedTz = rooftopId ? rooftopMeta.get(rooftopId)?.timezone ?? null : null;
  const today = rooftopId
    ? (new Intl.DateTimeFormat("en-CA", {
        timeZone: scopedTz ?? "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()) as IsoDate)
    : null;

  /* Accounts per rooftop, for the chips. Built from the rows in scope, so an
     unscoped load lists every store that has somebody. */
  const accountsPerRooftop = new Map<string, number>();
  for (const r of status.rows) {
    accountsPerRooftop.set(r.rooftopId, (accountsPerRooftop.get(r.rooftopId) ?? 0) + 1);
  }
  const rooftops = [...rooftopMeta.values()]
    .map((r) => ({ id: r.id, name: r.name, accounts: accountsPerRooftop.get(r.id) ?? 0 }))
    /* A store with no accounts has nobody to call. See the field comment. */
    .filter((r) => r.accounts > 0)
    /* Biggest first — the one being rolled out leads without anybody
       hard-coding its name. Then alphabetical, so the rest stays findable. */
    .sort((a, b) => b.accounts - a.accounts || a.name.localeCompare(b.name));

  /* The earliest event anybody in scope has. Formatted in the rooftop whose
     event it is, so it is the day it happened at that store. */
  let recordingSince: IsoDate | null = null;
  for (const row of aggRows) {
    const tz = rooftopMeta.get(row.rooftop_id)?.timezone ?? null;
    recordingSince = earlier(recordingSince, storeDate(row.first_at, tz));
  }

  return {
    ...status,
    rows,
    recordingSince,
    nativeInstalled: rows.filter((r) => r.firstNativeSignInOn !== null).length,
    onboarded: rows.filter((r) => r.scheduleSetOn !== null).length,
    completedToday: today
      ? rows.filter((r) => r.lastCompletionOn === today).length
      : 0,
    rooftops,
    rooftopId: rooftopId ?? null,
    today,
  };
}

/**
 * What is new for each advisor since a given instant.
 *
 * ---------------------------------------------------------------------------
 * COMPARED ON INSTANTS, NOT ON THE DATES THE SCREEN SHOWS
 * ---------------------------------------------------------------------------
 * The Rollcall rows carry store-DATES, because that is what a person reads.
 * "New since the last post" cannot be derived from them: the post goes out
 * twice a day, so two changes on the same date have to be distinguishable, and
 * a date comparison would mark the morning's facts new again at 17:30.
 *
 * So this reads the four underlying tables' own timestamps. All four have one
 * — app_event.at, daily_completion.created_at, work_schedule.schedule_set_at,
 * daily_activity.created_at — which is why this is precise rather than a
 * best guess about a day.
 *
 * daily_activity.created_at is the row's WRITE time, not the activity_date it
 * records, and for the first-sign-in fact those are the same moment: the row
 * is written by markActiveToday as the page renders. For a backfilled row they
 * would not be, and the honest reading of a change here is "we learned this
 * since the last post", which is what the message says.
 */
export type RollcallFact =
  | "installed"
  | "password"
  | "onboarded"
  | "mornings"
  | "certs"
  | "tracks"
  | "library"
  | "lessons"
  | "story";

export async function loadRollcallChanges(
  client: Client,
  rooftopId: string,
  since: Date,
  userIds: string[]
): Promise<Map<string, Set<RollcallFact>>> {
  const out = new Map<string, Set<RollcallFact>>();
  if (userIds.length === 0) return out;

  const add = (userId: string, fact: RollcallFact) => {
    const set = out.get(userId) ?? new Set<RollcallFact>();
    set.add(fact);
    out.set(userId, set);
  };

  const sinceIso = since.toISOString();

  const [{ data: events }, { data: completions }, { data: schedules }, { data: activity }] =
    await Promise.all([
      client
        .from("app_event")
        .select("user_id, kind, meta")
        .eq("rooftop_id", rooftopId)
        .in("user_id", userIds)
        .gt("at", sinceIso),
      client
        .from("daily_completion")
        .select("user_id")
        .in("user_id", userIds)
        .gt("created_at", sinceIso),
      client
        .from("work_schedule")
        .select("user_id")
        .in("user_id", userIds)
        .gt("schedule_set_at", sinceIso),
      client
        .from("daily_activity")
        .select("user_id")
        .in("user_id", userIds)
        .gt("created_at", sinceIso),
    ]);

  for (const e of (events ?? []) as {
    user_id: string;
    kind: string;
    meta: Record<string, unknown> | null;
  }[]) {
    switch (e.kind) {
      case "signed_in":
        /* Only a NATIVE sign-in moves the installed fact, for the same reason
           the column does: a web session is not an install. */
        if (e.meta?.platform === "ios" || e.meta?.platform === "android") {
          add(e.user_id, "installed");
        }
        break;
      case "certs_opened":
        add(e.user_id, "certs");
        break;
      case "track_opened":
        add(e.user_id, "tracks");
        break;
      case "library_opened":
      case "lesson_opened":
        add(e.user_id, "library");
        break;
      case "lesson_completed":
        /* The MORNING's item is already covered by the completion fact below;
           marking it here as well would report one act twice. */
        if (e.meta?.source !== "loop") add(e.user_id, "lessons");
        break;
      case "story_submitted":
        add(e.user_id, "story");
        break;
      default:
        console.warn(`[rollcall] no change fact for app_event kind ${JSON.stringify(e.kind)}`);
    }
  }

  for (const r of (completions ?? []) as { user_id: string }[]) add(r.user_id, "mornings");
  for (const r of (schedules ?? []) as { user_id: string }[]) add(r.user_id, "onboarded");
  for (const r of (activity ?? []) as { user_id: string }[]) add(r.user_id, "password");

  return out;
}

/**
 * Does the event stream agree with daily_completion about the mornings?
 *
 * ---------------------------------------------------------------------------
 * THE SECOND ROUTE TO THE SAME QUANTITY, WHICH IS THE ONLY PROOF THERE IS
 * ---------------------------------------------------------------------------
 * A morning serves at most one item, so the number of `lesson_completed`
 * events with source `loop` can never exceed the number of daily_completion
 * rows. It can be LOWER and legitimately so — a two-slot morning has no item
 * at all, and every completion before 0163 shipped wrote no event — which is
 * why only the overshoot is a fault.
 *
 * Returns the advisors for whom it overshoots. Empty is the expected answer
 * and the screen says nothing; non-empty means the event stream is counting
 * something that is not a morning item, and the Rollcall's other numbers are
 * then suspect too.
 */
export function loopCompletionMismatches(
  rollcall: Rollcall
): { userId: string; name: string; loopEvents: number; completions: number }[] {
  return rollcall.rows
    .filter((r) => r.lessonsInLoop.count > r.completionCount)
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      loopEvents: r.lessonsInLoop.count,
      completions: r.completionCount,
    }));
}
