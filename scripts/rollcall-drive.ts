/* ============================================================================
   EDIAGD — drive the real app as a real advisor and see the events land

   accept:rollcall proves the DATABASE: who may read, who may write, what the
   constraints refuse, what the loader reports. It writes its events with the
   service client, which means it proves nothing whatsoever about whether the
   APP ever writes one.

   That distinction is the whole reason this file exists. The open events are
   fired from a client component's mount effect, deliberately, because Next
   renders a route's server components on PREFETCH and /certifications is on
   the tab bar of every signed-in screen. A suite that inserted rows itself
   would be just as green if RecordOpen never mounted, if the server action
   rejected the kind, or if the component had been left off the page.

   So this signs a fixture advisor in, drives four real screens and a real
   lesson completion in a real browser, and then asks the database what it saw.

   ---------------------------------------------------------------------------
   WHAT IT CANNOT PROVE, SAID BEFORE THE RESULTS
   ---------------------------------------------------------------------------
   platform `ios`. nativePlatform() reads Capacitor.getPlatform(), which is
   only meaningful inside the shell, so a headless Chrome correctly reports
   `web` and that is what lands. The ios value needs a device: install the
   TestFlight build, sign in, and read the row. The server half of that path
   IS proved — accept:rollcall stores and reads back platform ios — so what is
   unproven is exactly three lines of bridge code and nothing else.

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES, AND IT NEEDS A DEV SERVER.
   ---------------------------------------------------------------------------
     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321 \
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon> \
     SUPABASE_SERVICE_ROLE_KEY=<local service> npm run dev

     SB_URL=http://127.0.0.1:55321 SB_KEY=<local service> \
     SB_ANON_KEY=<local anon> APP_URL=http://127.0.0.1:3000 \
     npm run verify:rollcall
   ============================================================================ */

import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;
const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!URL_ || !KEY || !ANON) {
  console.error("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL_) || !/127\.0\.0\.1|localhost/.test(APP)) {
  console.error("REFUSING to run against anything but local — this writes.");
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const TAG = `rc-drive-${randomUUID().slice(0, 6)}`;
const PASSWORD = "Fixture-passw0rd!";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`    ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

/* ---- Chrome over CDP. node 22 has a global WebSocket, so no package. ----- */
type Cdp = {
  send: (method: string, params?: unknown) => Promise<Record<string, unknown>>;
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
    const msg = JSON.parse(String(event.data)) as {
      id?: number;
      result?: Record<string, unknown>;
      error?: { message: string };
    };
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
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = (await res.json()) as {
        type: string;
        webSocketDebuggerUrl?: string;
      }[];
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl!;
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

let chrome: ChildProcess | null = null;
const madeUsers: string[] = [];

async function main() {
  /* ---- Fixtures --------------------------------------------------------- */
  const { data: org, error: orgErr } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  const { data: roof, error: roofErr } = await sb
    .from("rooftop")
    .insert({ name: `${TAG} Store`, org_id: org!.id, timezone: "America/Chicago" })
    .select("id")
    .single();
  if (roofErr) throw new Error(`rooftop: ${roofErr.message}`);
  const rooftopId = roof!.id as string;

  /* content RLS needs the rooftop to hold the product, or the advisor sees no
     content at all and every gating count reads 0 of 0. */
  const { error: prodErr } = await sb
    .from("rooftop_product")
    .insert({ rooftop_id: rooftopId, product: "advisor_base", status: "active" });
  if (prodErr) throw new Error(`rooftop_product: ${prodErr.message}`);

  const email = `${TAG}@example.com`;
  const { data: created, error: userErr } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userErr) throw new Error(`createUser: ${userErr.message}`);
  const userId = created.user!.id;
  madeUsers.push(userId);

  await sb.from("app_user").upsert({ id: userId, full_name: `${TAG} Advisor` });
  const { error: memErr } = await sb
    .from("membership")
    .insert({ user_id: userId, rooftop_id: rooftopId, role: "advisor", active: true });
  if (memErr) throw new Error(`membership: ${memErr.message}`);
  /* Without a work_schedule the (app) layout redirects every route to
     /onboarding, which looks exactly like a broken cookie. */
  const { error: wsErr } = await sb.from("work_schedule").insert({
    user_id: userId,
    works_mon: true,
    works_tue: true,
    works_wed: true,
    works_thu: true,
    works_fri: true,
    works_sun: false,
    saturday_mode: "none",
    schedule_set_at: new Date().toISOString(),
  });
  if (wsErr) throw new Error(`work_schedule: ${wsErr.message}`);

  /* A track, a course, a module and one published cue, so /certifications,
     /certifications/[slug] and /library/m/[id] all have something real. */
  const { data: cert, error: cErr } = await sb
    .from("certification")
    .insert({
      slug: `${TAG}-track`,
      name: `${TAG} Track`,
      kind: "craft",
      is_core: false,
      glyph_key: "craft_walk_around",
      sort: 901,
      active: true,
    })
    .select("id, slug")
    .single();
  if (cErr) throw new Error(`certification: ${cErr.message}`);

  const { data: course, error: coErr } = await sb
    .from("course")
    .insert({ track: "craft", name: `${TAG} Course`, slug: `${TAG}-course` })
    .select("id")
    .single();
  if (coErr) throw new Error(`course: ${coErr.message}`);
  await sb
    .from("certification_course")
    .insert({ certification_id: cert!.id, course_id: course!.id, sort: 1 });

  const { data: mod, error: mErr } = await sb
    .from("module")
    .insert({ course_id: course!.id, name: `${TAG} Module`, sort_order: 1 })
    .select("id")
    .single();
  if (mErr) throw new Error(`module: ${mErr.message}`);
  const moduleId = mod!.id as string;

  const { data: cue, error: cueErr } = await sb
    .from("content")
    .insert({
      title: `${TAG} Cue`,
      body: "A cue the deck can finish without a player.",
      type: "cue",
      status: "published",
      module_id: moduleId,
    })
    .select("id")
    .single();
  if (cueErr) throw new Error(`content: ${cueErr.message}`);

  /*
   * A FILM AS WELL, because a cue gates nothing since 0143 and
   * storyLessonsMet() refuses `gatingTotal === 0` on purpose — an empty set
   * would open the story on a track whose films have not been shot. With only
   * the cue above, the story page correctly redirected and the step proved
   * the gate rather than the event.
   *
   * The film is completed BY THE SERVICE ROLE, as fixture-building: finishing
   * a video through the real player needs a Mux asset, and what is under test
   * here is whether submitStory emits an event, not the watch gate — which
   * accept:loop and test:watched-rule already own.
   */
  const { data: film, error: filmErr } = await sb
    .from("content")
    .insert({
      title: `${TAG} Film`,
      type: "advisor_video",
      status: "published",
      module_id: moduleId,
      duration_sec: 60,
    })
    .select("id")
    .single();
  if (filmErr) throw new Error(`film: ${filmErr.message}`);

  /* ---- Sign in and build the cookie ------------------------------------ */
  const anonClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: signIn, error: siErr } = await anonClient.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (siErr) throw new Error(`signIn: ${siErr.message}`);
  const cookies = authCookies(signIn.session);

  /* ---- Chrome ---------------------------------------------------------- */
  const port = 9340;
  const profile = mkdtempSync(join(tmpdir(), "rc-drive-"));
  chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--hide-scrollbars",
    "--no-first-run",
    "about:blank",
  ]);

  const cdp = await connect(await chromeTarget(port));
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  /*
   * THE COOKIE GOES ON THE APP'S OWN HOST, AND THE HOST MATTERS MORE THAN IT
   * LOOKS. Driving http://127.0.0.1:3001 against a dev server that believes it
   * is localhost makes Next treat every /_next request as cross-origin and
   * block it — so the client bundle never hydrates, no mount effect runs, and
   * NOTHING is written. Four pages returned 200 and zero events landed, which
   * read exactly like the feature being broken.
   *
   * The cookie NAME is unaffected: @supabase/ssr derives it from the SUPABASE
   * url's first hostname label, which is 127 either way.
   */
  const appHost = new URL(APP).hostname;
  for (const c of cookies) {
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

  /**
   * Navigate, and only report success when the APP actually rendered there.
   *
   * THE PATH ALONE IS NOT EVIDENCE, and that cost a whole run. The dev server
   * had died; Chrome showed its connection-refused page; `location.pathname`
   * was still /certifications; four "renders" passed and every event assertion
   * failed, which read as the feature being broken rather than as nothing
   * having been visited. So this also requires a <main> — which every one of
   * these routes renders and no browser error page does.
   *
   * The retry is for the other hazard: a cold first navigate can land on
   * /onboarding even with a good cookie.
   */
  const visit = async (path: string) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await cdp.send("Page.navigate", { url: `${APP}${path}` });
      await new Promise((r) => setTimeout(r, 2500));
      const res = (await cdp.send("Runtime.evaluate", {
        expression: "location.pathname + '|' + (document.querySelector('main') ? 'main' : 'no-main')",
        returnByValue: true,
      })) as { result?: { value?: string } };
      if (res.result?.value === `${path}|main`) return true;
      if (attempt === 3) console.log(`      ${path} -> ${res.result?.value}`);
    }
    return false;
  };

  console.log("\nDriving the real app as a fixture advisor");

  ok("/certifications renders", await visit("/certifications"));
  ok(
    `/certifications/${cert!.slug} renders`,
    await visit(`/certifications/${cert!.slug}`)
  );
  ok("/library renders", await visit("/library"));
  ok(`/library/m/${moduleId} renders`, await visit(`/library/m/${moduleId}`));

  /* Finish the cue through the real deck: tap the card's Done control. The
     deck is a client component calling completeLibraryItem, which is the path
     that writes content_progress.source AND the lesson_completed event. */
  const finished = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const buttons = [...document.querySelectorAll('button')];
      const done = buttons.find(b => /got it|done|finish|complete|mark/i.test(b.textContent || ''));
      if (!done) return 'no-button:' + buttons.map(b => b.textContent).join('|').slice(0, 300);
      done.click();
      return 'clicked:' + done.textContent;
    })()`,
    returnByValue: true,
  })) as { result?: { value?: string } };
  console.log(`      deck control: ${finished.result?.value}`);
  await new Promise((r) => setTimeout(r, 3000));

  /*
   * ---- And a Good News Story, through the real form ---------------------
   *
   * accept:story proves the POLICY by inserting over PostgREST as the advisor;
   * it never calls submitStory(), so it cannot say whether the action emits an
   * event. This does: the real page, the real textarea, the real button.
   *
   * THE TEXTAREA IS CONTROLLED, so assigning .value does nothing React can
   * see — the native setter plus a bubbling `input` is what makes the
   * component's onChange fire, and without it the button stays disabled and
   * the whole step would pass as "clicked" having submitted an empty string.
   */
  /* The film, finished as fixture — see its insert above for why. */
  {
    const { error } = await sb.from("content_progress").insert({
      user_id: userId,
      rooftop_id: rooftopId,
      content_id: film!.id,
      watched_pct: 100,
      completed_at: new Date().toISOString(),
      source: "library",
    });
    if (error) throw new Error(`film progress fixture: ${error.message}`);
  }
  /* A module counts as complete when module_completion holds a row — that is
     what my_module_progress.completed_at is, and what the story gate reads.
     completeModuleIfReady writes it on the real path; written here because the
     film above was finished as fixture rather than through a player. */
  {
    const { error } = await sb.from("module_completion").upsert(
      {
        user_id: userId,
        module_id: moduleId,
        rooftop_id: rooftopId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,module_id" }
    );
    if (error) throw new Error(`module_completion fixture: ${error.message}`);
  }

  const storyPath = `/certifications/${cert!.slug}/story`;
  const storyRendered = await visit(storyPath);
  ok(`${storyPath} renders — the 0161 lesson gate is satisfied`, storyRendered);

  if (storyRendered) {
    const submitted = (await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const ta = document.getElementById('story');
        if (!ta) return 'no-textarea';
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, 'Opened the hood on every write-up this week and sold three belts.');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = [...document.querySelectorAll('button')]
          .find(b => /submit my story|save changes/i.test(b.textContent || ''));
        if (!btn) return 'no-button';
        if (btn.disabled) return 'button-disabled';
        btn.click();
        return 'submitted';
      })()`,
      returnByValue: true,
    })) as { result?: { value?: string } };
    console.log(`      story form: ${submitted.result?.value}`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  /* ---- What did the database see? -------------------------------------- */
  console.log("\nWhat the app actually wrote");

  const { data: events } = await sb
    .from("app_event")
    .select("kind, target_id, meta, at")
    .eq("user_id", userId)
    .order("at");
  const rows = (events ?? []) as {
    kind: string;
    target_id: string | null;
    meta: Record<string, unknown> | null;
  }[];
  const kinds = rows.map((r) => r.kind);
  console.log(`      ${rows.length} events: ${kinds.join(", ") || "(none)"}`);

  ok("signed_in was recorded by the layout's ping", kinds.includes("signed_in"));
  ok(
    "and it carries a platform — web here, because headless Chrome is not the shell",
    rows.find((r) => r.kind === "signed_in")?.meta?.platform === "web",
    `got ${JSON.stringify(rows.find((r) => r.kind === "signed_in")?.meta)}`
  );
  ok("certs_opened from the Certs page", kinds.includes("certs_opened"));
  ok(
    "track_opened from the track page, targeting the certification",
    rows.some((r) => r.kind === "track_opened" && r.target_id === cert!.id),
    `targets: ${JSON.stringify(rows.filter((r) => r.kind === "track_opened").map((r) => r.target_id))}`
  );
  ok("library_opened from the library landing", kinds.includes("library_opened"));
  ok(
    "lesson_opened from the module page, targeting the module",
    rows.some((r) => r.kind === "lesson_opened" && r.target_id === moduleId)
  );
  ok(
    "lesson_completed with source library, from the real deck",
    rows.some(
      (r) => r.kind === "lesson_completed" && r.meta?.source === "library"
    ),
    `completions: ${JSON.stringify(rows.filter((r) => r.kind === "lesson_completed").map((r) => r.meta))}`
  );

  ok(
    "story_submitted from the real form, targeting the certification",
    rows.some((r) => r.kind === "story_submitted" && r.target_id === cert!.id),
    `targets: ${JSON.stringify(rows.filter((r) => r.kind === "story_submitted").map((r) => r.target_id))}`
  );

  /* The column 0123 added and nothing ever wrote. This is the half that has
     no second record anywhere, so if it is null the fix did not land. */
  const { data: progress } = await sb
    .from("content_progress")
    .select("source, completed_at")
    .eq("user_id", userId)
    .eq("content_id", cue!.id)
    .maybeSingle();
  ok(
    "content_progress.source is 'library' — the column 0123 added and nothing had ever written",
    progress?.source === "library",
    `got ${JSON.stringify(progress)}`
  );

  /* ---- And no event was written by a PREFETCH -------------------------- */
  const certsOpens = kinds.filter((k) => k === "certs_opened").length;
  ok(
    `exactly one certs_opened for one visit, not one per prefetch (got ${certsOpens})`,
    certsOpens === 1,
    "the tab bar links /certifications from every screen — a server-render write would count each one"
  );

  cdp.close();

  /* ---- Cleanup --------------------------------------------------------- */
  await sb.from("app_event").delete().eq("user_id", userId);
  await sb.from("advisor_story").delete().eq("user_id", userId);
  await sb.from("content_progress").delete().eq("user_id", userId);
  await sb.from("sand_dollar_entry").delete().eq("user_id", userId);
  await sb.from("module_completion").delete().eq("user_id", userId);
  await sb.from("daily_activity").delete().eq("user_id", userId);
  await sb.from("work_schedule").delete().eq("user_id", userId);
  await sb.from("user_badge").delete().eq("user_id", userId);
  await sb.from("content").delete().in("id", [cue!.id, film!.id]);
  await sb.from("certification_course").delete().eq("certification_id", cert!.id);
  await sb.from("module").delete().eq("id", moduleId);
  await sb.from("course").delete().eq("id", course!.id);
  await sb.from("certification").delete().eq("id", cert!.id);
  await sb.from("membership").delete().eq("user_id", userId);
  await sb.from("app_user").delete().eq("id", userId);
  await sb.auth.admin.deleteUser(userId);
  await sb.from("rooftop_product").delete().eq("rooftop_id", rooftopId);
  await sb.from("rooftop").delete().eq("id", rooftopId);
  await sb.from("org").delete().eq("id", org!.id);
}

main()
  .then(() => {
    chrome?.kill();
    console.log("\n" + "=".repeat(64));
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed) {
      console.log("\nFailures:");
      for (const f of failures) console.log("  ✗ " + f);
    }
    console.log("=".repeat(64));
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    chrome?.kill();
    console.error("\nDRIVER ERROR:", e.message);
    process.exit(1);
  });
