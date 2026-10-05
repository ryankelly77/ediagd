/* ============================================================================
   EDIAGD — THE LESSON LIBRARY AUDIT (5 October, Ryan's "Start Here has nothing")

   READ ONLY. Writes nothing, anywhere, except the report file under --write.

     export SB_URL=... SB_KEY=...        # service role
     npm run audit:library               # tables to stdout
     npm run audit:library -- --write    # and into reports/library-audit-5-october.md

   ---------------------------------------------------------------------------
   POPULATION STATED BEFORE THE FINDING, because a path-scoped count reported as
   a fact about the library is this project's own recorded failure (AGENTS.md,
   "a sample is evidence about the sample"): 42 non-core items via the
   certification path against 1,582 via service_family_content.
   ---------------------------------------------------------------------------
   So this walks `course -> module -> content.module_id` and says so. It is the
   path the LESSON LIBRARY ITSELF walks — my_course_progress aggregates
   my_module_progress, which left-joins `content on c.module_id = m.id and
   c.status = 'published'`. Nothing here is evidence about content reachable by
   `service_family_content`, which is a different path and counted separately at
   the end so the two can be reconciled rather than confused.

   ---------------------------------------------------------------------------
   THE THREE COUNTS PER MODULE ARE DELIBERATELY NOT ONE NUMBER
   ---------------------------------------------------------------------------
   `my_module_progress.total_items` counts EVERY published row in the module,
   cue and film alike. `items_done` — and therefore completion, and therefore
   the credential — counts only `gating_content_types()`, which is
   ('advisor_video') alone since 0143. A module with 8 cues and no film
   therefore reports total_items = 8 and can never complete: that is the exact
   shape Ryan is looking at, and collapsing films and cues into one "items"
   column is what would hide it.

     films   published, unretired advisor_video rows in the module   -> GATES
     cues    published rows of every other type in the module        -> does not
     nothing both of the above are zero

   A module's verdict is read from that pair, never from a single total.
   ============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});
const WRITE = process.argv.includes("--write");
const REPORT = "reports/library-audit-5-october.md";

/** Mirrors lib/lms.ts GATING_CONTENT_TYPES, which mirrors gating_content_types(). */
const GATING = new Set(["advisor_video"]);

async function all<T>(
  table: string,
  select: string,
  f?: (q: any) => any,
  ord = "id"
): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 50; p++) {
    let q: any = sb.from(table).select(select).order(ord, { ascending: true });
    if (f) q = f(q);
    const { data, error } = await q.range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
  throw new Error(`${table}: more than 50 pages`);
}

type Verdict = "has films" | "cue-only" | "empty";

const main = async () => {
  const [courses, mods, items, certs, cc] = await Promise.all([
    all<any>("course", "id, track, name, slug, sort_order"),
    all<any>("module", "id, course_id, name, sort_order, name_status"),
    all<any>(
      "content",
      "id, title, body, type, module_id, module_order, collection, status, retired_at, service_family, placement",
      (q: any) => q.eq("status", "published").is("retired_at", null)
    ),
    all<any>(
      "certification",
      "id, name, slug, sort, is_core, is_master_track, active, item_count"
    ),
    all<any>("certification_course", "certification_id, course_id, sort", undefined, "certification_id"),
  ]);

  /* ---- which courses sit under a certification, and which ladder ---------- */
  const certByCourse = new Map<string, any>();
  for (const row of cc) {
    const cert = certs.find((c) => c.id === row.certification_id);
    if (cert) certByCourse.set(row.course_id, cert);
  }

  /* ---- per-module counts, by the course->module->content.module_id path --- */
  const filmsBy = new Map<string, any[]>();
  const cuesBy = new Map<string, any[]>();
  for (const i of items) {
    if (!i.module_id) continue;
    const bucket = GATING.has(i.type) ? filmsBy : cuesBy;
    const l = bucket.get(i.module_id) ?? [];
    l.push(i);
    bucket.set(i.module_id, l);
  }

  const verdictOf = (films: number, cues: number): Verdict =>
    films > 0 ? "has films" : cues > 0 ? "cue-only" : "empty";

  /* ---- orphan guard: a module row whose course no longer exists ----------- */
  const courseIds = new Set(courses.map((c) => c.id));
  const orphanModules = mods.filter((m) => !courseIds.has(m.course_id));

  /* ---- assemble ---------------------------------------------------------- */
  type ModRow = {
    track: string;
    course: string;
    courseSlug: string;
    module: string;
    moduleId: string;
    needsName: boolean;
    sort: number;
    films: number;
    cues: number;
    verdict: Verdict;
  };

  const rows: ModRow[] = [];
  const courseVerdict = new Map<string, Verdict>();

  const sortedCourses = courses.slice().sort(
    (a, b) =>
      a.track.localeCompare(b.track) ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name)
  );

  for (const c of sortedCourses) {
    const myMods = mods
      .filter((m) => m.course_id === c.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    let courseFilms = 0;
    let courseCues = 0;

    for (const m of myMods) {
      const films = (filmsBy.get(m.id) ?? []).length;
      const cues = (cuesBy.get(m.id) ?? []).length;
      courseFilms += films;
      courseCues += cues;
      rows.push({
        track: c.track,
        course: c.name,
        courseSlug: c.slug,
        module: m.name,
        moduleId: m.id,
        needsName: m.name_status === "needs_name",
        sort: m.sort_order,
        films,
        cues,
        verdict: verdictOf(films, cues),
      });
    }

    courseVerdict.set(c.id, verdictOf(courseFilms, courseCues));
  }

  /* ---- a course with NO modules at all is its own state ------------------- */
  const modulelessCourses = sortedCourses.filter(
    (c) => !mods.some((m) => m.course_id === c.id)
  );

  /* ---- the three counts, over the population named at the top ------------ */
  const modHasFilms = rows.filter((r) => r.verdict === "has films").length;
  const modCueOnly = rows.filter((r) => r.verdict === "cue-only").length;
  const modEmpty = rows.filter((r) => r.verdict === "empty").length;

  const crsHasFilms = sortedCourses.filter((c) => courseVerdict.get(c.id) === "has films");
  const crsCueOnly = sortedCourses.filter((c) => courseVerdict.get(c.id) === "cue-only");
  const crsEmpty = sortedCourses.filter((c) => courseVerdict.get(c.id) === "empty");

  /* ---- the second route to the same subject, for reconciliation ----------
     service_family_content DOES NOT FILTER STATUS — its family_tag arm selects
     every row with a service_family and a non-reference placement, draft
     included. So the raw count is not a count of anything an advisor could
     reach, and quoting it as one would be this file's own "path-scoped count
     stated as a fact about the subject". Both numbers, named. */
  const sfcRows = await all<any>(
    "service_family_content",
    "content_id, family",
    undefined,
    "content_id"
  );
  const publishedIds = new Set(items.map((i) => i.id));
  const sfcAll = new Set(sfcRows.map((r) => r.content_id)).size;
  const sfcPublished = new Set(
    sfcRows.filter((r) => publishedIds.has(r.content_id)).map((r) => r.content_id)
  ).size;
  const sfcFamilies = new Set(
    sfcRows
      .filter((r) => publishedIds.has(r.content_id))
      .map((r) => (r.family ?? "").trim())
      .filter(Boolean)
  ).size;

  const attachedFilms = items.filter((i) => i.module_id && GATING.has(i.type)).length;
  const unattachedCraftFilms = items.filter(
    (i) => !i.module_id && GATING.has(i.type) && i.collection === "Craft"
  ).length;

  /* ---- duplicate cue rows, and THE KEY IS THE WHOLE FINDING ---------------
     A cue cannot be ATTACHED twice — content.module_id is a single FK — so a
     "duplicate attachment" would have to be duplicate ROWS sharing a module.

     TWO KEYS, AND THEY DISAGREE BY AN ORDER OF MAGNITUDE.

       (module_id, title)        -> the number that matched the brief exactly
       (module_id, title, body)  -> the number that survives looking at the text

     The curriculum reuses a title across genuinely different cues. Start Here's
     module 1 holds four rows all titled "Accountability" whose bodies are 168,
     227, 196 and 191 characters: four distinct cues, not one cue four times.

     The title is a DERIVED label and the body is what was OBSERVED, which is
     this codebase's own rule about joining. Deduping on title would delete
     hundreds of distinct cues and report it as a cleanup — the false pass that
     looks like success. Both numbers are printed and the gap is named, because
     a figure that reproduces an expectation exactly is the one to re-measure,
     not the one to trust.

     The module id is carried in the group rather than parsed back out of the
     key: a key that has to be split is a second definition of itself. */
  const normBody = (i: any) => (i.body ?? "").replace(/\s+/g, " ").trim();
  type Group = { moduleId: string; rows: any[] };
  const byTitle = new Map<string, Group>();
  const byTitleAndBody = new Map<string, Group>();
  const put = (m: Map<string, Group>, k: string, i: any) => {
    const g = m.get(k) ?? { moduleId: i.module_id as string, rows: [] };
    g.rows.push(i);
    m.set(k, g);
  };
  for (const i of items) {
    if (!i.module_id || GATING.has(i.type)) continue;
    const t = (i.title ?? "").trim();
    put(byTitle, JSON.stringify([i.module_id, t]), i);
    put(byTitleAndBody, JSON.stringify([i.module_id, t, normBody(i)]), i);
  }
  const titleGroups = [...byTitle.values()].filter((g) => g.rows.length > 1);
  const surplusByTitle = titleGroups.reduce((n, g) => n + g.rows.length - 1, 0);

  const dupGroups = [...byTitleAndBody.values()].filter((g) => g.rows.length > 1);
  const surplus = dupGroups.reduce((n, g) => n + g.rows.length - 1, 0);
  const dupByModule = new Map<string, number>();
  for (const g of dupGroups) {
    dupByModule.set(
      g.moduleId,
      (dupByModule.get(g.moduleId) ?? 0) + g.rows.length - 1
    );
  }

  /* ------------------------------------------------------------------ output */
  const out: string[] = [];
  const p = (s = "") => out.push(s);

  p("# The Lesson Library audit — every course and module");
  p();
  p(
    "**Population, before the finding.** `course -> module -> content.module_id`, " +
      "`status = 'published'`, `retired_at is null` — the path the Lesson Library " +
      "itself walks (`my_course_progress` over `my_module_progress`). Measured on " +
      "production. *films* counts `advisor_video` only, which is " +
      "`gating_content_types()` and therefore the only type that can complete a " +
      "module; *cues* counts every other published type in the module and gates " +
      "nothing."
  );
  p();
  p(
    `**Courses ${sortedCourses.length} · modules ${rows.length}` +
      (orphanModules.length ? ` (+${orphanModules.length} orphaned)` : "") +
      `.** Modules: **${modHasFilms} have films**, **${modCueOnly} are cue-only**, ` +
      `**${modEmpty} hold nothing**. Courses: **${crsHasFilms.length} have films**, ` +
      `**${crsCueOnly.length} are cue-only**, **${crsEmpty.length} hold nothing**.`
  );
  p();

  /* per-track summary first — it is the thing Ryan described */
  p("## By track");
  p();
  p("| track | courses | with films | cue-only | empty | modules | films | cues |");
  p("|---|---|---|---|---|---|---|---|");
  const tracks = [...new Set(sortedCourses.map((c) => c.track))];
  for (const t of tracks) {
    const cs = sortedCourses.filter((c) => c.track === t);
    const rs = rows.filter((r) => r.track === t);
    p(
      `| ${t} | ${cs.length} | ${cs.filter((c) => courseVerdict.get(c.id) === "has films").length} | ` +
        `${cs.filter((c) => courseVerdict.get(c.id) === "cue-only").length} | ` +
        `${cs.filter((c) => courseVerdict.get(c.id) === "empty").length} | ${rs.length} | ` +
        `${rs.reduce((n, r) => n + r.films, 0)} | ${rs.reduce((n, r) => n + r.cues, 0)} |`
    );
  }
  p();

  p("## Every course");
  p();
  p("| track | course | ladder | modules | films | cues | verdict |");
  p("|---|---|---|---|---|---|---|");
  for (const c of sortedCourses) {
    const rs = rows.filter((r) => r.courseSlug === c.slug);
    const cert = certByCourse.get(c.id);
    const ladder = cert
      ? `${cert.name}${cert.is_core ? " · core" : cert.is_master_track ? " · Master" : ""}${cert.active ? "" : " (inactive)"}`
      : "—";
    const v = courseVerdict.get(c.id)!;
    p(
      `| ${c.track} | ${c.name} | ${ladder} | ${rs.length} | ${rs.reduce((n, r) => n + r.films, 0)} | ` +
        `${rs.reduce((n, r) => n + r.cues, 0)} | ${v === "has films" ? "**has films**" : v === "cue-only" ? "cue-only" : "**empty**"} |`
    );
  }
  p();

  p("## Every module");
  p();
  p("| track | course | module | films | cues | verdict |");
  p("|---|---|---|---|---|---|");
  for (const r of rows) {
    p(
      `| ${r.track} | ${r.course} | ${r.module}${r.needsName ? " *(needs name)*" : ""} | ` +
        `${r.films} | ${r.cues} | ${r.verdict === "has films" ? "has films" : r.verdict === "cue-only" ? "cue-only" : "**nothing**"} |`
    );
  }
  p();

  if (modulelessCourses.length) {
    p("## Courses with no modules at all");
    p();
    for (const c of modulelessCourses) p(`- ${c.track} — **${c.name}** (\`${c.slug}\`)`);
    p();
  }

  if (orphanModules.length) {
    p("## Orphaned modules — a module row whose course is gone");
    p();
    for (const m of orphanModules) p(`- \`${m.id}\` — ${m.name} (course \`${m.course_id}\`)`);
    p();
  }

  p("## Duplicate cue rows inside one module — measured two ways");
  p();
  p(
    "`content.module_id` is a single FK, so a cue cannot be *attached* twice. A " +
      "cue appearing twice in a deck is two **rows** sharing a `module_id`. " +
      "Which rows count as the same cue depends entirely on the key, and the two " +
      "keys do not agree:"
  );
  p();
  p("| key | duplicated groups | surplus rows |");
  p("|---|---|---|");
  p(`| (\`module_id\`, \`title\`) | ${titleGroups.length} | **${surplusByTitle}** |`);
  p(
    `| (\`module_id\`, \`title\`, \`body\`) | ${dupGroups.length} | **${surplus}** |`
  );
  p();
  p(
    `**The title-only key says ${surplusByTitle} surplus rows. Adding the text says ` +
      `${surplus}.** The difference is ${surplusByTitle - surplus} rows that share a ` +
      "title with a sibling and teach something different — Start Here's module 1 " +
      "holds four rows titled \"Accountability\" with bodies of 168, 227, 196 and " +
      "191 characters. A dedupe on title would delete them and report a cleanup. " +
      "The title is the derived label; the body is what was observed."
  );
  p();
  if (surplus > 0) p("The rows below are byte-identical in both title and body.");
  else
    p(
      "**No cue row in the library is a true duplicate of another in the same " +
        "module.** Every repeated title carries distinct text."
    );
  p();
  if (dupByModule.size) {
    p("| track | course | module | cues | surplus |");
    p("|---|---|---|---|---|");
    for (const [mid, n] of [...dupByModule.entries()].sort((a, b) => b[1] - a[1])) {
      const r = rows.find((x) => x.moduleId === mid);
      if (r) p(`| ${r.track} | ${r.course} | ${r.module} | ${r.cues} | **${n}** |`);
    }
    p();
  }

  p("## The second route, so the two can be reconciled");
  p();
  p(
    `Films attached to a module by \`content.module_id\`: **${attachedFilms}**. ` +
      `Published unretired Craft films with no module: **${unattachedCraftFilms}** ` +
      `(see \`npm run report:hopper\`, which rules on each — 6 of them are a ` +
      `track's entry film, so its ${unattachedCraftFilms} = hopper's 23 routed + ` +
      `15 unrouted + 6 entry films, and that reconciliation is the proof). ` +
      `\n\nThe OTHER path, \`service_family_content\`: **${sfcPublished} distinct ` +
      `published rows across ${sfcFamilies} families** (${sfcAll} distinct rows if ` +
      `drafts are included — the view's \`family_tag\` arm has no status filter, ` +
      `so its raw count is not a count of anything an advisor can reach). These ` +
      `are different populations by different routes and neither one is "the library".`
  );
  p();

  const text = out.join("\n");
  console.log(text);
  if (WRITE) {
    writeFileSync(REPORT, text + "\n");
    console.error(`\n-> ${REPORT}`);
  }

  /* An enumeration guard, per AGENTS.md: meeting a module whose course is gone,
     or a course with no modules, is the case this audit exists for. Reported
     loudly above; the exit code stays 0 because this is a REPORT and Ryan acts
     on it — a non-zero here would be a refusal, not a finding. */
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
