/* ============================================================================
   EDIAGD — sub-category → service family

   82 distinct sub-categories arrived in Doggett's first group workbook, against
   13 canonical families. This decides which of them map themselves and which
   are left for a person.

   THE RULE IS "CONFIDENT OR NOTHING". Every rule below is an exact match on a
   normalised string, not a fuzzy score and not a keyword contains. That is
   deliberate and it is the whole design:

     * "Brake Fluid Service" contains "Fluid", and a keyword matcher puts brake
       work under Fluids.
     * "Air & Fuel Delivery" and "Air Filter" share a word and belong to
       different families.
     * "Tune Up" plausibly means Spark Plugs, and plausibly means Maintenance.
       It is left unmapped rather than guessed.

   A wrong mapping is worse than an absent one. An unmapped sub-category shows
   up in a queue with its row count and gets fixed in a minute; a mis-mapped one
   silently moves an advisor's numbers into the wrong family and nobody looks
   again.

   These are STARTING POINTS, not the truth. Every mapping lands in
   sub_category_map with status 'auto', and an admin can overrule any of them
   per rooftop — at which point it becomes 'confirmed' and this file stops
   having an opinion about it.
   ============================================================================ */

/** Canonical families, mirroring the service_family table seeded in 0038. */
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
 * Measured against the 82 that actually arrived; anything not listed here is
 * left unmapped on purpose. Where a sub-category could defensibly sit in two
 * families, it is absent rather than arbitrated — see the note at the top.
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
};

/**
 * DELIBERATELY UNMAPPED, with the reason. Kept as a list rather than as a
 * comment so the mapping screen can explain itself instead of showing a
 * silent blank.
 */
export const AMBIGUOUS: Record<string, string> = {
  "tune up": "Could be Spark Plugs or Maintenance depending on what the store bundles.",
  "ignition": "Spark Plugs, or electrical Repair — the op codes underneath decide.",
  "oil additive": "Sold with an oil change, but it is a chemical, not the service.",
  "diagnosis": "Diagnostic time, charged against whatever it turns out to be.",
  "check engine light": "Diagnostic, not a family of work.",
  "state inspection": "Regulatory, not service work — but some stores treat it as Maintenance.",
  "inspection": "Too vague — could be state, multipoint, or used-car.",
  "engine": "Engine repair or engine service; the two sit in different families.",
  "transmission": "Repair, unless it means the fluid service, which is Fluids.",
  "belts cooling": "Two families in one label.",
  "wipers": "Usually an accessory sale; no canonical family covers it yet.",
};

export type AutoMatch = {
  subCategory: string;
  family: ServiceFamily | null;
  /** Why it was left alone, when it was. */
  note: string | null;
};

/** One sub-category's verdict. Null family means "leave it for a person". */
export function autoMatch(subCategory: string): AutoMatch {
  const key = normaliseSubCategory(subCategory);
  const family = RULES[key] ?? null;
  return {
    subCategory,
    family,
    note: family ? null : (AMBIGUOUS[key] ?? null),
  };
}

/** Bulk helper for the importer's preview. */
export function autoMatchAll(subCategories: string[]): AutoMatch[] {
  return subCategories.map(autoMatch);
}
