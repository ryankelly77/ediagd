/* ============================================================================
   EDIAGD — "the deck said done and the header said 0 of 1", 10 November 2026

   READ ONLY against production. It issues no INSERT, UPDATE or DELETE. The one
   write-shaped call is `auth.admin.generateLink`, which borrows an existing
   account's session the way the acceptance suites and
   scripts/manager-team-diagnostic.ts already do, and which alters no row.

     npm run diag:menus-trace
     DIAG_USER_ID=<uuid> DIAG_MODULE_ID=<uuid> npm run diag:menus-trace

   ---------------------------------------------------------------------------
   BOTH VIEWERS, BECAUSE THE TWO READINGS ARE THE WHOLE QUESTION
   ---------------------------------------------------------------------------
   The complaint is that two surfaces disagreed on one screen. The deck's "done"
   comes from a server action running as the SERVICE ROLE; the header's
   "0 of 1 done" comes from `my_module_progress`, which is
   `security_invoker = on` and therefore runs as HER, through RLS on
   `content_progress` and on `content`.

   So a row the service role can see and she cannot would produce exactly the
   screen she reported, and a service-role-only reading of `content_progress`
   would answer the wrong question and look fine. Every row-level reading below
   is therefore taken TWICE — once as her over PostgREST, once as the service
   role — and the PAIR is the finding. A reading available only as the service
   role prints as UNKNOWN AS HER rather than as a result, and the script exits
   non-zero if any does.

   ---------------------------------------------------------------------------
   IDS, NEVER NAMES
   ---------------------------------------------------------------------------
   A name may be supplied to FIND an id; when one is, the lookup asserts it
   matched exactly one row and then carries the id. Two people sharing a name is
   the production defect that rule was written for.

   ---------------------------------------------------------------------------
   THE DAY IS THE STORE'S DAY
   ---------------------------------------------------------------------------
   "Today" for the event and ledger windows is `rooftop_today(rooftop)` —
   midnight in the rooftop's own timezone, not the server's and not UTC. The
   complaint is timed "around 3pm Central"; a UTC window would have put that in
   a different day for part of the year and silently dropped the afternoon.
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
const line = (s = "") => console.log(s ? `  ${s}` : "");
const note = (s: string) => console.log(`  \x1b[2m${s}\x1b[0m`);
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
function unknown(what: string, why: string) {
  unknownAsHer += 1;
  console.log(`  \x1b[33mUNKNOWN AS HER\x1b[0m  ${what} — ${why}`);
}

/* ---- the subject -------------------------------------------------------- */

async function resolveUserId(): Promise<string> {
  if (env.DIAG_USER_ID) return env.DIAG_USER_ID;
  const name = env.DIAG_USER_NAME;
  if (!name) {
    console.error("\n  set DIAG_USER_ID (preferred) or DIAG_USER_NAME\n");
    process.exit(1);
  }
  const { data, error } = await service
    .from("app_user")
    .select("id, full_name")
    .ilike("full_name", name);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length !== 1) {
    console.error(
      `\n  REFUSING: "${name}" matched ${rows.length} rows in app_user. Supply DIAG_USER_ID.\n` +
        rows.map((r) => `    ${r.id}  ${r.full_name}`).join("\n") +
        "\n"
    );
    process.exit(1);
  }
  note(`resolved DIAG_USER_NAME to exactly one app_user row: ${rows[0].id}`);
  return rows[0].id as string;
}

/**
 * Menus module 1.
 *
 * DIAG_MODULE_ID wins. Otherwise the module is found by course slug/name and
 * `sort_order`, and the lookup REFUSES on anything but exactly one row — "the
 * first Menus module" is a description, and a description that matches two
 * things is not an identifier.
 */
async function resolveModuleId(): Promise<string> {
  if (env.DIAG_MODULE_ID) return env.DIAG_MODULE_ID;

  const courseNeedle = env.DIAG_COURSE ?? "menu";
  const { data: courses, error: cErr } = await service
    .from("course")
    .select("id, name, slug, track")
    .or(`name.ilike.%${courseNeedle}%,slug.ilike.%${courseNeedle}%`);
  if (cErr) throw cErr;
  const cRows = (courses ?? []) as any[];
  if (cRows.length !== 1) {
    console.error(
      `\n  REFUSING: course "${courseNeedle}" matched ${cRows.length} rows. ` +
        `Supply DIAG_MODULE_ID.\n` +
        cRows.map((r) => `    ${r.id}  ${r.track} / ${r.name} (${r.slug})`).join("\n") +
        "\n"
    );
    process.exit(1);
  }
  note(`course "${cRows[0].name}" (${cRows[0].slug}) → ${cRows[0].id}`);

  const { data: mods, error: mErr } = await service
    .from("module")
    .select("id, name, sort_order")
    .eq("course_id", cRows[0].id)
    .order("sort_order", { ascending: true });
  if (mErr) throw mErr;
  const mRows = (mods ?? []) as any[];
  if (mRows.length === 0) {
    console.error(`\n  REFUSING: course ${cRows[0].id} has no modules.\n`);
    process.exit(1);
  }
  const first = mRows[0];
  note(
    `module 1 of ${mRows.length} by sort_order: "${first.name}" ` +
      `(sort_order ${first.sort_order}) → ${first.id}`
  );
  return first.id as string;
}

/* ---- her session, over PostgREST ---------------------------------------- */

async function sessionFor(userId: string): Promise<SupabaseClient> {
  const { data: got, error: getErr } = await service.auth.admin.getUserById(userId);
  if (getErr || !got?.user?.email) {
    console.error(
      `\n  cannot establish her session: ${getErr?.message ?? "the account has no email"}\n` +
        "  Every 'as her' reading would be missing, and the service-role half\n" +
        "  answers a different question. Refusing to report half a diagnostic.\n"
    );
    process.exit(1);
  }
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: got.user.email,
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
    console.error(`\n  REFUSING: the session is ${who?.user?.id ?? "nobody"}, not ${userId}.\n`);
    process.exit(1);
  }
  return asHer;
}

/* ---- the server's own watched bar, not a second copy of it -------------- */
/*
 * COPIED VALUES, NAMED AS SUCH. lib/watch-coverage.ts is the definition;
 * importing it here would drag "server-only" into a plain tsc build. The three
 * constants are asserted against the library file by `npm run check:gating`'s
 * sibling test in this branch, and they are printed below with their source so
 * a drift is visible rather than assumed.
 */
const WATCHED_PCT = 95;
const GATE_TAIL_SEC = 2;
const SERVER_GATE_SLACK_SEC = 1;

function serverGateThreshold(durationSec: number | null | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return WATCHED_PCT;
  const tail = GATE_TAIL_SEC + SERVER_GATE_SLACK_SEC;
  return Math.max(WATCHED_PCT, Math.min(99.5, ((durationSec - tail) / durationSec) * 100));
}
function gateThreshold(durationSec: number | null | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return WATCHED_PCT;
  return Math.max(
    WATCHED_PCT,
    Math.min(99.5, ((durationSec - GATE_TAIL_SEC) / durationSec) * 100)
  );
}
const isWatched = (pct: number, bar: number) => Math.round(pct * 100) / 100 >= bar;

/** lib/rooftop-choice.ts, verbatim in behaviour — advisor, then manager, then
    technician, then the id-sorted first. Reproduced so the script can say which
    rooftop the action WOULD stamp without calling the action. */
function chooseRooftop(ms: readonly { rooftop_id: string; role: string }[]): string | null {
  if (ms.length === 0) return null;
  const ordered = [...ms].sort((a, b) => a.rooftop_id.localeCompare(b.rooftop_id));
  return (
    ordered.find((m) => m.role === "advisor")?.rooftop_id ??
    ordered.find((m) => m.role === "manager")?.rooftop_id ??
    ordered.find((m) => m.role === "technician")?.rooftop_id ??
    ordered[0].rooftop_id
  );
}

/** record_watch_progress's rooftop, which is NOT chooseRooftop's — 0057 takes
    the oldest active membership by created_at. Printed so the two can be
    compared, because a disagreement puts two rows' worth of rooftop on one
    person's progress. */
function oldestActiveRooftop(
  ms: readonly { rooftop_id: string; role: string; created_at: string }[]
): string | null {
  if (ms.length === 0) return null;
  return [...ms].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
    .rooftop_id;
}

/* ========================================================================= */

async function main() {
  const userId = await resolveUserId();
  const moduleId = await resolveModuleId();

  h("0 · the subject");
  line(`supabase    ${URL}`);
  line(`user_id     ${userId}`);
  line(`module_id   ${moduleId}`);

  const asHer = await sessionFor(userId);
  note("session established over PostgREST — every row reading below is taken twice");

  /* ---- rooftops and the day -------------------------------------------- */
  const { data: rooftops } = await service.from("rooftop").select("id, name, timezone");
  const rooftopName = (id: string | null) =>
    ((rooftops ?? []) as any[]).find((r) => r.id === id)?.name ?? "(unknown)";
  const rooftopTz = (id: string | null) =>
    ((rooftops ?? []) as any[]).find((r) => r.id === id)?.timezone ?? "UTC";

  const { data: memRows } = await service
    .from("membership")
    .select("id, rooftop_id, role, active, op_code_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const mems = (memRows ?? []) as any[];
  const activeMems = mems.filter((m) => m.active);

  line();
  for (const m of mems) {
    line(
      `${m.active ? "active  " : "INACTIVE"} ${String(m.role).padEnd(10)} ` +
        `${m.rooftop_id}  ${rooftopName(m.rooftop_id)}  ` +
        `created ${String(m.created_at).slice(0, 10)}` +
        `${m.op_code_id ? `  op ${m.op_code_id}` : ""}`
    );
  }
  if (mems.length === 0) line("(no membership rows)");

  const chosen = chooseRooftop(activeMems);
  const oldest = oldestActiveRooftop(activeMems);
  line();
  line(`chooseRooftop()        → ${chosen} ${rooftopName(chosen)}   (completeLibraryItem)`);
  line(`oldest active by date  → ${oldest} ${rooftopName(oldest)}   (record_watch_progress, 0057)`);
  line(
    chosen === oldest
      ? green("the two writers agree on the rooftop")
      : red("THE TWO WRITERS DISAGREE — the playing row and the completing row differ")
  );

  const dayRooftop = env.DIAG_ROOFTOP_ID ?? chosen ?? null;
  const { data: todayRaw } = await service.rpc("rooftop_today", { _rooftop: dayRooftop });
  const today = (todayRaw as string) ?? new Date().toISOString().slice(0, 10);
  const tz = rooftopTz(dayRooftop);
  line();
  line(`rooftop_today(${rooftopName(dayRooftop)}) = ${today}   tz ${tz}`);

  /* The store-day window, in UTC instants, derived from the zone rather than
     assumed to be a fixed offset. */
  const offsetAt = (iso: string) => {
    const d = new Date(iso);
    const asTz = new Date(d.toLocaleString("en-US", { timeZone: tz }));
    const asUtc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
    return asUtc.getTime() - asTz.getTime();
  };
  const probe = `${today}T12:00:00Z`;
  const off = offsetAt(probe);
  const dayStart = new Date(new Date(`${today}T00:00:00Z`).getTime() + off);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  note(`store day window: ${dayStart.toISOString()} → ${dayEnd.toISOString()}`);
  const inTz = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-US", {
          timeZone: tz,
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "NULL";

  /* ======================================================================= */
  h("1a · the module's content rows — as service AND as her");

  const COLS =
    "id, title, type, status, retired_at, duration_sec, mux_playback_id, " +
    "module_id, module_order, service_family, placement, created_at";

  const { data: svcContent, error: svcCErr } = await service
    .from("content")
    .select(COLS)
    .eq("module_id", moduleId)
    .order("module_order", { ascending: true });
  if (svcCErr) throw svcCErr;
  const contentSvc = (svcContent ?? []) as any[];

  const { data: herContent, error: herCErr } = await asHer
    .from("content")
    .select(COLS)
    .eq("module_id", moduleId)
    .order("module_order", { ascending: true });
  if (herCErr) unknown("content for this module as her", herCErr.message);
  const contentHer = (herContent ?? []) as any[];
  const herIds = new Set(contentHer.map((c) => c.id));

  /* What actually gates, read from the database rather than mirrored. */
  let gating: string[] = [];
  const { data: gt, error: gtErr } = await service.rpc("gating_content_types");
  if (gtErr) {
    note(`gating_content_types() not callable over PostgREST (${gtErr.message}) — ` +
      `falling back to the 0143 literal`);
    gating = ["advisor_video"];
  } else {
    gating = (gt ?? []) as string[];
  }
  line(`gating_content_types() = [${gating.join(", ")}]`);
  line();

  for (const c of contentSvc) {
    const gates = gating.includes(c.type);
    line(
      `${bold(String(c.title ?? "").slice(0, 46).padEnd(46))} ${c.id}`
    );
    line(
      `  type=${c.type}${gates ? green(" GATES") : " (does not gate)"}  ` +
        `status=${c.status}  retired_at=${c.retired_at ?? "NULL"}`
    );
    line(
      `  duration_sec=${c.duration_sec ?? "NULL"}  ` +
        `mux_playback_id=${c.mux_playback_id ?? red("NULL")}  ` +
        `module_order=${c.module_order ?? "NULL"}  placement=${c.placement ?? "NULL"}  ` +
        `family=${c.service_family ?? "NULL"}`
    );
    if (c.duration_sec) {
      line(
        `  player's bar gateThreshold=${gateThreshold(c.duration_sec).toFixed(4)}%  ` +
          `server's bar serverGateThreshold=${serverGateThreshold(c.duration_sec).toFixed(4)}%`
      );
    }
    line(
      `  readable as her: ${herIds.has(c.id) ? green("yes") : red("NO — RLS hides it from her")}`
    );
    line();
  }
  if (contentSvc.length === 0) line("(the module has no content rows at all)");

  line(
    `as service ${contentSvc.length} row(s); as her ${contentHer.length} row(s)` +
      (contentSvc.length === contentHer.length
        ? ""
        : red("  ← the two populations differ, which is a finding on its own"))
  );

  const film = contentSvc.find((c) => gating.includes(c.type)) ?? null;
  /* The cues are not split out separately: the progress read below asks about
     EVERY content row of the module, gating or not, so a cue's row appears in
     the same list and is labelled there. Counting them here as well would be a
     second population to keep in step with the first. */

  /* ======================================================================= */
  h("1b · every content_progress row for these items — as service AND as her");

  const ids = contentSvc.map((c) => c.id);
  const PCOLS =
    "id, user_id, content_id, rooftop_id, watched_pct, position_sec, completed_at, " +
    "source, created_at, updated_at";

  async function progressRows(client: SupabaseClient, label: string) {
    if (ids.length === 0) return [] as any[];
    const { data, error } = await client
      .from("content_progress")
      .select(PCOLS)
      .eq("user_id", userId)
      .in("content_id", ids)
      .order("created_at", { ascending: true });
    if (error) {
      if (client === asHer) unknown(`content_progress as her (${label})`, error.message);
      else line(red(`service read failed: ${error.message}`));
      return [] as any[];
    }
    return (data ?? []) as any[];
  }

  const progSvc = await progressRows(service, "module items");
  const progHer = await progressRows(asHer, "module items");
  const herProgIds = new Set(progHer.map((r) => r.id));

  const titleOf = (cid: string) =>
    contentSvc.find((c) => c.id === cid)?.title ?? cid;

  function printProgress(rows: any[], who: string) {
    line(bold(`${who} — ${rows.length} row(s)`));
    if (rows.length === 0) {
      line(`  ${red("NONE")} — no content_progress row of any kind for these items`);
      return;
    }
    for (const r of rows) {
      const isFilm = film && r.content_id === film.id;
      line(`  ${isFilm ? "FILM " : "cue  "}${String(titleOf(r.content_id)).slice(0, 40)}`);
      line(`    id            ${r.id}`);
      line(
        `    watched_pct   ${r.watched_pct ?? "NULL"}` +
          (isFilm && film?.duration_sec
            ? `   server bar ${serverGateThreshold(film.duration_sec).toFixed(4)}% → ` +
              (isWatched(Number(r.watched_pct ?? 0), serverGateThreshold(film.duration_sec))
                ? green("clears it")
                : red("short of it"))
            : "")
      );
      line(`    position_sec  ${r.position_sec ?? "NULL"}`);
      line(
        `    completed_at  ${
          r.completed_at ? green(`${r.completed_at}  (${inTz(r.completed_at)} ${tz})`) : red("NULL")
        }`
      );
      line(`    source        ${r.source ?? red("NULL")}`);
      line(
        `    rooftop_id    ${r.rooftop_id ?? "NULL"}  ${rooftopName(r.rooftop_id)}` +
          (chosen && r.rooftop_id !== chosen ? red("  ← not chooseRooftop()'s rooftop") : "")
      );
      line(`    created_at    ${r.created_at}  (${inTz(r.created_at)} ${tz})`);
      line(`    updated_at    ${r.updated_at ?? "NULL"}  (${inTz(r.updated_at)} ${tz})`);
      if (who.startsWith("as service")) {
        line(
          `    visible to her: ${
            herProgIds.has(r.id) ? green("yes") : red("NO — she cannot read her own row")
          }`
        );
      }
      line();
    }
  }

  printProgress(progSvc, "as service role");
  printProgress(progHer, "as her (PostgREST, RLS applied)");

  /* ---------------------------------------------------------------------
     THE DECISIVE READING: loadModuleItems' query verbatim, AS HER.

     The two above both name her, so neither can show the defect. The deck's
     query did NOT name her — it was keyed on content_id alone and leaned on
     RLS to scope itself. `progress_team_read` is self OR managed_rooftops(),
     so for a manager it scopes to the ROOFTOP. This is what the page actually
     ran.
     --------------------------------------------------------------------- */
  h("1b-ii · the deck's own query, unfiltered, as her — what the page really read");
  if (ids.length === 0) {
    line("(no content ids to ask about)");
  } else {
    const { data: deckRaw, error: deckErr } = await asHer
      .from("content_progress")
      .select("content_id, watched_pct, position_sec, completed_at, user_id, rooftop_id")
      .in("content_id", ids);
    if (deckErr) {
      unknown("the deck's unfiltered read as her", deckErr.message);
    } else {
      const deckRows = (deckRaw ?? []) as any[];
      const notHers = deckRows.filter((r) => r.user_id !== userId);
      line(`${deckRows.length} row(s) came back; ${notHers.length} belong to somebody else`);
      line("");
      for (const r of deckRows) {
        const mine = r.user_id === userId;
        line(
          `${mine ? green("hers    ") : red("NOT HERS")} ${r.user_id}  ` +
            `${String(titleOf(r.content_id)).slice(0, 34).padEnd(36)} ` +
            `pct=${r.watched_pct} pos=${r.position_sec ?? "NULL"} ` +
            `completed_at=${r.completed_at ? String(r.completed_at).slice(0, 19) : "NULL"}`
        );
      }
      line("");
      /* The Map in loadModuleItems is keyed on content_id, so the LAST row for
         a film wins — and the query has no ORDER BY, so which that is, is not
         decided by anything. Printed because a coin is not a choice. */
      const byContent = new Map<string, any[]>();
      for (const r of deckRows) {
        if (!byContent.has(r.content_id)) byContent.set(r.content_id, []);
        byContent.get(r.content_id)!.push(r);
      }
      for (const [cid, rs] of byContent) {
        if (rs.length > 1)
          line(
            red(
              `${rs.length} rows for ${String(titleOf(cid)).slice(0, 30)} — the Map keeps the ` +
                `last and the query has no ORDER BY, so whose is not decided`
            )
          );
      }
      const wouldTick = deckRows.some((r) => r.completed_at != null);
      const hersTick = deckRows.some((r) => r.user_id === userId && r.completed_at != null);
      line(
        `the deck would render the film ${wouldTick ? bold("DONE") : "not done"}; ` +
          `her own rows say ${hersTick ? "done" : bold("not done")}`
      );
      if (wouldTick && !hersTick) {
        line(
          red(
            "THE TICK IS SOMEBODY ELSE'S. And CueDeck seeds `done` from it, so " +
              "markDone's `if (pending || done.has(id)) return` means she cannot " +
              "complete this film at all."
          )
        );
      }
    }
  }

  /* ======================================================================= */
  h("1c · my_module_progress for this module, evaluated AS HER");

  const MCOLS =
    "module_id, module_name, course_name, total_items, completed_items, all_items, " +
    "cue_items, items_done, has_quiz, quiz_passed, completed_at, last_activity";

  const { data: mineRaw, error: mineErr } = await asHer
    .from("my_module_progress")
    .select(MCOLS)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (mineErr) {
    unknown("my_module_progress as her", mineErr.message);
  } else if (!mineRaw) {
    line(red("the view returns NO ROW for this module as her"));
  } else {
    const m = mineRaw as any;
    line(`${m.module_name}  (${m.course_name})`);
    line(`  total_items      ${m.total_items}`);
    line(`  completed_items  ${m.completed_items}`);
    line(`  all_items        ${m.all_items}      cue_items ${m.cue_items}`);
    line(`  items_done       ${m.items_done}`);
    line(`  has_quiz         ${m.has_quiz}       quiz_passed ${m.quiz_passed}`);
    line(`  completed_at     ${m.completed_at ?? "NULL"}`);
    line(`  last_activity    ${m.last_activity ?? "NULL"}`);
    line();
    /* THE HEADER, COMPUTED THE WAY THE PAGE COMPUTES IT. app/(app)/library/m/
       [module]/page.tsx: "Quiz waiting" when itemsDone && hasQuiz &&
       !quizPassed, else lessonCount(mod). */
    const header =
      m.items_done && m.has_quiz && !m.quiz_passed
        ? "Quiz waiting"
        : `${m.completed_items} of ${m.total_items} done`;
    line(`  ${bold("the header this produces")}  →  "${header}"`);
  }

  /* The same view as the SERVICE ROLE, which is a different question and is
     printed only to show how different — auth.uid() is null there, so every
     per-user column collapses. Never as a substitute for the reading above. */
  const { data: svcView } = await service
    .from("my_module_progress")
    .select(MCOLS)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (svcView) {
    const s = svcView as any;
    note(
      `as service role the same view says total_items=${s.total_items} ` +
        `completed_items=${s.completed_items} items_done=${s.items_done} ` +
        `— auth.uid() is null, so this is nobody's progress and is not evidence`
    );
  }

  /* ======================================================================= */
  h("1d · module_completion for this module");

  const { data: mcSvc } = await service
    .from("module_completion")
    .select("*")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .maybeSingle();
  const { data: mcHer, error: mcHerErr } = await asHer
    .from("module_completion")
    .select("*")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (mcHerErr) unknown("module_completion as her", mcHerErr.message);

  line(
    `as service   ${
      mcSvc ? JSON.stringify(mcSvc) : red("NONE — the module is not recorded as finished")
    }`
  );
  line(`as her       ${mcHer ? JSON.stringify(mcHer) : "NONE"}`);

  /* ======================================================================= */
  h(`2 · every app_event for her on ${today} (${tz}), in order`);

  const { data: evRaw, error: evErr } = await service
    .from("app_event")
    .select("id, kind, target_id, rooftop_id, meta, at")
    .eq("user_id", userId)
    .gte("at", dayStart.toISOString())
    .lt("at", dayEnd.toISOString())
    .order("at", { ascending: true });
  if (evErr) throw evErr;
  const events = (evRaw ?? []) as any[];

  for (const e of events) {
    const isThisModule = e.target_id === moduleId;
    line(
      `${inTz(e.at).slice(-8)}  ${String(e.kind).padEnd(17)} ` +
        `${e.target_id ?? "—".padEnd(36)}` +
        `${isThisModule ? green("  ← this module") : ""}`
    );
    if (e.meta) line(`           meta ${JSON.stringify(e.meta)}`);
  }
  if (events.length === 0) line("(no events today)");

  const opens = events.filter((e) => e.kind === "lesson_opened" && e.target_id === moduleId);
  const completes = events.filter(
    (e) => e.kind === "lesson_completed" && e.target_id === moduleId
  );
  line();
  line(`lesson_opened    for this module today: ${opens.length}`);
  line(
    `lesson_completed for this module today: ${
      completes.length === 0 ? red("0") : green(String(completes.length))
    }`
  );
  note(
    "lesson_completed is written by completeLibraryItem AFTER every rollback-able " +
      "step. Its absence means the action did not reach the end of the happy path; " +
      "its presence means a row was claimed and paid."
  );

  /* The same two kinds across all time, so "today" is not mistaken for ever. */
  const { data: allTime } = await service
    .from("app_event")
    .select("kind, target_id, meta, at")
    .eq("user_id", userId)
    .eq("target_id", moduleId)
    .order("at", { ascending: true });
  const at = (allTime ?? []) as any[];
  line();
  line(
    `all time for this module: ${at.filter((e) => e.kind === "lesson_opened").length} opened, ` +
      `${at.filter((e) => e.kind === "lesson_completed").length} completed` +
      (at.length ? `  (first ${inTz(at[0].at)}, last ${inTz(at[at.length - 1].at)})` : "")
  );

  /* ======================================================================= */
  h(`3 · her Sand Dollar ledger on ${today} (${tz})`);

  const { data: sdRaw, error: sdErr } = await service
    .from("sand_dollar_entry")
    .select("id, amount, reason, ref_id, note, created_at")
    .eq("user_id", userId)
    .gte("created_at", dayStart.toISOString())
    .lt("created_at", dayEnd.toISOString())
    .order("created_at", { ascending: true });
  if (sdErr) throw sdErr;
  const sd = (sdRaw ?? []) as any[];
  for (const r of sd) {
    const matches = progSvc.some((p) => p.id === r.ref_id);
    line(
      `${inTz(r.created_at).slice(-8)}  ${String(r.amount).padStart(4)}  ` +
        `${String(r.reason).padEnd(16)} ref ${r.ref_id ?? "—"}` +
        `${matches ? green("  ← a progress row for this module") : ""}`
    );
    if (r.note) line(`           ${r.note}`);
  }
  if (sd.length === 0) line("(no ledger rows today)");
  const lessonPaid = sd.filter((r) => r.reason === "lesson_complete");
  line();
  line(
    `lesson_complete entries today: ${lessonPaid.length}` +
      (lessonPaid.length ? ` totalling ${lessonPaid.reduce((s, r) => s + Number(r.amount ?? 0), 0)}` : "")
  );
  const { data: gs } = await service
    .from("game_settings")
    .select("sand_lesson, sand_lesson_daily_cap, sand_module")
    .limit(1)
    .maybeSingle();
  if (gs) {
    const g = gs as any;
    /* THE CAP IS COUNTED FROM UTC MIDNIGHT BY THE ACTION, not the store day —
       see the note in the report. Printed both ways so the difference shows. */
    const utcStart = new Date();
    utcStart.setUTCHours(0, 0, 0, 0);
    const { data: utcRows } = await service
      .from("sand_dollar_entry")
      .select("amount")
      .eq("user_id", userId)
      .eq("reason", "lesson_complete")
      .gte("created_at", utcStart.toISOString());
    const earnedUtc = ((utcRows ?? []) as any[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    line(
      `sand_lesson=${g.sand_lesson} cap=${g.sand_lesson_daily_cap} ` +
        `sand_module=${g.sand_module}`
    );
    line(
      `earned since UTC midnight (the window the action counts) = ${earnedUtc}  → ` +
        (earnedUtc + Number(g.sand_lesson ?? 1) > Number(g.sand_lesson_daily_cap ?? 30)
          ? red("CAPPED: a completion today records but pays nothing")
          : green("not capped"))
    );
  }

  /* ======================================================================= */
  h("4 · could she have recorded progress at all? the write paths, as her");

  /* content_is_readable, evaluated AS HER — the third condition on both the
     insert and the update policy since 0118. If this is false,
     record_watch_progress raises and NOTHING is written while the film plays. */
  if (film) {
    const { data: readable, error: rErr } = await asHer.rpc("content_is_readable", {
      _content_id: film.id,
    });
    if (rErr) unknown("content_is_readable(film) as her", rErr.message);
    else
      line(
        `content_is_readable(film) as her = ${
          readable ? green("true") : red("false — every progress write is refused by RLS")
        }`
      );
  }

  /* Does she have an active membership at the rooftop each write path would
     stamp? Both policies require one for content_progress.rooftop_id. */
  for (const [label, rid] of [
    ["chooseRooftop (completeLibraryItem)", chosen],
    ["oldest active (record_watch_progress)", oldest],
  ] as const) {
    const has = activeMems.some((m) => m.rooftop_id === rid);
    line(
      `${label.padEnd(40)} ${rid} ${rooftopName(rid)} → ` +
        (has ? green("active membership exists") : red("NO active membership: insert refused"))
    );
  }

  /* The film's playability. A film with no renditions renders FilmMissingBlock
     in the deck, which has no player and no onComplete — so neither a progress
     ping nor a completion is reachable from the page at all. */
  if (film) {
    line();
    line(
      `film playback: mux_playback_id=${film.mux_playback_id ?? red("NULL")} → ` +
        (film.mux_playback_id
          ? green("the deck renders a real player")
          : red("the deck renders FilmMissingBlock — no player, no markDone"))
    );
  }

  /* ======================================================================= */
  h("5 · the two readings, side by side");

  const headerSays = (() => {
    const m = mineRaw as any;
    if (!m) return "(no view row)";
    return m.items_done && m.has_quiz && !m.quiz_passed
      ? "Quiz waiting"
      : `${m.completed_items} of ${m.total_items} done`;
  })();

  const filmProgSvc = film ? progSvc.find((p) => p.content_id === film.id) ?? null : null;
  const filmProgHer = film ? progHer.find((p) => p.content_id === film.id) ?? null : null;

  line(`the header (my_module_progress as her)   "${headerSays}"`);
  line(
    `the film's row as service                 ${
      filmProgSvc
        ? `watched_pct=${filmProgSvc.watched_pct} completed_at=${filmProgSvc.completed_at ?? "NULL"} source=${filmProgSvc.source ?? "NULL"}`
        : red("no row")
    }`
  );
  line(
    `the film's row as her                     ${
      filmProgHer
        ? `watched_pct=${filmProgHer.watched_pct} completed_at=${filmProgHer.completed_at ?? "NULL"} source=${filmProgHer.source ?? "NULL"}`
        : red("no row")
    }`
  );
  line(
    `lesson_completed event today              ${completes.length ? green("yes") : red("no")}`
  );
  line(`paid today                                ${lessonPaid.length ? green("yes") : red("no")}`);
  line(`module_completion                         ${mcSvc ? green("yes") : red("no")}`);

  line();
  line(bold("what each candidate would require, and whether the rows show it"));
  const verdict = (cond: boolean) => (cond ? green("CONSISTENT") : red("ruled out"));
  line(
    `  1 alreadyComplete branch   row exists, completed_at NULL, no event, no pay   ` +
      verdict(!!filmProgSvc && !filmProgSvc.completed_at && completes.length === 0 && lessonPaid.length === 0)
  );
  line(
    `  2 written but not counted  completed_at set, header still 0                  ` +
      verdict(!!filmProgSvc && !!filmProgSvc.completed_at && (mineRaw as any)?.completed_items === 0)
  );
  line(
    `  3 stale header             completed_at set AND the view counts it           ` +
      verdict(
        !!filmProgSvc &&
          !!filmProgSvc.completed_at &&
          ((mineRaw as any)?.completed_items ?? 0) > 0
      )
  );
  line(
    `  4 nothing written at all   no row of any kind, opens with no progress        ` +
      verdict(!filmProgSvc && opens.length > 0)
  );

  /* ======================================================================= */
  h("6 · who else is reading a colleague's tick right now");
  /*
   * A DEFECT YOU FIND IS A CLASS, NOT AN INSTANCE. The question the bug is an
   * answer to is "which viewers can read a progress row that is not theirs, on
   * a film their own deck will draw" — and that is answerable for everybody, so
   * it is answered for everybody rather than for the one person who reported it.
   *
   * SCOPE, STATED BEFORE THE FINDING. The population is every ACTIVE
   * manager/admin membership (the only roles managed_rooftops() returns) against
   * every PUBLISHED advisor_video that carries a module_id (the only films a
   * module deck draws). A pair counts when the viewer has no completion of their
   * own for that film and somebody else at a rooftop they manage does.
   */
  async function page(table: string, cols: string, apply: (q: any) => any = (q) => q) {
    const out: any[] = [];
    const PAGE = 1000;
    /* PAGED, because a bare select stops at 1000 rows and a count taken from a
       single page is the under-reporting fault this repo has shipped before. */
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await apply(service.from(table).select(cols)).range(
        from,
        from + PAGE - 1
      );
      if (error) throw error;
      out.push(...((data ?? []) as any[]));
      if (((data ?? []) as any[]).length < PAGE) break;
    }
    return out;
  }

  const allMems = await page("membership", "user_id,rooftop_id,role,active", (q) =>
    q.eq("active", true)
  );
  const managedBy = new Map<string, Set<string>>();
  for (const m of allMems) {
    if (m.role !== "manager" && m.role !== "admin") continue;
    if (!managedBy.has(m.user_id)) managedBy.set(m.user_id, new Set());
    managedBy.get(m.user_id)!.add(m.rooftop_id);
  }

  const deckFilms = await page("content", "id,module_id,type,status", (q) =>
    q.eq("status", "published").not("module_id", "is", null).in("type", gating)
  );
  const deckFilmIds = new Set(deckFilms.map((f) => f.id));
  const completions = (
    await page("content_progress", "user_id,content_id,rooftop_id,completed_at", (q) =>
      q.not("completed_at", "is", null)
    )
  ).filter((p) => deckFilmIds.has(p.content_id));

  const byFilmRooftop = new Map<string, any[]>();
  for (const p of completions) {
    const k = `${p.content_id}|${p.rooftop_id}`;
    if (!byFilmRooftop.has(k)) byFilmRooftop.set(k, []);
    byFilmRooftop.get(k)!.push(p);
  }
  const ownCompleted = new Set(completions.map((p) => `${p.user_id}|${p.content_id}`));

  line(
    `population: ${allMems.length} active memberships, ${managedBy.size} hold manager/admin; ` +
      `${deckFilms.length} films on module decks; ${completions.length} completions on them`
  );
  line("");

  const perViewer = new Map<string, { films: string[] }>();
  for (const [uid, managed] of managedBy) {
    for (const f of deckFilms) {
      if (ownCompleted.has(`${uid}|${f.id}`)) continue;
      let leaked = false;
      for (const r of managed) {
        if ((byFilmRooftop.get(`${f.id}|${r}`) ?? []).some((p) => p.user_id !== uid)) leaked = true;
      }
      if (!leaked) continue;
      if (!perViewer.has(uid)) perViewer.set(uid, { films: [] });
      perViewer.get(uid)!.films.push(f.id);
    }
  }

  const totalPairs = [...perViewer.values()].reduce((s, v) => s + v.films.length, 0);
  line(
    `${totalPairs === 0 ? green("0") : red(String(totalPairs))} (viewer, film) pairs ` +
      `across ${perViewer.size} viewer(s) would draw a tick from somebody else's row`
  );
  line("");
  for (const [uid, v] of [...perViewer].sort((a, b) => b[1].films.length - a[1].films.length)) {
    const alsoAdvisor = allMems.some((m) => m.user_id === uid && m.role === "advisor");
    line(
      `${uid}  ${String(v.films.length).padStart(4)} film(s)  ` +
        `${alsoAdvisor ? bold("ALSO AN ADVISOR") : "manager/admin only"}` +
        `${uid === userId ? "  ← the subject" : ""}`
    );
  }
  note(
    "A manager who is not also an advisor still sees the wrong tick, but has no " +
      "daily loop of their own, so the one it costs is the manager-advisor."
  );

  /* ---- the close, computed from what happened -------------------------- */
  h("summary");
  line(`readings taken as her and as service; ${unknownAsHer} marked UNKNOWN AS HER`);
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
