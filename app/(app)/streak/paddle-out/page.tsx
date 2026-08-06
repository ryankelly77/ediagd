import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { PaddleOutIcon } from "@/components/brand/PaddleOutIcon";
import {
  formatEntryDate,
  paddleEntryDetail,
  paddleEntryLabel,
  type PaddleOutEntry,
} from "@/lib/sand-dollars";

/**
 * Where your Paddle Back Out days came from and where they went.
 *
 * The counter on /streak is authoritative (0021) — this screen explains it
 * rather than recomputing it. When the two disagree, it says so instead of
 * quietly presenting an incomplete story: grants and spends from before 0021
 * were never recorded and can't be reconstructed.
 */
export default async function PaddleOutHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: swell }, { data: settings }, { data: rows }] = await Promise.all([
    supabase
      .from("swell")
      .select("paddle_out_available")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("game_settings").select("paddle_out_cap").limit(1).maybeSingle(),
    // RLS scopes this to the owner (0021); newest first.
    supabase
      .from("paddle_out_entry")
      .select("id, delta, kind, note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const held = Number(swell?.paddle_out_available ?? 0);
  const cap = Number(settings?.paddle_out_cap ?? 5);

  const entries: PaddleOutEntry[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    delta: Number(r.delta ?? 0),
    kind: r.kind as string,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  // The honest reconciliation: if the rows don't add up to the counter, the
  // missing movement predates the history table.
  const accounted = entries.reduce((sum, e) => sum + e.delta, 0);
  const unaccounted = held - accounted;

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <Link
        href="/streak"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span aria-hidden="true">⟵</span> Your Swell
      </Link>

      <h1 className="mt-3 text-2xl font-extrabold text-navy">
        Paddle Back Out history
      </h1>

      <Card className="mt-4 p-5">
        <p className="ediagd-eyebrow">In the bank now</p>
        <p className="mt-1 flex items-center gap-2">
          <PaddleOutIcon size={26} />
          <span className="ediagd-numeral text-2xl font-extrabold text-navy">
            {held} of {cap}
          </span>
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          You start with one and earn one back each month. Buy more with Sand
          Dollars, and one is spent automatically whenever a missed day would
          have ended your Swell.
        </p>
      </Card>

      <h2 className="ediagd-eyebrow mt-6 px-1">Every movement</h2>

      {entries.length > 0 ? (
        <Card className="mt-2 px-4">
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id}>
                <HistoryRow entry={entry} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="mt-2 p-6 text-center">
          <p className="text-base font-extrabold text-navy">Nothing logged yet</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Your monthly allowance and any days you buy will show up here.
          </p>
        </Card>
      )}

      {unaccounted !== 0 && (
        <p className="mt-3 px-1 text-xs leading-relaxed text-ink-soft">
          {unaccounted > 0 ? (
            <>
              Your bank was already at{" "}
              <span className="ediagd-numeral font-bold">{unaccounted}</span>{" "}
              when we started recording this history, so those days aren&apos;t
              itemised above.
            </>
          ) : (
            <>
              Some movement above predates your current bank. The number on your
              Swell card is always the one that counts.
            </>
          )}
        </p>
      )}
    </main>
  );
}

/** One movement: what it was, when, and which way the bank went. */
function HistoryRow({ entry }: { entry: PaddleOutEntry }) {
  const spend = entry.delta < 0;
  const detail = paddleEntryDetail(entry);

  return (
    <div className="flex items-center gap-3 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-navy">
          {paddleEntryLabel(entry)}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">
          {formatEntryDate(entry.createdAt)}
          {detail && <> · {detail}</>}
        </span>
      </span>

      <span
        className={`ediagd-numeral shrink-0 text-base font-extrabold ${
          spend ? "text-clay" : "text-palm"
        }`}
      >
        {spend ? "" : "+"}
        {entry.delta}
      </span>
    </div>
  );
}
