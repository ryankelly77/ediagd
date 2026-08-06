/* ============================================================================
   EDIAGD — daily content selection (quote + coaching cue)
   SERVER ONLY (takes a Supabase client). Content reads go through the USER's
   client so the entitlement RLS in 0010 still applies — an advisor only ever
   sees published items their role × product unlocks.

   Selection is deterministic per day: the same advisor sees the same quote all
   day and something fresh tomorrow. No randomness, so a refresh can't reroll.
   ============================================================================ */

import type { ContentRow } from "@/lib/content";
import type { IsoDate } from "@/lib/gamification/streak";

type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** Day number within the year, 1-366, from a 'YYYY-MM-DD' string. */
export function dayOfYear(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  return Math.floor((Date.UTC(y, m - 1, d) - start) / 86_400_000) + 1;
}

/**
 * Rotate stably through a pool: same index all day, next one tomorrow.
 * Offset lets two different pools (quote vs cue) advance independently.
 */
function rotationIndex(date: IsoDate, count: number, offset = 0): number {
  if (count <= 0) return 0;
  return (dayOfYear(date) + offset) % count;
}

const CUE_COLUMNS =
  "id, type, service_family, subcategory, tier, make, model, year_range, title, body, video_url, duration_sec, status, source, created_at, updated_at";

/**
 * Applies the pool's filters to an already-`select()`ed query.
 * .from() alone returns a builder with no .eq()/.is() — the filter methods only
 * exist after .select(), so filters must be applied to the select, not before.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filters = (query: any) => any;

/**
 * Fetch one row from a filtered pool by rotation index, without pulling the
 * whole pool: count first, then a single-row offset query. Both queries build
 * from .select() so the same filters apply to each.
 */
async function pickByRotation(
  client: Client,
  filters: Filters,
  date: IsoDate,
  offset: number
): Promise<ContentRow | null> {
  const { count, error: countError } = await filters(
    client.from("content").select("id", { count: "exact", head: true })
  );
  if (countError || !count) return null;

  const index = rotationIndex(date, count, offset);
  const { data, error } = await filters(client.from("content").select(CUE_COLUMNS))
    .order("id", { ascending: true })
    .range(index, index);

  if (error || !data || data.length === 0) return null;
  return data[0] as ContentRow;
}

/**
 * The Quote of the Day: a published generic cue (no service attached).
 * 404 of these exist, so the pool cycles for over a year before repeating.
 */
export async function pickQuoteOfDay(
  client: Client,
  date: IsoDate
): Promise<ContentRow | null> {
  return pickByRotation(
    client,
    (q) =>
      q
        .eq("type", "cue")
        .eq("tier", "generic")
        .eq("status", "published")
        .is("service_family", null),
    date,
    0
  );
}

/**
 * The coaching cue for the day's focus service.
 *
 * Fallback chain, because coverage is uneven — 'Oil Change' and 'Alignment'
 * currently have NO published cues at all, so an advisor whose weakest service
 * is one of those must still get something useful:
 *   1. service + the advisor's tier for that service
 *   2. service, any tier
 *   3. a generic cue (same pool as the quote, different offset so they differ)
 */
export async function pickCoachingCue(
  client: Client,
  date: IsoDate,
  service: string | null,
  tier: "zero" | "low" | null
): Promise<{ cue: ContentRow | null; matched: "service+tier" | "service" | "generic" }> {
  if (service) {
    if (tier) {
      const exact = await pickByRotation(
        client,
        (q) =>
          q
            .eq("type", "cue")
            .eq("status", "published")
            .eq("service_family", service)
            .eq("tier", tier),
        date,
        1
      );
      if (exact) return { cue: exact, matched: "service+tier" };
    }

    const anyTier = await pickByRotation(
      client,
      (q) =>
        q.eq("type", "cue").eq("status", "published").eq("service_family", service),
      date,
      1
    );
    if (anyTier) return { cue: anyTier, matched: "service" };
  }

  // Offset 7 keeps the fallback cue from landing on the same row as the quote.
  const generic = await pickByRotation(
    client,
    (q) =>
      q
        .eq("type", "cue")
        .eq("tier", "generic")
        .eq("status", "published")
        .is("service_family", null),
    date,
    7
  );
  return { cue: generic, matched: "generic" };
}

/**
 * Which cue tier suits this advisor on this service.
 *
 * Content tiers are 'zero' | 'low' — read as how the advisor is performing on
 * THAT service, not their overall badge tier: selling none of it needs a
 * different conversation than selling a little.
 */
export function cueTierForRate(rate: number): "zero" | "low" {
  return rate <= 0 ? "zero" : "low";
}

/** Rotate the acknowledgement wording so the ritual doesn't feel canned. */
export const ACK_LABELS = [
  "Love it",
  "That resonates today",
  "I needed that",
] as const;

export function ackLabel(date: IsoDate): string {
  return ACK_LABELS[rotationIndex(date, ACK_LABELS.length, 0)];
}

/* ---- Bulk cue resolution (for the advisor screen) ------------------------ */

export type ServiceCue = { title: string; body: string | null };

/**
 * Resolve the coaching cue for MANY services at once, server-side.
 *
 * The per-service picker costs two round-trips each (a count, then a ranged
 * row). Calling it nine times from the client is what made the service dialog's
 * cue pop in late. This does the whole set in TWO queries:
 *
 *   1. ids only, for every candidate cue across all the services asked for
 *   2. the chosen rows' title/body
 *
 * Only SERVICE-SPECIFIC cues come back — never the generic fallback, because a
 * generic cue isn't a next step for a particular service.
 *
 * The rotation matches pickCoachingCue exactly (same offset, same id ordering),
 * so this screen and the daily ritual name the same cue on the same day.
 * Sorting the uuid text ascending equals Postgres's byte ordering, since
 * lowercase hex sorts the same as the bytes it encodes.
 */
export async function pickCuesForServices(
  client: Client,
  date: IsoDate,
  services: { family: string; tier: "zero" | "low" }[]
): Promise<Record<string, ServiceCue>> {
  const families = [...new Set(services.map((s) => s.family))];
  if (families.length === 0) return {};

  const { data: candidates, error } = await client
    .from("content")
    .select("id, service_family, tier")
    .eq("type", "cue")
    .eq("status", "published")
    .in("service_family", families);

  if (error || !candidates || candidates.length === 0) return {};

  const byFamily = new Map<string, { id: string; tier: string | null }[]>();
  for (const row of candidates as { id: string; service_family: string; tier: string | null }[]) {
    const list = byFamily.get(row.service_family) ?? [];
    list.push({ id: row.id, tier: row.tier });
    byFamily.set(row.service_family, list);
  }

  // Choose one id per service: preferred tier first, any tier otherwise.
  const chosen = new Map<string, string>();
  for (const { family, tier } of services) {
    const all = byFamily.get(family);
    if (!all || all.length === 0) continue;

    const pool = all.filter((c) => c.tier === tier);
    const from = pool.length > 0 ? pool : all;
    const ids = from.map((c) => c.id).sort();
    chosen.set(family, ids[rotationIndex(date, ids.length, 1)]);
  }

  if (chosen.size === 0) return {};

  const { data: rows } = await client
    .from("content")
    .select("id, title, body")
    .in("id", [...chosen.values()]);

  const byId = new Map(
    ((rows ?? []) as { id: string; title: string; body: string | null }[]).map(
      (r) => [r.id, r]
    )
  );

  const result: Record<string, ServiceCue> = {};
  for (const [family, id] of chosen) {
    const row = byId.get(id);
    if (row) result[family] = { title: row.title, body: row.body };
  }
  return result;
}
