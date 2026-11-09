/* ============================================================================
   EDIAGD — Rollcall: what every advisor has done, from one place
   SERVER ONLY (takes a Supabase client).

   Ryan, 6 October, before the Beaumont invites: who downloaded the TestFlight
   app and when, who created their password, who completed onboarding, who
   completed a daily loop, who clicked on Certs and other courses, and who
   completed lessons outside the daily loop.

   Ryan, 6 November, four weeks in: the onboarding half stopped changing and the
   tap counts were never progress, so the evening post now leads on who did
   their morning and how far each advisor is toward EDIAGD Certified. The old
   columns are all still loaded — /admin/engagement is the long form and the
   taps answer real questions there — and `certs` is the new one. See
   CertProgress, which carries a role warning that must be read before anything
   else renders its numerator.

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
import { gatingModuleIds } from "@/lib/lms";
import { storeDateOf } from "@/lib/store-day";

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

  /** How far toward EDIAGD Certified. See CertProgress. */
  certs: CertProgress;
};

/**
 * An advisor's position on the craft ladder — the thing the taps never
 * measured.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS REPLACED "Certs 44 · tracks 28" IN THE POST
 * ---------------------------------------------------------------------------
 * certsOpened and tracksOpened count TAPS. They rise when somebody browses and
 * cannot fall, so they are a record of curiosity reported in the position where
 * a reader expects progress. These two numbers are the gating-module count the
 * credential itself is computed from, which is the only quantity on this row
 * that answers "are they getting certified".
 *
 * ---------------------------------------------------------------------------
 * READ THE ROLE WARNING BEFORE RENDERING gatingDone ANYWHERE NEW
 * ---------------------------------------------------------------------------
 * `module_completion` is own-rows-only — `module_completion_own`, 0035 — and
 * that is a restated product ruling rather than an oversight: 0117 says in as
 * many words that a manager sees a credential pill and "never a colleague's
 * per-track progress", and loadCredentialPills repeats it.
 *
 * So for a SESSION client this numerator comes back as ZERO for everybody the
 * caller is not, with no error — the exact shape of this codebase's
 * most-repeated defect. `Rollcall.certProgressProven` says whether the caller
 * actually demonstrated a cross-user read, and no surface may draw a meter
 * from `gatingDone` without consulting it. The evening post is correct because
 * it runs as the SERVICE ROLE, which the cron's header already names.
 *
 * `earned` has no such caveat: advisor_certification is readable for
 * `managed_users()` (0115), which is precisely the credential a manager is
 * meant to see.
 */
export type CertProgress = {
  /**
   * Completed gating modules across the ACTIVE core tracks.
   *
   * A HELD TRACK COUNTS AS ALL OF ITS GATING MODULES DONE, whatever
   * module_completion says, because trackRowProgress already rules that held is
   * full: a track earned before a tenth lesson was published is still earned,
   * and a bar at 90% under the word "Earned" would be the row arguing with
   * itself.
   */
  gatingDone: number;
  /** Gating modules across the active core tracks. Same for everyone here. */
  gatingTotal: number;
  /** Core certifications held, by name, in certification.sort order. */
  earned: string[];
  /**
   * The last day they completed a gating module in a core track, or null.
   *
   * Carried so the post can say "last cert work 27 Oct" instead of leaving a
   * low meter beside a completed morning with no explanation. It is the store
   * date of the latest module_completion, so it inherits gatingDone's role
   * caveat exactly.
   */
  lastWorkedOn: IsoDate | null;
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

  /** Active core certifications — the tracks the credential is made of. */
  coreTracks: number;
  /** The roster's gating modules completed, summed. */
  teamGatingDone: number;
  /** `gatingTotal` × the roster, so the team meter has the same denominator
      per person as every individual meter. */
  teamGatingTotal: number;
  /** Core certifications held across the roster. */
  teamEarned: number;
  /**
   * Whether this caller DEMONSTRATED that it can read somebody else's
   * module_completion — not whether we assume it can.
   *
   * ---------------------------------------------------------------------------
   * PROOF, BECAUSE THE FAILURE IS A CONFIDENT ZERO AND NOT AN ERROR
   * ---------------------------------------------------------------------------
   * `module_completion_own` (0035) returns the caller's own rows and nothing
   * else, silently. A screen reading `certs.gatingDone` through a session
   * client therefore draws 0% for an entire roster and looks like a store where
   * nobody has started — a label with nothing behind it, which is the defect
   * this project has met more than any other.
   *
   * It cannot be inferred from the client object, so it is OBSERVED: rows came
   * back for two or more DISTINCT roster members, which one session can only
   * manage if the policy let it past its own `auth.uid()`. False is therefore
   * "unproven", not "forbidden" — including on a store where fewer than two
   * people have finished a lesson, where the meter would be flat anyway and
   * "nothing recorded" is the true thing to say.
   *
   * The evening post does not consult this because it runs as the service role
   * and bypasses RLS outright; /admin/engagement does, and suppresses the meter
   * rather than printing a zero it cannot stand behind.
   */
  certProgressProven: boolean;
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

/**
 * PostgREST puts an `in` list in the query string, so a long one is split.
 * 100 is the batch size the rest of the codebase settled on (gatingModuleIds).
 */
const BATCH = 100;

function batched<T>(items: T[]): T[][] {
  if (items.length === 0) return [];
  return Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) =>
    items.slice(i * BATCH, (i + 1) * BATCH)
  );
}

/** One page. Below PostgREST's default ceiling, so the range is what decides. */
const PAGE = 1000;

/**
 * Read every row, in pages, for each batch of user ids — and never stop
 * because a page happened to be full.
 *
 * ---------------------------------------------------------------------------
 * A CAPPED READ IS A SILENT TRUNCATION, AND THIS ONE WOULD UNDERCOUNT
 * ---------------------------------------------------------------------------
 * PostgREST returns a bounded page whether or not the caller asked for one. A
 * single `select` over a store's completions therefore has a size at which it
 * starts quietly reporting less work than an advisor has done — low, in the
 * direction that looks like somebody slacking, with nothing erroring. This
 * keeps asking until a page comes back short, which is the only condition that
 * means "that was all of them".
 *
 * `order` is required for paging to be stable: 0128's sibling lesson is that a
 * page without an ORDER BY is a page of whatever the planner felt like.
 */
async function pageAll<T>(
  userIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (users: string[], from: number, to: number) => any
): Promise<T[]> {
  const out: T[] = [];
  for (const users of batched(userIds)) {
    for (let from = 0; ; from += PAGE) {
      const { data } = await query(users, from, from + PAGE - 1);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

/**
 * How far every advisor on the roster is toward EDIAGD Certified, in one pass.
 *
 * ---------------------------------------------------------------------------
 * THE SAME POPULATION THE CREDENTIAL IS COMPUTED FROM, BY THE SAME DEFINITION
 * ---------------------------------------------------------------------------
 * GATING modules of the ACTIVE CORE tracks — which is what craftComplete()
 * requires and what the bar on /certifications draws. The gating rule itself is
 * NOT reimplemented here: `gatingModuleIds` in lib/lms.ts is the one definition,
 * it mirrors `gating_content_types()` in the database, and `npm run check:gating`
 * fails if the two ever differ. A second copy of "which modules gate" is how the
 * library screen and the credential come to disagree about one module.
 *
 * A module reachable from two core tracks is counted ONCE PER TRACK, because
 * `certification.item_count` and the page's own `coreModulesTotal` do the same —
 * the meter has to equal the bar the advisor sees, and matching it matters more
 * than the tidier number.
 *
 * It CANNOT call `my_certification_progress()`, which 0117 keyed on `auth.uid()`
 * deliberately so that no parameter exists to forge. The cron has no session, so
 * every piece is read from the tables it is derived from instead — and each of
 * those reads goes through the CALLER's client, so the answer is the caller's
 * policies' answer and not a claim about somebody else's.
 */
async function loadCertProgress(
  client: Client,
  userIds: string[],
  rooftopTzOfUser: (userId: string) => string | null
): Promise<{
  byUser: Map<string, CertProgress>;
  gatingTotal: number;
  coreTracks: number;
  proven: boolean;
}> {
  const empty = {
    byUser: new Map<string, CertProgress>(),
    gatingTotal: 0,
    coreTracks: 0,
    proven: false,
  };
  if (userIds.length === 0) return empty;

  /* ---- 1. The tracks the credential is made of ------------------------- */
  const { data: certRows } = await client
    .from("certification")
    .select("id, name, sort")
    .eq("is_core", true)
    .eq("active", true);

  const coreCerts = ((certRows ?? []) as { id: string; name: string; sort: number | null }[])
    .slice()
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  if (coreCerts.length === 0) return empty;

  const coreIds = coreCerts.map((c) => c.id);
  const nameOfCert = new Map(coreCerts.map((c) => [c.id, c.name]));

  /* ---- 2. Their courses, and 3. those courses' modules ----------------- */
  const { data: ccRows } = await client
    .from("certification_course")
    .select("certification_id, course_id")
    .in("certification_id", coreIds);

  const links = (ccRows ?? []) as { certification_id: string; course_id: string }[];
  const courseIds = [...new Set(links.map((l) => l.course_id))];
  if (courseIds.length === 0) {
    return { ...empty, coreTracks: coreCerts.length };
  }

  const moduleRows: { id: string; course_id: string }[] = [];
  for (const batch of batched(courseIds)) {
    const { data } = await client.from("module").select("id, course_id").in("course_id", batch);
    moduleRows.push(...((data ?? []) as { id: string; course_id: string }[]));
  }

  /* ---- 4. Which of those modules GATE. One definition, imported. ------- */
  const gating = await gatingModuleIds(
    client,
    moduleRows.map((m) => m.id)
  );

  const modulesOfCourse = new Map<string, string[]>();
  for (const m of moduleRows) {
    if (!gating.has(m.id)) continue;
    const list = modulesOfCourse.get(m.course_id) ?? [];
    list.push(m.id);
    modulesOfCourse.set(m.course_id, list);
  }

  /* Per TRACK, deliberately — see the header on double-counting. */
  const gatingOfCert = new Map<string, Set<string>>();
  for (const l of links) {
    const set = gatingOfCert.get(l.certification_id) ?? new Set<string>();
    for (const id of modulesOfCourse.get(l.course_id) ?? []) set.add(id);
    gatingOfCert.set(l.certification_id, set);
  }
  const gatingTotal = coreIds.reduce((n, id) => n + (gatingOfCert.get(id)?.size ?? 0), 0);

  const allGatingIds = [...new Set([...gatingOfCert.values()].flatMap((s) => [...s]))];

  /* ---- 5. What each of them has completed, and 6. what they hold -------
     BY USER, NOT BY USER × MODULE, AND PAGED.

     The obvious shape — one request per user batch per module batch — is eight
     round trips against the real catalogue's 736 gating modules, and each one
     could return more rows than PostgREST hands back by default. A read capped
     at its default page is a silent truncation, and a truncated numerator reads
     as an advisor who has done less than they have: wrong in the direction
     nobody questions.

     So the filter is the ROSTER (one request per user batch, paged to
     exhaustion) and the gating set is applied in memory, where it is a set
     lookup. A completion outside the core tracks costs a few rows of payload
     and is dropped by the intersection below. */
  const completionRows = await pageAll<{
    user_id: string;
    module_id: string;
    completed_at: string;
  }>(userIds, (users, from, to) =>
    client
      .from("module_completion")
      .select("user_id, module_id, completed_at")
      .in("user_id", users)
      .order("module_id")
      .range(from, to)
  );

  const earnedRows = await pageAll<{ user_id: string; certification_id: string }>(
    userIds,
    (users, from, to) =>
      client
        .from("advisor_certification")
        .select("user_id, certification_id")
        .in("user_id", users)
        .in("certification_id", coreIds)
        .order("certification_id")
        .range(from, to)
  );

  const gatingSet = new Set(allGatingIds);
  const completedOf = new Map<string, Set<string>>();
  const lastWorkedAtOf = new Map<string, string>();
  for (const r of completionRows) {
    /* The intersection the query no longer does. A module outside the active
       core tracks is not what this meter measures. */
    if (!gatingSet.has(r.module_id)) continue;
    const set = completedOf.get(r.user_id) ?? new Set<string>();
    set.add(r.module_id);
    completedOf.set(r.user_id, set);
    const previous = lastWorkedAtOf.get(r.user_id);
    if (!previous || r.completed_at > previous) lastWorkedAtOf.set(r.user_id, r.completed_at);
  }

  const heldOf = new Map<string, Set<string>>();
  for (const r of earnedRows) {
    const set = heldOf.get(r.user_id) ?? new Set<string>();
    set.add(r.certification_id);
    heldOf.set(r.user_id, set);
  }

  const byUser = new Map<string, CertProgress>();
  for (const userId of userIds) {
    const completed = completedOf.get(userId) ?? new Set<string>();
    const held = heldOf.get(userId) ?? new Set<string>();

    let done = 0;
    for (const certId of coreIds) {
      const mods = gatingOfCert.get(certId);
      if (!mods) continue;
      /* HELD IS FULL — trackRowProgress's ruling, applied to the same track so
         the Slack meter and that track's own bar cannot disagree. */
      if (held.has(certId)) {
        done += mods.size;
        continue;
      }
      for (const id of mods) if (completed.has(id)) done++;
    }

    const lastAt = lastWorkedAtOf.get(userId);
    byUser.set(userId, {
      gatingDone: done,
      gatingTotal,
      earned: coreIds
        .filter((id) => held.has(id))
        .map((id) => nameOfCert.get(id))
        .filter((n): n is string => Boolean(n)),
      lastWorkedOn: lastAt ? storeDate(lastAt, rooftopTzOfUser(userId)) : null,
    });
  }

  return {
    byUser,
    gatingTotal,
    coreTracks: coreCerts.length,
    /* OBSERVED, never assumed. Two distinct people's rows is something one
       session's `auth.uid()` cannot produce. See certProgressProven. */
    proven: new Set(completionRows.map((r) => r.user_id)).size >= 2,
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
 * ---------------------------------------------------------------------------
 * THE BODY MOVED TO lib/store-day.ts, AND THAT IS NOT TIDYING
 * ---------------------------------------------------------------------------
 * The Rollcall cron now has to answer the same question — which day is it at
 * the store, so it can decide whether to post at all — and a second copy of
 * this formatter is a second DEFINITION of the store's day. They would agree
 * until the moment one of them was changed, and then one screen would group a
 * 7pm Hawaii sign-in onto a different date from the one the post was skipped
 * for, with nothing erroring.
 *
 * The empty-string guard stays HERE rather than moving, because it is a fact
 * about these callers — an absent `first_at`/`last_at` from the aggregate —
 * and not about dates. storeDateOf has no business having an opinion on it.
 */
function storeDate(instant: string, timezone: string | null): IsoDate | null {
  if (!instant) return null;
  return storeDateOf(instant, timezone);
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
  const tzOfUser = (userId: string) =>
    rooftopMeta.get(rooftopOfUser.get(userId) ?? "")?.timezone ?? null;

  /* ---- How far up the craft ladder, for everybody, in one pass --------- */
  const certs = await loadCertProgress(client, userIds, tzOfUser);

  const reachOf = new Map<string, Reachability>();
  for (const r of reachRows) {
    const tz = tzOfUser(r.user_id);
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
      /* Never undefined: loadCertProgress returns a row for every user id it
         was given, and an empty one when there is no active core track at all.
         A missing key here would make a 0% meter and "no tracks exist yet"
         render identically. */
      certs: certs.byUser.get(r.userId) ?? {
        gatingDone: 0,
        gatingTotal: certs.gatingTotal,
        earned: [],
        lastWorkedOn: null,
      },
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
    coreTracks: certs.coreTracks,
    /* SUMMED FROM THE ROWS, so the team line and the per-person meters cannot
       disagree — the same discipline the push tally follows. */
    teamGatingDone: rows.reduce((n, r) => n + r.certs.gatingDone, 0),
    teamGatingTotal: certs.gatingTotal * rows.length,
    teamEarned: rows.reduce((n, r) => n + r.certs.earned.length, 0),
    certProgressProven: certs.proven,
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
 * So this reads the underlying tables' own timestamps — app_event.at,
 * daily_completion.created_at, work_schedule.schedule_set_at,
 * advisor_certification.earned_at, and app_event_rollcall.first_at for the
 * first native sign-in — which is why this is precise rather than a best guess
 * about a day.
 *
 * ---------------------------------------------------------------------------
 * A FIRST-TIME FACT IS PROVED TO BE A FIRST, NOT ASSUMED FROM A ROW EXISTING
 * ---------------------------------------------------------------------------
 * daily_activity.created_at used to set a fact labelled "first sign-in", and
 * any native sign-in used to set one labelled "signed in from a phone". Both
 * fired on every subsequent occurrence, so the 6 November post told Ryan that
 * seven advisors who onboarded in October had just signed in for the first
 * time. The window was right; the labels described something else.
 *
 * `firstMorning` is now checked against the all-time `completionCount`, and
 * `installedApp` against the aggregate's `first_at` — a value that does not
 * move when somebody signs in again. The daily_activity read is gone entirely:
 * "they opened the app" is not news about an advisor who opens it every day.
 */
export type RollcallChange = {
  /**
   * lesson_completed events in the window, ANY source.
   *
   * ONE COUNT, NOT A MORNING/LIBRARY SPLIT. The split is a question about
   * surfaces and /admin/engagement answers it; in a channel it was two numbers
   * nobody added together. The morning's own item is included — it is a lesson
   * somebody finished — and the mark beside their name already says they did
   * their morning, so nothing is being counted twice in one column.
   */
  lessons: number;
  /** Core certifications whose `earned_at` fell in the window, by name. */
  earned: string[];
  /** A Good News Story was filed. An edit is not a submission. */
  story: boolean;
  /**
   * Their FIRST EVER morning landed in the window.
   *
   * ---------------------------------------------------------------------------
   * FIRST-TIME, PROVED AGAINST THE ALL-TIME COUNT — AND THE OLD VERSION WAS NOT
   * ---------------------------------------------------------------------------
   * This used to be a fact called `password` ("first sign-in") set by ANY
   * daily_activity row in the window, and `installed` ("signed in from a phone")
   * set by ANY native sign-in. So on 6 November seven advisors who had first
   * signed in weeks earlier were reported as having just signed in for the first
   * time. The diff was right about what happened and the label was wrong about
   * what it meant, which is this codebase's most-repeated defect wearing a
   * change-log costume.
   *
   * It fires only when EVERY completion this person has is inside the window,
   * compared against `completionCount` from the same table — so a second
   * morning cannot set it, and neither can a hundredth.
   */
  firstMorning: boolean;
  /** work_schedule.schedule_set_at fell in the window — onboarding finished. */
  onboarded: boolean;
  /**
   * Their FIRST EVER native sign-in landed in the window.
   *
   * Taken from app_event_rollcall's `first_at` per platform, which is an
   * INSTANT, so this is decided on the same grain as the window itself rather
   * than on the store-date the row carries. A second sign-in, on any day,
   * cannot fire it: `first_at` does not move.
   */
  installedApp: boolean;
};

const NO_CHANGE: RollcallChange = {
  lessons: 0,
  earned: [],
  story: false,
  firstMorning: false,
  onboarded: false,
  installedApp: false,
};

/** Did anything at all happen for this person? */
export function hasMovement(change: RollcallChange | undefined): boolean {
  if (!change) return false;
  return (
    change.lessons > 0 ||
    change.earned.length > 0 ||
    change.story ||
    change.firstMorning ||
    change.onboarded ||
    change.installedApp
  );
}

export async function loadRollcallChanges(
  client: Client,
  rooftopId: string,
  since: Date,
  rows: Pick<RollcallRow, "userId" | "completionCount">[]
): Promise<Map<string, RollcallChange>> {
  const out = new Map<string, RollcallChange>();
  const userIds = rows.map((r) => r.userId);
  if (userIds.length === 0) return out;

  const change = (userId: string): RollcallChange => {
    const existing = out.get(userId);
    if (existing) return existing;
    const fresh = { ...NO_CHANGE, earned: [] as string[] };
    out.set(userId, fresh);
    return fresh;
  };

  const sinceIso = since.toISOString();

  const [
    { data: events },
    { data: completions },
    { data: schedules },
    { data: earned },
    { data: signIns },
    { data: coreCerts },
  ] = await Promise.all([
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
      .from("advisor_certification")
      .select("user_id, certification_id")
      .in("user_id", userIds)
      .gt("earned_at", sinceIso),
    /* THE FIRST native sign-in per platform, as an INSTANT. The aggregate
       already holds it, so this is one small read rather than a scan of every
       sign-in anybody has ever made. */
    client
      .from("app_event_rollcall")
      .select("user_id, platform, first_at")
      .eq("rooftop_id", rooftopId)
      .eq("kind", "signed_in")
      .in("user_id", userIds),
    /* Core tracks only, and NOT filtered on `active`: a track that was earned
       and later retired was still earned, and dropping the name would turn a
       credential into a silent nothing on the row. */
    client.from("certification").select("id, name, sort").eq("is_core", true),
  ]);

  const coreName = new Map<string, { name: string; sort: number }>();
  for (const c of (coreCerts ?? []) as { id: string; name: string; sort: number | null }[]) {
    coreName.set(c.id, { name: c.name, sort: Number(c.sort ?? 0) });
  }

  for (const e of (events ?? []) as {
    user_id: string;
    kind: string;
    meta: Record<string, unknown> | null;
  }[]) {
    switch (e.kind) {
      case "lesson_completed":
        change(e.user_id).lessons++;
        break;
      case "story_submitted":
        change(e.user_id).story = true;
        break;
      /*
       * THE TAPS ARE DELIBERATELY NOT FACTS ANY MORE. certs_opened,
       * track_opened, library_opened and lesson_opened each produced a line on
       * the old post that said somebody had browsed — true, and not movement.
       * They are still counted on the row for /admin/engagement; they are not
       * news. Named here rather than left to the default so a reader can see
       * the decision instead of wondering whether a kind was forgotten.
       */
      case "signed_in":
      case "certs_opened":
      case "track_opened":
      case "library_opened":
      case "lesson_opened":
        break;
      default:
        console.warn(`[rollcall] no change fact for app_event kind ${JSON.stringify(e.kind)}`);
    }
  }

  /* ---- The first-time events, each proved to be a first ---------------- */
  const windowCompletions = new Map<string, number>();
  for (const r of (completions ?? []) as { user_id: string }[]) {
    windowCompletions.set(r.user_id, (windowCompletions.get(r.user_id) ?? 0) + 1);
  }
  for (const row of rows) {
    const inWindow = windowCompletions.get(row.userId) ?? 0;
    /* `>=` rather than `===` because completionCount is counted from the same
       table one query earlier: a morning completed BETWEEN the two reads would
       make the window count the larger of the two, and that is still a first
       morning. */
    if (inWindow > 0 && inWindow >= row.completionCount) {
      change(row.userId).firstMorning = true;
    }
  }

  for (const r of (schedules ?? []) as { user_id: string }[]) {
    change(r.user_id).onboarded = true;
  }

  for (const r of (signIns ?? []) as {
    user_id: string;
    platform: string | null;
    first_at: string;
  }[]) {
    /* NATIVE ONLY, for the same reason the column is: a web session is a
       sign-in and is not an install. */
    if (r.platform !== "ios" && r.platform !== "android") continue;
    if (r.first_at > sinceIso) change(r.user_id).installedApp = true;
  }

  for (const r of (earned ?? []) as { user_id: string; certification_id: string }[]) {
    const cert = coreName.get(r.certification_id);
    /* A non-core certification is not what the post is measuring. Silently
       skipped rather than named, because the line is "toward EDIAGD Certified"
       and a service track in it would be a different claim. */
    if (!cert) continue;
    change(r.user_id).earned.push(cert.name);
  }
  for (const c of out.values()) {
    c.earned.sort((a, b) => {
      const sa = [...coreName.values()].find((v) => v.name === a)?.sort ?? 0;
      const sb = [...coreName.values()].find((v) => v.name === b)?.sort ?? 0;
      return sa - sb || a.localeCompare(b);
    });
  }

  /* Rows that had nothing are LEFT OUT rather than stored empty, so
     `hasMovement` and `changes.get(id)` agree with each other. */
  for (const [userId, c] of [...out]) if (!hasMovement(c)) out.delete(userId);

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
