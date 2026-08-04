import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { Card } from "@/components/brand/Card";
import { TierBadge } from "@/components/brand/TierBadge";
import type { IsoDate } from "@/lib/gamification/streak";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Post-login landing --------------------------------------------------
  // An advisor starts their day in the ritual; once it's done they go straight
  // to their numbers. Other roles fall through to the page below.
  if (user) {
    const { data: advisorMembership } = await supabase
      .from("membership")
      .select("rooftop_id")
      .eq("user_id", user.id)
      .eq("role", "advisor")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (advisorMembership?.rooftop_id) {
      const { data: todayRaw } = await supabase.rpc("rooftop_today", {
        _rooftop: advisorMembership.rooftop_id as string,
      });
      const today =
        (todayRaw as IsoDate | null) ?? new Date().toISOString().slice(0, 10);

      const { data: done } = await supabase
        .from("daily_completion")
        .select("id")
        .eq("user_id", user.id)
        .eq("completion_date", today)
        .maybeSingle();

      redirect(done ? "/advisor" : "/today");
    }
  }

  const { data: memberships } = await supabase
    .from("membership")
    .select("role, rooftop:rooftop_id ( name, org:org_id ( name ) )");

  const { data: products } = await supabase
    .from("rooftop_product")
    .select("product");

  return (
    <main className="mx-auto max-w-app p-6 md:p-10 space-y-8">
{/* Branded header bar — mark + wordmark text */}
    <header className="rounded-card bg-navy px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <img
          src="/brand/svg/ediagd-mark-primary-dark.svg"
          alt="EDIAGD"
          className="h-18 w-auto"
        />
        <div className="flex flex-col">
          <span className="font-display text-2xl tracking-[0.22em] text-white">
            {BRAND.name}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal">
            {BRAND.tagline}
          </span>
        </div>
      </div>
      <span className="text-ice-dim text-sm">{user?.email}</span>
    </header>
      <section>
        <h2 className="font-display text-xl text-navy mb-3">Your access</h2>
        <div className="space-y-2">
          {memberships?.map((m, i) => (
            <Card key={i} className="p-4 flex items-center gap-3">
              <TierBadge tier="Elite" />
              <span className="font-bold text-navy capitalize">{m.role}</span>
              <span className="text-ink-soft">
                at {(m.rooftop as any)?.name} · {(m.rooftop as any)?.org?.name}
              </span>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-navy mb-3">
          Products your rooftop owns
        </h2>
        <div className="flex flex-wrap gap-2">
          {products?.map((p, i) => (
            <span
              key={i}
              className="rounded-pill bg-teal-soft px-4 py-1.5 text-sm font-bold text-navy"
            >
              {p.product}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
