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
   TWO TRANSPORTS, AND STILL ONE REMINDER PER PERSON
   ---------------------------------------------------------------------------
   Delivery goes through lib/notifications/push-send.ts, which picks Apple or
   Firebase per device. The grouping below is unchanged and is what keeps the
   promise in the soft-ask copy: the outbox row is the DECISION and it is taken
   once, so somebody carrying an iPhone and an Android phone gets one message
   that lands on both handsets — not two messages, and not one message counted
   twice. device_count is how many devices accepted it; `sent` counts messages.
   Somebody with two iPhones has always worked exactly this way.

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
import {
  configuredPlatforms,
  isAnyTransportConfigured,
  isDeadForPlatform,
  sendPush,
} from "@/lib/notifications/push-send";

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
  /* Typed as the enum's two values but read as a string, because the column is
     a Postgres enum and a third value added there would arrive here as data
     this file has no sender for. push-send.ts refuses it by name rather than
     dropping it, which is why this is not narrowed to a union. */
  platform: string;
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
  /*
   * NO TRANSPORT AT ALL is the only case that short-circuits, and it is not an
   * error. Before Ryan put the APNs variables into Vercel this was the expected
   * state, and it is the expected state for FCM again until the three Firebase
   * variables land: the generator half is still doing useful work, rows
   * accumulate as pending, and they go out on the first run after credentials
   * exist. Reported loudly so a silent "why did nobody get it" cannot happen.
   *
   * ONE TRANSPORT CONFIGURED IS NOT THIS CASE, deliberately. With APNs live
   * and FCM absent the run proceeds, iPhones are served, and each Android row
   * is skipped with FcmNotConfigured against its own message — which is a
   * reason in the row rather than a whole run that declined to start.
   */
  const platforms = configuredPlatforms();
  if (!isAnyTransportConfigured()) {
    const summary = {
      generated,
      delivered: 0,
      platforms,
      note: "no push transport configured — rows queued, nothing sent",
    };
    await supabase.rpc("note_cron_run", { _job: "streak-saver", _detail: summary });
    return NextResponse.json(summary);
  }

  const { data: dueRows, error: dueError } = await supabase
    .from("push_outbox_due")
    /* `platform` is new in the select and is what makes a transport choice
       possible. The view carries it since 0056 and has always been widened or
       narrowed by migration, never by this file. */
    .select(
      "id, recipient_id, title, body, deep_link, local_date, token_id, token, platform"
    )
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

  /*
   * PER DEVICE AND PER PLATFORM, BECAUSE `sent` CANNOT ANSWER THE QUESTION.
   *
   * `sent` counts MESSAGES, and one device accepting is enough to mark a
   * message sent. So on the day Android delivery breaks, every advisor with an
   * iPhone keeps the run green and `sent` does not move — the symptom would be
   * invisible in the only number this cron reports. These counters are
   * incremented from what actually came back, per platform, so "Android: 4
   * attempted, 0 accepted" is a line somebody can read.
   */
  const attempted: Record<string, number> = {};
  const accepted: Record<string, number> = {};

  for (const [outboxId, rows] of byMessage) {
    const first = rows[0];

    /* One call for the whole message. The router groups by platform inside, so
       each provider still gets one batched request — Apple explicitly asks
       providers not to open a connection per notification. */
    const results = await sendPush(
      rows.map((r) => ({ token: r.token, platform: r.platform as "ios" | "android" })),
      {
        title: first.title,
        body: first.body,
        deepLink: first.deep_link,
      }
    );

    let okCount = 0;

    for (const row of rows) {
      const result = results.get(row.token) ?? {
        ok: false,
        status: 0,
        reason: "NoResult",
        platform: row.platform,
        transport: null,
      };
      if (result.ok) okCount += 1;

      attempted[row.platform] = (attempted[row.platform] ?? 0) + 1;
      if (result.ok) accepted[row.platform] = (accepted[row.platform] ?? 0) + 1;

      await supabase.from("push_delivery").insert({
        outbox_id: outboxId,
        token_id: row.token_id,
        /* The last six characters only. Enough to match a device in a support
           conversation, not enough to be a credential sitting in a log. */
        token_tail: row.token.slice(-6),
        ok: result.ok,
        /*
         * THE COLUMN NAMES SAY apns_ AND NOW HOLD EITHER PROVIDER'S ANSWER.
         *
         * That is a mislabel and it is deliberate for one release. Renaming
         * them cannot be done in the same change as this one: Vercel deploys
         * on merge, so either the code writes new column names before the
         * migration runs, or it writes the old ones after — and both windows
         * are a silent loss, because this insert's error is not checked and a
         * failed delivery record does not stop a send.
         *
         * Which transport a row came from is recoverable without the column:
         * token_id -> device_push_token.platform, and tokens are retired
         * rather than deleted, so the join survives. The reason string below
         * also names the provider's own vocabulary — "Unregistered" is
         * Apple's word and "UNREGISTERED" is Google's.
         *
         * The rename is three steps and belongs in its own PR: add the new
         * columns, switch the writer, drop the old ones.
         */
        apns_status: result.status,
        apns_reason: result.reason ?? null,
        apns_id: result.providerId ?? null,
      });

      if (isDeadForPlatform(row.platform, result)) {
        await supabase.rpc("retire_push_token", {
          _token: row.token,
          /* The provider's own word, prefixed with which provider said it, so
             a retirement reason can be read years later without guessing
             whether "UNREGISTERED" came from Apple or Google. */
          _reason: `${result.transport ?? row.platform}: ${result.reason ?? "rejected"}`,
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
        /* Per device, naming the transport that refused it. The old string
           said "apns:" for everything, which would now be a claim about a
           provider that was never asked. */
        _reason: `push: ${[...results.values()]
          .map((r) => `${r.transport ?? r.platform}=${r.reason ?? r.status}`)
          .join(",")}`.slice(0, 200),
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

  const summary = {
    generated,
    messages: byMessage.size,
    sent,
    skipped,
    retired,
    expired: expired ?? 0,
    /* Which transports this deployment could have used, beside what each one
       was actually asked to do. The pair is the point: "android attempted 0"
       means something different when android is not in `platforms` at all. */
    platforms,
    attempted,
    accepted,
  };

  /*
   * Leave a mark even when nothing happened — especially then.
   *
   * An empty outbox is the expected state on almost every day, so silence
   * cannot distinguish "ran and found nobody eligible" from "did not run".
   * Without this the streak saver could stop working in January and the first
   * evidence would be somebody asking why they never get notifications. See
   * 0108.
   */
  await supabase.rpc("note_cron_run", { _job: "streak-saver", _detail: summary });

  return NextResponse.json(summary);
}
