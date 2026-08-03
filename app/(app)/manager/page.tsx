import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { TeamRoster } from "@/components/manager/TeamRoster";
import { BRAND } from "@/lib/brand";
import {
  firstName,
  formatPct,
  type FamilyAttach,
  type FamilyBenchmark,
} from "@/lib/advisor";
import {
  displayAdvisorName,
  rankRoster,
  summarizeAdvisor,
  teamPriorities,
  type AdvisorSummary,
} from "@/lib/manager";

/** Roles allowed on this screen. */
const MANAGER_ROLES = ["manager", "admin"] as const;

export default async function ManagerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // ---- Is the viewer a manager (or admin) anywhere? ------------------------
  const { data: viewerMembership } = await supabase
    .from("membership")
    .select("rooftop_id, role, app_user:user_id(full_name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", MANAGER_ROLES)
    .limit(1)
    .maybeSingle();

  if (!viewerMembership?.rooftop_id) {
    return <NotAManager />;
  }

  const rooftopId: string = viewerMembership.rooftop_id;
  // PostgREST types the embed as an array; it's a to-one join in practice.
  const viewerEmbed = viewerMembership.app_user as unknown;
  const viewerUser = (Array.isArray(viewerEmbed) ? viewerEmbed[0] : viewerEmbed) as
    | { full_name: string | null }
    | null
    | undefined;
  const managerName = viewerUser?.full_name ?? user.email ?? "there";

  // ---- Rooftop + current period -------------------------------------------
  const [{ data: rooftop }, { data: period }] = await Promise.all([
    supabase.from("rooftop").select("name").eq("id", rooftopId).maybeSingle(),
    supabase
      .from("perf_period")
      .select("id, label")
      .eq("rooftop_id", rooftopId)
      .order("ends_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!period?.id) {
    return <NoPeriod rooftopName={rooftop?.name ?? null} />;
  }

  const periodId: string = period.id;

  // ---- Team-wide performance rows -----------------------------------------
  // One query each, for the whole rooftop — RLS scopes these to the manager's
  // own store (views are security_invoker as of 0006).
  const [
    { data: totalsRows },
    { data: attachRows },
    { data: benchmarkRows },
    { data: advisorMemberships },
  ] = await Promise.all([
    supabase
      .from("advisor_period_totals")
      .select("advisor_op_id, total_ros, total_labor_sales")
      .eq("period_id", periodId)
      .eq("rooftop_id", rooftopId),
    supabase
      .from("advisor_family_attach")
      .select("advisor_op_id, family, fam_ros, advisor_ros, attach_rate_pct")
      .eq("period_id", periodId)
      .eq("rooftop_id", rooftopId),
    supabase
      .from("family_store_benchmark")
      .select("family, store_avg_pct, store_best_pct")
      .eq("period_id", periodId)
      .eq("rooftop_id", rooftopId),
    supabase
      .from("membership")
      .select("op_code_id, app_user:user_id(full_name)")
      .eq("rooftop_id", rooftopId)
      .eq("role", "advisor")
      .eq("active", true),
  ]);

  const benchmarks: FamilyBenchmark[] = (benchmarkRows ?? []).map((r) => ({
    family: r.family as string,
    storeAvgPct: r.store_avg_pct == null ? null : Number(r.store_avg_pct),
    storeBestPct: r.store_best_pct == null ? null : Number(r.store_best_pct),
  }));

  // op code -> name. Mostly empty today: managers can read team membership rows
  // but the app_user_self policy hides teammates' names, so the roster falls
  // back to "Advisor {op code}".
  const nameByOpCode = new Map<string, string | null>();
  for (const row of advisorMemberships ?? []) {
    if (!row.op_code_id) continue;
    const embed = row.app_user as unknown;
    const named = (Array.isArray(embed) ? embed[0] : embed) as
      | { full_name: string | null }
      | null
      | undefined;
    nameByOpCode.set(row.op_code_id as string, named?.full_name ?? null);
  }

  const attachByAdvisor = new Map<string, FamilyAttach[]>();
  for (const row of attachRows ?? []) {
    const opId = row.advisor_op_id as string;
    const list = attachByAdvisor.get(opId) ?? [];
    list.push({
      family: row.family as string,
      famRos: Number(row.fam_ros ?? 0),
      advisorRos: Number(row.advisor_ros ?? 0),
      attachRatePct: row.attach_rate_pct == null ? null : Number(row.attach_rate_pct),
    });
    attachByAdvisor.set(opId, list);
  }

  const summaries: AdvisorSummary[] = (totalsRows ?? []).map((row) => {
    const opId = row.advisor_op_id as string;
    return summarizeAdvisor({
      advisorOpId: opId,
      name: displayAdvisorName(nameByOpCode.get(opId), opId),
      totalRos: Number(row.total_ros ?? 0),
      totalLaborSales: Number(row.total_labor_sales ?? 0),
      attach: attachByAdvisor.get(opId) ?? [],
      benchmarks,
    });
  });

  const roster = rankRoster(summaries);
  const priorities = teamPriorities(summaries, benchmarks);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      {/* ---- Header ------------------------------------------------------ */}
      <header className="flex items-center gap-3">
        <img
          src="/brand/svg/ediagd-mark-primary-light.svg"
          alt=""
          className="h-10 w-auto"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold text-navy">
            {BRAND.greeting}, {firstName(managerName)}
          </p>
          <p className="truncate text-xs text-ink-soft">
            {rooftop?.name ?? "Your rooftop"}
            {period.label ? ` · ${period.label}` : ""}
          </p>
        </div>
        <span className="rounded-pill bg-teal-soft px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-navy">
          Manager
        </span>
      </header>

      {/* ---- Team coaching priorities ------------------------------------ */}
      <section className="mt-5 rounded-card bg-navy p-5 shadow-card">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
          Team coaching priorities
        </p>

        {priorities.length > 0 ? (
          <>
            <p className="mt-2 text-sm text-ice-dim">
              Where a group session pays off most this period.
            </p>
            <ul className="mt-4 space-y-3">
              {priorities.map((p) => (
                <li
                  key={p.family}
                  className="border-t border-white/15 pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="text-base font-extrabold text-white">{p.family}</p>
                  <p className="mt-0.5 text-sm text-ice-dim">
                    <span className="font-bold text-gold">
                      {p.pursueCount} of {p.eligibleCount}
                    </span>{" "}
                    {p.pursueCount === 1 ? "advisor has" : "advisors have"} room
                    here — the store averages {formatPct(p.storeAvgPct)}.
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ice-dim">
            No shared gaps this period — every advisor with enough volume is
            holding their own against the store average. Coach one-on-one from
            the roster below.
          </p>
        )}
      </section>

      {/* ---- Team roster -------------------------------------------------- */}
      <section className="mt-5">
        <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Your team
        </h2>
        {roster.length > 0 ? (
          <Card className="mt-2 px-4 py-1">
            <TeamRoster advisors={roster} />
          </Card>
        ) : (
          <Card className="mt-2 p-5">
            <p className="text-base font-extrabold text-navy">
              No advisor numbers yet
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Once this month&apos;s export lands, your team shows up here.
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}

/** Signed in, but not a manager or admin anywhere. */
function NotAManager() {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">
          This screen is for managers
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Your account isn&apos;t set up as a manager at a rooftop. If you coach a
          team, ask your admin to add the role — then this becomes your team view.
        </p>
      </Card>
    </main>
  );
}

function NoPeriod({ rooftopName }: { rooftopName: string | null }) {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">No period loaded yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {rooftopName ?? "This rooftop"} doesn&apos;t have a performance period
          yet. Your team view fills in as soon as the month&apos;s export is
          imported.
        </p>
      </Card>
    </main>
  );
}
