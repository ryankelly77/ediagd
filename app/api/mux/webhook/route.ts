/* ============================================================================
   EDIAGD — Mux webhook

   Where an upload becomes a video the app can play. Mux calls this when an
   asset finishes transcoding; this promotes the admin's held tagging into a
   real content row.

   ---------------------------------------------------------------------------
   THE SIGNATURE CHECK IS THE WHOLE SECURITY MODEL
   ---------------------------------------------------------------------------
   This endpoint is public — it must be, Mux calls it — and it writes published
   content. Without verification, anyone who learned the URL could post
   `video.asset.ready` and put a row in the library.

   So: no secret, no service. The handler refuses everything when
   MUX_WEBHOOK_SECRET is unset rather than falling back to trusting the body,
   because an unauthenticated write path that works is far worse than one that
   is visibly broken.

   ---------------------------------------------------------------------------
   IDEMPOTENT
   ---------------------------------------------------------------------------
   Mux retries on any non-2xx, and will happily deliver the same event twice.
   Every write is keyed on upload_id or asset_id and does nothing the second
   time. A duplicate delivery must not produce a duplicate video in the library.
   ============================================================================ */

import { NextRequest } from "next/server";
import Mux from "@mux/mux-node";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) {
    // Visibly broken beats silently trusting. 503, so Mux retries once the
    // secret is configured rather than dropping the event.
    return Response.json(
      { error: "MUX_WEBHOOK_SECRET is not set; refusing to trust this call." },
      { status: 503 }
    );
  }

  const raw = await req.text();

  /*
   * unwrap() verifies the signature AND parses in one step — it throws if the
   * body was not signed with our secret. Doing both together is what stops a
   * later refactor from parsing first and verifying second, which is the shape
   * this class of bug always takes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: { type: string; data: Record<string, any> };
  try {
    const mux = new Mux({ tokenId: "unused", tokenSecret: "unused" });
    event = (await mux.webhooks.unwrap(
      raw,
      Object.fromEntries(req.headers),
      secret
    )) as unknown as typeof event;
  } catch {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  const service = createServiceClient();

  /* ---- the asset exists, but may not be playable yet -------------------- */
  if (event.type === "video.asset.created") {
    const uploadId = event.data.upload_id as string | undefined;
    if (uploadId) {
      await service
        .from("mux_upload")
        .update({ asset_id: event.data.id, status: "asset_created" })
        .eq("upload_id", uploadId)
        .eq("status", "waiting"); // idempotent: only moves forward
    }
    return Response.json({ ok: true });
  }

  /* ---- ready: this is the one that creates content ---------------------- */
  if (event.type === "video.asset.ready") {
    const assetId = event.data.id as string;

    const { data: upload } = await service
      .from("mux_upload")
      .select("id, draft, content_id, status")
      .eq("asset_id", assetId)
      .maybeSingle();

    // Not ours, or already promoted. Either way there is nothing to do, and
    // saying so with a 200 stops Mux retrying forever.
    if (!upload || upload.content_id) return Response.json({ ok: true });

    const signed = (event.data.playback_ids ?? []).find(
      (p: { policy: string }) => p.policy === "signed"
    );
    if (!signed) {
      await service
        .from("mux_upload")
        .update({
          status: "errored",
          error_message:
            "Asset is ready but carries no SIGNED playback id. It was created " +
            "outside this pipeline, or the policy was overridden.",
        })
        .eq("id", upload.id);
      return Response.json({ ok: true });
    }

    const draft = (upload.draft ?? {}) as Record<string, unknown>;
    const hasCaptions = (event.data.tracks ?? []).some(
      (t: { type: string; status?: string }) => t.type === "text" && t.status === "ready"
    );

    const { data: content } = await service
      .from("content")
      .insert({
        type: (draft.type as string) ?? "advisor_video",
        title: (draft.title as string) ?? "Untitled video",
        body: (draft.body as string) ?? null,
        collection: (draft.collection as string) ?? null,
        voice: (draft.voice as string) ?? null,
        version: (draft.version as number) ?? 1,
        format: "video",
        source_filename: (draft.source_filename as string) ?? null,
        canonical_filename: (draft.canonical_filename as string) ?? null,
        placement: (draft.placement as string) ?? null,
        service_family: (draft.service_family as string) ?? null,
        subcategory: (draft.subcategory as string) ?? null,
        mux_asset_id: assetId,
        mux_playback_id: signed.id,
        mux_playback_policy: "signed",
        duration_sec: event.data.duration ? Math.round(event.data.duration) : null,
        aspect_ratio: event.data.aspect_ratio ?? null,
        captions_ready: hasCaptions,
        // DRAFT, not published. A machine decides a video exists; a person
        // decides it is ready to be seen.
        status: "draft",
        /*
         * Queue the 9:16 derivation. This is the most a serverless function can
         * honestly do: cropping needs ffmpeg and hundreds of megabytes of temp
         * space, neither of which exists here. scripts/derive-vertical.ts is the
         * worker that drains this — until it runs on a schedule, "automatic"
         * means "automatic once somebody runs it".
         */
        orientation: "landscape",
        vertical_status: "pending",
        source: "Mux — uploaded through the admin pipeline",
      })
      .select("id")
      .maybeSingle();

    await service
      .from("mux_upload")
      .update({
        status: "ready",
        playback_id: signed.id,
        content_id: content?.id ?? null,
      })
      .eq("id", upload.id);

    return Response.json({ ok: true, contentId: content?.id ?? null });
  }

  /* ---- failures, recorded rather than swallowed ------------------------- */
  if (event.type === "video.asset.errored" || event.type === "video.upload.errored") {
    await service
      .from("mux_upload")
      .update({
        status: "errored",
        error_message:
          (event.data.errors?.messages ?? []).join("; ") || "Mux reported an error.",
      })
      .or(`asset_id.eq.${event.data.id},upload_id.eq.${event.data.id}`);
    return Response.json({ ok: true });
  }

  // Everything else is acknowledged and ignored — Mux sends a lot of events,
  // and 200 stops it retrying ones we do not care about.
  return Response.json({ ok: true, ignored: event.type });
}
