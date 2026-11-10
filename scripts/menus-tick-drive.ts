/* ============================================================================
   EDIAGD — the three states of a module film's tick, photographed

   Reproduces, against LOCAL Supabase and the real `/library/m/<id>` page, the
   screen Valerie Patterson reported on 10 November 2026 and the two states it
   has to be told apart from.

     A  A COLLEAGUE'S COMPLETION, THE VIEWER'S NONE — the finding.
        The viewer holds manager AND advisor at one rooftop, which both of
        Beaumont's managers do. Another advisor at that rooftop has finished the
        film; the viewer has no content_progress row at all. `progress_team_read`
        lets the viewer read the colleague's row, and `loadModuleItems` read
        content_progress keyed only on content_id — so the deck drew a tick for
        a film the header correctly called unfinished.

     B  HER OWN COMPLETION, THROUGH completeLibraryItem.
        Not a row this script invents: the real server action is POSTed at the
        page's own boundary with the viewer's own cookie, so the row has the
        shape the product actually leaves. The header should read "1 of 1 done".

     C  watched_pct = 100, completed_at NULL — the shape the claim path repairs.
        record_watch_progress writes this while a film plays; the insert in
        completeLibraryItem then hits the unique index and the UPDATE with
        `is null` is what completes it. The header should read "0 of 1 done"
        and the deck should offer the film, not a tick.

   A AND C LOOK THE SAME TO THE DATABASE FROM A SERVICE-ROLE SEAT — in both the
   viewer has no completion. They differ in what the PAGE shows, which is why
   this drives the page as the viewer rather than querying as the service role.

   LOCAL ONLY. IT WRITES.

     SB_URL=http://127.0.0.1:55321 SB_KEY=<local service role> \
     SB_ANON_KEY=<local anon> APP_URL=http://127.0.0.1:3100 \
       npm run drive:menus-tick

   ---------------------------------------------------------------------------
   EVERY CLAIM IS READ OFF THE RENDERED PAGE
   ---------------------------------------------------------------------------
   The header text and the tick are pulled out of the DOM with
   Runtime.evaluate, not inferred from the rows this script wrote. A fixture
   that announces the state it meant to create is the same defect as the code it
   exists to photograph, and this one is specifically about a screen disagreeing
   with the data behind it — so the screen is the measurement.

   The run FAILS on an expectation that does not hold, and the exit code is the
   failure count. It also refuses if the page redirected (a missing
   work_schedule sends every route to /onboarding, which reads as a broken
   cookie) rather than screenshotting the wrong page.
============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const URL_ = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;
const APP = (process.env.APP_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const OUT = path.join(process.cwd(), "reports", "valerie");
/* So a before/after pair can be taken without one overwriting the other. */
const PREFIX = process.env.SHOT_PREFIX ?? "repro";

if (!URL_ || !KEY || !ANON) {
  console.error("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL_)) {
  console.error(`\n  REFUSING to run against ${URL_} — this writes. Local only.\n`);
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const TAG = `menus-tick-${randomUUID().slice(0, 6)}`;
const PASSWORD = "Fixture-passw0rd!";

let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) console.log(`    \x1b[32m✓\x1b[0m ${label}`);
  else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`    \x1b[31m✗\x1b[0m ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${what}: no row came back`);
  return r.data;
}

/* ---- Chrome over CDP. node 22 has a global WebSocket, so no package. ----- */
type Cdp = {
  send: (m: string, p?: unknown) => Promise<Record<string, unknown>>;
  close: () => void;
};

async function connect(wsUrl: string): Promise<Cdp> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("cdp connect failed"));
  });
  let next = 1;
  const waiting = new Map<number, (v: Record<string, unknown>) => void>();
  const rejecting = new Map<number, (e: Error) => void>();
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data)) as any;
    if (msg.id && waiting.has(msg.id)) {
      if (msg.error) rejecting.get(msg.id)!(new Error(msg.error.message));
      else waiting.get(msg.id)!(msg.result ?? {});
      waiting.delete(msg.id);
      rejecting.delete(msg.id);
    }
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = next++;
        waiting.set(id, resolve);
        rejecting.set(id, reject);
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => ws.close(),
  };
}

async function chromeTarget(port: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = (await res.json()) as any[];
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl as string;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("chrome never offered a page target");
}

/** The @supabase/ssr cookie for 127.0.0.1 is sb-127-auth-token. */
function authCookies(session: unknown): { name: string; value: string }[] {
  const raw = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const CHUNK = 3180;
  if (raw.length <= CHUNK) return [{ name: "sb-127-auth-token", value: raw }];
  const out: { name: string; value: string }[] = [];
  for (let i = 0, n = 0; i < raw.length; i += CHUNK, n++) {
    out.push({ name: `sb-127-auth-token.${n}`, value: raw.slice(i, i + CHUNK) });
  }
  return out;
}

/* ---- One viewer -------------------------------------------------------- */

type Viewer = {
  id: string;
  email: string;
  session: any;
  cookieHeader: string;
};

async function makeViewer(
  label: string,
  rooftopId: string,
  roles: ("advisor" | "manager")[]
): Promise<Viewer> {
  const email = `${TAG}-${label}@example.com`;
  const created = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser ${label}: ${created.error.message}`);
  const id = created.data.user!.id;

  /* IDS, NEVER NAMES. The full_name is for the screenshot caption only; nothing
     here or downstream looks anybody up by it. */
  must(
    await sb.from("app_user").upsert({ id, full_name: `${TAG} ${label}` }).select("id").single(),
    `app_user ${label}`
  );
  for (const role of roles) {
    must(
      await sb
        .from("membership")
        .insert({ user_id: id, rooftop_id: rooftopId, role, active: true })
        .select("id")
        .single(),
      `membership ${label}/${role}`
    );
  }
  /* Without a work_schedule the (app) layout redirects every route to
     /onboarding, which looks exactly like a broken cookie. */
  must(
    await sb
      .from("work_schedule")
      .insert({
        user_id: id,
        works_mon: true,
        works_tue: true,
        works_wed: true,
        works_thu: true,
        works_fri: true,
        /* Saturday is a MODE, not a boolean — rotating stores exist. 'none'
           is the column's own default and is spelled out here so a reader of
           the fixture is not left wondering which of the two it took. */
        saturday_mode: "none",
        works_sun: false,
      })
      .select("user_id")
      .single(),
    `work_schedule ${label}`
  );

  const asThem = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: signed, error: sErr } = await asThem.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (sErr) throw new Error(`signIn ${label}: ${sErr.message}`);
  const cookies = authCookies(signed.session);
  return {
    id,
    email,
    session: signed.session,
    cookieHeader: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  };
}

/* ---- completeLibraryItem, at the page's own boundary ------------------- */
/*
 * THE REAL ACTION, NOT A ROW THIS SCRIPT INVENTS.
 *
 * A server action is reachable by POSTing the page URL with `Next-Action: <id>`
 * and the arguments as a JSON array. The id is discovered from the page's own
 * client chunks, fetched WITH the cookie — so this exercises the action the
 * deck calls, with the viewer's session, through the same entitlement re-read
 * and the same serverGateThreshold check.
 *
 * It RETURNS the action's result parsed out of the RSC stream. A null return is
 * a failure to invoke and is reported as one; it is never treated as "probably
 * fine".
 */
async function callCompleteLibraryItem(
  viewer: Viewer,
  pageUrl: string,
  contentId: string,
  watchedPct: number
): Promise<{ actionId: string; result: string } | null> {
  const page = await fetch(pageUrl, { headers: { cookie: viewer.cookieHeader } });
  const html = await page.text();
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+?\.js/g)].map((m) => m[0]);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const c of chunks) {
    if (seen.has(c)) continue;
    seen.add(c);
    const res = await fetch(`${APP}${c}`, { headers: { cookie: viewer.cookieHeader } });
    if (!res.ok) continue;
    const src = await res.text();
    if (!/completeLibraryItem/.test(src)) continue;
    for (const m of src.matchAll(/["']([0-9a-f]{40,64})["']/g)) ids.push(m[1]!);
  }
  /* Several ids live in a chunk; the wrong one fails on argument coercion, so
     each is tried and the first that returns a result is the action. */
  for (const id of [...new Set(ids)]) {
    const res = await fetch(pageUrl, {
      method: "POST",
      headers: {
        cookie: viewer.cookieHeader,
        "Next-Action": id,
        "content-type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify([contentId, "library", watchedPct]),
    });
    const body = await res.text();
    const m = body.match(/\{"ok":(?:true|false)[^\n]*/);
    if (m) return { actionId: id, result: m[0].slice(0, 220) };
  }
  return null;
}

/* ---- Render and measure ------------------------------------------------ */

type Shot = {
  file: string;
  pathname: string;
  header: string;
  /** The fraction the header prints: "0 of 1 done" / "1 of 1 done". */
  subtitle: string;
  /** False when FilmBlock is absent — a different screen, not a missing tick. */
  filmFound: boolean;
  filmText: string | null;
  /** `isDone` — seeded from the item's `completed`, which is the defect. */
  donePill: boolean;
  /** `isMetNow` — `isDone` or the player having reached the gate this session. */
  watchedWord: boolean;
  /** The deck's terminal card line: "Lesson complete" / "N still to finish". */
  terminal: string;
  deckText: string;
};

async function shoot(
  cdp: Cdp,
  viewer: Viewer,
  url: string,
  outFile: string
): Promise<Shot> {
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCookies");
  /*
   * THE COOKIE'S DOMAIN IS THE APP'S HOST; ITS NAME IS THE SUPABASE HOST'S.
   *
   * Two different hostnames and it is easy to use one for both. @supabase/ssr
   * derives the NAME from the Supabase URL's first label — `sb-127-auth-token`
   * for 127.0.0.1 — while the browser will only send it to the app's own
   * origin. And the app's origin has to be whatever the dev server calls
   * ITSELF (read `- Local:` out of its log): navigating 127.0.0.1 at a server
   * that calls itself localhost makes Next treat every /_next request as
   * cross-origin and block it, so the page server-renders, returns 200, and
   * never hydrates. No useEffect, no action, and it reads as the feature being
   * broken.
   */
  const appHost = new URL(APP).hostname;
  for (const c of authCookies(viewer.session)) {
    await cdp.send("Network.setCookie", {
      name: c.name,
      value: c.value,
      domain: appHost,
      path: "/",
    });
  }
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  /* The first cold navigate can land on /onboarding even with a valid cookie;
     retry until the pathname is the route asked for, and FAIL rather than
     photograph the wrong page. */
  const want = new URL(url).pathname;
  let got = "";
  for (let i = 0; i < 8; i++) {
    await cdp.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 2200));
    const probe = (await cdp.send("Runtime.evaluate", {
      expression: "JSON.stringify({p: location.pathname, main: !!document.querySelector('main')})",
      returnByValue: true,
    })) as any;
    const v = JSON.parse(probe.result?.value ?? "{}");
    got = v.p ?? "";
    /* `main` is required too: Chrome's connection-refused page keeps the
       pathname, so a dead dev server would otherwise read as a success. */
    if (got === want && v.main) break;
  }

  /*
   * ---- THE TICK IS READ FROM THE FILM BLOCK, NOT FROM THE PAGE ------------
   *
   * The first version of this tested /\b(Watched|Done)\b/ against the whole of
   * `main`, and the HEADER SAYS "0 of 1 done" — so it reported a tick on every
   * screen including the two that have none, and the three-state comparison
   * came out identical. The detector was measuring the sentence it was supposed
   * to be distinguishing from.
   *
   * So it anchors on the structure instead. FilmBlock is the `<section>` whose
   * eyebrow reads "Video"; inside it, `isDone` renders a pill saying "Done" and
   * `isMetNow` renders the word "Watched". Those two are the film's own claim.
   * A missing section is reported as missing rather than as "no tick", because
   * FilmMissingBlock is a different screen and would otherwise read as a pass.
   */
  const read = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const h1 = document.querySelector('h1');
      const title = h1 ? h1.innerText.trim() : '';
      const main = document.querySelector('main');
      const all = main ? main.innerText.replace(/\\s+/g, ' ').trim() : '';
      /* The fraction itself, matched rather than sliced out of a breadcrumb. */
      const m = all.match(/(\\d+ of \\d+ done|Quiz waiting|\\d+ cues? · no lesson yet)/);
      const subtitle = m ? m[1] : '';
      const sections = [...document.querySelectorAll('section')];
      const filmSection = sections.find((s) => {
        const eyebrow = s.querySelector('.ediagd-eyebrow');
        return eyebrow && eyebrow.textContent.trim() === 'Video';
      }) || null;
      const filmText = filmSection ? filmSection.innerText.replace(/\\s+/g, ' ').trim() : null;
      /*
       * THE PILL IS FOUND BY textContent, NOT innerText, AND THAT IS THE WHOLE
       * DIFFERENCE. innerText is the RENDERED text, and the pill carries
       * Tailwind's \`uppercase\` — so the DOM says "Done" and innerText says
       * "DONE". A case-sensitive match against innerText reported no pill on
       * the one screen that has one, and the three states came out looking like
       * two. textContent is the source text and cannot be restyled out from
       * under this check.
       */
      const donePill = filmSection
        ? [...filmSection.querySelectorAll('span')].some(
            (el) => el.textContent.trim() === 'Done'
          )
        : false;
      const watchedWord = filmSection
        ? [...filmSection.querySelectorAll('span')].some(
            (el) => el.textContent.trim() === 'Watched'
          )
        : false;
      const terminal = all.match(/(Lesson complete|\\d+ still to finish|Quiz is waiting[^.]*)/);
      return JSON.stringify({
        title,
        subtitle,
        all: all.slice(0, 900),
        filmFound: Boolean(filmSection),
        filmText: filmText ? filmText.slice(0, 400) : null,
        donePill,
        watchedWord,
        terminal: terminal ? terminal[1] : '',
        p: location.pathname,
      });
    })()`,
    returnByValue: true,
  })) as any;
  const v = JSON.parse(read.result?.value ?? "{}");

  const png = (await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  })) as any;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, outFile), Buffer.from(String(png.data), "base64"));

  return {
    file: outFile,
    pathname: v.p ?? got,
    header: v.title ?? "",
    subtitle: v.subtitle ?? "",
    filmFound: Boolean(v.filmFound),
    filmText: v.filmText ?? null,
    donePill: Boolean(v.donePill),
    watchedWord: Boolean(v.watchedWord),
    terminal: v.terminal ?? "",
    deckText: v.all ?? "",
  };
}

/* ======================================================================== */

let chrome: ChildProcess | null = null;

async function main() {
  console.log(`\n\x1b[1mthe three states of a module film's tick\x1b[0m   tag ${TAG}`);
  console.log(`  app ${APP}   supabase ${URL_}\n`);

  /* ---- The store ------------------------------------------------------- */
  const org = must(await sb.from("org").insert({ name: `${TAG} Org` }).select("id").single(), "org") as any;
  const roof = must(
    await sb
      .from("rooftop")
      .insert({ name: `${TAG} Ford`, org_id: org.id, timezone: "America/Chicago" })
      .select("id")
      .single(),
    "rooftop"
  ) as any;
  must(
    await sb
      .from("rooftop_product")
      .insert({ rooftop_id: roof.id, product: "advisor_base", status: "active" })
      .select("rooftop_id")
      .single(),
    "rooftop_product"
  );

  /* ---- One module, one gating film, no cues ---------------------------- */
  /* No cues on purpose: the header's fraction counts gating items only (0160),
     so cues would add nothing to the number under test and would add cards to
     the shot that are not the subject. */
  const course = must(
    await sb
      .from("course")
      .insert({ name: `${TAG} Menus`, slug: `${TAG}-menus`, track: "craft", sort_order: 1 })
      .select("id")
      .single(),
    "course"
  ) as any;
  const mod = must(
    await sb
      .from("module")
      .insert({
        course_id: course.id,
        name: "The Maintenance Menu — the OE Approach",
        sort_order: 1,
      })
      .select("id")
      .single(),
    "module"
  ) as any;
  const film = must(
    await sb
      .from("content")
      .insert({
        type: "advisor_video",
        status: "published",
        title: `${TAG} The OE Approach — The Maintenance Menu`,
        /* 167, the real film's duration, so serverGateThreshold is the number
           production actually applies: 98.2036%. */
        duration_sec: 167,
        module_id: mod.id,
        module_order: 1,
        mux_playback_id: `fx-${randomUUID().slice(0, 10)}`,
        mux_playback_policy: "signed",
        captions_ready: true,
      })
      .select("id")
      .single(),
    "film"
  ) as any;

  const pageUrl = `${APP}/library/m/${mod.id}`;
  console.log(`  module ${mod.id}`);
  console.log(`  film   ${film.id}  duration 167s → server bar 98.2036%\n`);

  /* ---- The viewers ----------------------------------------------------- */
  const colleague = await makeViewer("colleague", roof.id, ["advisor"]);
  const vA = await makeViewer("A-manager-advisor", roof.id, ["manager", "advisor"]);
  const vB = await makeViewer("B-own-completion", roof.id, ["advisor"]);
  const vC = await makeViewer("C-pct100-null", roof.id, ["advisor"]);

  /* A: the colleague finished it; the viewer has nothing. */
  must(
    await sb
      .from("content_progress")
      .insert({
        user_id: colleague.id,
        rooftop_id: roof.id,
        content_id: film.id,
        watched_pct: 100,
        completed_at: new Date().toISOString(),
        source: "library",
      })
      .select("content_id")
      .single(),
    "colleague's completion"
  );

  /* C: watched to the end, never claimed — what record_watch_progress leaves. */
  must(
    await sb
      .from("content_progress")
      .insert({
        user_id: vC.id,
        rooftop_id: roof.id,
        content_id: film.id,
        watched_pct: 100,
        position_sec: 165,
        completed_at: null,
      })
      .select("content_id")
      .single(),
    "C's uncompleted row"
  );

  /* ---- B: through the real action -------------------------------------- */
  console.log("  B · completeLibraryItem over the page's own boundary");
  const called = await callCompleteLibraryItem(vB, pageUrl, film.id, 100);
  if (!called) {
    ok("completeLibraryItem was invoked as B", false, "no action id in the page's chunks returned a result");
  } else {
    ok(`completeLibraryItem invoked as B (action ${called.actionId.slice(0, 10)}…)`, true);
    console.log(`      → ${called.result}`);
  }
  const bRow = (
    await sb
      .from("content_progress")
      .select("watched_pct, completed_at, source, rooftop_id")
      .eq("user_id", vB.id)
      .eq("content_id", film.id)
      .maybeSingle()
  ).data as any;
  ok(
    "B's row was written by the action with completed_at and source='library'",
    Boolean(bRow?.completed_at) && bRow?.source === "library",
    bRow ? JSON.stringify(bRow) : "no row"
  );

  /* ---- Prove the premise from the live policy -------------------------- */
  /* A reading taken AS A, with no user filter — loadModuleItems' old query
     verbatim. If this does not return the colleague's row then the hazard is
     not present in this database and the screenshots below would be about
     nothing. */
  const asA = createClient(URL_, ANON, { auth: { persistSession: false } });
  await asA.auth.signInWithPassword({ email: vA.email, password: PASSWORD });
  const { data: unscoped } = await asA
    .from("content_progress")
    .select("content_id, watched_pct, completed_at, user_id")
    .in("content_id", [film.id]);
  const leaked = ((unscoped ?? []) as any[]).filter((r) => r.user_id !== vA.id);
  const leakedComplete = leaked.filter((r) => r.completed_at != null);
  console.log("\n  the premise, as A over PostgREST");
  /* AT LEAST ONE, NOT EXACTLY ONE. The first version asserted exactly one and
     went red at three — because B and C are advisors at the same rooftop too,
     so A reads their rows as well. The expectation was wrong and the premise
     was more strongly met than it claimed; "exactly one" was a fact about the
     fixture I had in mind, not about the rule. What matters is that a COMPLETED
     row belonging to somebody else is readable and that none of them is A's. */
  ok(
    `an unfiltered read as A returns ${(unscoped ?? []).length} row(s): ${leaked.length} somebody else's, ` +
      `${leakedComplete.length} of those completed, 0 of them A's`,
    leakedComplete.length >= 1 && leaked.length === (unscoped ?? []).length,
    "progress_team_read is expected to expose the rooftop's rows to a manager"
  );
  const { data: scoped } = await asA
    .from("content_progress")
    .select("content_id")
    .eq("user_id", vA.id)
    .in("content_id", [film.id]);
  ok("the same read WITH .eq(user_id) returns none for A", (scoped ?? []).length === 0);

  /* ---- Chrome ---------------------------------------------------------- */
  const port = 9341;
  chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=/tmp/${TAG}-chrome`,
      "--hide-scrollbars",
      "--no-first-run",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const cdp = await connect(await chromeTarget(port));

  const shots: Record<string, Shot> = {};
  console.log("\n  the three screens, read off the rendered page");
  for (const [label, viewer, file] of [
    ["A  colleague's completion, viewer has none", vA, `${PREFIX}-A-colleague-tick.png`],
    ["B  her own completion via completeLibraryItem", vB, `${PREFIX}-B-own-completion.png`],
    ["C  watched_pct 100, completed_at NULL", vC, `${PREFIX}-C-pct100-null.png`],
  ] as const) {
    const s = await shoot(cdp, viewer, pageUrl, file);
    shots[label[0]!] = s;
    console.log(`\n    ${label}`);
    ok(`landed on /library/m/<id> (not /onboarding)`, s.pathname === `/library/m/${mod.id}`, s.pathname);
    ok(`the film block rendered (not FilmMissingBlock)`, s.filmFound);
    console.log(`      header    "${s.header}"`);
    console.log(`      fraction  "${s.subtitle}"`);
    console.log(`      film says Done=${s.donePill}  Watched=${s.watchedWord}`);
    console.log(`      terminal  "${s.terminal}"`);
    console.log(`      png       reports/valerie/${s.file}`);
  }

  /* ---- What each screen owes ------------------------------------------- */
  console.log("\n  expectations");
  ok(
    'A: the header says "0 of 1 done" — the view names its user',
    shots.A!.subtitle === "0 of 1 done",
    shots.A!.subtitle
  );
  ok(
    "A: the film carries NO Done pill — a colleague's row is not hers",
    !shots.A!.donePill,
    "the pill is present, which is the 10 November defect"
  );
  ok(
    "A: the header and the film agree",
    shots.A!.subtitle === "0 of 1 done" && !shots.A!.donePill
  );
  ok('B: the header says "1 of 1 done"', shots.B!.subtitle === "1 of 1 done", shots.B!.subtitle);
  ok("B: the film carries the Done pill", shots.B!.donePill);
  ok(
    'C: the header says "0 of 1 done"',
    shots.C!.subtitle === "0 of 1 done",
    shots.C!.subtitle
  );
  ok(
    "C: the film carries NO Done pill — watched is not claimed",
    !shots.C!.donePill,
    "a 100% row with no completed_at must still be completable"
  );

  writeFileSync(
    path.join(OUT, `${PREFIX}-readings.json`),
    JSON.stringify({ tag: TAG, moduleId: mod.id, filmId: film.id, shots }, null, 2)
  );

  cdp.close();
  console.log(`\n  readings written to reports/valerie/${PREFIX}-readings.json`);
}

main()
  .then(() => {
    if (failed > 0) {
      console.log(`\n\x1b[31m  ${failed} expectation(s) failed\x1b[0m`);
      for (const f of failures) console.log(`    ${f}`);
      console.log("");
    } else {
      console.log("\n\x1b[32m  every expectation held\x1b[0m\n");
    }
    chrome?.kill();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("\n", e);
    chrome?.kill();
    process.exit(1);
  });
