import "server-only";

/* ============================================================================
   EDIAGD — direct uploads

   The point of this file: after it exists, nobody types an asset id by hand
   again. The two videos seeded in 0057 were the last.

   ---------------------------------------------------------------------------
   THE DEFAULTS ARE THE WHOLE FEATURE
   ---------------------------------------------------------------------------
   Every upload gets signed playback, English captions and normalised audio,
   set HERE, once. The failure this prevents is mundane and expensive: seven
   hundred videos uploaded over months, and somewhere in the middle somebody
   forgets to tick "signed" in the dashboard, and one asset is public forever
   with no way to tell by looking.

   Normalised audio matters more than it sounds. These are talking-head clips
   filmed in different rooms on different phones over a year; without loudness
   normalisation an advisor doing three minutes a day gets a volume jump every
   morning and learns to keep the phone muted.

   ---------------------------------------------------------------------------
   THE CONTENT ROW IS CREATED WHEN THE ASSET IS READY, NOT BEFORE
   ---------------------------------------------------------------------------
   An upload exists before an asset does, and an asset exists before it can
   play. Writing a content row at upload time would put rows in the library that
   render a player which cannot play — the exact "a fake player reads as a lie"
   failure the rest of this codebase avoids. So the admin's tagging is held in
   mux_upload.draft as jsonb, and the webhook promotes it to a real content row
   the moment Mux says the asset is ready.
   ============================================================================ */

import { muxClient } from "@/lib/mux/playback";

export type UploadDraft = {
  title: string;
  series?: string | null;
  placement?: "daily_lifestyle" | "daily_pitch" | "onboarding_intro" | null;
  service_family?: string | null;
  subcategory?: string | null;
  type?: "advisor_video" | "manager_video" | "joe_the_pro";
  body?: string | null;
};

/**
 * Ask Mux for a one-time upload URL.
 *
 * CORS ORIGIN IS THE APP, NOT '*'. The browser PUTs the file straight to Mux,
 * so the origin has to be named; leaving it open would let any page that
 * learned a URL upload into this account.
 */
export async function createDirectUpload(origin: string) {
  const mux = muxClient();

  const upload = await mux.video.uploads.create({
    cors_origin: origin,
    new_asset_settings: {
      // Signed, always. See the note above — this is the line that matters.
      playback_policies: ["signed"],
      /*
       * PREMIUM, AND ONLY FOR MASTERS. video_quality caps what Mux keeps:
       * "basic" tops out at the 1080p tier, so a 4K upload is stored as UHD but
       * read back — including through master access — at about 2K. That was
       * measured, not assumed: a 3840x2160 master ingested as basic came back
       * 2048x1152, which turns the 9:16 slice from 1215px into 648px and forces
       * a 1.67x upscale. It defeats the entire reason for shooting 4K.
       *
       * Derived VERTICALS stay basic on purpose — they are 1080x1920, inside
       * the basic tier already, and premium would cost more for nothing.
       */
      video_quality: "premium",
      max_resolution_tier: "2160p",
      // Captions, generated on ingest. Accessibility, and an advisor on a
      // service drive often has the sound off.
      inputs: [
        {
          generated_subtitles: [{ language_code: "en", name: "English (auto)" }],
        },
      ],
      // One loudness target across a year of clips filmed in different rooms.
      normalize_audio: true,
    },
  });

  return { uploadId: upload.id, url: upload.url };
}

/** Poll fallback for when a webhook is missed. Not the primary path. */
export async function fetchAsset(assetId: string) {
  const mux = muxClient();
  const asset = await mux.video.assets.retrieve(assetId);
  const signed = asset.playback_ids?.find((p) => p.policy === "signed");
  return {
    status: asset.status,
    playbackId: signed?.id ?? null,
    durationSec: asset.duration ? Math.round(asset.duration) : null,
    aspectRatio: asset.aspect_ratio ?? null,
    hasCaptions: Boolean(
      asset.tracks?.some((t) => t.type === "text" && t.status === "ready")
    ),
  };
}

/**
 * Trim an existing asset without re-uploading it.
 *
 * Mux can clip from an asset already in the account — `mux://assets/{id}` as
 * the input — so cutting dead air off the front costs a new asset and nothing
 * else. No original file, no round trip through a laptop.
 *
 * A NEW ASSET, NOT AN EDIT. The source is left untouched, which matters: if a
 * trim is wrong, the fix is to clip again from the original rather than to
 * re-shoot. The caller decides whether to point content at the clip.
 *
 * CAPTIONS DO NOT CARRY OVER. Text tracks belong to the source asset, and the
 * timings would be a second out anyway after a trim. Generated subtitles are
 * requested again here so a clipped video is never quietly less accessible than
 * the thing it came from.
 */
export async function clipAsset(opts: {
  sourceAssetId: string;
  startTime: number;
  endTime?: number;
}) {
  const mux = muxClient();

  const asset = await mux.video.assets.create({
    /*
     * generated_subtitles goes ON the source input, not alongside it. As a
     * sibling entry Mux rejects the whole request with "invalid additional
     * input '' must be an overlay image, text track, or audio track" — the
     * standalone form is only valid for a direct upload, where the uploaded
     * file is the implicit first input.
     */
    inputs: [
      {
        url: `mux://assets/${opts.sourceAssetId}`,
        start_time: opts.startTime,
        ...(opts.endTime != null ? { end_time: opts.endTime } : {}),
        generated_subtitles: [{ language_code: "en", name: "English (auto)" }],
      },
    ],
    playback_policies: ["signed"],
    // A clip of a master is still a master — do not downgrade it on the way
    // through, or trimming a 4K video quietly costs you the 4K.
    video_quality: "premium",
    max_resolution_tier: "2160p",
    normalize_audio: true,
  });

  const signed = asset.playback_ids?.find((p) => p.policy === "signed");
  return { assetId: asset.id, playbackId: signed?.id ?? null, status: asset.status };
}
