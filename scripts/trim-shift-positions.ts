/* ============================================================================
   EDIAGD — move saved resume positions onto the cut timeline

     set -a; source .env.local; set +a
     SB_URL=… SB_KEY=… npm run trim:shift-positions          # report
     …                  npm run trim:shift-positions -- --apply

   A head trim removes N seconds from the front of a film, so every
   `content_progress.position_sec` recorded BEFORE that cut now points N seconds
   too late — an advisor who stopped 20s in resumes 20s past where they were.
   New position is max(0, old − head).

   ---------------------------------------------------------------------------
   ONLY POSITIONS RECORDED BEFORE THE CUT
   ---------------------------------------------------------------------------
   A position written AFTER the film was cut is already in the new timeline, and
   subtracting the head again would send the advisor backwards by N seconds into
   a film that no longer has those seconds in it. Measured on production: of the
   four progress rows on head-cut films, two carry a position above zero, and
   ONE OF THOSE TWO was written after its film was cut. Shifting on film id
   alone would have corrupted a position that was already right.

   So the ledger's `cutAt` is compared against the row's `updated_at`, per film,
   and a row that cannot be dated is left alone and reported. This is the same
   rule as everywhere else here: derive the correction from what was observed,
   and refuse where the evidence is missing rather than guessing.

   FLOOR AT ZERO, AND FLOOR RATHER THAN ROUND. position_sec is an integer and
   resuming a moment early is recoverable; resuming late skips teaching.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const LEDGER = "reports/trim-pass.json";
const RECUT = "reports/trim-recut.json";
const APPLY = process.argv.includes("--apply");

type Cut = { head: number; cutAt: string; title: string };

async function main() {
  for (const k of ["SB_URL", "SB_KEY"]) {
    if (!process.env[k]) { console.error(`\n  missing ${k}\n`); process.exit(1); }
  }
  const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, { auth: { persistSession: false } });

  /* The head actually applied, per film. A re-cut supersedes the first cut, so
     its start is the one a saved position has to be moved by. */
  const cuts = new Map<string, Cut>();
  for (const v of Object.values(JSON.parse(readFileSync(LEDGER, "utf8")) as Record<string, {
    contentId: string; title: string; trimStart: number | null; cutAt: string;
  }>)) {
    if (v.trimStart) cuts.set(v.contentId, { head: v.trimStart, cutAt: v.cutAt, title: v.title });
  }
  if (existsSync(RECUT)) {
    for (const v of Object.values(JSON.parse(readFileSync(RECUT, "utf8")) as Record<string, {
      contentId: string; title: string; trimStart: number | null; at: string; swapped: boolean;
    }>)) {
      if (v.swapped && v.trimStart) cuts.set(v.contentId, { head: v.trimStart, cutAt: v.at, title: v.title });
    }
  }
  console.log(`\n  trim:shift-positions ${APPLY ? "" : "— REPORT ONLY"}`);
  console.log(`  films with a head cut: ${cuts.size}`);

  const { data, error } = await sb
    .from("content_progress")
    .select("id, content_id, user_id, position_sec, updated_at, created_at")
    .in("content_id", [...cuts.keys()]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    id: string; content_id: string; user_id: string;
    position_sec: number | null; updated_at: string | null; created_at: string | null;
  }[];
  console.log(`  progress rows on those films: ${rows.length}`);

  const toShift: { id: string; from: number; to: number; title: string }[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    const c = cuts.get(r.content_id)!;
    const pos = r.position_sec ?? 0;
    if (pos <= 0) { skipped.push(`${c.title}: position ${pos} — nothing to move`); continue; }
    const stamp = r.updated_at ?? r.created_at;
    if (!stamp) { skipped.push(`${c.title}: row has no timestamp — left alone`); continue; }
    if (stamp > c.cutAt) {
      skipped.push(
        `${c.title}: position ${pos} recorded ${stamp.slice(0, 19)}, AFTER the cut at ` +
          `${c.cutAt.slice(0, 19)} — already on the new timeline, left alone`
      );
      continue;
    }
    const next = Math.max(0, Math.floor(pos - c.head));
    toShift.push({ id: r.id, from: pos, to: next, title: c.title });
  }

  console.log(`\n  to shift: ${toShift.length}`);
  for (const t of toShift) console.log(`    ${t.title}: ${t.from}s -> ${t.to}s`);
  if (skipped.length) {
    console.log(`\n  left alone: ${skipped.length}`);
    for (const s of skipped) console.log(`    ${s}`);
  }

  if (!APPLY) { console.log(`\n  --apply to write.\n`); return; }

  let done = 0;
  for (const t of toShift) {
    const { error: e } = await sb.from("content_progress")
      .update({ position_sec: t.to }).eq("id", t.id);
    if (e) { console.error(`    FAILED ${t.title}: ${e.message}`); continue; }
    done++;
  }
  /* Read back rather than trusting the write — the summary is derived from what
     the database now holds, not from what was sent to it. */
  const { data: after } = await sb.from("content_progress")
    .select("id, position_sec").in("id", toShift.map((t) => t.id));
  const back = new Map((after ?? []).map((r) => [(r as { id: string }).id, (r as { position_sec: number }).position_sec]));
  const wrong = toShift.filter((t) => back.get(t.id) !== t.to);
  console.log(`\n  updated ${done} of ${toShift.length}; read back ${toShift.length - wrong.length} correct`);
  for (const w of wrong) console.log(`    MISMATCH ${w.title}: wanted ${w.to}, row holds ${back.get(w.id)}`);
  console.log("");
  if (wrong.length) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => { console.error(`\n  FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
}
