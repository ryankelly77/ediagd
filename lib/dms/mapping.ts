/* ============================================================================
   EDIAGD — sub-category → service family

   82 distinct sub-categories arrived in Doggett's first group workbook, against
   13 canonical families. This decides which of them map themselves and which
   are left for a person.

   THE RULE IS "CONFIDENT OR NOTHING". Every sub-category rule below is an exact
   match on a normalised string, not a fuzzy score and not a keyword contains.
   That is deliberate and it is the whole design:

     * "Brake Fluid Service" contains "Fluid", and a keyword matcher puts brake
       work under Fluids.
     * "Air & Fuel Delivery" and "Air Filter" share a word and belong to
       different families.

   A wrong mapping is worse than an absent one. An unmapped sub-category shows
   up in a queue with its row count and gets fixed in a minute; a mis-mapped one
   silently moves an advisor's numbers into the wrong family and nobody looks
   again.

   ---------------------------------------------------------------------------
   MITCH'S TRIAGE, AUGUST 2026
   ---------------------------------------------------------------------------
   The 46 sub-categories that were still unmapped went to Mitch as a decision
   sheet and came back ruled. All 46 names matched the live queue exactly, so
   every ruling below lands on a real row. His five verdicts map onto this file
   as follows:

     NOT COACH (18)  -> NOT_COACHABLE, below. Stored, never counted.
     MAPPED    (12)  -> RULES, below. Whole sub-category, one family.
     NEW        (7)  -> RULES, below, against seven new families (six
                        content-gated, plus Accessories which never coaches).
     PARTIAL    (7)  -> OP_TEXT_RULES. The label holds coachable service AND
     SPLIT      (2)     repair; only the store's own op-code text separates them.

   ---------------------------------------------------------------------------
   WHY PARTIAL AND SPLIT NEEDED A SECOND KIND OF RULE
   ---------------------------------------------------------------------------
   "Transmission" is a fluid service and a $9,000 replacement under one label.
   A sub-category rule cannot tell them apart, so a whole-label mapping either
   credits repair work as a coachable sale or throws the service away.

   Measured across the nine PARTIAL/SPLIT labels — $3,346,405 of labor — only
   $442,505 (13%) is defensibly a coachable service. The other $2.9M is repair
   and diagnosis. That is not a disappointing result: it is the reason Mitch
   marked them PARTIAL rather than MAPPED, and crediting any of it as attach
   would have inflated every advisor's rate at every store.

   THE PATTERNS MATCH DESCRIPTIONS, NOT CODES. Store op codes are arbitrary —
   SP1, SPLUG4, 6TUNE, EE32, 38D, 36H and 0000622 all mean spark plugs — while
   the description the dealership types is consistent. Measured: keying the
   verdict on (rooftop, op_code) instead would have wrongly credited $388,668
   of repair, because generic codes like 100, MISC, TRIM and ENGINE carry both
   kinds of work under the same code. So the verdict is resolved per DAILY ROW,
   where the description still exists, and rides into advisor_op_metric as part
   of its grain. See 0054.

   ---------------------------------------------------------------------------
   OP-CODE GRAIN: DEFERRED, NOT REJECTED
   ---------------------------------------------------------------------------
   Mitch's sheet is written in EDIAGD op codes (TMB-039, SRP-038, ACR-047 …).
   This file targets the 13 — now 20 — canonical FAMILIES instead, because that
   is what advisor_family_attach, Eddie's Pick, the benchmarks and every screen
   actually speak. Op codes exist nowhere in the database today: the op_code
   table is empty, and the 51 codes in the library live only as text prefixes on
   59 cue titles.

   That is a real loss of resolution and it is temporary. At family grain,
   Timing Belts and Drive/Serp/V Belts both become "Belts & Cooling", so the app
   cannot yet coach "your timing belt attach is weak" — only "your belt and
   cooling attach is weak". Families are a strict roll-up of op codes, so the
   finer layer nests underneath this work rather than replacing it.

   TO BE BUILT when Mitch's master op-code list (051–064 definitions) arrives,
   and before a second dealer group onboards — a second group's op codes would
   otherwise be triaged into the same lossy layer and need doing twice.
   ============================================================================ */

/**
 * Canonical families, mirroring the service_family table.
 *
 * The first 13 were seeded in 0038. The last seven are Mitch's, added in 0054
 * because his biggest rulings had nowhere to go: $435K of Suspension, $540K of
 * HVAC and 1,611 wiper lines were being held against a list with no home for
 * them.
 *
 * SIX OF THE SEVEN NEW ONES ARE CONTENT-GATED — see COACHABLE_FAMILIES in
 * lib/advisor.ts. They map and they report; they do not coach until somebody
 * writes cues, and all six have zero cues today. Accessories is the seventh and
 * is deliberately never coached at all.
 */
export const SERVICE_FAMILIES = [
  "Oil Change",
  "Filters",
  "Tires & Rotation",
  "Alignment",
  "Brake Service",
  "Battery",
  "Fluids",
  "Fuel System",
  "Spark Plugs",
  "Differential",
  "Maintenance",
  "Repair",
  "Miscellaneous",
  // ---- Added 0054, from Mitch's triage ----
  "HVAC",
  "Belts & Cooling",
  "Wipers",
  "Lighting",
  "Suspension",
  "Inspections",
  // Accessories is the seventh, and it is a different KIND of family from the
  // six above: they are content-gated and will coach once cues exist, while
  // this one is never intended to. See the note on the rule below.
  "Accessories",
] as const;

export type ServiceFamily = (typeof SERVICE_FAMILIES)[number];

/** Lowercase, collapse whitespace, drop punctuation that varies by store. */
export function normaliseSubCategory(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[&/,\-–—()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exact-match rules, keyed by the NORMALISED sub-category.
 *
 * Where a sub-category could defensibly sit in two families it is absent rather
 * than arbitrated — except where Mitch has now arbitrated it, in which case his
 * ruling is cited.
 */
const RULES: Record<string, ServiceFamily> = {
  // ---- Oil ----------------------------------------------------------------
  "lof": "Oil Change",

  // ---- Filters ------------------------------------------------------------
  "air filter": "Filters",
  "cabin filter": "Filters",
  "cabin air filter": "Filters",
  "fuel filter": "Filters",

  // ---- Tyres --------------------------------------------------------------
  "rotate tires": "Tires & Rotation",
  "tires": "Tires & Rotation",
  "rotate r b": "Tires & Rotation",
  "tire repair sealant": "Tires & Rotation",
  "tire wheel": "Tires & Rotation",

  // ---- Alignment ----------------------------------------------------------
  "alignments": "Alignment",

  // ---- Brakes -------------------------------------------------------------
  // "Brake Fluid Service" is brake work, not a fluid service. The store books
  // it against the brake job; putting it under Fluids would understate every
  // advisor's brake attach rate.
  "brake": "Brake Service",
  "brake fluid service": "Brake Service",
  "brake pads rotors": "Brake Service",
  "brake rotors machined repl pads": "Brake Service",

  // ---- Battery ------------------------------------------------------------
  "batteries": "Battery",
  "battery service": "Battery",

  // ---- Fluids -------------------------------------------------------------
  "cooling system service": "Fluids",
  "transmission service": "Fluids",
  "power steering service": "Fluids",
  "transfer case service": "Fluids",

  // ---- Fuel system --------------------------------------------------------
  "fuel air induction service": "Fuel System",
  "air fuel delivery": "Fuel System",
  "fuel additive": "Fuel System",

  // ---- Differential -------------------------------------------------------
  "rear differential service": "Differential",
  "front differential service": "Differential",
  "front rear differential service 4x4": "Differential",

  // ---- Maintenance packages ----------------------------------------------
  // Menu-priced packages. Named differently at every store, same thing.
  "the works pkg": "Maintenance",
  "misc maint pkgs": "Maintenance",
  "minor menu": "Maintenance",
  "intermediate menu": "Maintenance",
  "major menu": "Maintenance",
  "multipoint inspection": "Maintenance",

  // ---- Miscellaneous ------------------------------------------------------
  // Only the ones that are unambiguously not service work.
  "rental loaner car": "Miscellaneous",
  "car wash detail": "Miscellaneous",
  "sublet towing": "Miscellaneous",
  "deductible insurance": "Miscellaneous",
  "information": "Miscellaneous",
  "other": "Miscellaneous",

  /* ======================================================================
     MITCH, AUGUST 2026 — MAPPED (12)
     "Fully covered by existing op codes." Whole label, one family.
     ====================================================================== */

  // BAT-033, BTS-034, BTT-035, ATT-036 — replacement, terminal service,
  // battery test, alternator test.
  "electrical charging starting": "Battery",

  // ACR-047, ACS-048, ACE-053, ABT-054. Mitch: "the PAS premium bundle maps to
  // MNU-007 AC Service Menu."
  "a c services": "HVAC",

  // TMB-039. Mitch: "the TBELT package codes map cleanly."
  "timing belts": "Belts & Cooling",
  // SRP-038.
  "drive serp v belts": "Belts & Cooling",

  // WBF-018, WBR-019, WBI-020, WTR-021, WWF-016.
  "wiper washer": "Wipers",
  // 1,474 RO lines — the highest line count of any covered service on the
  // sheet. This file used to say "no canonical family covers it yet". It does
  // now.
  "wipers": "Wipers",

  // BLB-037.
  "bulbs": "Lighting",
  // HLR-049. Two lines across two stores against 20 cues in the library —
  // Mitch flags it as a significant opportunity gap, not a coverage gap.
  "headlight restoration": "Lighting",

  // OIL-009 and EFL-046. Mitch: "EOS codes map to OIL-009."
  "engine service": "Oil Change",

  // TCF-015. 16 lines across 5 stores — an opportunity gap.
  "transfer case": "Fluids",

  // PCV-006. A serviceable engine component replaced on interval, which is
  // what the Filters family already holds; the library files PCV-006 under
  // Filters too.
  "pcv valve": "Filters",

  // NIT-025.
  "nitrogen": "Tires & Rotation",

  /* ======================================================================
     MITCH, AUGUST 2026 — NEW (7)
     "No EDIAGD op code covers this. Recommend creating one." The codes he
     proposes (SUS-058 … HYB-064) do not exist yet and cannot be stored — see
     the deferred-not-rejected note at the top. Each lands in the family his
     proposed code would roll up into.
     ====================================================================== */

  // SUS-058. $435K and 693 lines across 11 stores with no op code. Mitch:
  // "large enough to earn its own code even though much of it is repair."
  "suspension": "Suspension",

  // DPF-059 Diesel Particulate Filter Service. A filter serviced and
  // regenerated on interval, so it rolls up with the other filter maintenance
  // sales. PROPOSED, not Mitch's — his sheet names the code, not the family.
  "emission control": "Filters",

  // ACC-060. Glass, data dots, installed accessories.
  //
  // ITS OWN FAMILY, NOT Miscellaneous. Filing it under Miscellaneous satisfied
  // "mappable, not coached" but wrecked a bucket Mitch reads: it took Doggett
  // Ford's Miscellaneous from 1.3% to 23.4%, so $5,166 of windshield
  // installation, tint and data dots swamped what otherwise means rental cars
  // and car washes. Both requirements are met by giving it a name instead, and
  // the report stays readable.
  //
  // NEVER COACHED. Accessories is absent from BOTH lists in lib/advisor.ts —
  // COACHABLE_FAMILIES and COACHABLE_PENDING_CONTENT — so isCoachable() is
  // false for it no matter what the cue library ever holds. That is the
  // difference from the six above, which switch themselves on when somebody
  // writes cues.
  "accessories": "Accessories",

  // MPI-061. Mitch: "the MPI is the single most coached process in the library
  // and has no op code."
  "inspection": "Inspections",
  // UCI-062. "A distinct, repeatable, coachable inspection product separate
  // from the MPI."
  "uci used car inspection": "Inspections",

  // OAD-063. Sold with an oil change but it is a chemical, not the service —
  // which is why Mitch gave it its own code. It still rolls up to Oil Change.
  "oil additive": "Oil Change",

  // HYB-064 Hybrid / EV Maintenance. Mitch's example is MOCICF hybrid inverter
  // coolant exchange, a scheduled maintenance product. PROPOSED, not Mitch's.
  "hybrid maint": "Maintenance",
};

/**
 * MITCH, AUGUST 2026 — NOT COACH (18).
 *
 * Diagnostic, regulatory, repair, or a disposition. $2,220,988 of labor, 32.8%
 * of the queue — confirmed as outside coaching rather than merely undecided.
 *
 * THIS MOVES NO ATTACH RATE, BY DESIGN. advisor_family_attach already excludes
 * a row whose sub-category has no family, so an unmapped row and a
 * not_coachable row count identically today: not at all. The difference is that
 * one is a decision and the other is a queue item. Recording it takes 18 rows
 * off Mitch's list permanently and stops the next upload re-asking.
 *
 * Two labels here are the same thing twice — "Declined Services" and "Decline"
 * — which is duplication in the source data, not in this list.
 */
export const NOT_COACHABLE: Record<string, string> = {
  "diagnosis":
    "Diagnostic labor billed against whatever the job turns out to be. The resulting repair is the coachable thing, not this.",
  "other repairs": "General maintenance and misc buckets. No canonical service underneath.",
  "body": "Trim and body repair. Outside the service drive coaching model.",
  "exhaust": "Repair work. No maintenance sale underneath.",
  "software updates": "Programming and ADAS aiming. Not a coachable maintenance sale.",
  "keys program pats": "Key cutting and programming. Not a maintenance service.",
  "entertainment telematics": "Radio and infotainment repair.",
  "check engine light": "Diagnostic. Whatever it becomes is the coachable service.",
  "recall campaign":
    "Manufacturer-paid. Not an advisor sale, though Mitch notes it is a walk-around opportunity.",
  "state inspection":
    "Regulatory. 1,690 lines is high traffic — Mitch treats it as a walk-around and menu opportunity, not its own coachable service.",
  "parts": "Parts-counter and general mechanical. Not a service.",
  "declined services": "A disposition, not a service.",
  "decline": "Same as above — duplicate label in the source data.",
  "body shop": "Outside the service drive.",
  "hybrid repairs": "High voltage repair. Not a maintenance sale.",
  "pdi": "Pre-delivery inspection. Internal process.",
  "recheck comeback": "A comeback, not a sale.",
  "promo discount": "A discount line, not a service.",
};

/* ============================================================================
   OP-CODE TEXT RULES — the PARTIAL and SPLIT labels
   ============================================================================ */

/**
 * One rule per PARTIAL/SPLIT sub-category: the coachable slice, identified by
 * the store's own op-code description.
 *
 * REGEX DIALECT IS POSTGRES. These are evaluated by rebuild_dms_periods with
 * `~*`, so word boundaries are written `\y` — in Postgres `\b` means backspace,
 * not a boundary, and a pattern written for JavaScript would silently match
 * nothing. toJsRegex() below translates for the preview path.
 *
 * EXCLUDE WINS OVER INCLUDE. Every exclude here is a measured false positive,
 * not a precaution: "FOUND ENGINE LOCKED UP DUE TO OIL STARVATION" and "GOT OIL
 * CHANGE DONE AND WAS TOLD IT WAS CONSUMING OIL" both contain oil-service
 * language and are both engine repair.
 *
 * `matched` is what the rule captured when it was written, so a later drift in
 * coverage is visible rather than silent.
 */
export type OpTextRule = {
  /** Normalised sub-category this rule applies within. */
  subCategory: string;
  family: ServiceFamily;
  include: string;
  exclude: string | null;
  /** Measured labor dollars captured, August 2026. */
  matched: number;
  /** Measured labor dollars deliberately left for Mitch's round two. */
  residue: number;
  note: string;
};

export const OP_TEXT_RULES: OpTextRule[] = [
  {
    // Mitch: "Spark plugs are covered. Where a store bundles plugs with filters
    // and induction, the bundle is really a menu — see MNU-005."
    subCategory: "tune up",
    family: "Spark Plugs",
    include: String.raw`SPARK|\yPLUGS?\y`,
    exclude: String.raw`WIRE SET|IGNITION COIL`,
    matched: 274435,
    residue: 35321,
    note:
      "89% captured — the cleanest label on the sheet. The residue is bundled " +
      "'CAR AND LIGHT TRUCK 6 CYLINDER TUNE UP' codes that name no plug, which " +
      "are the menu bundles Mitch points at.",
  },
  {
    // Mitch: "Spark plugs where the underlying code is plugs. Coil and misfire
    // repair is not coachable."
    subCategory: "ignition",
    family: "Spark Plugs",
    include: String.raw`SPARK\s*PLUG`,
    exclude: String.raw`COIL`,
    matched: 2247,
    residue: 68259,
    note:
      "3% captured, and that is the right answer. Ignition at these stores is " +
      "coil packs, crankshaft sensors and check-engine diagnosis.",
  },
  {
    // Mitch: "Engine SERVICE maps to Engine Flush and Engine Oil Service.
    // Engine REPAIR has no op code and should not get one."
    subCategory: "engine",
    family: "Oil Change",
    include: String.raw`ENGINE OIL SERVICE|ENGINE FLUSH|OIL\s*(AND|&)\s*FILTER (CHANGE|SERVICE)|\yEOS\y`,
    exclude: String.raw`LEAK|STARVATION|CONSUM|KNOCK`,
    matched: 492,
    residue: 1037489,
    note:
      "$492 of $1.04M. The largest label on the sheet is almost entirely engine " +
      "repair, exactly as Mitch ruled. Deliberately narrow: a looser oil " +
      "pattern captures repair complaints that happen to mention oil.",
  },
  {
    // Mitch: "Split at the store code: belt codes to SRP/TMB/IDP, cooling codes
    // to CLF/CLH/WTP." At family grain both sides land in Belts & Cooling, so
    // this rule only has to separate service from repair.
    subCategory: "belts cooling",
    family: "Belts & Cooling",
    include: String.raw`SERPENTINE|DRIVE BELTS?|ACCESSORY (DRIVE )?BELT|TIMING BELT|\yT.?BELT|WATER PUMP|THERMOSTAT|COOLANT|RADIATOR HOSE|COOLING SYSTEM|IDLER|TENSIONER`,
    exclude: String.raw`HEAT EXCHANGER`,
    matched: 146213,
    residue: 333297,
    note:
      "30% captured. Water pump and hose work is included because Mitch's own " +
      "WTP-040 and CLH-042 codes cover them; the residue is generic engine " +
      "repair booked under this label.",
  },
  {
    // Mitch: "A/C recharge, system check, evaporator cleaning, Arctic Blast and
    // cabin filter are all covered. HVAC also captures heater core and blower
    // motor repair, which is repair work."
    subCategory: "hvac",
    family: "HVAC",
    include: String.raw`A/?C\s*(RECHARGE|SERVICE)|EVAPORATOR (CORE )?(CLEANING|SERVICE)|ARCTIC BLAST|CABIN (AIR )?FILTER|ODOR TREATMENT|REFRIGERANT|FREON (SERVICE|RECHARGE)`,
    exclude: String.raw`REPLACE|LEAK|REPAIR|DIAGNOS|COMPRESSOR|HOUSING|ACTUATOR`,
    matched: 2482,
    residue: 537331,
    note:
      "$2.5K of $540K. The coachable A/C services have their own sub-category " +
      "('A/C Services', now mapped) — this label is where the repair lands, " +
      "$102K of it under one TRIM code.",
  },
  {
    // Mitch: "Fluid service and filter are covered. Transmission REPAIR and
    // replacement are not, and should stay uncoded."
    subCategory: "transmission",
    family: "Fluids",
    include: String.raw`TRANSMISSION FLUID|TRANS(MISSION)?\s*(FLUID\s*)?(SERVICE|EXCHANGE|FLUSH)|TRANS(MISSION)? FILTER`,
    exclude: String.raw`REPAIR|REPLACE|CONCERN|DIAGNOS|PRESSURE PROBLEM`,
    matched: 1710,
    residue: 392552,
    note:
      "$1.7K of $394K. 'Transmission Service' is already its own mapped " +
      "sub-category, so what is left here is repair and replacement.",
  },
  {
    // Mitch: "Bulb replacement is covered. Harness and trim electrical repair
    // is not."
    subCategory: "electrical lighting body",
    family: "Lighting",
    include: String.raw`\yBULBS?\y|HEADLAMP|HEADLIGHT|TAIL\s?LIGHT|LAMP ASSEMBLY`,
    exclude: String.raw`CHECK ENGINE`,
    matched: 14606,
    residue: 211074,
    note:
      "6% captured. Never matches a bare 'LIGHT': CHECK ENGINE LIGHT and " +
      "'MULTIPLE LIGHT (ABS, TRACTION CONTROL, AIR BAG)' are both diagnostic.",
  },
  {
    // Mitch: "Differential fluid, differential filter and transfer case fluid
    // are covered. Axle and CV joint repair is not."
    subCategory: "driveline axles",
    family: "Differential",
    include: String.raw`DIFFERENTIAL (FLUID|SERVICE)|DIFF (FLUID|SERVICE)|TRANSFER CASE|GEAR OIL`,
    exclude: String.raw`REBUILD|REPLACE`,
    matched: 319,
    residue: 162565,
    note:
      "$319 of $163K. This label is wheel bearings, CV axles and rear main " +
      "seals — repair, as ruled.",
  },
  {
    // Mitch: "Power steering fluid is covered. Rack and pinion replacement is
    // repair."
    subCategory: "steering",
    family: "Fluids",
    include: String.raw`POWER STEERING FLUID|\yPS FLUID|STEERING FLUID\s*(SERVICE|EXCHANGE|FLUSH)`,
    exclude: String.raw`PUMP|RACK|GEARBOX|HOSE|RESERVOIR`,
    matched: 0,
    residue: 126011,
    note:
      "Nothing captured, from $126K. Every steering line at all eleven stores " +
      "is rack, pump or gearbox work. 'Power Steering Service' is already its " +
      "own mapped sub-category. The rule stays so a store that does book the " +
      "fluid service here is caught.",
  },
];

/** Postgres `\y` word boundary -> JavaScript `\b`, for the preview path. */
export function toJsRegex(pattern: string): RegExp {
  return new RegExp(pattern.replace(/\\y/g, "\\b"), "i");
}

/** Does an op-code description fall in the coachable slice of its label? */
export function matchOpText(
  subCategory: string,
  opDescription: string
): ServiceFamily | null {
  const key = normaliseSubCategory(subCategory);
  const rule = OP_TEXT_RULES.find((r) => r.subCategory === key);
  if (!rule) return null;
  const text = opDescription ?? "";
  if (!toJsRegex(rule.include).test(text)) return null;
  if (rule.exclude && toJsRegex(rule.exclude).test(text)) return null;
  return rule.family;
}

/**
 * DELIBERATELY UNMAPPED, with the reason.
 *
 * Mitch's triage emptied this list: all 46 sub-categories that were waiting on
 * a person now have a ruling. The ambiguity did not disappear, it moved one
 * level down — into the op-code text inside the PARTIAL and SPLIT labels, where
 * $2.9M sits as residue for his round two. Kept as an exported shape because
 * the mapping screen renders it, and because the next dealer group will arrive
 * with sub-categories nobody has seen.
 */
export const AMBIGUOUS: Record<string, string> = {};

export type AutoMatch = {
  subCategory: string;
  family: ServiceFamily | null;
  /** True when a person has ruled this outside coaching entirely. */
  notCoachable: boolean;
  /** Why it was left alone, when it was. */
  note: string | null;
};

/** One sub-category's verdict. Null family means "leave it for a person". */
export function autoMatch(subCategory: string): AutoMatch {
  const key = normaliseSubCategory(subCategory);

  const notCoachableNote = NOT_COACHABLE[key];
  if (notCoachableNote) {
    return { subCategory, family: null, notCoachable: true, note: notCoachableNote };
  }

  const family = RULES[key] ?? null;
  if (family) {
    return { subCategory, family, notCoachable: false, note: null };
  }

  // A PARTIAL/SPLIT label has no whole-label family: its rows are resolved
  // individually against the op-code text. Saying "unmapped" here would put it
  // straight back on Mitch's queue.
  const opRule = OP_TEXT_RULES.find((r) => r.subCategory === key);
  if (opRule) {
    return {
      subCategory,
      family: null,
      notCoachable: false,
      note: `Resolved per op-code line, not per label — ${opRule.note}`,
    };
  }

  return { subCategory, family: null, notCoachable: false, note: AMBIGUOUS[key] ?? null };
}

/** Bulk helper for the importer's preview. */
export function autoMatchAll(subCategories: string[]): AutoMatch[] {
  return subCategories.map(autoMatch);
}
