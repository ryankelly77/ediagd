import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/access";
import { loadAdvisorDay } from "@/lib/advisor-data";
import {
  ackLabel,
  cueTierForRate,
  pickCoachingCueForBlock,
  pickLifestyleVideo,
  pickPitchVideo,
  pickTechnicianVideo,
  pickQuotesForDay,
} from "@/lib/daily";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureBlockForToday, loadBlockDays } from "@/lib/coaching-block";
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
   * THE LIFESTYLE FILM MOVES INTO WAVE A. It used to be drawn alongside the
   * cue and the pitch, AFTER the block, purely because they shared a
   * Promise.all. It depends on none of them — only on the date and the viewer
   * — and the quotes depend on IT, so pulling it forward is what lets the
   * quotes start a wave earlier. In practice it finishes at ~760ms and wave A
   * ends at ~900, so this buys nearer 140ms than a whole wave; see the note
   * above about where the time actually is.
   *
   * The rule it exists to serve is unchanged and still enforced by ordering:
   * the day's quotes have to know which artifact the film belongs to, so the
   * same idea is not served twice in one loop — Mitch saying "never lose
   * money" on step 4 and the words "never lose money" on step 1.
   */
  const [
    { data: existing },
    { data: swellRow },
    pushPref,
    alreadyRegistered,
    completionCount,
    scheduleContext,
    advisorDay,
    blockDays,
    { data: badgeRows },
    badgeRewards,
    { data: gameSettings },
    lifestyle,
    openStamp,
  ] = await Promise.all([
    supabase
      .from("daily_completion")
      .select("id")
      .eq("user_id", user.id)
      .eq("completion_date", today)
      .maybeSingle(),
    // Their Swell, so the "done for today" screen can show something real.
    supabase.from("swell").select("current_len").eq("user_id", user.id).maybeSingle(),
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
    loadBlockDays(supabase),
    // Badge display names, so the celebration can say "First Light earned!"
    // rather than "first_light". The catalog is public reference data.
    supabase.from("badge").select("key, name"),
    // What each badge pays — read from game_settings/the catalog, so the
    // celebration can never quote an amount the engine didn't grant.
    loadBadgeRewards(supabase),
    supabase
      .from("game_settings")
      .select("sand_daily_loop, video_complete_pct")
      .limit(1)
      .maybeSingle(),
    // Signed playback is minted per view — never cached across users, because
    // the token IS the authorisation.
    pickLifestyleVideo(supabase, today, user.id),
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
   * ---- WAVE B: the block, and the quotes ---------------------------------
   *
   * The block: Eddie's Pick chooses the FAMILY and the block locks it, so the
   * six stages of a pitch are six days of the same conversation rather than
   * six unrelated mornings. The service client is required — 0067 gives
   * coaching_block no user-facing insert policy on purpose, because an
   * advisor who could open their own block could choose their own easiest
   * family.
   *
   * The quotes: both together, because 253 of the 484 are eligible for either
   * slot and drawing them independently would eventually hand the same quote
   * to both on one day. pickQuotesForDay makes slot 2 yield to slot 3.
   */
  const service = createServiceClient();
  const [block, quotes] = await Promise.all([
    ensureBlockForToday(
      service,
      user.id,
      rooftopId,
      today,
      pick ? { family: pick.family, tier: cueTierForRate(pick.rate) } : null,
      blockDays,
      // No block is opened from a part-month. An open one keeps running.
      advisorDay?.fromPartialPeriod ?? false,
      // Nor from a day off. Opening the app on a Saturday must not start six
      // days of coaching — an open block still serves if they take the
      // voluntary rep.
      restDay === null
    ),
    pickQuotesForDay(supabase, today, lifestyle?.artifactId ?? null),
  ]);

  const focus = block
    ? {
        family: block.family,
        opCode: block.opCode,
        stage: block.stage,
        tier: block.tier,
      }
    : null;

  /*
   * ---- WAVE C: what needed the block, and what needed the quotes ---------
   */
  const [coaching, pitchVideo, { data: savedRows }] = await Promise.all([
    pickCoachingCueForBlock(supabase, today, focus),
    /*
     * Step 3. Null means the stage has not been filmed, and the step is left
     * OUT of the day rather than rendered as an empty player — see
     * pickPitchVideo.
     */
    pickPitchVideo(supabase, today, user.id, focus),
    /* Which of the day's quotes this advisor has already kept. ONE query for
       both, and it reads through the user's client so the policy in 0059 is
       what decides — a save is private and the service role would step
       straight over that. */
    (() => {
      const ids = [quotes.slot3?.id, quotes.slot2?.id].filter(Boolean) as string[];
      return ids.length
        ? supabase
            .from("saved_content")
            .select("content_id")
            .eq("user_id", user.id)
            .in("content_id", ids)
        : Promise.resolve({ data: [] as { content_id: string }[] });
    })(),
  ]);

  /*
   * Recorded, not inferred. `false` would be a lie on a day with no block —
   * nothing was looked up, so nothing was skipped. The count that matters is
   * "days where we wanted a pitch video for a real stage and had none", which
   * is what measures the unfilmed library.
   */
  const pitchVideoSkipped = focus?.opCode && focus.stage ? pitchVideo === null : null;
  const savedIds = new Set((savedRows ?? []).map((r) => r.content_id as string));

  const shapeQuote = (q: typeof quotes.slot3) =>
    q
      ? {
          id: q.id,
          title: q.title,
          body: q.body,
          voice: q.voice,
          nugget: q.coaching_nugget,
          saved: savedIds.has(q.id),
        }
      : null;

  // (badgeNames, badgeRewards, dailyLoopSand and videoThreshold are drawn in
  // wave A above — none of them depended on anything down here.)

  // ---- Admin demo -------------------------------------------------------
  // ?preview=1 walks the real daily loop with a canned outcome: nothing is
  // written, the "already done today" screen is skipped, and it can be run as
  // often as you like. Admins only — for anyone else the flag is ignored, so
  // it can never be used to fake a completion.
  const isPreview =
    params.preview === "1" && (await isAdminViewer(supabase, user.id));

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
      dailyLoopSand={dailyLoopSand}
      lifestyle={lifestyle}
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
      today={today}
      greetingName={firstName(appUser?.full_name ?? user.email ?? "there")}
      ackLabel={ackLabel(today)}
      quote={shapeQuote(quotes.slot3)}
      salesQuote={shapeQuote(quotes.slot2)}
      focus={
        block
          ? {
              // The BLOCK's family, not the pick's. They agree on day one and
              // can diverge afterwards, and the block is what the advisor has
              // actually been working — showing the pick would rename the
              // conversation underneath them mid-pitch.
              service: block.family,
              // Rate and benchmark still come from the live pick when it is the
              // same family; a locked block on a family the advisor has since
              // recovered on shows no numbers rather than stale ones.
              rate: pick && pick.family === block.family ? pick.rate : null,
              storeAvg: pick && pick.family === block.family ? pick.storeAvg : null,
              stage: block.stage,
              stageNumber: block.served + 1,
              stageCount: block.lengthDays,
            }
          : null
      }
      cue={
        coaching.cue
          ? {
              id: coaching.cue.id,
              title: coaching.cue.title,
              body: coaching.cue.body,
            }
          : null
      }
      cueMatch={coaching.matched}
      pitchVideo={pitchVideo}
      /*
       * THE DAY, SIGNED WHERE IT WAS ASSEMBLED.
       *
       * This page is the only thing that knows what it actually served, so it
       * says so once and signs it. The client carries the stamp back untouched
       * and completeDay writes what it verified — the ids stop being data the
       * request supplies and become a payload it cannot alter.
       *
       * The watch tickets are NOT minted here any more. A ticket minted at
       * render says when the page opened, which is a fact about the page and
       * almost nothing about the video; they are minted when a player is
       * actually opened. See lib/watch-ticket.ts.
       */
      dayStamp={mintDayStamp({
        u: user.id,
        d: today,
        b: block?.id ?? null,
        q1: quotes.slot3?.id ?? null,
        q2: quotes.slot2?.id ?? null,
        cue: coaching.cue?.id ?? null,
        vid: lifestyle?.contentId ?? null,
        pitch: pitchVideo?.contentId ?? null,
        skipped: pitchVideoSkipped,
        match: coaching.matched,
        tier: block?.tier ?? null,
      })}
      totalRos={advisorDay?.totalRos ?? 0}
      badgeNames={badgeNames}
      badgeRewards={badgeRewards}
    />
  );
}
