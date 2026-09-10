/* ============================================================================
   EDIAGD — Sand Dollar ledger display
   Client-safe. Turns the sand_reason enum into language a service advisor
   would actually use.

   The rule is NOT a blanket "show the note" — the note means something
   different depending on the reason, and treating them alike is how you end up
   printing "big_wave milestone" on someone's ledger:

     title      the note IS the plain-language name (a swag item, an admin's
                own wording for a correction). Show it; fall back to the label.
     detail     the note is context that belongs UNDER the title (how many
                Paddle Back Out days you now hold).
     badge-key  the note is an internal key ("first_light") to resolve.
     ignore     the note is internal bookkeeping; the label alone is clearer.
   ============================================================================ */

import { BADGES_BY_KEY } from "./badges";

type NoteRole = "title" | "detail" | "badge-key" | "ignore";

/**
 * Mirrors the sand_reason enum in 0011, plus paddle_out_purchase from 0019.
 * `strip` is the word the note repeats once the title already says it.
 */
const REASON_META: Record<
  string,
  { label: string; note: NoteRole; strip?: string }
> = {
  daily_loop: { label: "Daily training", note: "ignore" },

  // Milestone bonuses. Their note is "<badge_key> milestone" — internal, and
  // the Swell is the clearer thing to name for a streak reward anyway.
  swell_7: { label: "7-Day Swell", note: "ignore" },
  swell_30: { label: "30-Day Swell", note: "ignore" },
  swell_90: { label: "90-Day Swell", note: "ignore" },
  swell_365: { label: "365-Day Swell", note: "ignore" },

  badge: { label: "Badge earned", note: "badge-key" },
  certification: { label: "Certification", note: "title" },

  // The note is the item name — "Dad Cap & Trucker" beats a generic label.
  swag_purchase: { label: "Swag Shack", note: "title" },

  // This ledger mixes training, badges and swag, so the row has to say what
  // happened on its own: "Paddle Back Out day" alone doesn't read as a purchase.
  // The free monthly allowance never reaches this ledger at all.
  paddle_out_purchase: {
    label: "Purchased Paddle Back Out day",
    note: "detail",
    strip: "Purchased",
  },

  // Manual corrections ONLY, now that grace-day buys have their own reason.
  // The note is whoever made it saying why.
  adjustment: { label: "Adjustment", note: "title" },
};

export type LedgerEntry = {
  id: string;
  amount: number;
  reason: string;
  note: string | null;
  createdAt: string;
};

/** The row's headline: what happened, in plain language. */
export function entryLabel(entry: LedgerEntry): string {
  const note = entry.note?.trim() || null;
  const meta = REASON_META[entry.reason];

  // An unknown reason means a new enum value shipped without a label here.
  // The note is still better than raw snake_case.
  if (!meta) return note ?? "Sand Dollars";

  if (meta.note === "badge-key") {
    const badge = note ? BADGES_BY_KEY.get(note.split(/\s+/)[0]) : undefined;
    return badge ? `${badge.name} badge` : meta.label;
  }

  if (meta.note === "title" && note) return note;
  return meta.label;
}

/** Optional second line: context that doesn't belong in the headline. */
export function entryDetail(entry: LedgerEntry): string | null {
  const meta = REASON_META[entry.reason];
  if (!meta || meta.note !== "detail") return null;

  const note = entry.note?.trim();
  if (!note || note === meta.label) return null;

  // The note leads with the word the title now carries — drop it, keep the count.
  const strip = meta.strip;
  if (strip && note.toLowerCase().startsWith(strip.toLowerCase())) {
    const rest = note.slice(strip.length).replace(/^[\s—:-]+/, "").trim();
    return rest || null;
  }
  return note;
}

/** Rows per page. Long ledgers load more rather than rendering everything. */
export const LEDGER_PAGE_SIZE = 50;

/** 'Aug 5' / 'Aug 5, 2025' once it's a different year. */
export function formatEntryDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/* ---- Paddle Back Out history (0021) -------------------------------------- */

export type PaddleOutEntry = {
  id: string;
  delta: number;
  kind: string;
  note: string | null;
  createdAt: string;
};

/**
 * Plain language for each way the bank moves. Same principle as the Sand
 * Dollar ledger: an advisor should understand the line without knowing the
 * schema, and "monthly_grant" is not that.
 *
 * `strip` is the word the note repeats. One note serves two screens — the Sand
 * Dollar ledger titles the row "Paddle Back Out day", so its note has to carry
 * "Purchased (1 → 2)" to explain itself — and here that leading word is already
 * in the title, so it comes off and the count stays.
 */
const PADDLE_KIND: Record<string, { label: string; strip?: string }> = {
  // The day everyone starts with, granted when the account is created (0023).
  initial_credit: { label: "Initial credit" },
  purchased: { label: "Purchased", strip: "Purchased" },
  monthly_grant: { label: "Monthly allowance" },
  spent: { label: "Used to save your Swell" },
};

export function paddleEntryLabel(entry: PaddleOutEntry): string {
  return PADDLE_KIND[entry.kind]?.label ?? "Paddle Back Out";
}

/** Optional second line: the part of the note the title doesn't already say. */
export function paddleEntryDetail(entry: PaddleOutEntry): string | null {
  const note = entry.note?.trim();
  if (!note) return null;

  const meta = PADDLE_KIND[entry.kind];
  if (!meta) return note;
  if (note === meta.label) return null;

  const strip = meta.strip ?? meta.label;
  if (note.toLowerCase().startsWith(strip.toLowerCase())) {
    const rest = note.slice(strip.length).replace(/^[\s—:-]+/, "").trim();
    return rest || null;
  }
  return note;
}

/* ---------------------------------------------------------------------------
   WRITING A BALANCE DOWN: TWO FORMS, AND WHICH ONE DEPENDS ON THE DECISION
   ---------------------------------------------------------------------------
   The header carries two things on its right now — the balance and the streak
   — and has to hold both at every text size the app supports. The balance is
   the only one that can grow without bound, so it is the one with a character
   budget: three or four, whatever the number.

   Everywhere somebody decides how to SPEND — the card below, the Swag Shack,
   this ledger — keeps the exact figure with separators. "1.9K" is fine for a
   glance in the chrome and useless when you are working out whether you can
   afford a 2,000 hoodie.
--------------------------------------------------------------------------- */

/** Below this the number is short enough to print as it is. */
const K = 1000;

/**
 * Past this the decimal stops earning its place: "101.4K" is five characters
 * for a tenth of a percent, and the pill's whole job is to stay at four.
 */
const NO_DECIMAL_FROM = 100_000;

/**
 * The balance as the header pill shows it: at most four characters.
 *
 *     545     -> "545"      below a thousand, as written
 *     1000    -> "1K"       a bare .0 is noise, so it goes
 *     1300    -> "1.3K"
 *     1999    -> "1.9K"     floored, never 2K
 *     10100   -> "10.1K"
 *     100000  -> "100K"     no decimal up here
 *
 * IT ROUNDS DOWN, ALWAYS. A readout that overstates what is spendable sets
 * somebody up to be refused at the counter, and being told "you have 2K" by
 * the app you are spending in is worse than being told 1.9. Flooring also
 * makes the compact form safe to show beside a price: it can only understate.
 *
 * The arithmetic runs on the INTEGER, not on n/1000. Dividing first and
 * scaling back up lands a hair under the right tenth for values like 2,900 —
 * (2900/1000)*10 is 28.999999999999996, which floors to 28 and prints "2.8K".
 * Math.floor(n / 100) never leaves the integers.
 */
export function formatSandDollarsCompact(balance: number | null | undefined): string {
  const n = Number(balance ?? 0);
  if (!Number.isFinite(n)) return "0";

  /* Negative balances are not reachable through the ledger, but a minus sign
     is a better answer than a wrong one if one ever is. The plain branch
     handles them, which is also where everything below a thousand belongs. */
  if (n < K) return String(Math.floor(n));

  if (n >= NO_DECIMAL_FROM) return `${Math.floor(n / K)}K`;

  const tenths = Math.floor(n / 100); // 1999 -> 19
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return decimal === 0 ? `${whole}K` : `${whole}.${decimal}K`;
}

/**
 * The balance in full, with separators — for every screen where it is being
 * spent, compared or reconciled.
 *
 * Named rather than a bare .toLocaleString() at each call site, so "the exact
 * one" can be searched for, and so the two forms sit together in one file
 * where the distinction between them is written down.
 */
export function formatSandDollarsExact(balance: number | null | undefined): string {
  const n = Number(balance ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
