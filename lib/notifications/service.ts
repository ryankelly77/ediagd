/* ============================================================================
   EDIAGD — the notification service layer
   SERVER ONLY (takes a Supabase client).

   Every read of a notification goes through here, and RLS does the scoping:
   0030 gives `notification` a single read policy — recipient_id = auth.uid() —
   so a caller cannot ask for anyone else's mail even by accident. There is no
   userId parameter anywhere in this file for exactly that reason.
   ============================================================================ */

import { CHANNELS } from "./channels";
import {
  sortForInbox,
  type ChannelPreference,
  type DeliveryResult,
  type Notification,
  type NotificationItem,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** One screenful. The inbox pages rather than scrolling forever. */
export const INBOX_PAGE_SIZE = 30;

const COLUMNS =
  "id, kind, severity, rooftop_id, title, body, payload, created_at, read_at";

function toNotification(r: Record<string, unknown>): Notification {
  const payload = (r.payload ?? {}) as { items?: NotificationItem[] };
  return {
    id: r.id as string,
    kind: r.kind as Notification["kind"],
    severity: r.severity as Notification["severity"],
    rooftopId: (r.rooftop_id as string | null) ?? null,
    title: (r.title as string) ?? "",
    body: (r.body as string) ?? "",
    items: Array.isArray(payload.items) ? payload.items : [],
    createdAt: r.created_at as string,
    readAt: (r.read_at as string | null) ?? null,
  };
}

/** The bell's number. Counted in Postgres — the rows never travel. */
export async function loadUnreadCount(client: Client): Promise<number> {
  const { count } = await client
    .from("notification")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return Number(count ?? 0);
}

/**
 * The inbox. Wins first, then info, then concerns — ordered in the database so
 * the ordering survives paging, which sorting in JS would not.
 */
export async function loadInbox(
  client: Client,
  limit: number = INBOX_PAGE_SIZE
): Promise<{ rows: Notification[]; total: number }> {
  const { data, count } = await client
    .from("notification")
    .select(COLUMNS, { count: "exact" })
    // 'win' < 'info' < 'concern' is the enum's declared order, so ascending is
    // already good-news-first. The enum was written that way on purpose.
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false })
    .range(0, limit - 1);

  const rows = sortForInbox(
    ((data ?? []) as Record<string, unknown>[]).map(toNotification)
  );
  return { rows, total: Number(count ?? rows.length) };
}

export async function loadChannelPreference(
  client: Client
): Promise<ChannelPreference> {
  const { data } = await client
    .from("notification_pref")
    .select("channel")
    .maybeSingle();
  return ((data?.channel as ChannelPreference | undefined) ?? "in_app");
}

/**
 * Push a recipient's undelivered notifications through every channel their
 * preference routes to.
 *
 * Today this is in-app only, so it does nothing visible — which is the point of
 * calling it anyway: the path is exercised now, and adding email later changes
 * one file rather than discovering the seam does not fit.
 */
export async function deliverPending(
  client: Client,
  preference: ChannelPreference
): Promise<DeliveryResult[]> {
  const { rows } = await loadInbox(client);
  const pending = rows.filter((n) => n.readAt == null);
  if (pending.length === 0) return [];

  const results: DeliveryResult[] = [];
  for (const channel of CHANNELS) {
    if (!channel.wants(preference)) continue;
    results.push(await channel.deliver("self", pending));
  }
  return results;
}
