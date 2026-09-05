import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { IslandTimePanel } from "@/components/schedule/IslandTimePanel";
import {
  loadIslandBudgetContext,
  describeSchedule,
  type IslandTimeEntry,
} from "@/lib/work-schedule";
import { usageForYear, yearOf } from "@/lib/island-budget";
import type { IsoDate } from "@/lib/gamification/streak";

/* ============================================================================
   EDIAGD — Island Time, out of the drawer

   ---------------------------------------------------------------------------
   IT USED TO BE THE FOURTH CARD ON /profile
   ---------------------------------------------------------------------------
   Below the avatar, the Sand Dollar balance and the work-schedule editor, on a
   page an advisor opens to change their name. The one feature in the app that
   decides whether a fortnight away costs them a Swell was filed under account
   admin, and nothing in the tab bar or the More menu pointed at it. Booking
   time off is a thing advisors DO, not a setting they have — so it is its own
   screen, and /profile links to it.

   ---------------------------------------------------------------------------
   THE BUDGET IS THE HEADLINE, NOT THE FOOTNOTE
   ---------------------------------------------------------------------------
   Days inside a range do not count against the Swell, which until now meant an
   advisor could book every week they did not feel like turning up and hold a
   365-Day Swell without completing a day. The cap closes that, and the first
   thing the screen says is how much of it is left — a limit somebody discovers
   by being refused is a worse limit than one they can see.
   ============================================================================ */

export default async function IslandTimePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", user.id)
    .eq("active", true);

  /* The ROOFTOP's today, so "already started" and the year the budget is
     counted in are theirs rather than the server's. */
  let today: IsoDate = new Date().toISOString().slice(0, 10);
  const rooftopId = memberships?.[0]?.rooftop_id as string | undefined;
  if (rooftopId) {
    const { data: todayRaw } = await supabase.rpc("rooftop_today", {
      _rooftop: rooftopId,
    });
    if (todayRaw) today = todayRaw as IsoDate;
  }

  const budget = await loadIslandBudgetContext(supabase, user.id);
  const schedule = budget.schedule ?? null;
  const ranges = budget.islandTime ?? [];
  const year = yearOf(today);
  const usage = usageForYear(ranges, schedule, year, budget.cap);

  const { data: islandRows } = await supabase
    .from("island_time")
    .select("id, start_date, end_date, note")
    .eq("user_id", user.id)
    .order("start_date", { ascending: true })
    .limit(100);

  /* Only what is still ahead or running — a finished absence is history, and
     the budget line above already counts it. */
  const entries: IslandTimeEntry[] = ((islandRows ?? []) as {
    id: string;
    start_date: string;
    end_date: string;
    note: string | null;
  }[])
    .map((r) => ({ id: r.id, start: r.start_date, end: r.end_date, note: r.note }))
    .filter((e) => e.end >= today);

  const none = budget.cap === 0;

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Island Time
      </h1>

      {/* ---- What's left, first ---------------------------------------- */}
      <Card className="mt-3 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          {year}
        </p>
        {none ? (
          <p className="mt-1 text-base font-extrabold text-navy">
            Island Time isn&apos;t available at your store right now.
          </p>
        ) : (
          <>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="ediagd-numeral text-4xl font-extrabold text-navy">
                {usage.remaining}
              </span>
              <span className="text-sm font-bold text-ink-soft">
                of {usage.cap} days left
              </span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {usage.used === 0
                ? "You haven't booked any Island Time this year."
                : `You've used ${usage.used} of ${usage.cap} this year.`}{" "}
              Only days you were scheduled to work count — a{" "}
              {describeSchedule(schedule)} advisor spends nothing on a weekend
              inside a booked fortnight.
            </p>
            {usage.used > usage.cap && (
              /* Grandfathered ranges can start somebody over. The honest thing
                 is to say so rather than round the number down to the cap. */
              <p className="mt-2 text-sm font-bold text-clay">
                That&apos;s over the {usage.cap}-day limit — everything already
                booked stands, and nothing new can be added this year.
              </p>
            )}
          </>
        )}
      </Card>

      {/* ---- Book it --------------------------------------------------- */}
      <Card className="mt-3 p-5">
        <IslandTimePanel
          entries={entries}
          today={today}
          schedule={schedule}
          cap={budget.cap}
          booked={ranges}
        />
      </Card>

      <p className="mt-4 px-1 text-xs leading-relaxed text-ink-soft">
        Your work schedule decides which days count.{" "}
        <Link href="/profile" className="font-bold text-ocean underline">
          Change it on your account
        </Link>
        .
      </p>
    </main>
  );
}
