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

  /*
   * ---- TWO FACTS THE SCREEN IS NOT ALLOWED TO GUESS ----------------------
   *
   * hasChecks — does this track have ANY quiz questions? Measured on
   * production: only Walk Around does (28 across 7 modules), and six other
   * tracks have modules and none. The hero line said "and every check", which
   * on six of seven tracks told an advisor they had passed checks that never
   * existed.
   *
   * completesTrack — is the story the LAST leg? True only when every module is
   * already complete, which is how the tile that links here is chosen. Someone
   * arriving by URL with modules outstanding must not be told the track is
   * finished. One read of the same rollup the wall uses, so the two cannot
   * disagree.
   */
  const { data: progress, error: progressError } = await supabase.rpc(
    "my_certification_progress"
  );
  if (progressError) {
    throw new Error(`certification progress: ${progressError.message}`);
  }
  const mine = ((progress ?? []) as {
    certification_id: string;
    total_modules: number;
    done_modules: number;
  }[]).find((r) => r.certification_id === cert.id);

  /*
   * THE PREVIEW ASSUMES A FINISHED TRACK, and the banner says so. The point of
   * previewing this screen is the state an advisor actually meets — somebody
   * at the end of fifty mornings — and an admin's own module progress is not
   * that. Same posture as the track-entry morning borrowing a film: substitute,
   * and name the substitution on screen.
   */
  const completesTrack = isPreview
    ? true
    : Boolean(mine) && Number(mine!.total_modules) > 0 &&
      Number(mine!.done_modules) >= Number(mine!.total_modules);

  const hasChecks = await trackHasChecks(supabase, cert.id as string);

  return (
    <StoryForm
      certificationId={cert.id as string}
      trackName={cert.name as string}
      itemCount={Number(cert.item_count ?? 0)}
      hasChecks={hasChecks}
      completesTrack={completesTrack}
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

/**
 * Does this track have any quiz questions at all?
 *
 * certification -> courses -> modules -> quiz_question_public, which is the
 * definer view advisors may read (quiz_question itself has no advisor policy —
 * see lib/quiz.ts). Every step takes its error: a refusal that read as "no
 * checks" would quietly change what the hero line claims.
 */
async function trackHasChecks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  certificationId: string
): Promise<boolean> {
  const { data: links, error: linkError } = await supabase
    .from("certification_course")
    .select("course_id")
    .eq("certification_id", certificationId);
  if (linkError) throw new Error(`certification_course: ${linkError.message}`);
  const courseIds = (links ?? []).map((r) => r.course_id as string);
  if (courseIds.length === 0) return false;

  const { data: modules, error: moduleError } = await supabase
    .from("module")
    .select("id")
    .in("course_id", courseIds);
  if (moduleError) throw new Error(`module: ${moduleError.message}`);
  const moduleIds = (modules ?? []).map((m) => m.id as string);
  if (moduleIds.length === 0) return false;

  const { count, error: quizError } = await supabase
    .from("quiz_question_public")
    .select("id", { count: "exact", head: true })
    .in("module_id", moduleIds);
  if (quizError) throw new Error(`quiz_question_public: ${quizError.message}`);

  return Number(count ?? 0) > 0;
}
