import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { BRAND } from "@/lib/brand";
import { MILESTONES } from "@/lib/gamification/streak";

export default async function StreakPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Both are RLS-readable by the owner (0012). Nothing is recomputed here —
  // the engine owns these numbers.
  const [{ data: swell }, { data: balanceRow }, { data: settings }] =
    await Promise.all([
      supabase.from("swell").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("sand_dollar_balance")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("game_settings").select("paddle_out_cap").limit(1).maybeSingle(),
    ]);

  const streak = Number(swell?.current_len ?? 0);
  const longest = Number(swell?.longest_len ?? 0);
  const paddleOut = Number(swell?.paddle_out_available ?? 0);
  const paddleOutCap = Number(settings?.paddle_out_cap ?? 5);
  const balance = Number(balanceRow?.balance ?? 0);

  const nextMilestone = MILESTONES.find((m) => m > streak) ?? null;
  const toGo = nextMilestone ? nextMilestone - streak : 0;

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Your Swell
      </h1>

      {streak > 0 ? (
        <section className="mt-3 rounded-card bg-navy p-6 text-center shadow-card">
          <p className="text-6xl" aria-hidden="true">
            🌅
          </p>
          <p className="mt-3 text-5xl font-extrabold tracking-tight text-white">
            Day {streak}
          </p>
          <p className="mt-1 text-sm font-bold text-ice-dim">
            {streak === 1 ? "The Swell begins" : "and still rolling"}
          </p>

          {nextMilestone && (
            <p className="mt-5 rounded-card bg-white/10 px-4 py-3 text-sm font-bold text-gold">
              {toGo} {toGo === 1 ? "day" : "days"} to your {nextMilestone}-Day Swell
            </p>
          )}
        </section>
      ) : (
        <section className="mt-3 rounded-card bg-navy p-6 text-center shadow-card">
          <p className="text-6xl" aria-hidden="true">
            🌅
          </p>
          <p className="mt-3 text-3xl font-extrabold text-white">
            Start your Swell today
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ice-dim">
            Three minutes is all it takes. Tomorrow you&apos;ll be on day two.
          </p>
          <Link
            href="/today"
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-gold p-3.5 text-base font-extrabold text-navy transition hover:brightness-95"
          >
            Start today&apos;s three minutes
          </Link>
        </section>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Longest Swell" value={longest > 0 ? `${longest} days` : "—"} />
        <Stat label="Sand Dollars" value={balance.toLocaleString()} accent />
      </div>

      <Card className="mt-3 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
          Paddle Back Out
        </p>
        <p className="mt-1 text-2xl font-extrabold text-navy">
          {paddleOut} of {paddleOutCap}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Miss a day and one of these keeps your Swell rolling — automatically.
          You earn one back each month.
        </p>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {Array.from({ length: paddleOutCap }, (_, i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-pill ${
                i < paddleOut ? "bg-teal" : "bg-line"
              }`}
            />
          ))}
        </div>
      </Card>

      <p
        className="mt-8 text-center text-3xl text-teal"
        style={{ fontFamily: "var(--font-script)" }}
      >
        {BRAND.signoff}
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-extrabold ${accent ? "text-gold" : "text-navy"}`}
      >
        {value}
      </p>
    </Card>
  );
}
