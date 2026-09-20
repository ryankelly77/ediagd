/* ============================================================================
   EDIAGD — the Two Ladders loop: mindset, pitch, item
   SERVER ONLY. Takes two clients and the difference matters on every query.

     `client`   the ADVISOR'S own session client. Every content read goes
                through it, so 0010's entitlement RLS decides what can be
                served. A pool assembled with the service role would happily
                offer a film the rooftop never bought.
     `service`  the service role. Reads and writes the rows an advisor must not
                be able to choose for themselves: the focus-family assignment,
                the pool cursors, the track-entry record.

   Mixing those up is the whole security story of this file, which is why they
   are separate parameters rather than one client chosen by the caller.

   ---------------------------------------------------------------------------
   THREE SLOTS, THREE COMPLETELY DIFFERENT MECHANISMS
   ---------------------------------------------------------------------------
     mindset  a POOL DRAW with real recency. No sequence, no consumption
              record, so it carries its own cursor (advisor_pool_seen).
     pitch    DERIVED from the DMS and locked per cycle. Walks the focus
              family's films in deck order, skipping what is already completed.
     item     SEQUENTIAL. The advisor's curriculum, in module order, skipping
              what is already completed. Never personalised — TWO_LADDERS is
              explicit that scoring craft against advisor data would put a
              guess underneath a credential.

   That asymmetry is the architecture, not three inconsistent implementations.
   ============================================================================ */

import "server-only";
import { shapeVideo, type LifestyleVideoData, type VideoRow, type QuoteRow } from "@/lib/daily";
import { compositeOrNull } from "@/lib/pg-composite";
import { loadFamilyContent } from "@/lib/service-family";
import type { MorningKind } from "@/lib/gamification/dayGate";
import type { IsoDate } from "@/lib/gamification/streak";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any; rpc?: (fn: string, args?: any) => any };
type ServiceClient = { from: (table: string) => any; rpc: (fn: string, args?: any) => any };

/** PostgREST caps a response at 1000 rows whatever .limit() says. */
const PAGE = 1000;

/* ---------------------------------------------------------------------------
   POOL RECENCY — mindset and the closing quote
--------------------------------------------------------------------------- */

export type PoolName = "mindset" | "quote";

/**
 * A stable, well-mixed hash. FNV-1a, 32-bit.
 *
 * THE RESHUFFLE HAS TO BE DETERMINISTIC OR THE DAY IS NOT STABLE. The advisor
 * must see the same film on a reload, and two servers handling two requests in
 * the same morning must agree. So the order is a pure function of (user, pool,
 * cycle, content id) rather than anything random — and because the cycle number
 * is in the hash, pass two genuinely re-orders the pool instead of walking it
 * the same way again.
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type PoolDraw<T> = { item: T; cycle: number };

/**
 * Draw the next unseen thing from a pool, starting a new pass when it empties.
 *
 * NOTHING IS WRITTEN HERE. The draw is a read; the `seen` row is written at
 * completion, through the one gate. That is deliberate: marking it on serve
 * would mean an advisor who opens the app and walks away has "seen" a film they
 * never watched, and tomorrow would move on without them.
 *
 * The consequence — an abandoned morning serves the same film tomorrow — is the
 * correct behaviour and not an oversight.
 */
export async function drawFromPool<T extends { id: string }>(
  service: ServiceClient,
  userId: string,
  pool: PoolName,
  candidates: T[]
): Promise<PoolDraw<T> | null> {
  if (candidates.length === 0) return null;

  const { data: seenRows } = await service
    .from("advisor_pool_seen")
    .select("content_id, cycle")
    .eq("user_id", userId)
    .eq("pool", pool)
    .order("cycle", { ascending: false })
    .limit(PAGE);

  const rows = (seenRows ?? []) as { content_id: string; cycle: number }[];
  const cycle = rows.length ? Math.max(...rows.map((r) => Number(r.cycle))) : 1;
  const seen = new Set(rows.filter((r) => Number(r.cycle) === cycle).map((r) => r.content_id));

  let active = cycle;
  let unseen = candidates.filter((c) => !seen.has(c.id));

  /*
   * THE POOL IS EXHAUSTED — TURN IT OVER.
   *
   * Not "serve something twice", and not "serve nothing". The next pass starts
   * here and the whole pool is available again, in a different order.
   *
   * Note this is evaluated against the CURRENT pool, not the one the cycle
   * started with. A film published mid-cycle is unseen, so it is simply
   * eligible; a film retired mid-cycle drops out and its `seen` rows stay,
   * which is why exhaustion is tested as "nothing unseen" rather than
   * "seen.size === pool.size" — the latter would never come true again after a
   * retirement and the advisor would be stuck.
   */
  if (unseen.length === 0) {
    active = cycle + 1;
    unseen = candidates;
  }

  const chosen = [...unseen].sort(
    (a, b) =>
      hash(`${userId}:${pool}:${active}:${a.id}`) - hash(`${userId}:${pool}:${active}:${b.id}`) ||
      a.id.localeCompare(b.id)
  )[0];

  return { item: chosen, cycle: active };
}

/* ---------------------------------------------------------------------------
   SLOT 1 — MINDSET
--------------------------------------------------------------------------- */

const MINDSET_COLUMNS =
  "id, title, collection, mux_playback_id, mux_playback_policy, " +
  "vertical_playback_id, vertical_status, artifact_id";

/**
 * The film that opens the day.
 *
 * ---------------------------------------------------------------------------
 * THIS RUNS FIRST NOW, AND THAT IS THE POINT RATHER THAN A SIDE EFFECT
 * ---------------------------------------------------------------------------
 * It used to be step 4 of 5 — the last thing before the celebration. "Get your
 * head right" is not a thing you do at the end of a ritual, and an advisor who
 * abandoned the morning at the cue never reached it at all.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COSTS, NAMED RATHER THAN DISCOVERED
 * ---------------------------------------------------------------------------
 * The old rotation was `epochDay % pool`, so every advisor at a store saw the
 * SAME film on the SAME day and could talk about it on the drive. Per-advisor
 * recency ends that: two advisors at one rooftop now diverge on their second
 * morning and never re-sync.
 *
 * That trade is deliberate and it is reversible — deleting the advisor_pool_seen
 * read and going back to the rotation is a small change, and the table would
 * simply stop being written. It is made because the complaint we actually have
 * is "this came round again", and because the rotation's fairness was partly a
 * fiction anyway: an advisor who misses Tuesday never sees Tuesday's film.
 *
 * COLLECTION 'Mindset', NOT placement alone. The old picker alternated a
 * Mindset shelf with a Craft shelf. Craft is where the six foundational films
 * live and two of them are wired as pitch-stage fallbacks; serving one as the
 * day's mindset film would put the same film in two slots. The mindset slot is
 * the Mindset shelf.
 */
export async function pickMindset(
  client: Client,
  service: ServiceClient,
  userId: string,
  today: IsoDate
): Promise<{ video: LifestyleVideoData; cycle: number } | null> {
  const { data: rows } = await client
    .from("content")
    .select(MINDSET_COLUMNS)
    .eq("type", "advisor_video")
    .eq("placement", "daily_lifestyle")
    .eq("collection", "Mindset")
    .eq("status", "published")
    .is("retired_at", null)
    .not("mux_playback_id", "is", null)
    /* Ordered so the candidate list is stable; the pool draw re-orders it. */
    .order("id", { ascending: true })
    .limit(PAGE);

  const pool = (rows ?? []) as VideoRow[];
  const draw = await drawFromPool(service, userId, "mindset", pool);
  if (!draw) return null;

  const shaped = await shapeVideo(client, draw.item, userId, today);
  return shaped ? { video: shaped, cycle: draw.cycle } : null;
}

/* ---------------------------------------------------------------------------
   SLOT 2 — PITCH
--------------------------------------------------------------------------- */

/*
 * THE SIX STAGES USED TO BE LISTED HERE, and the ordering they drove now lives
 * in lib/service-family.ts — the pitch slot asks for a family's films and gets
 * them in deck order rather than sorting them itself. One order, so "continue"
 * on the card and tomorrow's pitch are the same film by construction.
 */

export type FocusAssignment = {
  id: string;
  family: string;
  source: "derived" | "manager" | "default";
  filmCount: number | null;
};

export type PitchSlot = LifestyleVideoData & {
  family: string;
  opCode: string | null;
  stage: string | null;
  /** Nth film of this family's shelf, 1-based, and how many there are. */
  position: number;
  total: number;
};

/**
 * Keep or move the focus family, then serve its next unwatched film.
 *
 * ONE RPC FOR THE ASSIGNMENT, NOT FOUR ROUND TRIPS. advance_focus_family (0124)
 * decides in Postgres whether the current assignment still has film left, ends
 * it if not, and derives the next — atomically. Doing that here would mean
 * read, count, update, insert with a race in the middle and the ranking living
 * in two languages.
 *
 * Returns null when there is NO assignment (no DMS history, or every stocked
 * family already watched). That is a two-slot morning, and it is an honest
 * state rather than a failure.
 */
export async function pickPitch(
  client: Client,
  service: ServiceClient,
  userId: string,
  rooftopId: string,
  today: IsoDate
): Promise<{ assignment: FocusAssignment; pitch: PitchSlot | null } | null> {
  const { data: raw } = await service.rpc("advance_focus_family", {
    _user: userId,
    _rooftop: rooftopId,
  });

  /*
   * RULING 7. `returns advisor_focus_family` with `return null` arrives here as
   * a row of nulls, which is truthy. Testing the row instead of the family is
   * how an advisor with no DMS history gets locked onto a null family.
   */
  const row = compositeOrNull(
    raw as Record<string, unknown> | Record<string, unknown>[] | null,
    "family"
  );
  if (!row) return null;

  const assignment: FocusAssignment = {
    id: String(row.id),
    family: String(row.family),
    source: row.source as FocusAssignment["source"],
    filmCount: row.film_count == null ? null : Number(row.film_count),
  };

  /*
   * ---- THE FAMILY IS RESOLVED IN ONE PLACE, AND THIS IS NOT IT -----------
   *
   * This used to read op_code_family itself and build a code list — a fourth
   * copy of "what belongs to family F". 0125 makes that one view and
   * lib/service-family.ts the one reader; the loop now asks it.
   *
   * WHAT THE LOOP STILL OWNS is the ORDER and the CURSOR: deck order, and the
   * first film this advisor has not completed. loadFamilyContent returns films
   * already in deck order and already flagged `completed`, from the same
   * content_progress predicate advance_focus_family uses — so the card's
   * "continue" and tomorrow's pitch cannot disagree about which film is next.
   *
   * ENTITLEMENT IS UNCHANGED. loadFamilyContent reads `content` through the
   * client it is given, and it is given the ADVISOR'S. A rooftop that never
   * bought the product gets an empty shelf and a two-slot morning, exactly as
   * the acceptance suite asserts.
   */
  const resolved = await loadFamilyContent(client, userId, [assignment.family]);
  const films = resolved[assignment.family]?.films ?? [];
  if (films.length === 0) return { assignment, pitch: null };

  const done = films.filter((f) => f.completed).length;
  const nextItem = films.find((f) => !f.completed);
  if (!nextItem) return { assignment, pitch: null };

  const { data: filmRows } = await client
    .from("content")
    .select(`${MINDSET_COLUMNS}, op_code, stage`)
    .eq("id", nextItem.contentId)
    .limit(1);

  const next = (filmRows ?? [])[0] as
    | (VideoRow & { op_code: string; stage: string | null })
    | undefined;
  if (!next) return { assignment, pitch: null };

  const shaped = await shapeVideo(client, next, userId, today);
  if (!shaped) return { assignment, pitch: null };

  return {
    assignment,
    pitch: {
      ...shaped,
      family: assignment.family,
      opCode: next.op_code,
      stage: next.stage,
      position: done + 1,
      total: films.length,
    },
  };
}

/* ---------------------------------------------------------------------------
   SLOT 3 — ITEM
--------------------------------------------------------------------------- */

export type LoopItem = {
  contentId: string;
  /**
   * FORMAT-AGNOSTIC, AND NOT FILTERED ON.
   *
   * TWO_LADDERS: "The moment the loop decides 'only text here, video
   * elsewhere,' two orderings compete — the module's and the loop's." So this
   * is read off the row and used to RENDER, never to select. Today every
   * published module item is a cue; the day one is a film, this already works.
   */
  format: "text" | "video";
  title: string;
  body: string | null;
  /** Present only when the item is a film. */
  video: LifestyleVideoData | null;
  moduleName: string;
  courseName: string;
  trackName: string;
  certificationId: string;
  /** Nth published item of this track, 1-based, and how many there are. */
  position: number;
  total: number;
};

export type TrackEntry = {
  certificationId: string;
  name: string;
  slug: string;
  /** This is the advisor's first morning on this track. */
  entering: boolean;
  /** The film that opens it, when Mitch has ruled one. Null today. */
  film: LifestyleVideoData | null;
};

/**
 * The next item in the advisor's curriculum, and which track it belongs to.
 *
 * ---------------------------------------------------------------------------
 * TRACK ORDER IS `certification.sort`, AND THAT IS NOT AN INVENTED POLICY
 * ---------------------------------------------------------------------------
 * Mitch's open question 2 asks whether track order is fixed for everyone or set
 * per advisor by the manager. Unanswered — so this does the thing the document
 * already states rather than guessing at the thing it asks: "Craft is a
 * curriculum — sequential, identical for everyone." `certification.sort` is the
 * order Mitch gave the eight tracks in 0115, so it is his order, read from his
 * data.
 *
 * If he later says manager-set, that is a per-advisor override row and this
 * function grows a lookup in front of the ORDER BY. It is not a rewrite.
 *
 * ---------------------------------------------------------------------------
 * `active` IS NOT FILTERED ON, DELIBERATELY
 * ---------------------------------------------------------------------------
 * 0116 makes a track inactive when it is below the content bar, and that
 * governs whether it can be EARNED. It is not a statement about whether its
 * items are worth teaching. Setting up the MPI has two published items and is
 * inactive; skipping them would silently withhold content that exists. A track
 * with no unconsumed items falls through on its own, which is the filter that
 * actually matters.
 */
export async function pickItem(
  client: Client,
  service: ServiceClient,
  userId: string,
  today: IsoDate
): Promise<{ item: LoopItem | null; track: TrackEntry | null }> {
  /* ---- the eight core tracks, in Mitch's order --------------------------- */
  const { data: certRows } = await client
    .from("certification")
    .select("id, slug, name, sort, entry_film_content_id")
    .eq("is_core", true)
    .order("sort", { ascending: true });

  const certs = (certRows ?? []) as {
    id: string;
    slug: string;
    name: string;
    sort: number;
    entry_film_content_id: string | null;
  }[];
  if (certs.length === 0) return { item: null, track: null };

  const { data: ccRows } = await client
    .from("certification_course")
    .select("certification_id, course_id, sort");
  const cc = (ccRows ?? []) as { certification_id: string; course_id: string; sort: number }[];

  const { data: modRows } = await client
    .from("module")
    .select("id, course_id, name, sort_order")
    .limit(PAGE);
  const mods = (modRows ?? []) as {
    id: string;
    course_id: string;
    name: string;
    sort_order: number;
  }[];

  const { data: courseRows } = await client.from("course").select("id, name, track");
  const courses = new Map(
    ((courseRows ?? []) as { id: string; name: string; track: string }[]).map((c) => [c.id, c])
  );

  for (const cert of certs) {
    const courseIds = cc
      .filter((x) => x.certification_id === cert.id)
      .sort((a, b) => a.sort - b.sort)
      .map((x) => x.course_id);
    if (courseIds.length === 0) continue;

    const orderedModules = courseIds.flatMap((cid) =>
      mods
        .filter((m) => m.course_id === cid)
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    );
    if (orderedModules.length === 0) continue;

    /*
     * THE TRACK'S ITEMS, IN MODULE ORDER, READ AS THE ADVISOR.
     *
     * Paged past the 1000-row cap because this has to be EXHAUSTIVE: a
     * truncated list would make "the next unfinished item" the next item of
     * whatever page came back, which is a different and silently wrong answer.
     * Walk Around is 56 items, so one page today — but the CMS lets Mitch add.
     */
    const moduleIds = orderedModules.map((m) => m.id);
    const items = await itemsForModules(client, moduleIds);
    if (items.length === 0) continue;

    const byModule = new Map<string, typeof items>();
    for (const it of items) {
      const list = byModule.get(it.module_id) ?? [];
      list.push(it);
      byModule.set(it.module_id, list);
    }

    const ordered = orderedModules.flatMap((m) =>
      (byModule.get(m.id) ?? []).sort(
        (a, b) =>
          (a.module_order ?? Number.MAX_SAFE_INTEGER) -
            (b.module_order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)
      )
    );
    if (ordered.length === 0) continue;

    const done = await completedIds(
      client,
      userId,
      ordered.map((i) => i.id)
    );
    const next = ordered.find((i) => !done.has(i.id));
    if (!next) continue; // this track is finished; try the next one

    /* ---- is this the advisor's first morning on this track? -------------- */
    const { data: entryRow } = await service
      .from("advisor_track_entry")
      .select("certification_id")
      .eq("user_id", userId)
      .eq("certification_id", cert.id)
      .maybeSingle();

    const entering = !entryRow;

    /*
     * RULING 2. The film is looked up only when the pointer is set, and the
     * pointer is null for all eight tracks today. No film means `film: null`,
     * which the assembler reads as "a normal morning, and the track starts".
     * No placeholder, no borrowed film. When Mitch rules, an UPDATE to
     * certification.entry_film_content_id makes entry mornings appear with no
     * code change — that is the test this shape exists to pass.
     */
    let film: LifestyleVideoData | null = null;
    if (entering && cert.entry_film_content_id) {
      const { data: filmRow } = await client
        .from("content")
        .select(MINDSET_COLUMNS)
        .eq("id", cert.entry_film_content_id)
        .eq("status", "published")
        .is("retired_at", null)
        .not("mux_playback_id", "is", null)
        .maybeSingle();
      if (filmRow) film = await shapeVideo(client, filmRow as VideoRow, userId, today);
    }

    const mod = orderedModules.find((m) => m.id === next.module_id);
    const course = mod ? courses.get(mod.course_id) : undefined;

    return {
      item: {
        contentId: next.id,
        format: next.mux_playback_id ? "video" : "text",
        title: next.title,
        body: next.body,
        video: next.mux_playback_id
          ? await shapeVideo(client, next as unknown as VideoRow, userId, today)
          : null,
        moduleName: mod?.name ?? "—",
        courseName: course?.name ?? "—",
        trackName: cert.name,
        certificationId: cert.id,
        position: done.size + 1,
        total: ordered.length,
      },
      track: {
        certificationId: cert.id,
        name: cert.name,
        slug: cert.slug,
        entering,
        film,
      },
    };
  }

  return { item: null, track: null };
}

type ItemRow = {
  id: string;
  title: string;
  body: string | null;
  module_id: string;
  module_order: number | null;
  mux_playback_id: string | null;
  mux_playback_policy: string | null;
  vertical_playback_id: string | null;
  vertical_status: string | null;
  artifact_id: string | null;
};

/** Every published item in these modules, paged past the 1000-row cap. */
async function itemsForModules(client: Client, moduleIds: string[]): Promise<ItemRow[]> {
  if (moduleIds.length === 0) return [];
  const out: ItemRow[] = [];
  for (let page = 0; page < 20; page++) {
    const from = page * PAGE;
    const { data, error } = await client
      .from("content")
      .select(
        "id, title, body, module_id, module_order, mux_playback_id, " +
          "mux_playback_policy, vertical_playback_id, vertical_status, artifact_id"
      )
      .in("module_id", moduleIds)
      .eq("status", "published")
      .is("retired_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...(data as ItemRow[]));
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Which of these content ids has this advisor actually FINISHED.
 *
 * COMPLETED, NOT TOUCHED. record_watch_progress (0057) inserts a
 * content_progress row on the first watch ping and never sets completed_at, so
 * "a row exists" is true two seconds into a film. Selecting on the row would
 * let an advisor scrub through a family and have the cycle declare itself done.
 * The same predicate is written into advance_focus_family — they have to agree,
 * or the loop would serve a film the derivation thinks is already watched.
 *
 * Read through the ADVISOR's client: content_progress carries a self-read
 * policy, so this is their own history by construction rather than by a filter
 * somebody could forget.
 */
async function completedIds(
  client: Client,
  userId: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const out = new Set<string>();
  /* PostgREST puts `in` lists in the QUERY STRING, so the real limit is URL
     length, not row count — 200 uuids is fine and 400 fails as a network error
     that looks like an empty result. Same batch size lib/daily.ts settled on. */
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data } = await client
      .from("content_progress")
      .select("content_id")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .in("content_id", ids.slice(i, i + BATCH));
    for (const r of (data ?? []) as { content_id: string }[]) out.add(r.content_id);
  }
  return out;
}

/* ---------------------------------------------------------------------------
   THE MORNING
--------------------------------------------------------------------------- */

export type LoopMorning = {
  kind: MorningKind;
  mindset: LifestyleVideoData | null;
  mindsetCycle: number | null;
  pitch: PitchSlot | null;
  item: LoopItem | null;
  track: TrackEntry | null;
  assignment: FocusAssignment | null;
  /** The line they carry onto the drive. Gates nothing — ruling 6. */
  quote: QuoteRow | null;
  quoteCycle: number | null;
};

/**
 * Assemble the morning.
 *
 * ---------------------------------------------------------------------------
 * THE MORNING KIND IS DECIDED HERE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------
 *   track_entry  the advisor is starting a track AND that track has a film.
 *                The film is the day; pitch and item are not offered.
 *   two_slot     no pitch film to serve — no DMS history, no stocked family
 *                left, or this family's shelf is finished.
 *   normal       all three.
 *
 * Ruling 2 in one line: `entering && film` is the condition, not `entering`.
 * An advisor entering a track with no film gets a normal morning and the track
 * starts anyway — the entry is still recorded at completion.
 */
export async function assembleMorning(
  client: Client,
  service: ServiceClient,
  userId: string,
  rooftopId: string,
  today: IsoDate
): Promise<LoopMorning> {
  /*
   * The mindset draw, the pitch and the item depend on nothing but the
   * advisor and the date, so they go together. The quote is drawn alongside
   * them — it is shown at the end, but waiting until the end to fetch it would
   * put a round trip between the advisor and their celebration.
   */
  const [mindsetDraw, pitchResult, itemResult, quoteDraw] = await Promise.all([
    pickMindset(client, service, userId, today),
    pickPitch(client, service, userId, rooftopId, today),
    pickItem(client, service, userId, today),
    pickClosingQuote(client, service, userId),
  ]);

  const entering = itemResult.track?.entering ?? false;
  const entryFilm = itemResult.track?.film ?? null;

  if (entering && entryFilm) {
    return {
      kind: "track_entry",
      mindset: mindsetDraw?.video ?? null,
      mindsetCycle: mindsetDraw?.cycle ?? null,
      pitch: null,
      item: null,
      track: itemResult.track,
      assignment: pitchResult?.assignment ?? null,
      quote: quoteDraw?.item ?? null,
      quoteCycle: quoteDraw?.cycle ?? null,
    };
  }

  const pitch = pitchResult?.pitch ?? null;

  return {
    kind: pitch ? "normal" : "two_slot",
    mindset: mindsetDraw?.video ?? null,
    mindsetCycle: mindsetDraw?.cycle ?? null,
    pitch,
    item: itemResult.item,
    track: itemResult.track,
    assignment: pitchResult?.assignment ?? null,
    quote: quoteDraw?.item ?? null,
    quoteCycle: quoteDraw?.cycle ?? null,
  };
}

const QUOTE_COLUMNS =
  "id, type, service_family, subcategory, tier, make, model, year_range, title, body, " +
  "video_url, duration_sec, status, source, created_at, updated_at, voice, quote_slot, " +
  "coaching_nugget, best_used_for, needs_translation, quote_key";

/**
 * The quote on the completion screen.
 *
 * RULING 6. It is not a slot: it does not gate completion, it does not count
 * towards a credential, and it is drawn after the streak has already advanced.
 * It is the line the advisor carries onto the drive.
 *
 * BOTH SLOT POOLS, MERGED. The old loop drew two quotes from two pools —
 * slot3 to open the day and slot2 beside the coaching cue — and had to exclude
 * each from the other so one quote could not fill both. There is one quote a
 * day now, so the distinction has nothing left to do and every published quote
 * is a candidate: 393 rather than 335 or 280.
 *
 * It gets the pool cursor rather than the old voice-diverse rotation for the
 * reason ruling 5 gives, and there is a bonus: the rotation's careful
 * "neighbours never share a voice" construction was solving a problem the
 * cursor does not have, since a genuine no-repeat pass cannot serve Mitch Hardt
 * twice in a row unless Mitch Hardt is all that is left.
 */
export async function pickClosingQuote(
  client: Client,
  service: ServiceClient,
  userId: string
): Promise<PoolDraw<QuoteRow> | null> {
  const { data: rows } = await client
    .from("content")
    .select("id")
    .eq("type", "quote")
    .eq("status", "published")
    .is("retired_at", null)
    .order("id", { ascending: true })
    .limit(PAGE);

  const pool = (rows ?? []) as { id: string }[];
  const draw = await drawFromPool(service, userId, "quote", pool);
  if (!draw) return null;

  const { data } = await client
    .from("content")
    .select(QUOTE_COLUMNS)
    .eq("id", draw.item.id)
    .maybeSingle();
  if (!data) return null;

  return { item: data as QuoteRow, cycle: draw.cycle };
}
