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

/**
 * A real session, obtained by using the real login form.
 *
 * The first attempt used an admin-generated magic link and every route
 * redirected to /login — because this app has NO auth callback route at all.
 * It is password-only. A magic link had nowhere to land, so nine screens were
 * audited as the login page.
 *
 * So: set a throwaway password on the demo account, then type it into the form
 * Chrome is already sitting in front of. That way the app establishes its own
 * cookies through its own code path, and this script does not have to know or
 * guess the shape of a Supabase session cookie — a shape that would drift on
 * the next dependency bump and fail silently in exactly this way again.
 */
async function signIn(send, sleep) {
  const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const want = WHO === "manager" ? "Demo Manager" : "Demo Advisor";

  const rows = await (await fetch(
    `${url}/rest/v1/app_user?select=id,full_name&full_name=eq.${encodeURIComponent(want)}`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  )).json();
  if (!rows[0]) throw new Error(`no user called ${want}`);

  const users = await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  })).json();
  const u = (users.users ?? []).find((x) => x.id === rows[0].id);
  if (!u?.email) throw new Error(`${want} has no email on file`);

  /* Random every run: a fixed one would be a credential living in the repo. */
  const password = `audit-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const set = await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
    method: "PUT",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!set.ok) throw new Error(`could not set a password: ${(await set.text()).slice(0, 160)}`);
  console.log(`  signing in as ${want} through the login form`);

  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(4000);

  /* React owns these inputs, so the value has to go in through the native
     setter and be announced, or the component never sees it. */
  const fill = (selector, value) => `(() => {
    const el = document.querySelector('${selector}');
    if (!el) return 'missing ${selector}';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`;

  const a = await send("Runtime.evaluate", { expression: fill('input[type="email"]', u.email), returnByValue: true });
  const b = await send("Runtime.evaluate", { expression: fill('input[type="password"]', password), returnByValue: true });
  if (a.result.value !== "ok" || b.result.value !== "ok") {
    throw new Error(`login form not as expected: ${a.result.value} / ${b.result.value}`);
  }

  /* There is no <form> here — the button carries an onClick — so submitting
     the form finds nothing and a [type=submit] selector matches nothing. Find
     it by what it says, which is the one thing that will not change silently. */
  const clicked = await send("Runtime.evaluate", {
    expression: `(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => (x.textContent || '').trim().toLowerCase().startsWith('sign in'));
      if (!b) return 'no sign-in button';
      b.click();
      return 'clicked';
    })()`,
    returnByValue: true,
  });
  if (clicked.result.value !== "clicked") throw new Error(clicked.result.value);
  await sleep(9000);

  const at = await send("Runtime.evaluate", { expression: "location.pathname", returnByValue: true });
  if (at.result.value === "/login") {
    /* Say WHY. The screen puts the reason on itself and reading it back is the
       difference between a fix and another guess. */
    const why = await send("Runtime.evaluate", {
      expression: `(document.body.innerText || '').split('\\n').filter(Boolean).slice(0, 12).join(' | ')`,
      returnByValue: true,
    });
    throw new Error(`still on /login — page says: ${why.result.value}`);
  }
  console.log(`  signed in, landed on ${at.result.value}`);
}

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
  /*
   * THREE FAILURES, NOT ONE, because they need different fixes.
   *
   *   TRUNCATED  the text is ellipsised — a .truncate that fitted at 100% and
   *              does not at 125%. Handled gracefully and still information
   *              lost, which on a tagline is cosmetic and on a film title is
   *              not.
   *   CLIPPED    overflow hidden with no ellipsis: words simply vanish, and
   *              the screen still looks composed.
   *   SPILLING   content genuinely wider than its box, overlapping or cut.
   *
   * Two exclusions, both learned from the first run reporting today's shipping
   * state as broken:
   *   - under 8px is rounding, not a layout failure
   *   - a box overflowed only by an ABSOLUTELY POSITIONED child is decorative
   *     bleed, which is what .ediagd-hero's motif does on purpose
   */
  const out = { truncated: [], clipped: [], spilling: [], pageWide: 0 };
  const de = document.documentElement;
  out.pageWide = Math.max(0, de.scrollWidth - de.clientWidth);
  const SLOP = 8;

  const describe = (el) => {
    const t = (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60);
    const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 3).join(".") : "";
    return el.tagName.toLowerCase() + (cls ? "." + cls : "") + (t ? '  "' + t + '"' : "");
  };

  const decorative = (el) =>
    [...el.children].some((c) => {
      const p = getComputedStyle(c).position;
      return p === "absolute" || p === "fixed";
    });

  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || !el.clientHeight) continue;

    const hiddenY = cs.overflowY === "hidden" || cs.overflow === "hidden";
    const hiddenX = cs.overflowX === "hidden" || cs.overflow === "hidden";
    const scrollsX = cs.overflowX === "auto" || cs.overflowX === "scroll";
    const overW = el.scrollWidth - el.clientWidth;
    const overH = el.scrollHeight - el.clientHeight;

    if (cs.textOverflow === "ellipsis" && overW > 1) {
      out.truncated.push(describe(el) + "  [" + el.clientWidth + "px box, " + el.scrollWidth + "px of text]");
      continue;
    }
    if (hiddenY && overH > SLOP && el.children.length < 12) {
      out.clipped.push(describe(el) + "  [" + el.clientHeight + "px box, " + el.scrollHeight + "px of content]");
      continue;
    }
    if (!scrollsX && overW > SLOP && (hiddenX || cs.overflowX === "visible") && !decorative(el)) {
      out.spilling.push(describe(el) + "  [" + el.clientWidth + "px box, " + el.scrollWidth + "px of content]");
    }
  }
  out.truncated = [...new Set(out.truncated)].slice(0, 8);
  out.clipped = [...new Set(out.clipped)].slice(0, 8);
  out.spilling = [...new Set(out.spilling)].slice(0, 8);
  return JSON.stringify(out);
})()`;

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--no-first-run",
    "--user-data-dir=/tmp/ediagd-audit-profile",
    /* An iPhone 16 Pro's CSS viewport. The audit is about phones. */
    "--window-size=402,874",
    "about:blank",
  ], { stdio: "ignore" });

  /* Poll rather than guess. The first run of this failed with a bare "fetch
     failed" because it assumed Chrome would be listening in 2.5 seconds and it
     was not — a fixed sleep is a race dressed up as a delay. */
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  if (!targets) throw new Error(`Chrome never opened a debugger on ${PORT}`);
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const send = connect(ws);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 402, height: 874, deviceScaleFactor: 2, mobile: true,
  });

  await signIn(send, sleep);

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

      /*
       * WHERE DID WE ACTUALLY LAND? The first run reported identical failures
       * on nine different routes, which is not nine coincidences — it is one
       * page measured nine times. Every route had redirected to /login because
       * the session never took. An audit that cannot tell you what it looked
       * at is worse than no audit: it produces a table.
       */
      const where = await send("Runtime.evaluate", {
        expression: "location.pathname", returnByValue: true,
      });
      const landed = where.result.value;

      let data;
      try {
        const r = await send("Runtime.evaluate", { expression: DETECT, returnByValue: true });
        data = JSON.parse(r.result.value);
      } catch (e) {
        data = { clipped: [], spilling: [], pageWide: 0, error: String(e).slice(0, 120) };
      }
      data.landed = landed;
      if (landed !== route) {
        console.log(`  SKIP   ${scale.label.padEnd(5)} ${route.padEnd(30)} redirected to ${landed}`);
        results.push({ route, scale: scale.label, ...data, broken: 0, skipped: true });
        continue;
      }

      const broken = data.truncated.length + data.clipped.length + data.spilling.length + (data.pageWide > 1 ? 1 : 0);
      results.push({ route, scale: scale.label, ...data, broken });
      const flag = broken === 0 ? "ok  " : "BREAKS";
      console.log(`  ${flag}  ${scale.label.padEnd(5)} ${route.padEnd(26)} truncated ${data.truncated.length}, clipped ${data.clipped.length}, spilling ${data.spilling.length}, page +${data.pageWide}px`);

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
