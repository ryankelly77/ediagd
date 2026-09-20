/* ============================================================================
   EDIAGD — one resolved family
   SERVER ONLY. Takes two clients, and the split is the same one lib/loop.ts
   draws: the MAPPING is read with whichever client can see it, the CONTENT is
   always read with the advisor's own, so content_entitled_read decides.

   ---------------------------------------------------------------------------
   WHY THIS FILE EXISTS
   ---------------------------------------------------------------------------
   "What belongs to service family F" was asked in five places and answered five
   ways. The worst answer was the advisor's own screen: listCuesForServices read
   `content.service_family` and nothing else, so it returned cues and never a
   film — while the pitch slot, reading op_code_family, served that same advisor
   a film from that same family the same morning.

   52 published films were reachable for a family and invisible on every
   member-facing surface. The service dialog showed a "Soon" badge over an empty
   video tab for Belts & Cooling, which has twelve.

   0125 makes the resolution one view. This is the one reader of it.
   ============================================================================ */

import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any; rpc?: (fn: string, args?: any) => any };
type ServiceClient = { from: (table: string) => any; rpc: (fn: string, args?: any) => any };

/** PostgREST caps a response at 1000 rows whatever .limit() says. */
const PAGE = 1000;
/**
 * How many ids to put in one `.in(...)`. PostgREST puts them in the QUERY
 * STRING, so the real limit is URL length: 200 uuids is fine, 400 fails as a
 * network error that looks like an empty result. Same number lib/daily.ts and
 * lib/loop.ts settled on.
 */
const ID_BATCH = 100;

export type FamilyItemKind = "cue" | "film";

export type FamilyItem = {
  contentId: string;
  kind: FamilyItemKind;
  title: string;
  body: string | null;
  opCode: string | null;
  stage: string | null;
  durationSec: number | null;
  /** This advisor has finished it. Shared with the loop — one consumption record. */
  completed: boolean;
};

export type FamilyContent = {
  family: string;
  /** Pitch films, in deck order — op code, then the stage order of a pitch. */
  films: FamilyItem[];
  /** Coaching cues. Ordered by id, which is how every other pool here orders. */
  cues: FamilyItem[];
};

/**
 * Mitch's six stages, in order.
 *
 * Duplicated from lib/loop.ts rather than imported, and that is a judgement
 * worth stating: importing would make this module depend on the loop, and the
 * dependency runs the other way — the loop reads THIS. The array is six frozen
 * strings that already appear identically in three migrations' CHECK
 * constraints; a seventh stage is a migration, and a migration is where
 * somebody would look.
 */
const STAGE_ORDER = [
  "Pre-Write",
  "On the Drive",
  "At the Kiosk",
  "MPI Setup",
  "After-MPI",
  "Objections",
] as const;

const CONTENT_COLUMNS =
  "id, type, title, body, op_code, stage, duration_sec, mux_playback_id, collection";

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  op_code: string | null;
  stage: string | null;
  duration_sec: number | null;
  mux_playback_id: string | null;
  collection: string | null;
};

/**
 * Everything published in these families that this advisor may actually open.
 *
 * ---------------------------------------------------------------------------
 * THREE QUERIES, AND WHICH CLIENT EACH ONE USES IS THE WHOLE SECURITY STORY
 * ---------------------------------------------------------------------------
 *   1  service_family_content   the MAPPING. Definer view, granted to
 *                               authenticated, carries no content columns — so
 *                               the advisor's own client is fine and no
 *                               service-role read is needed to resolve a family.
 *   2  content                  the ROWS. The advisor's own client, always, so
 *                               content_entitled_read decides. A rooftop that
 *                               never bought the product gets ids that resolve
 *                               to nothing, which is the correct empty.
 *   3  content_progress         the advisor's own consumption, their own client,
 *                               their own self-read policy.
 *
 * The service client is not used here at all. It is in the signature because
 * the card's per-advisor progress function needs it, and because a caller that
 * has one should not have to decide which to pass.
 */
export async function loadFamilyContent(
  client: Client,
  userId: string,
  families: string[]
): Promise<Record<string, FamilyContent>> {
  const wanted = [...new Set(families.filter(Boolean))];
  if (wanted.length === 0) return {};

  /* ---- 1. the mapping ---------------------------------------------------- */
  const mapping: { family: string; content_id: string; via: string; coachable: boolean }[] = [];
  for (let page = 0; page < 40; page++) {
    const from = page * PAGE;
    const { data, error } = await client
      .from("service_family_content")
      .select("family, content_id, via, coachable")
      .in("family", wanted)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    mapping.push(...data);
    if (data.length < PAGE) break;
  }
  if (mapping.length === 0) return {};

  /*
   * ONE CONTENT ID CAN APPEAR TWICE. 439 of Belts & Cooling's cues carry the
   * family tag AND an op code that maps to it, so the view returns both arms.
   * The set is the membership answer; the `via`/`coachable` flags are kept per
   * family so the film filter below can still ask "reached by op code, on a
   * coachable one".
   */
  const byFamily = new Map<string, Map<string, { via: Set<string>; coachable: boolean }>>();
  for (const m of mapping) {
    if (!byFamily.has(m.family)) byFamily.set(m.family, new Map());
    const inner = byFamily.get(m.family)!;
    const prev = inner.get(m.content_id);
    if (prev) {
      prev.via.add(m.via);
      prev.coachable = prev.coachable || m.coachable;
    } else {
      inner.set(m.content_id, { via: new Set([m.via]), coachable: m.coachable });
    }
  }

  /* ---- 2. the rows, as the advisor ------------------------------------- */
  const allIds = [...new Set(mapping.map((m) => m.content_id))];
  const rows = new Map<string, Row>();
  for (let i = 0; i < allIds.length; i += ID_BATCH) {
    const { data } = await client
      .from("content")
      .select(CONTENT_COLUMNS)
      .eq("status", "published")
      .is("retired_at", null)
      .in("id", allIds.slice(i, i + ID_BATCH));
    for (const r of (data ?? []) as Row[]) rows.set(r.id, r);
  }
  if (rows.size === 0) return {};

  /* ---- 3. what this advisor has already finished ------------------------ */
  const done = await completedIds(client, userId, [...rows.keys()]);

  /* ---- shape ------------------------------------------------------------ */
  const out: Record<string, FamilyContent> = {};
  for (const family of wanted) {
    const inner = byFamily.get(family);
    if (!inner) continue;

    const films: FamilyItem[] = [];
    const cues: FamilyItem[] = [];

    for (const [id, flags] of inner) {
      const row = rows.get(id);
      if (!row) continue; // not published, retired, or not entitled — all "absent"

      const item: FamilyItem = {
        contentId: row.id,
        kind: row.type === "cue" ? "cue" : "film",
        title: row.title,
        body: row.body,
        opCode: row.op_code,
        stage: row.stage,
        durationSec: row.duration_sec,
        completed: done.has(row.id),
      };

      if (row.type === "cue") {
        cues.push(item);
        continue;
      }

      /*
       * A FILM ONLY COUNTS AS THIS FAMILY'S FILM IF THE OP CODE PUT IT THERE.
       *
       * Same rule the pitch slot applies, for the same reason: a menu bundle
       * has no attach rate to be coached against, and a film that is only in
       * the family because somebody typed a service_family on a video is not a
       * pitch for one of its op codes. Today no published film is tagged that
       * way and no published content sits on a non-coachable code, so this
       * filter removes nothing — it is here so the screen and the loop cannot
       * drift apart when one of those becomes false.
       */
      if (!flags.via.has("op_code") || !flags.coachable) continue;
      if (!row.mux_playback_id) continue; // a film that cannot be played is not offered
      films.push(item);
    }

    films.sort(
      (a, b) =>
        (a.opCode ?? "").localeCompare(b.opCode ?? "") ||
        stageRank(a.stage) - stageRank(b.stage) ||
        a.contentId.localeCompare(b.contentId)
    );
    cues.sort((a, b) => a.contentId.localeCompare(b.contentId));

    out[family] = { family, films, cues };
  }
  return out;
}

function stageRank(stage: string | null): number {
  const i = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return i === -1 ? STAGE_ORDER.length : i;
}

/**
 * Which of these has this advisor FINISHED.
 *
 * completed_at, not the row: record_watch_progress (0057) inserts one on the
 * first watch ping and never sets completed_at. The same predicate lib/loop.ts
 * and advance_focus_family use — they have to agree, or the card would show a
 * film as done that the loop is about to serve.
 */
async function completedIds(
  client: Client,
  userId: string,
  ids: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const { data } = await client
      .from("content_progress")
      .select("content_id")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .in("content_id", ids.slice(i, i + ID_BATCH));
    for (const r of (data ?? []) as { content_id: string }[]) out.add(r.content_id);
  }
  return out;
}

/* ---------------------------------------------------------------------------
   THE CARD
--------------------------------------------------------------------------- */

export type FocusFamilyCard = {
  family: string;
  /** How it was chosen — a derivation, a manager's ruling, or a default. */
  source: "derived" | "manager" | "default";
  total: number;
  completed: number;
  /** The next film in deck order, or null when the shelf is finished. */
  nextId: string | null;
};

/**
 * "Belts & Cooling · 3 of 7 · continue".
 *
 * ---------------------------------------------------------------------------
 * IT READS THE ASSIGNMENT, IT DOES NOT DERIVE ONE
 * ---------------------------------------------------------------------------
 * advance_focus_family() ends an exhausted cycle and derives the next. Calling
 * it from a CARD would mean rendering the numbers screen moves an advisor onto
 * a new family — a read with a side effect, fired by a page load, on a screen
 * that is not the ritual. The loop owns that transition; the card reports it.
 *
 * So a finished shelf shows "7 of 7" and no continue, until tomorrow's morning
 * moves them on. That is the honest state and it is also the truthful one: they
 * have not been moved yet.
 *
 * The count comes from advisor_family_film_progress (0125 §5), which is also
 * what the loop's ordering agrees with — so "continue" and tomorrow's pitch are
 * the same film by construction rather than by two functions being careful.
 */
export async function loadFocusFamilyCard(
  client: Client,
  service: ServiceClient,
  userId: string
): Promise<FocusFamilyCard | null> {
  /* The advisor's own client: 0123 gives them a self-read policy on this. */
  const { data: rows } = await client
    .from("advisor_focus_family")
    .select("family, source")
    .eq("user_id", userId)
    .is("ended_on", null)
    .limit(1);

  const assignment = (rows ?? [])[0] as
    | { family: string; source: FocusFamilyCard["source"] }
    | undefined;
  if (!assignment?.family) return null;

  /* Definer, granted to nobody — the service client is the only caller. */
  const { data: progress, error } = await service.rpc("advisor_family_film_progress", {
    _user: userId,
    _family: assignment.family,
  });
  if (error) return null;

  const p = (Array.isArray(progress) ? progress[0] : progress) as
    | { total: number; completed: number; next_id: string | null }
    | null
    | undefined;
  /*
   * A SETOF function returns [] when it matches nothing, and this one always
   * matches — the aggregates are scalar subqueries, so a family with no films
   * still yields one row of zeros. `p == null` therefore means the call itself
   * failed, not that the family is empty.
   */
  if (!p) return null;

  const total = Number(p.total ?? 0);
  /*
   * NO FILMS AT ALL MEANS NO CARD. "Belts & Cooling · 0 of 0" is not progress,
   * it is a content gap wearing a progress bar — and the advisor cannot act on
   * it. The assignment still exists and the loop still reports a two-slot
   * morning, which is where that fact belongs.
   */
  if (total === 0) return null;

  return {
    family: assignment.family,
    source: assignment.source,
    total,
    completed: Number(p.completed ?? 0),
    nextId: (p.next_id as string | null) ?? null,
  };
}
