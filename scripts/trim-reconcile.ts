/* ============================================================================
   EDIAGD — put back the ledger rows an interrupted trim run never wrote

     set -a; source .env.local; set +a
     SB_URL=… SB_KEY=… npm run trim:reconcile          # report
     …                  npm run trim:reconcile -- --apply

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   trim:apply writes its ledger row the instant the swap commits — but "the
   instant after" is still a window, and a run killed inside it leaves a film
   CUT and UNLEDGERED. That has now happened three times out of three
   interruptions.

   The asset-id guard already stops such a film being cut twice: the plan's
   offsets are into an asset the row no longer points at, so the next run
   refuses it. But a refusal is not a record. INGEST.md is explicit — a trim
   applied outside the ledger-writing path must be BACKFILLED, or the ledger
   stays incomplete by construction and the next reader cannot tell a film that
   was cut from one that was skipped.

   Doing it by hand three times is how the fourth time gets it wrong, so it is
   a script with its evidence test written down.

   ---------------------------------------------------------------------------
   WHAT MAKES A BACKFILL SAFE, AND IT IS TWO INDEPENDENT FACTS
   ---------------------------------------------------------------------------
   A row is accepted as "cut but unledgered" only when BOTH hold:

     1  content.archived_asset_id EQUALS the asset the plan measured. The swap
        archives the asset it replaced, so this is the row itself saying "the
        thing the plan measured is what I replaced". It is the observed key,
        not a derived one.

     2  content.duration_sec MATCHES the length the plan's cut asked for. This
        is a second, independent witness: the first says WHICH asset was
        replaced, this says the replacement is the length THIS plan's offsets
        produce. A row that was re-cut by some other process would fail it.

   Either alone is not enough. (1) without (2) would accept a film swapped for
   an unrelated reason; (2) without (1) would accept a coincidence of length.
   Anything that fails either is reported and left alone — never guessed.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PLAN = "reports/trim-plan-approved.json";
const LEDGER = "reports/trim-pass.json";
/** duration_sec is a rounded integer and the asked-for length is float
 *  seconds, so a second of slack is the rounding, not tolerance. */
const SLACK = 1.0;

const APPLY = process.argv.includes("--apply");

type PlanRow = {
  id: string; title: string; muxAssetId: string | null;
  assetDuration: number | null; proposedStart: number | null; proposedEnd: number | null;
};

async function main() {
  for (const k of ["SB_URL", "SB_KEY"]) {
    if (!process.env[k]) { console.error(`\n  missing ${k}\n`); process.exit(1); }
  }
  const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
    auth: { persistSession: false },
  });

  if (!existsSync(PLAN)) { console.error(`\n  missing ${PLAN}\n`); process.exit(1); }
  const plan = (JSON.parse(readFileSync(PLAN, "utf8")).rows as PlanRow[])
    .filter((r) => r.proposedStart != null || r.proposedEnd != null);
  const ledger: Record<string, Record<string, unknown>> = existsSync(LEDGER)
    ? JSON.parse(readFileSync(LEDGER, "utf8"))
    : {};
  const ledgered = new Set(Object.values(ledger).map((v) => v.contentId as string));

  const live = new Map<string, { id: string; title: string; mux_asset_id: string | null;
    duration_sec: number | null; archived_asset_id: string | null }>();
  for (let page = 0; ; page++) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, mux_asset_id, duration_sec, archived_asset_id")
      .eq("type", "advisor_video").eq("status", "published").is("retired_at", null)
      .order("id").range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data as never[]) live.set((r as { id: string }).id, r);
    if (data.length < 1000) break;
  }

  const ok: string[] = [];
  const refused: string[] = [];
  for (const p of plan) {
    if (ledgered.has(p.id)) continue;
    const r = live.get(p.id);
    if (!r) continue;
    if (!r.archived_asset_id) continue;           // never swapped — genuinely uncut
    const expected = (p.proposedEnd ?? p.assetDuration ?? 0) - (p.proposedStart ?? 0);
    const archivedMatches = r.archived_asset_id === p.muxAssetId;
    const lengthMatches = Math.abs((r.duration_sec ?? 0) - expected) <= SLACK;
    /*
     * ---- A LENGTH MATCH IS WORTHLESS WHEN THE CUT IS SMALLER THAN THE SLACK -
     *
     * `duration_sec` is rounded, so for a film whose cut removes less than a
     * second the ORIGINAL length already sits inside SLACK of the asked-for
     * length. "Your Toughest Opponent Is Staring at You" is 31.34s, the cut
     * asks for 30.42s, and the untouched row reads 31 — a length "match" on a
     * film nobody has touched. Six rows looked like candidates on that basis
     * alone.
     *
     * So the duration is only a witness when it has actually MOVED from the
     * original. Where it has not, the row is simply uncut and is not a finding.
     */
    const movedFromOriginal =
      Math.abs((r.duration_sec ?? 0) - (p.assetDuration ?? 0)) > SLACK;

    if (archivedMatches && lengthMatches) {
      if (ledger[r.archived_asset_id]) continue;  // the key is already taken
      ledger[r.archived_asset_id] = {
        contentId: p.id, title: p.title, newAssetId: r.mux_asset_id,
        trimStart: p.proposedStart, trimEnd: p.proposedEnd,
        oldDuration: p.assetDuration, newDuration: r.duration_sec,
        cutAt: new Date().toISOString(),
        expectedDuration: Number(expected.toFixed(2)), durationOk: true,
        backfilled:
          "reconstructed by trim:reconcile after a run was interrupted between the swap and " +
          "the ledger write. Both witnesses held: archived_asset_id equals the asset the plan " +
          "measured, and duration_sec matches the length the cut asked for.",
      };
      ok.push(`${p.title} — ${p.assetDuration?.toFixed(2)}s -> ${r.duration_sec}s (asked ${expected.toFixed(2)}s)`);
    } else if (archivedMatches || (lengthMatches && movedFromOriginal)) {
      /* Either the row replaced the asset this plan measured and came back the
         WRONG length, or its length moved to this plan's target while
         replacing some OTHER asset. Both mean something happened to this film
         that this ledger cannot account for. */
      refused.push(
        `${p.title} — archivedMatches=${archivedMatches} lengthMatches=${lengthMatches} ` +
          `movedFromOriginal=${movedFromOriginal} ` +
          `(archived ${String(r.archived_asset_id).slice(0, 12)}…, plan ${String(p.muxAssetId).slice(0, 12)}…, ` +
          `${p.assetDuration?.toFixed(2)}s -> ${r.duration_sec}s, asked ${expected.toFixed(2)}s)`
      );
    }
  }

  console.log(`\n  trim:reconcile ${APPLY ? "" : "— REPORT ONLY"}`);
  console.log(`  cut but unledgered, both witnesses hold: ${ok.length}`);
  for (const l of ok) console.log(`    ${l}`);
  if (refused.length) {
    console.log(`\n  REFUSED — only one witness held; left alone for a person:`);
    for (const l of refused) console.log(`    ${l}`);
  }
  if (APPLY && ok.length) {
    writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
    console.log(`\n  wrote ${LEDGER} — now ${Object.keys(ledger).length} films`);
  } else if (!APPLY && ok.length) {
    console.log(`\n  --apply to write them.`);
  }
  console.log("");
  /* A one-witness row is a thing a person has to look at, and the exit code
     says so rather than a line that prints either way. */
  if (refused.length) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => { console.error(`\n  FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
}
