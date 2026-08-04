import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAdvisorDay } from "@/lib/advisor-data";
import { ackLabel, cueTierForRate, pickCoachingCue, pickQuoteOfDay } from "@/lib/daily";
import { firstName } from "@/lib/advisor";
import { DailyFlow } from "@/components/daily/DailyFlow";
import type { IsoDate } from "@/lib/gamification/streak";

export default async function TodayPage() {
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

  const [quote, coaching] = await Promise.all([
    pickQuoteOfDay(supabase, today),
    pickCoachingCue(supabase, today, focusService, cueTier),
  ]);

  // Badge display names, so the celebration can say "First Light earned!"
  // rather than "first_light". The catalog is public reference data.
  const { data: badgeRows } = await supabase.from("badge").select("key, name");
  const badgeNames = Object.fromEntries(
    (badgeRows ?? []).map((b) => [b.key as string, b.name as string])
  );

  const embed = membership.app_user as unknown;
  const appUser = (Array.isArray(embed) ? embed[0] : embed) as
    | { full_name: string | null }
    | null
    | undefined;

  return (
    <DailyFlow
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
    />
  );
}
