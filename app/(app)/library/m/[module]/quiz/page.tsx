import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { submitQuiz } from "@/lib/quiz-actions";
import { countAttempts, loadAttemptReview, loadQuizForModule } from "@/lib/quiz";
import { loadCourseCrumb, loadModule, loadNextStep } from "@/lib/lms";

/**
 * The quiz, and the review afterwards.
 *
 * WHAT THE READER IS TOLD DEPENDS ON WHETHER THEY PASSED, and that split is
 * decided on the server (lib/quiz.ts), not here — a component that forgot would
 * be a leak. On a pass: the answers and the rationale. On a fail: which ones
 * they missed and which cue to re-read. Never the answer, never anything that
 * can be written on a sticky note and passed along.
 *
 * Option order is shuffled per advisor per attempt and labelled by POSITION, so
 * "it's C" is true for nobody but the person who said it.
 */
export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { module: moduleId } = await params;
  const { attempt } = await searchParams;

  const mod = await loadModule(supabase, moduleId);
  if (!mod || !mod.hasQuiz) notFound();

  // Lesson Library › course › module › (this quiz). Back is the module, one
  // level up; the rest is the trail above it.
  const [course, nextStep] = await Promise.all([
    loadCourseCrumb(supabase, mod.courseId),
    loadNextStep(supabase, moduleId, mod.courseId),
  ]);
  const trail = [
    { href: "/library", label: "Lesson Library" },
    ...(course ? [{ href: `/library/${course.slug}`, label: course.name }] : []),
  ];

  // The cues come first. Reachable by URL, so it is checked here too.
  if (!mod.itemsDone) redirect(`/library/m/${moduleId}`);

  const review = attempt ? await loadAttemptReview(user.id, attempt) : null;

  if (review) {
    return (
      <main className="mx-auto max-w-app px-4 pb-12 pt-5">
        <AdminPageHeader
          back={{ href: `/library/m/${moduleId}`, label: mod.name }}
          trail={trail}
          title={review.passed ? "Passed" : "Not yet"}
          subtitle={`${review.correctCount} of ${review.total} · ${review.scorePct}% (${review.passMark}% to pass)`}
        />

        <Card className="mt-4 p-5">
          <p className="text-sm leading-relaxed text-navy">
            {review.passed ? (
              <>
                Nicely done. The rationale is below — it&apos;s worth the read
                even on the ones you got right.
              </>
            ) : (
              <>
                Have another look and try again. Below are the ones to revisit,
                with where to find them. Unlimited retries.
              </>
            )}
          </p>
          {!review.passed && (
            <Link
              href={`/library/m/${moduleId}/quiz`}
              className="mt-4 inline-flex min-h-[3rem] items-center rounded-xl bg-gold px-5 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Try again
            </Link>
          )}
        </Card>

        <h2 className="ediagd-eyebrow mt-8 px-1">
          {review.passed ? "The review" : "Worth another look"}
        </h2>
        <div className="mt-2 space-y-2">
          {review.questions
            .filter((q) => review.passed || !q.wasRight)
            .map((q) => (
              <Card key={q.id} className="p-4">
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-sm font-extrabold"
                    style={{
                      color: q.wasRight
                        ? "rgb(var(--ediagd-palm))"
                        : "rgb(var(--ediagd-clay))",
                    }}
                  >
                    {q.wasRight ? "✓" : "○"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-snug text-navy">
                      {q.question}
                    </p>

                    {q.correctText && (
                      <p className="mt-1.5 text-sm text-navy">
                        <span className="font-extrabold">Answer: </span>
                        {q.correctText}
                      </p>
                    )}
                    {q.explanation && (
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                        {q.explanation}
                      </p>
                    )}

                    {/*
                      THE POINT OF WITHHOLDING THE ANSWER IS TO SEND THEM BACK
                      TO THE MATERIAL, so this has to go somewhere. With a
                      source cue it opens the deck ON that card; without one it
                      opens the deck at the start. Never plain text — a dead end
                      here turns "have another look" into a shrug.
                    */}
                    {q.review && (
                      <Link
                        href={
                          q.review.contentId
                            ? `/library/m/${moduleId}?cue=${q.review.contentId}`
                            : `/library/m/${moduleId}`
                        }
                        className="mt-2 flex min-h-[2.75rem] items-center gap-2 rounded-card px-3 text-xs leading-relaxed text-ink-soft transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        style={{
                          background:
                            "color-mix(in srgb, rgb(var(--ediagd-teal)) 8%, transparent)",
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          {q.review.title ? (
                            <>
                              Have another look at{" "}
                              <span className="font-bold text-navy">
                                {q.review.title}
                              </span>
                            </>
                          ) : (
                            <>Have another look through this module&apos;s cues</>
                          )}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-base leading-none"
                          style={{ color: "rgb(var(--ediagd-teal))" }}
                        >
                          ›
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ))}
        </div>

        {/*
          PASSING HANDS YOU THE NEXT LESSON, not a way back out.

          Somebody who has just passed a quiz is the likeliest person in the app
          to do another one, and the review is long enough that the header has
          scrolled far out of reach by the time they finish reading it. Making
          them climb back up to the course list to find lesson 3 spends exactly
          the momentum lesson 2 just built.

          The gold button is the next module, or the next course when this was
          the last module in one, or the library when there is nothing after it
          at all. The module itself stays reachable underneath, quieter — it is
          the less likely thing to want, not an unwanted one.

          Only on a pass: the fail screen's next step is "Try again" and the cue
          links above it, and a second competing button there would point away
          from the material they came back to re-read.
        */}
        {review.passed && (
          <div className="mt-8 space-y-2">
            <Link
              href={nextStep.href}
              className="flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-gold px-5 text-center text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {nextStep.kind === "library"
                ? "Back to the Lesson Library"
                : `Next: ${nextStep.label}`}
            </Link>
            <Link
              href={`/library/m/${moduleId}`}
              className="flex min-h-[2.75rem] w-full items-center justify-center rounded-xl border border-line px-5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Back to {mod.name}
            </Link>
          </div>
        )}
      </main>
    );
  }

  // ---- Taking it -----------------------------------------------------------
  const attemptNo = await countAttempts(supabase, moduleId);
  const questions = await loadQuizForModule(supabase, moduleId, user.id, attemptNo);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: `/library/m/${moduleId}`, label: mod.name }}
        trail={trail}
        title="Check your understanding"
        subtitle={`${questions.length} questions · ${mod.quizPassed ? "already passed" : "unlimited retries"}`}
      />

      <form action={submitQuiz} className="mt-4 space-y-3">
        <input type="hidden" name="moduleId" value={moduleId} />

        {questions.map((q, i) => (
          <Card key={q.id} className="p-4">
            <p className="text-sm font-extrabold leading-snug text-navy">
              {i + 1}. {q.question}
            </p>
            <div className="mt-3 space-y-1.5">
              {q.options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-start gap-2.5 rounded-card p-2.5 transition hover:bg-teal-soft/15"
                >
                  <input
                    type="radio"
                    name={`q:${q.id}`}
                    value={o.value}
                    required
                    className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--ediagd-teal))]"
                  />
                  <span className="min-w-0 text-sm leading-relaxed text-navy">
                    <span className="font-extrabold">{o.label}.</span> {o.text}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        ))}

        <button
          type="submit"
          className="min-h-[3rem] w-full rounded-xl bg-gold px-4 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Submit
        </button>
      </form>

      <p className="mt-4 px-1 text-xs leading-relaxed text-ink-soft">
        The options are in a different order for everyone, so a letter
        won&apos;t travel. {mod.completedAt ? "" : "Passing completes the module."}
      </p>
    </main>
  );
}
