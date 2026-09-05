/* ============================================================================
   EDIAGD — rebuild the DMS periods, one month at a time

     npm run rebuild:periods -- --dry        list what would be rebuilt
     npm run rebuild:periods
     npm run rebuild:periods -- --rooftop=<uuid>

   ---------------------------------------------------------------------------
   WHY THIS EXISTS RATHER THAN ONE rebuild_dms_periods(null, null)
   ---------------------------------------------------------------------------
   Because that call does not work. The function is happy to take nulls and
   rebuild everything, and against production it exceeds the statement timeout
   and rolls the whole thing back — 220 periods over 165,000 daily rows into
   61,941 metric rows is more than one request gets.

   The mapping inventory said "minutes across the network" and never measured
   it, which turned out to be the wrong side of a hard limit rather than a slow
   success. So the work is chunked per (rooftop, month): each call is small,
   each commits on its own, and a failure loses one month rather than all of
   them.

   THAT CHANGES WHAT A REBUILD *IS*, and the change is worth stating: it is no
   longer atomic. A run that dies halfway leaves some periods on the new rules
   and some on the old. Re-running is safe and idempotent — each month deletes
   and rewrites its own metrics — so the recovery is "run it again", but a
   half-rebuilt library is a state that can now exist and could not before.

   ---------------------------------------------------------------------------
   AND SO IT HAS TO BE POSSIBLE TO FIND OUT THAT YOU ARE IN ONE
   ---------------------------------------------------------------------------
   The paragraph above was written and then not acted on. This script counted
   failures, printed them, and exited 0 — so a run that failed 200 of 220
   periods was indistinguishable from a clean one to anything downstream. The
   only artefact was stdout on whichever laptop ran it, and
   perf_period.rules_as_of cannot help: it is always the period's own start, so
   it is constant across every rebuild after the first.

   Two changes. The exit code tells the truth, and every run opens a
   `rebuild_run` row (0079) before the work and closes it after — so a run that
   dies without reporting leaves an OPEN row, which is the state that used to be
   invisible. /admin/dms reads it.
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY_ROOFTOP = args.find((a) => a.startsWith("--rooftop="))?.split("=")[1];

async function main() {
  const { data: periods, error } = await sb
    .from("perf_period")
    .select("rooftop_id, starts_on, rules_as_of")
    .eq("source_kind", "dynatron")
    .order("rooftop_id")
    .order("starts_on");
  if (error) throw new Error(error.message);

  const { data: rooftops } = await sb.from("rooftop").select("id, name");
  const nameOf = new Map(
    ((rooftops ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name])
  );

  const work = (periods ?? []).filter(
    (p) => !ONLY_ROOFTOP || p.rooftop_id === ONLY_ROOFTOP
  );
  console.log(`\n  ${work.length} dynatron periods across ${new Set(work.map((p) => p.rooftop_id)).size} rooftops`);
  const stale = work.filter((p) => !p.rules_as_of).length;
  console.log(`  ${stale} have no rules_as_of (rebuilt before 0074)\n`);

  if (DRY) {
    console.log("  --dry: nothing rebuilt.\n");
    return;
  }

  /*
   * SCOPE, NAMED. A --rooftop run is not a full rebuild and must never be read
   * as one: rebuild_status only clears its "mapping has moved since the last
   * rebuild" warning on a scope of 'all', because a scoped run leaves every
   * other rooftop exactly as stale as it was.
   */
  const scope = ONLY_ROOFTOP ? `rooftop:${ONLY_ROOFTOP}` : "all";
  const { data: runId, error: runErr } = await sb.rpc("rebuild_run_start", {
    _scope: scope,
    _attempted: work.length,
    _initiated_by: "script",
  });
  if (runErr) throw new Error(`could not open a rebuild_run row: ${runErr.message}`);

  const t0 = Date.now();
  let done = 0, metrics = 0, failed = 0;
  const failures: { rooftop: string; month: string; error: string }[] = [];
  const slowest: { label: string; ms: number }[] = [];

  for (const p of work) {
    const label = `${nameOf.get(p.rooftop_id as string) ?? p.rooftop_id} ${p.starts_on}`;
    const t = Date.now();
    const { data, error: e } = await sb.rpc("rebuild_dms_periods", {
      _rooftop_id: p.rooftop_id,
      _month: p.starts_on,
    });
    const ms = Date.now() - t;
    slowest.push({ label, ms });

    if (e) {
      failed++;
      failures.push({
        rooftop: p.rooftop_id as string,
        month: p.starts_on as string,
        error: e.message.slice(0, 300),
      });
      console.log(`  FAILED  ${label}  ${e.message.slice(0, 90)}`);
      continue;
    }
    done++;
    metrics += Number((data as { op_metrics?: number })?.op_metrics ?? 0);
    if (done % 20 === 0 || ms > 5000) {
      console.log(`  ${String(done).padStart(3)}/${work.length}  ${label.padEnd(42)} ${String(ms).padStart(6)}ms`);
    }
  }

  const { error: finishErr } = await sb.rpc("rebuild_run_finish", {
    _id: runId,
    _succeeded: done,
    _failed: failures,
  });
  if (finishErr) {
    // Not fatal to the rebuild, which has already happened — but the record of
    // it is now wrong, and that is worse than a noisy line.
    console.log(`\n  WARNING: could not close the rebuild_run row: ${finishErr.message}`);
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  rebuilt ${done} periods, ${failed} failed, ${metrics.toLocaleString()} metric rows`);
  console.log(`  wall clock: ${total}s`);
  slowest.sort((a, b) => b.ms - a.ms);
  console.log(`  slowest month: ${slowest[0]?.label} at ${slowest[0]?.ms}ms`);

  /*
   * THE EXIT CODE IS PART OF THE REPORT.
   *
   * This used to exit 0 whatever happened, so a run that failed 200 of 220
   * periods looked like a success to CI, to a wrapper script, and to anybody
   * who did not read the scrollback. A partial rebuild is a real state and it
   * has to be loud at the only place a caller reliably looks.
   */
  if (failed > 0) {
    console.log(
      `\n  PARTIAL REBUILD — ${failed} of ${work.length} period(s) did not rebuild:`
    );
    for (const f of failures.slice(0, 10)) {
      console.log(`     ${nameOf.get(f.rooftop) ?? f.rooftop} ${f.month} — ${f.error.slice(0, 80)}`);
    }
    console.log(`  Re-run to finish; each month deletes and rewrites its own metrics.\n`);
    process.exit(1);
  }
  console.log("");
}

/*
 * NOT ON IMPORT.
 *
 * A bare IIFE runs the moment anything requires this file — which is how a test
 * that only wanted one helper triggered a full production import and truncated
 * 15 cue bodies. Nothing imports this today; the guard is for the person who
 * first wants to.
 */
if (require.main === module) {
  main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
}
