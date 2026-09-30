/* ============================================================================
   EDIAGD — the library as a course
   SERVER ONLY (takes a Supabase client).

   THREE LEVELS: track → course → module → cues, in sequence.

   PROGRESS IS COUNTED IN POSTGRES, NEVER HERE. my_module_progress (0035) does
   one grouped scan of published cues left-joined to the caller's completions
   and returns one row per module, already carrying whether a quiz stands in the
   way and whether they passed it. So:

     * the landing page is ONE query for every course's progress,
     * a course page is ONE query for all its modules,
     * a module page is ONE query for its cues plus ONE for their completions.

   Nothing fans out per module. At 253 modules the alternative is 253 round
   trips for a screen that shows a progress bar.
   ============================================================================ */

import { isVideoType, type ContentType } from "@/lib/content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export const MODULE_PAGE_SIZE = 25;

export type CourseProgress = {
  courseId: string;
  track: string;
  name: string;
  slug: string;
  sortOrder: number;
  totalModules: number;
  completedModules: number;
  totalItems: number;
  completedItems: number;
  modulesNeedingNames: number;
  lastActivity: string | null;
  pct: number;
};

export type ModuleProgress = {
  moduleId: string;
  courseId: string;
  name: string;
  needsName: boolean;
  sortOrder: number;
  totalItems: number;
  completedItems: number;
  itemsDone: boolean;
  hasQuiz: boolean;
  quizPassed: boolean;
  completedAt: string | null;
  lastActivity: string | null;
  pct: number;
};

export type LessonItem = {
  id: string;
  type: ContentType;
  title: string;
  body: string | null;
  tier: string | null;
  durationSec: number | null;
  videoUrl: string | null;
  isVideo: boolean;
  /** Provenance from the CMS. Carried so a demo sample can say that it is one. */
  source: string | null;
  position: number;
  completed: boolean;
};

const pct = (done: number, total: number) =>
  total === 0 ? 0 : Math.round((done / total) * 100);

function toCourse(r: Record<string, unknown>): CourseProgress {
  const total = Number(r.total_items ?? 0);
  const done = Number(r.completed_items ?? 0);
  return {
    courseId: r.course_id as string,
    track: (r.track as string) ?? "",
    name: (r.name as string) ?? "Course",
    slug: (r.slug as string) ?? "",
    sortOrder: Number(r.sort_order ?? 0),
    totalModules: Number(r.total_modules ?? 0),
    completedModules: Number(r.completed_modules ?? 0),
    totalItems: total,
    completedItems: done,
    modulesNeedingNames: Number(r.modules_needing_names ?? 0),
    lastActivity: (r.last_activity as string | null) ?? null,
    pct: pct(done, total),
  };
}

function toModule(r: Record<string, unknown>): ModuleProgress {
  const total = Number(r.total_items ?? 0);
  const done = Number(r.completed_items ?? 0);
  return {
    moduleId: r.module_id as string,
    courseId: r.course_id as string,
    name: (r.module_name as string) ?? "Module",
    needsName: r.name_status === "needs_name",
    sortOrder: Number(r.sort_order ?? 0),
    totalItems: total,
    completedItems: done,
    itemsDone: Boolean(r.items_done),
    hasQuiz: Boolean(r.has_quiz),
    quizPassed: Boolean(r.quiz_passed),
    completedAt: (r.completed_at as string | null) ?? null,
    lastActivity: (r.last_activity as string | null) ?? null,
    pct: pct(done, total),
  };
}

const COURSE_COLS =
  "course_id, track, name, slug, sort_order, total_modules, completed_modules, total_items, completed_items, modules_needing_names, last_activity";
const MODULE_COLS =
  "module_id, course_id, module_name, name_status, sort_order, total_items, completed_items, items_done, has_quiz, quiz_passed, completed_at, last_activity";

/** Every course, with progress. One query. */
export async function loadCourses(client: Client): Promise<CourseProgress[]> {
  const { data } = await client
    .from("my_course_progress")
    .select(COURSE_COLS)
    .order("track", { ascending: true })
    .order("sort_order", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map(toCourse);
}

export async function loadCourseBySlug(
  client: Client,
  slug: string
): Promise<CourseProgress | null> {
  const { data } = await client
    .from("my_course_progress")
    .select(COURSE_COLS)
    .eq("slug", slug)
    .maybeSingle();

  return data ? toCourse(data as Record<string, unknown>) : null;
}

/**
 * Just enough of a course to build a breadcrumb.
 *
 * Deliberately not loadCourseBySlug: a module knows its course_id, and going
 * through my_course_progress would aggregate every module in the course to
 * render two words.
 */
export async function loadCourseCrumb(
  client: Client,
  courseId: string
): Promise<{ name: string; slug: string } | null> {
  const { data } = await client
    .from("course")
    .select("name, slug")
    .eq("id", courseId)
    .maybeSingle();

  return data
    ? { name: (data.name as string) ?? "Course", slug: (data.slug as string) ?? "" }
    : null;
}

export type NextStep = {
  href: string;
  label: string;
  kind: "module" | "course" | "library";
};

/**
 * Where finishing this module sends you.
 *
 * The next module in the same course; failing that the next course; failing
 * that the library. Finishing something should hand you the next thing — an
 * advisor who has just passed a quiz is the likeliest person in the app to do
 * another one, and making them navigate back up two levels to find it spends
 * exactly the momentum the module just built.
 *
 * Course order matches the landing page's (track, then sort_order) so "next"
 * means the next one they'd see, not the next one by id.
 */
export async function loadNextStep(
  client: Client,
  moduleId: string,
  courseId: string
): Promise<NextStep> {
  const LIBRARY: NextStep = {
    href: "/library",
    label: "Lesson Library",
    kind: "library",
  };

  const { data: siblings } = await client
    .from("module")
    .select("id, name, sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  const mods = (siblings ?? []) as Record<string, unknown>[];
  const here = mods.findIndex((m) => m.id === moduleId);
  const nextModule = here >= 0 ? mods[here + 1] : undefined;

  if (nextModule) {
    return {
      href: `/library/m/${nextModule.id as string}`,
      label: (nextModule.name as string) ?? "Next lesson",
      kind: "module",
    };
  }

  // Last module in the course — step up to the next course.
  const { data: allCourses } = await client
    .from("course")
    .select("id, name, slug")
    .order("track", { ascending: true })
    .order("sort_order", { ascending: true });

  const courses = (allCourses ?? []) as Record<string, unknown>[];
  const at = courses.findIndex((c) => c.id === courseId);
  const nextCourse = at >= 0 ? courses[at + 1] : undefined;

  if (nextCourse) {
    return {
      href: `/library/${nextCourse.slug as string}`,
      label: (nextCourse.name as string) ?? "Next course",
      kind: "course",
    };
  }

  return LIBRARY;
}

/** One course's modules, in taught order. One query. */
export async function loadModules(
  client: Client,
  courseId: string
): Promise<ModuleProgress[]> {
  const { data } = await client
    .from("my_module_progress")
    .select(MODULE_COLS)
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map(toModule);
}

export async function loadModule(
  client: Client,
  moduleId: string
): Promise<ModuleProgress | null> {
  const { data } = await client
    .from("my_module_progress")
    .select(MODULE_COLS)
    .eq("module_id", moduleId)
    .maybeSingle();

  return data ? toModule(data as Record<string, unknown>) : null;
}

/**
 * One module's items, in teaching order, with completion state. Two queries.
 *
 * VIDEOS COME FIRST, whatever module_order says. A module's video introduces
 * the material the cues then drill, so a deck that opened on cue 1 and buried
 * the video at card 9 would have the lesson backwards. Ordering is settled here
 * rather than in the query because it is a rule about TYPE, and PostgREST
 * cannot order by a computed expression; the module page asks for 100 items and
 * the largest module holds eleven, so nothing is at risk of being sorted after
 * being truncated.
 */
export async function loadModuleItems(
  client: Client,
  moduleId: string,
  limit: number = MODULE_PAGE_SIZE
): Promise<{ items: LessonItem[]; total: number }> {
  const { data, count } = await client
    .from("content")
    .select(
      "id, type, title, body, tier, duration_sec, video_url, module_order, created_at, source",
      { count: "exact" }
    )
    .eq("module_id", moduleId)
    .eq("status", "published")
    .order("module_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(0, limit - 1);

  const rows = ((data ?? []) as Record<string, unknown>[]).slice().sort((a, b) => {
    const av = isVideoType(a.type as ContentType) ? 0 : 1;
    const bv = isVideoType(b.type as ContentType) ? 0 : 1;
    return av - bv; // stable: the query's order survives within each group
  });
  const ids = rows.map((r) => r.id as string);

  const { data: done } = ids.length
    ? await client
        .from("content_progress")
        .select("content_id")
        .in("content_id", ids)
        .not("completed_at", "is", null)
    : { data: [] };

  const completed = new Set(
    ((done ?? []) as Record<string, unknown>[]).map((r) => r.content_id as string)
  );

  return {
    total: Number(count ?? rows.length),
    items: rows.map((r, i) => {
      const type = r.type as ContentType;
      return {
        id: r.id as string,
        type,
        title: (r.title as string) ?? "Untitled",
        body: (r.body as string | null) ?? null,
        tier: (r.tier as string | null) ?? null,
        durationSec: r.duration_sec == null ? null : Number(r.duration_sec),
        videoUrl: (r.video_url as string | null) ?? null,
        isVideo: isVideoType(type),
        source: (r.source as string | null) ?? null,
        position: i + 1,
        completed: completed.has(r.id as string),
      };
    }),
  };
}

/**
 * Where to send a returning advisor.
 *
 * A module already started beats one never opened — finishing something is more
 * motivating than starting something.
 */
export async function loadContinuePoint(
  client: Client
): Promise<ModuleProgress | null> {
  const { data } = await client
    .from("my_module_progress")
    .select(MODULE_COLS)
    .is("completed_at", null)
    .order("last_activity", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .limit(1);

  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.length ? toModule(rows[0]!) : null;
}

/* ---- The gate ------------------------------------------------------------ */

export type ModuleRequirements = {
  met: boolean;
  itemsDone: boolean;
  /** Null when the module has no published quiz — then content alone is enough. */
  quizPassed: boolean | null;
  totalItems: number;
  completedItems: number;
};

/**
 * Is this module finished?
 *
 * Every cue done, AND the quiz passed where a PUBLISHED quiz exists. A module
 * without one completes on content alone — otherwise importing the curriculum
 * before the quizzes are authored would make the entire library uncompletable.
 *
 * Draft questions never count. An AI-generated question nobody has reviewed
 * must not be able to block a module any more than it can be served.
 *
 * Takes the SERVICE-ROLE client: the caller needs the true answer, not the
 * RLS-filtered one. A user must not be able to make a module look finished by
 * being unable to see part of it.
 */
/**
 * The content types whose completion gates a module.
 *
 * THE DATABASE IS THE SOURCE — `gating_content_types()`, added in 0143 and used by
 * `my_module_progress.items_done`. This is a mirror so the hot path does not need a
 * round-trip, and `npm run check:gating` asserts the two agree rather than trusting
 * that they do.
 */
export const GATING_CONTENT_TYPES = ["advisor_video"] as const;

export async function moduleRequirementsMet(
  service: Client,
  userId: string,
  moduleId: string
): Promise<ModuleRequirements> {
  const [{ data: items }, { count: quizCount }] = await Promise.all([
    service
      .from("content")
      .select("id")
      .eq("module_id", moduleId)
      .eq("status", "published")
      /*
       * ONLY GATING TYPES. A cue is reinforcement and never gates a module.
       *
       * This used to have no type filter, so a Walk Around module demanded eleven
       * completions — three film, eight cue — before the credential would move. A
       * cue that gates a lesson turns the lesson into a checklist.
       *
       * MIRRORS gating_content_types() IN THE DATABASE (0143), which is the one
       * definition and which my_module_progress.items_done also uses. The rule was
       * implemented twice and both copies counted cues; changing one would have
       * made the gate and the library screen disagree about the same module.
       * `npm run check:gating` fails if these two lists ever differ — two lists
       * that must agree with nothing comparing them is exactly how a flag nobody
       * parsed survived in the ingest's own usage block.
       *
       * An ALLOWLIST, never `neq("type","cue")`: a denylist would silently enrol
       * the next type anybody attaches, and technician_video exists precisely
       * because its audience is not this one.
       */
      .in("type", GATING_CONTENT_TYPES),
    service
      .from("quiz_question")
      .select("id", { count: "exact", head: true })
      .eq("module_id", moduleId)
      .eq("status", "published"),
  ]);

  const ids = ((items ?? []) as Record<string, unknown>[]).map(
    (r) => r.id as string
  );

  if (ids.length === 0) {
    return {
      met: false,
      itemsDone: false,
      quizPassed: null,
      totalItems: 0,
      completedItems: 0,
    };
  }

  const { count: doneCount } = await service
    .from("content_progress")
    .select("content_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("content_id", ids)
    .not("completed_at", "is", null);

  const completedItems = Number(doneCount ?? 0);
  const itemsDone = completedItems >= ids.length;

  /*
   * ---- THE ASYMMETRY IS DELIBERATE, AND IT IS DEBT ------------------------
   *
   * THE FILM CLAUSE REFUSES ON AN EMPTY SET. THE QUIZ CLAUSE PASSES ON ONE.
   *
   * A module with no film has nothing to complete, so completing it would award a
   * credential for content that does not exist — see the `ids.length === 0` early
   * return above, which is load-bearing the moment cues stop counting.
   *
   * A module with no quiz has a lesson the advisor actually watched. The work that
   * exists was done, and blocking them on an asset nobody authored punishes the
   * advisor for our gap. So `quizPassed` stays null when no published question
   * exists, and `met` treats null as satisfied.
   *
   * THE BLAST RADIUS IS WHY THIS IS NOT TIGHTENED TONIGHT. 250 of 257
   * module-bearing modules have no published quiz. Making the quiz constitutive
   * would make every currently completable module uncompletable — Walk Around,
   * Menus, Overcoming Objections, Name Tag, Lasting Impressions, Phones and Tones —
   * at once, and it would read like a correctness improvement while doing it.
   *
   * It IS debt: the settled rhythm is lesson plus quiz, and a module with no quiz
   * is not a knowledge gate. 250 modules need questions first, and 485 unplaced
   * questions are sitting in the bank. On the 2 October list, not tonight.
   *
   * The two halves also protect each other. A one-name allowlist is narrow enough
   * to be wrong the first time somebody attaches a technician_video — and the
   * empty-set refusal turns that from a silent pass into a visible block. An
   * omission that blocks is a bug you find; an omission that completes is a
   * credential you cannot take back.
   */
  let quizPassed: boolean | null = null;
  if (Number(quizCount ?? 0) > 0) {
    const { count: passes } = await service
      .from("quiz_attempt")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("module_id", moduleId)
      .eq("passed", true);
    quizPassed = Number(passes ?? 0) > 0;
  }

  return {
    met: itemsDone && quizPassed !== false,
    itemsDone,
    quizPassed,
    totalItems: ids.length,
    completedItems,
  };
}

/** Which module a cue belongs to — needed after completing one. */
export async function moduleForItem(
  service: Client,
  contentId: string
): Promise<string | null> {
  const { data } = await service
    .from("content")
    .select("module_id")
    .eq("id", contentId)
    .maybeSingle();

  return (data?.module_id as string | null) ?? null;
}

/* ---------------------------------------------------------------------------
   FINISHING A MODULE — the one place it happens
--------------------------------------------------------------------------- */

/**
 * Write the module_completion row, if the module's requirements are now met.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MOVED HERE
 * ---------------------------------------------------------------------------
 * It lived inside lib/library-actions.ts as a private helper, which was correct
 * while the LIBRARY was the only thing that could finish an item. The Two
 * Ladders loop's item slot finishes one every morning, and craft certification
 * is read from module_completion — `craftComplete` in lib/certification-server.ts
 * says so and deliberately does not recompute the rule.
 *
 * So without this being shared there were two possible outcomes and both were
 * bad: the loop writes nothing and no advisor ever earns a craft track from the
 * daily ritual, or the loop writes its own copy and there are two accountings
 * of what "module complete" means. TWO_LADDERS asks for the opposite — "Track
 * completion is expressed in exactly one place" — and says it is worth
 * insisting on regardless of any one feature.
 *
 * THE PRIMARY KEY IS THE PAY-ONCE GUARD. (user_id, module_id), so a second call
 * loses and returns null rather than celebrating twice.
 *
 * `bonus` IS THE CALLER'S, and the two callers pass different things on
 * purpose. The library pays game_settings.sand_module. The daily loop passes 0:
 * the loop's own payout is sand_daily_loop and adding a second currency source
 * to the morning is a product decision nobody has taken. The completion row —
 * which is what the credential reads — is written identically either way.
 */
export async function completeModuleIfReady(
  service: Client,
  userId: string,
  contentId: string,
  rooftopId: string,
  bonus: number
): Promise<{ moduleId: string; bonus: number } | null> {
  const moduleId = await moduleForItem(service, contentId);
  if (!moduleId) return null;

  const req = await moduleRequirementsMet(service, userId, moduleId);
  /* Not met is the NORMAL case — items left, or a quiz still to pass. The quiz
     path calls this too after grading, so whichever finishes last triggers it. */
  if (!req.met) return null;

  const { error } = await service.from("module_completion").insert({
    user_id: userId,
    module_id: moduleId,
    rooftop_id: rooftopId,
  });

  // Already celebrated. The primary key decided; nothing to pay, nothing to show.
  if (error) return null;

  if (bonus > 0) {
    await service.from("sand_dollar_entry").insert({
      user_id: userId,
      amount: bonus,
      reason: "module_complete",
      ref_id: moduleId,
      note: "Module completed",
    });
  }

  return { moduleId, bonus };
}
