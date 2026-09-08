#!/usr/bin/env node
/* ============================================================================
   EDIAGD — carry the mark's geometry across the language boundary

   ---------------------------------------------------------------------------
   WHY THIS IS GENERATED AND NOT TYPED OUT
   ---------------------------------------------------------------------------
   lib/brand-ink.ts exists because the palm went into the master artwork and
   appeared in none of the four places the mark is hand-drawn: every copy
   carried its own geometry AND its own hex codes, and they had all quietly
   drifted. One import fixed that for the TypeScript surfaces.

   The native launch overlay is a fifth copy, in a language that cannot import
   TypeScript. Retyping the path data into Swift would rebuild exactly the
   problem brand-ink was created to end — and it would do it in the file
   furthest from anyone's eye, since nobody reads the launch screen's source
   after it works once.

   So the Swift is generated. Change the master, run `npm run brand:ink`, and
   the shell follows. The generated file is committed (Xcode has to compile it
   without running node first) but it is not the source: BrandInk.swift says so
   at the top of itself, and this script is the only thing that should write it.

   Parsing TypeScript with regular expressions is normally a bad idea. It is
   fine here because the input is a flat list of exported literals with no
   logic in it, and because a parse failure is loud: every extraction below is
   asserted, so a shape change breaks the build rather than silently emitting
   an empty array.
   ============================================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "lib/brand-ink.ts");
const OUT = resolve(root, "ios/App/App/BrandInk.swift");

const ts = readFileSync(SRC, "utf8");

function need(name, re) {
  const m = ts.match(re);
  if (!m) throw new Error(`brand-ink.ts: could not read ${name} — the shape of the file changed`);
  return m[1];
}

/** `export const NAME = "#rrggbb";` */
const hex = (name) => need(name, new RegExp(`export const ${name} =\\s*"(#[0-9a-fA-F]{6})"`));

/** `export const NAME = [ "…", "…" ] as const;` — the strings, in order. */
const strings = (name) => {
  const body = need(name, new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  const out = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!out.length) throw new Error(`brand-ink.ts: ${name} came back empty`);
  return out;
};

/** `export const NAME = "…";` possibly wrapped across lines by the formatter. */
const string = (name) =>
  need(name, new RegExp(`export const ${name} =\\s*\\n?\\s*"([^"]+)"`));

/** `{ x1: 1, y1: 2, x2: 3, y2: 4 }` repeated inside a `[…] as const`. */
const rays = () => {
  const body = need("MARK_RAYS", /export const MARK_RAYS = \[([\s\S]*?)\] as const;/);
  const out = [...body.matchAll(/x1:\s*([-\d.]+),\s*y1:\s*([-\d.]+),\s*x2:\s*([-\d.]+),\s*y2:\s*([-\d.]+)/g)]
    .map((m) => m.slice(1, 5).map(Number));
  if (!out.length) throw new Error("brand-ink.ts: MARK_RAYS came back empty");
  return out;
};

const circle = (name) => {
  const body = need(name, new RegExp(`export const ${name} = \\{([^}]*)\\}`));
  const g = (k) => {
    const m = body.match(new RegExp(`${k}:\\s*([-\\d.]+)`));
    if (!m) throw new Error(`brand-ink.ts: ${name} has no ${k}`);
    return Number(m[1]);
  };
  return { cx: g("cx"), cy: g("cy"), r: g("r") };
};

/** The viewBox is "0 0 W H"; the mark is square and every path is in it. */
const viewBox = string("MARK_VIEWBOX").trim().split(/\s+/).map(Number);
if (viewBox.length !== 4) throw new Error("brand-ink.ts: MARK_VIEWBOX is not four numbers");
const side = viewBox[2];

const swiftColor = (name, value) => {
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  const f = (n) => n.toFixed(4);
  return `    /// ${value} — from lib/brand-ink.ts\n` +
    `    static let ${name} = UIColor(red: ${f(r)}, green: ${f(g)}, blue: ${f(b)}, alpha: 1)`;
};

const list = (arr) => arr.map((d) => `        "${d}",`).join("\n");

const sun = circle("MARK_SUN_CIRCLE");
const ring = circle("MARK_RING");

const swift = `// GENERATED FILE — DO NOT EDIT.
//
// Written by scripts/gen-brand-ink-swift.mjs from lib/brand-ink.ts, which is
// itself taken verbatim from the designer's masters in public/brand/svg.
// Run \`npm run brand:ink\` after changing the mark. Editing this file by hand
// reintroduces exactly the drift brand-ink.ts was created to stop.

import UIKit

enum BrandInk {
${swiftColor("navy", hex("MARK_NAVY"))}

${swiftColor("cream", hex("MARK_CREAM"))}

${swiftColor("sun", hex("MARK_SUN"))}

${swiftColor("wave", hex("MARK_WAVE"))}

    /// The master viewBox is square; every path below is in these units.
    static let side: CGFloat = ${side}

    /// Trunk first, then five fronds.
    static let palmPaths: [String] = [
${list(strings("MARK_PALM_PATHS"))}
    ]

    static let wavePath = "${string("MARK_WAVE_PATH")}"

    /// The second is the fainter one.
    static let swellPaths: [String] = [
${list(strings("MARK_SWELL_PATHS"))}
    ]

    /// The sun's five rays, as line segments.
    static let rays: [(CGPoint, CGPoint)] = [
${rays().map(([x1, y1, x2, y2]) => `        (CGPoint(x: ${x1}, y: ${y1}), CGPoint(x: ${x2}, y: ${y2})),`).join("\n")}
    ]

    static let sunCenter = CGPoint(x: ${sun.cx}, y: ${sun.cy})
    static let sunRadius: CGFloat = ${sun.r}

    static let ringCenter = CGPoint(x: ${ring.cx}, y: ${ring.cy})
    static let ringRadius: CGFloat = ${ring.r}
}
`;

writeFileSync(OUT, swift);
console.log(`brand:ink → ${OUT.replace(root + "/", "")}`);
