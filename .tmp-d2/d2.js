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
const HEADER_START = /^(fact\s*\/\s*talking point|nugget title)/i;
(async () => {
    const wb = new exceljs_1.default.Workbook();
    await wb.xlsx.readFile("data/Ediagd_master_2026_08_17_v2.xlsx");
    const ws = wb.getWorksheet("Service Knowledge — AC HVAC");
    const facts = [];
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
        facts.push(cell(r, 1));
    }
    const { data } = await sb.from("content").select("id,title").eq("type", "cue").eq("status", "draft").ilike("title", "%A/C Odor Treatment%").limit(3);
    const d = (data ?? [])[0];
    console.log("TITLE   :", JSON.stringify(d.title));
    console.log("len     :", d.title.length);
    const nt = norm(d.title);
    console.log("normTitle:", JSON.stringify(nt), "len", nt.length);
    const words = nt.split(" ");
    const prefix = words.slice(0, words.length - 1).join(" ");
    console.log("prefix  :", JSON.stringify(prefix));
    const cands = facts.filter((f) => norm(f).slice(0, 40) === nt.slice(0, 40));
    console.log("\nfacts matching first-40:", cands.length);
    cands.forEach((f) => {
        const nf = norm(f);
        console.log("  FACT normalized:", JSON.stringify(nf.slice(0, 120)));
        console.log("  startsWith(prefix)?", nf.startsWith(prefix));
        // find first divergence
        let i = 0;
        while (i < Math.min(nf.length, nt.length) && nf[i] === nt[i])
            i++;
        console.log("  diverge at char", i, "| title:", JSON.stringify(nt.slice(Math.max(0, i - 15), i + 25)), "| fact:", JSON.stringify(nf.slice(Math.max(0, i - 15), i + 25)));
    });
})();
