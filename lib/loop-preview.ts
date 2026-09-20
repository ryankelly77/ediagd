/* ============================================================================
   EDIAGD — the admin walkthrough of the daily loop
   SERVER ONLY. Admin-gated by the caller; this module never checks a role.

   ---------------------------------------------------------------------------
   WHY A PREVIEW NEEDS ITS OWN ASSEMBLER AT ALL
   ---------------------------------------------------------------------------
   /today?preview=1 walked the REAL morning and handed it a canned completion.
   That was right when every advisor's morning had the same shape. It stopped
   being right in 3b, because the shape is now derived from the viewer:

     the pitch slot needs `membership.op_code_id` -> a DMS book -> a ranked
     family with an unwatched film.

   An admin account has no operator id, so derive_focus_family honestly returns
   nothing and the admin is served a TWO-SLOT morning — every time, with no
   indication that anything is missing. The one screen the phase exists to show
   is the one the preview could never reach.

   So the preview assembles the real morning and then SUBSTITUTES what the
   viewer's own data cannot supply, per the shape being demonstrated.

   ---------------------------------------------------------------------------
   AND WHY EVERY SUBSTITUTION IS NAMED ON SCREEN
   ---------------------------------------------------------------------------
   lib/navigation.ts keeps these walkthroughs in their own section because they
   are "the one place an admin can see something that looks like a real result
   and isn't". A preview that quietly borrowed a film would be exactly that.

   Every borrowed piece is reported in `notes`, and the flow renders them above
   the ritual. The rule is simple: if this module substituted it, the screen
   says so.

   NO DAY IS WRITTEN. No completion row, no consumption, no pool cursor, no
   track entry, no module completion, no Sand Dollars, no streak — the caller
   short-circuits completeDayAction with a canned result, exactly as before.
   Verified by walking all three shapes against an account holding zero rows
   and re-counting every one of those tables afterwards.

   The one thing that IS written is a watch_gate row, if the admin actually
   opens a player and clears its bar. That is not an oversight and is not made
   preview-aware: they really did watch it, and the record is what stops the
   app asking them to watch it again today. The banner says "no day is saved"
   rather than "nothing" for exactly that reason.
   ============================================================================ */

import "server-only";
import {
  assembleMorning,
  type LoopMorning,
  type PitchSlot,
} from "@/lib/loop";
import { shapeVideo, type VideoRow } from "@/lib/daily";
import type { MorningKind } from "@/lib/gamification/dayGate";
import type { IsoDate } from "@/lib/gamification/streak";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any; rpc?: (fn: string, args?: any) => any };
type ServiceClient = { from: (table: string) => any; rpc: (fn: string, args?: any) => any };

/**
 * Which morning to demonstrate.
 *
 * The URL spellings are hyphenated because they are read by a human out of an
 * admin menu; the internal MorningKind is underscored because it is a column
 * value. Translated in one place rather than letting a URL dialect leak into
 * the schema.
 */
export type PreviewKind = "normal" | "two-slot" | "track-entry";

const URL_TO_KIND: Record<PreviewKind, MorningKind> = {
  normal: "normal",
  "two-slot": "two_slot",
  "track-entry": "track_entry",
};

/**
 * `?preview=` to a shape, or null when the flag is absent or unrecognised.
 *
 * `1` STAYS VALID. It is what the admin menu linked to before this existed and
 * what any bookmark still holds; it means the ordinary three-slot morning.
 * Silently dropping it would make an old link render a real, writable day.
 */
export function previewKindFrom(flag: string | undefined): PreviewKind | null {
  if (!flag) return null;
  if (flag === "1") return "normal";
  return (["normal", "two-slot", "track-entry"] as const).find((k) => k === flag) ?? null;
}

export type PreviewMorning = LoopMorning & {
  /**
   * What had to be substituted for this walkthrough, in plain words.
   *
   * Empty when the viewer's own data happened to supply everything — an admin
   * who also holds an advisor membership with a DMS book gets a genuine
   * morning and an empty list, and the banner then says exactly that.
   */
  notes: string[];
};

const FILM_COLUMNS =
  "id, title, collection, mux_playback_id, mux_playback_policy, " +
  "vertical_playback_id, vertical_status, artifact_id";

/**
 * Assemble the morning an admin asked to look at.
 *
 * Everything that works for any signed-in viewer is left REAL: the mindset
 * draw, the item, the closing quote. Only what depends on the viewer's own DMS
 * history or on a ruling Mitch has not made is substituted.
 */
export async function previewMorning(
  client: Client,
  service: ServiceClient,
  userId: string,
  rooftopId: string,
  today: IsoDate,
  kind: PreviewKind
): Promise<PreviewMorning> {
  const real = await assembleMorning(client, service, userId, rooftopId, today);
  const notes: string[] = [];
  const wanted = URL_TO_KIND[kind];

  if (wanted === "two_slot") {
    /*
     * The easy one: a two-slot morning is a normal one with the pitch removed,
     * and removing something needs no substitution. If the viewer had no pitch
     * anyway this is simply their real morning, and the note says so.
     */
    if (real.pitch) {
      notes.push(
        "The pitch slot is held back on purpose — this is the morning an advisor gets when their focus family has no film left."
      );
    }
    return { ...real, kind: "two_slot", pitch: null, notes };
  }

  if (wanted === "track_entry") {
    const entry = await previewTrackFilm(client, userId, today);
    if (!entry) {
      /*
       * NO FILM ANYWHERE, so there is no entry morning to show — and inventing
       * a card would be the placeholder ruling 2 refused. The walkthrough falls
       * back to the ordinary morning and says why, which is the honest answer
       * and also the one that tells the admin something true about the library.
       */
      notes.push(
        "No track-entry morning exists to show: no certification has an entry film, and there is no Craft film to stand in for one. This is the ordinary morning instead."
      );
      return { ...real, notes };
    }

    notes.push(entry.note);
    return {
      ...real,
      kind: "track_entry",
      pitch: null,
      item: null,
      track: {
        certificationId: entry.certificationId,
        name: entry.trackName,
        slug: entry.slug,
        entering: true,
        film: entry.film,
      },
      notes,
    };
  }

  /* ---- normal ----------------------------------------------------------- */
  if (real.pitch) return { ...real, kind: "normal", notes };

  /*
   * The viewer has no focus family — almost always because an admin account has
   * no operator id and so no DMS book. Borrow the deepest-stocked family so the
   * slot can be looked at.
   */
  const borrowed = await borrowPitch(client, service, userId, today);
  if (!borrowed) {
    notes.push(
      "No pitch film could be shown: no service family has a published, playable film. This is a two-slot morning."
    );
    return { ...real, kind: "two_slot", pitch: null, notes };
  }

  notes.push(
    `The pitch is borrowed from ${borrowed.family} — this account has no DMS history, so no focus family was derived for it. An advisor's own family is ranked by missed opportunity volume.`
  );
  return { ...real, kind: "normal", pitch: borrowed, notes };
}

/**
 * A film from the best-stocked family, for the pitch slot.
 *
 * DEEPEST SHELF, NOT A RANDOM ONE. The preview is there to show the slot
 * working; a family with two films looks the same on screen but is the case
 * where the cycle ends almost immediately, which is a different conversation.
 *
 * family_pitch_supply is read with the SERVICE client — it joins op_code_family,
 * which 0081 scoped to admins, and 0124 §5b revoked the `authenticated` grant
 * rather than pretend otherwise. The FILM is then read with the viewer's own
 * client, so a preview can never show something the viewer could not open.
 */
async function borrowPitch(
  client: Client,
  service: ServiceClient,
  userId: string,
  today: IsoDate
): Promise<PitchSlot | null> {
  const { data: supply } = await service
    .from("family_pitch_supply")
    .select("family, film_count")
    .order("film_count", { ascending: false })
    .limit(1);

  const top = (supply ?? [])[0] as { family: string; film_count: number } | undefined;
  if (!top) return null;

  const { data: codeRows } = await service
    .from("op_code_family")
    .select("code")
    .eq("family", top.family)
    .eq("coachable", true);
  const codes = (codeRows ?? []).map((r: { code: string }) => r.code);
  if (codes.length === 0) return null;

  const { data: films } = await client
    .from("content")
    .select(`${FILM_COLUMNS}, op_code, stage`)
    .eq("type", "advisor_video")
    .eq("status", "published")
    .is("retired_at", null)
    .in("op_code", codes)
    .not("mux_playback_id", "is", null)
    .order("op_code", { ascending: true })
    .limit(1);

  const row = (films ?? [])[0] as (VideoRow & { op_code: string; stage: string | null }) | undefined;
  if (!row) return null;

  const shaped = await shapeVideo(client, row, userId, today);
  if (!shaped) return null;

  return {
    ...shaped,
    family: top.family,
    opCode: row.op_code,
    stage: row.stage,
    /* First of the shelf, because a borrowed cycle has not started. */
    position: 1,
    total: Number(top.film_count),
  };
}

/**
 * The film that opens a track, for the entry-morning walkthrough.
 *
 * TWO SOURCES, IN ORDER, AND THE NOTE SAYS WHICH FIRED.
 *
 *   1  a real ruling — certification.entry_film_content_id. Null for all eight
 *      core tracks today, and the day Mitch sets one this branch starts firing
 *      on its own, in the preview and in the loop alike.
 *   2  a stand-in from the Craft shelf, clearly labelled. The alternative was
 *      to make the entry morning unpreviewable until a ruling lands, which
 *      would mean the one screen nobody can review is the one nobody has
 *      agreed to yet.
 *
 * The stand-in is a PREVIEW-ONLY substitution and writes nothing —
 * certification.entry_film_content_id is untouched, so the real loop still sees
 * null and still serves an ordinary morning. Ruling 2 is intact.
 */
async function previewTrackFilm(
  client: Client,
  userId: string,
  today: IsoDate
): Promise<{
  certificationId: string;
  trackName: string;
  slug: string;
  film: Awaited<ReturnType<typeof shapeVideo>>;
  note: string;
} | null> {
  const { data: certs } = await client
    .from("certification")
    .select("id, slug, name, entry_film_content_id")
    .eq("is_core", true)
    .order("sort", { ascending: true });

  const list = (certs ?? []) as {
    id: string;
    slug: string;
    name: string;
    entry_film_content_id: string | null;
  }[];
  if (list.length === 0) return null;

  const ruled = list.find((c) => c.entry_film_content_id);
  if (ruled) {
    const { data: row } = await client
      .from("content")
      .select(FILM_COLUMNS)
      .eq("id", ruled.entry_film_content_id)
      .eq("status", "published")
      .is("retired_at", null)
      .not("mux_playback_id", "is", null)
      .maybeSingle();

    const film = row ? await shapeVideo(client, row as VideoRow, userId, today) : null;
    if (film) {
      return {
        certificationId: ruled.id,
        trackName: ruled.name,
        slug: ruled.slug,
        film,
        note: `This is a real entry morning: ${ruled.name} has an entry film attached.`,
      };
    }
  }

  /* ---- the stand-in ----------------------------------------------------- */
  const { data: craft } = await client
    .from("content")
    .select(FILM_COLUMNS)
    .eq("type", "advisor_video")
    .eq("collection", "Craft")
    .eq("status", "published")
    .is("retired_at", null)
    .not("mux_playback_id", "is", null)
    .order("title", { ascending: true })
    .limit(1);

  const row = (craft ?? [])[0] as VideoRow | undefined;
  if (!row) return null;

  const film = await shapeVideo(client, row, userId, today);
  if (!film) return null;

  const target = list[0];
  return {
    certificationId: target.id,
    trackName: target.name,
    slug: target.slug,
    film,
    note:
      `STAND-IN FILM. No track has an entry film yet — which film opens which track is Mitch's ruling — ` +
      `so “${row.title}” is borrowed from the Craft shelf to show the shape. Nothing is attached to ${target.name}; ` +
      `the real loop still serves an ordinary morning and records the track entry anyway.`,
  };
}
