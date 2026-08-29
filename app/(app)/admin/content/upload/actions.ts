"use server";

/* ============================================================================
   EDIAGD — upload server actions

   Server Functions are reachable by direct POST, not just through our UI, so
   each of these re-checks admin rather than trusting the page that rendered the
   form. RLS on mux_upload is the second line of defence.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createDirectUpload, type UploadDraft } from "@/lib/mux/upload";
import { fetchAsset } from "@/lib/mux/upload";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: rows } = await supabase
    .from("membership")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);

  const isAdmin = (rows ?? []).some((r) => r.role === "admin");
  const { data: me } = await supabase
    .from("app_user")
    .select("is_platform_owner")
    .eq("id", user.id)
    .maybeSingle();

  if (!isAdmin && !me?.is_platform_owner) throw new Error("Admins only.");
  return user.id;
}

/**
 * Mint a one-time upload URL and hold the tagging until the asset is ready.
 *
 * The draft is stored NOW and used LATER by the webhook, so an admin can tag a
 * video, close the laptop, and the row still lands correctly tagged when
 * transcoding finishes ten minutes later.
 */
export async function startUpload(draft: UploadDraft, origin: string) {
  const userId = await requireAdmin();

  if (!draft.title?.trim()) {
    return { ok: false as const, error: "Give it a title first." };
  }

  const { uploadId, url } = await createDirectUpload(origin);

  const service = createServiceClient();
  const { error } = await service.from("mux_upload").insert({
    upload_id: uploadId,
    draft,
    created_by: userId,
    status: "waiting",
  });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/content/upload");
  return { ok: true as const, uploadId, url };
}

/**
 * Ask Mux directly what happened to an asset.
 *
 * THE WEBHOOK IS THE PRIMARY PATH; this is the fallback for when one is missed
 * — a deploy mid-transcode, a secret rotated, a Mux retry that expired. Without
 * it a missed webhook means an upload stuck on "processing" forever with no way
 * to recover except SQL.
 */
export async function reconcileUpload(uploadId: string) {
  await requireAdmin();
  const service = createServiceClient();

  const { data: row } = await service
    .from("mux_upload")
    .select("id, asset_id, status, content_id")
    .eq("upload_id", uploadId)
    .maybeSingle();

  if (!row?.asset_id) return { ok: false as const, error: "No asset yet." };
  if (row.content_id) return { ok: true as const, status: "ready" };

  const asset = await fetchAsset(row.asset_id);
  if (asset.status !== "ready" || !asset.playbackId) {
    return { ok: true as const, status: asset.status };
  }

  await service
    .from("mux_upload")
    .update({ status: "ready", playback_id: asset.playbackId })
    .eq("id", row.id);

  revalidatePath("/admin/content/upload");
  return { ok: true as const, status: "ready" };
}
