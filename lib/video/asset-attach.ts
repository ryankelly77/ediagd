/* ============================================================================
   EDIAGD — attaching a finished asset to a row that already exists

   The Manager Meetings library arrives the other way round from every other
   track. `npm run load:manager-meetings` writes the row FIRST — title, body,
   the run sheet, `best_used_for`, `situation_tags`, `meeting_length` and the
   `classification_line` that is the meeting's identity (0183) — and the film
   turns up weeks later, when Mitch has filmed it. 213 rows were loaded on
   26 November; every one of them was `status='draft'` with `mux_asset_id` null.

   ---------------------------------------------------------------------------
   WHY THE INGEST COULD NOT DO THIS BEFORE, AND WHAT IT WOULD HAVE DONE INSTEAD
   ---------------------------------------------------------------------------
   The webhook's only move was INSERT. `mux_upload.draft` has no field for a
   classification line or a target row, so a batch of 125 films would have
   created 125 SECOND rows: the film on one, the teaching content on the other,
   nothing joining them. `/meetings` selects on `type = 'manager_video'` and
   `status`, so once published each meeting would have appeared twice, one of
   the two an empty shell with a player and no run sheet.

   Nothing would have errored. That is the shape this codebase keeps paying for.

   ---------------------------------------------------------------------------
   THE PASSTHROUGH IS THE SIGNAL, AND IT RIDES ON THE ASSET
   ---------------------------------------------------------------------------
   Mux carries `passthrough` from `new_asset_settings` onto the asset and back
   out on every webhook event about it. So the ingest states its intention at
   the moment it creates the upload, and the intention arrives with the asset
   that fulfils it — no second lookup, no join on a name somebody derived.

   That matters here specifically. The alternative was to key on
   `canonical_filename`, and `trim-slates.ts` already paid for that: it joined
   on a name the ingest INVENTS and matched 0 of 73 where the observed name
   matched 73 of 73. A passthrough is neither derived nor re-formatted — it is
   the id, carried by the thing it is about.

   ---------------------------------------------------------------------------
   PURE ON PURPOSE
   ---------------------------------------------------------------------------
   No database, no network. The caller reads the row and hands in what it found,
   which is what lets `npm run test:asset-attach` cover all three arms —
   attach, refuse-already-attached, and the legacy insert — with no stack
   running. Same reasoning as lib/video/manager-slate.ts.
============================================================================ */

import { isUuid } from "@/lib/events/kinds";

/** What the ingest writes into `new_asset_settings.passthrough`. */
export type AttachIntent = { content_id: string };

/**
 * What the webhook should do with a ready asset.
 *
 * `noop` and `refuse` are deliberately different outcomes for the same column
 * being non-null. A redelivery of the SAME asset is Mux being Mux — it retries,
 * and the webhook has always been idempotent. A DIFFERENT asset on the row is a
 * person or a script about to overwrite a film that is already there, and the
 * two must not be reported in the same voice.
 */
export type AttachDecision =
  /** No intent on the asset — the pre-existing path, unchanged. */
  | { mode: "insert" }
  /** The row is named, exists, and is empty. Fill it in. */
  | { mode: "attach"; contentId: string }
  /** Already carries this exact asset. Mux redelivered; do nothing, quietly. */
  | { mode: "noop"; contentId: string; reason: string }
  /** Named a row that cannot be filled. Do not touch it, and say so loudly. */
  | { mode: "refuse"; contentId: string | null; reason: string };

/**
 * Read the intent off an asset's passthrough, or null if there isn't one.
 *
 * TOLERANT ABOUT SHAPE, STRICT ABOUT CLAIMING. Assets reach this webhook from
 * three places that are not the ingest — the admin uploader, `clipAsset`, and
 * the 9:16 derive — and none of them sets a passthrough. A fourth could one day
 * set one for its own reasons. So anything that is not recognisably
 * `{"content_id": "<uuid>"}` returns null and takes the legacy path, rather
 * than being half-understood.
 *
 * THE UUID SHAPE IS CHECKED WITH isUuid AND NOT WITH A VERSION-TAGGED PATTERN.
 * Ids in this database are not all RFC-4122 — `318b0b2d-f70d-e8da-8837-…` has
 * `e` where a version should be — and the textbook regex refused a good id once
 * already. One definition, imported.
 */
export function readAttachIntent(passthrough: unknown): AttachIntent | null {
  if (typeof passthrough !== "string" || !passthrough.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(passthrough);
  } catch {
    /* A bare id is not accepted. It would mean guessing that an arbitrary
       string on somebody else's asset was meant for us, and the whole point of
       the JSON envelope is that the claim is explicit. */
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const id = (parsed as Record<string, unknown>).content_id;
  return isUuid(id) ? { content_id: id } : null;
}

/**
 * The decision, given the intent and the row as the caller found it.
 *
 * `row` is null when the passthrough named an id that is not in `content`.
 * That is NOT treated as "insert instead": inserting would create exactly the
 * orphan shell this whole mechanism exists to prevent, and it would do it
 * silently. A named row that is missing is a refusal.
 */
export function decideAttach(input: {
  passthrough: unknown;
  assetId: string;
  row: { id: string; mux_asset_id: string | null } | null;
}): AttachDecision {
  const intent = readAttachIntent(input.passthrough);
  if (!intent) return { mode: "insert" };

  if (!input.row) {
    return {
      mode: "refuse",
      contentId: intent.content_id,
      reason:
        `passthrough named content ${intent.content_id}, which is not in ` +
        `content. Refusing to insert a row instead — that would create an ` +
        `orphan with a film and no teaching content.`,
    };
  }

  if (input.row.mux_asset_id === input.assetId) {
    return {
      mode: "noop",
      contentId: input.row.id,
      reason: "already carries this asset — a Mux redelivery",
    };
  }

  if (input.row.mux_asset_id) {
    return {
      mode: "refuse",
      contentId: input.row.id,
      reason:
        `content ${input.row.id} already has asset ${input.row.mux_asset_id}; ` +
        `the ready asset is ${input.assetId}. Not overwriting a film that is ` +
        `already attached — HOLD for a person. A reshoot goes through ` +
        `replace:video, which archives the take it replaces.`,
    };
  }

  return { mode: "attach", contentId: input.row.id };
}

/**
 * The columns an attach writes, and deliberately ONLY these.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE IS THE POINT
 * ---------------------------------------------------------------------------
 * No title, no body, no collection, no placement, no type, no
 * classification_line, no meeting_length, no situation_tags, no
 * best_used_for. The loader wrote those from Mitch's workbook and they are the
 * reason the row exists; an attach that "helpfully" refreshed them from the
 * filename would overwrite a curated run sheet with a video file's name.
 *
 * `status` is absent for the same reason it is 'draft' on the insert path: a
 * machine decides a video exists, a person decides it is ready to be seen.
 *
 * Built as a function of the asset rather than spread at the call site, so the
 * insert path and the attach path cannot drift about what a ready asset means.
 */
export function attachColumns(
  asset: {
    assetId: string;
    playbackId: string;
    durationSec: number | null;
    aspectRatio: string | null;
    hasCaptions: boolean;
  },
  /**
   * What file this came from, out of the upload's draft.
   *
   * ---------------------------------------------------------------------------
   * THESE THREE ARE WHY A RE-RUN DOES NOT UPLOAD THE FILM TWICE
   * ---------------------------------------------------------------------------
   * `ingest-videos.ts` decides what is already done by reading `content` for
   * rows that have BOTH `mux_asset_id` and `canonical_filename`. An attach that
   * wrote the asset and left the filename null would be invisible to that
   * check, so the next run would upload the same master again — and the attach
   * would then correctly refuse, reporting a hold on a film that is perfectly
   * fine. A confusing hold is still a wrong answer.
   *
   * All three are NULL on a loaded row, so nothing the loader wrote is
   * overwritten. They are facts about the FILE, which the loader never had.
   */
  provenance?: {
    sourceFilename?: string | null;
    canonicalFilename?: string | null;
    voice?: string | null;
  }
) {
  return {
    mux_asset_id: asset.assetId,
    mux_playback_id: asset.playbackId,
    mux_playback_policy: "signed" as const,
    duration_sec: asset.durationSec,
    aspect_ratio: asset.aspectRatio,
    captions_ready: asset.hasCaptions,
    format: "video" as const,
    orientation: "landscape" as const,
    /* Queue the 9:16, same as the insert path. The derive cron drains it. */
    vertical_status: "pending" as const,
    /* Spread conditionally: an absent draft must not write nulls over a row
       that already carries these from somewhere else. */
    ...(provenance?.sourceFilename ? { source_filename: provenance.sourceFilename } : {}),
    ...(provenance?.canonicalFilename
      ? { canonical_filename: provenance.canonicalFilename }
      : {}),
    ...(provenance?.voice ? { voice: provenance.voice } : {}),
  };
}
