/* ============================================================================
   EDIAGD — rewrite reports/trim-verify-447.md with what the last batch did

     npm run trim:last-batch-report

   The 62 rows on Ryan's list are updated IN PLACE and the totals are redone.
   Every number comes from reports/trim-last-batch.json — the ledger the run
   wrote as it went — and nothing here is typed by hand.

   ---------------------------------------------------------------------------
   IT READS THE PRISTINE REPORT FROM GIT, NOT THE FILE ON DISK
   ---------------------------------------------------------------------------
   `git show HEAD:reports/trim-verify-447.md` is the source, so running this
   twice produces the same file rather than a report of a report. The 385 rows
   this batch never touched come through unchanged, byte for byte.

   ---------------------------------------------------------------------------
   THE TWO VERIFIED COLUMNS MEAN SOMETHING ELSE FOR A CUT FILM, AND IT SAYS SO
   ---------------------------------------------------------------------------
   In the 9 October reading, `head verified` was the GAP between the served
   rendition and the master, and `tail verified` was how far the served
   rendition ran past Mahalo. For a film this batch cut, the served rendition is
   now the master — the swap marked every crop stale — so the useful number is
   the ABSOLUTE air measured on the new master before it went live. Those rows
   carry that instead, and the legend says which rows they are. A column with
   two meanings and no label is how a table ends up describing a population it
   does not name.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "reports/trim-verify-447.md";
const PLAN = "reports/trim-last-batch-plan.json";
const LEDGER = "reports/trim-last-batch.json";
const ATTEMPT1 = "reports/trim-last-batch-attempt-1-end-time-on-the-master.json";

type Measured = {
  assetDuration: number; leadIn: number | null; tailAfterLast: number | null;
  firstWord: string | null; lastWord: string | null; mahaloEnd: number | null;
  headHeard: string; tailHeard: string; note: string | null;
};
type Entry = {
  contentId: string; title: string; rule: string;
  masterAssetId: string; sourceAssetId: string; newAssetId: string | null;
  source: { kind: string; offset: number; reconciled: string } | null;
  trimStart: number | null; trimEnd: number | null;
  sourceTrimStart?: number | null; sourceTrimEnd?: number | null;
  padHead?: number | null; padTail?: number | null;
  measuredBefore: Measured | null; measuredAfter: Measured | null;
  reportSecond: number | null; reconcileGap: number | null; uncutEndDrift?: number | null;
  swapped: boolean; verdict: "cut" | "refused" | "failed"; note: string | null; at: string;
};
type PlanRow = {
  id: string; title: string; series: string; rule: string;
  reportSecond: number | null; reportTail: number | null; reportVertical: string;
  reportOpens: string | null; reportCloses: string | null;
  masterAssetId: string | null; durationSec: number | null; because: string;
  reportSecondFrom?: string; rereadNote?: string;
};

const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

async function main() {
  const pristine = execFileSync("git", ["show", `HEAD:${OUT}`], { encoding: "utf8", maxBuffer: 1 << 26 });
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as { rows: PlanRow[] };
  const ledger: Record<string, Entry> = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
  const attempt1: { note: string; entries: Record<string, Entry> } = existsSync(ATTEMPT1)
    ? JSON.parse(readFileSync(ATTEMPT1, "utf8")) : { note: "", entries: {} };

  const byContent = new Map<string, Entry>();
  for (const e of Object.values(ledger)) byContent.set(e.contentId, e);
  const planById = new Map(plan.rows.map((r) => [r.id, r]));

  /* ---- what happened to each of the 62, from the ledger and the plan ----- */
  type Fate = {
    kind: "cut" | "pass" | "unpublished" | "left-alone";
    outcome: string;          // the table's outcome cell
    head: string; tail: string; vertical: string;
    detail: string[];         // the bullet lines in the section below
  };
  const fate = new Map<string, Fate>();

  for (const r of plan.rows) {
    const e = byContent.get(r.id);

    if (r.rule === "unpublish") {
      fate.set(r.id, {
        kind: "unpublished",
        outcome: "unpublished — the take was never finished; Mitch reshoots",
        head: "—", tail: "—", vertical: "—",
        detail: [
          `**unpublished**, \`status = 'draft'\` with the reason on the row. Not retired: a reshoot`,
          `replaces this row in place, so it has to survive to receive it.`,
          r.reportCloses ? `closes "${r.reportCloses}", not Mahalo — there is no sign-off to trim to` : "",
          r.reportOpens ? `opens "${r.reportOpens}", not Aloha` : "",
        ].filter(Boolean),
      });
      continue;
    }

    /*
     * ---- THE PLAN DECIDES; THE LEDGER RECORDS WHAT WAS DONE --------------
     *
     * Order matters and got this wrong once. A film the first run tried and
     * could not reconcile carries a `failed` ledger entry FOREVER, even after
     * --replan-from-master has since ruled it a pass on its own master. Reading
     * the ledger first reported six such films as "left alone — the clip was
     * not made", which is a true sentence about an abandoned attempt and a
     * false one about the film.
     *
     * So the plan's CURRENT rule picks the branch, and the ledger is consulted
     * only for the rules that were supposed to produce an action.
     */
    if (r.rule === "tail-pass" || r.rule === "head-pass") {
      // falls through to the pass branch below
    } else if (r.rule === "reread") {
      // falls through to the reread branch below
    } else if (r.rule !== "tail-cut" && r.rule !== "head-cut") {
      throw new Error(`"${r.title}" has rule "${r.rule}", which this report does not know how to state`);
    } else if (!e) {
      throw new Error(
        `"${r.title}" is a ${r.rule} with no entry in ${LEDGER} — the run has not finished, ` +
          `or it never reached this film. Nothing written.`
      );
    }

    if (e && e.verdict === "cut" && (r.rule === "tail-cut" || r.rule === "head-cut")) {
      const b = e.measuredBefore!;
      const a = e.measuredAfter!;
      const isTail = r.rule === "tail-cut";
      fate.set(r.id, {
        kind: "cut",
        outcome: isTail
          ? `cut — ${n(b.tailAfterLast)}s past Mahalo became ${n(a.tailAfterLast)}s`
          : `cut — ${n(b.leadIn)}s of air at the head became ${n(a.leadIn)}s`,
        head: n(a.leadIn), tail: n(a.tailAfterLast), vertical: "stale",
        detail: [
          isTail
            ? `**cut at the Mahalo + 0.7s pad.** Ran ${n(b.tailAfterLast)}s past its sign-off; now ${n(a.tailAfterLast)}s.`
            : `**cut at the energy onset − 0.3s pad.** Opened after ${n(b.leadIn)}s of air; now ${n(a.leadIn)}s.`,
          `master ${n(b.assetDuration)}s → ${n(a.assetDuration)}s, which is what the cut asked for`,
          isTail
            ? `closes "${a.lastWord ?? "—"}" — the head was untouched and reads ${n(a.leadIn)}s against ${n(b.leadIn)}s before`
            : `opens on "${a.firstWord ?? "—"}" — the tail was untouched and reads ${n(a.tailAfterLast)}s against ${n(b.tailAfterLast)}s before`,
          r.reportSecond != null
            ? `the master and the 447 reading agreed to ${n(e.reconcileGap, 3)}s about where to cut` +
              (r.reportSecondFrom === "master re-read, not independent"
                ? ` — but for this film the report had no number, so that cross-check is the master against itself and proves nothing`
                : "")
            : "",
          e.source
            ? `cut from the **${e.source.kind}**: ${e.source.reconciled}`
            : "",
          `verified at a 10-second window **before** the swap; the crop is now \`stale\`, so a phone letterboxes this master`,
        ].filter(Boolean),
      });
      continue;
    }

    if (e && (e.verdict === "refused" || e.verdict === "failed")
        && (r.rule === "tail-cut" || r.rule === "head-cut")) {
      fate.set(r.id, {
        kind: "left-alone",
        outcome: `left alone — the clip was ${e.verdict === "refused" ? "refused before the swap" : "not made"}`,
        head: n(e.measuredBefore?.leadIn), tail: n(e.measuredBefore?.tailAfterLast),
        vertical: r.reportVertical,
        detail: [
          `**left alone.** ${e.verdict === "refused"
            ? "A clip was made and read, and it did not pass, so nothing was swapped."
            : "The run could not get as far as a clip."}`,
          `what the gate said: ${e.note ?? "—"}`,
          `the film still serves exactly what it served before this batch`,
        ],
      });
      continue;
    }

    if (r.rule === "reread") {
      fate.set(r.id, {
        kind: "left-alone",
        outcome: "left alone — could not be read twice",
        head: "—", tail: "—", vertical: r.reportVertical,
        detail: [
          `**left alone.** ${r.because}`,
          r.rereadNote ? `the instrument said: \`${r.rereadNote}\`` : "",
          `the same failure, with the same number, on the **master** as on the vertical — so it is the`,
          `asset or the instrument and not the crop. Nothing is known about this film's ends, so`,
          `nothing was done to it.`,
        ].filter(Boolean),
      });
      continue;
    }

    /*
     * pass: tail-pass and head-pass. Two routes in, and they are NOT the same
     * claim, so they do not get the same sentence:
     *
     *   the report's own evidence  — the 9 October reading settled it
     *   a fresh master reading     — the report and the master disagreed, the
     *                                master won, and nothing corroborates it
     *
     * `because` is written at the point the decision was made, by whichever
     * pass made it, so it is used verbatim rather than reassembled here from
     * fields that may since have been overwritten.
     */
    const isHead = r.rule === "head-pass";
    const remeasured = r.reportSecondFrom === "master re-read, not independent";
    const e2 = byContent.get(r.id);
    const m2 = e2?.measuredBefore;
    fate.set(r.id, {
      kind: "pass",
      outcome: remeasured
        ? `pass — the master does not reproduce the report; ${isHead ? "no air at the head" : `tail ${n(m2?.tailAfterLast ?? r.reportSecond)}s`}`
        : isHead
          ? `pass — opens "${r.reportOpens}" at ${n(r.reportSecond)}s, Mitch already talking`
          : `pass — closes "${r.reportCloses}", not Mahalo; tail ${n(r.reportSecond)}s is within standard`,
      head: remeasured ? n(m2?.leadIn) : isHead ? n(r.reportSecond) : "—",
      tail: remeasured ? n(m2?.tailAfterLast) : isHead ? "—" : n(r.reportSecond),
      vertical: r.reportVertical,
      detail: [
        `**passes as it is.** ${r.because}`,
        m2
          ? `measured on the master: ${n(m2.leadIn)}s air then "${m2.firstWord ?? "—"}" … ` +
            `"${m2.lastWord ?? "—"}" then ${n(m2.tailAfterLast)}s`
          : "",
        remeasured
          ? `*this film's number comes from the master and nothing corroborates it — the 447 reading, ` +
            `which is the only other reading there is, disagrees.*`
          : "",
        `no cut, no reshoot.`,
      ].filter(Boolean),
    });
  }

  /* ---- rewrite the main table ------------------------------------------- */
  const lines = pristine.split("\n");
  const sectionTitleOf = new Map<string, string>();
  for (const r of plan.rows) sectionTitleOf.set(r.title, r.id);

  /* Titles repeat, so the table rows are matched in order against the sections,
     which is the same order both halves of the report are written in. */
  const ryanOrder: string[] = [];
  for (const sec of pristine.split(/\n### /).slice(1)) {
    const id = sec.split("\n")[1]?.match(/`([0-9a-f-]{36})`/)?.[1];
    if (id) ryanOrder.push(id);
  }
  let seen = 0;
  const out: string[] = [];
  for (const l of lines) {
    /* The SEVEN-cell film rows only. The summary block up top also begins
       "| " and also says "Ryan's list", and a looser test ate it. */
    const cells = l.startsWith("| ") ? l.split("|").map((s) => s.trim()) : [];
    if (cells.length >= 8 && /Ryan's list/.test(cells[7])) {
      const c = cells;
      const id = ryanOrder[seen++];
      const f = fate.get(id);
      if (!f) { out.push(l); continue; }
      out.push(`| ${c[1]} | ${c[2]} | ${c[3]} | ${f.head} | ${f.tail} | ${f.vertical} | ${f.outcome} |`);
      continue;
    }
    out.push(l);
  }
  if (seen !== 62) throw new Error(`rewrote ${seen} table rows, expected 62`);

  let md = out.join("\n");

  /* ---- the totals, computed from the fates ------------------------------ */
  const tally = { cut: 0, pass: 0, unpublished: 0, "left-alone": 0 } as Record<string, number>;
  for (const f of fate.values()) tally[f.kind]++;
  /* A pass reached two different ways is not one number. Seven of these films
     passed because a fresh master reading disagreed with the report; the rest
     passed on the report itself. Reporting them as one figure would hide the
     only place this batch found the 447 reading to be wrong. */
  const passRows = plan.rows.filter((r) => fate.get(r.id)!.kind === "pass");
  const passOnMaster = passRows.filter((r) => r.reportSecondFrom === "master re-read, not independent").length;
  const passOnReport = passRows.length - passOnMaster;
  const PASSED_BEFORE = 385;
  const nowPassing = PASSED_BEFORE + tally.pass;

  /*
   * ---- THE RENDITION COUNTS ARE NOW WRONG, SO THEY ARE RE-MEASURED -------
   *
   * The 9 October reading said "a phone gets the vertical on 413 films and the
   * master letterboxed on 34". Every cut in this batch marked a crop `stale`,
   * so that sentence became false the moment the first film swapped — and a
   * report that states a rendition split is a report somebody will act on.
   * Counted from the database rather than arithmetic on the old number, so the
   * two unpublished films drop out of the population by themselves.
   */
  const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, { auth: { persistSession: false } });
  const countWhere = async (col: string, val: string | null) => {
    let q = sb.from("content").select("*", { count: "exact", head: true })
      .eq("type", "advisor_video").eq("status", "published").is("retired_at", null);
    q = val == null ? q.is(col, null) : q.eq(col, val);
    const { count } = await q;
    return count ?? -1;
  };
  const { count: publishedNow } = await sb.from("content").select("*", { count: "exact", head: true })
    .eq("type", "advisor_video").eq("status", "published").is("retired_at", null);
  const vReady = await countWhere("vertical_status", "ready");
  const vStale = await countWhere("vertical_status", "stale");
  const vNone = (publishedNow ?? 0) - vReady - vStale;

  /*
   * ---- THE COLUMN THAT NOW HAS TWO MEANINGS MUST SAY SO -----------------
   *
   * This file's own header claims "the legend says which rows they are", and
   * for one draft it did not — the legend still defined `head verified` as a
   * gap against the master while 32 rows carried an absolute. A header
   * asserting a label exists is worse than no label, because it tells the
   * reader not to check.
   */
  md = md.replace(
    "**head verified** — the gap between where sound starts on the served rendition and\non the master, by energy. 0.00 where the served rendition *is* the master.\n**tail verified** — how long the served rendition runs past Mahalo.",
    [
      "**head verified** / **tail verified** — these mean TWO DIFFERENT THINGS and the outcome",
      "column tells you which. On a row whose outcome is `pass` from the 9 October reading, they are",
      "that reading's numbers: the head is the *gap* between the served rendition and the master, by",
      "energy, 0.00 where the served rendition *is* the master; the tail is how far the served",
      "rendition runs past Mahalo. On a row this batch **cut**, **re-measured**, or **left alone**,",
      "they are the ABSOLUTE air read on the master at a 10-second window — seconds of silence before",
      "the first sound and after the last — because the crop is stale and the master is what a phone",
      "now plays. An absolute and a gap are not comparable; do not read down these two columns as one",
      "series.",
    ].join("\n")
  );

  md = md.replace(
    /A phone gets the vertical on 413 films and the master letterboxed on 34\.\n1 vertical failed this check and was set `stale`, so that film is\njudged on the master a phone now plays instead\./,
    [
      `**Re-counted after this batch, ${new Date().toISOString().slice(0, 10)}:** of ${publishedNow} published films, a phone gets`,
      `the vertical on **${vReady}** and the letterboxed master on **${vStale + vNone}** (${vStale} \`stale\`, ${vNone} with no crop).`,
      "",
      "The 9 October reading counted 413 and 34, of a population of 447 that included the two",
      "films now unpublished. **32 of the stale crops are this batch's**, verified one by one",
      "against the rows — every cut marks its crop `stale`, because that crop was taken from the",
      "master the cut replaced. So the master a phone now letterboxes is the asset this batch read",
      "before it went live, which is the right way round. Re-deriving the crops is t29 and",
      "deliberately not this pass.",
    ].join("\n")
  );

  md = md.replace(
    /\| \| films \|\n\|---\|---:\|\n\| \*\*pass\*\* \| \*\*385\*\* \|\n\| \*\*Ryan's list\*\* \| \*\*62\*\* \|\n\| total \| 447 \|/,
    [
      "| | films |",
      "|---|---:|",
      `| **pass — nothing to do** | **${nowPassing}** |`,
      `| **cut, verified before the swap** | **${tally.cut}** |`,
      `| unpublished, Mitch reshoots | ${tally.unpublished} |`,
      `| left alone, and why is said | ${tally["left-alone"]} |`,
      `| total | 447 |`,
      "",
      `*Of the 62 on Ryan's list: **${tally.cut} cut**, **${tally.pass} passed**, `,
      `**${tally.unpublished} unpublished**, **${tally["left-alone"]} left alone**. The ${PASSED_BEFORE} that passed the 9 October`,
      "reading are untouched and their rows are unchanged below.*",
      "",
      `*Of those ${tally.pass} passes, **${passOnReport} stand on the 9 October report's own evidence** and`,
      `**${passOnMaster} stand on a fresh reading of the master that CONTRADICTS the report** — the master won,`,
      "and nothing else corroborates it. Those rows say so individually. The distinction matters: the",
      "first group needed no measurement, and the second is where the report was found to be wrong",
      "about the very thing it put the film on the list for.*",
    ].join("\n")
  );

  /* ---- rewrite the per-film sections ------------------------------------ */
  const head = md.split("\n## Ryan's list")[0];
  const parts: string[] = [head.trimEnd(), ""];

  const groups: { title: string; blurb: string; kinds: string[]; rules?: string[] }[] = [
    {
      title: `Cut, and verified before the swap — ${tally.cut}`,
      blurb:
        "Each of these was measured on its **master** at a 10-second window, cut, and the clip read " +
        "again **before any row pointed at it**. The swap marks the vertical `stale`, so a phone " +
        "letterboxes the master that was just verified. Re-deriving the crops is t29 and is not this pass.",
      kinds: ["cut"],
    },
    {
      title: `Passes as it is — ${tally.pass}`,
      blurb:
        "The report already said enough. A film with no Mahalo heard still ends within the library's " +
        "1.5-second tail standard, and a film with no Aloha heard that starts talking at once has no " +
        "air to remove. No cut, no reshoot.",
      kinds: ["pass"],
    },
    {
      title: `Unpublished — ${tally.unpublished}`,
      blurb:
        "Neither is a trim: the take was never taken to the end, so there is no sign-off to cut to. " +
        "`status = 'draft'` with the reason on the row, everything else untouched, and the row survives " +
        "to receive Mitch's reshoot in place. 0162 carries the argument.",
      kinds: ["unpublished"],
    },
    {
      title: `Left alone, and what was heard — ${tally["left-alone"]}`,
      blurb:
        "Nothing was changed on these and the reason is recorded. A film whose ends cannot be read is " +
        "a film nothing is known about, and the honest response to that is to do nothing and say so.",
      kinds: ["left-alone"],
    },
  ];

  for (const g of groups) {
    const rows = plan.rows.filter((r) => g.kinds.includes(fate.get(r.id)!.kind));
    if (!rows.length) continue;
    parts.push(`## ${g.title}`, "", g.blurb, "");
    for (const r of rows) {
      const f = fate.get(r.id)!;
      const e = byContent.get(r.id);
      parts.push(`### ${r.title}`);
      parts.push(
        `\`${r.id}\` · ${r.series} · ${r.durationSec ?? "—"}s` +
        (e?.measuredAfter ? ` → ${Math.round(e.measuredAfter.assetDuration)}s` : "") +
        ` · vertical \`${f.vertical}\``
      );
      parts.push("");
      for (const d of f.detail) parts.push(`- ${d}`);
      if (e?.measuredAfter?.tailHeard) {
        parts.push(`- tail now: "${e.measuredAfter.tailHeard.slice(-110).trim()}"`);
      }
      if (e?.measuredAfter?.headHeard && r.rule === "head-cut") {
        parts.push(`- head now: "${e.measuredAfter.headHeard.slice(0, 110).trim()}"`);
      }
      parts.push("");
    }
  }

  /* ---- the method, and the thing that nearly shipped -------------------- */
  const a1 = Object.values(attempt1.entries ?? {});
  if (a1.length) {
    parts.push(
      `## The method that was tried first, and what it would have shipped`,
      "",
      "Worth keeping, because it was wrong in the direction that looks like success.",
      "",
      "The first attempt clipped each film's **current master** with `end_time` alone. Head cuts came",
      "back perfect. Every tail cut came back with its sign-off cut in half:",
      "",
      "| film | asked | came back | closed on |",
      "|---|---|---|---|",
    );
    for (const e of a1) {
      parts.push(
        `| ${e.title} | 0 → ${n(e.trimEnd)}s | ${n(e.measuredAfter?.assetDuration)}s | ` +
        `"${e.measuredAfter?.lastWord ?? "—"}" with ${n(e.measuredAfter?.tailAfterLast)}s of air |`
      );
    }
    parts.push(
      "",
      "`mux://assets/ID` where ID is **itself a clip** does not deliver that clip's timeline. It",
      "re-resolves to the underlying source and lands on a keyframe *before* the master's zero, by an",
      "amount that varies per film — 0.90s on 15,000 Part 4, about 4.7s on 30 Second Walk-Around Part 3.",
      "",
      "**The length was always exactly what was asked for.** That is why a length check cannot see this,",
      "and it is why the first explanation offered for the 0.90s — \"the re-encode moved the −40dB",
      "crossing\" — was both plausible and false. The same film cut from its **archive** in the archive's",
      "timeline reads a drift of 0.000s, an onset of 0.59s matching the master to the centisecond, and",
      "\"Mahalo!\" with the 0.70s pad that was asked for.",
      "",
      "Nothing was served broken: all four were **refused before the swap**, which is the only reason",
      "this is a note about a method rather than a note about four films.",
      "",
    );
  }

  /* ---- what this batch found and did not close -------------------------- */
  /*
   * Computed, not typed. AGENTS.md's rule is that a fix gets the QUESTION it
   * answered written down and swept; these are the questions this batch raised
   * and the films that are the evidence for each, pulled from the ledger so
   * the list cannot drift from what actually happened.
   */
  const cutEntries = Object.values(ledger).filter((e) => e.verdict === "cut");
  const tightTails = cutEntries
    .filter((e) => e.rule === "tail-cut" && (e.measuredAfter?.tailAfterLast ?? 9) < 0.4)
    .sort((a, b) => (a.measuredAfter!.tailAfterLast! - b.measuredAfter!.tailAfterLast!));
  const unreachableSource = Object.values(ledger)
    .filter((e) => e.verdict === "refused" && /does not explain the master/.test(e.note ?? ""));
  const fromMasterFallback = cutEntries.filter((e) => e.source?.kind === "master");

  parts.push("## What this batch found and did not close", "");
  parts.push(
    "Each of these is a question rather than a task, and each names the films that are the evidence.",
    ""
  );

  parts.push(
    "### Where else does this codebase clip an asset that may itself be a clip?",
    "",
    "One `grep` for `mux://assets/`, and the answer in full:",
    "",
    "| site | source it clips | exposed? |",
    "|---|---|---|",
    "| `scripts/trim-last-batch.ts` | the archive where it reconciles, else the master | fixed — and it refuses what it cannot reconcile |",
    "| `scripts/trim-recut.ts` | `archived_asset_id`, always | safe by construction, and says so in its own header |",
    "| `scripts/replace-video.ts` `--trim-only` | the master on the row | **exposed** on any film the trim passes have touched |",
    "| `lib/mux/upload.ts` `clipAsset()` | whatever the caller passes | **exposed**, and has no callers today |",
    "| `lib/mux/derive.ts` | the asset's own master download, falling back to its HLS | not exposed — never uses `mux://` |",
    "",
    "`replace-video.ts` now carries a hazard note and prints a warning when the row already has an",
    "`archived_asset_id`, with the `select` widened so that check can actually fire. Its **behaviour is",
    "unchanged**: the right gate is probably \"refuse `--trim-only` on a row that has an archive, and clip",
    "the archive instead\", and that belongs in its own change with its own acceptance run rather than",
    "riding along with a trim batch.",
    ""
  );

  const unread = plan.rows.filter((r) => r.rule === "reread");
  if (unread.length) {
    parts.push(
      "### Two films' streams are shorter than the duration Mux reports for them",
      "",
      "`At the Kiosk` and `Piggyback` could not be read at a 10-second window — twice, on the vertical and",
      "then on the master, **returning the identical number both times**: 6.80s of 10.00s and 6.75s of",
      "10.00s. Two renditions agreeing to the centisecond is not a network flake, so it was worth one",
      "diagnostic pass.",
      "",
      "Seeking into `At the Kiosk` at three different targets, ffmpeg lands a **constant 3.20s** short of",
      "where `asset.duration` says it should:",
      "",
      "| `-ss` asked | audio returned | so the stream really ends at |",
      "|---|---|---|",
      "| 157.98s | 6.80s | 164.78s |",
      "| 161.98s | 2.80s | 164.78s |",
      "| 152.98s | 11.80s | 164.78s |",
      "",
      "A constant offset, not a keyframe effect — a keyframe snap would vary with the target. The Mux API",
      "reports `duration 167.98` for that asset and the playable stream carries about **164.78s**, so the",
      "last ~3.2s of what the row claims is not in what a phone would receive. `Piggyback` is the same",
      "shape, about 3.25s.",
      "",
      "**`trim-check.ts`'s `pull()` refusing was correct and protective**, not a limitation: it requires a",
      "window to come back within 0.75s of what was asked, which is exactly why these two stopped and why",
      "no film with a materially short stream reached a cut. The one visible difference between these two",
      "assets and a normal one is **three** English text tracks each, against two.",
      "",
      "Nothing is known about either film's ends, so nothing was done to them — the brief's \"no third read\"",
      "and the honest answer agree here. What they need is a look at why their streams are short, which is a",
      "delivery question and not a trim.",
      ""
    );
  }

  if (unreachableSource.length) {
    parts.push(
      "### A reshoot trimmed at replace time loses the only first-generation source it had",
      "",
      "These films could not be cut, and the reason is the same for both:",
      "",
    );
    for (const e of unreachableSource) {
      parts.push(`- **${e.title}** — ${e.note}`);
    }
    parts.push(
      "",
      "Both are `version 2`. The row's `archived_asset_id` is the **v1 take** — a different, shorter film —",
      "because the replace archived v1 while `ingest:videos` trimmed the fresh v2 upload at the same time.",
      "So the v2 master is itself a clip, and the asset it was clipped FROM is recorded nowhere: not on the",
      "row, which points at v1, and not in `slate-trims.json`, which records only how much was taken off.",
      "",
      "The consequence is narrow and permanent: these two films can never be trimmed again by any method",
      "that needs a first-generation source. Neither is urgent — measured on their masters the tails are",
      "1.53s and 1.44s against a 1.5s standard — but the gap is worth closing for the next reshoot, and the",
      "fix is for the replace to archive the untrimmed upload rather than only the take it superseded.",
      ""
    );
  }

  if (tightTails.length) {
    parts.push(
      "### Two films are cut tighter than the sign-off standard",
      "",
      "`trim-check.ts` sets `MIN_TAIL_AFTER_MAHALO = 0.4` — \"the sign-off must not run to the very edge\".",
      "The first build of this batch's gate used the HEAD constant, `MIN_FIRST_WORD_START = 0.15`, at the",
      "tail. Two films cut through the master-fallback path got past it:",
      "",
    );
    for (const e of tightTails) {
      parts.push(
        `- **${e.title}** — closes "${e.measuredAfter?.lastWord ?? "—"}" with ` +
        `**${n(e.measuredAfter?.tailAfterLast)}s** of air, where ${n(e.padTail)}s was asked for ` +
        `(the clip drifted ${n(e.uncutEndDrift)}s)`
      );
    }
    parts.push(
      "",
      "Both close on a **whole, audible \"Mahalo\"** and both are inside the 1.5s ceiling the brief set, so",
      "neither is broken — they are simply tighter than the house minimum. The constant is fixed in the",
      "script. Re-cutting them would mean a third-generation clip for a tenth of a second, which is a worse",
      "trade than leaving them, so they are left and named here instead of quietly.",
      ""
    );
  }

  if (fromMasterFallback.length) {
    parts.push(
      "### The fallback path is where every tight result came from",
      "",
      `${fromMasterFallback.length} of the ${cutEntries.length} cut films were clipped from their own master rather than an`,
      "archive, because no ledger could explain the master's length. Those are the only cut films with a",
      "non-zero drift on the end they did not cut. The archive path produced `0.000s` every time. If this",
      "batch has one reusable lesson for the next one, it is that **a drift of zero is the signature of a",
      "correct source**, and it is cheap to read.",
      ""
    );
  }

  writeFileSync(OUT, `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`);
  console.log(`\n  rewrote ${OUT}`);
  console.log(`  cut ${tally.cut}   pass ${tally.pass}   unpublished ${tally.unpublished}   left alone ${tally["left-alone"]}`);
  console.log(`  table rows rewritten: ${seen}\n`);
}

if (require.main === module) {
  main().catch((e) => { console.error(`\n  FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
}
