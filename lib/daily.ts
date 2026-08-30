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
import { playbackFor } from "@/lib/mux/playback";

type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** Day number within the year, 1-366, from a 'YYYY-MM-DD' string. */
export function dayOfYear(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  return Math.floor((Date.UTC(y, m - 1, d) - start) / 86_400_000) + 1;
}

/** Days since 1970-01-01. Counts straight through New Year — see below. */
export function epochDay(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Rotate stably through a pool: same index all day, next one tomorrow.
 * Offset lets two different pools (quote vs cue) advance independently.
 *
 * ---------------------------------------------------------------------------
 * THIS COUNTS EPOCH DAYS, NOT DAYS OF THE YEAR, AND THAT IS A BUG FIX
 * ---------------------------------------------------------------------------
 * It used dayOfYear(), which runs 1-366 and then RESETS. Any pool bigger than
 * 366 therefore had a tail nothing could ever reach: with the 404 generic cues,
 * indices 0 and 367-403 were unreachable — 38 cues, 9% of the pool, invisible
 * since the day they were imported. The comment above pickQuoteOfDay claimed
 * the pool "cycles for over a year before repeating"; it never cycled at all,
 * it restarted every January 1st and showed the same 366 in the same order.
 *
 * The new quote pools are 322 and 415, so slot 3 would have inherited exactly
 * the same dead tail. Epoch days increase forever, so `% count` genuinely walks
 * the whole pool and crossing New Year is not a special case.
 *
 * The visible cost is one-off: today's cue and today's video are not the ones
 * yesterday's arithmetic would have chosen. Tomorrow onwards it advances by one
 * as before.
 */
function rotationIndex(date: IsoDate, count: number, offset = 0): number {
  if (count <= 0) return 0;
  return (epochDay(date) + offset) % count;
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

/* ---------------------------------------------------------------------------
   QUOTES
   ---------------------------------------------------------------------------
   Two of the day's three slots are quotes. The third — the sales tip for the
   advisor's own op code — is the coaching cue below, not a quote.

     slot2  a quote that carries a SELLING lesson, shown with the focus cue
     slot3  a mindset / character / life quote, the first thing of the day

   A quote tagged 'both' is eligible for either draw.
--------------------------------------------------------------------------- */

export type QuoteSlot = "slot2" | "slot3";

export type QuoteRow = ContentRow & {
  voice: string | null;
  quote_slot: "slot2" | "slot3" | "both" | null;
  coaching_nugget: string | null;
  best_used_for: string | null;
  needs_translation: boolean;
};

const QUOTE_COLUMNS = `${CUE_COLUMNS}, voice, quote_slot, coaching_nugget, best_used_for, needs_translation, quote_key`;

/**
 * Order the pool so that NO TWO NEIGHBOURS SHARE A VOICE.
 *
 * ---------------------------------------------------------------------------
 * WHY AN ORDERING RATHER THAN "CHECK WHAT YESTERDAY WAS"
 * ---------------------------------------------------------------------------
 * The obvious way to get "not the same voice two days running" is to draw
 * today, look at yesterday's draw, and step forward on a clash. That does not
 * actually work, because yesterday's draw was itself adjusted — to know what an
 * advisor really saw yesterday you have to know what they saw the day before,
 * and so on backwards forever. Cutting the recursion off at one day gives a
 * rule that is right most of the time and quietly wrong the rest, which is the
 * worst of both.
 *
 * So the constraint moves into the ORDER instead of the draw. Lay the pool out
 * once so neighbours never share a voice, then take one per day. Consecutive
 * days are neighbours, so the property holds by construction, with no lookback,
 * no stored state, and no recursion. It also holds across the wrap from the
 * last entry back to the first.
 *
 * The method is the standard rearrangement greedy: repeatedly take the voice
 * with the most quotes left that is not the one just used. Mitch Hardt is
 * 161 of the 322 slot-2 quotes — EXACTLY half, the most a cyclic arrangement
 * can absorb — so slot 2 alternates Mitch, someone else, Mitch, someone else
 * all year. That is a property of the library, not of this function; it
 * resolves on its own as other voices are added.
 *
 * Deterministic: same pool in, same order out, on every server and every
 * request. Ties break on the id, never on iteration order.
 */
function voiceDiverseOrder(rows: { id: string; voice: string | null }[]): string[] {
  const byVoice = new Map<string, string[]>();
  for (const r of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const v = r.voice ?? "";
    if (!byVoice.has(v)) byVoice.set(v, []);
    byVoice.get(v)!.push(r.id);
  }

  const out: string[] = [];
  let previous: string | null = null;

  while (out.length < rows.length) {
    const pick = [...byVoice.entries()]
      .filter(([v, ids]) => ids.length > 0 && v !== previous)
      // Most remaining first, so no voice is left stranded at the end with
      // nothing to separate its copies. Voice name breaks the tie so the
      // result does not depend on Map insertion order.
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];

    // Only reachable when one voice owns MORE than half the pool: everything
    // left is that voice. Placing it back-to-back is then unavoidable, and
    // silently dropping it would be worse than repeating it.
    const [voice, ids] = pick ?? [...byVoice.entries()].find(([, i]) => i.length > 0)!;

    out.push(ids.shift()!);
    previous = voice;
  }
  return out;
}

/**
 * The quote for one of the day's two quote slots.
 *
 * Two queries and no full-row scan: the pool's (id, voice) pairs, which is what
 * the ordering needs, then the single chosen row. Both pools are well under the
 * 1,000-row PostgREST cap (322 and 415) and both are explicitly ORDERED, so the
 * page is stable rather than whatever the planner felt like returning.
 */
export async function pickQuoteForSlot(
  client: Client,
  date: IsoDate,
  slot: QuoteSlot,
  /**
   * An id the other slot has already taken today.
   *
   * 253 of the 484 quotes are tagged 'both', so the two pools OVERLAP and each
   * one drawing independently will eventually hand the same quote to both slots
   * on the same day. Staggering the two rotations with different offsets does
   * not fix that — the pools are different sizes, so the offset only delays the
   * collision instead of preventing it. Excluding the id outright does prevent
   * it, and costs one step of the rotation on the days it fires.
   */
  exclude?: string | null
): Promise<QuoteRow | null> {
  const { data: pool, error } = await client
    .from("content")
    .select("id, voice")
    .eq("type", "quote")
    .eq("status", "published")
    .in("quote_slot", [slot, "both"])
    .order("id", { ascending: true })
    .limit(1000);

  if (error || !pool || pool.length === 0) return null;

  const order = voiceDiverseOrder(pool as { id: string; voice: string | null }[]);
  let index = rotationIndex(date, order.length, 0);
  if (exclude && order[index] === exclude) index = (index + 1) % order.length;

  const { data } = await client
    .from("content")
    .select(QUOTE_COLUMNS)
    .eq("id", order[index])
    .limit(1);
  return (data?.[0] as QuoteRow) ?? null;
}

/**
 * Both of the day's quotes, drawn so they can never be the same quote.
 *
 * Slot 3 goes first because it is the one the advisor meets first, on step 1;
 * slot 2 yields to it on the rare day they collide.
 */
export async function pickQuotesForDay(
  client: Client,
  date: IsoDate
): Promise<{ slot2: QuoteRow | null; slot3: QuoteRow | null }> {
  const slot3 = await pickQuoteForSlot(client, date, "slot3");
  const slot2 = await pickQuoteForSlot(client, date, "slot2", slot3?.id ?? null);
  return { slot2, slot3 };
}

/**
 * The life quote that opens the day. Slot 3.
 *
 * WHAT THIS USED TO RETURN: a generic CUE — `type='cue' AND tier='generic' AND
 * service_family IS NULL`, 404 rows of full coaching passages. There was no
 * quote pool to draw from, so step 1 borrowed the cue pool and rendered a
 * 600-character lesson as a pull quote. Those 404 rows are untouched and still
 * back the generic fallback in pickCoachingCue below; they are simply no longer
 * pretending to be quotes.
 */
export async function pickQuoteOfDay(
  client: Client,
  date: IsoDate
): Promise<QuoteRow | null> {
  return pickQuoteForSlot(client, date, "slot3");
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

export type ServiceCue = { id: string; title: string; body: string | null };

/** How many cues one service offers up. Fluids alone has 292 published — this
 *  is a readable preview of the library, not the whole shelf. */
export const CUES_PER_SERVICE = 8;

/** PostgREST caps every response at 1000 rows, regardless of .limit(). */
const PAGE_SIZE = 1000;

/**
 * How many ids to put in one `.in(...)` filter. PostgREST takes these in the
 * QUERY STRING, so the real limit is URL length, not row count: 200 uuids is
 * fine, 400 already fails. Worse, it fails as a network error rather than a
 * PostgREST error, so an over-long list would come back empty and every service
 * would quietly claim it has no cues. Ten services × 8 cues is 80 ids today —
 * this keeps it safe if either number grows.
 */
const ID_BATCH = 100;

/**
 * Every published cue id for these services, paged past the 1000-row cap.
 *
 * This has to be exhaustive, not merely large: the rotation indexes into the
 * pool, so a truncated pool would silently start naming a different cue than
 * the daily ritual does. There are 841 today across the eight covered services
 * — comfortably one page, but the CMS lets admins add more, and crossing 1000
 * would have broken the match invisibly.
 */
async function fetchCueIds(
  client: Client,
  families: string[]
): Promise<{ id: string; service_family: string; tier: string | null }[]> {
  const rows: { id: string; service_family: string; tier: string | null }[] = [];

  // Bounded so a misbehaving backend can't spin: 20 pages is 20,000 cues.
  for (let page = 0; page < 20; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from("content")
      .select("id, service_family, tier")
      .eq("type", "cue")
      .eq("status", "published")
      .in("service_family", families)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Resolve coaching cues for MANY services at once, server-side.
 *
 * The per-service picker costs two round-trips each (a count, then a ranged
 * row). Calling it once per service from the client is what made the service
 * dialog's cue pop in late. This does the whole set in TWO queries:
 *
 *   1. ids only, for every candidate cue across all the services asked for
 *   2. title/body for the handful actually shown
 *
 * Only SERVICE-SPECIFIC cues come back — never the generic fallback, because a
 * generic cue isn't a next step for a particular service. Services with no
 * published cues (Oil Change and Alignment today) are simply absent.
 *
 * Each list LEADS with the cue pickCoachingCue would name today — same offset,
 * same id ordering — so the ritual, the service dialog and the pitch dialog all
 * agree. The rest follow as a preview of the library: the advisor's own tier
 * first, then the other tier. Sorting uuid text ascending equals Postgres's
 * byte ordering, since lowercase hex sorts the same as the bytes it encodes.
 */
export async function listCuesForServices(
  client: Client,
  date: IsoDate,
  services: { family: string; tier: "zero" | "low" }[],
  perService = CUES_PER_SERVICE
): Promise<Record<string, ServiceCue[]>> {
  const families = [...new Set(services.map((s) => s.family))];
  if (families.length === 0) return {};

  const candidates = await fetchCueIds(client, families);
  if (candidates.length === 0) return {};

  const byFamily = new Map<string, { id: string; tier: string | null }[]>();
  for (const row of candidates) {
    const list = byFamily.get(row.service_family) ?? [];
    list.push({ id: row.id, tier: row.tier });
    byFamily.set(row.service_family, list);
  }

  // Pick the ids to show per service, in display order.
  const chosen = new Map<string, string[]>();
  for (const { family, tier } of services) {
    const all = byFamily.get(family);
    if (!all || all.length === 0) continue;

    const mine = all.filter((c) => c.tier === tier).map((c) => c.id).sort();
    const other = all.filter((c) => c.tier !== tier).map((c) => c.id).sort();

    // Whichever pool the daily picker would have used leads the list, rotated
    // so its head IS today's cue.
    const lead = mine.length > 0 ? mine : other;
    const rest = mine.length > 0 ? other : [];

    const ids = [...rotate(lead, rotationIndex(date, lead.length, 1))];
    if (ids.length < perService && rest.length > 0) {
      ids.push(...rotate(rest, rotationIndex(date, rest.length, 1)));
    }
    chosen.set(family, ids.slice(0, perService));
  }

  const ids = [...chosen.values()].flat();
  if (ids.length === 0) return {};

  const batches = await Promise.all(
    chunk(ids, ID_BATCH).map(async (batch) => {
      const { data } = await client
        .from("content")
        .select("id, title, body")
        .in("id", batch);
      return (data ?? []) as { id: string; title: string; body: string | null }[];
    })
  );

  const byId = new Map(batches.flat().map((r) => [r.id, r]));

  const result: Record<string, ServiceCue[]> = {};
  for (const [family, list] of chosen) {
    const cues = list
      .map((id) => byId.get(id))
      .filter((r): r is { id: string; title: string; body: string | null } => !!r);
    if (cues.length > 0) result[family] = cues;
  }
  return result;
}

/** Split into fixed-size batches. */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Start an array at `start`, wrapping — [c,d,a,b] for start=2. */
function rotate<T>(list: T[], start: number): T[] {
  if (list.length === 0) return list;
  return [...list.slice(start), ...list.slice(0, start)];
}

/* ============================================================================
   The lifestyle / sales-skill video
   ============================================================================ */

/**
 * The video for the daily loop's lifestyle slot, signed and ready to play.
 *
 * PLACEMENT, NOT TYPE. content_type says who may see a thing and RLS is built
 * on it; placement (0057) says where the app surfaces it. Both videos in the
 * library are advisor_video — one belongs in the daily loop and one in
 * onboarding, and only placement can tell them apart.
 *
 * Returns null rather than throwing when nothing is published or Mux is
 * unconfigured, so the step renders its honest empty state instead of taking
 * the daily loop down. A missing video must never cost somebody their streak.
 */
export async function pickLifestyleVideo(
  client: Client,
  today: IsoDate,
  userId: string
): Promise<LifestyleVideoData | null> {
  const { data: rows } = await client
    .from("content")
    .select(
      "id, title, mux_playback_id, mux_playback_policy, " +
        "vertical_playback_id, vertical_status"
    )
    .eq("type", "advisor_video")
    .eq("placement", "daily_lifestyle")
    .eq("status", "published")
    .not("mux_playback_id", "is", null)
    .limit(24);

  const list = (rows ?? []) as {
    id: string; title: string;
    mux_playback_id: string | null; mux_playback_policy: string | null;
    vertical_playback_id: string | null; vertical_status: string | null;
  }[];
  if (!list.length) return null;

  /* Same deterministic day-rotation the quotes and cues use, so the loop feels
     composed rather than shuffled, and two advisors at one store see the same
     thing on the same day. */
  const row = list[rotationIndex(today, list.length, 3)];

  /*
   * THE APP PLAYS VERTICAL. The daily loop is a phone held upright on a service
   * drive, so a derived 9:16 crop is the right picture and the 16:9 master is
   * the fallback, not the other way round.
   *
   * 'stale' is deliberately NOT used: it means the master was trimmed after the
   * crop was made, so the vertical is a second out of step with its own
   * captions. Falling back to a CSS-cropped master is a worse picture but an
   * honest one.
   */
  const useVertical =
    row.vertical_status === "ready" && Boolean(row.vertical_playback_id);

  const tokens = await playbackFor(
    useVertical
      ? { mux_playback_id: row.vertical_playback_id, mux_playback_policy: "signed" }
      : row
  );
  if (!tokens) return null;

  const { data: progress } = await client
    .from("content_progress")
    .select("watched_pct, position_sec")
    .eq("content_id", row.id)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    contentId: row.id,
    title: row.title,
    playbackId: tokens.playbackId,
    token: tokens.token,
    thumbnailToken: tokens.thumbnailToken,
    storyboardToken: tokens.storyboardToken,
    watchedPct: Number(progress?.watched_pct ?? 0),
    positionSec: progress?.position_sec == null ? null : Number(progress.position_sec),
    orientation: useVertical ? ("vertical" as const) : ("landscape" as const),
    // No derived vertical yet: squeeze the master rather than letterbox it.
    cropToVertical: !useVertical,
  };
}

export type LifestyleVideoData = {
  contentId: string;
  title: string;
  playbackId: string;
  token: string;
  thumbnailToken: string;
  storyboardToken: string;
  watchedPct: number;
  positionSec: number | null;
  orientation: "vertical" | "landscape";
  cropToVertical: boolean;
};
