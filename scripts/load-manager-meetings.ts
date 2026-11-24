/* ============================================================================
   EDIAGD — load Mitch's Manager Meetings library into content rows

   Reads the two committed inputs that `scripts/extract-manager-meetings.py`
   produces from the workbook and the cheat sheet, and writes:

     content                  one DRAFT row per meeting, no Mux id
     manager_meeting_op_code  one row per boost meeting, origin = 'manifest'

     export SB_URL=http://127.0.0.1:55321 SB_KEY=<local service role>
     npm run load:manager-meetings            # DRY — reports, writes nothing
     npm run load:manager-meetings -- --apply # writes

   ---------------------------------------------------------------------------
   DRY BY DEFAULT, AND LOCAL ONLY
   ---------------------------------------------------------------------------
   `--apply` is the only thing that writes. Without it every decision is
   computed and reported and nothing is sent, so the report in the PR is the
   same code path that does the writing rather than a description of it.

   It refuses any SB_URL that is not localhost, and it calls
   `refuseWriteOnPreview()` from slice 0 before the first write. Two guards for
   two different questions: the URL check is about WHICH DATABASE is being
   addressed, the Preview guard is about WHICH DEPLOYMENT is addressing it, and
   neither substitutes for the other. Vercel Preview resolves the production
   Supabase project and carries a service-role key, so a loader that ran there
   would seed live rooftops.

   ---------------------------------------------------------------------------
   KEYED ON THE CLASSIFICATION LINE, VERBATIM
   ---------------------------------------------------------------------------
   A meeting's identity is its Classification line, which is also the slate
   Mitch reads on camera. It is stored verbatim in `content.classification_line`
   (0183) and matched verbatim here. It is never rebuilt from topic + length +
   title, and 0183's column comment carries the measurement: the line's length
   token is "10 mins" where `meeting_length` is "10 minutes", and four A/C
   titles contain a literal "/" so the line does not split into four parts.

   `scripts/trim-slates.ts` already paid for that lesson in this repo — it
   joined on a name the ingest invents, matched 0 of 73 where the observed name
   matched 73 of 73, then skipped all 73 and reported success.

   SO A RETITLE UPDATES IN PLACE. Ryan's ruling 5 renames one meeting, and the
   override changes its classification line with it — which means that one
   meeting is keyed differently after the rename and would be inserted a second
   time. That is handled explicitly: see `findExisting`, which falls back to the
   override's previous line so the rename lands as an UPDATE. Without it the
   library would quietly grow a duplicate on the day a title changed, which is
   the exact failure the prompt asks this loader not to have.

   ---------------------------------------------------------------------------
   THE LIBRARY IS NOT FINAL, SO NOTHING HERE ASSERTS A COUNT
   ---------------------------------------------------------------------------
   About 100 films are shot and about 115 are still to come. Every number below
   is REPORTED and none is required, except the one the prompt names: a boost
   meeting without an op code is a hard failure, because such a film loads
   without complaint and can never be picked.
============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { refuseWriteOnPreview } from "@/lib/deploy-env";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const APPLY = process.argv.includes("--apply");

if (!URL || !KEY) {
  console.error("\n  need SB_URL and SB_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`REFUSING to run against ${URL} — this writes content rows. Local only.`);
  process.exit(1);
}

/**
 * The repo root.
 *
 * NOT `join(__dirname, "..")`: the npm script compiles into `.tmp-mml/` and
 * runs from there, so __dirname is inside the build directory and the data
 * files are not above it. `npm run` always sets the working directory to the
 * package root, so cwd is right — and it is VERIFIED rather than assumed,
 * because a wrong root here would report "missing data file" when the file is
 * present, which reads as an input problem rather than a path bug.
 */
const ROOT = process.cwd();
if (!existsSync(join(ROOT, "package.json"))) {
  console.error(
    `\n  cannot find the repo root from ${ROOT} — run this via ` +
    `\`npm run load:manager-meetings\` from the checkout root.\n`
  );
  process.exit(1);
}
const MEETINGS_CSV = join(ROOT, "data", "manager_meetings.csv");
const CODES_CSV = join(ROOT, "data", "manager_meeting_op_codes.csv");
const OVERRIDES_CSV = join(ROOT, "data", "manager_meeting_overrides.csv");

const sb: SupabaseClient = createClient(URL, KEY, { auth: { persistSession: false } });

/* ---- a CSV reader that handles quoted fields and embedded newlines -------- */
/**
 * The run sheets are multi-line markdown inside a quoted CSV field, so a
 * split("\n") reader would tear every one of them in half. Written out rather
 * than pulling a dependency in for one file.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function readCsv(path: string): Record<string, string>[] {
  if (!existsSync(path)) {
    console.error(`\n  missing ${path}\n  run: python3 scripts/extract-manager-meetings.py\n`);
    process.exit(1);
  }
  return parseCsv(readFileSync(path, "utf8").replace(/^﻿/, ""));
}

/* ---- the 24 tags, mirroring 0183's CHECK --------------------------------- */
/**
 * The same claim as `content_situation_tags_known`, stated twice — the same
 * arrangement as `lib/events/kinds.ts` and 0163's constraint, and for the same
 * reason: the database refuses an unknown tag with a 23514, and this refuses it
 * before the round trip and before ANY row is written.
 *
 * That ordering is the point. Without it the first 80 meetings would be written
 * and the 81st would fail, leaving the library half loaded — a partial write is
 * worse than a refusal because nothing afterwards knows where it stopped.
 *
 * Adding a tag means editing BOTH this list and the migration. That friction is
 * the feature.
 */
const KNOWN_TAGS = [
  "Active delivery", "Attach rate or ticket flat", "CSI and surveys", "Contests",
  "Coverage Is Key", "End of month", "Language and word tracks", "Manager self-work",
  "Menu sales", "Mid-month", "Morale and recognition", "New hire or onboarding",
  "Objections and deferred work", "One-on-one coaching", "Phones and BDC",
  "Product knowledge and launches", "Seasonal", "Slow traffic or prospecting",
  "Standards and process", "Start of month", "Team culture", "Technicians and the shop",
  "Underperformance or accountability", "Upset customers",
] as const;
const TAGSET = new Set<string>(KNOWN_TAGS);

/* ---- what a content row for a meeting looks like ------------------------- */
type Meeting = Record<string, string>;

/**
 * The columns this loader owns, and nothing else.
 *
 * `status` is always 'draft' and `mux_playback_id` is never set: the film does
 * not exist yet. The ingest attaches the asset later and publishing is a
 * separate, deliberate act — which also means loading cannot change what any
 * manager currently sees, because `listManagerTopics` and `loadManagerVideos`
 * both filter `status = 'published'`.
 *
 * `placement` is 'manager_meeting' because 0168's `content_manager_placement`
 * CHECK requires it of every manager_video — and because it is what keeps these
 * films out of every advisor picker by construction rather than by a condition
 * somebody has to remember.
 *
 * `service_family` IS DELIBERATELY NOT WRITTEN, and this is the most important
 * line in the file.
 *
 * The obvious move is to put the workbook's Topic there, because that is what
 * `listManagerTopics` buckets browse on. It was written that way first, and
 * loading 213 rows put all 213 into `service_family_content` — the view the
 * ADVISOR pitch slot reads, with `true as coachable` hardcoded on that arm.
 *
 * The view's family_tag arm is `where service_family is not null and
 * coalesce(placement,'') <> 'reference'`. It excludes ONE placement BY NAME, so
 * 'manager_meeting' sails straight through. 0168 anticipated exactly this for
 * the OTHER route in — "service_family_content excludes only
 * placement = 'reference' by name and a manager film carrying an op code would
 * enter the view the advisor pitch slot reads" — which is why the op code lives
 * in `manager_meeting_op_code` and not in `content.op_code`. The family_tag arm
 * has the identical hole and nobody had to guard it, because until this loader
 * no manager film had ever carried a `service_family`.
 *
 * `content.service_family` is read by six things that all mean "which SERVICE":
 * family_pitch_supply, service_family_content, service_family_cue_count,
 * impact_coaching, the two blog_corpus views, and lib/daily.ts. "Leading
 * Yourself" is not a service family. So the Topic does not go there.
 *
 * NOTHING IS LOST. The Topic is segment 2 of the classification line, which is
 * stored verbatim, and it is a column in data/manager_meetings.csv. Browse
 * keeps behaving exactly as it does today — every manager film has
 * service_family NULL and falls into MANAGER_GENERAL_TOPIC, which is also where
 * the 17 Bank Account films already sit, so ruling 6 is honoured by doing
 * nothing.
 *
 * Bucketing browse by Topic is a real improvement and a separate slice. Whoever
 * takes it must close the family_tag hole first, or publishing these films puts
 * them in the advisor pitch slot. Recorded in reports/MANAGER-MEETINGS-PLAN.md.
 */
function contentRow(m: Meeting) {
  const tags = m.situation_tags ? m.situation_tags.split("|").filter(Boolean) : [];
  return {
    type: "manager_video",
    status: "draft",
    collection: "Manager Meetings",
    placement: "manager_meeting",
    title: m.title,
    classification_line: m.classification_line,
    subcategory: m.boost_group || null,
    meeting_length: m.meeting_length || null,
    meeting_format: m.meeting_format || null,
    situation_tags: tags,
    series: m.series || null,
    best_used_for: m.best_used_for || null,
    body: m.body_md || null,
  };
}

/**
 * The select list, written out as a literal.
 *
 * supabase-js parses the select string AT THE TYPE LEVEL, so `TRACKED.join()`
 * does not type-check — it sees a template literal rather than column names.
 * The two lists are kept adjacent so a column added to one is obvious in the
 * other, and the assertion below fails the build if they drift.
 */
const SELECT_COLS =
  "id, title, classification_line, subcategory, " +
  "meeting_length, meeting_format, situation_tags, series, best_used_for, " +
  "body, collection, placement";

/** Columns compared to decide whether an existing row needs an update. */
const TRACKED = [
  "title", "classification_line", "subcategory",
  "meeting_length", "meeting_format", "situation_tags", "series",
  "best_used_for", "body", "collection", "placement",
] as const;

/* The two lists above must agree. A column in TRACKED but not in SELECT_COLS
   would arrive undefined and be reported as "changed" on every run, so the
   loader would never reach a no-op second run. Checked at startup rather than
   trusted. */
for (const c of TRACKED) {
  if (!SELECT_COLS.split(",").map((s) => s.trim()).includes(c)) {
    console.error(`  SELECT_COLS is missing ${c}, which TRACKED compares`);
    process.exit(1);
  }
}

function differs(existing: Record<string, unknown>, desired: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of TRACKED) {
    const a = existing[k];
    const b = (desired as Record<string, unknown>)[k];
    if (Array.isArray(a) || Array.isArray(b)) {
      const sa = JSON.stringify(a ?? []);
      const sb = JSON.stringify(b ?? []);
      if (sa !== sb) out.push(k);
      continue;
    }
    if ((a ?? null) !== (b ?? null)) out.push(k);
  }
  return out;
}

async function main() {
  console.log(`\nManager Meetings — load  (${APPLY ? "APPLY" : "DRY RUN"})`);
  console.log("=".repeat(70));

  const meetings = readCsv(MEETINGS_CSV);
  const codes = readCsv(CODES_CSV);
  const overrides = existsSync(OVERRIDES_CSV) ? readCsv(OVERRIDES_CSV) : [];

  let failures = 0;
  const fail = (m: string) => { failures++; console.log(`  ✗ ${m}`); };

  console.log(`\n  meetings read                : ${meetings.length}`);
  console.log(`  boost mappings read          : ${codes.length}`);
  console.log(`  title overrides in effect    : ${overrides.length}`);

  /* ---- refusals, all of them BEFORE the first write -------------------- */

  // A classification line that appears twice. 0183's unique index makes this
  // impossible in the database; reported here as well so the operator learns
  // it from the loader rather than from a 23505 halfway through.
  const seen = new Map<string, number>();
  for (const m of meetings) seen.set(m.classification_line, (seen.get(m.classification_line) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  console.log(`  classification lines twice   : ${dupes.length}`);
  for (const [line] of dupes) fail(`classification line appears twice: ${line}`);

  const blank = meetings.filter((m) => !m.classification_line.trim());
  for (const m of blank) fail(`no classification line for "${m.title}"`);

  // Tags outside the 24.
  const unknownTags = new Map<string, number>();
  for (const m of meetings) {
    for (const t of (m.situation_tags || "").split("|").filter(Boolean)) {
      if (!TAGSET.has(t)) unknownTags.set(t, (unknownTags.get(t) ?? 0) + 1);
    }
  }
  console.log(`  tags outside the 24          : ${unknownTags.size}`);
  for (const [t, n] of unknownTags) fail(`situation tag not in the 24: ${t} (on ${n} meeting(s))`);

  // Boost meetings without a code. MUST BE ZERO, per the prompt — a film on no
  // code, or on a coachable=false code, loads fine and is never pickable.
  const codeByLine = new Map(codes.map((c) => [c.classification_line, c]));
  const boost = meetings.filter((m) => m.is_boost === "true");
  const uncoded = boost.filter((m) => !codeByLine.get(m.classification_line)?.op_code?.trim());
  console.log(`  boost meetings              : ${boost.length}`);
  console.log(`  boost meetings WITHOUT a code: ${uncoded.length}  (must be 0)`);
  for (const m of uncoded) fail(`boost meeting has no op code: ${m.title}`);

  // A mapping whose meeting is not in the library at all.
  for (const c of codes) {
    if (!seen.has(c.classification_line)) {
      fail(`mapping points at a meeting that is not in the library: ${c.classification_line}`);
    }
  }

  if (failures) {
    console.log("\n" + "=".repeat(70));
    console.log(`  REFUSING — ${failures} problem(s), nothing written`);
    console.log("=".repeat(70));
    process.exit(1);
  }

  /* ---- what is already there ------------------------------------------- */
  /**
   * Fetched by classification line, plus the PREVIOUS line of every override,
   * so a retitle is recognised as the same meeting and updates in place
   * instead of inserting a second row.
   *
   * Both lines are READ FROM the override table rather than one being computed
   * from the other. Substituting the workbook title back into the new line
   * would reproduce the previous line today and would be a derived key — the
   * same construction that made trim-slates.ts match 0 of 73 and report
   * success. The override table states both, so the join is on what was
   * written down.
   */
  const prevByNew = new Map<string, string>();
  for (const o of overrides) {
    const newLine = o.override_classification_line?.trim();
    const prevLine = o.previous_classification_line?.trim();
    if (!newLine) continue;
    if (!prevLine) {
      fail(
        `override for "${o.workbook_title}" gives no previous_classification_line, ` +
        `so a retitle cannot be matched to its existing row and would insert a duplicate`
      );
      continue;
    }
    prevByNew.set(newLine, prevLine);
  }

  if (failures) {
    console.log("\n" + "=".repeat(70));
    console.log(`  REFUSING — ${failures} problem(s), nothing written`);
    console.log("=".repeat(70));
    process.exit(1);
  }

  /**
   * Every row that already carries a classification line, read by PAGING rather
   * than by filtering on the lines we want.
   *
   * THE FILTER VERSION WAS A BUG, AND THE UNIQUE INDEX CAUGHT IT. `.in(
   * "classification_line", chunk)` puts the values in a PostgREST `in.(...)`
   * query string, and one title is:
   *
   *     "Questions, Comments, Concerns?" — The Three-Part Close
   *
   * — a double quote and two commas inside a value in a comma-separated,
   * quote-delimited list. The filter did not match it, the loader concluded the
   * meeting was absent, and tried to INSERT a second row for a meeting it had
   * already written. 0183's unique partial index refused it with a 23505.
   *
   * That is the difference between a convention and a construction: the
   * loader's own "report a line that appears twice" check saw nothing wrong,
   * because the duplicate was not in the input — it was in the lookup. Only the
   * index was positioned to notice.
   *
   * So nothing is escaped and no filter is built from Mitch's text. The set is
   * read and matched in memory, where a string compare is exact. It is also
   * fewer round trips.
   */
  const existing = new Map<string, Record<string, unknown>>();
  for (let page = 0; ; page++) {
    const from = page * 500;
    const { data, error } = await sb
      .from("content")
      .select(SELECT_COLS)
      .not("classification_line", "is", null)
      .range(from, from + 499);
    if (error) { console.error(`  content select: ${error.message}`); process.exit(1); }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of rows) existing.set(String(r.classification_line), r);
    if (rows.length < 500) break;
  }
  console.log(`  rows already carrying a line : ${existing.size}`);

  function findExisting(line: string) {
    const direct = existing.get(line);
    if (direct) return { row: direct, viaRename: false };
    const prev = prevByNew.get(line);
    if (prev) {
      const old = existing.get(prev);
      if (old) return { row: old, viaRename: true };
    }
    return { row: undefined as Record<string, unknown> | undefined, viaRename: false };
  }

  /* ---- plan ------------------------------------------------------------- */
  const inserts: Meeting[] = [];
  const updates: { m: Meeting; id: string; changed: string[]; viaRename: boolean }[] = [];
  let unchanged = 0;

  for (const m of meetings) {
    const desired = contentRow(m);
    const { row, viaRename } = findExisting(m.classification_line);
    if (!row) { inserts.push(m); continue; }
    const changed = differs(row, desired);
    if (changed.length === 0 && !viaRename) { unchanged++; continue; }
    updates.push({ m, id: String(row.id), changed, viaRename });
  }

  console.log(`\n  content rows to insert       : ${inserts.length}`);
  console.log(`  content rows to update       : ${updates.length}`);
  console.log(`  content rows already correct : ${unchanged}`);

  const renames = updates.filter((u) => u.viaRename);
  for (const r of renames) {
    console.log(`    · retitle in place: ${prevByNew.get(r.m.classification_line)}`);
    console.log(`                     -> ${r.m.classification_line}`);
  }

  if (!APPLY) {
    console.log("\n  DRY RUN — nothing written. Re-run with --apply to write.");
    console.log("=".repeat(70));
    return;
  }

  /* ---- write ------------------------------------------------------------ */
  // Slice 0's guard. A loader is exactly the "seeds" case the branch rule names.
  refuseWriteOnPreview("load the Manager Meetings library");

  let inserted = 0;
  let updated = 0;
  for (const m of inserts) {
    const { error } = await sb.from("content").insert(contentRow(m));
    if (error) { fail(`insert ${m.classification_line}: ${error.message}`); continue; }
    inserted++;
  }
  for (const u of updates) {
    const { error } = await sb.from("content").update(contentRow(u.m)).eq("id", u.id);
    if (error) { fail(`update ${u.m.classification_line}: ${error.message}`); continue; }
    updated++;
  }

  /* ---- the op code mappings -------------------------------------------- */
  /**
   * `manager_meeting_op_code.content_id` is the PRIMARY KEY (0168), so one film
   * carries one code and an upsert on content_id is the whole of the
   * idempotency. `op_code` is only indexed, which is why three meetings can
   * share FSC-017 without complaint.
   */
  const idByLine = new Map<string, string>();
  for (let page = 0; ; page++) {
    const from = page * 500;
    const { data, error } = await sb
      .from("content")
      .select("id, classification_line")
      .not("classification_line", "is", null)
      .range(from, from + 499);
    if (error) { fail(`content re-read: ${error.message}`); break; }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of rows) idByLine.set(String(r.classification_line), String(r.id));
    if (rows.length < 500) break;
  }

  let mapped = 0;
  for (const c of codes) {
    const id = idByLine.get(c.classification_line);
    if (!id) { fail(`no content row for mapping ${c.classification_line}`); continue; }
    const { error } = await sb
      .from("manager_meeting_op_code")
      .upsert({ content_id: id, op_code: c.op_code, origin: "manifest" },
              { onConflict: "content_id" });
    if (error) { fail(`mapping ${c.op_code} -> ${c.classification_line}: ${error.message}`); continue; }
    mapped++;
  }

  console.log(`\n  content rows inserted        : ${inserted}`);
  console.log(`  content rows updated         : ${updated}`);
  console.log(`  op code mappings written     : ${mapped}`);

  console.log("\n" + "=".repeat(70));
  console.log(`  ${failures ? `${failures} problem(s)` : "done"}`);
  console.log("=".repeat(70));
  // The exit code is a function of the failure count, never a literal.
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
