import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { BRAND } from "@/lib/brand";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { signOutAction } from "../more/actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }, { data: balanceRow }, { data: earnedRow }] =
    await Promise.all([
      supabase
        .from("app_user")
        .select("full_name, is_platform_owner")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("membership")
        .select("role, rooftop:rooftop_id(name)")
        .eq("user_id", user.id)
        .eq("active", true),
      supabase
        .from("sand_dollar_balance")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("sand_dollar_earned")
        .select("total_earned")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const displayName = profile?.full_name ?? user.email ?? "Your account";
  const initial = displayName.trim()[0]?.toUpperCase() ?? "?";
  const roles = [...new Set((memberships ?? []).map((m) => m.role as string))];
  const balance = Number(balanceRow?.balance ?? 0);
  const totalEarned = Number(earnedRow?.total_earned ?? 0);

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Your account
      </h1>

      <Card className="mt-3 p-5">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-teal text-xl font-extrabold text-white"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold text-navy">
              {displayName}
            </p>
            <p className="truncate text-sm text-ink-soft">{user.email}</p>
          </div>
        </div>

        {(roles.length > 0 || profile?.is_platform_owner) && (
          <p className="mt-4 flex flex-wrap gap-1.5">
            {profile?.is_platform_owner && (
              <span className="rounded-pill bg-gold-soft px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-navy">
                Platform owner
              </span>
            )}
            {roles.map((role) => (
              <span
                key={role}
                className="rounded-pill bg-teal-soft/50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-navy"
              >
                {role}
              </span>
            ))}
          </p>
        )}
      </Card>

      <Card className="mt-3 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          Sand Dollars
        </p>
        <p className="mt-1 flex items-center gap-2">
          <SandDollarIcon size={28} />
          <span className="ediagd-numeral text-3xl font-extrabold text-gold">
            {balance.toLocaleString()}
          </span>
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          <span className="ediagd-numeral font-bold">
            {totalEarned.toLocaleString()}
          </span>{" "}
          earned all time
        </p>
      </Card>

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-xl border border-line bg-surface-card p-3.5 font-extrabold text-clay transition hover:bg-clay/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Sign out
        </button>
      </form>

      <p
        className="mt-8 text-center text-3xl text-teal"
        style={{ fontFamily: "var(--font-script)" }}
      >
        {BRAND.signoff}
      </p>
    </main>
  );
}
