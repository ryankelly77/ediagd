#!/usr/bin/env node
/* ============================================================================
   EDIAGD — which screens break when somebody turns text size up

     node scripts/larger-text-audit.mjs
     node scripts/larger-text-audit.mjs --as=manager --shot

   ---------------------------------------------------------------------------
   WHY THIS IS MEASURED AND NOT READ
   ---------------------------------------------------------------------------
   The question "does this screen survive Larger Text" cannot be answered by
   grepping for hardcoded pixels. A `text-[13px]` label that never wraps is
   fine; a perfectly rem-scaled heading inside a fixed-height card is not, and
   nothing in the source says which is which. Only layout knows, and layout only
   exists once it is rendered.

   So this renders every screen at four text sizes and asks the DOM what broke.

   ---------------------------------------------------------------------------
   WHAT COUNTS AS BROKEN
   ---------------------------------------------------------------------------
   Three failures, in the order they matter:

     CLIPPED    text taller than the box it is in, with the overflow hidden.
                Words simply disappear — the worst one, because the screen
                still looks composed and is missing information.
     SPILLING   content wider than its container, where the container is not
                a deliberate horizontal scroller. Overlapping or cut-off text.
     PAGE WIDE  the document itself is wider than the viewport, so the whole
                screen scrolls sideways. Visible instantly, at least.

   Deliberate scrollers (overflow-x auto/scroll — the admin tables) are exempt
   from SPILLING: scrolling sideways is what they are for.

   ---------------------------------------------------------------------------
   THE SIZES
   ---------------------------------------------------------------------------
   iOS Dynamic Type runs from about 82% to 310% of default. 135% is the largest
   NON-accessibility size — the one an ordinary person reaches by dragging the
   slider in Display & Brightness, which on a service drive is most of them.
   200% is the accessibility range proper. Anything that survives 200% is safe;
   anything that fails at 125% is failing for people who never thought of
   themselves as needing accessibility settings.
   ============================================================================ */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const BASE = process.env.AUDIT_BASE ?? "https://app.ediagd.ai";
const SHOT = process.argv.includes("--shot");
const WHO = (process.argv.find((a) => a.startsWith("--as=")) ?? "--as=advisor").slice(5);

/** 16px is the browser default; the rest are multiples of it. */
const SCALES = [
  { label: "100%", px: 16 },
  { label: "125%", px: 20 },
  { label: "150%", px: 24 },
  { label: "200%", px: 32 },
];

const ROUTES = {
  advisor: ["/today", "/advisor", "/streak", "/library", "/sand-dollars", "/swag", "/profile", "/notifications", "/island-time"],
  manager: ["/manager", "/admin", "/admin/content", "/admin/closures", "/admin/settings", "/admin/economy", "/admin/mapping/dealer-codes"],
};

/* ---- Supabase: a session for the demo account -------------------------- */

async function magicLink() {
  const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("need SB_URL and SB_KEY");

  const want = WHO === "manager" ? "Demo Manager" : "Demo Advisor";
  const users = await (
    await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    })
  ).json();
  const rows = await (
    await fetch(`${url}/rest/v1/app_user?select=id,full_name&full_name=eq.${encodeURIComponent(want)}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    })
  ).json();
  if (!rows[0]) throw new Error(`no user called ${want}`);
  const u = (users.users ?? []).find((x) => x.id === rows[0].id);
  if (!u?.email) throw new Error(`${want} has no email on file`);

  const link = await (
    await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email: u.email, options: { redirect_to: BASE } }),
    })
  ).json();
  if (!link.action_link) throw new Error(`generate_link: ${JSON.stringify(link).slice(0, 200)}`);
  console.log(`  signing in as ${want} <${u.email.replace(/(.{2}).*(@.*)/, "$1***$2")}>`);
  return link.action_link;
}

/* ---- Chrome over the DevTools Protocol, no dependencies ---------------- */

let nextId = 1;
function connect(ws) {
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} timed out`)); }
      }, 45000);
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- The detector, run inside the page --------------------------------- */

const DETECT = `(() => {
  const out = { clipped: [], spilling: [], pageWide: 0 };
  const de = document.documentElement;
  out.pageWide = Math.max(0, de.scrollWidth - de.clientWidth);

  const describe = (el) => {
    const t = (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 70);
    const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
    return el.tagName.toLowerCase() + (cls ? "." + cls.split(" ").slice(0, 3).join(".") : "") + (t ? "  “" + t + "”" : "");
  };

  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || !el.clientHeight) continue;

    const hiddenY = cs.overflowY === "hidden" || cs.overflow === "hidden";
    const hiddenX = cs.overflowX === "hidden" || cs.overflow === "hidden";
    const scrollsX = cs.overflowX === "auto" || cs.overflowX === "scroll";

    // Text taller than its box, with nowhere to go.
    if (hiddenY && el.scrollHeight > el.clientHeight + 2 && el.children.length < 12) {
      out.clipped.push(describe(el) + "  [" + el.clientHeight + "px box, " + el.scrollHeight + "px of content]");
    }
    // Content wider than its box, and the box is not a deliberate scroller.
    if (!scrollsX && el.scrollWidth > el.clientWidth + 2 && (hiddenX || cs.overflowX === "visible")) {
      out.spilling.push(describe(el) + "  [" + el.clientWidth + "px box, " + el.scrollWidth + "px of content]");
    }
  }
  out.clipped = [...new Set(out.clipped)].slice(0, 6);
  out.spilling = [...new Set(out.spilling)].slice(0, 6);
  return JSON.stringify(out);
})()`;

async function main() {
  const link = await magicLink();

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--no-first-run",
    "--user-data-dir=/tmp/ediagd-audit-profile",
    /* An iPhone 16 Pro's CSS viewport. The audit is about phones. */
    "--window-size=402,874",
    "about:blank",
  ], { stdio: "ignore" });

  await sleep(2500);
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const send = connect(ws);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 402, height: 874, deviceScaleFactor: 2, mobile: true,
  });

  console.log("  authenticating…");
  await send("Page.navigate", { url: link });
  await sleep(6000);

  const results = [];
  if (SHOT && !existsSync("reports/larger-text")) mkdirSync("reports/larger-text", { recursive: true });

  for (const route of ROUTES[WHO] ?? ROUTES.advisor) {
    for (const scale of SCALES) {
      await send("Page.navigate", { url: BASE + route });
      await sleep(3500);
      await send("Runtime.evaluate", {
        expression: `document.documentElement.style.fontSize='${scale.px}px'`,
      });
      await sleep(1200);

      let data;
      try {
        const r = await send("Runtime.evaluate", { expression: DETECT, returnByValue: true });
        data = JSON.parse(r.result.value);
      } catch (e) {
        data = { clipped: [], spilling: [], pageWide: 0, error: String(e).slice(0, 120) };
      }

      const broken = data.clipped.length + data.spilling.length + (data.pageWide > 1 ? 1 : 0);
      results.push({ route, scale: scale.label, ...data, broken });
      const flag = broken === 0 ? "ok  " : "BREAKS";
      console.log(`  ${flag}  ${scale.label.padEnd(5)} ${route.padEnd(30)} clipped ${data.clipped.length}, spilling ${data.spilling.length}, page +${data.pageWide}px`);

      if (SHOT && broken) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        writeFileSync(
          `reports/larger-text/${route.replace(/\\//g, "_")}${scale.label}.png`,
          Buffer.from(shot.data, "base64")
        );
      }
    }
  }

  writeFileSync("reports/larger-text-audit.json", JSON.stringify({ base: BASE, who: WHO, results }, null, 1));
  ws.close();
  chrome.kill();

  /* ---- The summary that actually gets read ---------------------------- */
  console.log("\n  ── WHERE IT FIRST BREAKS ──");
  const byRoute = new Map();
  for (const r of results) {
    if (!r.broken) continue;
    if (!byRoute.has(r.route)) byRoute.set(r.route, r.scale);
  }
  const order = ["100%", "125%", "150%", "200%"];
  for (const s of order) {
    const rs = [...byRoute.entries()].filter(([, v]) => v === s).map(([k]) => k);
    if (rs.length) console.log(`  from ${s}:  ${rs.join(", ")}`);
  }
  const clean = (ROUTES[WHO] ?? ROUTES.advisor).filter((r) => !byRoute.has(r));
  console.log(`  survives 200%: ${clean.length ? clean.join(", ") : "none"}`);
  console.log("\n  detail -> reports/larger-text-audit.json\n");
}

main().catch((e) => { console.error("\n  " + e.message + "\n"); process.exit(1); });
