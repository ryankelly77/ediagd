import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/access";
import { loadMyStory } from "@/lib/story";
import { loadStoryLessons } from "@/lib/certifications";
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
   * completesTrack — is the story the LAST leg? True only when the track's
   * lessons are done. It no longer only words the hero line: since 8 October it
   * also decides whether this screen may be reached at all.
   *
   * ---------------------------------------------------------------------------
   * THIS USED TO READ `my_certification_progress` AND WAS WRONG ON SIX OF NINE
   * ---------------------------------------------------------------------------
   * `done_modules >= total_modules` over 0117's unfiltered module denominator is
   * false forever on any track holding a cue-only module, because such a module
   * can never earn a module_completion row. So an advisor who had genuinely
   * finished every film and every quiz on Walk Around was told by this very
   * screen that their story did NOT complete the track. Same wrong answer, same
   * silence — see loadStoryLessons() for the per-track measurement.
   */
  const lessons = await loadStoryLessons(supabase as never, cert.id as string);

  /*
   * THE PREVIEW ASSUMES A FINISHED TRACK, and the banner says so. The point of
   * previewing this screen is the state an advisor actually meets — somebody
   * at the end of fifty mornings — and an admin's own module progress is not
   * that. Same posture as the track-entry morning borrowing a film: substitute,
   * and name the substitution on screen.
   */
  const completesTrack = isPreview ? true : lessons.complete;

  /*
   * ---- ARRIVING EARLY GOES BACK WHERE THE LOCK IS -------------------------
   *
   * The track page states the leg and the count; this screen has nothing useful
   * to say to somebody who is not finished, and rendering the form to tell them
   * so is how a form gets submitted. The ADMIN PREVIEW is exempt by design —
   * the state worth previewing is the finished one, which an admin's own module
   * progress is not, and the preview writes nothing (enforced above, not
   * trusted).
   *
   * NOT the boundary. submitStory() checks the same predicate for itself,
   * because a redirect is advice to a browser and the action takes a POST from
   * anywhere.
   *
   * ---------------------------------------------------------------------------
   * `!existing` IS NOT A LOOPHOLE, IT IS THE OTHER HALF OF THE RULE
   * ---------------------------------------------------------------------------
   * An advisor who ALREADY HAS A STORY here keeps the door, whatever the lessons
   * now say. Three ways that state is reachable and all of them are legitimate:
   * a story submitted before this gate existed (nothing is deleted — Ryan's
   * instruction), a tenth film published onto a track that was complete when
   * they wrote, and a film retired from under them. In every case the words are
   * theirs and already filed, and the track page shows that row as a ✓ pointing
   * HERE. Redirecting on the strength of the lesson count alone would make that
   * tick a link to nowhere — and would hide a person's own words from them to
   * enforce a gate about writing new ones.
   */
  if (!isPreview && !existing && !lessons.complete) {
    redirect(`/certifications/${encodeURIComponent(cert.slug as string)}`);
  }

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
