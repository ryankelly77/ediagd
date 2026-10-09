/* ============================================================================
   EDIAGD — what the certification surfaces read
   SERVER ONLY (takes a Supabase client). Read side only; nothing here writes.

   The decisions still live in lib/certification.ts, which is pure. This file
   fetches and shapes, and calls that module for every judgement it needs —
   currency, the rung line, the credential — so the screens and the accrual
   agree about what "current" means by construction rather than by care.
============================================================================ */

import { loadStoryGate } from "@/lib/story";
import {
  certificationState,
  coreBuildLine,
  coreProgressLine,
  credentialCurrencyLine,
  earnedLine,
  type CertificationHolding,
  type CertificationState,
  type TrackRowInput,
} from "@/lib/certification";
import { pendingQuizzes } from "@/lib/loop";
import { gatingModuleIds } from "@/lib/lms";
import type { IsoDate } from "@/lib/gamification/streak";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type CertificationTile = {
  id: string;
  slug: string;
  name: string;
  kind: "craft" | "service";
  glyphKey: string;
  isCore: boolean;
  isMasterTrack: boolean;
  /** Content-derived and bar-aware. False means "not offered", never "failed". */
  active: boolean;
  sort: number;

  /** How many published items the track holds, per 0116. */
  itemCount: number;
  doneItems: number;
  totalModules: number;
  doneModules: number;

  /*
   * THE THIRD LEG — 3e. Carried on the tile so statusLine can name what is
   * actually outstanding instead of saying "Finishing up" to somebody who is
   * one paragraph short of eight months of work.
   */
  storyRequired: boolean;
  storySubmitted: boolean;

  earnedAt: string | null;
  /*
   * There is deliberately no `currentThrough` here.
   *
   * The DB column survives because it is NOT NULL and because we retire rather
   * than delete — but carrying it onto the tile would put a live-looking,
   * unread date in front of every screen, which is how a retired rule gets
   * wired back up by someone who assumes a field exists to be used. What the
   * screens need is earnedAt. See 0122.
   */
  state: CertificationState;
  /** "Earned 2027-03-14", or null when never earned. */
  currency: string | null;
};

export type CertificationsView = {
  tiles: CertificationTile[];
  /** "5 of 8 core — 3 from EDIAGD Certified." */
  rungLine: string;
  /** "4 of the 8 are still being built." Null when every core track is live. */
  buildLine: string | null;
  coreCount: number;
  coreHeld: number;
  credential: {
    level: "certified" | "master";
    certificateId: string;
    currentThrough: IsoDate;
    earnedAt: string;
    /** "Current through …" / "Renew to stay current" — the only clock left. */
    currency: string;
  } | null;
};

/**
 * Everything the certifications screen and the profile card need, in three
 * round trips: the catalogue, what the advisor holds, and the progress rollup
 * from 0117.
 *
 * THE CATALOGUE INCLUDES INACTIVE TRACKS. They render as "coming soon" rather
 * than being hidden, for the reason lib/badges.ts gives about future badges: a
 * track the advisor cannot start is not a track they are failing to finish, and
 * hiding it would make the wall change shape as Mitch writes content.
 */
export async function loadCertifications(
  client: Client,
  userId: string,
  today: IsoDate
): Promise<CertificationsView> {
  const [{ data: catalogue }, { data: held }, { data: progress }, storyGate, { data: cred }] =
    await Promise.all([
      client
        .from("certification")
        .select(
          "id, slug, name, kind, glyph_key, is_core, is_master_track, active, sort, item_count"
        )
        .order("sort"),
      client
        .from("advisor_certification")
        .select("certification_id, earned_at")
        .eq("user_id", userId),
      client.rpc("my_certification_progress"),
      /* The story gate. Read here rather than per tile so the flag is fetched
         once and the page cannot ask the same question two different ways. */
      loadStoryGate(client as never, userId),
      client
        .from("advisor_credential")
        .select("level, certificate_id, current_through, earned_at")
        .eq("user_id", userId)
        .eq("level", "certified")
        .maybeSingle(),
    ]);

  const heldBy = new Map(
    ((held ?? []) as {
      certification_id: string;
      earned_at: string;
    }[]).map((h) => [h.certification_id, h])
  );

  const progressBy = new Map(
    ((progress ?? []) as {
      certification_id: string;
      total_items: number;
      done_items: number;
      total_modules: number;
      done_modules: number;
    }[]).map((p) => [p.certification_id, p])
  );

  const tiles: CertificationTile[] = ((catalogue ?? []) as any[]).map((c) => {
    const mine = heldBy.get(c.id);
    const p = progressBy.get(c.id);
    /* The day it was earned is the only date a track has that means anything. */
    const earnedOn = ((mine?.earned_at as string | undefined)?.slice(0, 10) ?? null) as
      | IsoDate
      | null;

    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      kind: c.kind,
      glyphKey: c.glyph_key,
      isCore: c.is_core,
      isMasterTrack: c.is_master_track,
      active: c.active,
      sort: c.sort,
      itemCount: Number(c.item_count ?? 0),
      doneItems: Number(p?.done_items ?? 0),
      totalModules: Number(p?.total_modules ?? 0),
      doneModules: Number(p?.done_modules ?? 0),
      storyRequired: storyGate.storyRequired,
      storySubmitted: storyGate.toldFor.has(c.id as string),
      earnedAt: (mine?.earned_at as string | undefined) ?? null,
      state: certificationState({ earnedOn }),
      currency: earnedLine({ earnedOn }),
    };
  });

  /* THE WHOLE CORE, NOT THE EARNED PART OF IT. coreProgressLine takes the
     catalogue's core count for the same reason computeCredential does — handed
     a filtered list it would report progress against a denominator that shrank
     as content was withdrawn. */
  const coreTiles = tiles.filter((t) => t.isCore);
  const holdings: CertificationHolding[] = coreTiles.map((t) => ({
    slug: t.slug,
    isCore: true,
    earnedOn: (t.earnedAt?.slice(0, 10) as IsoDate | undefined) ?? null,
  }));

  /* "Still being built" means exactly what the Coming Soon grid holds: not
     earnable, and not already held. A core track somebody earned before the bar
     moved is not something Mitch still has to write, and counting it here would
     tell that advisor a track they hold is unfinished. */
  const unbuiltCore = coreTiles.filter((t) => !t.active && t.state === "unearned").length;

  return {
    tiles,
    rungLine: coreProgressLine(holdings, today, coreTiles.length),
    buildLine: coreBuildLine(coreTiles.length, unbuiltCore),
    coreCount: coreTiles.length,
    coreHeld: coreTiles.filter((t) => t.state === "held").length,
    credential: cred
      ? {
          level: cred.level,
          certificateId: cred.certificate_id,
          currentThrough: cred.current_through,
          earnedAt: cred.earned_at,
          currency: credentialCurrencyLine(cred.current_through as IsoDate, today),
        }
      : null,
  };
}

/* ---------------------------------------------------------------------------
   THE PAGE THAT SAYS WHERE YOU STAND — 30 September
--------------------------------------------------------------------------- */

/**
 * A module row as the certifications surfaces see it, with the one distinction
 * the wall was blind to: whether the module GATES. A module gates when it holds
 * at least one published gating item (a film — gating_content_types()); a
 * cue-only module is reinforcement, cannot complete under 0143's rule, and must
 * never sit in a denominator an advisor is measured against.
 */
export type TrackModuleRow = {
  moduleId: string;
  name: string;
  sortOrder: number;
  courseRank: number;
  gates: boolean;
  totalItems: number;
  completedItems: number;
  state: "not_started" | "quiz_waiting" | "complete" | "reinforcement";
  hasQuiz: boolean;
  quizPassed: boolean;
};

export type CoreTrackTile = CertificationTile & {
  /**
   * "Next: quiz for 1. The Walk-Around Routine" / "Next: Part 2" /
   * "Story to write" / "More lessons on the way". Null when the track is held
   * (the earned line speaks) or not yet active ("Coming soon" speaks).
   *
   * WHICH module is next comes from the same walk the loop makes — course
   * sort, then module sort — and WHETHER it is a quiz comes from
   * pendingQuizzes() in lib/loop.ts. This function decides neither; it only
   * reads the answers, so the morning and this page cannot disagree about
   * what is next.
   */
  nextLine: string | null;
  gatingModules: number;
  gatingDone: number;
};

/**
 * The tile, as trackRowProgress() wants it — the lessons line and the progress
 * bar a row renders (0162).
 *
 * ONE ADAPTER, HERE, and not in the page: the core row, the Master row and the
 * acceptance suite all go through it, so none of them can pass a different
 * count and none can drift from the others. A suite that rebuilt this mapping
 * itself would be testing its own copy.
 */
export function trackRowInput(tile: CoreTrackTile): TrackRowInput {
  return {
    held: tile.state !== "unearned",
    active: tile.active,
    gatingDone: tile.gatingDone,
    gatingModules: tile.gatingModules,
    earnedLine: tile.currency,
  };
}

export type CertificationsOverview = CertificationsView & {
  /** The nine, in certification.sort order — the order the loop walks. */
  coreTracks: CoreTrackTile[];
  masterActive: CoreTrackTile[];
  masterSoon: CertificationTile[];
  serviceActive: CertificationTile[];
  serviceSoon: CertificationTile[];
  /** The credential bar: completed GATING modules over gating modules across
      the nine core tracks — the exact population craftComplete() requires
      (gatingModuleIds in lib/lms.ts), so the bar and the credential cannot
      disagree in either direction. */
  coreModulesDone: number;
  coreModulesTotal: number;
};

type ModuleProgressRow = {
  module_id: string;
  course_id: string;
  module_name: string;
  sort_order: number;
  items_done: boolean;
  has_quiz: boolean;
  quiz_passed: boolean;
  completed_at: string | null;
  total_items: number;
  completed_items: number;
};

/**
 * The per-module facts every certification surface needs, fetched once:
 * my_module_progress for the signed-in advisor, the course→certification map,
 * and which modules hold a gating item. READ AS THE ADVISOR — the view is
 * scoped to auth.uid() and the content read goes through entitlement RLS, so
 * a rooftop that never bought the product shows a wall with nothing behind it
 * rather than somebody else's progress.
 */
async function loadModuleFacts(client: Client) {
  const [{ data: mp }, { data: ccRows }, gated] = await Promise.all([
    client
      .from("my_module_progress")
      .select(
        "module_id, course_id, module_name, sort_order, items_done, has_quiz, quiz_passed, completed_at, total_items, completed_items"
      )
      .limit(1000),
    client.from("certification_course").select("certification_id, course_id, sort"),
    /* THE ONE DEFINITION of which modules gate — the same set craftComplete()
       requires — read through the advisor's entitlement. */
    gatingModuleIds(client as never),
  ]);
  const byCourse = new Map<string, { certId: string; sort: number }[]>();
  for (const cc of (ccRows ?? []) as {
    certification_id: string;
    course_id: string;
    sort: number;
  }[]) {
    const list = byCourse.get(cc.course_id) ?? [];
    list.push({ certId: cc.certification_id, sort: cc.sort });
    byCourse.set(cc.course_id, list);
  }

  return {
    moduleRows: (mp ?? []) as ModuleProgressRow[],
    gated,
    byCourse,
  };
}

function toTrackModule(m: ModuleProgressRow, gates: boolean, courseRank: number): TrackModuleRow {
  const state: TrackModuleRow["state"] = !gates
    ? "reinforcement"
    : m.completed_at
      ? "complete"
      : m.items_done && m.has_quiz && !m.quiz_passed
        ? "quiz_waiting"
        : "not_started";
  return {
    moduleId: m.module_id,
    name: m.module_name,
    sortOrder: Number(m.sort_order ?? 0),
    courseRank,
    gates,
    totalItems: Number(m.total_items ?? 0),
    completedItems: Number(m.completed_items ?? 0),
    state,
    hasQuiz: Boolean(m.has_quiz),
    quizPassed: Boolean(m.quiz_passed),
  };
}

/** A track's modules in the order the loop serves them. */
function modulesForCert(
  certId: string,
  facts: Awaited<ReturnType<typeof loadModuleFacts>>
): TrackModuleRow[] {
  const out: TrackModuleRow[] = [];
  for (const m of facts.moduleRows) {
    const links = facts.byCourse.get(m.course_id) ?? [];
    const link = links.find((l) => l.certId === certId);
    if (!link) continue;
    out.push(toTrackModule(m, facts.gated.has(m.module_id), link.sort));
  }
  return out.sort(
    (a, b) =>
      a.courseRank - b.courseRank ||
      a.sortOrder - b.sortOrder ||
      a.moduleId.localeCompare(b.moduleId)
  );
}

/**
 * Everything the rebuilt /certifications page renders. One call.
 */
export async function loadCertificationsOverview(
  client: Client,
  userId: string,
  today: IsoDate
): Promise<CertificationsOverview> {
  const [view, facts, pending] = await Promise.all([
    loadCertifications(client, userId, today),
    loadModuleFacts(client),
    pendingQuizzes(client as never),
  ]);

  const pendingByModule = new Set(pending.map((p) => p.moduleId));

  /* One decorator for every craft tile, core and Master alike, so no row can
     grow its own arithmetic. */
  const decorate = (t: CertificationTile): CoreTrackTile => {
    const modules = modulesForCert(t.id, facts);
    const gating = modules.filter((m) => m.gates);
    const gatingDone = gating.filter((m) => m.state === "complete").length;

    let nextLine: string | null = null;
    if (t.state === "unearned" && t.active) {
      /* The loop's walk: the first gating module that is not complete. */
      const nextModule = gating.find((m) => m.state !== "complete");
      if (nextModule) {
        nextLine = pendingByModule.has(nextModule.moduleId)
          ? `Next: quiz for ${nextModule.name}`
          : `Next: ${nextModule.name}`;
      } else if (gating.length === 0) {
        /* Power of Positive Language today: cues only. Not a failure. */
        nextLine = "Lessons on the way";
      } else if (t.storyRequired && !t.storySubmitted) {
        nextLine = "Story to write";
      } else {
        /* Every filmed lesson done; what remains is content still landing
           (cue-only modules, unfilmed lessons). Their queue, not the
           advisor's. */
        nextLine = "More lessons on the way";
      }
    }

    return { ...t, nextLine, gatingModules: gating.length, gatingDone };
  };

  const coreTracks: CoreTrackTile[] = view.tiles
    .filter((t) => t.isCore)
    .sort((a, b) => a.sort - b.sort)
    .map(decorate);

  /* THE CREDENTIAL BAR COUNTS WHAT craftComplete() COUNTS: gating modules —
     lessons — and nothing else. It used to sum every module and read
     "1 of 101" over a denominator holding 24 cue-only modules that can never
     complete (0143): a bar that could not fill, over six tracks that could
     not be earned. One population, four readers: craftComplete(), this bar,
     the tiles, the track page. */
  const coreModulesDone = coreTracks.reduce((n, t) => n + t.gatingDone, 0);
  const coreModulesTotal = coreTracks.reduce((n, t) => n + t.gatingModules, 0);

  const master = view.tiles.filter((t) => t.isMasterTrack);
  const service = view.tiles.filter((t) => t.kind === "service");

  return {
    ...view,
    coreTracks,
    masterActive: master
      .filter((t) => t.active || t.state !== "unearned")
      .map(decorate),
    masterSoon: master.filter((t) => !t.active && t.state === "unearned"),
    serviceActive: service.filter((t) => t.active || t.state !== "unearned"),
    serviceSoon: service.filter((t) => !t.active && t.state === "unearned"),
    coreModulesDone,
    coreModulesTotal,
  };
}

export type TrackDetail = {
  id: string;
  slug: string;
  name: string;
  kind: "craft" | "service";
  glyphKey: string;
  active: boolean;
  isCore: boolean;
  isMasterTrack: boolean;
  state: CertificationState;
  /** "Earned 2027-03-14", or null. */
  earnedLine: string | null;
  /** True when the track is not yet earnable — render the coming-soon body,
      no modules, no progress, no links. */
  comingSoon: boolean;
  entryFilm: { contentId: string; title: string; watched: boolean } | null;
  modules: TrackModuleRow[];
  gatingDone: number;
  gatingTotal: number;
  storyRequired: boolean;
  storySubmitted: boolean;
};

/**
 * One track, for /certifications/[slug]: what completing it takes, in the
 * order the loop will serve it.
 *
 * EVERY READ IS THE ADVISOR'S OWN CLIENT. This page states personal progress,
 * and the RLS-filtered view is the only honest source — a service-role read
 * here would happily render somebody a wall their rooftop never bought.
 */
export async function loadTrackDetail(
  client: Client,
  userId: string,
  slug: string
): Promise<TrackDetail | null> {
  const { data: cert } = await client
    .from("certification")
    .select(
      "id, slug, name, kind, glyph_key, active, is_core, is_master_track, entry_film_content_id"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!cert) return null;

  const { data: held } = await client
    .from("advisor_certification")
    .select("earned_at")
    .eq("user_id", userId)
    .eq("certification_id", cert.id)
    .maybeSingle();

  const earnedOn = ((held?.earned_at as string | undefined)?.slice(0, 10) ?? null) as
    | IsoDate
    | null;
  const state = certificationState({ earnedOn });
  const comingSoon = !cert.active && state === "unearned";

  /* A track that is not yet earnable shows no progress and no module links —
     nothing behind it is the advisor's to do, and a list of locked rows would
     read as a backlog. */
  if (comingSoon || cert.kind === "service") {
    return {
      id: cert.id,
      slug: cert.slug,
      name: cert.name,
      kind: cert.kind,
      glyphKey: cert.glyph_key,
      active: cert.active,
      isCore: cert.is_core,
      isMasterTrack: cert.is_master_track,
      state,
      earnedLine: earnedLine({ earnedOn }),
      comingSoon,
      entryFilm: null,
      modules: [],
      gatingDone: 0,
      gatingTotal: 0,
      storyRequired: false,
      storySubmitted: false,
    };
  }

  const [facts, storyGate] = await Promise.all([
    loadModuleFacts(client),
    loadStoryGate(client as never, userId),
  ]);
  const modules = modulesForCert(cert.id as string, facts);
  const gating = modules.filter((m) => m.gates);

  /* The entry film, when Mitch has ruled one. Watched-ness is the advisor's
     own content_progress row — the same record the loop reads. */
  let entryFilm: TrackDetail["entryFilm"] = null;
  if (cert.entry_film_content_id) {
    const [{ data: film }, { data: seen }] = await Promise.all([
      client
        .from("content")
        .select("id, title")
        .eq("id", cert.entry_film_content_id)
        .eq("status", "published")
        .is("retired_at", null)
        .maybeSingle(),
      client
        .from("content_progress")
        .select("content_id")
        .eq("user_id", userId)
        .eq("content_id", cert.entry_film_content_id)
        .not("completed_at", "is", null)
        .maybeSingle(),
    ]);
    if (film) {
      entryFilm = {
        contentId: film.id as string,
        title: (film.title as string) ?? "The entry film",
        watched: Boolean(seen),
      };
    }
  }

  return {
    id: cert.id,
    slug: cert.slug,
    name: cert.name,
    kind: cert.kind,
    glyphKey: cert.glyph_key,
    active: cert.active,
    isCore: cert.is_core,
    isMasterTrack: cert.is_master_track,
    state,
    earnedLine: earnedLine({ earnedOn }),
    comingSoon: false,
    entryFilm,
    modules,
    gatingDone: gating.filter((m) => m.state === "complete").length,
    gatingTotal: gating.length,
    storyRequired: storyGate.storyRequired,
    storySubmitted: storyGate.toldFor.has(cert.id as string),
  };
}

/* ---------------------------------------------------------------------------
   THE STORY WAITS FOR THE LESSONS — 8 October
--------------------------------------------------------------------------- */

/**
 * Is the track's teaching finished — the condition the Good News Story waits on?
 *
 * ---------------------------------------------------------------------------
 * THE POPULATION IS GATING MODULES, AND `my_certification_progress` IS NOT IT
 * ---------------------------------------------------------------------------
 * The obvious reading of "every module complete" is 0117's rollup —
 * `done_modules >= total_modules`, which the story page already read for its
 * hero line. That rollup's `mods` CTE is `certification_course join module` with
 * NO gating filter, so its denominator holds cue-only modules. A cue-only module
 * can never earn a `module_completion` row (0143: moduleRequirementsMet refuses
 * an empty gating set), so on any track holding one the comparison is false
 * FOREVER.
 *
 * Measured on production, 8 October, craft tracks only:
 *
 *     track                              0117  gating  cue-only  reachable?
 *     craft-walk-around                    13      12         1  NEVER  [core]
 *     craft-setting-up-the-mpi             11      10         1  NEVER  [core]
 *     craft-four-step-close                13      11         2  NEVER  [core]
 *     craft-success-cycle                  20      13         7  NEVER  [core]
 *     craft-overcoming-objections          15      12         3  NEVER  [core]
 *     craft-power-of-positive-language      7       0         7  NEVER  [core]
 *     craft-lasting-impressions            13      13         0  yes    [core]
 *     craft-name-tag                       11      11         0  yes    [core]
 *     craft-menus                          10      10         0  yes    [core]
 *     craft-chemical-warranty              18      12         6  NEVER  [master]
 *     craft-phones-and-tones               12      12         0  yes    [master]
 *
 * SIX OF THE NINE CORE TRACKS. That is not a new number — it is the 30 September
 * incident verbatim, recorded in lib/lms.ts: requiring every module "made six of
 * the nine core tracks structurally unearnable". Keying the story lock on that
 * rollup would have locked the leg permanently on the same six, and locked it
 * SILENTLY: no error, no log, just a row that never opens.
 *
 * So the gate is the gating-module population — `gatingModuleIds()`, the one
 * definition — which is also exactly what craftModuleProgress() feeds the
 * credential. The story is the last leg before the credential, so "lessons done"
 * here MUST mean what the credential means by it, or an advisor is told to write
 * their story by one surface and refused by another.
 */
export type StoryLessons = {
  gatingDone: number;
  gatingTotal: number;
  /** done >= total, over a non-empty gating population. */
  complete: boolean;
};

/**
 * The comparison, written once so the four readers cannot each grow their own.
 *
 * `gatingTotal > 0` IS LOAD-BEARING, and not for tidiness: `every()` over an
 * empty set is true, which would open the story on a track whose films have not
 * been shot. Power of Positive Language is that track today — seven modules,
 * every one cue-only — and its tile already says "Lessons on the way".
 * certificationEarned() refuses the empty set for the same reason.
 */
export function storyLessonsMet(gatingDone: number, gatingTotal: number): boolean {
  return gatingTotal > 0 && gatingDone >= gatingTotal;
}

/**
 * The gate for ONE track, for the SIGNED-IN advisor.
 *
 * ---------------------------------------------------------------------------
 * NO `userId` PARAMETER, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * `my_module_progress` is scoped to `auth.uid()`, so the viewer is the session
 * and there is nothing to pass. A `userId` argument would be a parameter the
 * function accepts and then ignores — which is how a gate ends up keyed on a
 * role that excludes the viewer it exists to protect, three times in this
 * codebase already.
 *
 * HANDED THE SERVICE CLIENT IT FAILS CLOSED, deliberately: `auth.uid()` is null
 * there, no module reads as complete, and the answer is "not finished". A gate
 * that opened for the backend would be the has_performance_surface() mistake
 * pointing the other way. Nothing server-side writes a story, so this costs
 * nothing today and refuses rather than invents if something ever does.
 */
export async function loadStoryLessons(
  client: Client,
  certificationId: string
): Promise<StoryLessons> {
  const facts = await loadModuleFacts(client);
  const gating = modulesForCert(certificationId, facts).filter((m) => m.gates);
  const gatingDone = gating.filter((m) => m.state === "complete").length;
  return {
    gatingDone,
    gatingTotal: gating.length,
    complete: storyLessonsMet(gatingDone, gating.length),
  };
}

export type CredentialCard = {
  level: "certified" | "master";
  certificateId: string;
  currentThrough: IsoDate;
  /** "Current through …" / "Renew to stay current". */
  currency: string;
  /** "8 of 8 core — EDIAGD Certified" */
  rungLine: string;
  /** How many certifications they hold in total, current or lapsed. */
  held: number;
};

/**
 * The profile card's data, without paying for the whole wall.
 *
 * NO CREDENTIAL MEANS NO CARD, so this returns null rather than an empty shape —
 * a profile section reading "Credential: none" tells an advisor they are missing
 * something, when the truth today is that four core tracks have no content
 * behind them and nobody in the company can hold one.
 *
 * Three narrow reads instead of loadCertifications' four wide ones: the profile
 * page already runs eight queries of its own and does not need the catalogue.
 */
export async function loadCredentialCard(
  client: Client,
  userId: string,
  today: IsoDate
): Promise<CredentialCard | null> {
  const { data: cred } = await client
    .from("advisor_credential")
    .select("level, certificate_id, current_through")
    .eq("user_id", userId)
    .order("level")
    .limit(1)
    .maybeSingle();

  if (!cred) return null;

  const [{ data: core }, { data: held }] = await Promise.all([
    client.from("certification").select("id, slug").eq("is_core", true),
    client
      .from("advisor_certification")
      .select("certification_id, earned_at")
      .eq("user_id", userId),
  ]);

  const coreRows = (core ?? []) as { id: string; slug: string }[];
  const heldRows = (held ?? []) as {
    certification_id: string;
    earned_at: string;
  }[];
  const heldBy = new Map(
    heldRows.map((h) => [h.certification_id, h.earned_at.slice(0, 10)])
  );

  const holdings: CertificationHolding[] = coreRows.map((c) => ({
    slug: c.slug,
    isCore: true,
    earnedOn: (heldBy.get(c.id) as IsoDate | undefined) ?? null,
  }));

  return {
    level: cred.level,
    certificateId: cred.certificate_id,
    currentThrough: cred.current_through,
    currency: credentialCurrencyLine(cred.current_through as IsoDate, today),
    rungLine: coreProgressLine(holdings, today, coreRows.length),
    held: heldRows.length,
  };
}

/**
 * What a manager may see about somebody else: the credential, and nothing else.
 *
 * Deliberately NOT the per-track progress. A roster is a list of who holds a
 * credential, not a coaching dashboard about how far through a colleague is,
 * and advisor_credential's own RLS policy is what decides whether the row comes
 * back at all — this function adds no filter of its own and would return
 * nothing for an advisor the caller cannot see.
 */
export async function loadCredentialPills(
  client: Client,
  userIds: string[]
): Promise<Map<string, "Certified" | "Master Certified">> {
  const out = new Map<string, "Certified" | "Master Certified">();
  if (userIds.length === 0) return out;

  const { data } = await client
    .from("advisor_credential")
    .select("user_id, level")
    .in("user_id", userIds);

  for (const row of (data ?? []) as { user_id: string; level: string }[]) {
    /* Master outranks certified if somebody ever holds both. */
    if (row.level === "master") out.set(row.user_id, "Master Certified");
    else if (!out.has(row.user_id)) out.set(row.user_id, "Certified");
  }
  return out;
}
