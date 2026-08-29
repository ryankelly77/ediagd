import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { listServiceNames } from "@/lib/content-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { VideoUploader } from "@/components/admin/content/VideoUploader";
import { muxConfigured } from "@/lib/mux/playback";

/* ============================================================================
   EDIAGD — upload a video

   The screen that replaces copying asset ids out of the Mux dashboard. Seven
   hundred videos are coming; this is the difference between that being a
   morning's work and a month's.
   ============================================================================ */

export default async function UploadPage() {
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  const services = await listServiceNames(supabase);

  /* In-flight and recent uploads, so a page reload after closing the laptop
     still shows what happened. */
  const { data: recent } = await supabase
    .from("mux_upload")
    .select("id, upload_id, status, error_message, content_id, draft, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto max-w-app px-4 py-6">
      <AdminPageHeader
        back={{ href: "/admin/content", label: "Content" }}
        title="Upload a video"
        subtitle="Tag it, drop it in. Signed playback and captions are automatic."
      />

      {!muxConfigured() ? (
        <div className="ediagd-card mt-4 p-5">
          <p className="text-base font-extrabold text-navy">Mux isn&apos;t configured</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_SIGNING_KEY_ID and
            MUX_SIGNING_KEY_PRIVATE need to be set before uploads can start.
          </p>
        </div>
      ) : (
        <VideoUploader families={services} />
      )}

      {(recent ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
            Recent uploads
          </h2>
          <ul className="mt-3 space-y-2">
            {(recent ?? []).map((u) => {
              const draft = (u.draft ?? {}) as { title?: string };
              return (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy">
                      {draft.title ?? "Untitled"}
                    </p>
                    {u.error_message && (
                      <p className="mt-0.5 text-xs text-clay">{u.error_message}</p>
                    )}
                  </div>
                  <StatusChip status={u.status} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

/** Plain words. "asset_created" means nothing to the person who dropped a file. */
function StatusChip({ status }: { status: string }) {
  const label =
    status === "waiting"
      ? "Uploading"
      : status === "asset_created"
        ? "Transcoding"
        : status === "ready"
          ? "In the library"
          : status === "errored"
            ? "Failed"
            : status;

  const tone =
    status === "ready"
      ? "rgb(var(--ediagd-palm))"
      : status === "errored"
        ? "rgb(var(--ediagd-clay))"
        : "rgb(var(--ediagd-ocean))";

  return (
    <span
      className="shrink-0 rounded-pill px-2.5 py-1 text-xs font-extrabold"
      style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
    >
      {label}
    </span>
  );
}
