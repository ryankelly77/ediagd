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

import { createClient } from "@supabase/supabase-js";
import { loadAdvisorDay } from "@/lib/advisor-data";
import { COACHABLE_PENDING_CONTENT } from "@/lib/advisor";
import { loadCueCounts } from "@/lib/coachable-families";
import { cueTierForRate, pickCoachingCueForBlock, pickPitchVideo } from "@/lib/daily";
import {
  loadCoachableCodes,
  opCodeForBlock,
  readOpenBlock,
  stageForIndex,
  type CoachingBlock,
} from "@/lib/coaching-block";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

/** Demo rooftops are stamped '[DEMO] %' by seed.sql SECTION 5. */
const DEMO_PREFIX = "[DEMO]%";

/** A synthetic user id for the measured population, which has no app account.
    Only ever used to read content_progress, which returns nothing for it. */
const NO_USER = "00000000-0000-0000-0000-000000000000";

function addDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

type Outcome = {
  label: string;
  family: string | null;
  opCode: string | null;
  stage: string | null;
  rung: string;
  pitchSkipped: boolean | null;
  reason: string | null;
};

/** Tally that keeps insertion order stable for reporting. */
function tally(rows: string[]): [string, number][] {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(r, (m.get(r) ?? 0) + 1));
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function bar(n: number, total: number, width = 28): string {
  const filled = total > 0 ? Math.round((n / total) * width) : 0;
  return "█".repeat(filled) + "·".repeat(width - filled);
}

/**
 * One advisor's tomorrow, computed exactly as the page would and written
 * nowhere. `existingBlock` is passed in rather than looked up for the measured
 * population, which has no user id to look one up with.
 */
async function previewOne(
  label: string,
  opCodeId: string,
  rooftopId: string,
  tomorrow: string,
  userId: string | null,
  existingBlock: CoachingBlock | null
): Promise<Outcome> {
  const advisorDay = await loadAdvisorDay(sb, opCodeId, rooftopId);

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
  let block: CoachingBlock | null = existingBlock;
  if (!block && pick) {
    const codes = await loadCoachableCodes(sb, pick.family);
    block = {
      id: "(simulated)",
      family: pick.family,
      opCode: opCodeForBlock(codes, tomorrow),
      tier: cueTierForRate(pick.rate),
      startedOn: tomorrow,
      lengthDays: 6,
      served: 0,
      stage: stageForIndex(0),
    };
  }

  const focus = block
    ? { family: block.family, opCode: block.opCode, stage: block.stage, tier: block.tier }
    : null;

  const coaching = await pickCoachingCueForBlock(sb, tomorrow, focus);
  const pitch = await pickPitchVideo(sb, tomorrow, userId ?? NO_USER, focus);
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

function report(title: string, outcomes: Outcome[]) {
  const n = outcomes.length;
  console.log(`\n${"=".repeat(72)}\n${title}  —  ${n} advisor${n === 1 ? "" : "s"}\n${"=".repeat(72)}`);
  if (n === 0) return;

  const withBlock = outcomes.filter((o) => o.family);
  console.log(`\n  BLOCKS OPENED   ${withBlock.length} of ${n}`);
  for (const [fam, c] of tally(withBlock.map((o) => o.family!))) {
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

  const stages = tally(outcomes.filter((o) => o.stage).map((o) => o.stage!));
  if (stages.length) {
    console.log(`\n  STAGE`);
    stages.forEach(([s, c]) => console.log(`    ${String(c).padStart(3)}  ${s}`));
  }

  const codes = tally(outcomes.filter((o) => o.opCode).map((o) => o.opCode!));
  if (codes.length) {
    console.log(`\n  OP CODE LOCKED (${codes.length} distinct)`);
    codes.slice(0, 12).forEach(([c, n2]) => console.log(`    ${String(n2).padStart(3)}  ${c}`));
    if (codes.length > 12) console.log(`    … and ${codes.length - 12} more`);
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
  const { counts, minCues } = await loadCueCounts(sb);

  const starved = (COACHABLE_PENDING_CONTENT as readonly string[])
    .map((f) => ({ family: f, have: counts.get(f) ?? 0 }))
    .filter((r) => r.have < minCues)
    .sort((a, b) => b.have - a.have);

  console.log(`\n${"=".repeat(72)}\nSUPPRESSED — intended to be coached, not enough written\n${"=".repeat(72)}`);
  console.log(
    `\n  The bar is ${minCues} distinct cues — one per day of a block, from the same\n` +
      `  setting the block length reads (game_settings.coaching_block_days). A\n` +
      `  family below it would repeat itself inside a single block.\n`
  );
  if (!starved.length) {
    console.log("  None. Every family somebody intends to coach can fill a block.\n");
    return;
  }
  console.log(
    `  ${starved.length} famil${starved.length === 1 ? "y" : "ies"} cannot be picked, so no advisor is told this is\n` +
      `  their biggest gap. The gap does not stop existing.\n`
  );
  starved.forEach((r) =>
    console.log(`    ${String(r.have).padStart(3)} of ${minCues}   ${r.family}${r.have === 0 ? "" : `   (${minCues - r.have} short)`}`)
  );
  console.log(
    `\n  Each is a number Mitch can act on. Writing the shortfall clears the\n` +
      `  family automatically — the gate is loadFamiliesWithCues, not a list.\n`
  );
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
  const today = todayRaw as string;
  const tomorrow = addDay(today);
  console.log(`  today at Doggett is ${today}; previewing ${tomorrow}`);

  const rooftopIds = real.map((r) => r.id as string);
  const rooftopName = new Map(real.map((r) => [r.id as string, r.name as string]));

  /* ---- 1 · Provisioned advisors ----------------------------------------- */
  const { data: members } = await sb
    .from("membership")
    .select("user_id, rooftop_id, op_code_id, app_user:user_id(full_name)")
    .in("rooftop_id", rooftopIds)
    .eq("role", "advisor")
    .eq("active", true);

  const provisioned: Outcome[] = [];
  for (const m of members ?? []) {
    const embed = m.app_user as unknown;
    const u = (Array.isArray(embed) ? embed[0] : embed) as { full_name?: string } | null;
    const name = u?.full_name ?? (m.user_id as string).slice(0, 8);
    const label = `${name} · ${rooftopName.get(m.rooftop_id as string)}`;

    if (!m.op_code_id) {
      provisioned.push({ label, family: null, opCode: null, stage: null, rung: "—", pitchSkipped: null, reason: "no DMS op code on the membership" });
      continue;
    }
    const open = await readOpenBlock(sb, m.user_id as string);
    provisioned.push(
      await previewOne(label, m.op_code_id as string, m.rooftop_id as string, tomorrow, m.user_id as string, open)
    );
  }

  report("1 · PROVISIONED — advisors who can open the app tomorrow", provisioned);

  console.log(`\n  Named, because there are few enough to name:`);
  provisioned.forEach((o) =>
    console.log(
      `    ${o.label}\n        ${o.family ? `${o.family} · ${o.opCode ?? "no code"} · ${o.stage}` : `no block — ${o.reason}`}\n        rung: ${o.rung}${o.pitchSkipped ? "  ·  pitch video skipped" : ""}`
    )
  );

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

  const latestPerRooftop = new Map<string, { id: string; ends_on: string }>();
  for (const p of periods ?? []) {
    const rid = p.rooftop_id as string;
    if (!latestPerRooftop.has(rid)) {
      latestPerRooftop.set(rid, { id: p.id as string, ends_on: p.ends_on as string });
    }
  }
  console.log(
    `\n  latest period per rooftop: ${latestPerRooftop.size} of ${real.length} rooftops have one`
  );

  const measured: Outcome[] = [];
  const ends = new Set<string>();
  for (const [rid, p] of latestPerRooftop) {
    ends.add(p.ends_on);
    const { data: totals } = await sb
      .from("advisor_period_totals")
      .select("advisor_op_id, rooftop_id, total_ros")
      .eq("period_id", p.id)
      .limit(2000);

    for (const t of totals ?? []) {
      measured.push(
        await previewOne(
          `${t.advisor_op_id} · ${rooftopName.get(rid) ?? "?"}`,
          t.advisor_op_id as string,
          rid,
          tomorrow,
          null,
          null
        )
      );
    }
  }

  report(
    `2 · MEASURED — every advisor in each rooftop's latest period (${[...ends].sort().join(", ")})`,
    measured
  );

  console.log(
    `\n  NOTE ON FIDELITY: this reads with the service role, which bypasses the\n` +
      `  entitlement RLS in 0010 that the real page reads through. Cues are served\n` +
      `  to advisors through that policy today and work, so the rung distribution\n` +
      `  should match — but an entitlement change would show up here as a rung the\n` +
      `  advisor cannot actually reach.\n`
  );

  await reportSuppressed();

  console.log("  Nothing was written. No block was opened.\n");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
