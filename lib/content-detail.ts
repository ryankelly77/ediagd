import "server-only";

/* ============================================================================
   EDIAGD — everything the content detail screen shows

   SERVER ONLY. It mints a signed Mux token, which is the authorisation itself
   and must never reach a client bundle.

   One loader rather than a component tree that each fetch their own slice: the
   screen shows one artifact and needs eight facts about it, and eight
   independent round trips from eight components is how a detail page ends up
   slower than the list it came from.
   ============================================================================ */

import { playbackFor } from "@/lib/mux/playback";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (t: string) => any };

export type OpCode = {
  code: string;
  category: string;
  name: string;
  sort_order: number;
};

export type VersionRow = {
  version: number;
  mux_playback_id: string | null;
  source_filename: string | null;
  created_at: string;
  superseded_at: string | null;
};

/**
 * A previous set of words, written by the 0083 trigger.
 *
 * Distinct from VersionRow above, which is a video TAKE — Mux ids and the file
 * they came from. These two histories answer different questions and are kept
 * apart on the screen for the same reason: "which cut of the film is live" and
 * "what did this used to say" are not the same question.
 */
export type TextVersionRow = {
  seq: number;
  title: string | null;
  body: string | null;
  detail: string | null;
  title_changed: boolean;
  body_changed: boolean;
  detail_changed: boolean;
  changed_at: string;
};

export type LinkedFormat = {
  id: string;
  title: string;
  format: string | null;
  status: string;
};

export type StructureFacts = {
  /** Derived, not stored: the daily loop only draws published, unretired rows. */
  dailyLoopEligible: boolean;
  dailyLoopReason: string;
  module: { id: string; name: string; course: string; track: string } | null;
  onboardingPosition: string | null;
  saveCount: number;
  lastServed: string | null;
};

export type MuxFacts = {
  assetId: string | null;
  playbackId: string | null;
  verticalAssetId: string | null;
  verticalPlaybackId: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  quality: string | null;
  /** Null when MUX_DASHBOARD_ENV is unset — then the ids are copy-only. */
  dashboardBase: string | null;
  /** Signed, short-lived, minted per view. */
  token: string | null;
  thumbnailToken: string | null;
  verticalToken: string | null;
};

/**
 * The daily loop's own rule, evaluated here so the screen can explain itself.
 *
 * Deliberately mirrors pickLifestyleVideo rather than guessing: published, not
 * retired, has a playback id, and sits in a collection the loop draws from.
 */
const LOOP_COLLECTIONS = ["Mindset", "Craft", "Pitches by Op Code"];

function loopEligibility(row: Record<string, unknown>): {
  ok: boolean;
  reason: string;
} {
  if (row.retired_at) return { ok: false, reason: "Retired" };
  if (row.status !== "published") return { ok: false, reason: "Not published" };
  if (row.format !== "video") return { ok: false, reason: "Not a video" };
  if (!row.mux_playback_id) return { ok: false, reason: "No playable asset" };
  const c = row.collection as string | null;
  if (!c || !LOOP_COLLECTIONS.includes(c)) {
    return { ok: false, reason: `${c ?? "No collection"} is not a daily-loop collection` };
  }
  if (row.placement !== "daily_lifestyle") {
    return { ok: false, reason: `Placement is ${row.placement ?? "unset"}` };
  }
  return { ok: true, reason: "In the daily loop's lifestyle rotation" };
}

export async function loadContentDetail(client: Client, id: string) {
  const { data: row } = await client.from("content").select("*").eq("id", id).maybeSingle();
  if (!row) return null;

  const [
    { data: voiceRows },
    { data: opCodes },
    { data: versions },
    { data: textVersions },
    { data: saves },
    { data: served },
  ] = await Promise.all([
    // The autocomplete source. Distinct is done here rather than in SQL because
    // PostgREST has no DISTINCT — 2,190 single-column rows is cheap.
    client.from("content").select("voice").not("voice", "is", null).limit(3000),
    client.from("op_code_catalog").select("code, category, name, sort_order").order("sort_order"),
    client
      .from("content_version")
      .select("version, mux_playback_id, source_filename, created_at, superseded_at")
      .eq("content_id", id)
      .order("version", { ascending: false }),
    client
      .from("content_text_version")
      .select("seq, title, body, detail, title_changed, body_changed, detail_changed, changed_at")
      .eq("content_id", id)
      .order("seq", { ascending: false }),
    client.from("saved_content").select("id", { count: "exact", head: true }).eq("content_id", id),
    client
      .from("daily_completion")
      .select("completion_date")
      .eq("video_content_id", id)
      .order("completion_date", { ascending: false })
      .limit(1),
  ]);

  /* ---- Linked formats -----------------------------------------------------
   * Two directions: the row this one points at, and the rows pointing at it.
   * A quote that is the primary has no artifact_id and finds its video in the
   * second query; the video finds its quote in the first. */
  const linked: LinkedFormat[] = [];
  if (row.artifact_id) {
    const { data } = await client
      .from("content")
      .select("id, title, format, status")
      .eq("id", row.artifact_id)
      .maybeSingle();
    if (data) linked.push(data as LinkedFormat);
  }
  const { data: children } = await client
    .from("content")
    .select("id, title, format, status")
    .eq("artifact_id", id);
  linked.push(...((children ?? []) as LinkedFormat[]));

  /* ---- Where it sits ------------------------------------------------------ */
  let mod: StructureFacts["module"] = null;
  if (row.module_id) {
    const { data: m } = await client
      .from("module")
      .select("id, name, course:course_id(name, track)")
      .eq("id", row.module_id)
      .maybeSingle();
    if (m) {
      const c = (Array.isArray(m.course) ? m.course[0] : m.course) as
        | { name: string; track: string }
        | null;
      mod = { id: m.id, name: m.name, course: c?.name ?? "—", track: c?.track ?? "—" };
    }
  }

  const eligibility = loopEligibility(row);

  /* ---- Mux ----------------------------------------------------------------
   * Tokens are minted per view and never cached across users — the token IS
   * the authorisation. Three audiences, because Mux scopes them separately. */
  let mux: MuxFacts = {
    assetId: row.mux_asset_id ?? null,
    playbackId: row.mux_playback_id ?? null,
    verticalAssetId: row.vertical_asset_id ?? null,
    verticalPlaybackId: row.vertical_playback_id ?? null,
    durationSec: row.duration_sec ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    quality: row.mux_playback_policy ? "signed" : null,
    // Optional: without it the ids are still shown and copyable, just not
    // hyperlinked. Better than a link that 404s into somebody else's org.
    dashboardBase: process.env.MUX_DASHBOARD_ENV
      ? `https://dashboard.mux.com/environments/${process.env.MUX_DASHBOARD_ENV}/assets`
      : null,
    token: null,
    thumbnailToken: null,
    verticalToken: null,
  };

  if (row.mux_playback_id) {
    const t = await playbackFor(row);
    if (t) {
      mux = { ...mux, token: t.token, thumbnailToken: t.thumbnailToken };
    }
  }
  if (row.vertical_playback_id && row.vertical_status === "ready") {
    const vt = await playbackFor({
      mux_playback_id: row.vertical_playback_id,
      mux_playback_policy: "signed",
    });
    if (vt) mux = { ...mux, verticalToken: vt.thumbnailToken };
  }

  const voices = [
    ...new Set(((voiceRows ?? []) as { voice: string }[]).map((v) => v.voice)),
  ].sort();

  return {
    row,
    voices,
    opCodes: (opCodes ?? []) as OpCode[],
    versions: (versions ?? []) as VersionRow[],
    textVersions: (textVersions ?? []) as TextVersionRow[],
    linked,
    mux,
    structure: {
      dailyLoopEligible: eligibility.ok,
      dailyLoopReason: eligibility.reason,
      module: mod,
      /*
       * Says plainly that it is stored and waiting rather than implying a
       * position in a sequence that does not exist. `onboarding_intro` is
       * written correctly by ingest and consumed by nothing — the onboarding
       * sequence is built in the onboarding polish task, not here.
       */
      onboardingPosition:
        row.placement === "onboarding_intro"
          ? "Onboarding — sequence not built yet"
          : null,
      saveCount: saves?.length ?? (saves as unknown as { count?: number })?.count ?? 0,
      lastServed: (served?.[0]?.completion_date as string) ?? null,
    } as StructureFacts,
  };
}
