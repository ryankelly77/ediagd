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
  exclude?: string | null,
  /** The quote today's video is a filming of. See pickQuotesForDay. */
  alsoExclude?: string | null
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
  // Step past anything already covered today. Bounded by the pool size so a
  // pathological case cannot loop; two exclusions can never consume a 300+ pool.
  for (let i = 0; i < order.length; i++) {
    const id = order[index];
    if (id !== exclude && id !== alsoExclude) break;
    index = (index + 1) % order.length;
  }

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
  date: IsoDate,
  /**
   * The artifact today's lifestyle video belongs to, when it has one.
   *
   * ONE IDEA IS ONE IDEA, WHATEVER FORMAT IT ARRIVES IN. If the video is Mitch
   * saying "never lose money", the day's quote must not also be "never lose
   * money" — the advisor would meet the same line twice in one three-minute
   * ritual and it would read as the app repeating itself.
   *
   * THIS IS A SAME-DAY GUARANTEE BY DESIGN, NOT A WINDOW SOMEBODY FORGOT.
   *
   * There is no recency table in this system. The existing repeat-avoidance IS
   * the deterministic rotation: each pool is walked in order, so an item recurs
   * once per cycle and never sooner. A cross-day exclusion window would be
   * redundant with the rotation itself — the only dedup that means anything
   * here is "do not serve both formats of one idea on the same day", and that
   * is exactly what this does.
   *
   * It reuses the exclusion the picker already has — the same one that stops a
   * `both`-tagged quote filling slot 2 and slot 3 on one day — extended to
   * cover the video's twin.
   */
  videoArtifactId?: string | null
): Promise<{ slot2: QuoteRow | null; slot3: QuoteRow | null }> {
  const slot3 = await pickQuoteForSlot(client, date, "slot3", videoArtifactId ?? null);
  const slot2 = await pickQuoteForSlot(
    client,
    date,
    "slot2",
    slot3?.id ?? null,
    videoArtifactId ?? null
  );
  return { slot2, slot3 };
}

/**
 * The life quote that opens the day. Slot 3.
 *
 * WHAT THIS USED TO RETURN: a generic CUE — `type='cue' AND tier='generic' AND
 * service_family IS NULL`, 404 rows of full coaching passages. There was no
 * quote pool to draw from, so step 1 borrowed the cue pool and rendered a
 * 600-character lesson as a pull quote. Those 404 rows are untouched and still
 * back the no-block passage in pickCoachingCueForBlock; they are no longer
 * pretending to be quotes.
 */
export async function pickQuoteOfDay(
  client: Client,
  date: IsoDate
): Promise<QuoteRow | null> {
  return pickQuoteForSlot(client, date, "slot3");
}

/* ---------------------------------------------------------------------------
   THE FOUR-RUNG LADDER — coaching at op-code grain, bridged to the family
--------------------------------------------------------------------------- */

/**
 * Which rung of the ladder actually produced today's cue.
 *
 * Recorded on daily_completion (0067) because Phase 0's finding was that the
 * loop could not report how often it degrades: the old three-step chain always
 * returned something and said nothing about where it came from, so a family
 * with no cues looked exactly like a family that was working.
 */
export type CueMatch =
  | "op_code_stage_tier"
  | "op_code_stage"
  | "op_code"
  | "family"
  | "none";

/** What the block hands the picker. Kept structural so scripts can build one. */
export type BlockFocus = {
  family: string;
  opCode: string | null;
  stage: string | null;
  tier: "zero" | "low" | null;
};

/**
 * The day's coaching cue for an advisor inside a block.
 *
 * ---------------------------------------------------------------------------
 * FOUR RUNGS, THEN AN HONEST EMPTY
 * ---------------------------------------------------------------------------
 *   1  op code + stage + tier   the pitch, at this point in it, for this
 *                               advisor's performance on it
 *   2  op code + stage          the pitch, at this point in it
 *   3  op code                  the pitch, anywhere in it
 *   4  family                   the legacy family shelf, reached through
 *                               op_code_family — this is the bridge, and today
 *                               it is the rung that fires for everyone
 *   -  none                     nothing published reaches this advisor
 *
 * THE GENERIC POOL IS NOT ON THIS LADDER, AND THAT IS THE POINT. The old chain
 * ended in 404 rows of generic passage, so an advisor whose weakest family had
 * no cues got a lesson about something else and no one could tell. A generic
 * passage is not coaching about brakes; serving one and recording it as the
 * brake cue is how a content gap stays invisible for a year. Rung 4 failing now
 * returns null and says `none`, and the screen shows that.
 *
 * The tier preference inside rung 4 is an ORDERING, not a fifth rung: it tries
 * the advisor's tier first and any tier second, and records `family` either
 * way. Splitting it would make the ladder five rungs to record a distinction
 * the family shelf does not really draw.
 *
 * RUNG 3 IS LIVE. This used to say rungs 1-3 return nothing "until the
 * knowledge re-import lands". It has landed: 714 published cues carry an op
 * code. Rungs 1 and 2 are still empty because no cue carries a STAGE yet, so
 * the ladder in practice runs 3 → 4 — and rung 3 is now gated on the op code
 * having enough cues to fill a block, see opCodeHasBlockDepth below.
 */
export async function pickCoachingCueForBlock(
  client: Client,
  date: IsoDate,
  block: BlockFocus | null
): Promise<{ cue: ContentRow | null; matched: CueMatch | null }> {
  /*
   * NO BLOCK IS NOT THE SAME AS NO CONTENT, and the two must not be recorded
   * the same way. An advisor with no block is at or above store average
   * everywhere, or has fewer than 20 ROs — there is nothing to coach, so
   * nothing failed. `matched: null` means "no coaching was attempted"; `none`
   * means "we tried and the shelf was bare". Collapsing them would make a
   * healthy advisor look like a content gap in the degradation report.
   *
   * They still get the generic passage, which is what they have always had and
   * is honest here: it is not pretending to be about a service they are weak
   * on, because there isn't one.
   */
  if (!block) {
    const generic = await pickGenericPassage(client, date);
    return { cue: generic, matched: null };
  }

  const base = (q: any) => q.eq("type", "cue").eq("status", "published"); // eslint-disable-line @typescript-eslint/no-explicit-any

  /*
   * ---- THE CONTENT GATE, AT OP-CODE GRAIN --------------------------------
   *
   * lib/coachable-families.ts gates a FAMILY on having at least
   * coaching_block_days published cues, and its header says why: the knowledge
   * re-import published a single Oil Change cue, which would have given an
   * advisor a six-day block with one cue behind it — "the same passage every
   * morning for a week, which reads worse than the honest empty card the gate
   * exists to prevent."
   *
   * Rungs 1-3 select at op-code grain, and nothing gated that. The header below
   * used to say they "return nothing at all today — 0 content rows carry an op
   * code until the knowledge re-import lands." It has landed: 714 published cues
   * carry one, across 22 codes, and 14 of those codes have fewer than six. So
   * the failure the family gate was written to prevent came back one level down.
   *
   * Same rule, same setting, same direction of failure: not enough depth means
   * fall through to the family shelf, which has hundreds.
   */
  if (block.opCode && !(await opCodeHasBlockDepth(client, block.opCode))) {
    return pickFamilyRung(client, date, block, base);
  }

  if (block.opCode) {
    if (block.stage && block.tier) {
      const hit = await pickByRotation(
        client,
        (q) =>
          base(q).eq("op_code", block.opCode).eq("stage", block.stage).eq("tier", block.tier),
        date,
        1
      );
      if (hit) return { cue: hit, matched: "op_code_stage_tier" };
    }

    if (block.stage) {
      const hit = await pickByRotation(
        client,
        (q) => base(q).eq("op_code", block.opCode).eq("stage", block.stage),
        date,
        1
      );
      if (hit) return { cue: hit, matched: "op_code_stage" };
    }

    const hit = await pickByRotation(
      client,
      (q) => base(q).eq("op_code", block.opCode),
      date,
      1
    );
    if (hit) return { cue: hit, matched: "op_code" };
  }

  return pickFamilyRung(client, date, block, base);
}

/**
 * Rung 4 — the bridge. op_code_family put the block's code in this family, so
 * the 1,695 cues Mitch already wrote against families are reachable from a pick
 * that now names an op code.
 *
 * Extracted because there are two ways down to it: falling off the bottom of
 * rungs 1-3, and being sent here by the depth gate above. Both must land on the
 * same rung and record the same `family`, and two copies of it would eventually
 * not.
 */
async function pickFamilyRung(
  client: Client,
  date: IsoDate,
  block: BlockFocus,
  base: Filters
): Promise<{ cue: ContentRow | null; matched: CueMatch | null }> {
  if (block.tier) {
    const hit = await pickByRotation(
      client,
      (q) => base(q).eq("service_family", block.family).eq("tier", block.tier),
      date,
      1
    );
    if (hit) return { cue: hit, matched: "family" };
  }

  const anyTier = await pickByRotation(
    client,
    (q) => base(q).eq("service_family", block.family),
    date,
    1
  );
  if (anyTier) return { cue: anyTier, matched: "family" };

  return { cue: null, matched: "none" };
}

/**
 * Does this op code have enough published cues to fill a block without
 * repeating?
 *
 * A HEAD COUNT, NOT A GROUP-BY. lib/coachable-families.ts reads a view because
 * it needs every family's count at once and doing that in JS meant 1,257 rows
 * through PostgREST's 1,000-row cap. This wants one number for one code, which
 * `count: exact, head: true` answers without returning a row.
 *
 * FAILS TOWARDS THE FAMILY SHELF. A count that cannot be read returns false and
 * the day serves a family cue — the same direction the family gate fails in,
 * and the same reasoning: a shelf with hundreds on it is never the wrong
 * fallback, and a repeated cue is a bad morning that looks like a bug.
 */
async function opCodeHasBlockDepth(client: Client, opCode: string): Promise<boolean> {
  const [{ count, error }, { data: settings }] = await Promise.all([
    client
      .from("content")
      .select("id", { count: "exact", head: true })
      .eq("type", "cue")
      .eq("status", "published")
      .eq("op_code", opCode),
    client.from("game_settings").select("coaching_block_days").limit(1).maybeSingle(),
  ]);

  if (error) return false;
  // The migration's default, not a number invented here — same fallback as
  // loadBlockDays and loadFamiliesWithCues. Zero would turn the gate off.
  const minCues = Number(settings?.coaching_block_days ?? 0) || 6;
  return Number(count ?? 0) >= minCues;
}

/**
 * The 404-row generic pool. Offset 7 keeps it off the same row as the quote.
 *
 * Only reachable from the no-block path above. It is no longer the bottom of
 * the coaching ladder — see pickCoachingCueForBlock.
 */
async function pickGenericPassage(
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
    7
  );
}

/* ---------------------------------------------------------------------------
   STEP 3 — the pitch video for today's stage
--------------------------------------------------------------------------- */

export type PitchVideoData = LifestyleVideoData & { stage: string | null };

/**
 * The op code's video for the stage the block is on, or null.
 *
 * ---------------------------------------------------------------------------
 * NULL MEANS SKIP THE STEP. IT DOES NOT MEAN RENDER AN EMPTY PLAYER.
 * ---------------------------------------------------------------------------
 * Step 3 has been a placeholder since the loop shipped. The honest behaviour
 * when a stage has not been filmed is to leave the step out of the day — an
 * advisor on a service drive does not need a card explaining that a video does
 * not exist — and to WRITE DOWN that it was skipped, so the count of unfilmed
 * stages is recoverable later. daily_completion.pitch_video_skipped is that
 * record; without it the gap is only visible by watching someone use the app.
 *
 * No stage and no op code means there is nothing to look up, which is a skip
 * for the same reason and gets recorded the same way.
 *
 * Returns nothing at all today: 0 rows are in 'Pitches by Op Code'. Every day
 * served before the re-import will record skipped=true, which is the correct
 * measurement of a library that has not been filmed yet.
 */
export async function pickPitchVideo(
  client: Client,
  date: IsoDate,
  userId: string,
  block: BlockFocus | null
): Promise<PitchVideoData | null> {
  if (!block?.opCode || !block.stage) return null;

  const { data: rows } = await client
    .from("content")
    .select(
      "id, title, stage, mux_playback_id, mux_playback_policy, " +
        "vertical_playback_id, vertical_status, artifact_id"
    )
    .eq("type", "advisor_video")
    .eq("collection", "Pitches by Op Code")
    .eq("status", "published")
    .eq("op_code", block.opCode)
    .eq("stage", block.stage)
    .not("mux_playback_id", "is", null)
    .order("id", { ascending: true })
    .limit(1000);

  const list = (rows ?? []) as VideoRow[];
  if (!list.length) return null;

  // Offset 5: distinct from the lifestyle video's 3, so a day that serves both
  // does not walk the two pools in lockstep.
  const row = list[rotationIndex(date, list.length, 5)];
  const shaped = await shapeVideo(client, row, userId);
  return shaped ? { ...shaped, stage: (row.stage as string | null) ?? null } : null;
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
/**
 * What the button under the quote says.
 *
 * IT MOVES YOU ON; IT DOES NOT MEAN YOU LIKED IT. All three of these used to be
 * about affection — "Love it", "That resonates today", "I needed that" — which
 * was the only way to respond to a quote before there was a heart. Now the
 * heart keeps it and this advances the day, and two controls on one screen both
 * saying "I liked this" makes the advisor pick between them: tapping "Love it"
 * to continue reads as having already said so, which is the thing most likely
 * to stop them ever using the one that actually saves anything.
 *
 * So these carry the quote FORWARD instead. Still three, still rotating, still
 * warm — a bare "Next" would be honest and cold, and this is the first thing an
 * advisor reads in the morning.
 */
export const ACK_LABELS = [
  "Let's get to it",
  "Carry it with me",
  "On to today",
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
 * Each list LEADS with the cue the daily ladder would name today — same offset,
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
 * The two shelves the lifestyle slot draws from, alternating by day.
 *
 * ---------------------------------------------------------------------------
 * CRAFT IS EMPTY TODAY, AND THE ROTATION IS STILL RIGHT
 * ---------------------------------------------------------------------------
 * All 56 published daily_lifestyle videos are 'Mindset'. So this rotation makes
 * no visible difference until Craft videos are published — every day falls back
 * to Mindset, which is what the advisor already sees.
 *
 * It is built now anyway because the alternative is discovering on the day the
 * first Craft video lands that nothing serves it. The fallback below is what
 * makes that safe: an empty shelf yields to the other one rather than costing
 * the advisor their step.
 */
const LIFESTYLE_COLLECTIONS = ["Mindset", "Craft"] as const;

type VideoRow = {
  id: string;
  title: string;
  stage?: string | null;
  collection?: string | null;
  mux_playback_id: string | null;
  mux_playback_policy: string | null;
  vertical_playback_id: string | null;
  vertical_status: string | null;
  artifact_id: string | null;
};

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
      "id, title, collection, mux_playback_id, mux_playback_policy, " +
        "vertical_playback_id, vertical_status, artifact_id"
    )
    .eq("type", "advisor_video")
    .eq("placement", "daily_lifestyle")
    .eq("status", "published")
    .not("mux_playback_id", "is", null)
    /*
     * ORDERED, AND NOT CAPPED AT 24.
     *
     * This used to take `.limit(24)` with no `.order()`, which was two bugs
     * wearing one coat. Unordered, PostgREST may return any 24 rows and a
     * different 24 next time — so the "deterministic day rotation" below was
     * rotating over a set that could change under it. And capped, a pool bigger
     * than 24 has a tail nothing can reach: the MINDSET batch takes this pool to
     * 57, so 33 videos would have been published and permanently invisible.
     *
     * Same family of bug as the dayOfYear rotation fixed alongside the quotes.
     * A cap is only safe when it is bigger than the pool can get, and this pool
     * is heading for the playbook's 240.
     */
    .order("id", { ascending: true })
    .limit(1000);

  const all = (rows ?? []) as VideoRow[];
  if (!all.length) return null;

  /*
   * MINDSET ONE DAY, CRAFT THE NEXT — a lesson in who you are, then a lesson in
   * how you work. Alternating on the epoch day rather than tracking a cursor
   * keeps it stateless, the same way every other pool in this file rotates, and
   * means two advisors at one store still see the same shelf on the same day.
   *
   * The empty-shelf fallback is not defensive clutter: with Craft unpublished
   * it is the branch that runs every other day, and without it half the year
   * would render step 4 empty.
   */
  const wanted = LIFESTYLE_COLLECTIONS[epochDay(today) % LIFESTYLE_COLLECTIONS.length];
  const shelf = all.filter((r) => r.collection === wanted);
  const list = shelf.length > 0 ? shelf : all;

  /* Same deterministic day-rotation the quotes and cues use, so the loop feels
     composed rather than shuffled, and two advisors at one store see the same
     thing on the same day. */
  const row = list[rotationIndex(today, list.length, 3)];
  return shapeVideo(client, row, userId);
}

/**
 * Sign a video row and read the viewer's progress against it.
 *
 * Shared by the lifestyle slot and the pitch slot, which need identical
 * treatment — vertical preferred, progress read, linked quote resolved — and
 * differ only in how the row was chosen.
 */
async function shapeVideo(
  client: Client,
  row: VideoRow,
  userId: string
): Promise<LifestyleVideoData | null> {
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

  /* The words, when this video is a filming of a quote. One extra read only on
     the days a linked video is served, which is a minority of them. */
  let quoteText: string | null = null;
  let quoteVoice: string | null = null;
  if (row.artifact_id) {
    const { data: twin } = await client
      .from("content")
      .select("body, voice")
      .eq("id", row.artifact_id)
      .maybeSingle();
    quoteText = (twin?.body as string) ?? null;
    quoteVoice = (twin?.voice as string) ?? null;
  }

  return {
    contentId: row.id,
    title: row.title,
    artifactId: row.artifact_id,
    quoteText,
    quoteVoice,
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
  /**
   * The text row this video is a filming of, when the two are linked (0064).
   *
   * ONE IDEA, TWO FORMATS. The words exist as a quote and the video is Mitch
   * saying them, so the player card can carry the attribution without a second
   * lookup. Whether the UI shows it is a design call — the data is here either
   * way, which is what the link was for.
   */
  artifactId: string | null;
  quoteText: string | null;
  quoteVoice: string | null;
};
