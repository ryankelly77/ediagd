/* ============================================================================
   EDIAGD — notification types and the delivery seam

   IN-APP TODAY, EMAIL LATER, WITHOUT A REWRITE. Everything that generates a
   notification writes ONE row (0031 does it in SQL, nightly). Delivery is a
   separate concern layered on top: a channel takes a batch of rows for one
   recipient and gets them in front of that person. In-app is the degenerate
   case — the row existing IS the delivery — so it does nothing, which is
   exactly what makes it a fair test of the abstraction.

   Adding Resend or Postmark later is a new file implementing DeliveryChannel
   and one line in CHANNELS. No caller changes, no schema change: the
   email_sent_at column and the per-user channel preference already exist.
   ============================================================================ */

export type NotificationSeverity = "win" | "info" | "concern";

export type NotificationKind =
  | "swell_milestone"
  | "badge_earned"
  | "team_all_completed"
  | "coached_service_up"
  | "store_moved_up"
  | "swell_broken"
  | "advisor_quiet"
  | "team_quiet"
  | "attach_dropped"
  | "store_moved_down";

/** Who a rolled-up notification is about. */
export type NotificationItem = { name: string; detail: string };

export type Notification = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  rooftopId: string | null;
  title: string;
  body: string;
  items: NotificationItem[];
  createdAt: string;
  readAt: string | null;
};

/** Only in_app is implemented; the other two are stored preferences. */
export type ChannelPreference = "in_app" | "email" | "both";

export type DeliveryResult = {
  channel: string;
  delivered: number;
  skipped: number;
  /** Populated when a channel is declared but not yet implemented. */
  unavailable?: string;
};

export interface DeliveryChannel {
  readonly name: "in_app" | "email";
  /** Does this recipient's preference route to this channel? */
  wants(preference: ChannelPreference): boolean;
  deliver(recipientId: string, batch: Notification[]): Promise<DeliveryResult>;
}

/**
 * Wins first, then info, then concerns — and newest first inside each.
 *
 * This ordering is a brand rule, not a display preference. Per the brand book,
 * "celebrate up, never punish down": an inbox that opens on problems trains
 * people to dread it, so good news is structurally above bad news everywhere
 * it appears. The database sorts the same way; this is here so any list built
 * in TypeScript cannot quietly disagree.
 */
export const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  win: 0,
  info: 1,
  concern: 2,
};

export function sortForInbox(rows: Notification[]): Notification[] {
  return [...rows].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.createdAt.localeCompare(a.createdAt)
  );
}
