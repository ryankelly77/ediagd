import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  DemoBanner,
  Delta,
  NotEnoughHistory,
  ServiceHistory,
} from "@/components/admin/ImpactPieces";
import { RooftopRoiCard, SubscriptionForm } from "@/components/admin/RoiPieces";
import {
  MIN_MONTHS_FOR_MOVEMENT,
  loadRooftopAdvisors,
  loadRooftopImpact,
} from "@/lib/admin-impact";
import { revalidatePath } from "next/cache";

/**
 * One rooftop's impact, then one advisor's.
 *
 * The advisor rows open in place rather than navigating, because the thing
 * worth seeing — the month coaching started on a service and what happened
 * after — only makes sense next to the store's other advisors.
 *
 * Two queries: the rooftop headline, and every impact row for this store. That
 * second one is bounded by the store, not the network: eight advisors across
 * twelve service families over six months is 576 rows at the absolute worst.
 */
export default async function ImpactRooftopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Scoped by admin_rooftops() inside the view, so a rooftop outside this
  // admin's scope simply isn't there.
  const rooftop = await loadRooftopImpact(supabase, id);
  if (!rooftop) notFound();

  if (rooftop.monthCount < MIN_MONTHS_FOR_MOVEMENT) {
    return (
      <Shell name={rooftop.rooftopName}>
        {rooftop.isDemo && <DemoBanner allDemo />}
        <NotEnoughHistory
          monthsAvailable={rooftop.monthCount}
          scope="this rooftop"
        />
      </Shell>
    );
  }

  const { advisors, series } = await loadRooftopAdvisors(supabase, id);

  /**
   * Write the price through the definer function rather than an UPDATE on
   * `rooftop`: RLS is row-level, so a policy wide enough to permit this would
   * also permit renaming the store. The function checks admin rights itself, so
   * a direct POST gets the same refusal.
   */
  async function saveSubscription(formData: FormData) {
    "use server";
    const client = await createClient();
    const raw = String(formData.get("amount") ?? "").trim();
    const amount = raw === "" ? null : Number(raw);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      throw new Error("That price doesn't look right.");
    }

    const { error } = await client.rpc("set_rooftop_subscription", {
      _rooftop: id,
      _amount: amount,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/admin/impact/${id}`);
    revalidatePath("/admin/impact");
  }

  return (
    <Shell name={rooftop.rooftopName}>
      {rooftop.isDemo && <DemoBanner allDemo />}

      <Card className="ediagd-card-feature mt-4">
        <p className="ediagd-eyebrow">Coached vs uncoached</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <Delta value={rooftop.coachedDelta} size="lg" />
            <p className="mt-1 text-sm font-bold text-navy">Coached</p>
            <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
              {rooftop.coachedN.toLocaleString()} advisor-services
            </p>
          </div>
          <div>
            <Delta value={rooftop.uncoachedDelta} size="lg" />
            <p className="mt-1 text-sm font-bold text-navy">Not coached</p>
            <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
              {rooftop.uncoachedN.toLocaleString()} advisor-services
            </p>
          </div>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
          {rooftop.advisors.toLocaleString()}{" "}
          {rooftop.advisors === 1 ? "advisor" : "advisors"} with performance
          history, across {rooftop.monthCount.toLocaleString()} months. Both
          columns are the same people in the same months.
        </p>
      </Card>

      <RooftopRoiCard rooftop={rooftop} />
      <SubscriptionForm rooftop={rooftop} action={saveSubscription} />

      <h2 className="ediagd-eyebrow mt-8 px-1">Advisors</h2>
      <p className="mt-1 px-1 text-xs text-ink-soft">
        Tap to see which services moved, and when they were coached.
      </p>

      <Card className="mt-2 px-4">
        <ul className="divide-y divide-line">
          {advisors.map((a) => (
            <li key={a.userId}>
              <details className="group">
                <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-navy">
                      {a.advisorName}
                    </span>
                    <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
                      {a.coachedN} coached · {a.uncoachedN} not
                    </span>
                  </span>
                  <span className="w-14 shrink-0 text-right">
                    <Delta value={a.coachedDelta} />
                  </span>
                  <span className="w-14 shrink-0 text-right">
                    <Delta value={a.uncoachedDelta} />
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-lg leading-none text-ink-soft transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                </summary>
                <ServiceHistory points={series.get(a.userId) ?? []} />
              </details>
            </li>
          ))}
        </ul>
      </Card>

      {advisors.length === 0 && (
        <Card className="mt-2 p-6 text-center">
          <p className="text-base font-extrabold text-navy">
            No advisor histories yet
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Advisors appear here once their DMS operator id is linked to their
            account and two months have been imported.
          </p>
        </Card>
      )}

      <p className="mt-4 px-1 text-xs leading-relaxed text-ink-soft">
        Coached, then uncoached — each is the average month-over-month change in
        attach rate, in percentage points.
      </p>
    </Shell>
  );
}

function Shell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/impact", label: "Impact & ROI" }}
        title={name}
      />
      {children}
    </main>
  );
}
