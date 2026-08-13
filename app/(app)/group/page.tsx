import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { loadGroupView } from "@/lib/group";
import { GroupSalesCard } from "@/components/group/GroupSalesCard";

/**
 * The group, on one month.
 *
 * WHO SEES THIS. Anyone whose scope covers more than one rooftop — a group
 * owner, a group manager, or a manager who runs two stores. Below that it is
 * not a group, it is /manager, and this redirects there rather than rendering a
 * one-row table that pretends otherwise.
 *
 * EVERY STORE ON THE SAME MONTH. A finished July beside a part-finished August
 * would rank stores by how recently their data arrived. So the month is chosen
 * once and a store with no data for it is shown as missing, not as zero.
 */
export default async function GroupPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { month } = await searchParams;
  const view = await loadGroupView(supabase, user.id, month ?? null);

  if (!view) {
    return (
      <main className="mx-auto max-w-app px-4 pb-12 pt-5">
        <h1 className="text-2xl font-extrabold text-navy">Your group</h1>
        <Card className="mt-4 p-6">
          <p className="text-sm text-ink-soft">
            No performance data has been loaded for your stores yet.
          </p>
        </Card>
      </main>
    );
  }

  // One store is not a group.
  if (view.stores.length <= 1) redirect("/manager");

  const money = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const best = view.stores[0]?.totalLaborSales ?? 1;

  const t = view.totals.trend;
  // Labor per RO on each side of the matched window — derived rather than
  // stored, because it is a ratio of two numbers we already have and storing it
  // would be a third place for it to disagree with itself.
  const perRo =
    t && t.currentRos > 0 && t.priorRos > 0
      ? {
          current: t.currentSales / t.currentRos,
          prior: t.priorSales / t.priorRos,
          diff: t.currentSales / t.currentRos - t.priorSales / t.priorRos,
        }
      : null;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <header>
        <h1 className="text-2xl font-extrabold leading-tight text-navy">
          {view.groupName}
        </h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          {`${view.totals.stores} stores · ${view.totals.advisors} advisors`}
        </p>
      </header>

      {/* ---- Month switcher ------------------------------------------------ */}
      {/* ediagd-pillrow hides the horizontal scrollbar: on this platform the
          track renders as a hairline under the pills that reads as a border
          nobody drew. */}
      <div className="ediagd-pillrow mt-4 flex gap-1.5 overflow-x-auto">
        {view.months.slice(0, 12).map((m) => {
          const active = m.startsOn === view.monthStart;
          return (
            <Link
              key={m.startsOn}
              href={`/group?month=${m.startsOn}`}
              scroll={false}
              className="shrink-0 rounded-pill border px-3 py-1.5 text-xs font-extrabold transition"
              style={
                active
                  ? {
                      background: "rgb(var(--ediagd-navy))",
                      color: "rgb(var(--ediagd-ice))",
                      borderColor: "rgb(var(--ediagd-navy))",
                    }
                  : {
                      background: "rgb(var(--ediagd-cream-card))",
                      color: "rgb(var(--ediagd-navy))",
                      borderColor: "rgb(var(--ediagd-line))",
                    }
              }
            >
              {m.label.replace(/\s*20\d\d$/, "")}
              {m.isPartial && " *"}
            </Link>
          );
        })}
      </div>

      {/* ---- The group's month, and the shape behind it -------------------- */}
      <GroupSalesCard
        eyebrow={`Group labor sales · ${view.monthLabel}${view.isPartial ? " (partial)" : ""}`}
        total={view.totals.laborSales}
        months={view.series}
        chip={t ? <TrendChip trend={t} money={money} /> : null}
        comparison={
          t && view.comparedToLabel ? (
            <p className="ediagd-numeral mt-1 text-xs text-ink-soft">
              {`${money(t.currentSales)} · ${money(t.priorSales)} over the same worked days in ${view.comparedToLabel}`}
            </p>
          ) : null
        }
        stats={
          <dl className="grid grid-cols-3 gap-4">
            <Stat
              label="ROs"
              value={Math.round(view.totals.ros).toLocaleString()}
              delta={
                t
                  ? {
                      direction:
                        Math.abs(t.rosDiff) <= 1
                          ? "flat"
                          : t.rosDiff > 0
                            ? "up"
                            : "down",
                      text:
                        Math.abs(t.rosDiff) <= 1
                          ? "level"
                          : Math.abs(Math.round(t.rosDiff)).toLocaleString(),
                    }
                  : null
              }
            />
            <Stat
              label="Labor / RO"
              value={view.totals.blendedElr ? money(view.totals.blendedElr) : "—"}
              delta={
                perRo
                  ? {
                      direction:
                        Math.abs(perRo.diff) <= 5
                          ? "flat"
                          : perRo.diff > 0
                            ? "up"
                            : "down",
                      text:
                        Math.abs(perRo.diff) <= 5
                          ? "level"
                          : money(Math.abs(perRo.diff)),
                    }
                  : null
              }
            />
            <Stat
              label="Stores"
              value={`${view.totals.reporting} of ${view.totals.stores}`}
            />
          </dl>
        }
      />

      {/* ---- Store by store -------------------------------------------------- */}
      <h2 className="ediagd-eyebrow mt-8 px-1">By store</h2>
      {view.comparedToLabel && (
        <p className="mt-1 px-1 text-xs leading-relaxed text-ink-soft">
          {`Movement compares each store's worked days so far against its own first days in ${view.comparedToLabel} — matched effort, not a part-month against a whole one.`}
        </p>
      )}
      <Card className="mt-2 px-4">
        <ul className="divide-y divide-line">
          {view.stores.map((s) => (
            <li key={s.rooftopId} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy">
                  {s.name}
                </span>
                <span className="ediagd-numeral shrink-0 text-sm font-extrabold text-navy">
                  {money(s.totalLaborSales)}
                </span>
              </div>
              {/* A bar rather than a rank number: this is a comparison of
                  size, and numbering stores 1–11 turns colleagues into a
                  leaderboard the brand deliberately avoids. */}
              <span className="mt-1.5 block h-1.5 w-full rounded-pill bg-line/60">
                <span
                  aria-hidden="true"
                  className="block h-full rounded-pill"
                  style={{
                    width: `${Math.max(2, (s.totalLaborSales / best) * 100)}%`,
                    background: "rgb(var(--ediagd-teal))",
                  }}
                />
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="ediagd-numeral text-xs text-ink-soft">
                  {s.totalRos > 0
                    ? `${Math.round(s.totalRos).toLocaleString()} ROs · ${s.advisors} ${
                        s.advisors === 1 ? "advisor" : "advisors"
                      }${s.laborPerRo ? ` · ${money(s.laborPerRo)}/RO` : ""}`
                    : "No data for this month"}
                </p>
                {s.trend && <TrendChip trend={s.trend} money={money} />}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {view.isPartial && (
        <p className="mt-4 px-1 text-xs leading-relaxed text-ink-soft">
          This month isn&apos;t finished. Every store is shown over the same
          days, so the comparison holds — but the totals will keep rising.
        </p>
      )}
      <style>{`
        .ediagd-pillrow { scrollbar-width: none; }
        .ediagd-pillrow::-webkit-scrollbar { display: none; }
      `}</style>
    </main>
  );
}

/**
 * Up is PALM, down is clay, level is ink. Never red.
 *
 * Up was gold in the first version, which collided with the status vocabulary
 * already on these screens: gold means "close" beside "on track" in palm and
 * "pursue" in clay. A store ahead of its own last month is on track, so it gets
 * the colour on-track already has — and gold stays reserved for celebration and
 * milestones, which is the whole point of reserving it.
 */
function TrendChip({
  trend,
  money,
}: {
  trend: NonNullable<import("@/lib/group").GroupStore["trend"]>;
  money: (n: number) => string;
}) {
  const tone =
    trend.direction === "up"
      ? { c: "rgb(var(--ediagd-palm))", t: 18, mark: "▲" }
      : trend.direction === "down"
        ? { c: "rgb(var(--ediagd-clay))", t: 14, mark: "▼" }
        : { c: "rgb(var(--ediagd-ink-soft))", t: 12, mark: "=" };

  const amount =
    trend.direction === "flat" ? "level" : money(Math.abs(trend.salesDiff));

  return (
    <span
      className="ediagd-numeral inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-extrabold"
      style={{
        background: `color-mix(in srgb, ${tone.c} ${tone.t}%, transparent)`,
        color: tone.c,
      }}
      title={`${trend.workedDays} worked days: ${money(trend.currentSales)} vs ${money(trend.priorSales)}${
        trend.priorExhausted ? " (prior period had fewer worked days; used in full)" : ""
      }`}
    >
      <span aria-hidden="true">{tone.mark}</span>
      {amount}
      {trend.priorExhausted && <span aria-hidden="true">*</span>}
    </span>
  );
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { direction: "up" | "flat" | "down"; text: string } | null;
}) {
  const tone =
    delta?.direction === "up"
      ? { c: "rgb(var(--ediagd-palm))", t: 18, mark: "▲" }
      : delta?.direction === "down"
        ? { c: "rgb(var(--ediagd-clay))", t: 14, mark: "▼" }
        : { c: "rgb(var(--ediagd-ink-soft))", t: 12, mark: "=" };

  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </dt>
      <dd className="ediagd-numeral mt-0.5 text-lg font-extrabold text-navy">
        {value}
      </dd>
      {delta && (
        <dd
          className="ediagd-numeral mt-1 inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10px] font-extrabold"
          style={{
            background: `color-mix(in srgb, ${tone.c} ${tone.t}%, transparent)`,
            color: tone.c,
          }}
        >
          <span aria-hidden="true">{tone.mark}</span>
          {delta.text}
        </dd>
      )}
    </div>
  );
}
