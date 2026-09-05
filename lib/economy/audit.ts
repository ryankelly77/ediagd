/* ============================================================================
   EDIAGD — reading the Sand Dollar economy end to end

   ---------------------------------------------------------------------------
   NOBODY COULD SEE THIS
   ---------------------------------------------------------------------------
   Sand Dollars are minted by the app, spent in the Swag Shack, and until now the
   only view of the whole economy was an advisor's own ledger page and whatever
   `npm run checkmap` printed on somebody's terminal. That is fine while the
   numbers are small and indefensible the first time a balance is questioned:
   "the check passed last week" is a memory, not an answer.

   ---------------------------------------------------------------------------
   DERIVED EVERY TIME, NEVER STORED
   ---------------------------------------------------------------------------
   Every figure here is computed from sand_dollar_entry on the request. The
   ledger is the only fact; a cached total would be a second number to reconcile
   and the one people would quote. 58 entries today, thousands at the far end —
   still one query and a reduce.

   ---------------------------------------------------------------------------
   READ AS A PLATFORM OWNER, AND ONLY AS ONE
   ---------------------------------------------------------------------------
   sand_dollar_entry's read policy is `is_platform_owner() or user_id = uid`. A
   rooftop admin opening this would get their OWN rows back and see a complete,
   confident, wrong economy. The page checks isPlatformOwner before calling in —
   RLS would not error, it would just quietly answer a smaller question.
   ============================================================================ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLedger, tablesToResolve, type LedgerEntry } from "./ledger-refs";

export type PersonTotal = {
  userId: string;
  name: string;
  amount: number;
};

export type BigDay = {
  userId: string;
  name: string;
  date: string;
  earned: number;
  entries: number;
};

export type OrphanRow = {
  id: string;
  name: string;
  amount: number;
  reason: string;
  refId: string | null;
};

export type RedemptionCheck = {
  redemptions: number;
  /** Redemptions with no matching debit in the ledger — swag given away free. */
  undebited: { id: string; name: string; price: number; createdAt: string }[];
  /** Debits pointing at a redemption row that no longer exists. */
  danglingDebits: number;
  spent: number;
};

export type EconomyAudit = {
  entries: number;
  /** Positive entries the app awarded for an event. Adjustments are not here. */
  earned: number;
  /** Negative entries somebody spent. Adjustments are not here either. */
  spent: number;
  /** Net of every adjustment, in either direction. Corrections, not economy. */
  adjustments: number;
  outstanding: number;
  /** earned − spent + adjustments − outstanding. Anything but 0 is broken. */
  drift: number;
  negativeBalances: PersonTotal[];
  topBalances: PersonTotal[];
  bigDays: BigDay[];
  orphans: OrphanRow[];
  unknownReasons: string[];
  redemptions: RedemptionCheck;
};

/** PostgREST caps a response at 1000 rows whatever .limit() says. */
async function allRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase.from(table).select(columns).range(off, off + 999);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export async function loadEconomyAudit(
  supabase: SupabaseClient
): Promise<EconomyAudit> {
  const entries = await allRows<LedgerEntry & { created_at: string }>(
    supabase,
    "sand_dollar_entry",
    "id, user_id, amount, reason, ref_id, created_at"
  );

  const people = await allRows<{ id: string; full_name: string | null }>(
    supabase,
    "app_user",
    "id, full_name"
  );
  const nameOf = new Map(people.map((p) => [p.id, p.full_name?.trim() || "—"]));
  const name = (id: string) => nameOf.get(id) ?? "(unknown user)";

  /* ---- The one identity that has to hold ---------------------------------
     Balance is a view over this same table, so these have to equal the sum of
     balances exactly. Computing both sides here rather than trusting the view
     is the point: if they ever disagree, the view is wrong or rows are being
     read under a policy that hides some.

     ADJUSTMENTS ARE COUNTED APART FROM BOTH, because they are corrections and
     not economy. Splitting them by sign is what a first reading does and it
     reads backwards the moment one is used: reversing a 2,500 test top-up
     wrote a −2,500 and two +500s, which by sign alone RAISED "minted" to 4,015
     and "spent" to 3,500 — both further from the truth than before the ledger
     was corrected. What the app has ever awarded for an event is 512. */
  let earned = 0;
  let spent = 0;
  let adjustments = 0;
  const balance = new Map<string, number>();
  for (const e of entries) {
    if (e.reason === "adjustment") adjustments += e.amount;
    else if (e.amount >= 0) earned += e.amount;
    else spent += -e.amount;
    balance.set(e.user_id, (balance.get(e.user_id) ?? 0) + e.amount);
  }
  const outstanding = [...balance.values()].reduce((a, b) => a + b, 0);

  const balances: PersonTotal[] = [...balance.entries()]
    .map(([userId, amount]) => ({ userId, name: name(userId), amount }))
    .sort((a, b) => b.amount - a.amount);

  /* ---- Biggest earning days ----------------------------------------------
     Grouped on the DATE, not the entry: a day is what the caps in Gamification
     Settings are written against, so a single row of 50 is unremarkable and a
     day totalling 900 is the thing to look at. Only earnings count — a spend
     landing on the same day would otherwise mask it. */
  const day = new Map<string, { userId: string; date: string; earned: number; entries: number }>();
  for (const e of entries) {
    /* Adjustments are excluded for the same reason they are counted apart
       above: no cap applies to a correction, so one landing here would be a
       big number the panel cannot say anything useful about. */
    if (e.amount <= 0 || e.reason === "adjustment") continue;
    const d = String(e.created_at).slice(0, 10);
    const k = `${e.user_id}|${d}`;
    const cur = day.get(k) ?? { userId: e.user_id, date: d, earned: 0, entries: 0 };
    cur.earned += e.amount;
    cur.entries += 1;
    day.set(k, cur);
  }
  const bigDays: BigDay[] = [...day.values()]
    .sort((a, b) => b.earned - a.earned)
    .slice(0, 10)
    .map((d) => ({ ...d, name: name(d.userId) }));

  /* ---- Entries whose evidence is gone ------------------------------------ */
  const ids: Record<string, Set<string>> = {};
  for (const table of tablesToResolve(entries)) {
    const rows = await allRows<{ id: string }>(supabase, table, "id");
    ids[table] = new Set(rows.map((r) => r.id));
  }
  const { orphans, unknownReasons } = auditLedger(entries, ids);

  /* ---- Swag: was everything taken out actually paid for? -----------------
     The redemption row and its debit are written by two statements in
     app/(app)/swag/actions.ts. The action rolls the redemption back if the
     debit fails, but a process dying between them would leave an order with no
     charge — free swag, and nothing else in the app would ever say so. */
  const redemptionRows = await allRows<{
    id: string;
    user_id: string;
    price_paid: number;
    created_at: string;
  }>(supabase, "swag_redemption", "id, user_id, price_paid, created_at");

  const debitedRefs = new Set(
    entries.filter((e) => e.reason === "swag_purchase" && e.ref_id).map((e) => e.ref_id as string)
  );
  const redemptionIds = new Set(redemptionRows.map((r) => r.id));

  const redemptions: RedemptionCheck = {
    redemptions: redemptionRows.length,
    undebited: redemptionRows
      .filter((r) => !debitedRefs.has(r.id))
      .map((r) => ({
        id: r.id,
        name: name(r.user_id),
        price: Number(r.price_paid ?? 0),
        createdAt: r.created_at,
      })),
    danglingDebits: [...debitedRefs].filter((ref) => !redemptionIds.has(ref)).length,
    spent: entries
      .filter((e) => e.reason === "swag_purchase")
      .reduce((sum, e) => sum + -e.amount, 0),
  };

  return {
    entries: entries.length,
    earned,
    spent,
    adjustments,
    outstanding,
    drift: earned - spent + adjustments - outstanding,
    /* A balance below zero means somebody spent Sand Dollars they did not have
       — the redemption race guard failing, or a debit written twice. */
    negativeBalances: balances.filter((b) => b.amount < 0),
    topBalances: balances.slice(0, 10),
    bigDays,
    orphans: orphans.map((o) => ({
      id: o.id,
      name: name(o.user_id),
      amount: o.amount,
      reason: o.reason,
      refId: o.ref_id,
    })),
    unknownReasons,
    redemptions,
  };
}
