/* ============================================================================
   EDIAGD — THE HOPPER, with the unattached-films column (2 October list, 19)

   READ ONLY. Writes nothing, anywhere.

     export SB_URL=... SB_KEY=...      # service role
     npm run report:hopper             # table to stdout
     npm run report:hopper -- --write  # and into reports/unhomed-series-for-mitch.md

   ---------------------------------------------------------------------------
   WHY THIS EXISTS, WHICH IS THE WHOLE POINT OF ITEM 19
   ---------------------------------------------------------------------------
   The hopper's "videos" column counted films ATTACHED TO MODULES, and that
   measurement wearing the name "films" is what hid TWELVE published Success
   Cycle films. On the day the table said Success Cycle had none, it had
   twelve — "no video at all" was true of the modules and false of the library.
   Two measurements, one name; `duration_sec` in AGENTS.md is the same lesson.

   So the table now carries THREE numbers and the population line names all
   three, because any single one of them read as "what exists" is wrong:

     attached              published films sitting in one of the track's modules
     unattached-matching   published films whose SERIES belongs to this track
                           by a ruling, and which are in no module
     cues                  published non-film items in the track's modules

   ---------------------------------------------------------------------------
   AN OPENER IS HOMED WITHOUT BEING ATTACHED, AND THAT IS A FOURTH STATE
   ---------------------------------------------------------------------------
   A track's opener lives on `certification.entry_film_content_id`, so its
   `module_id` is null FOREVER by design (0159, and 0132 before it). Counting
   module_id-is-null as "unattached" would therefore report every opener as
   homeless the moment it was correctly homed — the same defect this script was
   written to fix, one column over.
   So a film is HOMED if it is in a module OR it is some track's entry film,
   and `entry` is reported as its own column rather than folded into either.

   ---------------------------------------------------------------------------
   THE ROUTING TABLE IS A DECLARED LIST, AND MEETING SOMETHING NEW IS AN ERROR
   ---------------------------------------------------------------------------
   "Unattached films whose series name matches the track" needs a series->track
   answer, and a fuzzy match is not one: a slate names the shoot, not the
   curriculum, and this project has five near-misses in one week on exactly
   that (Coverage is Key belongs to Chemical Warranty; Name Tag's films and its
   quiz describe different things). So the mapping is Ryan and Mitch's rulings,
   written down, with the evidence beside each.

   And because a check that enumerates a fixed list must FAIL when it meets
   something the list does not mention — `check:nav` said nothing about three
   new routes, which on a terminal reads identically to passing — an unattached
   film whose series is in neither table EXITS NON-ZERO and is named. A newly
   ingested film nobody has routed is precisely the case this exists for, so
   meeting one is the moment to be loudest.
   ============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});
const WRITE = process.argv.includes("--write");
const REPORT = "reports/unhomed-series-for-mitch.md";

/* ---------------------------------------------------------------------------
   SERIES -> TRACK. Rulings, each with the evidence that settled it.
   --------------------------------------------------------------------------- */
const ROUTED: Record<string, string> = {
  /* Walk Around — one routine named by its length, not three routines
     (2 October list, item 14). Two Minute Part 1: "This is adding one step.
     Step 8... Steps 1 through 7 are exactly the same." */
  "30 Second Walk-Around": "Walk Around",
  "Two Minute Walk-Around": "Walk Around",
  "The Four Minute Walk-Around": "Walk Around",

  /* 0144's attaches, by slate */
  "Get the Hell Out of Here": "Setting up the MPI",
  "Four Step Close": "Four Step Close",
  "Success Cycle": "Success Cycle",
  "Selling Skills": "Overcoming Objections",
  "Overcoming Objections": "Overcoming Objections",

  /* Menus */
  "Menu Wrap-Up": "Menus",
  Menus: "Menus",
  "The OE Approach": "Menus",
  "The OE Stagger": "Menus",
  "Dealer Upsell Menus and Interval Charts": "Menus",

  "Lasting Impressions": "Lasting Impressions",
  "Name Tag": "Name Tag",
  "Setting up the MPI": "Setting up the MPI",

  /* AGENTS.md's slate table: the slate says Coverage is Key, the curriculum is
     Chemical Warranty. Caught by the identification pass. */
  "Coverage is Key": "Chemical Warranty",

  /* A Master track, defined and active, though not core. */
  "Phones and Tones": "Phones and Tones",
};

/* ---------------------------------------------------------------------------
   DECLARED AS NOT ROUTED, WITH THE REASON. Not the same as "unknown": these
   are films somebody has looked at and deliberately not homed.
   --------------------------------------------------------------------------- */
const UNROUTED_REASON: Record<string, string> = {
  CSI: "6 films against 12 quiz parts; Master-track-or-skill-library is Ryan and Mitch's October ruling (ingest-30-september.md)",
  "Pre-Write": "wired as a rung-2 stage fallback for the pitch lookup (mapping_alias), not a track lesson",
  "Sing It": "candidate curriculum for Power of Positive Language; a deck name is a label and the ruling is Ryan's (2 October list, item 11)",
  "Wrap-Up": "candidate curriculum for Power of Positive Language; same ruling",
  "Strawberry Lemonade": "no series and no track named for it; never routed",
  "The Big Ticket Visit": "no track named for it; IMG_2249 names itself in sentence one and then teaches the pre-write packet (identify-videos ruling)",
  "You Cannot Lose": "a MINDSET quote film carrying collection=Craft; the attribution is unresolved ('unattributed') and it is a holds-list item, not a lesson",
};

/**
 * The series a film announces — the title's outermost prefix, before its part
 * number or its subject. Derived, and only ever used to LOOK UP a ruling;
 * never to conclude one.
 *
 * ---------------------------------------------------------------------------
 * THE SHORTEST CANDIDATE WINS, AND TRYING THE SPLITS IN ORDER DOES NOT WORK
 * ---------------------------------------------------------------------------
 * Two delimiters are in use and neither is reliably outermost, so any fixed
 * precedence is wrong for half the library. Caught by this script's own
 * unknown-series guard on first run, which is the argument for the guard:
 *
 *   "CSI — Upon Arrival, Part 3"                  part-first -> "CSI — Upon Arrival"   WRONG
 *                                                 dash-first -> "CSI"                  right
 *   "Overcoming Objections, Part 2 — How to…"     dash-first -> "Overcoming Objections, Part 2"  WRONG
 *                                                 part-first -> "Overcoming Objections"          right
 *
 * The series is the OUTERMOST prefix, so the shortest candidate is the answer
 * and no precedence has to be guessed.
 */
function seriesOf(title: string): string {
  const oc = title.match(/^(.*?) — (?:Opener|Closer)$/);
  if (oc) return oc[1];
  const candidates = [
    title.match(/^(.*?), Part \d+/)?.[1],
    title.match(/^(.*?) — /)?.[1],
  ].filter((s): s is string => Boolean(s));
  if (candidates.length === 0) return title;
  return candidates.reduce((a, b) => (b.length < a.length ? b : a));
}

async function all<T>(table: string, select: string, f?: (q: any) => any, ord = "id"): Promise<T[]> {
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

const main = async () => {
  const certs = await all<any>(
    "certification",
    "id, name, slug, sort, is_core, is_master_track, active, item_count, entry_film_content_id"
  );
  const cc = await all<any>(
    "certification_course",
    "certification_id, course_id, sort",
    undefined,
    "certification_id"
  );
  const mods = await all<any>("module", "id, course_id, name, sort_order");
  const items = await all<any>(
    "content",
    "id, title, type, module_id, collection, status, retired_at",
    (q: any) => q.eq("status", "published").is("retired_at", null)
  );

  const entryFilmIds = new Set(
    certs.map((c) => c.entry_film_content_id).filter(Boolean) as string[]
  );

  /* modules per certification */
  const modsByCert = new Map<string, Set<string>>();
  for (const c of certs) {
    const courseIds = cc
      .filter((x) => x.certification_id === c.id)
      .map((x) => x.course_id);
    modsByCert.set(
      c.id,
      new Set(mods.filter((m) => courseIds.includes(m.course_id)).map((m) => m.id))
    );
  }

  /* ---- the unattached population, and the enumeration guard -------------- */
  const unattached = items.filter(
    (i) =>
      i.type === "advisor_video" &&
      i.collection === "Craft" &&
      i.module_id === null &&
      !entryFilmIds.has(i.id)
  );

  const unknown: { title: string; series: string }[] = [];
  const unattachedByTrack = new Map<string, string[]>();
  const unroutedByReason = new Map<string, string[]>();

  for (const f of unattached) {
    const s = seriesOf(f.title);
    if (ROUTED[s]) {
      const l = unattachedByTrack.get(ROUTED[s]) ?? [];
      l.push(f.title);
      unattachedByTrack.set(ROUTED[s], l);
    } else if (UNROUTED_REASON[s]) {
      const l = unroutedByReason.get(s) ?? [];
      l.push(f.title);
      unroutedByReason.set(s, l);
    } else {
      unknown.push({ title: f.title, series: s });
    }
  }

  /* ---- the three measurements, per track --------------------------------- */
  type Row = {
    name: string;
    ladder: string;
    attached: number;
    unattachedMatching: number;
    cues: number;
    entry: boolean;
    active: boolean;
    itemCount: number;
  };
  const rows: Row[] = [];
  for (const c of certs.filter((x) => x.is_core || x.is_master_track)) {
    const mine = modsByCert.get(c.id) ?? new Set<string>();
    const inMine = items.filter((i) => i.module_id && mine.has(i.module_id));
    rows.push({
      name: c.name,
      ladder: c.is_core ? "core" : "Master",
      attached: inMine.filter((i) => i.type === "advisor_video").length,
      unattachedMatching: (unattachedByTrack.get(c.name) ?? []).length,
      cues: inMine.filter((i) => i.type !== "advisor_video").length,
      entry: Boolean(c.entry_film_content_id),
      active: c.active,
      itemCount: c.item_count,
    });
  }
  rows.sort(
    (a, b) =>
      a.ladder.localeCompare(b.ladder) ||
      b.attached - a.attached ||
      a.name.localeCompare(b.name)
  );

  /* ---- render ------------------------------------------------------------ */
  const totalAttached = rows.reduce((n, r) => n + r.attached, 0);
  const totalUnatt = rows.reduce((n, r) => n + r.unattachedMatching, 0);
  const totalCues = rows.reduce((n, r) => n + r.cues, 0);
  const unroutedTotal = [...unroutedByReason.values()].reduce((n, l) => n + l.length, 0);

  const L: string[] = [];
  L.push(`| track | ladder | attached | unattached-matching | cues | entry film | active |`);
  L.push(`|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    L.push(
      `| ${r.name} | ${r.ladder} | **${r.attached}** | ${
        r.unattachedMatching || "—"
      } | ${r.cues} | ${r.entry ? "yes" : "—"} | ${r.active ? "yes" : "**no**"} |`
    );
  }
  L.push("");
  L.push(
    `**Population — three measurements, and no single one of them is "what ` +
      `exists".** *attached* counts published, unretired \`advisor_video\` rows ` +
      `whose \`module_id\` is a module of one of the track's courses: ` +
      `**${totalAttached}** across these tracks. *unattached-matching* counts ` +
      `published films carrying no \`module_id\` whose **series** is routed to ` +
      `the track by a ruling in \`scripts/hopper.ts\`: **${totalUnatt}**. ` +
      `*cues* counts published non-film items in those same modules: ` +
      `**${totalCues}**. A track's **opener** is neither — it lives on ` +
      `\`certification.entry_film_content_id\` and its \`module_id\` is null by ` +
      `design, so it is reported in its own column and excluded from ` +
      `"unattached" rather than counted as homeless. A further ` +
      `**${unroutedTotal}** published Craft films are unattached and ` +
      `**deliberately unrouted**, listed below with the reason for each.`
  );
  L.push("");
  L.push(`**Unattached and routed** — a ruling exists; the attach has not happened:`);
  L.push("");
  if (unattachedByTrack.size === 0) {
    L.push(`- none. Every routed film is in a module or is a track's entry film.`);
  } else {
    for (const [track, titles] of [...unattachedByTrack.entries()].sort()) {
      L.push(`- **${track}** (${titles.length}): ${titles.sort().join("; ")}`);
    }
  }
  L.push("");
  L.push(`**Unattached and unrouted** — looked at, and deliberately not homed:`);
  L.push("");
  for (const [series, titles] of [...unroutedByReason.entries()].sort()) {
    L.push(`- **${series}** (${titles.length}) — ${UNROUTED_REASON[series]}`);
  }

  const table = L.join("\n");
  console.log(`\n${table}\n`);

  if (unknown.length) {
    console.error(
      `\n  ${unknown.length} unattached film(s) belong to a series this script has ` +
        `never been told about.\n` +
        `  A film nobody has routed is the case this check exists for, so it is an ` +
        `ERROR and not a blank cell.\n` +
        `  Add each series to ROUTED (with the ruling) or to UNROUTED_REASON (with ` +
        `the reason):\n`
    );
    for (const u of unknown) console.error(`    series "${u.series}"   film "${u.title}"`);
    console.error("");
  }

  /* The reverse direction: a ruling left behind for a series that no longer
     exists silently covers a future film that reuses the name. */
  const liveSeries = new Set(
    items
      .filter((i) => i.type === "advisor_video" && i.collection === "Craft")
      .map((i) => seriesOf(i.title))
  );
  const stale = [...Object.keys(ROUTED), ...Object.keys(UNROUTED_REASON)].filter(
    (s) => !liveSeries.has(s)
  );
  if (stale.length) {
    console.error(
      `  ${stale.length} routing entr(y/ies) name a series with no published film: ` +
        `${stale.join(", ")}\n` +
        `  A stale ruling silently covers the next film that reuses the name.\n`
    );
  }

  if (WRITE) {
    const src = readFileSync(REPORT, "utf8");
    const START = "<!-- hopper:begin -->";
    const END = "<!-- hopper:end -->";
    const i = src.indexOf(START);
    const j = src.indexOf(END);
    if (i === -1 || j === -1) {
      console.error(`  ${REPORT} has no ${START} / ${END} markers — not written.`);
      process.exit(1);
    }
    const next =
      src.slice(0, i + START.length) +
      `\n*Derived by \`npm run report:hopper\`. Do not hand-edit between these ` +
      `markers — the numbers are measured, and a hand-typed one is how the ` +
      `"Success Cycle has 0 videos" error happened twice.*\n\n` +
      table +
      "\n\n" +
      src.slice(j);
    writeFileSync(REPORT, next);
    console.log(`  wrote the table into ${REPORT}\n`);
  }

  /* Exit code is a FUNCTION of what was found, never a constant. */
  process.exit(unknown.length || stale.length ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
