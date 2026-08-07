import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { BRAND } from "@/lib/brand";
import { addDays, isoWeekday, type IsoDate } from "@/lib/gamification/streak";
import { SCHEDULE_COLUMNS } from "@/lib/work-schedule";
import { isAdminViewer } from "@/lib/access";

/**
 * First run.
 *
 * Deliberately OUTSIDE the (app) route group so it renders without the header
 * and tab bar — a blocking screen with a nav bar isn't blocking, and it lets
 * the guard in the (app) layout stay unconditional instead of special-casing
 * its own path.
 *
 * This file only gathers data; the six screens live in OnboardingFlow. Nothing
 * here writes: the schedule is saved by a server action on screen 5, so
 * abandoning the flow before then leaves no trace and they simply get the
 * welcome again next time.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ?preview=1 walks the whole flow without bouncing an onboarded user out and
  // without writing anything — so it can be run as often as you like. Admins
  // only: for anyone else the flag is simply ignored, so it can never be used
  // to sidestep the real thing.
  const { preview: previewParam } = await searchParams;
  const preview =
    previewParam === "1" && (await isAdminViewer(supabase, user.id));

  // Deliberately NOT a server-side redirect when a schedule already exists.
  // Every server action re-renders the route the caller is standing on, so the
  // moment screen 5 saved, this component would run again and redirect away
  // before the last screen could show. The flow captures this at mount and
  // ignores later re-renders — the same guard DailyFlow uses for the identical
  // problem with its completion action.
  const { data: existing } = await supabase
    .from("work_schedule")
    .select(SCHEDULE_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("app_user")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || null;

  // The headline breaks so GREAT starts line two and carries the brush stroke.
  // Derived from BRAND.tagline rather than retyped — that constant is the one
  // source of truth for GREAT-not-GOOD, and a copy here is a copy to forget.
  const taglineMatch = BRAND.tagline.match(/^(.*?)\b(great)\b(.*)$/i);
  const taglineLead = (taglineMatch?.[1] ?? "").trim();
  const taglineWord = taglineMatch?.[2] ?? BRAND.tagline;
  const taglineTail = (taglineMatch?.[3] ?? "").trim();

  // The rooftop's today, so "next Saturday" means theirs, not the server's.
  const { data: membership } = await supabase
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  let today: IsoDate = new Date().toISOString().slice(0, 10);
  if (membership?.rooftop_id) {
    const { data: todayRaw } = await supabase.rpc("rooftop_today", {
      _rooftop: membership.rooftop_id as string,
    });
    if (todayRaw) today = todayRaw as IsoDate;
  }

  // The cap is shown on the welcome gift screen; read from settings, no magic
  // numbers on the screen itself.
  const { data: settings } = await supabase
    .from("game_settings")
    .select("paddle_out_cap")
    .limit(1)
    .maybeSingle();
  const paddleOutCap = Number(settings?.paddle_out_cap ?? 5);

  let cursor: IsoDate = today;
  while (isoWeekday(cursor) !== 6) cursor = addDays(cursor, 1);
  const saturdays: IsoDate[] = [];
  for (let i = 0; i < 6; i++) {
    saturdays.push(cursor);
    cursor = addDays(cursor, 7);
  }

  return (
    <OnboardingFlow
      alreadyOnboarded={Boolean(existing)}
      preview={preview}
      firstName={firstName}
      saturdays={saturdays}
      today={today}
      taglineLead={taglineLead}
      taglineWord={taglineWord}
      taglineTail={taglineTail}
      paddleOutCap={paddleOutCap}
    />
  );
}
