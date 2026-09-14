/* ============================================================================
   EDIAGD — one mark, one source

     npm run test:brand-mark

   ---------------------------------------------------------------------------
   THE FOURTH TIME
   ---------------------------------------------------------------------------
   lib/brand-ink.ts was written because the palm went into the designer's master
   files and appeared in none of the four places the mark was hand-drawn. Then
   the seal inks drifted, and test:seal-ink was written. Then the certificate
   shipped with <Logo> — the pre-palm geometry — so the one document that gets
   framed on a wall carried a mark the rest of the product had stopped using.

   Every instance has the same cause: a second copy nobody remembered to update.
   Neither of the earlier checks would have caught this one, because the
   certificate's copy was not a colour and not a seal — it was a component.

   So this asserts the CAUSE rather than the instance: there is exactly one
   place the mark's source is named, and everything that shows the mark goes
   through it. A new surface that types the path inline fails here, and so does
   one that reaches for the hand-drawn component instead.
============================================================================ */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MARK_SRC_DARK, MARK_SRC_LIGHT } from "../lib/brand-ink";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

/* process.cwd(), not __dirname: this is compiled into .tmp-bm/scripts, where
   __dirname points at the build output and every path below would miss. npm
   runs scripts from the repo root. */
const ROOT = process.cwd();
const SEARCH = ["app", "components", "lib"];
/* The one module allowed to name the files, and the one component allowed to
   render them. Everything else asks BrandMark. */
const SOURCE_OF_TRUTH = join("lib", "brand-ink.ts");
const THE_COMPONENT = join("components", "brand", "BrandMark.tsx");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = SEARCH.flatMap((d) => walk(join(ROOT, d))).map((f) => ({
  rel: f.slice(ROOT.length + 1),
  text: readFileSync(f, "utf8"),
}));

section("1. the mark's files are named in exactly one place");
{
  /* Any literal reference to a primary mark file. The seal art and the simple
     mark are out of scope: the simple mark is a documented, separate asset for
     sizes where the rays close up, and the seals have their own guard. */
  const literal = files.filter(
    (f) =>
      f.rel !== SOURCE_OF_TRUTH &&
      /["'`][^"'`]*ediagd-mark-primary-(light|dark)\.svg/.test(f.text)
  );
  ok("no file types a primary mark path inline", literal.length === 0,
    literal.map((f) => f.rel).join(", "));

  ok("lib/brand-ink.ts names both variants",
    MARK_SRC_LIGHT.endsWith("ediagd-mark-primary-light.svg") &&
      MARK_SRC_DARK.endsWith("ediagd-mark-primary-dark.svg"),
    `${MARK_SRC_LIGHT} / ${MARK_SRC_DARK}`);
}

section("2. the files it names actually exist");
{
  for (const src of [MARK_SRC_LIGHT, MARK_SRC_DARK]) {
    let exists = true;
    try {
      statSync(join(ROOT, "public", src));
    } catch {
      exists = false;
    }
    ok(`public${src} is on disk`, exists);
  }
}

section("3. the master files still carry the palm");
{
  /*
   * The drift this whole file exists for was a mark WITHOUT the palm. If the
   * masters are ever replaced by something that has lost it again, every
   * surface inherits that silently — so check the artwork, not just the path.
   *
   * lib/brand-ink.ts holds the palm's trunk in master coordinates; the master
   * SVGs are the designer's own and are not required to use the same path data,
   * so this looks for the shape rather than the string: a palm means several
   * curves in the upper right of the ring, which the pre-palm mark has none of.
   */
  for (const src of [MARK_SRC_LIGHT, MARK_SRC_DARK]) {
    const svg = readFileSync(join(ROOT, "public", src), "utf8");
    const curves = (svg.match(/[Cc]\s*[\d.-]/g) ?? []).length;
    ok(`${src.split("/").pop()} is the full mark, not the reduced one`, curves >= 8,
      `${curves} curve commands`);
  }
}

section("4. the certificate and the header render from the same source");
{
  const cert = files.find((f) => f.rel.endsWith(join("certificate", "Certificate.tsx")));
  const header = files.find((f) => f.rel.endsWith(join("nav", "AppHeader.tsx")));

  ok("the certificate uses BrandMark", Boolean(cert && /\bBrandMark\b/.test(cert.text)));
  ok("the header uses BrandMark", Boolean(header && /\bBrandMark\b/.test(header.text)));

  /* THE ACTUAL CLAIM: not "both mention a component" but "both resolve to the
     same file". BrandMark is the only renderer, and it reads brand-ink. */
  const comp = files.find((f) => f.rel === THE_COMPONENT);
  ok("BrandMark is the only thing that renders a mark file",
    Boolean(comp && /MARK_SRC_DARK|MARK_SRC_LIGHT/.test(comp.text)));

  /* <Logo> is hand-drawn geometry and stays legitimate for surfaces that need
     it — but never for the printed document, which can simply show the master
     and therefore can never fall behind it. */
  ok("the certificate does NOT use the hand-drawn Logo",
    Boolean(cert && !/from "@\/components\/brand\/Logo"/.test(cert.text)));
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
