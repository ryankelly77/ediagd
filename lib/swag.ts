/* ============================================================================
   EDIAGD — Swag Shack shared types
   Client-safe (a "use server" module may only export async functions, so these
   can't live in the actions file).
   ============================================================================ */

export type SwagItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number;
  /** Comma-separated sizes/colourways, or null when there's nothing to pick. */
  variants: string | null;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
};

export type RedemptionStatus = "requested" | "fulfilled" | "cancelled";

export type Redemption = {
  id: string;
  itemName: string;
  pricePaid: number;
  variant: string | null;
  shippingNote: string | null;
  status: RedemptionStatus;
  createdAt: string;
  fulfilledAt: string | null;
};

export type SwagResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export const STATUS_LABEL: Record<RedemptionStatus, string> = {
  requested: "On its way",
  fulfilled: "Sent",
  cancelled: "Cancelled",
};

/** Split the stored variant list into options. */
export function variantOptions(variants: string | null): string[] {
  if (!variants) return [];
  return variants
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Encouraging, never scolding — how far off they are. */
export function shortfallLabel(price: number, balance: number): string {
  const gap = price - balance;
  return `${gap.toLocaleString()} more to go`;
}
