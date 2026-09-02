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
  pickQuotesForDay,
} from "@/lib/daily";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureBlockForToday, loadBlockDays } from "@/lib/coaching-block";
import { mintWatchTicket } from "@/lib/watch-ticket";
import { firstName } from "@/lib/advisor";
import { loadBadgeRewards } from "@/lib/badge-rewards";
import { DailyFlow } from "@/components/daily/DailyFlow";
import type { IsoDate } from "@/lib/gamification/streak";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
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

  const { data: todayRaw } = await supabase.rpc("rooftop_today", {
    _rooftop: rooftopId,
  });
  const today = (todayRaw as IsoDate | null) ?? new Date().toISOString().slice(0, 10);

  // ---- Already done today? The ritual can't be re-run or re-earned. -------
  // NOT a server redirect: completeDayAction writes Supabase session cookies,
  // and Next re-renders the current page on the server when a Server Action
  // sets a cookie. That re-render happens AFTER the completion row is written,
  // so redirecting here would fire mid-celebration and yank the payoff off the
  // screen. The client redirects instead, and only when it didn't just do the
  // ritual itself.
  const { data: existing } = await supabase
    .from("daily_completion")
    .select("id")
    .eq("user_id", user.id)
    .eq("completion_date", today)
    .maybeSingle();

  const alreadyCompleteOnLoad = Boolean(existing);

  // Their Swell, so the "done for today" screen can show something real.
  const { data: swellRow } = await supabase
    .from("swell")
    .select("current_len")
    .eq("user_id", user.id)
    .maybeSingle();
  const currentStreak = Number(swellRow?.current_len ?? 0);

  // ---- The day's focus ----------------------------------------------------
  const opCodeId = (membership.op_code_id as string | null) ?? null;
  const advisorDay = opCodeId
    ? await loadAdvisorDay(supabase, opCodeId, rooftopId)
    : null;

  const pick = advisorDay?.hasVolume ? advisorDay.pick : null;

  /*
   * ---- The block: one family, one op code, six stages ---------------------
   *
   * Eddie's Pick chooses the FAMILY and the block locks it, so the six stages
   * of a pitch are six days of the same conversation rather than six unrelated
   * mornings. A pick that changes mid-block does not steal the block — that is
   * what locking means, and it is why the picker asks the block what today's
   * focus is rather than asking the pick directly.
   *
   * The service client is required: 0067 gives coaching_block no user-facing
   * insert policy on purpose, because an advisor who could open their own block
   * could choose their own easiest family. See ensureBlockForToday.
   */
  const service = createServiceClient();
  const blockDays = await loadBlockDays(supabase);
  const block = await ensureBlockForToday(
    service,
    user.id,
    rooftopId,
    today,
    pick ? { family: pick.family, tier: cueTierForRate(pick.rate) } : null,
    blockDays,
    // No block is opened from a part-month. An open one keeps running.
    advisorDay?.fromPartialPeriod ?? false
  );

  const focus = block
    ? {
        family: block.family,
        opCode: block.opCode,
        stage: block.stage,
        tier: block.tier,
      }
    : null;

  // Both quotes together: 253 of the 484 are eligible for either slot, so
  // drawing them independently would eventually hand the same quote to both on
  // the same day. pickQuotesForDay makes slot 2 yield to slot 3 on a collision.
  /*
   * THE VIDEO IS PICKED FIRST, ON PURPOSE.
   *
   * These used to run together, and they cannot any more: the day's quotes have
   * to know which artifact the video belongs to so the same idea is not served
   * twice in one loop — Mitch saying "never lose money" on step 4 and the words
   * "never lose money" on step 1. The cue still runs in parallel; it has no such
   * relationship.
   */
  const [lifestyle, coaching, pitchVideo] = await Promise.all([
    // Signed playback is minted per view — never cached across users, because
    // the token IS the authorisation.
    pickLifestyleVideo(supabase, today, user.id),
    pickCoachingCueForBlock(supabase, today, focus),
    /*
     * Step 3. Null means the stage has not been filmed, and the step is left
     * OUT of the day rather than rendered as an empty player — see pickPitchVideo.
     * Returns null for everyone today: nothing is in 'Pitches by Op Code' yet.
     */
    pickPitchVideo(supabase, today, user.id, focus),
  ]);

  /*
   * Recorded, not inferred. `false` would be a lie on a day with no block —
   * nothing was looked up, so nothing was skipped. The count that matters is
   * "days where we wanted a pitch video for a real stage and had none", which
   * is what measures the unfilmed library.
   */
  const pitchVideoSkipped = focus?.opCode && focus.stage ? pitchVideo === null : null;
  const quotes = await pickQuotesForDay(supabase, today, lifestyle?.artifactId ?? null);

  // Which of the day's quotes this advisor has already kept. ONE query for
  // both, and it reads through the user's client so the policy in 0059 is what
  // decides — a save is private and the service role would step straight over
  // that.
  const quoteIds = [quotes.slot3?.id, quotes.slot2?.id].filter(Boolean) as string[];
  const { data: savedRows } = quoteIds.length
    ? await supabase
        .from("saved_content")
        .select("content_id")
        .eq("user_id", user.id)
        .in("content_id", quoteIds)
    : { data: [] };
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

  // Badge display names, so the celebration can say "First Light earned!"
  // rather than "first_light". The catalog is public reference data.
  const { data: badgeRows } = await supabase.from("badge").select("key, name");
  const badgeNames = Object.fromEntries(
    (badgeRows ?? []).map((b) => [b.key as string, b.name as string])
  );

  // What each badge pays — read from game_settings/the catalog, so the
  // celebration can never quote an amount the engine didn't grant.
  const badgeRewards = await loadBadgeRewards(supabase);

  // The daily-loop amount, itemised in the celebration so the total visibly
  // sums its parts. Read from settings — never hardcoded.
  const { data: gameSettings } = await supabase
    .from("game_settings")
    .select("sand_daily_loop, video_complete_pct")
    .limit(1)
    .maybeSingle();
  const dailyLoopSand = Number(gameSettings?.sand_daily_loop ?? 0);
  // The bar a watch has to clear. Same setting the library re-checks
  // server-side in completeLibraryItem, so the two surfaces cannot disagree.
  const videoThreshold = Number(gameSettings?.video_complete_pct ?? 90);

  // ---- Admin demo -------------------------------------------------------
  // ?preview=1 walks the real daily loop with a canned outcome: nothing is
  // written, the "already done today" screen is skipped, and it can be run as
  // often as you like. Admins only — for anyone else the flag is ignored, so
  // it can never be used to fake a completion.
  const { preview: previewParam } = await searchParams;
  const isPreview =
    previewParam === "1" && (await isAdminViewer(supabase, user.id));

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
      pitchVideoSkipped={pitchVideoSkipped}
      /*
       * Minted here, at the moment the step is actually served, and signed so
       * the round trip through the client cannot alter it. This is the only
       * trustworthy answer to "when did they first see this video", and the
       * server's plausibility check is worthless without it — an unsigned
       * timestamp could simply be moved backwards to widen the window.
       */
      pitchWatchTicket={mintWatchTicket(user.id, pitchVideo?.contentId ?? null)}
      lifestyleWatchTicket={mintWatchTicket(user.id, lifestyle?.contentId ?? null)}
      totalRos={advisorDay?.totalRos ?? 0}
      badgeNames={badgeNames}
      badgeRewards={badgeRewards}
    />
  );
}
