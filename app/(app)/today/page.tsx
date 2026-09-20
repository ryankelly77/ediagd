import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/access";
import { loadAdvisorDay } from "@/lib/advisor-data";
import { ackLabel, pickQuotesForDay, pickTechnicianVideo } from "@/lib/daily";
import { assembleMorning } from "@/lib/loop";
import { previewKindFrom, previewMorning } from "@/lib/loop-preview";
import { rooftopIsProvisioned } from "@/lib/entitlement";
import { RooftopNotReady } from "@/components/daily/RooftopNotReady";
import { createServiceClient } from "@/lib/supabase/service";
import {
  loadScheduleContext,
  nextScheduledDayLabel,
  restDayFor,
} from "@/lib/work-schedule";
import { mintDayStamp } from "@/lib/day-stamp";
import { firstName } from "@/lib/advisor";
import {
  hasLiveToken,
  loadPushPref,
  shouldOfferSoftAsk,
} from "@/lib/notifications/push-prefs";
import { loadBadgeRewards } from "@/lib/badge-rewards";
import { DailyFlow } from "@/components/daily/DailyFlow";
import { TechnicianDay } from "@/components/daily/TechnicianDay";
import { milestoneLine } from "@/lib/gamification/streak";
import type { IsoDate } from "@/lib/gamification/streak";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; opened_via?: string }>;
}) {
  /* Awaited once, at the top: the attribution param is read long before the
     preview flag is, and two awaits of the same promise is two chances to
     drift. */
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // ---- Membership decides the rooftop, and the rooftop decides "today" -----
  const { data: memberships } = await supabase
    .from("membership")
    .select("rooftop_id, role, op_code_id, app_user:user_id(full_name)")
    .eq("user_id", user.id)
    .eq("active", true);

  const membership =
    memberships?.find((m) => m.role === "advisor") ??
    memberships?.find((m) => m.role === "technician") ??
    memberships?.[0];

  if (!membership) redirect("/advisor");

  const rooftopId = membership.rooftop_id as string;

  /*
   * ---- IS THIS A TECHNICIAN'S DAY? ---------------------------------------
   *
   * TECHNICIAN-ONLY, not "has a technician membership". A mixed advisor +
   * technician account stays PURE ADVISOR: the advisor experience is the one
   * with a contract behind it — a streak, Sand Dollars, a coaching block — and
   * quietly downgrading somebody to the slimmer screen because they also turn a
   * wrench would take all of that away. Technician content stays reachable
   * through the library when the LMS lands.
   *
   * The `find` order above already prefers advisor; this only decides which
   * SCREEN renders, and it asks the stricter question.
   */
  const roles = new Set((memberships ?? []).map((m) => m.role as string));
  const technicianOnly = roles.has("technician") && !roles.has("advisor");

  /*
   * ---- IS THE ROOFTOP SWITCHED ON? ----------------------------------------
   *
   * BEFORE ANYTHING ELSE, because everything else is pointless without it. A
   * rooftop with no `advisor_base` row can read no published content at all —
   * content_entitled_read gates on it — so every slot comes back empty, the
   * gate fails closed, and the advisor works through a ritual that can never
   * complete and is told nothing.
   *
   * Ten of eleven Doggett rooftops are in that state today, and one of the four
   * advisor accounts is at one of them.
   *
   * THIS IS NOT THE SAME QUESTION AS "IS THE LIBRARY EMPTY". A provisioned
   * rooftop with nothing published is a content gap, and the loop's own empty
   * states already say so honestly. This is the account not being finished, and
   * it needs a different sentence and a different person to tell.
   */
  const entitlementClient = createServiceClient();
  const provisioned = await rooftopIsProvisioned(entitlementClient, rooftopId);
  if (!provisioned) {
    const { data: roof } = await supabase
      .from("rooftop")
      .select("name")
      .eq("id", rooftopId)
      .maybeSingle();
    const { data: me } = await supabase
      .from("app_user")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    return (
      <RooftopNotReady
        greetingName={firstName(me?.full_name ?? user.email ?? "there")}
        rooftopName={(roof?.name as string | null) ?? null}
      />
    );
  }

  const { data: todayRaw } = await supabase.rpc("rooftop_today", {
    _rooftop: rooftopId,
  });
  const today = (todayRaw as IsoDate | null) ?? new Date().toISOString().slice(0, 10);

  /*
   * ---- THE TECHNICIAN'S DAY, AND THEN NOTHING ELSE RUNS -------------------
   *
   * Returned here, before the advisor machinery, on purpose. Everything below
   * this line — Eddie's Pick, the coaching block, the cue pools, the day stamp
   * — is advisor apparatus that would either find nothing or, worse, OPEN A
   * COACHING BLOCK for somebody who will never be coached against it.
   * ensureBlockForToday writes rows.
   *
   * The quote is read through the user's own client, so RLS decides: 0091
   * widened `quote` to technicians and this is the read that proves it.
   */
  if (technicianOnly) {
    const [techQuotes, techVideo, techSettings, techUser] = await Promise.all([
      pickQuotesForDay(supabase, today, null),
      pickTechnicianVideo(supabase, today, user.id),
      supabase.from("game_settings").select("video_complete_pct").limit(1).maybeSingle(),
      supabase.from("app_user").select("full_name").eq("id", user.id).maybeSingle(),
    ]);

    const q = techQuotes.slot3 ?? techQuotes.slot2;
    return (
      <TechnicianDay
        greetingName={firstName(techUser.data?.full_name ?? user.email ?? "there")}
        quote={q ? { id: q.id, title: q.title, body: q.body, voice: q.voice } : null}
        video={techVideo}
        videoThreshold={Number(techSettings.data?.video_complete_pct ?? 90)}
      />
    );
  }

  /*
   * ==========================================================================
   * THREE WAVES, NOT THIRTEEN
   * ==========================================================================
   * This is the slowest screen in the app, and it used to reach its content
   * through thirteen steps taken one after another, each waiting on the one
   * before it for no reason but the order the lines were written in. Only
   * three of those dependencies are real. This restructures it around the
   * three that are.
   *
   * ---------------------------------------------------------------------------
   * READ THIS BEFORE CLAIMING IT MADE THE SCREEN FASTER — IT DIDN'T, YET
   * ---------------------------------------------------------------------------
   * Measured server-side, post-prefix, against the live database:
   *
   *     thirteen serial steps   1753 / 1784 / 1786 / 1911 / 1913 / 2090 ms
   *     three waves             1833 / 1980 ms
   *
   * The same. The await ordering was never what cost the time. Timing wave A's
   * members individually says why: eleven of the twelve land in 13-312ms and
   * are effectively free, and the wave costs exactly what its slowest member
   * costs — `loadAdvisorDay` at 849-1052ms. Behind it, `pickQuotesForDay` is
   * ~600ms and the cue and pitch film ~350ms. Three slow operations, not one
   * badly ordered list, and parallelising cheap queries around a slow one
   * cannot beat the slow one.
   *
   * It is kept because it is the honest shape of the dependencies and does no
   * harm — but the next person looking for time on this screen should go
   * straight at Eddie's Pick, the quote draw, and the Mux signing, and should
   * not expect anything from moving these awaits around again.
   *
   * WAVE A is everything that needs nothing but `user`, `today` and
   * `rooftopId`, which by this point are all in hand. Twelve calls that used
   * to be a dozen waits.
   *
   * WAVE B is the two things that needed wave A: the block (which needs the
   * pick, the block length and whether today is a rest day) and the quotes
   * (which need the lifestyle film's artifact, so the same idea is not served
   * twice in one loop — see below).
   *
   * WAVE C is what needs the block: the cue and the pitch film for its stage,
   * plus which of the day's quotes are already kept.
   *
   * WHAT IS *NOT* PARALLELISED, and must not be: the technician return above
   * still happens first, because everything down here is advisor apparatus
   * and ensureBlockForToday WRITES. And the ordering inside each wave is
   * still the ordering the data demands — the waves only remove the waits
   * that were never required.
   */

  // ---- Already done today? The ritual can't be re-run or re-earned. -------
  // NOT a server redirect: completeDayAction writes Supabase session cookies,
  // and Next re-renders the current page on the server when a Server Action
  // sets a cookie. That re-render happens AFTER the completion row is written,
  // so redirecting here would fire mid-celebration and yank the payoff off the
  // screen. The client redirects instead, and only when it didn't just do the
  // ritual itself.
  const opCodeId = (membership.op_code_id as string | null) ?? null;

  /*
   * THE FILM PICKS ALL MOVED INTO assembleMorning (wave B).
   *
   * Wave A used to draw the lifestyle film so the quote draw could exclude its
   * twin — one idea must not be served twice in one morning. That exclusion is
   * gone along with the reason for it: there is ONE quote now and it is on the
   * completion screen (ruling 6), and the mindset film and the quote are drawn
   * from two different pools with two independent cursors. They cannot collide
   * the way slot 2 and slot 3 could.
   */
  const [
    { data: existing },
    { data: swellRow },
    pushPref,
    alreadyRegistered,
    completionCount,
    scheduleContext,
    advisorDay,
    { data: badgeRows },
    { data: earnedBadges },
    badgeRewards,
    { data: gameSettings },
    openStamp,
  ] = await Promise.all([
    supabase
      .from("daily_completion")
      .select("id")
      .eq("user_id", user.id)
      .eq("completion_date", today)
      .maybeSingle(),
    /* Their Swell, so the "done for today" screen can show something real —
       and longest_len, which the milestone line needs to know when the only
       target left is their own record. */
    supabase
      .from("swell")
      .select("current_len, longest_len")
      .eq("user_id", user.id)
      .maybeSingle(),
    loadPushPref(supabase, user.id),
    hasLiveToken(supabase, user.id),
    supabase
      .from("daily_completion")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then((r: { count: number | null }) => r.count ?? 0),
    /* The same context the streak engine reads, through the same loader, so
       the screen and the maths can never disagree about whether today
       counted. The rooftop is what decides whether the STORE is shut — the
       closure calendar is per rooftop, and this is the same id rooftop_today()
       resolved the date from, so the card and the dates agree.

       NO SCHEDULE ON FILE MEANS SCHEDULED. countMissedWorkDays treats every
       day as a work day when there is no row, so this has to as well — a rest
       card shown to somebody whose absence the engine WILL count would be the
       app telling them their streak is safe and then breaking it. See
       restDayFor. */
    loadScheduleContext(supabase, user.id, rooftopId),
    opCodeId ? loadAdvisorDay(supabase, opCodeId, rooftopId) : Promise.resolve(null),
    // Badge display names, so the celebration can say "First Light earned!"
    // rather than "first_light". The catalog is public reference data.
    supabase.from("badge").select("key, name"),
    /* WHAT THEY ALREADY HOLD. The rest card's milestone sentence must not offer
       back a badge they won in August — see milestoneLine. The user's own
       client, so 0012's owner-readable policy decides. */
    supabase.from("user_badge").select("badge_key").eq("user_id", user.id),
    // What each badge pays — read from game_settings/the catalog, so the
    // celebration can never quote an amount the engine didn't grant.
    loadBadgeRewards(supabase),
    supabase
      .from("game_settings")
      .select("sand_daily_loop, video_complete_pct")
      .limit(1)
      .maybeSingle(),
    /*
     * ---- THE STREAK SAVER LANDED -----------------------------------------
     *
     * The push carries ?opened_via=..., which is the only thing that
     * separates "they opened the app at 7:04pm" from "they opened the app
     * because we asked them to". Stamped on the render the link caused, once,
     * before anything can navigate away. Idempotent in SQL and scoped to the
     * caller's own row, so a refresh or a double tap cannot inflate it.
     *
     * TWO TAGS, ONE PER KIND: the lunchtime nudge and the 16:50 last call are
     * different messages at different moments, and telling them apart is the
     * only way to learn which one actually moves people.
     *
     * In the wave because it gates nothing — it is a write nobody reads on
     * this render, and making the screen wait for it bought nothing.
     */
    (() => {
      const OPENED_VIA: Record<string, "streak_keeper" | "streak_last_call"> = {
        streak_saver: "streak_keeper",
        streak_last_call: "streak_last_call",
      };
      const kind = params.opened_via ? OPENED_VIA[params.opened_via] : undefined;
      return kind
        ? supabase.rpc("mark_push_opened", { _kind: kind })
        : Promise.resolve(null);
    })(),
  ]);
  void openStamp;

  const alreadyCompleteOnLoad = Boolean(existing);
  const currentStreak = Number(swellRow?.current_len ?? 0);
  const restDay = restDayFor(today, scheduleContext);

  /* THE SAME SENTENCE THE SWELL CARD SHOWS, from the same selector — the rest
     card must not tell somebody they are two days from a badge they already
     hold, which is the bug this closes. Decided on the server; the client
     receives finished copy and never the ledger. */
  const milestone = milestoneLine({
    streak: currentStreak,
    earnedKeys: (earnedBadges ?? []).map((b) => b.badge_key as string),
    longest: Number(swellRow?.longest_len ?? 0),
  });

  /*
   * ---- SHOULD WE ASK ABOUT NOTIFICATIONS? --------------------------------
   *
   * Decided on the server because the two-ask budget belongs to the person,
   * not the handset — see lib/notifications/push-prefs.ts. The card itself
   * adds the last condition, which only the client can answer: is this the
   * native shell. Skipped entirely for anybody who already has a live device.
   */
  const offerSoftAsk =
    !alreadyRegistered &&
    shouldOfferSoftAsk({
      completions: completionCount,
      streak: currentStreak,
      pref: pushPref,
    });

  /*
   * WHICH DAY THEIR SWELL PICKS UP ON, computed rather than assumed. The card
   * used to say "on Monday" to everybody — right for a Mon-Fri advisor
   * resting on a Saturday, wrong for a Tue-Sat advisor resting on Monday, who
   * would be told their Swell resumes on the day they are standing in.
   */
  const nextWorkDayLabel = restDay ? nextScheduledDayLabel(today, scheduleContext) : "";

  const badgeNames = Object.fromEntries(
    (badgeRows ?? []).map((b) => [b.key as string, b.name as string])
  );
  const dailyLoopSand = Number(gameSettings?.sand_daily_loop ?? 0);
  // The bar a watch has to clear. Same setting the library re-checks
  // server-side in completeLibraryItem, so the two surfaces cannot disagree.
  const videoThreshold = Number(gameSettings?.video_complete_pct ?? 90);

  const pick = advisorDay?.hasVolume ? advisorDay.pick : null;

  /*
   * ---- WAVE B: the morning ------------------------------------------------
   *
   * ONE CALL, BECAUSE THE THREE SLOTS ARE ONE DECISION. Which morning this is
   * — normal, two-slot, or track entry — is not knowable until the pitch shelf
   * and the track cursor have both been read, and every branch that used to
   * decide it separately is a branch that could disagree. assembleMorning runs
   * the three picks concurrently and returns the shape.
   *
   * BOTH CLIENTS, AND THE SPLIT IS THE SECURITY STORY. Content pools are read
   * through `supabase` — the advisor's own session — so 0010's entitlement RLS
   * decides what may be served. The assignment row, the pool cursors and the
   * track-entry record are read and written through the service client, because
   * an advisor who could choose those could choose their own easiest family and
   * skip the film that gates a track.
   */
  const service = createServiceClient();

  /*
   * ---- THE ADMIN WALKTHROUGH ---------------------------------------------
   *
   * Decided HERE, before the morning is assembled, because the preview changes
   * what gets assembled rather than only what gets shown. `?preview=` is
   * checked against isAdminViewer, so the flag is inert for everyone else and
   * can never be used to reach a morning somebody's own data did not produce.
   *
   * WHY THE PREVIEW NEEDED ITS OWN ASSEMBLER: the pitch slot derives from
   * `membership.op_code_id`, and an admin account has none — so the old
   * walkthrough served a two-slot morning every time and the one screen 3b
   * exists to show was unreachable. See lib/loop-preview.ts.
   */
  const previewKind = previewKindFrom(params.preview);
  const isPreview = previewKind !== null && (await isAdminViewer(supabase, user.id));

  const morning = isPreview
    ? await previewMorning(supabase, service, user.id, rooftopId, today, previewKind!)
    : await assembleMorning(supabase, service, user.id, rooftopId, today);

  /* What the walkthrough had to substitute, for the banner. Empty on a real
     morning, and empty on a preview that needed no substitution. */
  const previewNotes: string[] =
    isPreview && "notes" in morning ? (morning.notes as string[]) : [];

  /* Which of the day's quote this advisor has already kept. Read through the
     user's client so the private-save policy in 0059 is what decides — the
     service role would step straight over it. */
  const { data: savedRows } = morning.quote
    ? await supabase
        .from("saved_content")
        .select("content_id")
        .eq("user_id", user.id)
        .eq("content_id", morning.quote.id)
    : { data: [] as { content_id: string }[] };

  const savedIds = new Set((savedRows ?? []).map((r) => r.content_id as string));

  /*
   * The closing line. RULING 6: it renders AFTER the streak advances, it gates
   * nothing and it counts towards nothing. It is not in the day's gate and it
   * is not a slot.
   */
  const closingQuote = morning.quote
    ? {
        id: morning.quote.id,
        title: morning.quote.title,
        body: morning.quote.body,
        voice: morning.quote.voice,
        nugget: morning.quote.coaching_nugget,
        saved: savedIds.has(morning.quote.id),
      }
    : null;

  // (badgeNames, badgeRewards, dailyLoopSand and videoThreshold are drawn in
  // wave A above — none of them depended on anything down here.)

  // ---- Admin demo -------------------------------------------------------
  // The morning above was already assembled for the walkthrough; this is the
  // canned OUTCOME that goes with it. Nothing is written: previewResult
  // short-circuits completeDayAction, so no completion row, no consumption, no
  // pool cursor, no track entry, no badge, no Sand Dollars, and the streak is
  // untouched. It can be run as often as you like.
  let previewResult = null;
  if (isPreview) {
    // Real amounts, so the demo quotes what the engine would actually have
    // granted on a first day.
    const dailyLoop = dailyLoopSand;
    const firstLight = Number(badgeRewards["first_light"] ?? 0);

    previewResult = {
      alreadyComplete: false,
      date: today,
      streak: 1,
      longest: 1,
      paddleOutAvailable: 1,
      paddleOutSpent: 0,
      paddleOutGranted: 0,
      graceUsed: false,
      streakReset: false,
      sandEarned: dailyLoop + firstLight,
      badgeEarned: "first_light",
      newBalance: dailyLoop + firstLight,
      certificationsEarned: [],
      credential: null,
    };
  }

  const embed = membership.app_user as unknown;
  const appUser = (Array.isArray(embed) ? embed[0] : embed) as
    | { full_name: string | null }
    | null
    | undefined;

  return (
    <DailyFlow
      previewResult={previewResult}
      previewNotes={previewNotes}
      dailyLoopSand={dailyLoopSand}
      videoThreshold={videoThreshold}
      alreadyCompleteOnLoad={alreadyCompleteOnLoad}
      offerSoftAsk={offerSoftAsk}
      /*
       * A rest day opens as a card, not a ritual. The whole day is still
       * assembled above and handed down — the quote, the video, the stamp — so
       * "Take today's rep anyway" reveals it without a second round trip, and
       * the voluntary completion is byte-for-byte the one a Tuesday would have
       * written. The preview walkthrough is never a rest day: it exists to
       * demonstrate the loop.
       */
      restDay={isPreview ? null : restDay}
      nextWorkDayLabel={nextWorkDayLabel}
      currentStreak={currentStreak}
      milestoneText={milestone.text}
      today={today}
      greetingName={firstName(appUser?.full_name ?? user.email ?? "there")}
      ackLabel={ackLabel(today)}
      /* RULING 6 — the close, not a slot. Named `closingQuote` rather than
         `quote` so nothing reads it as step one ever again. */
      closingQuote={closingQuote}
      morningKind={morning.kind}
      mindset={morning.mindset}
      pitch={morning.pitch}
      item={morning.item}
      trackFilm={morning.track?.film ?? null}
      track={
        morning.track
          ? { name: morning.track.name, entering: morning.track.entering }
          : null
      }
      focus={
        morning.pitch
          ? {
              service: morning.pitch.family,
              /* Rate and benchmark come from the live pick only when it names
                 the SAME family the assignment locked; a cycle on a family the
                 advisor has since recovered on shows no numbers rather than
                 stale ones. */
              rate: pick && pick.family === morning.pitch.family ? pick.rate : null,
              storeAvg:
                pick && pick.family === morning.pitch.family ? pick.storeAvg : null,
              position: morning.pitch.position,
              total: morning.pitch.total,
            }
          : null
      }
      /*
       * THE DAY, SIGNED WHERE IT WAS ASSEMBLED.
       *
       * This page is the only thing that knows what it actually served, so it
       * says so once and signs it. The client carries the stamp back untouched
       * and completeDay writes what it verified — the ids stop being data the
       * request supplies and become a payload it cannot alter.
       *
       * The retired keys go down as null rather than being dropped: removing
       * them would shift every field left and an old stamp would parse as a
       * different day. See lib/day-stamp.ts.
       *
       * The CYCLE NUMBERS travel with the ids because the completion writes the
       * pool cursor, and it has to file the row under the pass the draw was
       * actually made from — recomputing it at completion could land it in a
       * pass that never served it.
       */
      dayStamp={mintDayStamp({
        u: user.id,
        d: today,
        b: null,
        q1: morning.quote?.id ?? null,
        q2: null,
        cue: null,
        vid: morning.mindset?.contentId ?? null,
        pitch: morning.pitch?.contentId ?? null,
        skipped: null,
        match: null,
        tier: null,
        kind: morning.kind,
        item: morning.item?.contentId ?? null,
        tfilm: morning.track?.film?.contentId ?? null,
        /* Only when this morning is the one that ENTERS the track. An ordinary
           morning mid-track must not re-stamp an entry. */
        trk: morning.track?.entering ? morning.track.certificationId : null,
        mcyc: morning.mindsetCycle,
        qcyc: morning.quoteCycle,
      })}
      badgeNames={badgeNames}
      badgeRewards={badgeRewards}
    />
  );
}
