import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card } from "@/components/brand/Card";
import { loadEconomyAudit } from "@/lib/economy/audit";

/* ============================================================================
   EDIAGD — the Sand Dollar economy, shown rather than asserted

   ---------------------------------------------------------------------------
   NOTHING ON THIS PAGE DOES ANYTHING
   ---------------------------------------------------------------------------
   No buttons, no forms, no actions file. Every repair to this ledger is an
   adjustment entry with a note saying what it replaced — Ryan's ruling, written
   down in scripts/checkmap.ts — and a "fix it" button here would quietly become
   a second way to change money that skips that. A screen that can only look is
   also a screen nobody has to be careful on.

   ---------------------------------------------------------------------------
   PLATFORM OWNER ONLY, AND NOT AS A FORMALITY
   ---------------------------------------------------------------------------
   sand_dollar_entry reads under `is_platform_owner() or user_id = uid`. A
   rooftop admin loading this would not get an error — they would get their own
   handful of rows rendered as the whole economy, totals and all. Same guard as
   the mapping screens, for a sharper reason: here the wrong answer looks exactly
   like the right one.

   ---------------------------------------------------------------------------
   THE ORDER IS THE ARGUMENT
   ---------------------------------------------------------------------------
   Reconciliation first, because it is the only figure that can be wrong in a way
   nothing else reveals. Then the two lists that answer "does anyone have more
   than they should". Balances and big days last: interesting, never alarming.
   ============================================================================ */

export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString();

export default async function AdminEconomyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const a = await loadEconomyAudit(supabase);

  const problems =
    a.orphans.length +
    a.unknownReasons.length +
    a.negativeBalances.length +
    a.redemptions.undebited.length +
    a.redemptions.danglingDebits +
    (a.drift === 0 ? 0 : 1);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Sand Dollar economy"
        subtitle={`${n(a.entries)} ledger entries · ${n(a.outstanding)} Sand Dollars outstanding`}
      />

      {/* ---- Does it add up ------------------------------------------------ */}
      <Card className="mt-4 p-4">
        <p className="text-base font-extrabold text-navy">
          {problems === 0 ? "Everything reconciles" : "Needs a look"}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Everything the app has awarded for an event, minus everything spent,
          plus every correction, should equal everything people are holding. All
          four are counted from the ledger itself, so a difference means the
          arithmetic broke somewhere and not that a total drifted.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Earned" value={n(a.earned)} />
          <Figure label="Spent" value={n(a.spent)} />
          <Figure
            label="Adjustments"
            value={`${a.adjustments >= 0 ? "+" : ""}${n(a.adjustments)}`}
          />
          <Figure label="Held by people" value={n(a.outstanding)} />
        </div>

        {/* Adjustments stand on their own rather than being split by sign into
            the other two. A reversal writes entries in both directions, so by
            sign alone undoing a mistake would ADD to both "earned" and "spent"
            — the ledger getting more honest while the headline got less so. */}
        <p
          className={`mt-3 text-sm font-bold ${
            a.drift === 0 ? "text-ink-soft" : "text-clay"
          }`}
        >
          {a.drift === 0
            ? `${n(a.earned)} − ${n(a.spent)} ${
                a.adjustments >= 0 ? "+" : "−"
              } ${n(Math.abs(a.adjustments))} = ${n(a.outstanding)}. It balances.`
            : `Off by ${n(a.drift)}. Earned, spent and corrected do not add up to what people hold.`}
        </p>
      </Card>

      {/* ---- The three things that should never happen --------------------- */}
      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Should be empty
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
          Sand Dollars are minted by events — a day finished, a lesson done, a
          badge earned — and every entry points at the event that earned it. An
          entry pointing at nothing is a balance nobody can account for.
        </p>

        <div className="mt-3 space-y-3">
          <Finding
            title="Entries whose source event is gone"
            count={a.orphans.length}
            clear="Every entry resolves to the thing that earned it."
          >
            <ul className="mt-2 space-y-1">
              {a.orphans.map((o) => (
                <li key={o.id} className="text-sm text-ink">
                  <span className="font-bold">{o.name}</span> · {o.reason} ·{" "}
                  {n(o.amount)} · ref {o.refId ?? "(none)"}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">
              The repair is an adjustment entry carrying the old reason and ref
              in its note — never a deleted row. A ledger that can be pruned when
              it embarrasses a check is not a ledger.
            </p>
          </Finding>

          <Finding
            title="Balances below zero"
            count={a.negativeBalances.length}
            clear="Nobody has spent more than they earned."
          >
            <ul className="mt-2 space-y-1">
              {a.negativeBalances.map((b) => (
                <li key={b.userId} className="text-sm text-ink">
                  <span className="font-bold">{b.name}</span> · {n(b.amount)}
                </li>
              ))}
            </ul>
          </Finding>

          <Finding
            title="Swag taken out and never charged for"
            count={a.redemptions.undebited.length + a.redemptions.danglingDebits}
            clear={
              a.redemptions.redemptions === 0
                ? "No redemptions yet — nothing to reconcile."
                : `All ${n(a.redemptions.redemptions)} redemptions have a matching debit.`
            }
          >
            <ul className="mt-2 space-y-1">
              {a.redemptions.undebited.map((r) => (
                <li key={r.id} className="text-sm text-ink">
                  <span className="font-bold">{r.name}</span> · {n(r.price)} not
                  charged · {r.createdAt.slice(0, 10)}
                </li>
              ))}
              {a.redemptions.danglingDebits > 0 && (
                <li className="text-sm text-ink">
                  {n(a.redemptions.danglingDebits)} debit(s) point at a
                  redemption row that no longer exists.
                </li>
              )}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">
              The order row and its debit are two separate writes. The action
              rolls the order back if the debit fails; a process dying between
              them would leave swag owed and nothing charged.
            </p>
          </Finding>

          <Finding
            title="Reasons this audit cannot resolve"
            count={a.unknownReasons.length}
            clear="Every reason in the ledger has a known source table."
          >
            <p className="mt-2 text-sm text-ink">
              {a.unknownReasons.join(", ")}
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              A new mint path shipped without saying where its evidence lives.
              Map it in lib/economy/ledger-refs.ts — until then these entries are
              neither checked nor counted as problems.
            </p>
          </Finding>
        </div>
      </section>

      {/* ---- Who holds what ------------------------------------------------ */}
      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Biggest balances
        </h2>
        <Card className="mt-2 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <tbody>
              {a.topBalances.map((b) => (
                <tr key={b.userId} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-ink">{b.name}</td>
                  <td className="px-4 py-2 text-right font-bold text-navy">
                    {n(b.amount)}
                  </td>
                </tr>
              ))}
              {a.topBalances.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-ink-soft">
                    Nobody holds any Sand Dollars yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ---- The days worth a second look ---------------------------------- */}
      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Biggest earning days
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
          One person, one day, everything they earned on it. The daily caps in
          Gamification Settings are written per day, so this is where a cap that
          is not being applied would show first.
        </p>
        <Card className="mt-2 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <tbody>
              {a.bigDays.map((d) => (
                <tr
                  key={`${d.userId}-${d.date}`}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-2 text-ink">{d.name}</td>
                  <td className="px-4 py-2 text-ink-soft">{d.date}</td>
                  <td className="px-4 py-2 text-ink-soft">
                    {d.entries} {d.entries === 1 ? "entry" : "entries"}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-navy">
                    {n(d.earned)}
                  </td>
                </tr>
              ))}
              {a.bigDays.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-ink-soft">
                    Nothing has been earned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </main>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream-card p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </p>
      <p className="mt-1 text-xl font-extrabold text-navy">{value}</p>
    </div>
  );
}

/**
 * A check, and what it found.
 *
 * THE CLEAR STATE IS SHOWN, not hidden. A page that renders nothing when all is
 * well is indistinguishable from a page that failed to load, and the whole
 * reason this screen exists is that "the check passed" was previously something
 * to be taken on trust.
 */
function Finding({
  title,
  count,
  clear,
  children,
}: {
  title: string;
  count: number;
  clear: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-4 ${count > 0 ? "border-clay" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-extrabold text-navy">{title}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            count > 0 ? "bg-clay text-white" : "border border-line text-ink-soft"
          }`}
        >
          {count > 0 ? count : "none"}
        </span>
      </div>
      {count > 0 ? (
        children
      ) : (
        <p className="mt-1 text-sm text-ink-soft">{clear}</p>
      )}
    </Card>
  );
}
