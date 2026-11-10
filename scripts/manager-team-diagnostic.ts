/* ============================================================================
   EDIAGD — the four complaints of 10 November 2026, measured on production.

   READ ONLY. It issues no INSERT, UPDATE or DELETE and mints no auth user. The
   only write-shaped call it makes is `auth.admin.generateLink`, which the
   acceptance suites already use to borrow an existing account's session and
   which does not alter the row — and even that is optional (see BOTH VIEWERS).

     npm run diag:manager-team                # ids come from .env.local
     DIAG_USER_ID=<uuid> DIAG_ROOFTOP_ID=<uuid> npm run diag:manager-team

   ---------------------------------------------------------------------------
   BOTH VIEWERS, EVERY TIME — AND THE SERVICE-ROLE HALF IS NOT THE ANSWER
   ---------------------------------------------------------------------------
   AGENTS.md names this failure five times: a gate correct about who it excludes
   and wrong about who it therefore serves. `team_videos_completed` is scoped to
   `managed_rooftops()`, which reads `auth.uid()` — so a service-role call
   answers a DIFFERENT QUESTION from the one the Team screen asks, and answering
   the easy one is how "no videos completed today" became invisible.

   So every reading below is taken twice: once over PostgREST as the person
   whose screen is wrong, and once as the service role. The pair is the finding.
   A reading available only as service role is printed as UNKNOWN AS HER rather
   than as a result, because the two are not the same measurement.

   If the session cannot be established the script EXITS NON-ZERO. A diagnostic
   that quietly reports only the half it could reach is the confident wrong
   answer this file exists to avoid.

   ---------------------------------------------------------------------------
   IDS, NEVER NAMES
   ---------------------------------------------------------------------------
   The standing rule is ids only. A name may be supplied to FIND an id
   (DIAG_USER_NAME), and when one is, the lookup asserts it matched exactly one
   row and then carries the id. Two people sharing a name is the production
   defect this rule was written for.
============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(`${process.cwd()}/.env.local`, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnvFile(), ...process.env } as Record<string, string>;

const URL = env.SB_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SB_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.SB_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY || !ANON) {
  console.error("\n  need a Supabase URL, service role key and anon key\n");
  process.exit(1);
}

const service: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: false },
});

/* ---- output helpers ------------------------------------------------------ */

let unknownAsHer = 0;

const h = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${"─".repeat(s.length)}`);
const line = (s: string) => console.log(`  ${s}`);
const note = (s: string) => console.log(`  \x1b[2m${s}\x1b[0m`);
function unknown(what: string, why: string) {
  unknownAsHer += 1;
  console.log(`  \x1b[33mUNKNOWN AS HER\x1b[0m  ${what} — ${why}`);
}

/* ---- 0. who, and where -------------------------------------------------- */

async function resolveUserId(): Promise<string> {
  if (env.DIAG_USER_ID) return env.DIAG_USER_ID;

  const name = env.DIAG_USER_NAME;
  if (!name) {
    console.error("\n  set DIAG_USER_ID (preferred) or DIAG_USER_NAME\n");
    process.exit(1);
  }

  /* A NAME IS FOR PRINTING, NEVER FOR MATCHING. One row or nothing — the
     production defect this guards is membership.op_code_id pointing four
     accounts at other people's books. */
  const { data, error } = await service
    .from("app_user")
    .select("id, full_name")
    .ilike("full_name", name);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length !== 1) {
    console.error(
      `\n  REFUSING: "${name}" matched ${rows.length} rows in app_user. ` +
        `Supply DIAG_USER_ID.\n` +
        rows.map((r: any) => `    ${r.id}  ${r.full_name}`).join("\n") +
        "\n"
    );
    process.exit(1);
  }
  note(`resolved DIAG_USER_NAME to exactly one app_user row: ${rows[0].id}`);
  return rows[0].id as string;
}

async function resolveRooftopId(userId: string): Promise<string> {
  if (env.DIAG_ROOFTOP_ID) return env.DIAG_ROOFTOP_ID;
  const name = env.DIAG_ROOFTOP_NAME;
  if (name) {
    const { data, error } = await service
      .from("rooftop")
      .select("id, name")
      .ilike("name", `%${name}%`);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length !== 1) {
      console.error(
        `\n  REFUSING: rooftop "${name}" matched ${rows.length} rows. ` +
          `Supply DIAG_ROOFTOP_ID.\n`
      );
      process.exit(1);
    }
    return rows[0].id as string;
  }
  /* Fall back to the rooftop of the caller's manager membership, which is the
     screen she is actually looking at. */
  const { data } = await service
    .from("membership")
    .select("rooftop_id, role, active")
    .eq("user_id", userId)
    .eq("role", "manager")
    .eq("active", true);
  const rows = (data ?? []) as any[];
  if (rows.length !== 1) {
    console.error(
      `\n  REFUSING: ${rows.length} active manager memberships — supply DIAG_ROOFTOP_ID.\n`
    );
    process.exit(1);
  }
  return rows[0].rooftop_id as string;
}

/* ---- her session, over PostgREST --------------------------------------- */

/**
 * A real signed-in client for an EXISTING account, with no password and no
 * write. `generateLink` returns the verification token; verifying it mints a
 * session exactly as a magic-link login would, which is the same path the
 * acceptance suites use. If this fails, the script dies — see BOTH VIEWERS.
 */
async function sessionFor(userId: string): Promise<SupabaseClient> {
  const { data: got, error: getErr } = await service.auth.admin.getUserById(userId);
  if (getErr || !got?.user?.email) {
    console.error(
      `\n  cannot establish her session: ${getErr?.message ?? "the account has no email"}\n` +
        "  Every 'as her' reading would be missing and the service-role half\n" +
        "  answers a different question. Refusing to report half a diagnostic.\n"
    );
    process.exit(1);
  }
  const email = got.user.email;

  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    console.error(`\n  cannot mint her session: ${linkErr?.message ?? "no token"}\n`);
    process.exit(1);
  }

  const asHer = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await asHer.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (vErr) {
    console.error(`\n  cannot verify her session: ${vErr.message}\n`);
    process.exit(1);
  }
  const { data: who } = await asHer.auth.getUser();
  if (who?.user?.id !== userId) {
    console.error(
      `\n  REFUSING: the session is ${who?.user?.id ?? "nobody"}, not ${userId}.\n`
    );
    process.exit(1);
  }
  return asHer;
}

/* ---- the readings ------------------------------------------------------- */

async function main() {
  const userId = await resolveUserId();
  const rooftopId = await resolveRooftopId(userId);

  h("0 · the subject");
  line(`user_id    ${userId}`);
  line(`rooftop_id ${rooftopId}`);
  line(`supabase   ${URL}`);

  const asHer = await sessionFor(userId);
  note("session established over PostgREST — every reading below is taken twice");

  /* ---- 1. membership and managed_rooftops ------------------------------- */
  h("1 · membership, and whether managed_rooftops() as her includes this rooftop");

  const { data: rooftops } = await service.from("rooftop").select("id, name");
  const rooftopName = (id: string) =>
    ((rooftops ?? []) as any[]).find((r) => r.id === id)?.name ?? "(unknown)";

  const { data: memSvc } = await service
    .from("membership")
    .select("id, rooftop_id, role, active, op_code_id")
    .eq("user_id", userId);
  for (const m of (memSvc ?? []) as any[]) {
    line(
      `${m.active ? "active  " : "INACTIVE"} ${m.role.padEnd(9)} ${m.rooftop_id}  ` +
        `${rooftopName(m.rooftop_id)}${m.op_code_id ? `  op ${m.op_code_id}` : ""}`
    );
  }
  if ((memSvc ?? []).length === 0) line("(no membership rows)");

  const { data: mr, error: mrErr } = await asHer.rpc("managed_rooftops");
  if (mrErr) {
    unknown("managed_rooftops() as her", mrErr.message);
  } else {
    const ids = (mr ?? []) as string[];
    line("");
    line(`managed_rooftops() as her → ${ids.length} rooftop(s)`);
    for (const id of ids) line(`  ${id}  ${rooftopName(id)}`);
    line(
      ids.includes(rooftopId)
        ? `\x1b[32mINCLUDES\x1b[0m this rooftop — the RPC's scope check passes for her`
        : `\x1b[31mDOES NOT INCLUDE\x1b[0m this rooftop — every team read returns zero rows, silently`
    );
  }

  /* ---- 2. team_videos_completed, both viewers, two days ----------------- */
  h("2 · team_videos_completed(rooftop, day) — as her vs as service role");

  const { data: todayRow } = await service.rpc("rooftop_today", { _rooftop: rooftopId });
  const today = (todayRow as string) ?? new Date().toISOString().slice(0, 10);
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const days = [yesterday.toISOString().slice(0, 10), today];
  note(`rooftop_today(${rooftopId}) = ${today} — the STORE's day, not the server's`);

  for (const day of days) {
    for (const [who, client] of [
      ["as her        ", asHer],
      ["as service    ", service],
    ] as const) {
      const { data, error } = await client.rpc("team_videos_completed", {
        _rooftop: rooftopId,
        _day: day,
      });
      if (error) {
        if (client === asHer) unknown(`team_videos_completed(${day})`, error.message);
        else line(`${day}  ${who} ERROR ${error.message}`);
        continue;
      }
      const rows = (data ?? []) as any[];
      line(`${day}  ${who} ${rows.length} row(s)`);
      for (const r of rows) {
        line(
          `             ${JSON.stringify(r).slice(0, 160)}`
        );
      }
    }
    line("");
  }

  /* ---- 3. her completions, and which rooftop they were tagged to -------- */
  h("3 · her content_progress completions, last 3 days — WHICH rooftop_id");

  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 3);

  const { data: prog } = await service
    .from("content_progress")
    .select("content_id, rooftop_id, completed_at, watched_pct, source")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .gte("completed_at", since.toISOString())
    .order("completed_at", { ascending: true });

  const progRows = (prog ?? []) as any[];
  if (progRows.length === 0) {
    line("(no completions in the window)");
  } else {
    const { data: contents } = await service
      .from("content")
      .select("id, title, type, module_id, mux_playback_id")
      .in(
        "id",
        progRows.map((r) => r.content_id)
      );
    const byId = new Map(((contents ?? []) as any[]).map((c) => [c.id, c]));
    for (const r of progRows) {
      const c = byId.get(r.content_id);
      const mismatch = r.rooftop_id !== rooftopId;
      line(
        `${String(r.completed_at).slice(0, 19)}  ` +
          `${mismatch ? "\x1b[31m" : ""}${r.rooftop_id ?? "NULL"}\x1b[0m ` +
          `${mismatch ? `(${rooftopName(r.rooftop_id)} — NOT the screen's rooftop)` : "✓"}  ` +
          `${c?.type ?? "?"}${c?.mux_playback_id ? "/video" : "/not-a-video"}  ` +
          `${(c?.title ?? r.content_id).slice(0, 44)}  mod ${c?.module_id ?? "—"}`
      );
    }
    const wrong = progRows.filter((r) => r.rooftop_id !== rooftopId).length;
    line("");
    line(
      wrong === 0
        ? "all completions carry the screen's rooftop"
        : `\x1b[31m${wrong} of ${progRows.length}\x1b[0m completions carry another rooftop — ` +
            `team_videos_completed filters on cp.rooftop_id = _rooftop, so these are invisible`
    );
  }

  /* ---- 4. the two modules she named ------------------------------------- */
  h("4 · the named modules — my_module_progress AS HER, quiz bank, attempts");

  const moduleIds = (env.DIAG_MODULE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (moduleIds.length === 0) {
    note("DIAG_MODULE_IDS not set — listing every module she has touched instead");
  }

  /* As HER, because my_module_progress is auth.uid()-scoped: a service-role
     read of it is a different person's progress (nobody's). */
  const { data: mineRaw, error: mineErr } = await asHer
    .from("my_module_progress")
    .select(
      "module_id, module_name, course_name, total_items, completed_items, all_items, " +
        "cue_items, items_done, has_quiz, quiz_passed, completed_at"
    );
  if (mineErr) {
    unknown("my_module_progress as her", mineErr.message);
  } else {
    const mine = (mineRaw ?? []) as any[];
    const touched = progRows.length
      ? new Set(
          ((
            await service
              .from("content")
              .select("module_id")
              .in(
                "id",
                progRows.map((r) => r.content_id)
              )
          ).data ?? []) as any[]
        )
      : new Set<any>();
    const wanted = moduleIds.length
      ? mine.filter((m) => moduleIds.includes(m.module_id))
      : mine.filter(
          (m) =>
            m.completed_items > 0 ||
            [...touched].some((t: any) => t.module_id === m.module_id)
        );

    for (const m of wanted) {
      const { count: qCount } = await service
        .from("quiz_question")
        .select("id", { count: "exact", head: true })
        .eq("module_id", m.module_id)
        .eq("status", "published");
      const { data: attempts } = await service
        .from("quiz_attempt")
        .select("score_pct, passed, created_at")
        .eq("user_id", userId)
        .eq("module_id", m.module_id)
        .order("created_at", { ascending: false });
      const { data: comp } = await service
        .from("module_completion")
        .select("completed_at, rooftop_id")
        .eq("user_id", userId)
        .eq("module_id", m.module_id)
        .maybeSingle();

      line(`${m.module_name}  (${m.course_name})`);
      line(`  module_id        ${m.module_id}`);
      line(
        `  view AS HER      total_items=${m.total_items} completed_items=${m.completed_items} ` +
          `all_items=${m.all_items} cue_items=${m.cue_items}`
      );
      line(
        `                   items_done=${m.items_done} has_quiz=${m.has_quiz} ` +
          `quiz_passed=${m.quiz_passed} completed_at=${m.completed_at ?? "NULL"}`
      );
      line(`  published qs     ${qCount ?? 0}`);
      line(
        `  her attempts     ${(attempts ?? []).length === 0 ? "none" : (attempts as any[]).map((a) => `${a.score_pct}%${a.passed ? " PASS" : ""}`).join(", ")}`
      );
      line(`  module_completion ${comp ? String(comp.completed_at).slice(0, 19) : "NONE"}`);
      /* THE TWO DEFINITIONS, SIDE BY SIDE. The quiz ROUTE gates on items_done
         (gating types only, since 0160). The deck's terminal card gated on
         every completable item INCLUDING the cues. This line is the bug. */
      const deckWouldWait = m.completed_items < m.total_items || m.cue_items > 0;
      line(
        `  \x1b[1mquiz route says\x1b[0m ${m.items_done ? "OPEN" : "closed"}   ` +
          `\x1b[1mdeck said\x1b[0m ${m.items_done && !deckWouldWait ? "OPEN" : "closed (cues counted)"}`
      );
      line("");
    }
    if (wanted.length === 0) line("(no modules matched)");
  }

  /* ---- 5. the openers --------------------------------------------------- */
  h("5 · advisor_track_entry, and whether each entry film passes the loop's filters");

  const { data: certs } = await service
    .from("certification")
    .select("id, slug, name, is_core, sort, entry_film_content_id")
    .not("entry_film_content_id", "is", null)
    .order("sort", { ascending: true });

  const { data: entries } = await service
    .from("advisor_track_entry")
    .select("certification_id, entered_on, film_content_id")
    .eq("user_id", userId);
  const entered = new Map(
    ((entries ?? []) as any[]).map((e) => [e.certification_id, e])
  );

  if ((certs ?? []).length === 0) {
    line("(no certification carries an entry_film_content_id)");
  }
  for (const c of (certs ?? []) as any[]) {
    /* THE LOOP'S THREE FILTERS, verbatim from pickItem: published, not
       retired, has a playback id. loadTrackDetail checks only the first two,
       which is why the track page can show a card for a film the loop would
       never serve. */
    const { data: film } = await service
      .from("content")
      .select("id, title, status, retired_at, mux_playback_id")
      .eq("id", c.entry_film_content_id)
      .maybeSingle();
    const f = film as any;
    const ok =
      f && f.status === "published" && f.retired_at === null && f.mux_playback_id !== null;
    const e = entered.get(c.id);

    const { data: seen } = await service
      .from("content_progress")
      .select("completed_at, rooftop_id")
      .eq("user_id", userId)
      .eq("content_id", c.entry_film_content_id)
      .not("completed_at", "is", null)
      .maybeSingle();

    line(`${c.slug}${c.is_core ? " (core)" : ""}`);
    line(`  entry film       ${f?.title ?? "ROW MISSING"}  ${c.entry_film_content_id}`);
    line(
      `  loop's filters   published=${f?.status === "published"} ` +
        `retired=${f?.retired_at !== null} playback=${f?.mux_playback_id !== null} ` +
        `→ ${ok ? "\x1b[32mSERVABLE\x1b[0m" : "\x1b[31mNOT SERVABLE\x1b[0m"}`
    );
    line(`  advisor_track_entry ${e ? `${e.entered_on} film=${e.film_content_id ?? "NULL"}` : "NONE — she is 'entering'"}`);
    line(
      `  her completion   ${seen ? `${String((seen as any).completed_at).slice(0, 19)} rooftop=${(seen as any).rooftop_id}` : "none — the opener is unwatched"}`
    );
    line("");
  }

  /* ---- the close, computed from what happened -------------------------- */
  h("summary");
  line(`readings taken as her AND as service: all except ${unknownAsHer} marked UNKNOWN`);
  if (unknownAsHer > 0) {
    line(
      "\x1b[33mSome readings could not be taken as her.\x1b[0m A service-role value " +
        "answers a different question and is not a substitute."
    );
  }
  process.exitCode = unknownAsHer > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("\n", e);
  process.exit(1);
});
