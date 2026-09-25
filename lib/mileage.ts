import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { renditionsFor, type VideoRenditions } from "@/lib/mux/playback";

/**
 * ===========================================================================
 * THE MILEAGE SHELF
 * ===========================================================================
 *
 * Fourteen rungs of service-interval films. An advisor reads the rung matching
 * the car in front of them; the product does not and cannot know what that is —
 * the DMS feed is a monthly spreadsheet of aggregate attach rates, not a live
 * work-in-progress. It does not need to. The advisor wrote the mileage on the
 * repair order ninety seconds ago.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT READ
 * ---------------------------------------------------------------------------
 *
 * `content_progress`. Not once, anywhere in this file.
 *
 * That is not an omission to be tidied up later. A chart with a completion tick
 * on it is a fourth credential, and an advisor who has watched none of it is not
 * behind. The moment this file joins progress, somebody renders the join, and
 * then "0 of 51" sits on a reference shelf telling sixty advisors they are
 * failing at a lookup table.
 *
 * So the loader cannot report progress even if a component asked, because the
 * data never arrives. That is a stronger guarantee than a convention.
 *
 * ---------------------------------------------------------------------------
 * THE RUNGS ARE DISCOVERED, NOT DECLARED
 * ---------------------------------------------------------------------------
 *
 * There is no hardcoded list of fourteen numbers. The rungs are whatever
 * `mileage_rung` values exist on published reference rows, ordered numerically.
 * A fifteenth rung is then a film Mitch shoots, not a deploy — and the shelf
 * cannot claim a rung it has no film for, which is the failure mode of a
 * declared list.
 *
 * ---------------------------------------------------------------------------
 * REFERENCE IS READ HERE AND SERVED NOWHERE
 * ---------------------------------------------------------------------------
 *
 * Every query filters `placement = 'reference'` — positively, as an allow-list,
 * rather than excluding loop placements. If a menu film were mis-placed as
 * `daily_pitch` it would vanish from this shelf rather than silently appear in
 * both, and a missing film on a chart is a visible bug where a reference film in
 * a morning is an invisible one. 0128 keeps it out of the loop; this keeps the
 * loop out of it.
 */

/** A rung, and how many films sit on it. A count is information, not progress. */
export type MileageRung = {
  miles: number;
  /** "10,000" — formatted once, here, so every surface says it the same way. */
  label: string;
  filmCount: number;
};

export type MileageFilm = {
  contentId: string;
  title: string;
  durationSec: number | null;
  renditions: VideoRenditions;
};

/** Reference material, and nothing else, ever. */
const REFERENCE = "reference";

export const formatMiles = (miles: number) => miles.toLocaleString("en-US");

/**
 * Every rung that has at least one playable film, ascending.
 *
 * Ordered in SQL by `mileage_rung` so paging cannot reorder it — this project
 * has already shipped one unstable-paging bug from a `.range()` without an
 * `.order()`, and it reported a different count on every run.
 */
export async function loadMileageRungs(client: SupabaseClient): Promise<MileageRung[]> {
  const { data, error } = await client
    .from("content")
    .select("mileage_rung")
    .eq("type", "advisor_video")
    .eq("placement", REFERENCE)
    .eq("status", "published")
    .is("retired_at", null)
    .not("mileage_rung", "is", null)
    .not("mux_playback_id", "is", null)
    .order("mileage_rung", { ascending: true });

  /*
   * THROW RATHER THAN `?? []`. An empty shelf and a failed read look identical
   * to a component, and "no rungs yet" is a sentence this screen would say in
   * perfect confidence while the real answer was a permissions error. The same
   * swallow is why a check once passed while watching nothing.
   */
  if (error) throw new Error(`loadMileageRungs: ${error.message}`);

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    const m = Number((row as { mileage_rung: number }).mileage_rung);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([miles, filmCount]) => ({ miles, label: formatMiles(miles), filmCount }));
}

/**
 * One rung's films, title order.
 *
 * Title order and not `content_id` order: the deck-order bug in
 * lib/service-family.ts tie-breaks on a UUID, which put "Part 2" ahead of
 * "Part 1" in four of six multi-part groups in production. A chart has no
 * curriculum sequence to get wrong, but it should still read in a stable,
 * human order rather than a random one, and the title is the only field that
 * carries "Part 1" at all.
 */
export async function loadMileageFilms(
  client: SupabaseClient,
  miles: number
): Promise<MileageFilm[]> {
  const { data, error } = await client
    .from("content")
    .select(
      "id, title, duration_sec, mux_playback_id, mux_playback_policy, " +
        "vertical_playback_id, vertical_status"
    )
    .eq("type", "advisor_video")
    .eq("placement", REFERENCE)
    .eq("status", "published")
    .is("retired_at", null)
    .eq("mileage_rung", miles)
    .not("mux_playback_id", "is", null)
    .order("title", { ascending: true });

  if (error) throw new Error(`loadMileageFilms(${miles}): ${error.message}`);

  const out: MileageFilm[] = [];
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const renditions = await renditionsFor({
      mux_playback_id: row.mux_playback_id as string | null,
      mux_playback_policy: row.mux_playback_policy as string | null,
      vertical_playback_id: row.vertical_playback_id as string | null,
      vertical_status: row.vertical_status as string | null,
    });
    if (!renditions) continue; // a film that cannot be played is not offered
    out.push({
      contentId: String(row.id),
      title: String(row.title ?? ""),
      durationSec: row.duration_sec == null ? null : Number(row.duration_sec),
      renditions,
    });
  }
  return out;
}
