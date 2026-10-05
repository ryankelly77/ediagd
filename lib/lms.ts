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
import { renditionsFor, type VideoRenditions } from "@/lib/mux/playback";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export const MODULE_PAGE_SIZE = 25;

export type CourseProgress = {
  courseId: string;
  track: string;
  name: string;
  slug: string;
  sortOrder: number;
  /** LESSONS — modules holding a gating item. Never every module (0160). */
  totalModules: number;
  completedModules: number;
  totalItems: number;
  completedItems: number;
  modulesNeedingNames: number;
  /** Modules with any published content, so the course page knows what it can render. */
  listableModules: number;
  /** Derived in the view: does this course have at least one lesson? (0160) */
  visible: boolean;
  lastActivity: string | null;
  pct: number;
};

export type ModuleProgress = {
  moduleId: string;
  courseId: string;
  /**
   * The course's name — what advisor-facing copy calls the TRACK. Carried on
   * the row so the Continue card can say where a lesson lives without a second
   * query for one string.
   */
  courseName: string;
  courseTrack: string;
  name: string;
  needsName: boolean;
  sortOrder: number;
  /** GATING items only since 0160: the number an advisor can drive to done. */
  totalItems: number;
  completedItems: number;
  /** Every published row, so a surface can tell "no lesson yet" from "nothing here". */
  allItems: number;
  cueItems: number;
  itemsDone: boolean;
  hasQuiz: boolean;
  quizPassed: boolean;
  completedAt: string | null;
  lastActivity: string | null;
  pct: number;
  /**
   * A module with cues and no film. It is listed — the cues are real material —
   * but it cannot complete, so no surface may show it a denominator of 0.
   */
  isReinforcement: boolean;
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
  /**
   * Both signed cuts, built the SAME way shapeVideo builds them for the daily
   * loop, so the library player picks the 9:16 crop on a phone and the master on
   * a desktop through pickRendition. Null when the row has no Mux asset — then the
   * player falls back to the legacy videoUrl, and to the "not uploaded" state only
   * when both are absent.
   */
  renditions: VideoRenditions | null;
  /** Furthest point reached, so a half-watched lesson resumes. */
  watchedPct: number;
  positionSec: number | null;
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
    listableModules: Number(r.listable_modules ?? 0),
    visible: Boolean(r.visible),
    lastActivity: (r.last_activity as string | null) ?? null,
    pct: pct(done, total),
  };
}

function toModule(r: Record<string, unknown>): ModuleProgress {
  const total = Number(r.total_items ?? 0);
  const done = Number(r.completed_items ?? 0);
  const all = Number(r.all_items ?? 0);
  return {
    moduleId: r.module_id as string,
    courseId: r.course_id as string,
    courseName: (r.course_name as string) ?? "",
    courseTrack: (r.course_track as string) ?? "",
    name: (r.module_name as string) ?? "Module",
    needsName: r.name_status === "needs_name",
    sortOrder: Number(r.sort_order ?? 0),
    totalItems: total,
    completedItems: done,
    allItems: all,
    cueItems: Number(r.cue_items ?? 0),
    itemsDone: Boolean(r.items_done),
    hasQuiz: Boolean(r.has_quiz),
    quizPassed: Boolean(r.quiz_passed),
    completedAt: (r.completed_at as string | null) ?? null,
    lastActivity: (r.last_activity as string | null) ?? null,
    pct: pct(done, total),
    isReinforcement: total === 0 && all > 0,
  };
}

const COURSE_COLS =
  "course_id, track, name, slug, sort_order, total_modules, completed_modules, total_items, completed_items, modules_needing_names, listable_modules, visible, last_activity";
const MODULE_COLS =
  "module_id, course_id, course_name, course_track, module_name, name_status, sort_order, total_items, completed_items, all_items, cue_items, items_done, has_quiz, quiz_passed, completed_at, last_activity";

/**
 * Every course an advisor may be offered, with progress. One query.
 *
 * ---------------------------------------------------------------------------
 * RULE 1, AND WHY IT IS A FILTER HERE RATHER THAN A STORED FLAG
 * ---------------------------------------------------------------------------
 * Ryan's ruling of 5 October: an advisor sees a course only if at least one of
 * its modules holds a film. Before this, 35 of 45 courses had no film and all
 * 45 were listed — sixteen Product Knowledge courses offering not one lesson.
 *
 * `visible` is DERIVED in my_course_progress (0160), not stored, so it cannot
 * hold a stale answer: a film landing makes the course appear on the next read
 * with no trigger and no backfill, and a course imported tomorrow with no film
 * is hidden without anybody remembering to hide it. A `boolean default true`
 * column would have shipped the opposite default — visible until somebody
 * notices — which is the hole this closes.
 *
 * `includeHidden` IS THE ADMIN'S, AND IT IS EXPLICIT. Defaulting to showing
 * everything and asking callers to opt into the filter would mean the next
 * surface that forgets shows an advisor sixteen empty courses. The caller that
 * wants the whole catalogue has to say so.
 */
export async function loadCourses(
  client: Client,
  opts: { includeHidden?: boolean } = {}
): Promise<CourseProgress[]> {
  let q = client
    .from("my_course_progress")
    .select(COURSE_COLS)
    .order("track", { ascending: true })
    .order("sort_order", { ascending: true });

  if (!opts.includeHidden) q = q.eq("visible", true);

  const { data } = await q;
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

  /*
   * READ THROUGH my_module_progress, NOT `module`.
   *
   * "Lessons open in order" has to mean the order the advisor SEES, and the
   * library no longer lists an empty module. Walking the raw `module` table
   * would hand them the next row in the table — which can be a module with
   * nothing in it, so "next" would open a placeholder over an empty deck and
   * the Next button would be the only way to reach a screen the list hides.
   *
   * Same filter as loadModules, deliberately: two surfaces disagreeing about
   * what the next lesson is would be the same defect as two definitions of
   * "module complete", which 0143 spent a migration collapsing into one.
   */
  const { data: siblings } = await client
    .from("my_module_progress")
    .select("module_id, module_name, sort_order, all_items")
    .eq("course_id", courseId)
    .gt("all_items", 0)
    .order("sort_order", { ascending: true });

  const mods = ((siblings ?? []) as Record<string, unknown>[]).map((m) => ({
    id: m.module_id,
    name: m.module_name,
    sort_order: m.sort_order,
  })) as Record<string, unknown>[];
  const here = mods.findIndex((m) => m.id === moduleId);
  const nextModule = here >= 0 ? mods[here + 1] : undefined;

  if (nextModule) {
    return {
      href: `/library/m/${nextModule.id as string}`,
      label: (nextModule.name as string) ?? "Next lesson",
      kind: "module",
    };
  }

  /* Last module in the course — step up to the next course THE ADVISOR CAN
     SEE. Read through my_course_progress for the same reason the sibling walk
     moved: handing them a course the library does not list is a dead end
     reachable only from here. */
  const { data: allCourses } = await client
    .from("my_course_progress")
    .select("course_id, name, slug, track, sort_order, visible")
    .eq("visible", true)
    .order("track", { ascending: true })
    .order("sort_order", { ascending: true });

  const courses = ((allCourses ?? []) as Record<string, unknown>[]).map((c) => ({
    id: c.course_id,
    name: c.name,
    slug: c.slug,
  })) as Record<string, unknown>[];
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

/**
 * One course's modules, in taught order. One query.
 *
 * EMPTY MODULES ARE NOT LISTED (Ryan's ruling, 5 October). `all_items > 0` is
 * the test, NOT `total_items > 0`: a cue-only module holds real material and is
 * listed as reinforcement, while a module holding nothing at all is a row an
 * advisor can tap into and find a placeholder and an empty deck. 33 modules
 * were in that state.
 *
 * The distinction is why 0160 added `all_items` instead of letting a surface
 * infer "empty" from the gating count — inferring it would have hidden the 83
 * cues sitting in cue-only modules inside film-bearing courses.
 */
export async function loadModules(
  client: Client,
  courseId: string,
  opts: { includeEmpty?: boolean } = {}
): Promise<ModuleProgress[]> {
  let q = client
    .from("my_module_progress")
    .select(MODULE_COLS)
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  if (!opts.includeEmpty) q = q.gt("all_items", 0);

  const { data } = await q;
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
      "id, type, title, body, tier, duration_sec, video_url, module_order, created_at, source, " +
        // What renditionsFor needs to sign both cuts — the same fields shapeVideo reads.
        "mux_playback_id, mux_playback_policy, vertical_playback_id, vertical_status",
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

  // One read for completion AND resume: furthest-reached and position, so a
  // half-watched lesson picks up where it was left — the same two fields the
  // morning seeds TrackedVideo with.
  const { data: progress } = ids.length
    ? await client
        .from("content_progress")
        .select("content_id, watched_pct, position_sec, completed_at")
        .in("content_id", ids)
    : { data: [] };

  const progressBy = new Map(
    ((progress ?? []) as Record<string, unknown>[]).map((r) => [r.content_id as string, r])
  );

  return {
    total: Number(count ?? rows.length),
    // renditionsFor is a local HMAC (no DB, no network), so minting one per video
    // row is cheap; it is awaited rather than mapped so the signing stays ordered.
    items: await Promise.all(
      rows.map(async (r, i) => {
        const type = r.type as ContentType;
        const pr = progressBy.get(r.id as string);
        const renditions = isVideoType(type) ? await renditionsFor(r) : null;
        return {
          id: r.id as string,
          type,
          title: (r.title as string) ?? "Untitled",
          body: (r.body as string | null) ?? null,
          tier: (r.tier as string | null) ?? null,
          durationSec: r.duration_sec == null ? null : Number(r.duration_sec),
          videoUrl: (r.video_url as string | null) ?? null,
          isVideo: isVideoType(type),
          renditions,
          watchedPct: pr?.watched_pct == null ? 0 : Number(pr.watched_pct),
          positionSec: pr?.position_sec == null ? null : Number(pr.position_sec),
          source: (r.source as string | null) ?? null,
          position: i + 1,
          completed: pr?.completed_at != null,
        };
      })
    ),
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
    /*
     * ONLY A MODULE THAT CAN BE FINISHED. The card says "Pick up where you left
     * off" and its button says Continue, so pointing it at a cue-only module —
     * which cannot complete, by 0143's gate — would be an invitation to a dead
     * end, and pointing it at an empty one would open a placeholder over an
     * empty deck. `total_items > 0` is the gating count, so this is the same
     * population the credential measures.
     */
    .gt("total_items", 0)
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

/**
 * THE GATING-MODULE POPULATION, DEFINED ONCE.
 *
 * A module gates when it holds at least one PUBLISHED item of a
 * gating_content_types() type. A cue-only module cannot complete —
 * moduleRequirementsMet refuses an empty gating set (0143) — so any surface or
 * rule that measures an advisor against "every module" is measuring them
 * against a population that can never finish. Found on 30 September: the
 * credential bar read "1 of 101" over a denominator holding 24 cue-only
 * modules, and craftComplete() made six of the nine core tracks unearnable.
 *
 * Four things read this set and MUST agree: craftComplete() in
 * lib/certification-server.ts, the credential bar, the core track tiles, and
 * the track page (both via lib/certifications.ts). Adding a fifth reader is
 * fine; adding a second definition is the defect this function closes.
 *
 * Takes whichever client the caller is entitled to: the advisor's own client
 * on the pages (entitlement RLS decides what exists for them), the service
 * role in the accrual (the credential needs the true answer).
 */
export async function gatingModuleIds(
  client: Client,
  moduleIds?: string[]
): Promise<Set<string>> {
  if (moduleIds && moduleIds.length === 0) return new Set();

  const out = new Set<string>();
  /* PostgREST puts `in` lists in the query string; 100 uuids per request is
     the batch size the rest of the codebase settled on. No filter means the
     whole catalog — one request, the content table holds ~3k rows. */
  const BATCH = 100;
  const batches = moduleIds
    ? Array.from({ length: Math.ceil(moduleIds.length / BATCH) }, (_, i) =>
        moduleIds.slice(i * BATCH, (i + 1) * BATCH)
      )
    : [null];

  for (const batch of batches) {
    let q = client
      .from("content")
      .select("module_id")
      .in("type", GATING_CONTENT_TYPES)
      .eq("status", "published")
      .is("retired_at", null)
      .not("module_id", "is", null)
      .limit(1000);
    if (batch) q = q.in("module_id", batch);
    const { data } = await q;
    for (const r of (data ?? []) as { module_id: string }[]) out.add(r.module_id);
  }
  return out;
}

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
