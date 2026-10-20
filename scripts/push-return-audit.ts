/* ============================================================================
   EDIAGD — Did the push go out, and did anybody come back?

   Ryan, 14 October: "I need to make sure the push notifications are going out
   and if it is working to get users back in. So like advisor lapsed 3 days,
   notification went out, and 1 hr later he logged back in."

   READ-ONLY. It issues selects and two STABLE rpcs (is_scheduled_day,
   previous_scheduled_day) and writes nothing — not a heartbeat, not an event.
   The refusal below is the proof rather than the promise: it exits non-zero if
   handed a write-shaped flag, and there is no insert, update, upsert or delete
   anywhere in the file.

   ---------------------------------------------------------------------------
   SAY WHAT WAS MEASURED, OVER WHAT POPULATION, BY WHICH PATH
   ---------------------------------------------------------------------------
   Every table prints its scope line first, because a path-scoped count stated
   as a fact about the subject is this project's most expensive habit. The
   population is `membership` rows at ONE rooftop with role advisor and active
   — named by UUID, never by store name, because a name match returns the wrong
   row without erroring.

   ---------------------------------------------------------------------------
   THE THREE QUANTITIES AND THE SYSTEM EACH CAME FROM
   ---------------------------------------------------------------------------
   "Sent" is three different facts in this codebase and they are NOT
   interchangeable:

     queued     a row in notification_outbox — a DECISION, made by
                generate_push_outbox. Costs the advisor their one slot for the
                day.
     delivered  a row in push_delivery with ok = true — APPLE accepted the
                payload for a token. Not "the phone showed it"; APNs does not
                tell us that and nothing here claims it.
     sent       notification_outbox.status = 'sent' — at least one device of
                the several a person may carry was delivered to.

   A queued row that never reached Apple is not a push that went out, and a
   report that added them together would answer Ryan's question wrongly in the
   optimistic direction. So they are three columns, never one.

   ---------------------------------------------------------------------------
   "CAME BACK" IS THREE RECORDS TOO, AND THE EARLIEST ONE WINS
   ---------------------------------------------------------------------------
     app_event signed_in   the session, with the platform it ran in. Deduped
                           per store-day by 0163, so the SECOND sign-in of a
                           day is not recorded — a return measured from this
                           alone would miss anybody who had already opened the
                           app that morning.
     daily_activity        created_at, written by markActiveToday as a page
                           renders. One row per user per date, so same caveat.
     daily_completion      created_at — they did the work, not just turned up.

   All three are reported, and the gap is to the EARLIEST of them, because
   "came back" is whichever evidence arrived first. The dedup caveat is stated
   on the output rather than left for a reader to discover: a null return is
   "no FIRST touch of that store-day after the push", not "never opened it".

   ---------------------------------------------------------------------------
   RUN
   ---------------------------------------------------------------------------
     set -a && . ./.env.local && set +a
     SB_URL=$NEXT_PUBLIC_SUPABASE_URL SB_KEY=$SUPABASE_SERVICE_ROLE_KEY \
     ROOFTOP=$ROLLCALL_ROOFTOP_ID SINCE=2026-10-12 \
     npm run audit:push-return
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SB_URL;
const KEY = process.env.SB_KEY;
const ROOFTOP = (process.env.ROOFTOP ?? "").trim();
const SINCE = (process.env.SINCE ?? "").trim();

if (!URL || !KEY) {
  console.error("\n  need SB_URL and SB_KEY\n");
  process.exit(1);
}

/* The 8-4-4-4-12 shape only. The ids in this database are not RFC-4122 and the
   textbook version/variant regex refuses real ones. Same rule as
   lib/events/kinds.ts, restated here because a script must not import
   server-only modules. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!UUID.test(ROOFTOP)) {
  console.error(
    "\n  ROOFTOP must be a uuid. There is deliberately no lookup by store name:\n" +
      "  a name match returns the wrong row without erroring.\n"
  );
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error("\n  SINCE must be YYYY-MM-DD\n");
  process.exit(1);
}

/* The refusal, proven rather than promised. Nothing in this file writes, and a
   caller who believes otherwise is told so instead of being humoured. */
if (process.argv.slice(2).some((a) => /^--(write|apply|fix)$/.test(a))) {
  console.error("\n  This audit is read-only. There is no write path to enable.\n");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const SINCE_INSTANT = `${SINCE}T00:00:00Z`;

/* ---- small helpers -------------------------------------------------------- */

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const short = (id: string) => id.slice(0, 8);

/** "Tue 14 Oct 07:04" at the store, so a send hour can be read as a send hour. */
function storeStamp(instant: string | null, tz: string | null): string {
  if (!instant) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz ?? "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(instant));
  } catch {
    return instant.slice(0, 16).replace("T", " ") + "Z";
  }
}

const minutesBetween = (from: string, to: string) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);

/** "52 min", "3 h 10 min", "2 d 4 h" — a gap a person reads. */
function gapLabel(mins: number): string {
  if (mins < 0) return `${mins} min (BEFORE the push)`;
  if (mins < 90) return `${mins} min`;
  if (mins < 60 * 48) return `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`;
}

function rule(title: string) {
  console.log(`\n${"─".repeat(78)}\n${title}\n${"─".repeat(78)}`);
}

/* ---- types ---------------------------------------------------------------- */

type Advisor = {
  userId: string;
  membershipId: string;
  name: string;
  opCodeId: string | null;
};
type Token = {
  id: string;
  user_id: string;
  platform: string;
  created_at: string;
  last_seen: string | null;
  retired_at: string | null;
  retired_reason: string | null;
};
type Outbox = {
  id: string;
  recipient_id: string;
  kind: string;
  status: string;
  local_date: string;
  local_time: string | null;
  scheduled_for: string;
  sent_at: string | null;
  device_count: number;
  opened_at: string | null;
  skipped_reason: string | null;
  rationale: string | null;
};
type Delivery = {
  id: string;
  outbox_id: string;
  token_tail: string;
  ok: boolean;
  apns_status: number | null;
  apns_reason: string | null;
  at: string;
};

async function main() {
  /* ---- 0. The rooftop, by id, and its clock ----------------------------- */
  const { data: rooftop, error: rErr } = await sb
    .from("rooftop")
    .select("id, name, timezone")
    .eq("id", ROOFTOP)
    .maybeSingle();

  if (rErr) throw new Error(`rooftop: ${rErr.message}`);
  if (!rooftop) {
    console.error(`\n  no rooftop with id ${ROOFTOP}\n`);
    process.exit(1);
  }
  const tz = (rooftop.timezone as string | null) ?? null;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  PUSH → RETURN AUDIT                                            READ-ONLY    ║
╚══════════════════════════════════════════════════════════════════════════════╝

  Rooftop      ${rooftop.name}  (${ROOFTOP})
  Timezone     ${tz ?? "— none set —"}
  Period       ${SINCE} 00:00Z → now (${new Date().toISOString().slice(0, 16)}Z)
  Database     ${URL!.replace(/^https:\/\/([a-z0-9]{4}).*/, "https://$1….supabase.co")}
  Read as      service_role, which bypasses RLS. This is an audit of the DATA,
               not of who may see it; the RLS claims are proven separately by
               the acceptance suite as the roles that really call.`);

  /* ---- 1. The population ------------------------------------------------- */
  rule("1 · THE POPULATION — membership, role advisor, active, at this rooftop");

  const { data: memberships, error: mErr } = await sb
    .from("membership")
    .select("id, user_id, role, active, op_code_id")
    .eq("rooftop_id", ROOFTOP)
    .eq("role", "advisor")
    .eq("active", true);
  if (mErr) throw new Error(`membership: ${mErr.message}`);

  const advisorIds = (memberships ?? []).map((m) => m.user_id as string);

  /* Names are for PRINTING. Every join in this file is on user_id. */
  const { data: users, error: uErr } = await sb
    .from("app_user")
    .select("id, full_name")
    .in("id", advisorIds.length ? advisorIds : ["00000000-0000-0000-0000-000000000000"]);
  if (uErr) throw new Error(`app_user: ${uErr.message}`);
  const nameOf = new Map(
    ((users ?? []) as { id: string; full_name: string | null }[]).map((u) => [
      u.id,
      u.full_name ?? "(no name)",
    ])
  );

  const advisors: Advisor[] = (memberships ?? [])
    .map((m) => ({
      userId: m.user_id as string,
      membershipId: m.id as string,
      name: nameOf.get(m.user_id as string) ?? "(no name)",
      opCodeId: (m.op_code_id as string | null) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`
  ${advisors.length} active advisor membership${advisors.length === 1 ? "" : "s"}.
  Counted through membership, which is the table generate_push_outbox itself
  iterates — so this is the same population the push logic sees, not a roster
  read by another path.`);

  if (advisors.length === 0) {
    console.log("\n  Nothing to audit. Stopping rather than reporting zeroes.\n");
    process.exit(0);
  }

  /* ---- 2. Tokens --------------------------------------------------------- */
  const { data: tokenRows, error: tErr } = await sb
    .from("device_push_token")
    .select("id, user_id, platform, created_at, last_seen, retired_at, retired_reason")
    .in("user_id", advisorIds);
  if (tErr) throw new Error(`device_push_token: ${tErr.message}`);
  const tokens = (tokenRows ?? []) as Token[];
  const tokensOf = new Map<string, Token[]>();
  for (const t of tokens) {
    const l = tokensOf.get(t.user_id) ?? [];
    l.push(t);
    tokensOf.set(t.user_id, l);
  }

  /* ---- 3. Outbox and deliveries ----------------------------------------- */
  const { data: outboxRows, error: oErr } = await sb
    .from("notification_outbox")
    .select(
      "id, recipient_id, kind, status, local_date, local_time, scheduled_for, sent_at, device_count, opened_at, skipped_reason, rationale"
    )
    .in("recipient_id", advisorIds)
    .gte("local_date", SINCE)
    .order("scheduled_for", { ascending: true });
  if (oErr) throw new Error(`notification_outbox: ${oErr.message}`);
  const outbox = (outboxRows ?? []) as Outbox[];

  let deliveries: Delivery[] = [];
  if (outbox.length > 0) {
    const { data: dRows, error: dErr } = await sb
      .from("push_delivery")
      .select("id, outbox_id, token_tail, ok, apns_status, apns_reason, at")
      .in(
        "outbox_id",
        outbox.map((o) => o.id)
      )
      .order("at", { ascending: true });
    if (dErr) throw new Error(`push_delivery: ${dErr.message}`);
    deliveries = (dRows ?? []) as Delivery[];
  }
  const deliveriesOf = new Map<string, Delivery[]>();
  for (const d of deliveries) {
    const l = deliveriesOf.get(d.outbox_id) ?? [];
    l.push(d);
    deliveriesOf.set(d.outbox_id, l);
  }

  /* ---- 4. The three return records --------------------------------------- */
  const [
    { data: signIns, error: siErr },
    { data: activity, error: daErr },
    { data: completions, error: dcErr },
  ] = await Promise.all([
    sb
      .from("app_event")
      .select("user_id, at, meta")
      .eq("kind", "signed_in")
      .in("user_id", advisorIds)
      .gte("at", SINCE_INSTANT)
      .order("at", { ascending: true }),
    sb
      .from("daily_activity")
      .select("user_id, activity_date, created_at")
      .in("user_id", advisorIds)
      .gte("created_at", SINCE_INSTANT)
      .order("created_at", { ascending: true }),
    sb
      .from("daily_completion")
      .select("user_id, completion_date, created_at")
      .in("user_id", advisorIds)
      .gte("created_at", SINCE_INSTANT)
      .order("created_at", { ascending: true }),
  ]);
  /* All three, named individually: a dropped error here would silently remove
     one of the three ways somebody can come back, and the audit would report a
     null return for a person who did. */
  if (siErr) throw new Error(`app_event signed_in: ${siErr.message}`);
  if (daErr) throw new Error(`daily_activity: ${daErr.message}`);
  if (dcErr) throw new Error(`daily_completion: ${dcErr.message}`);

  type Touch = { at: string; what: string };
  const touchesOf = new Map<string, Touch[]>();
  const addTouch = (userId: string, at: string, what: string) => {
    const l = touchesOf.get(userId) ?? [];
    l.push({ at, what });
    touchesOf.set(userId, l);
  };
  for (const e of (signIns ?? []) as { user_id: string; at: string; meta: Record<string, unknown> | null }[]) {
    addTouch(e.user_id, e.at, `signed_in (${(e.meta?.platform as string) ?? "platform unrecorded"})`);
  }
  for (const a of (activity ?? []) as { user_id: string; created_at: string }[]) {
    addTouch(a.user_id, a.created_at, "daily_activity");
  }
  for (const c of (completions ?? []) as { user_id: string; created_at: string }[]) {
    addTouch(c.user_id, c.created_at, "daily_completion");
  }
  for (const l of touchesOf.values()) l.sort((x, y) => x.at.localeCompare(y.at));

  /* ---- 5. The per-advisor table ----------------------------------------- */
  rule("2 · ONE TABLE PER ADVISOR");

  console.log(`
  Columns, and the system each came from:
    reachable   device_push_token — a live row means the TestFlight app is
                installed AND notifications were allowed. No row, no push: the
                generator's last condition requires one, so an unreachable
                advisor is never even queued.
    queued      notification_outbox — the decision. Costs their daily slot.
    delivered   push_delivery.ok — Apple ACCEPTED it. Not "they saw it".
    back        the earliest of signed_in / daily_activity / daily_completion
                strictly after the delivery, and the gap in minutes.`);

  let totalQueued = 0;
  let totalDelivered = 0;
  let totalFailed = 0;
  let totalBack24 = 0;
  const silent: { advisor: Advisor; why: string }[] = [];

  for (const a of advisors) {
    const myTokens = tokensOf.get(a.userId) ?? [];
    const live = myTokens.filter((t) => !t.retired_at);
    const myOutbox = outbox.filter((o) => o.recipient_id === a.userId);
    const touches = touchesOf.get(a.userId) ?? [];

    console.log(`\n  ${a.name}   (user ${short(a.userId)})`);
    console.log(`  ${"·".repeat(74)}`);

    /* reachable */
    if (live.length === 0 && myTokens.length === 0) {
      console.log(`    Reachable      no — no device_push_token has ever been registered`);
    } else if (live.length === 0) {
      const r = myTokens[myTokens.length - 1];
      console.log(
        `    Reachable      no — ${myTokens.length} token(s), all retired; last: ${r.retired_reason ?? "no reason recorded"} ${storeStamp(r.retired_at, tz)}`
      );
    } else {
      console.log(
        `    Reachable      yes — ${live
          .map(
            (t) =>
              `${t.platform}, registered ${storeStamp(t.created_at, tz)}${
                t.last_seen ? `, last seen ${storeStamp(t.last_seen, tz)}` : ""
              }`
          )
          .join("; ")}`
      );
    }

    if (myOutbox.length === 0) {
      console.log(`    Pushes         none queued since ${SINCE}`);
      silent.push({ advisor: a, why: "" });
      continue;
    }

    for (const o of myOutbox) {
      totalQueued += 1;
      const ds = deliveriesOf.get(o.id) ?? [];
      const okDs = ds.filter((d) => d.ok);
      const badDs = ds.filter((d) => !d.ok);
      totalDelivered += okDs.length;
      totalFailed += badDs.length;

      console.log(
        `    ${pad(o.kind, 16)} ${o.local_date} ${String(o.local_time ?? "").slice(0, 5)} store` +
          `  ·  status ${o.status}` +
          (o.opened_at ? `  ·  deep link opened ${storeStamp(o.opened_at, tz)}` : "")
      );
      if (o.rationale) console.log(`      why queued   ${o.rationale}`);

      if (ds.length === 0) {
        console.log(
          `      delivery     NO push_delivery ROW — the decision exists and no` +
            ` attempt was recorded${o.skipped_reason ? ` (skipped: ${o.skipped_reason})` : ""}`
        );
        continue;
      }

      for (const d of ds) {
        console.log(
          `      ${d.ok ? "delivered" : "FAILED   "}    …${d.token_tail}  ` +
            `HTTP ${d.apns_status ?? "—"}  ${d.apns_reason ?? (d.ok ? "accepted" : "no reason")}  ` +
            `at ${storeStamp(d.at, tz)}`
        );
      }

      /* The return, measured from the FIRST successful delivery. */
      if (okDs.length === 0) {
        console.log(`      back         n/a — nothing was delivered, so there is nothing to attribute`);
        continue;
      }
      const from = okDs[0].at;
      const after = touches.filter((t) => t.at > from);
      if (after.length === 0) {
        console.log(`      back         no return recorded after this delivery`);
        continue;
      }
      const first = after[0];
      const mins = minutesBetween(from, first.at);
      const band = mins <= 60 ? "within 1 h" : mins <= 240 ? "within 4 h" : mins <= 1440 ? "within 24 h" : "after 24 h";
      if (mins <= 1440) totalBack24 += 1;
      console.log(
        `      back         ${gapLabel(mins)} — ${first.what} at ${storeStamp(first.at, tz)}  [${band}]`
      );
      /* Everything inside 24 h, not only the first, so a sign-in followed by a
         completion reads as both rather than as one. */
      const within = after.filter((t) => minutesBetween(from, t.at) <= 1440);
      if (within.length > 1) {
        console.log(
          `                   also: ${within
            .slice(1)
            .map((t) => `${t.what} +${gapLabel(minutesBetween(from, t.at))}`)
            .join(", ")}`
        );
      }
    }
  }

  /* ---- 6. Why the silent ones are silent -------------------------------- */
  rule("3 · ONE LINE PER ADVISOR WITH NO PUSH — the reason, not the absence");

  const { data: policies, error: pErr } = await sb
    .from("outbox_policy")
    .select("kind, enabled, target_local_time, min_days_between, channel, cadence");
  if (pErr) throw new Error(`outbox_policy: ${pErr.message}`);
  const policyOf = new Map(
    ((policies ?? []) as Record<string, unknown>[]).map((p) => [p.kind as string, p])
  );
  const returnPolicy = policyOf.get("return") as
    | { enabled: boolean; target_local_time: string; cadence: Record<string, number> | null }
    | undefined;

  /*
   * ENTITLEMENT IS ASKED OF THE FUNCTION THE GENERATOR CALLS, not reconstructed
   * from the table.
   *
   * The first version of this read `rooftop_product` and selected a column
   * called `active`. There is no such column — it is `status`, with 'active'
   * among its VALUES — so PostgREST returned an error, the error was not
   * checked, `data` was null, and the audit printed "rooftop advisor_base is
   * ABSENT" for a rooftop that is entitled. A confident wrong answer, in the
   * direction that would have had Ryan chasing an entitlement bug that does
   * not exist.
   *
   * Two fixes, and both of them are the standing rules:
   *   - rooftop_has_product() is what generate_push_outbox asks, so asking it
   *     too is joining on what the decider observed rather than on a second
   *     definition of the same fact.
   *   - every read below now checks its error and throws. A select whose error
   *     is dropped reports the empty set, and the empty set reads as a finding.
   */
  const { data: hasBase, error: hpErr } = await sb.rpc("rooftop_has_product", {
    _rooftop: ROOFTOP,
    _product: "advisor_base",
  });
  if (hpErr) throw new Error(`rooftop_has_product: ${hpErr.message}`);

  const { data: entitlements, error: eErr } = await sb
    .from("rooftop_product")
    .select("product, status, started_at")
    .eq("rooftop_id", ROOFTOP);
  if (eErr) throw new Error(`rooftop_product: ${eErr.message}`);
  const baseRow = ((entitlements ?? []) as { product: string; status: string }[]).find(
    (e) => e.product === "advisor_base"
  );
  /* The two routes to the same fact, reconciled — the reconciliation is the
     proof. A disagreement means status holds a value rooftop_has_product does
     not accept, which is a finding in its own right. */
  const advisorBase = {
    active: hasBase === true,
    row: baseRow ?? null,
  };
  if (advisorBase.active !== Boolean(baseRow && ["active", "trialing"].includes(baseRow.status))) {
    throw new Error(
      `advisor_base disagrees between rooftop_has_product (${hasBase}) and rooftop_product.status (${baseRow?.status ?? "no row"})`
    );
  }

  const { data: schedules, error: wsErr } = await sb
    .from("work_schedule")
    .select("user_id, schedule_set_at")
    .in("user_id", advisorIds);
  if (wsErr) throw new Error(`work_schedule: ${wsErr.message}`);
  const scheduleOf = new Map(
    ((schedules ?? []) as { user_id: string; schedule_set_at: string | null }[]).map((s) => [
      s.user_id,
      s,
    ])
  );

  const { data: swells, error: swErr } = await sb
    .from("swell")
    .select("user_id, current_len, last_completed_on")
    .in("user_id", advisorIds);
  if (swErr) throw new Error(`swell: ${swErr.message}`);
  const swellOf = new Map(
    ((swells ?? []) as { user_id: string; current_len: number; last_completed_on: string | null }[]).map(
      (s) => [s.user_id, s]
    )
  );

  const { data: prefs, error: prErr } = await sb
    .from("user_notification_pref")
    .select("user_id, push_enabled")
    .in("user_id", advisorIds);
  if (prErr) throw new Error(`user_notification_pref: ${prErr.message}`);
  const prefOf = new Map(
    ((prefs ?? []) as { user_id: string; push_enabled: boolean }[]).map((p) => [p.user_id, p])
  );

  const { data: everCompleted, error: ecErr } = await sb
    .from("daily_completion")
    .select("user_id")
    .in("user_id", advisorIds);
  if (ecErr) throw new Error(`daily_completion (ever): ${ecErr.message}`);
  const hasCompleted = new Set(
    ((everCompleted ?? []) as { user_id: string }[]).map((r) => r.user_id)
  );

  /* The store's today, so "not yet lapsed" is judged against the right date. */
  const storeToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  console.log(`
  Judged against the generator's own conditions, in its order, and the FIRST
  one that fails is the reason — because that is the one that decided. Store
  today is ${storeToday}; the Return policy is ${
    returnPolicy ? (returnPolicy.enabled ? `enabled, target ${returnPolicy.target_local_time}` : "DISABLED") : "ABSENT"
  }; rooftop advisor_base is ${
    advisorBase.active
      ? `active (rooftop_product.status = ${advisorBase.row!.status})`
      : advisorBase.row
        ? `NOT ENTITLED — status is ${advisorBase.row.status}`
        : "NOT ENTITLED — no rooftop_product row"
  }.
`);

  for (const a of advisors) {
    if (outbox.some((o) => o.recipient_id === a.userId)) continue;

    const live = (tokensOf.get(a.userId) ?? []).filter((t) => !t.retired_at);
    const sched = scheduleOf.get(a.userId);
    const sw = swellOf.get(a.userId);
    const pref = prefOf.get(a.userId);

    let scheduledToday: boolean | null = null;
    let prevScheduled: string | null = null;
    if (sched?.schedule_set_at) {
      const { data: isDay } = await sb.rpc("is_scheduled_day", {
        _user: a.userId,
        _d: storeToday,
      });
      scheduledToday = (isDay as boolean | null) ?? null;
      const { data: prev } = await sb.rpc("previous_scheduled_day", {
        _user: a.userId,
        _d: storeToday,
      });
      prevScheduled = (prev as string | null) ?? null;
    }

    let why: string;
    if (!advisorBase.active) {
      why = "the rooftop is not entitled to advisor_base — no kind is generated here at all";
    } else if (!returnPolicy?.enabled) {
      why = "the Return policy row is disabled or missing";
    } else if (!sched?.schedule_set_at) {
      why =
        "NO CONFIRMED WORK SCHEDULE. is_scheduled_day is false on every date without one, so " +
        "this advisor can never be on a scheduled morning and therefore CAN NEVER LAPSE. " +
        "Onboarding is the gate, not the push.";
    } else if (live.length === 0) {
      why =
        "no live device_push_token — the generator's last condition requires one, so nothing is queued";
    } else if (pref && pref.push_enabled === false) {
      why = "push_enabled is false — they turned notifications off";
    } else if (!a.opCodeId) {
      why = "membership.op_code_id is null — Return requires a mapped operator";
    } else if (!hasCompleted.has(a.userId)) {
      why =
        "never completed a morning, so they are in the START class, not Return (Start sends on scheduled workdays 1 and 3 from the membership date)";
    } else if (!sw?.last_completed_on) {
      why = "swell has no last_completed_on, so Return's lapse test has nothing to measure from";
    } else if (scheduledToday === false) {
      why = `today (${storeToday}) is not a scheduled workday for them`;
    } else if (prevScheduled && sw.last_completed_on >= prevScheduled) {
      why = `not lapsed — last completion ${sw.last_completed_on}, previous scheduled day ${prevScheduled}`;
    } else {
      why =
        "every condition above holds; the remaining gates are the decaying cadence (return_send_due) and the 30-day stop";
    }

    console.log(`  ${pad(a.name, 26)} ${why}`);
  }

  /* ---- 7. The three checks ---------------------------------------------- */
  /* ---- 6b. Who DOES have a token ---------------------------------------
     "Nought of nine are reachable" is a true statement that invites the wrong
     conclusion — it reads as "token registration is broken". The second route
     is who holds a live token across the WHOLE database: if the only ones are
     platform-owner handsets, registration works and nobody at the store has
     allowed notifications yet. Two different problems with two different
     remedies, and the counts are what separate them. */
  rule("3b · WHO HOLDS A LIVE TOKEN AT ALL — the whole database, not this store");

  const { data: everyToken, error: etErr } = await sb
    .from("device_push_token")
    .select("id, user_id, platform, created_at, retired_at");
  if (etErr) throw new Error(`device_push_token (all): ${etErr.message}`);
  const liveAll = ((everyToken ?? []) as Token[]).filter((t) => !t.retired_at);
  const holderIds = [...new Set(liveAll.map((t) => t.user_id))];

  const { data: holderMemberships, error: hmErr } = holderIds.length
    ? await sb
        .from("membership")
        .select("user_id, rooftop_id, role, active")
        .in("user_id", holderIds)
    : { data: [], error: null };
  if (hmErr) throw new Error(`membership (token holders): ${hmErr.message}`);

  console.log(`
  ${liveAll.length} live token${liveAll.length === 1 ? "" : "s"} across ${holderIds.length} ${
    holderIds.length === 1 ? "person" : "people"
  }, every rooftop.
`);
  for (const uid of holderIds) {
    const mine = liveAll.filter((t) => t.user_id === uid);
    const roles = ((holderMemberships ?? []) as { user_id: string; rooftop_id: string; role: string; active: boolean }[])
      .filter((m) => m.user_id === uid)
      .map((m) => `${m.role}${m.active ? "" : " (inactive)"}${m.rooftop_id === ROOFTOP ? " AT THIS ROOFTOP" : " elsewhere"}`);
    console.log(
      `  user ${short(uid)}  ${pad(nameOf.get(uid) ?? "(not in this rooftop's roster)", 24)} ${mine
        .map((t) => t.platform)
        .join(", ")}  ·  ${roles.length ? roles.join("; ") : "no active membership"}`
    );
  }

  rule("4 · CHECK A — the APNs gateway the server used, against the build");

  /* All deliveries ever, not only this period: a BadDeviceToken from last week
     is the same evidence about the gateway, and the question is about
     configuration rather than about this fortnight. */
  const { data: allDeliveries, error: adErr } = await sb
    .from("push_delivery")
    .select("ok, apns_status, apns_reason, at")
    .order("at", { ascending: false })
    .limit(500);
  if (adErr) throw new Error(`push_delivery (all): ${adErr.message}`);
  const allD = (allDeliveries ?? []) as {
    ok: boolean;
    apns_status: number | null;
    apns_reason: string | null;
    at: string;
  }[];

  console.log(`
  SCOPE: the most recent ${allD.length} push_delivery rows across EVERY rooftop,
  not only this one — a gateway is a property of the deployment, so the widest
  available population is the right one.

  The server's host cannot be read from here: it is decided by APNS_SANDBOX in
  Vercel's environment, which this script has no access to. What it CAN read is
  Apple's own answer, and that is the better evidence — a production build
  against the sandbox host fails EVERY token with BadDeviceToken, so the reason
  column is the gateway test.
`);

  if (allD.length === 0) {
    console.log(
      "  NO DELIVERY ROWS AT ALL. The gateway is therefore UNTESTED, not correct —\n" +
        "  a configuration nothing has exercised is not a configuration that works.\n" +
        "  This is the acceptance half of the gate, and it is the one that gets skipped."
    );
  } else {
    const byReason = new Map<string, number>();
    for (const d of allD) {
      const k = `${d.ok ? "ok" : "fail"} ${d.apns_status ?? "—"} ${d.apns_reason ?? "(none)"}`;
      byReason.set(k, (byReason.get(k) ?? 0) + 1);
    }
    for (const [k, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${pad(String(n), 5)} ${k}`);
    }
    const badToken = allD.filter(
      (d) => d.apns_reason === "BadDeviceToken" || d.apns_reason === "Unregistered"
    ).length;
    const okCount = allD.filter((d) => d.ok).length;
    console.log(`
    ${okCount} accepted, ${badToken} BadDeviceToken/Unregistered.
    ${
      okCount > 0 && badToken === 0
        ? "VERDICT: the host matches the build. Apple accepted every token it was offered."
        : badToken > 0 && okCount === 0
          ? "VERDICT: EVERY token was rejected as bad. That is the signature of a host/build mismatch — APNS_SANDBOX set against a TestFlight build, or the reverse."
          : badToken > 0
            ? "VERDICT: mixed. Some tokens were accepted, so the host is right for the build; the rejected ones are individual dead devices, which is the normal shape (a reinstall retires a token)."
            : "VERDICT: no acceptance recorded. Read the reasons above before concluding anything."
    }`);
  }

  rule("4 · CHECK B — Return counts SCHEDULED workdays, so onboarding gates it");

  const onboarded = advisors.filter((a) => scheduleOf.get(a.userId)?.schedule_set_at);
  console.log(`
  SCOPE: the ${advisors.length} advisor memberships above, against work_schedule.

  Return's lapse test is \`last_completed_on < previous_scheduled_day(user, today)\`
  and its cadence is counted by scheduled_days_since — both of which call
  is_scheduled_day, which reads work_schedule. An advisor with no CONFIRMED
  schedule (schedule_set_at null) has no scheduled days, so:

    previous_scheduled_day returns null  →  the lapse comparison is null  →
    the WHERE clause is not satisfied    →  they can never lapse, ever.

  This is not a bug in the push. It is the push correctly declining to fire for
  somebody the app is still holding at onboarding. But it means "no Return push
  went out" is explained by onboarding and NOT by the transport, and the two
  must not be confused — which is the whole reason this check is here.

    ${onboarded.length} of ${advisors.length} have confirmed a work schedule.
`);
  for (const a of advisors) {
    const s = scheduleOf.get(a.userId);
    console.log(
      `  ${pad(a.name, 26)} ${
        s?.schedule_set_at
          ? `schedule confirmed ${storeStamp(s.schedule_set_at, tz)}`
          : s
            ? "work_schedule row exists but schedule_set_at is NULL — not onboarded"
            : "no work_schedule row — not onboarded"
      }`
    );
  }

  rule("4 · CHECK C — is the cron firing on the schedule vercel.json declares?");

  const { data: beats, error: hbErr } = await sb
    .from("cron_heartbeat")
    .select("job, ran_at, detail");
  if (hbErr) throw new Error(`cron_heartbeat: ${hbErr.message}`);
  const beatRows = (beats ?? []) as { job: string; ran_at: string; detail: Record<string, unknown> }[];

  console.log(`
  SCOPE, AND IT IS NARROW: cron_heartbeat has \`job\` as its PRIMARY KEY, so it
  holds exactly ONE ROW PER JOB — the LAST completed run. There is no history
  here, so this cannot show a schedule; it shows the most recent completion and
  nothing about the ones before it. Stated plainly because a one-row sample
  reported as a schedule would be the scoped-measurement mistake again.

  vercel.json declares:  streak-saver  0 * * * *   (hourly, on the hour, UTC)
                         rollcall      30 22 * * * (17:30 CDT / 16:30 CST)
`);
  const now = Date.now();
  for (const job of ["streak-saver", "rollcall"]) {
    const b = beatRows.find((r) => r.job === job);
    if (!b) {
      console.log(`  ${pad(job, 14)} NO HEARTBEAT ROW — this job has never completed a run.`);
      continue;
    }
    const ageMin = Math.round((now - new Date(b.ran_at).getTime()) / 60000);
    const expected = job === "streak-saver" ? 60 : 1440;
    console.log(
      `  ${pad(job, 14)} last completed ${b.ran_at} (${gapLabel(ageMin)} ago) — ${
        ageMin <= expected * 1.5
          ? "inside its declared interval, so it is alive"
          : `OVERDUE: more than one ${job === "streak-saver" ? "hour" : "day"} has passed`
      }`
    );
    console.log(`                 detail ${JSON.stringify(b.detail)}`);
  }

  /* ---- 8. The summary, computed from the counters ------------------------ */
  rule("5 · SUMMARY — every number below was incremented by the loop above");

  const reachable = advisors.filter(
    (a) => (tokensOf.get(a.userId) ?? []).some((t) => !t.retired_at)
  ).length;

  console.log(`
  advisors                  ${advisors.length}
  reachable (live token)    ${reachable}
  pushes queued             ${totalQueued}
  deliveries accepted       ${totalDelivered}
  deliveries failed         ${totalFailed}
  returns within 24 h       ${totalBack24}${
    totalDelivered > 0
      ? `   (${Math.round((100 * totalBack24) / totalDelivered)}% of accepted deliveries)`
      : "   (no rate — nothing was delivered, and 0/0 is not 0%)"
  }
`);

  /* The exit code is a function of what happened, not a constant. Nothing here
     is a FAILURE of the audit — a store with no pushes is a finding, not an
     error — so this exits 0 and the findings are the output. The one thing that
     would be a fault of the audit itself is an unreadable table, and those
     throw above. */
}

main().catch((e) => {
  console.error(`\n  audit failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
