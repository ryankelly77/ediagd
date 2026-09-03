/* ============================================================================
   EDIAGD — Mitch's 055–057 ruling, applied

     SB_URL=… SB_KEY=… npm run ruling:op-codes            # apply
     SB_URL=… SB_KEY=… npm run ruling:op-codes -- --dry   # report only

   ---------------------------------------------------------------------------
   THE RULING
   ---------------------------------------------------------------------------
   The Open Items tab asked for op-code slots for services that had none, and
   the aliases proposed folding two of them into an existing code. Mitch ruled:
   A/C Odor Treatment, Evap Core, Arctic Blast and Tires are all standalone
   offerings.

   THREE OF THE FOUR NEEDED A CODE, NOT FOUR. Arctic Blast already had one —
   ABT-054, with an HVAC family row, a CONFIRMED ABL-006 -> ABT-054 alias, 20
   quiz questions and 3 cues already filed under it. The ruling is that it is
   standalone, and it already was; minting a second code would have split a live
   service in two and orphaned all of that. So it is left exactly as it is, and
   ABL-006 keeps pointing at it.

   That leaves three, which is exactly the three reserved slots. 065 is not
   needed and is not taken.

   ---------------------------------------------------------------------------
   WHY A SCRIPT AND NOT A MIGRATION
   ---------------------------------------------------------------------------
   None of this is schema. It is Mitch's ruling recorded as data through the
   paths the admin screens already use — the same writes his Op Codes and
   Aliases screens make, in an order a person could not reasonably click. It is
   committed rather than typed into a console because a ruling that changes a
   catalog should be readable afterwards, and idempotent so re-running it is a
   no-op rather than a second set of rows.

   Numbers are Mitch's to change. If he wants different ones they are renames on
   his Op Codes screen, not a data migration — the CODE is what content is filed
   under, the name and category are labels.
   ============================================================================ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");

/* Ryan, relaying the ruling. Every row this writes is stamped `admin` and
   attributed — a seeder re-run must not silently revert a decision (0073). */
const RULED_BY = "78929620-f92b-416f-80ac-41fcc3a6e3e8";

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}

/* ---------------------------------------------------------------------------
   1 · The codes
--------------------------------------------------------------------------- */

/**
 * Category and family follow the NEIGHBOURS, not the brief's shorthand.
 *
 * There is no "A/C" category in the catalog: ACR-047 (AC Recharge), ACS-048
 * (AC System Check), ACE-053 (AC Evaporator Cleaning) and ABT-054 (Arctic
 * Blast) all sit under "Engine & Performance" and all map to the HVAC family.
 * Filing the two new A/C services anywhere else would put siblings on different
 * shelves.
 *
 * Names drop the slash the same way the neighbours do — "AC Recharge", not
 * "A/C Recharge".
 *
 * sort_order is appended (74, 75, 76). Codes 058-064 were each appended as they
 * arrived rather than slotted next to their numeric neighbours, so following
 * that is what keeps the screen's order stable.
 */
const NEW_CODES = [
  {
    code: "ACO-055",
    name: "AC Odor Treatment",
    category: "Engine & Performance",
    family: "HVAC",
    sort_order: 74,
    notes:
      "Standalone per Mitch's ruling. Could not keep its DMS number ACO-010 — that collides with CLF-010.",
  },
  {
    code: "EVC-056",
    name: "Evap Core Service",
    category: "Engine & Performance",
    family: "HVAC",
    sort_order: 75,
    notes:
      "Standalone per Mitch's ruling — distinct from ACE-053 AC Evaporator Cleaning, which it had been proposed to fold into.",
  },
  {
    code: "TIR-057",
    name: "Tires",
    category: "Tires",
    family: "Tires & Rotation",
    sort_order: 76,
    notes:
      "Standalone per Mitch's ruling. The deck map wrote it as TIR-0XX (needs code); 321 ROs and $26,256 in Aug 2026 across 11 stores.",
  },
] as const;

/* ---------------------------------------------------------------------------
   2 · The aliases
--------------------------------------------------------------------------- */

/**
 * The old DMS numbers, retargeted at the new codes.
 *
 * These rows are not deleted. ACO-010 and EVC-007 are what Doggett's DMS
 * actually sends, so the alias has to keep existing or those rows resolve to
 * nothing — what changes is where it points. Retargeting IS the rejection of
 * the fold: the proposal to send both into ACE-053 cannot be confirmed into
 * wrongness because it no longer says that.
 *
 * ABL-006 IS DELIBERATELY ABSENT. It points at ABT-054, that is correct, and it
 * is already confirmed.
 */
const ALIAS_RETARGETS = [
  {
    alias: "ACO-010",
    to: "ACO-055",
    was: "ACE-053 (proposed, unconfirmed)",
    note:
      "A/C Odor Treatment. Mitch ruled it standalone, so it gets its own code rather than folding into evaporator cleaning. Kept its DMS number as the alias because ACO-010 collides with CLF-010 in the catalog.",
  },
  {
    alias: "EVC-007",
    to: "EVC-056",
    was: "ACE-053 (CONFIRMED)",
    note:
      "Evap Core. Was confirmed onto ACE-053 AC Evaporator Cleaning; Mitch ruled them separate services, so this now points at its own code.",
  },
] as const;

/* ---------------------------------------------------------------------------
   3 · Decks and proposals
--------------------------------------------------------------------------- */

/**
 * Quiz decks whose op-code linkage the ruling changes.
 *
 * Order matters: `Op Codes Covered` in the deck map lists the primary first.
 *   A/C Odor Treatment -> "ACO (needs code)"              -> ACO-055 alone
 *   Tires              -> "TIR (needs code), TPS-026, NIT-025"
 *                                                          -> TIR-057 primary,
 *                                                             TPS-026 and
 *                                                             NIT-025 kept
 * The Tires deck genuinely covers all three, so nothing is dropped.
 */
const DECK_CODES: { deck: string; codes: string[] }[] = [
  { deck: "A/C Odor Treatment", codes: ["ACO-055"] },
  { deck: "Tires", codes: ["TIR-057", "TPS-026", "NIT-025"] },
];

/** The Doggett sub-category the deck map could not propose a code for. */
const NEW_PROPOSALS = [
  {
    alias: "Tires",
    canonical: "TIR-057",
    evidence_ros: 321,
    evidence_labor: 26256,
    evidence_stores: 11,
    evidence_period: "Aug 2026",
    note:
      'Mitch\'s deck map, Aug 2026 · status BUILT · deck "Tires" · was TIR-0XX (needs code) until the 055-057 ruling',
  },
] as const;

/* ---------------------------------------------------------------------------
   Apply
--------------------------------------------------------------------------- */

const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};

async function main() {
  console.log(`\n  mode  ${DRY ? "DRY RUN — nothing is written" : "apply"}\n`);
  const now = new Date().toISOString();

  /* ---- 1. Catalog rows ------------------------------------------------- */
  say("  CODES");
  for (const c of NEW_CODES) {
    const { data: existing } = await sb()
      .from("op_code_catalog")
      .select("code, name, category")
      .eq("code", c.code)
      .maybeSingle();

    if (existing) {
      say(`    = ${c.code}  already present as "${existing.name}" — left alone`);
    } else {
      say(`    + ${c.code}  ${c.name}  [${c.category}]`);
      if (!DRY) {
        const { error } = await sb().from("op_code_catalog").insert({
          code: c.code,
          name: c.name,
          category: c.category,
          sort_order: c.sort_order,
          notes: c.notes,
          /* Stamped by hand: the service client carries no auth.uid(), so the
             0073 trigger would otherwise mark this 'file' and the next
             seed:op-codes run would revert Mitch's ruling. */
          origin: "admin",
          updated_by: RULED_BY,
          updated_at: now,
        });
        if (error) throw new Error(`${c.code}: ${error.message}`);
      }
    }

    /* ---- 2. Family, through mapping_edit -------------------------------
     * CORRECTION, so it lands at genesis. These services were always these
     * services — the catalog simply had no number for them, and a `change`
     * would say the family started applying today and leave every prior month
     * measured as though the work belonged nowhere.
     */
    const { data: fam } = await sb()
      .from("op_code_family")
      .select("code, family")
      .eq("code", c.code)
      .is("retired_at", null)
      .maybeSingle();

    if (fam && fam.family === c.family) {
      say(`      family ${c.family} already live — left alone`);
    } else if (fam) {
      /* A live row exists and disagrees: that is an EDIT, and edits go through
         mapping_edit so the previous version is retired rather than overwritten.
         Correction, because these services were always these services. */
      if (!DRY) {
        const { error } = await sb().rpc("mapping_edit", {
          _table: "op_code_family",
          _key: { code: c.code },
          _values: {
            family: c.family,
            coachable: true,
            confidence: "high",
            note: "Mitch's 055-057 ruling",
            origin: "admin",
            updated_by: RULED_BY,
          },
          _mode: "correction",
        });
        if (error) throw new Error(`${c.code} family: ${error.message}`);
      }
      say(`      family ${c.family} (correction through mapping_edit)`);
    } else {
      /*
       * ---- THE FIRST ROW IS AN INSERT, NOT AN EDIT ----------------------
       *
       * mapping_edit refuses a key with no live row — correctly; it exists to
       * retire-and-replace, and there is nothing to retire. The only existing
       * insert path is seed_op_code_family(), and it hard-codes origin='file'
       * — which is exactly the marking 0073 says a seeder may revert. Stamping
       * a ruling as though a seed file produced it is how the ruling gets
       * quietly undone by the next `npm run seed:op-codes`.
       *
       * So the first version is written directly, in the shape mapping_edit
       * would have produced for a correction: genesis, no retirement, origin
       * admin, attributed. Every later edit goes through mapping_edit as usual.
       */
      if (!DRY) {
        const { error } = await sb().from("op_code_family").insert({
          code: c.code,
          family: c.family,
          coachable: true,
          confidence: "high",
          note: "Mitch's 055-057 ruling",
          effective_from: "2000-01-01",
          origin: "admin",
          updated_by: RULED_BY,
          updated_at: now,
        });
        if (error) throw new Error(`${c.code} family: ${error.message}`);
      }
      say(`      family ${c.family} (first version, genesis 2000-01-01)`);
    }
  }

  /* ---- 3. Aliases ------------------------------------------------------- */
  say("\n  ALIASES");
  for (const a of ALIAS_RETARGETS) {
    const { data: row } = await sb()
      .from("mapping_alias")
      .select("id, canonical, confirmed")
      .eq("kind", "op_code")
      .eq("alias", a.alias)
      .maybeSingle();

    if (row?.canonical === a.to && row?.confirmed) {
      say(`    = ${a.alias} -> ${a.to}  already confirmed — left alone`);
      continue;
    }
    say(`    ~ ${a.alias} -> ${a.to}   (was ${a.was})`);
    if (!DRY) {
      const { error } = await sb()
        .from("mapping_alias")
        .upsert(
          {
            kind: "op_code",
            alias: a.alias,
            canonical: a.to,
            /* CONFIRMED. This is the ruling, not a proposal — an unconfirmed
               row would sit in Mitch's queue asking him to agree with a
               decision he just made. */
            confirmed: true,
            note: a.note,
            updated_at: now,
          },
          { onConflict: "kind,alias" }
        );
      if (error) throw new Error(`${a.alias}: ${error.message}`);
    }
  }
  say("    · ABL-006 -> ABT-054 left untouched — Arctic Blast already had its code");

  /* ---- 4. Quiz decks ---------------------------------------------------- */
  say("\n  QUIZ DECKS");
  for (const d of DECK_CODES) {
    const { data: before } = await sb()
      .from("quiz_question")
      .select("id, op_code, op_codes")
      .eq("deck", d.deck)
      .not("source_id", "is", null);

    const rows = before ?? [];
    const needs = rows.filter(
      (r) =>
        r.op_code !== d.codes[0] ||
        JSON.stringify(r.op_codes ?? []) !== JSON.stringify(d.codes)
    );
    say(
      `    ${d.deck}: ${rows.length} questions, ${needs.length} to re-point -> ${d.codes.join(", ")}`
    );
    if (!DRY && needs.length) {
      const { error } = await sb()
        .from("quiz_question")
        .update({ op_code: d.codes[0], op_codes: d.codes, updated_at: now })
        .eq("deck", d.deck)
        .not("source_id", "is", null);
      if (error) throw new Error(`${d.deck}: ${error.message}`);
    }
  }

  /* ---- 5. Dealer-code proposals ----------------------------------------- */
  say("\n  DEALER-CODE PROPOSALS");
  for (const p of NEW_PROPOSALS) {
    const { data: row } = await sb()
      .from("mapping_alias")
      .select("canonical, confirmed")
      .eq("kind", "op_code")
      .eq("alias", p.alias)
      .maybeSingle();

    if (row?.confirmed) {
      say(`    = ${p.alias} already CONFIRMED at ${row.canonical} — left alone`);
      continue;
    }
    if (row?.canonical === p.canonical) {
      say(`    = ${p.alias} -> ${p.canonical} already proposed — left alone`);
      continue;
    }
    say(`    + ${p.alias} -> ${p.canonical} proposed (${p.evidence_ros} ROs, $${p.evidence_labor})`);
    if (!DRY) {
      const { error } = await sb()
        .from("mapping_alias")
        .upsert(
          { kind: "op_code", ...p, confirmed: false, updated_at: now },
          { onConflict: "kind,alias" }
        );
      if (error) throw new Error(`proposal ${p.alias}: ${error.message}`);
    }
  }

  /* The A/C Services row now covers a code that exists. Its canonical does not
     move — ACR-047 is still the first resolvable code — but the note said the
     odor side folded into ACE-053, and that is no longer true. */
  if (!DRY) {
    const { data: acs } = await sb()
      .from("mapping_alias")
      .select("id, note, confirmed")
      .eq("kind", "op_code")
      .eq("alias", "A/C Services")
      .maybeSingle();
    /* Only when it does not already say so — a re-run should be silent. */
    if (acs && !acs.confirmed && !String(acs.note ?? "").includes("ACO-055")) {
      await sb()
        .from("mapping_alias")
        .update({
          note:
            'Mitch\'s deck map, Aug 2026 · status BUILT · deck "A/C Recharge + A/C Odor + Arctic Blast" · also covers ACS-048, ACE-053, ABT-054, ACO-055',
          updated_at: now,
        })
        .eq("id", acs.id);
      say("    ~ A/C Services note now names ACO-055 among the codes it covers");
    }
  }

  console.log(DRY ? "\n  DRY RUN — nothing written.\n" : "\n  done.\n");
}

if (require.main === module) {
  main().catch((e) => {
    console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  });
}

export { NEW_CODES, ALIAS_RETARGETS, DECK_CODES };
