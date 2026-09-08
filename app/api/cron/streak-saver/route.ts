/* ============================================================================
   EDIAGD — the hourly run that generates the streak saver and delivers it

   ---------------------------------------------------------------------------
   HOURLY, BECAUSE THE STORES ARE NOT IN ONE TIMEZONE
   ---------------------------------------------------------------------------
   The send hour is 7pm AT THE STORE. A single nightly UTC fire cannot mean 7pm
   in both Texas and Hawaii, so this runs every hour and each run asks every
   rooftop what time it is there. Rooftops not currently inside their own send
   window generate nothing, which is most rooftops on most runs and costs a
   handful of index probes.

   ---------------------------------------------------------------------------
   TWO PHASES, AND THE SECOND ONE IS ALLOWED TO FAIL
   ---------------------------------------------------------------------------
   Generate, then deliver. They are separated because a queued row is a decision
   and a delivery is an attempt: if Apple is unreachable the decision still
   stands and the next run picks the row up, still pending, with its dedup key
   intact. Nothing is lost and nothing is duplicated.

   ---------------------------------------------------------------------------
   IDEMPOTENT ON PURPOSE
   ---------------------------------------------------------------------------
   Vercel can and does invoke a cron more than once. Every insert carries a
   dedup key with `on conflict do nothing`, and every send transitions a row out
   of `pending` before it can be claimed again. Running this five times in a
   minute sends one notification.
   ============================================================================ */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isApnsConfigured, isDeadToken, sendToTokens } from "@/lib/notifications/apns";

/* node:http2 and node:crypto — this cannot run on the edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueRow = {
  id: string;
  recipient_id: string;
  title: string;
  body: string;
  deep_link: string;
  local_date: string;
  token_id: string | null;
  token: string;
};

/**
 * Vercel signs its own cron invocations with CRON_SECRET when that variable
 * exists. Without the variable this endpoint would be an unauthenticated way to
 * make the app push to every phone it knows about, so a missing secret is a
 * refusal rather than a default-open.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // ---- 1. Generate ---------------------------------------------------------
  const { data: generated, error: generateError } = await supabase.rpc(
    "generate_push_outbox"
  );
  if (generateError) {
    return NextResponse.json(
      { phase: "generate", error: generateError.message },
      { status: 500 }
    );
  }

  // ---- 2. Deliver ----------------------------------------------------------
  if (!isApnsConfigured()) {
    /*
     * Not an error. Until Ryan has put the three APNs variables into Vercel
     * this is the expected state, and the generator half is still doing useful
     * work — rows accumulate as pending and go out on the first run after the
     * key lands. Reported loudly so a silent "why did nobody get it" cannot
     * happen.
     */
    return NextResponse.json({
      generated,
      delivered: 0,
      note: "APNs not configured — rows queued, nothing sent",
    });
  }

  const { data: dueRows, error: dueError } = await supabase
    .from("push_outbox_due")
    .select("id, recipient_id, title, body, deep_link, local_date, token_id, token")
    .limit(1000);

  if (dueError) {
    return NextResponse.json(
      { phase: "due", generated, error: dueError.message },
      { status: 500 }
    );
  }

  /* The view is one row per (message, device); a person with two handsets is
     two rows and ONE notification. Group so each message is decided once. */
  const byMessage = new Map<string, DueRow[]>();
  for (const row of (dueRows ?? []) as DueRow[]) {
    const list = byMessage.get(row.id);
    if (list) list.push(row);
    else byMessage.set(row.id, [row]);
  }

  let sent = 0;
  let skipped = 0;
  let retired = 0;

  for (const [outboxId, rows] of byMessage) {
    const first = rows[0];
    const tokens = rows.map((r) => r.token);

    const results = await sendToTokens(tokens, {
      title: first.title,
      body: first.body,
      deepLink: first.deep_link,
    });

    let okCount = 0;

    for (const row of rows) {
      const result = results.get(row.token) ?? {
        ok: false,
        status: 0,
        reason: "NoResult",
      };
      if (result.ok) okCount += 1;

      await supabase.from("push_delivery").insert({
        outbox_id: outboxId,
        token_id: row.token_id,
        /* The last six characters only. Enough to match a device in a support
           conversation, not enough to be a credential sitting in a log. */
        token_tail: row.token.slice(-6),
        ok: result.ok,
        apns_status: result.status,
        apns_reason: result.reason ?? null,
        apns_id: result.apnsId ?? null,
      });

      if (isDeadToken(result)) {
        await supabase.rpc("retire_push_token", {
          _token: row.token,
          _reason: result.reason ?? "apns_rejected",
        });
        retired += 1;
      }
    }

    /*
     * ONE DEVICE IS ENOUGH. A person carrying a working phone and a dead one
     * received the notification, and marking the row skipped would let the next
     * run send it to them again.
     */
    if (okCount > 0) {
      await supabase.rpc("mark_push_sent", { _id: outboxId, _device_count: okCount });
      sent += 1;
    } else {
      await supabase.rpc("mark_push_skipped", {
        _id: outboxId,
        _reason: `apns: ${[...results.values()].map((r) => r.reason ?? r.status).join(",")}`.slice(0, 200),
      });
      skipped += 1;
    }
  }

  /*
   * Close off anything whose store day ended without being delivered. Without
   * this, "pending" slowly stops meaning "we intend to send this" — and the
   * first thing a resumed transport would do is deliver a backlog of messages
   * about days that are over. See 0105.
   */
  const { data: expired } = await supabase.rpc("expire_stale_outbox");

  return NextResponse.json({
    generated,
    messages: byMessage.size,
    sent,
    skipped,
    retired,
    expired: expired ?? 0,
  });
}
