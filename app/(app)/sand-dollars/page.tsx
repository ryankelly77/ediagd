import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
import {
  LEDGER_PAGE_SIZE,
  entryLabel,
  formatEntryDate,
  type LedgerEntry,
} from "@/lib/sand-dollars";

/**
 * The currency screen: what you have, what you've earned all time, and every
 * row behind both numbers.
 *
 * Paging is done through the URL (?show=100) rather than client state, so a
 * long ledger stays linkable and needs no JavaScript.
 */
export default async function SandDollarsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { show } = await searchParams;
  const limit = Math.min(
    Math.max(LEDGER_PAGE_SIZE, Number(show) || LEDGER_PAGE_SIZE),
    1000
  );

  const [{ data: balanceRow }, { data: earnedRow }, { data: rows, count }] =
    await Promise.all([
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
      // RLS scopes this to the owner (0012); newest first.
      supabase
        .from("sand_dollar_entry")
        .select("id, amount, reason, note, created_at", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

  const balance = Number(balanceRow?.balance ?? 0);
  const totalEarned = Number(earnedRow?.total_earned ?? 0);
  const total = count ?? 0;

  const entries: LedgerEntry[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    amount: Number(r.amount ?? 0),
    reason: r.reason as string,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      {/* ---- Hero: the two numbers ------------------------------------- */}
      <section className="ediagd-hero">
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">Sand Dollars</p>
          <p className="mt-2 flex items-center gap-3">
            <SandDollarIcon size={40} />
            <span className="ediagd-figure text-white">
              {balance.toLocaleString()}
            </span>
          </p>
          <p className="mt-3 text-sm text-ice-dim">
            <span className="ediagd-numeral font-extrabold text-white">
              {totalEarned.toLocaleString()}
            </span>{" "}
            earned all time
          </p>
        </div>
      </section>

      <Link
        href="/swag"
        className="mt-4 flex items-center gap-3 rounded-card border border-line bg-surface-card p-4 shadow-[var(--ediagd-shadow-card)] transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold text-navy">
            Spend your Sand Dollars
          </span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            The Swag Shack — earned, never bought
          </span>
        </span>
        <span aria-hidden="true" className="text-lg text-ink-soft">
          ›
        </span>
      </Link>

      {/* ---- The ledger -------------------------------------------------- */}
      <div className="mt-6 flex items-baseline justify-between gap-3 px-1">
        <h2 className="ediagd-eyebrow">History</h2>
        {total > 0 && (
          <span className="ediagd-numeral text-xs font-bold text-ink-soft">
            {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
          </span>
        )}
      </div>

      {entries.length > 0 ? (
        <>
          <Card className="mt-2 px-4">
            <ul className="divide-y divide-line">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <LedgerRow entry={entry} />
                </li>
              ))}
            </ul>
          </Card>

          {total > entries.length && (
            <Link
              href={`/sand-dollars?show=${limit + LEDGER_PAGE_SIZE}`}
              className="mt-4 flex w-full items-center justify-center rounded-xl border border-line bg-surface-card p-3.5 font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Show more ({(total - entries.length).toLocaleString()} left)
            </Link>
          )}
        </>
      ) : (
        <Card className="mt-2 p-6 text-center">
          <p className="text-base font-extrabold text-navy">
            No Sand Dollars yet
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Complete your first daily training to start earning.
          </p>
          <Link
            href="/today"
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-gold p-3.5 font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Start today&apos;s three minutes
          </Link>
        </Card>
      )}
    </main>
  );
}

/** One ledger row: what it was, when, and how much. */
function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const spend = entry.amount < 0;

  return (
    <div className="flex items-center gap-3 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-navy">
          {entryLabel(entry)}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {formatEntryDate(entry.createdAt)}
        </span>
      </span>

      <span
        className={`flex shrink-0 items-center gap-1.5 text-base font-extrabold ${
          spend ? "text-clay" : "text-palm"
        }`}
      >
        <SandDollarIcon size={16} tone={spend ? "sand" : "gold"} />
        <span className="ediagd-numeral">
          {spend ? "" : "+"}
          {entry.amount.toLocaleString()}
        </span>
      </span>
    </div>
  );
}
