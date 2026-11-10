import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CueDeck, type DeckItem } from "@/components/library/CueDeck";
import { lessonCount } from "@/components/library/CoursePieces";
import { RecordOpen } from "@/components/events/RecordOpen";
import {
  GATING_CONTENT_TYPES,
  loadCourseCrumb,
  loadModule,
  loadModuleItems,
  loadNextStep,
} from "@/lib/lms";

/**
 * A module: its video and cues as a swipeable deck, ending on the quiz.
 *
 * THE FILM OPENS THE QUIZ. THE CUES DO NOT.
 *
 * This comment used to say the opposite — "the quiz is deliberately not
 * reachable before the cues are finished" — and it described a rule the quiz
 * route never enforced. The route gates on `my_module_progress.items_done`,
 * which has counted gating types only since 0143, so the cues were never in it.
 * Only the deck's terminal card believed they were, and it refused a quiz the
 * server would have served. Ryan's ruling of 10 November makes the route's
 * behaviour the rule everywhere; a cue never gates a lesson (0143), and it does
 * not gate the lesson's quiz either.
 *
 * ?cue=<contentId> opens the deck on that card. A failed quiz question links
 * here — the whole reason for withholding the answer is to send the advisor
 * back to the specific material, so the link has to land somewhere specific.
 */
export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ cue?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { module: moduleId } = await params;
  const { cue } = await searchParams;

  const mod = await loadModule(supabase, moduleId);
  if (!mod) notFound();

  /*
   * game_settings IS NO LONGER READ HERE.
   *
   * It was fetched for video_complete_pct, to tell the deck what "watched"
   * meant. The deck no longer needs telling: gateThreshold(duration_sec) is
   * computed per video inside TrackedVideo and re-checked by
   * completeLibraryItem against the same function. One fewer query, and one
   * fewer definition of the rule.
   */
  const [{ items }, course, nextStep] = await Promise.all([
    /* user.id, NAMED. The progress half of this read is scoped to the viewer
       by the argument and not by RLS — a manager-advisor reads every progress
       row at their own rooftop, so an unscoped read put a colleague's tick on
       this deck. See the note on loadModuleItems. */
    loadModuleItems(supabase, moduleId, user.id, 100),
    loadCourseCrumb(supabase, mod.courseId),
    loadNextStep(supabase, moduleId, mod.courseId),
  ]);

  const cards: DeckItem[] = items.map((it) => ({
    id: it.id,
    kind: it.isVideo ? ("video" as const) : ("cue" as const),
    title: it.title,
    body: it.body,
    tier: it.tier,
    durationSec: it.durationSec,
    videoUrl: it.videoUrl,
    renditions: it.renditions,
    watchedPct: it.watchedPct,
    positionSec: it.positionSec,
    // Provenance convention: the demo clip is tagged in content.source so the
    // card can admit it is borrowed rather than quietly passing as real
    // coaching footage.
    isSample: (it.source ?? "").toLowerCase().includes("sample"),
    completed: it.completed,
    /* WHAT GATES, FROM THE ONE LIST. GATING_CONTENT_TYPES mirrors
       gating_content_types() in the database — the same list
       my_module_progress.items_done uses, which is what the quiz route gates
       on — and `npm run check:gating` fails if the two ever differ. Derived
       from the TYPE, not from `kind`: kind is "video" for every non-cue type,
       so a manager_video would gate a module the database says it does not. */
    gates: (GATING_CONTENT_TYPES as readonly string[]).includes(it.type),
  }));

  /*
   * EVERY MODULE HAS A VIDEO SLOT, even before the video exists.
   *
   * Synthesised here rather than stored, because a placeholder row in `content`
   * would be a published item with no material — it would count toward
   * my_module_progress's totals and make the module uncompletable, which is the
   * exact 0-of-0 trap the curriculum importer now refuses to create.
   *
   * As a card it costs nothing and buys the honest shape of the module: an
   * advisor sees where the video will be, and the deck doesn't silently change
   * length the day it lands.
   */
  const hasVideo = cards.some((c) => c.kind === "video");
  if (!hasVideo) {
    cards.unshift({
      id: `placeholder:video:${moduleId}`,
      kind: "video_placeholder",
      title: mod.name,
      body: null,
      tier: null,
      durationSec: null,
      videoUrl: null,
      renditions: null,
      watchedPct: 0,
      positionSec: null,
      isSample: false,
      completed: false,
      // A placeholder gates nothing — there is no row to complete. This is the
      // construction, not a convention: a synthesized card cannot be marked
      // done, so it cannot satisfy a gate either.
      gates: false,
    });
  }

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      {/* A lesson OPENED, which is not a lesson completed and is not counted
          as one. Renders nothing; see components/events/RecordOpen.tsx. */}
      <RecordOpen kind="lesson_opened" targetId={moduleId} />
      <AdminPageHeader
        // One level up is the COURSE, not the library. Falls back to the
        // library only if the course somehow can't be read — a broken crumb is
        // worse than a shallow one.
        back={
          course
            ? { href: `/library/${course.slug}`, label: course.name }
            : { href: "/library", label: "Lesson Library" }
        }
        trail={course ? [{ href: "/library", label: "Lesson Library" }] : undefined}
        title={mod.name}
        /* Whole numbers, no printed percentage, and a cue-only module says what
           it actually is. "0 of 8 · 0%" over eight cues that cannot move it is
           the line this whole change started from.

           AND WHEN THE FRACTION IS FULL BUT THE LESSON IS NOT DONE, say so.
           total_items has counted gating items only since 0160, so an advisor
           who watches the film reads "1 of 1 done" while the quiz is still
           outstanding and the module is still incomplete. That fraction is the
           reason Valerie Patterson watched Menus lesson 1 several times: the
           header said finished, the track page said not, and neither named the
           quiz. Same fact the terminal card uses — mod.itemsDone and
           mod.hasQuiz — so the two cannot disagree. */
        subtitle={
          mod.itemsDone && mod.hasQuiz && !mod.quizPassed
            ? "Quiz waiting"
            : lessonCount(mod)
        }
      />

      <CueDeck
        moduleId={moduleId}
        moduleName={mod.name}
        items={cards}
        hasQuiz={mod.hasQuiz}
        quizPassed={mod.quizPassed}
        completedAt={mod.completedAt}
        nextStep={nextStep}
        initialCueId={cue ?? null}
      />

      <p className="mt-4 px-1 text-xs leading-relaxed text-ink-soft">
        Swipe through the cards, or use the arrows. Marking one done moves you
        along.
      </p>
    </main>
  );
}
