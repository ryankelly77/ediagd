"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exceljs_1 = __importDefault(require("exceljs"));
const supabase_js_1 = require("@supabase/supabase-js");
const sb = (0, supabase_js_1.createClient)(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
function cell(row, i) {
    const v = row.getCell(i).value;
    if (v == null)
        return "";
    if (typeof v === "object") {
        const o = v;
        if (o.richText)
            return o.richText.map((t) => t.text).join("");
        if (o.text)
            return String(o.text);
        if (o.result != null)
            return String(o.result);
        return "";
    }
    return String(v);
}
const squash = (s) => s.replace(/\s+/g, " ").trim();
const norm = (s) => (s ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const isStump = (t) => t.length >= 58 || /^\*\*/.test(t);
const HEADER_START = /^(fact\s*\/\s*talking point|nugget title)/i;
const WANTED = ["Service Knowledge — AC HVAC", "Service Knowledge — EV Hybrid", "Product Knowledge — Hoses", "Product Knowledge — Headlights", "Product Knowledge — Timing Belt", "Product Knowledge — Belts", "Product Knowledge — Wipers", "MOC Warranty", "The 4-Step Close"];
(async () => {
    const wb = new exceljs_1.default.Workbook();
    await wb.xlsx.readFile("data/Ediagd_master_2026_08_17_v2.xlsx");
    const facts = new Map();
    for (const name of WANTED) {
        const ws = wb.getWorksheet(name);
        if (!ws)
            continue;
        const list = [];
        let started = false;
        for (let i = 1; i <= ws.rowCount; i++) {
            const r = ws.getRow(i);
            const c1 = squash(cell(r, 1));
            if (!c1)
                continue;
            if (i === 1)
                continue;
            if (/^op codes\s*:/i.test(c1))
                continue;
            if (/^\s*part\s+[A-Z]\b/i.test(c1))
                continue;
            if (HEADER_START.test(c1)) {
                started = true;
                continue;
            }
            if (!started)
                continue;
            const c2 = squash(cell(r, 2));
            if (!c2 || c2 === c1)
                continue;
            list.push(cell(r, 1));
        }
        facts.set(name, list);
    }
    const drafts = [];
    for (let o = 0;; o += 1000) {
        const { data } = await sb.from("content").select("id, title, source").eq("type", "cue").eq("status", "draft").order("id").range(o, o + 999);
        drafts.push(...(data ?? []));
        if (!data || data.length < 1000)
            break;
    }
    const stumps = drafts.filter((d) => isStump(d.title));
    console.log("stumps:", stumps.length);
    const bySrc = new Map();
    let matched40 = 0, matchedPrefix = 0, noTab = 0;
    const misses = [];
    for (const d of stumps) {
        const tab = (d.source ?? "").replace(/^Mitch import — /, "");
        bySrc.set(tab, (bySrc.get(tab) ?? 0) + 1);
        const list = facts.get(tab);
        if (!list) {
            noTab++;
            continue;
        }
        const k = norm(d.title).slice(0, 40);
        if (list.some((f) => norm(f).slice(0, 40) === k))
            matched40++;
        else if (list.some((f) => norm(f).startsWith(norm(d.title).slice(0, 30))))
            matchedPrefix++;
        else
            misses.push({ tab, title: d.title });
    }
    console.log("stump source labels:", [...bySrc].sort((a, b) => b[1] - a[1]));
    console.log("\nmatched by first-40 equality :", matched40);
    console.log("matched by 30-char prefix only:", matchedPrefix);
    console.log("stumps whose source label has no tab:", noTab);
    console.log("true misses:", misses.length);
    misses.slice(0, 6).forEach((m) => console.log("   ", m.tab, "|", m.title.slice(0, 70)));
})();
