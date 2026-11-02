/* ============================================================================
   EDIAGD — restore:day, for a morning our own defect refused

   SERVICE ROLE ONLY. There is no UI for this and there should not be: putting a
   streak day back is an operator's act with a reason attached, not a button.

   Usage:
     npm run restore:day -- --user <uuid> --date YYYY-MM-DD --reason "..."
     npm run restore:day -- --user <uuid> --date YYYY-MM-DD --reason "..." --apply

   --evidence=progress  accepts a film leg whose gate was refused for an expired
                        ticket (the defect #83 removed), on content_progress.
                        Narrow by arithmetic — see the note at the flag.

   Dry by default. It prints the evidence it found, the verdict, and exactly what
   it would write.

   ---------------------------------------------------------------------------
   WHAT IT REFUSES, AND WHY THE BAR IS THE WATCH GATE AND NOTHING ELSE
   ---------------------------------------------------------------------------
   It refuses unless EVERY film leg of that day was watched to the gate
   threshold, proven from `watch_gate` — the rows this server wrote itself after
   checking a signed ticket and the wall clock. Nothing else counts:

     content_progress.watched_pct IS NOT EVIDENCE OF A WATCH. It is
     furthest-reached, which a drag of the scrubber sets to 100 in under a
     second. It and the gate's `watched_pct` are two numbers with the same name
     from different measurements, and subtracting one from the other is the
     mistake this project has already paid for. A day whose only evidence is
     content_progress is REFUSED, and the refusal says so.

     THE THRESHOLD IS PER FILM, not a flat 95. gateThreshold() is the live rule
     — two seconds from the end of this film, floored at 95% — and it is
     imported rather than restated so a day cannot be restored on a bar the app
     does not use.

     A watch_error ROW IS NOT A WATCH. The 20-second valve releases a gate when
     the player never produced a frame; that is a broken player, not a viewing,
     and it carries a null percentage by design.

   It also refuses when the day is already complete, when the advisor has no
   active membership, when the reason is missing or perfunctory, and when the
   morning's shape cannot be established from the gates (below).

   ---------------------------------------------------------------------------
   THE MORNING'S SHAPE IS INFERRED, AND THAT IS THE WEAK JOINT — SO IT IS TIGHT
   ---------------------------------------------------------------------------
   A completed day records what was served, in the day stamp. A REFUSED day
   records nothing at all — that is the defect — so this script cannot know what
   the morning offered. It can only know which films cleared the gate.
   `placement` tells it which slot each gated film belongs to:

     daily_lifestyle -> the mindset leg, which EVERY morning offers
     daily_pitch     -> the pitch leg,   a `normal` morning
     daily_craft     -> the item leg

   mindset + pitch + item  -> normal
   mindset + item          -> two_slot
   anything else           -> REFUSED, because a morning this script cannot name
                              is a morning it must not score. In particular a
                              mindset gate on its own is refused: it is
                              indistinguishable from a three-slot morning where
                              two legs were never watched.

   ---------------------------------------------------------------------------
   WHAT IT WRITES, AND THE THREE THINGS IT DELIBERATELY DOES NOT
   ---------------------------------------------------------------------------
   WRITES  the daily_completion row, naming the films the gates prove, with
           restored_reason and restored_at (0172) so the row says a person
           decided it; and then recomputes the Swell.

   THE SWELL IS RECOMPUTED, NOT ADVANCED, and this is the part a backdated
   insert forces. applyDailyCompletion() is INCREMENTAL — it reads
   last_completed_on and steps forward — and both advisors this was written for
   have completions AFTER the day being restored (1 and 2 November). Handing it a
   30 October completion with last_completed_on at 2 November is a question it
   was never written to answer. So the whole history is replayed through the SAME
   pure function, in date order, from a zeroed state. One rule, applied N times,
   rather than a second rule for backdated days.

   DOES NOT PAY. No sand dollars, no badges. The day's payout is a product
   decision nobody has taken — whether a day we cost should also pay its ten —
   and a script that minted currency on an operator's say-so would be the
   hardest thing here to take back. `--pay` is deliberately not implemented;
   that is Ryan's ruling to make, and when he makes it the ledger rows belong in
   completeDay's saga where every other earn lives.

   DOES NOT TOUCH THE PADDLE-OUT BANK. paddle_out_available is a
   ledger-backed balance (paddle_out_entry), and re-deriving it from a replay
   would contradict the ledger that records what was actually granted and spent.
   The replay's own paddle arithmetic is therefore discarded and the stored
   balance is left exactly as it is.

   DOES NOT MOVE THE LADDERS. No content_progress.completed_at, no pool cursor,
   no track entry, no module completion, no certification accrual. Those are the
   loop's POSITION, and a backdated write would move an advisor's place in a
   track today for a morning in the past — serving them a different film
   tomorrow because of a repair. The films they watched are already recorded as
   watched; what was lost was the day, and the day is what this puts back.
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";
import { gateThreshold, isWatched } from "@/lib/watch-coverage";
import {
  applyDailyCompletion,
  scheduledOn,
  type GameSettings,
  type IsoDate,
  type SwellState,
} from "@/lib/gamification/streak";
/* THE APP'S OWN LOADER, not a shape assembled here.
   The first version hand-built `{ schedule, closures }` and cast it `as never`.
   The cast hid two errors: ScheduleContext also carries `islandTime`, and the
   closures live in `rooftop_closed_day` rather than a `store_closure` table
   that the read found nothing in and said nothing about. The consequence was
   not cosmetic — scheduledOn() returned `undefined`, so the streak replay was
   computed against a calendar it could not read and came out at 14 against a
   stored 5. The script then printed a reassuring note explaining the gap as
   grace under earlier rules, which is a confident wrong answer over a bug in
   itself. One loader, no cast. */
import { loadScheduleContext } from "@/lib/work-schedule";

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
/*
 * ---- THE ONE OVERRIDE, AND IT IS NARROW BY ARITHMETIC ---------------------
 *
 * --evidence=progress accepts a film leg that has NO watch_gate row, on
 * content_progress, when the missing row is explained by the expired-ticket
 * defect #83 fixed. It is not "accept a missing gate"; it is "accept the gate
 * this server refused for a reason we have since removed".
 *
 * THREE CONDITIONS, ALL REQUIRED, and the third is what makes it specific:
 *
 *   1  NO gate row for that film on that store day. A row that EXISTS and
 *      failed its bar — below threshold, or the failure valve — is a different
 *      story and is still refused. This override fills a silence, never
 *      contradicts a measurement.
 *
 *   2  content_progress shows the film reached its END inside that store day.
 *      `completed_at` is NOT the test and cannot be: it is written by
 *      completeDay, which is the thing that never ran, so requiring it would be
 *      circular for every day this script exists to repair. watched_pct = 100
 *      is the test — and it is FURTHEST-REACHED, which a scrub sets in under a
 *      second. That weakness is precisely why this needs an override and a
 *      reason rather than being the default bar.
 *
 *   3  THE PLAYER WAS OPEN LONGER THAN THE OLD TTL ALLOWED — longer than
 *      3 x duration + 300s, the window #83 removed. This is the arithmetic
 *      signature of the expiry: if the span fits inside the old window, the
 *      gate's absence is NOT explained by an expired ticket and the override
 *      declines. Measured on the case it was written for: 577s of player-open
 *      against a 555s window on an 85-second film.
 *
 * AND IT LEAVES A TRACE THE OPERATOR CANNOT FORGET TO WRITE. An annotation adds
 * evidence; an override removes a refusal. The script appends what it accepted,
 * and why, to the reason it stores — so the row says a machine objected and
 * what overruled it, rather than relying on the prose being thorough.
 */
const EVIDENCE_PROGRESS = argv.includes("--evidence=progress");
const USER = flag("user");
const DATE = flag("date");
const REASON = flag("reason");

const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

/** The next calendar day, for the store day's half-open upper bound. */
function nextDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + 1));
  return t.toISOString().slice(0, 10);
}

function fail(msg: string): never {
  console.error(`\n  REFUSING — ${msg}\n`);
  process.exit(1);
}

if (!url || !key) fail("SB_URL/SB_KEY (or the NEXT_PUBLIC_/SERVICE_ROLE pair) are required.");
if (!USER || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(USER))
  fail("--user must be a uuid. A name is for printing, never for matching.");
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) fail("--date must be YYYY-MM-DD (the STORE-local day).");
/* A reason is the whole point of the column. Ten characters is not a quality
   bar; it refuses "fix", "n/a" and an accidental empty string. */
if (!REASON || REASON.trim().length < 10)
  fail('--reason must be a sentence (10+ chars). The row records it, not the console.');

/* VALIDATED, THEN BOUND. fail() returns `never`, but TypeScript will not narrow
   a module-level `const` through a call, and the alternative is a `!` at every
   use — which is the assertion that stops being true the day somebody moves a
   check. These three are the validated values and the rest of the file uses
   them. */
const userId: string = USER;
const storeDate: IsoDate = DATE as IsoDate;
const reason: string = REASON.trim();

const sb = createClient(url, key, { auth: { persistSession: false } });

type GateRow = { content_id: string; watched_pct: number | null; watch_error: boolean };
type ContentRow = { id: string; title: string; placement: string | null; duration_sec: number | null };

async function main() {
  console.log(`\n  restore:day  user ${userId}  store day ${storeDate}`);
  console.log(`  mode: ${APPLY ? "--apply, WRITING" : "dry run, writing nothing"}\n`);

  /* ---- is the day already complete? ------------------------------------- */
  const { data: already, error: alreadyErr } = await sb
    .from("daily_completion")
    .select("id, restored_reason")
    .eq("user_id", userId)
    .eq("completion_date", storeDate);
  if (alreadyErr) fail(`could not read daily_completion: ${alreadyErr.message}`);
  if ((already ?? []).length > 0) {
    const r = (already as { restored_reason: string | null }[])[0];
    fail(
      `${storeDate} is already complete for this advisor` +
        (r.restored_reason ? ` (restored earlier: "${r.restored_reason}")` : "") +
        ". Nothing to put back."
    );
  }

  /* ---- the membership, which decides the rooftop the day is filed at ---- */
  const { data: mem, error: memErr } = await sb
    .from("membership")
    .select("rooftop_id, role")
    .eq("user_id", userId)
    .eq("active", true);
  if (memErr) fail(`could not read membership: ${memErr.message}`);
  const chosen =
    (mem ?? []).find((m) => (m as { role: string }).role === "advisor") ??
    (mem ?? [])[0];
  if (!chosen) fail("no active membership. A day cannot be filed at a store they do not work at.");
  const rooftopId = (chosen as { rooftop_id: string }).rooftop_id;

  /* ---- THE EVIDENCE: the gate rows this server wrote itself ------------- */
  const { data: gateRows, error: gateErr } = await sb
    .from("watch_gate")
    .select("content_id, watched_pct, watch_error")
    .eq("user_id", userId)
    .eq("store_date", storeDate);
  if (gateErr) fail(`could not read watch_gate: ${gateErr.message}`);
  const gates = (gateRows ?? []) as GateRow[];

  if (gates.length === 0) {
    fail(
      `no watch_gate rows for ${storeDate}. There is no server-verified evidence that any film ` +
        `was watched that day.\n             content_progress is NOT a substitute: its ` +
        `watched_pct is furthest-reached, which a scrub sets to 100 in under a second.`
    );
  }

  const ids = gates.map((g) => g.content_id);
  const { data: contentRows, error: cErr } = await sb
    .from("content")
    .select("id, title, placement, duration_sec")
    .in("id", ids);
  if (cErr) fail(`could not read content: ${cErr.message}`);
  const content = new Map(((contentRows ?? []) as ContentRow[]).map((c) => [c.id, c]));

  console.log("  EVIDENCE — watch_gate rows for that store day:");
  const bad: string[] = [];
  const slot: Record<string, string> = {};
  for (const g of gates) {
    const c = content.get(g.content_id);
    const bar = gateThreshold(c?.duration_sec ?? null);
    const pct = g.watched_pct == null ? null : Number(g.watched_pct);
    const ok = !g.watch_error && pct != null && isWatched(pct, bar);
    console.log(
      `    ${ok ? "OK  " : "NO  "} ${String(c?.placement ?? "?").padEnd(16)} ` +
        `${pct == null ? "null" : pct.toFixed(2)}% vs bar ${bar.toFixed(2)}% ` +
        `(${c?.duration_sec ?? "?"}s)  ${c?.title ?? g.content_id}`
    );
    if (!ok) {
      bad.push(
        g.watch_error
          ? `${c?.title ?? g.content_id}: the failure valve fired — a broken player, not a viewing`
          : pct == null
            ? `${c?.title ?? g.content_id}: no percentage recorded`
            : `${c?.title ?? g.content_id}: ${pct}% is below this film's bar of ${bar.toFixed(2)}%`
      );
    } else if (c?.placement) {
      slot[c.placement] = g.content_id;
    }
  }
  if (bad.length) {
    fail(`a leg was not watched to the gate threshold:\n             - ${bad.join("\n             - ")}`);
  }

  /* ---- THE OVERRIDE, IF IT WAS ASKED FOR -------------------------------- */
  const overrides: string[] = [];
  if (EVIDENCE_PROGRESS) {
    /* The store day's instants, in the ROOFTOP's timezone. Not ::date on a
       timestamptz — a Texas evening lands on tomorrow in UTC, which is the
       mistake 0166 records. */
    /* THE REAL PARAMETER NAMES. They are `_d` and `_t`, not `_day` and `_at`:
       PostgREST resolves an RPC by its argument NAMES, so a guessed name is a
       404 from the schema cache rather than a type error. Read off pg_proc
       rather than inferred from the call sites in SQL, which pass positionally
       and so prove nothing about the names. */
    const { data: boundsRows, error: bErr } = await sb.rpc("rooftop_local_at", {
      _rooftop: rooftopId,
      _d: storeDate,
      _t: "00:00",
    });
    const { data: endRows } = await sb.rpc("rooftop_local_at", {
      _rooftop: rooftopId,
      _d: nextDay(storeDate),
      _t: "00:00",
    });
    if (bErr || !boundsRows || !endRows) fail(`could not resolve the store day's bounds: ${bErr?.message ?? "no value"}`);
    const dayStart = String(boundsRows);
    const dayEnd = String(endRows);

    const { data: progRows, error: pErr } = await sb
      .from("content_progress")
      .select("content_id, watched_pct, completed_at, created_at, updated_at")
      .eq("user_id", userId)
      .gte("updated_at", dayStart)
      .lt("updated_at", dayEnd);
    if (pErr) fail(`could not read content_progress: ${pErr.message}`);

    const progIds = ((progRows ?? []) as { content_id: string }[]).map((r) => r.content_id);
    const progContent = new Map<string, ContentRow>();
    if (progIds.length) {
      const { data: pc } = await sb
        .from("content")
        .select("id, title, placement, duration_sec")
        .in("id", progIds);
      for (const c of ((pc ?? []) as ContentRow[])) progContent.set(c.id, c);
    }

    console.log(`\n  --evidence=progress: examining content_progress inside the store day`);
    console.log(`    store day runs ${dayStart} -> ${dayEnd}`);
    for (const r of (progRows ?? []) as {
      content_id: string; watched_pct: number | null; created_at: string; updated_at: string;
    }[]) {
      const c = progContent.get(r.content_id);
      const placement = c?.placement ?? null;
      if (!placement || slot[placement]) continue;               /* leg already proven by a gate */
      if (gates.some((g) => g.content_id === r.content_id)) continue; /* a gate row exists: not a silence */
      const dur = Number(c?.duration_sec ?? 0);
      const spanSec = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000;
      const oldTtl = dur > 0 ? dur * 3 + 300 : 300;
      const reachedEnd = Number(r.watched_pct ?? 0) >= 100;
      const expirySignature = spanSec > oldTtl;
      const ok = reachedEnd && expirySignature;
      console.log(
        `    ${ok ? "ACCEPT" : "decline"}  ${placement.padEnd(16)} pct=${r.watched_pct} ` +
          `span=${spanSec.toFixed(0)}s vs old TTL ${oldTtl.toFixed(0)}s (${dur}s film)  ${c?.title}`
      );
      if (!ok) {
        console.log(
          `              ${!reachedEnd ? "the film did not reach its end" : "the span fits inside the old TTL, so an expired ticket does not explain the missing gate"}`
        );
        continue;
      }
      slot[placement] = r.content_id;
      overrides.push(
        `--evidence=progress accepted the ${placement} leg ${r.content_id} ` +
          `(content_progress 100%, player open ${spanSec.toFixed(0)}s against the ${oldTtl.toFixed(0)}s TTL removed by #83; no watch_gate row)`
      );
    }
    if (overrides.length === 0) {
      console.log(`    nothing accepted — the override changed nothing.`);
    }
  }

  /* ---- the morning's shape, inferred from the slots ---------------------- */
  const mindset = slot["daily_lifestyle"] ?? null;
  const pitch = slot["daily_pitch"] ?? null;
  const item = slot["daily_craft"] ?? null;

  let kind: "normal" | "two_slot";
  if (mindset && pitch && item) kind = "normal";
  else if (mindset && item && !pitch) kind = "two_slot";
  else {
    fail(
      `the morning's shape cannot be established from these gates ` +
        `(mindset=${Boolean(mindset)} pitch=${Boolean(pitch)} item=${Boolean(item)}).\n` +
        `             A morning this script cannot name is one it must not score — in ` +
        `particular a mindset gate alone is indistinguishable from a three-slot morning ` +
        `where two legs were never watched.`
    );
  }
  console.log(`\n  VERDICT: every leg cleared its own bar. Morning reads as "${kind}".`);

  /* ---- the schedule, so the restored day is scored on the real calendar -- */
  const [ctx, { data: settingsRow }] = await Promise.all([
    loadScheduleContext(sb as never, userId, rooftopId),
    sb.from("game_settings").select("*").limit(1).maybeSingle(),
  ]);
  if (!settingsRow) fail("no game_settings row.");
  const settings: GameSettings = {
    paddleOutCap: Number(settingsRow.paddle_out_cap),
    paddleOutPerMonth: Number(settingsRow.paddle_out_per_month),
    sandDailyLoop: Number(settingsRow.sand_daily_loop),
    sandSwell7: Number(settingsRow.sand_swell_7),
    sandSwell30: Number(settingsRow.sand_swell_30),
    sandSwell90: Number(settingsRow.sand_swell_90),
    sandSwell365: Number(settingsRow.sand_swell_365 ?? 0),
    sandBadge: Number(settingsRow.sand_badge),
    sandCertification: Number(settingsRow.sand_certification),
  };
  console.log(
    `  calendar: ${ctx.schedule ? "work_schedule on file" : "no schedule on file (every day counts as scheduled)"}; ` +
      `${ctx.closures?.length ?? 0} closure(s); ${ctx.islandTime?.length ?? 0} island-time range(s). ` +
      `${storeDate} scheduled: ${String(scheduledOn(storeDate, ctx))}`
  );

  /* ---- THE SWELL, RECOMPUTED BY REPLAY ---------------------------------- */
  const { data: histRows } = await sb
    .from("daily_completion")
    .select("completion_date")
    .eq("user_id", userId)
    .order("completion_date", { ascending: true });
  const history = ((histRows ?? []) as { completion_date: string | null }[])
    .map((r) => r.completion_date)
    .filter((d): d is string => Boolean(d));
  const withRestored = [...new Set([...history, storeDate])].sort();

  const replay = (dates: string[]): SwellState => {
    let state: SwellState = {
      currentLen: 0,
      longestLen: 0,
      lastCompletedOn: null,
      paddleOutAvailable: 0,
      paddleOutLastGranted: null,
    };
    for (const d of dates) {
      state = applyDailyCompletion(state, d as IsoDate, settings, ctx).next;
    }
    return state;
  };

  const { data: swellRow } = await sb
    .from("swell")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const before = replay(history);
  const after = replay(withRestored);

  console.log(`\n  SWELL — replayed through applyDailyCompletion(), ${withRestored.length} day(s):`);
  console.log(`    stored now        current=${swellRow?.current_len ?? 0} longest=${swellRow?.longest_len ?? 0} last=${swellRow?.last_completed_on ?? "null"}`);
  console.log(`    replay without ${storeDate}  current=${before.currentLen} longest=${before.longestLen} last=${before.lastCompletedOn}`);
  console.log(`    replay WITH    ${storeDate}  current=${after.currentLen} longest=${after.longestLen} last=${after.lastCompletedOn}`);
  /*
   * THE REPLAY IS CHECKED AGAINST THE STORED STATE FIRST, and a disagreement is
   * reported rather than overwritten. If replaying the history the advisor
   * actually has does not reproduce the counters they actually hold, then this
   * script's model of the streak and the app's history disagree — and writing
   * the replay's answer would silently rewrite somebody's streak on the strength
   * of a model that just failed its own check.
   */
  const modelAgrees =
    Number(swellRow?.current_len ?? 0) === before.currentLen &&
    Number(swellRow?.longest_len ?? 0) === before.longestLen;
  if (!modelAgrees) {
    console.log(
      `\n    NOTE: the replay does not reproduce the stored counters, so it is treated as a\n` +
        `    MODEL THAT FAILED ITS OWN CHECK. Only the DELTA the restored day makes is applied\n` +
        `    (${before.currentLen} -> ${after.currentLen}); no absolute value from the replay is written, and\n` +
        `    longest_len can rise no higher than the new current. Nothing else is rewritten.`
    );
  }
  const nextCurrent =
    modelAgrees
      ? after.currentLen
      : Number(swellRow?.current_len ?? 0) + (after.currentLen - before.currentLen);
  /*
   * LONGEST TAKES NOTHING FROM A REPLAY THAT DISAGREED.
   *
   * This read Math.max(stored, nextCurrent, after.longestLen), and on the first
   * dry run that would have raised a real advisor's longest streak from 9 to 15
   * — entirely out of a replay computed against a calendar it could not read.
   * longest_len is a personal record; inflating it is not recoverable by
   * re-running anything.
   *
   * So when the model does not reproduce the stored counters it contributes
   * NOTHING but the delta: longest can only rise to the new current, which is
   * the only thing the restored day can honestly have achieved.
   */
  const nextLongest = modelAgrees
    ? Math.max(Number(swellRow?.longest_len ?? 0), nextCurrent, after.longestLen)
    : Math.max(Number(swellRow?.longest_len ?? 0), nextCurrent);
  /* last_completed_on only moves FORWARD. Restoring 30 October must not tell the
     app that the most recent completion is older than the one on 2 November. */
  const storedLast = (swellRow?.last_completed_on as string | null) ?? null;
  const nextLast = storedLast && storedLast > storeDate ? storedLast : storeDate;

  /* ONE EXPRESSION, USED BY BOTH THE PREVIEW AND THE INSERT. The preview
     printed the operator's bare reason while the insert stored the reason plus
     the override's trace — so the dry run was not showing what it would write,
     which is the only thing a dry run is for. */
  const storedReason = overrides.length ? `${reason} [${overrides.join("; ")}]` : reason;

  console.log(`\n  WOULD WRITE:`);
  console.log(`    daily_completion  ${storeDate}  kind=${kind}  rooftop=${rooftopId}`);
  console.log(`      video_content_id       ${mindset}`);
  console.log(`      pitch_video_content_id ${pitch ?? "null"}`);
  console.log(`      item_content_id        ${item}`);
  console.log(`      restored_reason        "${storedReason}"`);
  console.log(`    swell  current_len ${swellRow?.current_len ?? 0} -> ${nextCurrent}, longest ${swellRow?.longest_len ?? 0} -> ${nextLongest}, last ${storedLast ?? "null"} -> ${nextLast}`);
  console.log(`    NOT written: sand dollars, badges, paddle-out bank, content_progress,`);
  console.log(`                 pool cursors, track entry, module completion, accrual.`);

  if (!APPLY) {
    console.log(`\n  DRY RUN. Re-run with --apply to write.\n`);
    process.exit(0);
  }

  const now = new Date().toISOString();
  const { data: ins, error: insErr } = await sb
    .from("daily_completion")
    .insert({
      user_id: userId,
      rooftop_id: rooftopId,
      completion_date: storeDate,
      video_content_id: mindset,
      pitch_video_content_id: pitch,
      item_content_id: item,
      morning_kind: kind,
      /* The percentages the GATE recorded, which is the measurement this day is
         being restored on the strength of. */
      /* NULL where the leg came from the override: there is no coverage figure
         for it, and writing content_progress's furthest-reached number into a
         column that means coverage is exactly the two-numbers-one-name mistake
         this script's header refuses. */
      lifestyle_video_watch_pct: gates.find((g) => g.content_id === mindset)?.watched_pct ?? null,
      pitch_video_watch_pct: pitch
        ? (gates.find((g) => g.content_id === pitch)?.watched_pct ?? null)
        : null,
      watch_error: false,
      was_scheduled: scheduledOn(storeDate, ctx),
      /* THE TRACE THE OPERATOR CANNOT FORGET. An annotation adds evidence; an
         override removes a refusal, and a refusal overruled with no record is
         indistinguishable afterwards from one that never fired. */
      restored_reason: storedReason,
      restored_at: now,
    })
    .select("id")
    .maybeSingle();
  if (insErr || !ins?.id) fail(`the completion insert failed: ${insErr?.message ?? "no id returned"}`);
  console.log(`\n  wrote daily_completion ${ins.id}`);

  const { error: swellErr } = await sb.from("swell").upsert(
    {
      user_id: userId,
      current_len: nextCurrent,
      longest_len: nextLongest,
      last_completed_on: nextLast,
      /* UNTOUCHED. Ledger-backed — see the header. */
      paddle_out_available: Number(swellRow?.paddle_out_available ?? 0),
      paddle_out_last_granted: (swellRow?.paddle_out_last_granted as string | null) ?? null,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (swellErr) {
    /* COMPENSATE. The completion is the thing that claims the date, so a swell
       write that fails must not leave a day claimed with a stale streak — the
       advisor would be unable to restore it again. */
    await sb.from("daily_completion").delete().eq("id", ins.id);
    fail(`the swell write failed (${swellErr.message}). The completion was removed; nothing changed.`);
  }

  console.log(`  swell updated: current ${nextCurrent}, longest ${nextLongest}, last ${nextLast}`);
  console.log(`\n  done. ${storeDate} is restored for ${userId}.\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n  FAILED:", e?.message ?? e, "\n");
  process.exit(1);
});
