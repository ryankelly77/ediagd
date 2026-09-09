import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
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

      {/* ---- What's left, first, and as the screen's one hero ------------
          DESIGN_LANGUAGE §3: the headline of a screen is a navy gradient
          surface with a faint sun/wave motif and one large confident number.
          This was two identical cream cards stacked on a mostly empty page —
          functional, and the doc's opening line is about exactly that. The
          budget is the headline here, so it gets the hero and the booking panel
          stays a quiet standard card. One hero per screen. */}
      <section className="ediagd-hero mt-3" data-intentional-bleed>
        <SunWaveMotif />

        <div className="relative">
          <p className="ediagd-eyebrow">{year}</p>
          {none ? (
            <p className="mt-2 text-base font-extrabold text-white">
              Island Time isn&apos;t available at your store right now.
            </p>
          ) : (
            <>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                <span className="ediagd-figure text-white">{usage.remaining}</span>
                <span className="text-sm font-bold text-ice-dim">
                  of {usage.cap} days left
                </span>
              </p>

              <DayMeter cap={usage.cap} used={usage.used} />

              <p className="mt-4 text-sm leading-relaxed text-ice-dim">
                {usage.used === 0
                  ? "You haven't booked any Island Time this year."
                  : `You've used ${usage.used} of ${usage.cap} this year.`}{" "}
                Only days you were scheduled to work count — a{" "}
                {describeSchedule(schedule)} advisor spends nothing on a weekend
                inside a booked fortnight.
              </p>
              {usage.used > usage.cap && (
                /* Grandfathered ranges can start somebody over. The honest thing
                   is to say so rather than round the number down to the cap.
                   Clay for attention per the palette, but as a tinted panel —
                   clay TEXT on midnight is too dark to read, and gold is spoken
                   for. */
                <p className="mt-3 rounded-card bg-clay/30 px-3 py-2 text-sm font-bold text-white">
                  That&apos;s over the {usage.cap}-day limit — everything already
                  booked stands, and nothing new can be added this year.
                </p>
              )}
            </>
          )}
        </div>
      </section>

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

/**
 * The year's allowance, one mark per day.
 *
 * The sentence above already says "11 of 15 days left", so this is decoration
 * in the strict sense — aria-hidden, and it tells a screen reader nothing the
 * words did not. What it buys a sighted advisor is the shape of the number: 4
 * spent out of 15 is a glance rather than a subtraction, and a budget you can
 * see going down is the point of showing it at all.
 *
 * Seafoam for what is left, and the marks deplete from the right. Not gold —
 * days off are not a win, and DESIGN_LANGUAGE §1 keeps gold for the Swell,
 * milestones and the one primary action, which on this screen is the button.
 */
function DayMeter({ cap, used }: { cap: number; used: number }) {
  const left = Math.max(0, cap - used);
  if (cap <= 0) return null;

  /*
   * Past a month's worth the segments are thinner than the gaps between them
   * and the row stops reading as a quantity. A single proportional bar says the
   * same thing at any cap, so the segmented version stays for the sizes it
   * actually suits. 15 is the setting today; this is for the day somebody sets
   * it to 60.
   */
  if (cap > 31) {
    return (
      <div className="mt-4" aria-hidden="true">
        <div className="h-2 w-full overflow-hidden rounded-pill bg-white/15">
          <div
            className="h-full rounded-pill bg-teal-soft"
            style={{ width: `${Math.max(2, Math.min(100, (left / cap) * 100))}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex gap-1" aria-hidden="true">
      {Array.from({ length: cap }, (_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 rounded-pill ${
            i < left ? "bg-teal-soft" : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}
