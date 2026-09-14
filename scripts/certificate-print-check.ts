/* ============================================================================
   EDIAGD — does the certificate actually land on the paper?

     npm run test:certificate-print

   ---------------------------------------------------------------------------
   WHY THIS EXISTS, WRITTEN DOWN SO IT IS NOT DELETED AS DUPLICATION
   ---------------------------------------------------------------------------
   test:certificate asserts that every field is in the markup. All 26 of those
   assertions passed while the printed certificate was clipping Mitch's
   signature at the page edge and dropping the founder line, the verify URL and
   the current-through date off the bottom of the sheet entirely.

   A field in the DOM and a field on the page are different claims. The first is
   cheap to assert and says almost nothing about a document whose entire purpose
   is to be printed. So this one prints it — really prints it, through the same
   browser engine an advisor uses — and then measures the result:

     * the PDF is exactly ONE page          (a second page IS the overflow)
     * the page is exactly 11in x 8.5in     (612 x 792 pt, landscape)
     * the bottom band carries ink on both  (the footer is ON the sheet, not
       the left and the right                past it)

   ---------------------------------------------------------------------------
   IT SKIPS RATHER THAN FAILS WITHOUT ITS TOOLS
   ---------------------------------------------------------------------------
   Needs Chrome and poppler's pdfinfo/pdftoppm. A machine without them should
   not get a red suite it cannot fix — but it says loudly that it skipped, so a
   silent pass is never mistaken for a verified one.
============================================================================ */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Certificate, SIGNATURE_SRC } from "@/components/certificate/Certificate";
import { MARK_SRC_DARK, MARK_SRC_LIGHT } from "@/lib/brand-ink";
import type { CertificateFacts } from "@/lib/certificate";
import type { IsoDate } from "@/lib/gamification/streak";

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
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
function has(bin: string): boolean {
  try {
    execFileSync("command", ["-v", bin], { shell: true, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(CHROME) || !has("pdfinfo") || !has("pdftoppm")) {
  console.log("\nSKIPPED — needs Chrome and poppler (pdfinfo, pdftoppm).");
  console.log("This is the only check that proves the document prints. Do not");
  console.log("read a skip as a pass.\n");
  process.exit(0);
}

const ROOT = process.cwd();
const work = mkdtempSync(join(tmpdir(), "ediagd-print-"));

/* Inlined so the file stands alone: file:// has no /public to serve from, and
   an absent mark or signature would make this measure the wrong document. */
function dataUri(publicPath: string, mime: string): string {
  const p = join(ROOT, "public", publicPath);
  return `data:${mime};base64,${readFileSync(p).toString("base64")}`;
}

const BRAND_VARS = `--ediagd-navy:12 28 44;--ediagd-teal:74 168 176;--ediagd-gold:232 180 76;--ediagd-cream:244 240 228;--ediagd-ink:12 28 44;--ediagd-line:224 216 198;`;

function pageHtml(body: string): string {
  const withAssets = body
    .split(SIGNATURE_SRC).join(dataUri(SIGNATURE_SRC, "image/png"))
    .split(MARK_SRC_LIGHT).join(dataUri(MARK_SRC_LIGHT, "image/svg+xml"))
    .split(MARK_SRC_DARK).join(dataUri(MARK_SRC_DARK, "image/svg+xml"));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{${BRAND_VARS}}
html,body{margin:0;padding:0}
@page{size:11in 8.5in;margin:0}
.ediagd-certificate,.ediagd-certificate *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
</style></head><body>${withAssets}</body></html>`;
}

const FACTS: CertificateFacts = {
  name: "Tracie Alvarez",
  level: "certified",
  certificateId: "EDG-C-2026-04817",
  earnedOn: "2027-03-14" as IsoDate,
  currentThrough: "2028-03-14" as IsoDate,
  foundingClass: true,
};

/** A P5 (binary) PGM, as pdftoppm -gray emits it. */
function readPgm(path: string): { w: number; h: number; px: Uint8Array } {
  const buf = readFileSync(path);
  let i = 0;
  const token = (): string => {
    while (buf[i] === 0x20 || buf[i] === 0x0a || buf[i] === 0x0d || buf[i] === 0x09) i++;
    if (buf[i] === 0x23) { while (buf[i] !== 0x0a) i++; return token(); }
    let s = "";
    while (i < buf.length && ![0x20, 0x0a, 0x0d, 0x09].includes(buf[i])) s += String.fromCharCode(buf[i++]);
    return s;
  };
  if (token() !== "P5") throw new Error("not a P5 pgm");
  const w = Number(token());
  const h = Number(token());
  token(); // maxval
  i++; // single whitespace before the raster
  return { w, h, px: new Uint8Array(buf.subarray(i, i + w * h)) };
}

/**
 * Fraction of pixels in a rectangle that differ from that rectangle's own
 * median by more than `delta`. In other words: how much CONTENT is there.
 *
 * NOT "how dark is it". The first version of this counted dark pixels, which
 * silently means "how much ground is there" on the Master certificate — navy
 * paper, so every pixel is dark. Its bleed check failed at 1.0 and, far worse,
 * its three footer checks PASSED at 1.0 without any text being present. A
 * measure that answers a different question on one of the two documents is not
 * a measure of either.
 *
 * Comparing against the region's own median makes it ground-agnostic: cream
 * paper with navy type and navy paper with cream type both read as "mostly one
 * value, with some pixels a long way off it".
 */
function contentIn(
  img: { w: number; h: number; px: Uint8Array },
  x0: number, y0: number, x1: number, y1: number,
  delta = 40
): number {
  const vals: number[] = [];
  for (let y = Math.max(0, y0); y < Math.min(img.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.w, x1); x++) {
      vals.push(img.px[y * img.w + x]);
    }
  }
  if (vals.length === 0) return 0;
  const median = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  return vals.filter((v) => Math.abs(v - median) > delta).length / vals.length;
}

for (const level of ["certified", "master"] as const) {
  console.log(`\n${level} — printed and measured`);
  const facts: CertificateFacts = {
    ...FACTS,
    level,
    certificateId: level === "master" ? "EDG-M-2027-00001" : FACTS.certificateId,
  };

  const html = pageHtml(renderToStaticMarkup(createElement(Certificate, { facts, appUrl: "https://app.ediagd.ai" })));
  const htmlPath = join(work, `${level}.html`);
  const pdfPath = join(work, `${level}.pdf`);
  writeFileSync(htmlPath, html);

  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
  ], { stdio: "pipe" });

  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
  const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
  const wpt = Number(size?.[1] ?? 0);
  const hpt = Number(size?.[2] ?? 0);

  /* ONE page. A second page is the overflow, and it is the failure mode that
     looks perfect in every DOM assertion. */
  ok("exactly one page", pages === 1, `${pages} pages`);
  /* 11in = 792pt, 8.5in = 612pt. Landscape. */
  ok("the page is 11in x 8.5in", Math.abs(wpt - 792) < 2 && Math.abs(hpt - 612) < 2,
    `${wpt} x ${hpt} pt`);

  execFileSync("pdftoppm", ["-gray", "-r", "100", "-f", "1", "-l", "1", pdfPath, join(work, level)]);
  const img = readPgm(join(work, `${level}-1.pgm`));
  ok("rasterized at 1100 x 850", img.w === 1100 && img.h === 850, `${img.w} x ${img.h}`);

  /*
   * THE FOOTER BAND. At 100dpi the sheet is 850px tall, so the bottom inch is
   * y 750..850. The footer is three columns: the certificate number and verify
   * URL on the left, the signature centred, the dates on the right.
   *
   * This is the assertion that would have caught the defect: when the column
   * overflowed, all three of these bands were empty because their content was
   * below the page edge.
   */
  const left = contentIn(img, 120, 745, 430, 840);
  const centre = contentIn(img, 430, 700, 670, 840);
  const right = contentIn(img, 670, 745, 980, 840);
  ok("the verify URL / certificate number print (left of the footer)", left > 0.004, `content ${left.toFixed(4)}`);
  ok("the signature prints (centre)", centre > 0.004, `content ${centre.toFixed(4)}`);
  ok("the issued / current-through dates print (right)", right > 0.004, `content ${right.toFixed(4)}`);

  /* And nothing is jammed against the trim: the last 0.15in, INSIDE the frame,
     must be clear ground on either colour of paper. */
  /* Tightened to the last 0.25in after the verify URL wrapped onto a second
     line that sat inside this band — content here means the footer has grown
     into the frame, whether by overflow or by a line break. */
  const bleed = contentIn(img, 100, 825, 1000, 850);
  ok("nothing runs into the bottom edge", bleed < 0.01, `content ${bleed.toFixed(4)}`);

  /* The 1.5in of dead space above the footer was the other half of the defect.
     The band just above the footer should not be a void. */
  const midLower = contentIn(img, 200, 560, 900, 700);
  ok("no dead band above the footer", midLower > 0.002, `content ${midLower.toFixed(4)}`);

  console.log(`      pdf: ${pdfPath}`);
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) for (const f of failures) console.log("  ✗ " + f);
console.log(`  artefacts in ${work}`);
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
