import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/access";
import { loadMyStory } from "@/lib/story";
import { StoryForm } from "@/components/certification/StoryForm";

/* ============================================================================
   EDIAGD — where an advisor writes the Good News Story

   /certifications/<slug>/story

   REACHED FROM THE TRACK THAT NEEDS IT, not from a menu. The certifications
   wall names the outstanding story and links here; there is no other entry
   point, because a story is about one track and arriving without one would
   make the first question "which?".

   ---------------------------------------------------------------------------
   THE PREVIEW WRITES NOTHING, AND THAT IS ENFORCED HERE RATHER THAN TRUSTED
   ---------------------------------------------------------------------------
   `?preview=1`, checked against isAdminViewer server-side, renders the form
   against a REAL track with no story attached and hands the client
   `preview` — which short-circuits before the action is called at all.

   The daily loop preview taught us this needs measuring rather than asserting:
   it filed a watch_gate row nobody expected, because "nothing is saved" was a
   claim about intent rather than a property of the code. So the preview path
   here calls no action, and the before/after count is in
   reports/phase-3i-story-form.md.

   A preview that fabricates a story is worse than no preview. The one record
   in this product that is supposed to be a person's own words must never
   contain words nobody typed.
   ============================================================================ */

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview: previewFlag } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cert, error: certError } = await supabase
    .from("certification")
    .select("id, slug, name, item_count")
    .eq("slug", slug)
    .maybeSingle();
  /* Take the error. A missing track and an unreadable one are different
     answers, and "not found" for an RLS refusal would send somebody hunting a
     content bug that is a permissions bug. */
  if (certError) throw new Error(`certification ${slug}: ${certError.message}`);
  if (!cert) redirect("/certifications");

  const isPreview = previewFlag === "1" && (await isAdminViewer(supabase, user.id));

  const { data: membership } = await supabase
    .from("membership")
    .select("rooftop:rooftop_id(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const rooftopName =
    ((membership?.rooftop as { name?: string } | null)?.name as string | undefined) ??
    null;

  /*
   * THE PREVIEW SHOWS THE EMPTY FORM, ALWAYS. An admin who happens to have
   * written a story for this track would otherwise preview their own words,
   * which is both a privacy oddity and the wrong screen to be looking at — the
   * thing worth previewing is what an advisor meets at the end of a track.
   */
  const existing = isPreview ? null : await loadMyStory(supabase, user.id, cert.id);

  return (
    <StoryForm
      certificationId={cert.id as string}
      trackName={cert.name as string}
      itemCount={Number(cert.item_count ?? 0)}
      existing={
        existing
          ? {
              body: existing.body,
              sharedToTeam: existing.sharedToTeam,
              submittedAt: existing.submittedAt,
              updatedAt: existing.updatedAt,
              reviewedAt: existing.reviewedAt,
            }
          : null
      }
      rooftopName={rooftopName}
      preview={isPreview}
    />
  );
}
