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

  /**
   * Can a push reach them at all — the first thing to know before asking why
   * one did not arrive.
   *
   * From `advisor_reachable` (0165), which deliberately does NOT carry the
   * token itself. Null means the view returned no row for them, which for a
   * person who has never registered a device is the expected answer and is
   * rendered as "no" rather than as a dash: "we have never had anywhere to
   * send to" is a fact, not an absence of one.
   */
  reach: Reachability | null;

  /**
   * The most recent push they were sent, and whether they came back after it.
   *
   * Null means nothing has ever been queued AND delivered for them. On a
   * rollout week that is almost everybody, and the screen says so in those
   * words rather than leaving a blank somebody has to interpret.
   */
  lastPush: LastPush | null;
};

/**
 * Whether there is anywhere to send a notification.
 *
 * `livePlatforms` is the platforms that can be reached NOW — a retired handset
 * is not a way to reach anybody, and listing it would be a label with nothing
 * behind it. `lastRetiredReason` is carried because "they had a token and Apple
 * rejected it" and "they never had one" are different problems that read
 * identically as a boolean false.
 */
export type Reachability = {
  reachable: boolean;
  livePlatforms: SignInPlatform[];
  firstRegisteredOn: IsoDate | null;
  retiredTokens: number;
  lastRetiredReason: string | null;
};

/** One push, and what happened after it. */
export type LastPush = {
  kind: string;
  /** The store-date the send belonged to. */
  storeDate: IsoDate;
  /**
   * When Apple was spoken to about it — `push_delivery.at`, which is the only
   * one of the four instants on the send that is an observation of the thing
   * whose effect is being measured. See 0165's header.
   */
  attemptedAt: string;
  deliveredOk: boolean;
  /** Apple's machine-readable refusal, e.g. "BadDeviceToken". */
  apnsReason: string | null;
  /** Minutes to the first sign-in, activity row or completion. Null if none. */
  returnGapMinutes: number | null;
  returnSource: string | null;
  /** That gap was inside 24 hours. False for a delivery Apple refused. */
  returned: boolean;
};

/**
 * The rooftop's pushes over the period, at MESSAGE grain.
 *
 * ---------------------------------------------------------------------------
 * THREE WORDS THAT ARE NOT THE SAME NUMBER, SO THEY ARE THREE FIELDS
 * ---------------------------------------------------------------------------
 *   sent       messages we got as far as ATTEMPTING a delivery for
 *   delivered  messages APPLE ACCEPTED for at least one device
 *   returned   delivered messages followed by a return inside 24 hours
 *
 * All three count DISTINCT MESSAGES, not deliveries — a person carrying two
 * handsets is one notification. `failedDeliveries` is the one device-grain
 * number and is named for it, so the two grains can never be read as one.
 *
 * `rate` is null rather than 0 when nothing was delivered. A return rate over
 * zero deliveries is undefined, and printing 0% would read as "we asked and
 * they ignored us" — the most expensive wrong answer this screen could give on
 * a rollout week.
 */
export type PushTally = {
  sent: number;
  delivered: number;
  returned: number;
  failedDeliveries: number;
  rate: number | null;
  /** How many store-days back the counts cover. Printed, never assumed. */
  days: number;
  /** The earliest and latest store-date actually seen, or null for neither. */
  firstOn: IsoDate | null;
  lastOn: IsoDate | null;
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
  /**
   * The pushes, for the whole scope over the period. The screen prints this
   * above the per-person list for the same reason the other counts are there:
   * on a rollout week the question is "is this reaching anybody", and the list
   * is where you go when the answer is lower than expected.
   */
  pushes: PushTally;
  /**
   * The same counts for the rooftop's TODAY — what the 17:30 Slack post says.
   *
   * Null across several rooftops, like `completedToday` and for the same
   * reason: there is no single today across timezones.
   */
  pushesToday: PushTally | null;
  /**
   * Advisors with no live token — the number that explains a zero in `pushes`
   * without anybody having to scroll.
   *
   * SAID SEPARATELY FROM THE PUSH COUNTS ON PURPOSE. "0 sent" has two very
   * different causes — nobody was eligible, or nobody was reachable — and a
   * screen that showed only the first would send somebody looking for a bug in
   * the generator. This is the second cause, counted.
   */
  unreachable: number;
};

/**
 * How far back the push counts reach.
 *
 * NAMED AND PRINTED, never implied. A count over "the period" with no period
 * stated is a scoped measurement reported as a general one, and this file's
 * sibling report is a list of times that has cost us. Thirty days because the
 * Return cadence itself stops thirty calendar days after the last completion
 * (0152), so a shorter window could show an empty table while a live
 * re-engagement sequence was running.
 */
export const PUSH_WINDOW_DAYS = 30;

/** A row of push_return (0165). One per delivery attempt, per device. */
type PushRow = {
  outbox_id: string;
  user_id: string;
  rooftop_id: string;
  kind: string;
  store_date: string;
  attempted_at: string;
  delivered_ok: boolean;
  apns_reason: string | null;
  returned_at: string | null;
  return_source: string | null;
  return_gap_minutes: number | null;
  returned: boolean;
};

/** A row of advisor_reachable (0165). Never carries the token. */
type ReachRow = {
  user_id: string;
  reachable: boolean;
  live_platforms: string[] | null;
  first_registered_at: string | null;
  last_seen_at: string | null;
  retired_tokens: number;
  last_retired_reason: string | null;
};

/**
 * Count a set of push_return rows at MESSAGE grain.
 *
 * One definition, used for the thirty-day line on the screen and the one-day
 * line in Slack. Two hand-rolled reductions over the same rows would be two
 * answers to one question, and the one nobody checks is the one that drifts.
 */
function tallyPushes(rows: PushRow[], days: number): PushTally {
  const messages = new Set(rows.map((r) => r.outbox_id));
  const delivered = new Set(
    rows.filter((r) => r.delivered_ok).map((r) => r.outbox_id)
  );
  /* `delivered_ok` is required as well as `returned`, even though the view can
     only set returned on an accepted delivery. Belt to that braces: if the
     view's lateral condition were ever relaxed, this would keep the screen's
     definition of a return tied to a push that actually left. */
  const returned = new Set(
    rows.filter((r) => r.delivered_ok && r.returned).map((r) => r.outbox_id)
  );
  const dates = rows.map((r) => r.store_date as IsoDate).sort();

  return {
    sent: messages.size,
    delivered: delivered.size,
    returned: returned.size,
    failedDeliveries: rows.filter((r) => !r.delivered_ok).length,
    /* Null, not zero. See PushTally's comment — 0 of 0 is not 0%. */
    rate: delivered.size > 0 ? returned.size / delivered.size : null,
    days,
    firstOn: dates[0] ?? null,
    lastOn: dates[dates.length - 1] ?? null,
  };
}

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

  /* ---- Reachability and the pushes -------------------------------------
     Both read through the CALLER's client, like everything else here, so the
     screen gets the policies' answer and the cron gets the service role's.
     push_return is security_invoker and obeys push_delivery's policies;
     advisor_reachable is deliberately definer with its own gate — see 0165. */
  let reachRows: ReachRow[] = [];
  let pushRows: PushRow[] = [];

  if (userIds.length > 0) {
    /* The window, computed from today rather than written down. A literal date
       in a query is a filter that is true the week it is typed. */
    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - PUSH_WINDOW_DAYS);
    const since = windowStart.toISOString().slice(0, 10);

    const reachQuery = client
      .from("advisor_reachable")
      .select(
        "user_id, reachable, live_platforms, first_registered_at, last_seen_at, retired_tokens, last_retired_reason"
      )
      .in("user_id", userIds);

    /* Scoped by ROOFTOP when there is one, because push_return carries it and
       that is the cheaper, more precise filter; by user id otherwise. The user
       filter is kept in both cases as belt to the policy's braces — an advisor
       who moved stores keeps their delivery rows, and this screen is about the
       people on it. */
    let pushQuery = client
      .from("push_return")
      .select(
        "outbox_id, user_id, rooftop_id, kind, store_date, attempted_at, delivered_ok, apns_reason, returned_at, return_source, return_gap_minutes, returned"
      )
      .in("user_id", userIds)
      .gte("store_date", since);
    if (rooftopId) pushQuery = pushQuery.eq("rooftop_id", rooftopId);

    const [{ data: reachData }, { data: pushData }] = await Promise.all([
      reachQuery,
      pushQuery,
    ]);
    reachRows = (reachData ?? []) as ReachRow[];
    pushRows = (pushData ?? []) as PushRow[];
  }

  /* Each person's own rooftop, so a registration instant is formatted as the
     day it fell on AT THEIR STORE. Built once rather than searched per row. */
  const rooftopOfUser = new Map(status.rows.map((r) => [r.userId, r.rooftopId]));

  const reachOf = new Map<string, Reachability>();
  for (const r of reachRows) {
    const tz =
      rooftopMeta.get(rooftopOfUser.get(r.user_id) ?? "")?.timezone ?? null;
    reachOf.set(r.user_id, {
      reachable: Boolean(r.reachable),
      livePlatforms: ((r.live_platforms ?? []) as string[]).filter(
        (p): p is SignInPlatform => p === "ios" || p === "android" || p === "web"
      ),
      firstRegisteredOn: r.first_registered_at
        ? storeDate(r.first_registered_at, tz)
        : null,
      retiredTokens: Number(r.retired_tokens ?? 0),
      lastRetiredReason: r.last_retired_reason,
    });
  }

  /*
   * ---- The last push per advisor ----------------------------------------
   *
   * ONE MESSAGE, THEN THE BEST NEWS ABOUT IT. The rows are per DEVICE, so a
   * person with two handsets has two rows for one notification — and if one
   * handset was accepted and the other refused, the honest summary is
   * "delivered", because they received it. Picking the latest ROW instead would
   * flip the column to "failed: BadDeviceToken" for somebody whose phone buzzed,
   * which is the cron's own rule — "one device is enough" — and this has to
   * agree with it or the screen contradicts the transport.
   */
  const lastPushOf = new Map<string, LastPush>();
  const byUser = new Map<string, PushRow[]>();
  for (const row of pushRows) {
    const l = byUser.get(row.user_id) ?? [];
    l.push(row);
    byUser.set(row.user_id, l);
  }
  for (const [userId, rows] of byUser) {
    /* The latest MESSAGE, by the latest attempt belonging to it. */
    const latestOutboxId = rows.reduce((best, r) =>
      r.attempted_at > best.attempted_at ? r : best
    ).outbox_id;
    const forMessage = rows.filter((r) => r.outbox_id === latestOutboxId);
    const accepted = forMessage.filter((r) => r.delivered_ok);
    /* An accepted delivery wins; among several, the one that came back soonest,
       because that is the one the push plausibly caused. */
    const chosen =
      accepted.length > 0
        ? accepted.reduce((best, r) =>
            (r.return_gap_minutes ?? Number.POSITIVE_INFINITY) <
            (best.return_gap_minutes ?? Number.POSITIVE_INFINITY)
              ? r
              : best
          )
        : forMessage[0];

    lastPushOf.set(userId, {
      kind: chosen.kind,
      storeDate: chosen.store_date as IsoDate,
      attemptedAt: chosen.attempted_at,
      deliveredOk: chosen.delivered_ok,
      apnsReason: chosen.apns_reason,
      returnGapMinutes: chosen.return_gap_minutes,
      returnSource: chosen.return_source,
      returned: Boolean(chosen.returned),
    });
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
      reach: reachOf.get(r.userId) ?? null,
      lastPush: lastPushOf.get(r.userId) ?? null,
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

  /*
   * ---- The push tally, counted from the rows rather than asserted ---------
   *
   * Every number here is derived from `pushRows`, which is the same array the
   * per-person column reads. One source, so the line above the list and the
   * lines in it cannot disagree — the mistake 0163 avoided by grouping in
   * Postgres, taken the same way one level up.
   */
  const pushes = tallyPushes(pushRows, PUSH_WINDOW_DAYS);

  /*
   * ---- And the same tally for TODAY, for the Slack line -------------------
   *
   * COUNTED FROM THE SAME ROWS, not derived from the thirty-day summary and not
   * read back with a second query. One array, two filters over it — so the
   * evening post and the screen cannot disagree about a day they both cover.
   *
   * Null when the scope is more than one rooftop, exactly as `completedToday`
   * is null and for the same reason: there is no single today across
   * timezones, and quietly counting a Hawaii store against a Texas date is the
   * confident wrong answer this screen's header already warns about.
   */
  const pushesToday = today
    ? tallyPushes(
        pushRows.filter((r) => r.store_date === today),
        1
      )
    : null;

  return {
    ...status,
    rows,
    recordingSince,
    pushes,
    pushesToday,
    /* Counted over the rows in scope, so it is the same population the list
       shows — not a separate query that could drift from it. */
    unreachable: rows.filter((r) => !r.reach?.reachable).length,
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
