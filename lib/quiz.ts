/* ============================================================================
   EDIAGD — quizzes
   SERVER ONLY.

   THE ANSWER KEY NEVER LEAVES THE SERVER. Three things enforce that, and the
   first two are in the database (0035):

     1. quiz_question has no read policy for advisors — they cannot select the
        table at all, correct column or otherwise.
     2. quiz_question_public is a security-definer view that does not SELECT
        `correct`, so the column is not merely filtered, it does not exist on
        the thing they can read. RLS filters rows, not columns, so a policy
        alone would have been the wrong tool.
     3. Grading happens here, from ids and choices. The client sends what it
        chose; it never sends, and is never told, what was right — until after
        the attempt is graded.

   Nothing about a score is accepted from the client. The score is computed.
   ============================================================================ */

import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export type QuizOption = {
  /**
   * The STORED key — which column this text came from. Submitted as the answer
   * value, and never shown to the advisor. See the shuffle note below.
   */
  value: "a" | "b" | "c" | "d";
  /** What the advisor sees: A, B, C, D by DISPLAY position, not by value. */
  label: string;
  text: string;
};

export type QuizQuestion = {
  id: string;
  question: string;
  /** Shuffled for this advisor and this attempt. */
  options: QuizOption[];
};

export type GradedQuestion = {
  id: string;
  question: string;
  chosenText: string | null;
  wasRight: boolean;
  /**
   * ONLY POPULATED ON A PASS. Null on a fail — see the note on gradeAttempt.
   * Shown as text, never as a letter: the letter is a screen position and
   * means nothing to anybody else.
   */
  correctText: string | null;
  explanation: string | null;
  /**
   * ONLY POPULATED ON A FAIL: where to go and re-read. The cue this question
   * was written from, or null when it was written against the module as a
   * whole — then the screen points at the module.
   */
  review: { contentId: string | null; title: string | null } | null;
};

export type QuizResult = {
  attemptId: string;
  scorePct: number;
  passed: boolean;
  passMark: number;
  correctCount: number;
  total: number;
  /** False on a fail: the reader is told WHICH they missed, not what was right. */
  answersRevealed: boolean;
  questions: GradedQuestion[];
};

/**
 * Deterministic shuffle from a seed.
 *
 * THE THREAT THIS DEFEATS: one advisor telling another "the answer is C".
 *
 * For that to be useless, two things both have to be true, and getting only the
 * first is the trap:
 *
 *   1. THE ORDER MUST DIFFER PER ADVISOR. The seed includes the user id, so two
 *      people sitting at the same desk see the four options in different
 *      orders. Seeding on the attempt alone would give everyone the same
 *      arrangement and share perfectly.
 *
 *   2. THE LETTER SHOWN MUST BE THE POSITION, NOT THE STORED KEY. Each option
 *      keeps its stored value ('a'..'d') for grading, but is LABELLED by where
 *      it landed. So "C" means the third thing on MY screen, which is a
 *      different sentence on yours. Shuffling while still printing the stored
 *      letter would reorder the screen and change nothing — the shared answer
 *      would still be right.
 *
 * The value travels back with the submission, so grading stays a comparison
 * against `correct` and never a mapping the client could tamper with.
 *
 * Seeded rather than random so a refresh mid-quiz renders the same order — a
 * reshuffle on reload would look like the quiz changing under them.
 */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The questions an advisor is served, without the answers.
 *
 * Reads quiz_question_public — the only quiz object `authenticated` is granted.
 * `attemptSeed` should be stable for one sitting (the module id plus the user
 * id plus their attempt count) so the order holds across a refresh.
 */
export async function loadQuizForModule(
  client: Client,
  moduleId: string,
  /** Both are part of the seed — see the shuffle note. */
  userId: string,
  attemptNo: number
): Promise<QuizQuestion[]> {
  const attemptSeed = `${moduleId}:${userId}:${attemptNo}`;
  const { data } = await client
    .from("quiz_question_public")
    .select("id, question, option_a, option_b, option_c, option_d, sort_order")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: true });

  const LETTERS = ["A", "B", "C", "D"];

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const stored = [
      { value: "a" as const, text: r.option_a as string },
      { value: "b" as const, text: r.option_b as string },
      { value: "c" as const, text: r.option_c as string },
      { value: "d" as const, text: r.option_d as string },
    ];

    // Label AFTER shuffling, so the letter describes the position on this
    // advisor's screen rather than the column it came from.
    const options: QuizOption[] = seededShuffle(
      stored,
      `${attemptSeed}:${r.id}`
    ).map((o, i) => ({ ...o, label: LETTERS[i]! }));

    return {
      id: r.id as string,
      question: (r.question as string) ?? "",
      options,
    };
  });
}

/** How many times this person has attempted this module. Seeds the shuffle. */
export async function countAttempts(
  client: Client,
  moduleId: string
): Promise<number> {
  const { count } = await client
    .from("quiz_attempt")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);
  return Number(count ?? 0);
}

/** The caller's best result so far, for showing "passed" state. */
export async function loadBestAttempt(
  client: Client,
  moduleId: string
): Promise<{ scorePct: number; passed: boolean; at: string } | null> {
  const { data } = await client
    .from("quiz_attempt")
    .select("score_pct, passed, created_at")
    .eq("module_id", moduleId)
    .order("passed", { ascending: false })
    .order("score_pct", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    scorePct: Number(data.score_pct ?? 0),
    passed: Boolean(data.passed),
    at: data.created_at as string,
  };
}

/**
 * Grade an attempt.
 *
 * `answers` is {questionId: storedValue}. The stored value travels with the
 * shuffled text, so grading stays a comparison against `correct` rather than a
 * mapping the client could tamper with.
 *
 * WHAT COMES BACK DEPENDS ON WHETHER THEY PASSED, and that is the point.
 *
 *   PASSED  — the full review: which they got right, the correct answer, and
 *             the explanation. They have earned the rationale, and re-reading
 *             it is where most of the learning actually happens.
 *   FAILED  — the score and WHICH questions they missed. Not the answers.
 *
 * Handing back the correct answers on a failure would undo both halves of this
 * design at once: the retry becomes a formality, and — because option TEXT is
 * identical for everyone no matter how the options are shuffled — a failing
 * advisor walks away with a shareable answer key. The shuffle protects the
 * letter; only withholding protects the text.
 *
 * The tone belongs to the UI, and it is "have another look", not "wrong".
 *
 * The service role reads `correct` here. This is the only place it is read.
 */
export async function gradeAttempt(
  userId: string,
  moduleId: string,
  answers: Record<string, string>
): Promise<QuizResult | { error: string }> {
  const service = createServiceClient();

  const [{ data: questions }, { data: settings }] = await Promise.all([
    service
      .from("quiz_question")
      .select(
        "id, question, option_a, option_b, option_c, option_d, correct, explanation, content_id, content:content_id(title)"
      )
      .eq("module_id", moduleId)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    service.from("game_settings").select("quiz_pass_pct").limit(1).maybeSingle(),
  ]);

  const rows = (questions ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { error: "This module has no quiz." };

  const passMark = Number(settings?.quiz_pass_pct ?? 80);

  const optionTextOf = (r: Record<string, unknown>, k: string) =>
    (r[`option_${k}`] as string | undefined) ?? "";

  // Grade first, with everything, so the score is right...
  const full = rows.map((r) => {
    const id = r.id as string;
    const correct = (r.correct as string) ?? "a";
    const chosen = answers[id] ?? null;
    const embed = r.content as { title?: string } | null;
    return {
      id,
      question: (r.question as string) ?? "",
      chosenText: chosen ? optionTextOf(r, chosen) : null,
      wasRight: chosen === correct,
      correctText: optionTextOf(r, correct),
      explanation: (r.explanation as string | null) ?? null,
      review: {
        contentId: (r.content_id as string | null) ?? null,
        title: embed?.title ?? null,
      },
    };
  });

  const correctCount = full.filter((g) => g.wasRight).length;
  const scorePct = Math.round((correctCount / full.length) * 100);
  const passed = scorePct >= passMark;

  // ...then strip what a failing attempt must not be told. Done here rather
  // than in the UI: a component that forgets is a leak, and this function is
  // the only thing that ever holds the key.
  // On a pass: the rationale. On a fail: where to go and look, and nothing
  // that could be written down and passed along.
  const graded: GradedQuestion[] = full.map((g) => ({
    ...g,
    correctText: passed ? g.correctText : null,
    explanation: passed ? g.explanation : null,
    review: passed || g.wasRight ? null : g.review,
  }));

  // Every attempt is recorded, passed or not. Retries are unlimited, so the
  // history is the only way to tell "got it first time" from "got there".
  const { data: attempt } = await service
    .from("quiz_attempt")
    .insert({
      user_id: userId,
      module_id: moduleId,
      score_pct: scorePct,
      passed,
      answers,
    })
    .select("id")
    .maybeSingle();

  return {
    attemptId: (attempt?.id as string) ?? "",
    scorePct,
    passed,
    passMark,
    correctCount,
    total: graded.length,
    answersRevealed: passed,
    questions: graded,
  };
}


/**
 * Rebuild the review for a past attempt.
 *
 * Used after the form POST redirects, so the result survives a refresh without
 * being carried in the URL. Applies the SAME withholding rule as grading — a
 * failed attempt never reveals answers, however it is re-read.
 */
export async function loadAttemptReview(
  userId: string,
  attemptId: string
): Promise<QuizResult | null> {
  const service = createServiceClient();

  const { data: attempt } = await service
    .from("quiz_attempt")
    .select("id, user_id, module_id, score_pct, passed, answers")
    .eq("id", attemptId)
    .maybeSingle();

  // Somebody else's attempt is simply not found. The id is a uuid, but a
  // guessable id must still not be a way to read another advisor's answers.
  if (!attempt || attempt.user_id !== userId) return null;

  const [{ data: rows }, { data: settings }] = await Promise.all([
    service
      .from("quiz_question")
      .select(
        "id, question, option_a, option_b, option_c, option_d, correct, explanation, content_id, content:content_id(title)"
      )
      .eq("module_id", attempt.module_id)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    service.from("game_settings").select("quiz_pass_pct").limit(1).maybeSingle(),
  ]);

  const answers = (attempt.answers ?? {}) as Record<string, string>;
  const passed = Boolean(attempt.passed);
  const optionTextOf = (r: Record<string, unknown>, k: string) =>
    (r[`option_${k}`] as string | undefined) ?? "";

  const questions: GradedQuestion[] = ((rows ?? []) as Record<string, unknown>[]).map(
    (r) => {
      const id = r.id as string;
      const correct = (r.correct as string) ?? "a";
      const chosen = answers[id] ?? null;
      const wasRight = chosen === correct;
      const embed = r.content as { title?: string } | null;
      return {
        id,
        question: (r.question as string) ?? "",
        chosenText: chosen ? optionTextOf(r, chosen) : null,
        wasRight,
        correctText: passed ? optionTextOf(r, correct) : null,
        explanation: passed ? ((r.explanation as string | null) ?? null) : null,
        review:
          passed || wasRight
            ? null
            : {
                contentId: (r.content_id as string | null) ?? null,
                title: embed?.title ?? null,
              },
      };
    }
  );

  return {
    attemptId,
    scorePct: Number(attempt.score_pct ?? 0),
    passed,
    passMark: Number(settings?.quiz_pass_pct ?? 80),
    correctCount: questions.filter((q) => q.wasRight).length,
    total: questions.length,
    answersRevealed: passed,
    questions,
  };
}
