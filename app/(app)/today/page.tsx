import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/access";
import { loadAdvisorDay } from "@/lib/advisor-data";
import { ackLabel, cueTierForRate, pickCoachingCue, pickLifestyleVideo, pickQuoteOfDay } from "@/lib/daily";
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
  const focusService = pick?.family ?? null;
  const cueTier = pick ? cueTierForRate(pick.rate) : null;

  const [quote, coaching, lifestyle] = await Promise.all([
    pickQuoteOfDay(supabase, today),
    pickCoachingCue(supabase, today, focusService, cueTier),
    // Signed playback is minted per view — never cached across users, because
    // the token IS the authorisation.
    pickLifestyleVideo(supabase, today, user.id),
  ]);

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
      quote={
        quote
          ? { id: quote.id, title: quote.title, body: quote.body }
          : null
      }
      focus={
        pick
          ? {
              service: pick.family,
              rate: pick.rate,
              storeAvg: pick.storeAvg,
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
      totalRos={advisorDay?.totalRos ?? 0}
      badgeNames={badgeNames}
      badgeRewards={badgeRewards}
    />
  );
}
