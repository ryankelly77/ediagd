"use strict";
/* ============================================================================
   EDIAGD — what every advisor sees the morning after deploy

   THE DEPLOY GATE. main goes straight to Doggett's advisors, so this computes
   tomorrow's loop for real people against real production data and reports the
   distribution BEFORE the merge, rather than finding out from the first person
   who opens the app.

   ---------------------------------------------------------------------------
   IT WRITES NOTHING, AND THAT REQUIRED WORK
   ---------------------------------------------------------------------------
   The page's ensureBlockForToday() INSERTS — opening a block is how the day
   gets a stage. So this deliberately does NOT call it. It reads any open block
   and, where there is none, simulates the one that would be opened using the
   same pure functions the real path uses (opCodeForBlock, stageForIndex) on the
   same inputs. Every other call here is a read.

   A preview that opened 40 blocks would not be a preview; it would be the
   deploy, run early and by the wrong process, and every one of those blocks
   would be locked to a family computed a day before anybody saw it.

   ---------------------------------------------------------------------------
   TWO POPULATIONS, REPORTED SEPARATELY
   ---------------------------------------------------------------------------
   1  PROVISIONED — advisors with an app account and an active membership at a
      non-demo rooftop. These are the people who can actually open the app
      tomorrow, and the only ones whose morning this literally predicts.
   2  MEASURED — every advisor_op_id in the current DMS period. These are not
      users yet, but they are the population the loop is FOR, and they are the
      only sample big enough for a distribution to mean anything.

   Reporting only (1) would hide the shape behind a sample of two. Reporting
   only (2) would claim an audience that does not exist. Both, labelled.

   Run with `npm run preview:day`. Read-only.
   ============================================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const advisor_data_1 = require("@/lib/advisor-data");
const advisor_1 = require("@/lib/advisor");
const daily_1 = require("@/lib/daily");
const coaching_block_1 = require("@/lib/coaching-block");
const sb = (0, supabase_js_1.createClient)(process.env.SB_URL, process.env.SB_KEY, {
    auth: { persistSession: false },
});
/** Demo rooftops are stamped '[DEMO] %' by seed.sql SECTION 5. */
const DEMO_PREFIX = "[DEMO]%";
/** A synthetic user id for the measured population, which has no app account.
    Only ever used to read content_progress, which returns nothing for it. */
const NO_USER = "00000000-0000-0000-0000-000000000000";
function addDay(date) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
/** Tally that keeps insertion order stable for reporting. */
function tally(rows) {
    const m = new Map();
    rows.forEach((r) => m.set(r, (m.get(r) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function bar(n, total, width = 28) {
    const filled = total > 0 ? Math.round((n / total) * width) : 0;
    return "█".repeat(filled) + "·".repeat(width - filled);
}
/**
 * One advisor's tomorrow, computed exactly as the page would and written
 * nowhere. `existingBlock` is passed in rather than looked up for the measured
 * population, which has no user id to look one up with.
 */
async function previewOne(label, opCodeId, rooftopId, tomorrow, userId, existingBlock) {
    const advisorDay = await (0, advisor_data_1.loadAdvisorDay)(sb, opCodeId, rooftopId);
    if (!advisorDay) {
        return { label, family: null, opCode: null, stage: null, rung: "—", pitchSkipped: null, reason: "no performance period" };
    }
    if (!advisorDay.hasVolume) {
        return { label, family: null, opCode: null, stage: null, rung: "—", pitchSkipped: null, reason: `under the 20-RO gate (${advisorDay.totalRos})` };
    }
    const pick = advisorDay.pick;
    /*
     * THE SIMULATION. ensureBlockForToday would insert here; this builds the row
     * it would have inserted, from the same inputs and the same pure functions,
     * and throws it away.
     */
    let block = existingBlock;
    if (!block && pick) {
        const codes = await (0, coaching_block_1.loadCoachableCodes)(sb, pick.family);
        block = {
            id: "(simulated)",
            family: pick.family,
            opCode: (0, coaching_block_1.opCodeForBlock)(codes, tomorrow),
            tier: (0, daily_1.cueTierForRate)(pick.rate),
            startedOn: tomorrow,
            lengthDays: 6,
            served: 0,
            stage: (0, coaching_block_1.stageForIndex)(0),
        };
    }
    const focus = block
        ? { family: block.family, opCode: block.opCode, stage: block.stage, tier: block.tier }
        : null;
    const coaching = await (0, daily_1.pickCoachingCueForBlock)(sb, tomorrow, focus);
    const pitch = await (0, daily_1.pickPitchVideo)(sb, tomorrow, userId ?? NO_USER, focus);
    const pitchSkipped = focus?.opCode && focus.stage ? pitch === null : null;
    return {
        label,
        family: block?.family ?? null,
        opCode: block?.opCode ?? null,
        stage: block?.stage ?? null,
        rung: coaching.matched ?? "null (healthy)",
        pitchSkipped,
        reason: pick ? null : "at or above store average everywhere",
    };
}
function report(title, outcomes) {
    const n = outcomes.length;
    console.log(`\n${"=".repeat(72)}\n${title}  —  ${n} advisor${n === 1 ? "" : "s"}\n${"=".repeat(72)}`);
    if (n === 0)
        return;
    const withBlock = outcomes.filter((o) => o.family);
    console.log(`\n  BLOCKS OPENED   ${withBlock.length} of ${n}`);
    for (const [fam, c] of tally(withBlock.map((o) => o.family))) {
        console.log(`    ${bar(c, n)}  ${String(c).padStart(3)}  ${fam}`);
    }
    const noBlock = outcomes.filter((o) => !o.family);
    if (noBlock.length) {
        console.log(`\n  NO BLOCK        ${noBlock.length} of ${n}`);
        for (const [why, c] of tally(noBlock.map((o) => o.reason ?? "unknown"))) {
            console.log(`    ${bar(c, n)}  ${String(c).padStart(3)}  ${why}`);
        }
    }
    console.log(`\n  CUE LADDER`);
    for (const [rung, c] of tally(outcomes.map((o) => o.rung))) {
        console.log(`    ${bar(c, n)}  ${String(c).padStart(3)}  ${rung}`);
    }
    const looked = outcomes.filter((o) => o.pitchSkipped !== null);
    const skipped = looked.filter((o) => o.pitchSkipped);
    console.log(`\n  PITCH VIDEO (step 3)`);
    console.log(`    ${String(skipped.length).padStart(3)} of ${looked.length} looked up -> SKIPPED, step left out of the day`);
    console.log(`    ${String(n - looked.length).padStart(3)} not looked up (no block, or no op code on the block)`);
    const stages = tally(outcomes.filter((o) => o.stage).map((o) => o.stage));
    if (stages.length) {
        console.log(`\n  STAGE`);
        stages.forEach(([s, c]) => console.log(`    ${String(c).padStart(3)}  ${s}`));
    }
    const codes = tally(outcomes.filter((o) => o.opCode).map((o) => o.opCode));
    if (codes.length) {
        console.log(`\n  OP CODE LOCKED (${codes.length} distinct)`);
        codes.slice(0, 12).forEach(([c, n2]) => console.log(`    ${String(n2).padStart(3)}  ${c}`));
        if (codes.length > 12)
            console.log(`    … and ${codes.length - 12} more`);
    }
}
/**
 * Families somebody intends to coach that have nothing written for them.
 *
 * ---------------------------------------------------------------------------
 * THIS SECTION IS THE PRICE OF CONTENT-GATING, PRINTED WHERE IT WILL BE READ
 * ---------------------------------------------------------------------------
 * Oil Change and Alignment were moved behind the content gate because three of
 * sixty advisors would otherwise have met an empty card. Gating them fixes the
 * card and hides the hole: those advisors are now coached on their SECOND
 * biggest gap and nothing on their screen says the first was skipped.
 *
 * So the hole gets reported here instead — in the script somebody runs while
 * deciding whether to deploy, rather than in a comment nobody opens. When this
 * section is empty, the gate is doing nothing and can be reconsidered.
 */
async function reportSuppressed() {
    const { data } = await sb
        .from("service_family_cue_count")
        .select("family, published_cues");
    const cues = new Map((data ?? []).map((r) => [r.family, Number(r.published_cues ?? 0)]));
    const starved = advisor_1.COACHABLE_PENDING_CONTENT.filter((f) => (cues.get(f) ?? 0) === 0);
    console.log(`\n${"=".repeat(72)}\nSUPPRESSED — intended to be coached, nothing written\n${"=".repeat(72)}`);
    if (!starved.length) {
        console.log("\n  None. Every family somebody intends to coach has cues.\n");
        return;
    }
    console.log(`\n  ${starved.length} famil${starved.length === 1 ? "y" : "ies"} cannot be picked, so no advisor is told\n` +
        `  this is their biggest gap. The gap does not stop existing.\n`);
    starved.forEach((f) => console.log(`    0 cues   ${f}`));
    console.log(`\n  Writing cues for any of these removes it from this list automatically —\n` +
        `  the gate is loadFamiliesWithCues, not a hardcoded exclusion.\n`);
}
(async () => {
    /* ---- Which rooftops, and what is "tomorrow" there? --------------------- */
    const { data: rooftops } = await sb
        .from("rooftop")
        .select("id, name, timezone")
        .not("name", "like", DEMO_PREFIX);
    const real = rooftops ?? [];
    console.log(`\n  ${real.length} non-demo rooftops (the ~100 '[DEMO] %' rooftops are excluded)`);
    const { data: todayRaw } = await sb.rpc("rooftop_today", { _rooftop: real[0].id });
    const today = todayRaw;
    const tomorrow = addDay(today);
    console.log(`  today at Doggett is ${today}; previewing ${tomorrow}`);
    const rooftopIds = real.map((r) => r.id);
    const rooftopName = new Map(real.map((r) => [r.id, r.name]));
    /* ---- 1 · Provisioned advisors ----------------------------------------- */
    const { data: members } = await sb
        .from("membership")
        .select("user_id, rooftop_id, op_code_id, app_user:user_id(full_name)")
        .in("rooftop_id", rooftopIds)
        .eq("role", "advisor")
        .eq("active", true);
    const provisioned = [];
    for (const m of members ?? []) {
        const embed = m.app_user;
        const u = (Array.isArray(embed) ? embed[0] : embed);
        const name = u?.full_name ?? m.user_id.slice(0, 8);
        const label = `${name} · ${rooftopName.get(m.rooftop_id)}`;
        if (!m.op_code_id) {
            provisioned.push({ label, family: null, opCode: null, stage: null, rung: "—", pitchSkipped: null, reason: "no DMS op code on the membership" });
            continue;
        }
        const open = await (0, coaching_block_1.readOpenBlock)(sb, m.user_id);
        provisioned.push(await previewOne(label, m.op_code_id, m.rooftop_id, tomorrow, m.user_id, open));
    }
    report("1 · PROVISIONED — advisors who can open the app tomorrow", provisioned);
    console.log(`\n  Named, because there are few enough to name:`);
    provisioned.forEach((o) => console.log(`    ${o.label}\n        ${o.family ? `${o.family} · ${o.opCode ?? "no code"} · ${o.stage}` : `no block — ${o.reason}`}\n        rung: ${o.rung}${o.pitchSkipped ? "  ·  pitch video skipped" : ""}`));
    /* ---- 2 · Measured advisors -------------------------------------------- */
    /*
     * EACH ROOFTOP'S OWN LATEST PERIOD, NOT THE LATEST PERIOD ANYWHERE.
     *
     * Taking one `order by ends_on desc limit 1` across all eleven rooftops
     * returns a single period belonging to a single store, and every other
     * store's advisors vanish from the sample. The first run of this script did
     * exactly that and reported three advisors as if it were the whole company.
     * loadAdvisorDay already resolves the latest period per rooftop internally,
     * so the enumeration has to match it.
     */
    const { data: periods } = await sb
        .from("perf_period")
        .select("id, rooftop_id, ends_on")
        .in("rooftop_id", rooftopIds)
        .order("ends_on", { ascending: false })
        .limit(5000);
    const latestPerRooftop = new Map();
    for (const p of periods ?? []) {
        const rid = p.rooftop_id;
        if (!latestPerRooftop.has(rid)) {
            latestPerRooftop.set(rid, { id: p.id, ends_on: p.ends_on });
        }
    }
    console.log(`\n  latest period per rooftop: ${latestPerRooftop.size} of ${real.length} rooftops have one`);
    const measured = [];
    const ends = new Set();
    for (const [rid, p] of latestPerRooftop) {
        ends.add(p.ends_on);
        const { data: totals } = await sb
            .from("advisor_period_totals")
            .select("advisor_op_id, rooftop_id, total_ros")
            .eq("period_id", p.id)
            .limit(2000);
        for (const t of totals ?? []) {
            measured.push(await previewOne(`${t.advisor_op_id} · ${rooftopName.get(rid) ?? "?"}`, t.advisor_op_id, rid, tomorrow, null, null));
        }
    }
    report(`2 · MEASURED — every advisor in each rooftop's latest period (${[...ends].sort().join(", ")})`, measured);
    console.log(`\n  NOTE ON FIDELITY: this reads with the service role, which bypasses the\n` +
        `  entitlement RLS in 0010 that the real page reads through. Cues are served\n` +
        `  to advisors through that policy today and work, so the rung distribution\n` +
        `  should match — but an entitlement change would show up here as a rung the\n` +
        `  advisor cannot actually reach.\n`);
    await reportSuppressed();
    console.log("  Nothing was written. No block was opened.\n");
})().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
});
