/* ============================================================================
   EDIAGD — Sand Dollar ledger display
   Client-safe. Turns the sand_reason enum into language a service advisor
   would actually use, and resolves badge entries to the badge they came from.
   ============================================================================ */

import { BADGES_BY_KEY } from "./badges";

/** Mirrors the sand_reason enum in 0011. */
export const REASON_LABEL: Record<string, string> = {
  daily_loop: "Daily training",
  swell_7: "7-Day Swell",
  swell_30: "30-Day Swell",
  swell_90: "90-Day Swell",
  swell_365: "365-Day Swell",
  badge: "Badge earned",
  certification: "Certification",
  swag_purchase: "Swag Shack",
  adjustment: "Adjustment",
};

export type LedgerEntry = {
  id: string;
  amount: number;
  reason: string;
  note: string | null;
  createdAt: string;
};

/**
 * What to show for an entry.
 *
 * The engine writes the badge key into `note` — "first_light" for First Light,
 * "<key> milestone" for the Swells — so a badge entry can name the badge it
 * came from rather than saying a generic "Badge earned".
 */
export function entryLabel(entry: LedgerEntry): string {
  const badgeKey = entry.note?.trim().split(/\s+/)[0];
  if (badgeKey) {
    const badge = BADGES_BY_KEY.get(badgeKey);
    if (badge) return `${badge.name} badge`;
  }
  return REASON_LABEL[entry.reason] ?? "Sand Dollars";
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
