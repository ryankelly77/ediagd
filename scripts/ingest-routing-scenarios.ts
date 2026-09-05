/* ============================================================================
   EDIAGD — the filename says which shelf, and which stage

   Forty-three renamed films could not flow. The ingest's prefix pattern had no
   hyphen in it, so "EAF-001 — On the Drive — v1" split at the first dash and
   produced collection "EAF" — a prefix in no routing table, so every one of
   them would have been skipped as unknown. The right behaviour on a name it
   cannot read, applied to a name it should have read.

   These hold down the three decisions that fixes:

     1. AN OP CODE PARSES WHOLE. And it is tried as a SHAPE before the
        single-token rule, because a pattern that merely allows hyphens cannot
        tell which dash divides "EAF-001 - On the Drive".

     2. THE CATALOG DECIDES WHAT IS AN OP CODE. Not a table in a script — one
        has been wrong three times in this project.

     3. STAGE IS NULL FOR A PART TITLE. "Part 2" is a film name; the column
        answers "where in the pitch", which a part number does not.

     npm run test:ingest-routing
   ============================================================================ */

import {
  CANONICAL_STAGES,
  resolveStage,
  routeFor,
  splitPrefix,
  type Route,
  type RoutingTables,
} from "../lib/video/ingest-routing";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}\n        expected ${e}\n        actual   ${a}`);
    console.log(`    ✗ ${label}  expected ${e}, got ${a}`);
  }
}

console.log("\n  AN OP CODE PARSES WHOLE\n");

check("em dash", splitPrefix("EAF-001 — On the Drive"), { prefix: "EAF-001", title: "On the Drive" });
check("plain hyphen as the separator too", splitPrefix("EAF-001 - On the Drive"), {
  prefix: "EAF-001",
  title: "On the Drive",
});
check("a three-digit code", splitPrefix("ACR-047 — Part 2"), { prefix: "ACR-047", title: "Part 2" });
check("a title that itself contains a dash", splitPrefix("ABT-054 — Beat the Heat — bundle"), {
  prefix: "ABT-054",
  title: "Beat the Heat — bundle",
});

/* The original rule, untouched. */
check("a word prefix still works", splitPrefix("MINDSET — Sing It"), {
  prefix: "MINDSET",
  title: "Sing It",
});
check("and is still normalised", splitPrefix("walk around — The Hood"), {
  prefix: "WALKAROUND",
  title: "The Hood",
});
check("FND parses as a word prefix", splitPrefix("FND — Pre-Write"), {
  prefix: "FND",
  title: "Pre-Write",
});
check("no separator is no parse", splitPrefix("IMG_2165"), null);

console.log("\n  THE CATALOG DECIDES WHAT IS AN OP CODE\n");

const CRAFT: Route = { placement: "daily_lifestyle", collection: "Craft", craftSeries: null };
const tables: RoutingTables = {
  staticRoutes: {
    MINDSET: { placement: "daily_lifestyle", collection: "Mindset", craftSeries: null },
    CRAFT,
  },
  collectionAliases: new Map([
    ["FND", "Craft"],
    ["TECH", "Technician Training"],
  ]),
  opCodes: new Set(["EAF-001", "ACR-047", "ABT-054"]),
  collectionRoutes: { Craft: CRAFT },
};

check("a live op code routes to the pitches shelf, with its code", routeFor("EAF-001", tables), {
  placement: "op_code_pitch",
  collection: "Pitches by Op Code",
  craftSeries: null,
  opCode: "EAF-001",
});
check(
  "a code-SHAPED prefix the catalog does not have is not routed",
  routeFor("XYZ-999", tables),
  null
);
check("a static shelf still wins", routeFor("MINDSET", tables), tables.staticRoutes.MINDSET);
check("FND resolves through the alias to Craft", routeFor("FND", tables), {
  ...CRAFT,
  collection: "Craft",
});
check("an unknown prefix is never guessed onto a shelf", routeFor("NONSENSE", tables), null);

console.log("\n  STAGE IS THE SIX, OR NULL\n");

const aliases = new Map([
  ["mpi selling", "After-MPI"],
  ["set up the mpi", "MPI Setup"],
  ["on the drive, part 1", "On the Drive"],
]);

check("a canonical stage passes through", resolveStage("On the Drive", aliases), "On the Drive");
check("Mitch's phrasing is aliased to the canonical value", resolveStage("MPI Selling", aliases), "After-MPI");
check("and so is his other one", resolveStage("Set Up the MPI", aliases), "MPI Setup");
check("MPI Setup is already canonical", resolveStage("MPI Setup", aliases), "MPI Setup");
check("a bare part title is a film name, not a stage", resolveStage("Part 2", aliases), null);
check("and so is part three", resolveStage("Part 3", aliases), null);
check("a module name is not a stage either", resolveStage("Sing It", aliases), null);
check("Wrap-Up is not one of the six", resolveStage("Wrap-Up", aliases), null);

/* The constraint in 0062 is the authority on what this column accepts, and a
   value outside it fails the insert rather than being stored wrong. */
let outside = 0;
for (const s of ["On the Drive", "At the Kiosk", "MPI Setup", "After-MPI", "Pre-Write", "Objections"]) {
  if (!(CANONICAL_STAGES as readonly string[]).includes(s)) outside++;
}
check("every stage this module can return is one the database accepts", outside, 0);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
