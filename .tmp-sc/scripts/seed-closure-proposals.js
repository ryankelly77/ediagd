"use strict";
/* ============================================================================
   EDIAGD — put this year's and next year's holidays in front of every manager

     npm run seed:closures            # report
     npm run seed:closures -- --apply

   ---------------------------------------------------------------------------
   WHY THIS IS SAFE TO RUN UNATTENDED, EVERY YEAR, FOREVER
   ---------------------------------------------------------------------------
   Everything it writes is a PROPOSAL, and a proposal does nothing. The loader
   that feeds the streak engine and the rest card selects status='confirmed' and
   nothing else, so a rooftop that gets eleven new rows in January behaves in
   February exactly as it did in December. There is no state this can put a
   store into that costs an advisor a day.

   ---------------------------------------------------------------------------
   IT NEVER ASKS THE SAME QUESTION TWICE
   ---------------------------------------------------------------------------
   Any date that already has a row for a rooftop is skipped, whatever that row
   says. Confirmed means the manager already told us the store shuts; dismissed
   means they already told us it does not. Re-proposing a dismissed date every
   January is the failure this rule exists to prevent, and it is why dismissal
   is a tombstone rather than a delete — see 0101.

   So the seeder is idempotent by construction: run it twice in a minute or once
   a year for a decade, and the only rows it writes are dates nobody has ruled
   on yet.
   ============================================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const closures_1 = require("../lib/closures");
const APPLY = process.argv.includes("--apply");
let _sb = null;
function sb() {
    if (!_sb) {
        _sb = (0, supabase_js_1.createClient)(process.env.SB_URL, process.env.SB_KEY, {
            auth: { persistSession: false },
        });
    }
    return _sb;
}
async function main() {
    const today = new Date().toISOString().slice(0, 10);
    const years = (0, closures_1.yearsToSeed)(today);
    console.log(`\n  Seeding ${years.join(" and ")} — ${(0, closures_1.federalHolidays)(years[0]).length} dates a year\n`);
    const { data: rooftops, error: rErr } = await sb()
        .from("rooftop")
        .select("id, name")
        .order("name");
    if (rErr)
        throw new Error(rErr.message);
    const all = (rooftops ?? []);
    if (all.length === 0) {
        console.log("  No rooftops.\n");
        return;
    }
    /* One read for every rooftop's existing dates, rather than one per rooftop.
       PostgREST caps a response at 1000 rows regardless of .limit(), so this
       pages — eleven dates times two years times sixty rooftops passes that. */
    const existing = new Map();
    for (let off = 0;; off += 1000) {
        const { data } = await sb()
            .from("rooftop_closed_day")
            .select("rooftop_id, closed_on")
            .gte("closed_on", `${years[0]}-01-01`)
            .range(off, off + 999);
        const page = (data ?? []);
        for (const row of page) {
            const set = existing.get(row.rooftop_id) ?? new Set();
            set.add(row.closed_on);
            existing.set(row.rooftop_id, set);
        }
        if (page.length < 1000)
            break;
    }
    const rows = [];
    for (const r of all) {
        const missing = (0, closures_1.missingProposals)(years, existing.get(r.id) ?? []);
        if (missing.length > 0) {
            console.log(`    ${r.name.padEnd(34)} ${missing.length} to propose`);
        }
        for (const p of missing) {
            rows.push({
                rooftop_id: r.id,
                closed_on: p.date,
                label: p.label,
                status: "proposed",
                origin: "federal",
            });
        }
    }
    console.log(`\n  ${rows.length} proposal(s) across ${all.length} rooftop(s)`);
    if (rows.length === 0) {
        console.log("  Nothing to do — every date already has a ruling.\n");
        return;
    }
    if (!APPLY) {
        console.log("  Report only. Re-run with --apply.\n");
        return;
    }
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        /* ignoreDuplicates on the (rooftop_id, closed_on) unique index: two runs
           racing, or a manager adding a date between the read and the write, must
           not overwrite a ruling somebody already made. */
        const { error } = await sb()
            .from("rooftop_closed_day")
            .upsert(chunk, { onConflict: "rooftop_id,closed_on", ignoreDuplicates: true });
        if (error)
            throw new Error(error.message);
        written += chunk.length;
    }
    console.log(`  Wrote ${written}.\n`);
}
/*
 * NOT ON IMPORT.
 *
 * A bare IIFE runs the moment anything requires this file — which is how a test
 * that only wanted one helper triggered a full production import and truncated
 * 15 cue bodies.
 */
if (require.main === module) {
    main().catch((e) => {
        console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
        process.exit(1);
    });
}
