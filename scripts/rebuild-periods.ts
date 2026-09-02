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
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY_ROOFTOP = args.find((a) => a.startsWith("--rooftop="))?.split("=")[1];

(async () => {
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

  const t0 = Date.now();
  let done = 0, metrics = 0, failed = 0;
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
      console.log(`  FAILED  ${label}  ${e.message.slice(0, 90)}`);
      continue;
    }
    done++;
    metrics += Number((data as { op_metrics?: number })?.op_metrics ?? 0);
    if (done % 20 === 0 || ms > 5000) {
      console.log(`  ${String(done).padStart(3)}/${work.length}  ${label.padEnd(42)} ${String(ms).padStart(6)}ms`);
    }
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  rebuilt ${done} periods, ${failed} failed, ${metrics.toLocaleString()} metric rows`);
  console.log(`  wall clock: ${total}s`);
  slowest.sort((a, b) => b.ms - a.ms);
  console.log(`  slowest month: ${slowest[0]?.label} at ${slowest[0]?.ms}ms\n`);
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
