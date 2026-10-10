/* ============================================================================
   EDIAGD — the twice-daily Rollcall post to #ediagd

   Ryan, 6 October: the six facts per advisor, and "Slack it to #ediagd too".

   ---------------------------------------------------------------------------
   THE SCHEDULE, AND THE DST CAVEAT IT CARRIES
   ---------------------------------------------------------------------------
   vercel.json: `30 12,22 * * *`. That is 07:30 and 17:30 CENTRAL DAYLIGHT time
   (UTC-5). Vercel crons are UTC and do not observe DST, so from the first
   Sunday in November to the second Sunday in March they fire at 06:30 and
   16:30 Central.

   ACCEPTED RATHER THAN WORKED AROUND, and the comparison is the argument:
   streak-saver runs HOURLY and asks every rooftop what time it is there,
   because a notification promised at 7pm is wrong at any other hour. This is a
   status post into a team channel. An hour's winter drift costs nothing, and a
   second hourly cron to avoid it would be twenty-four invocations a day for a
   message sent twice. There is no note in vercel.json itself because Vercel
   validates that file against its schema and rejects keys it does not know.

   If it ever does need to be exact, the fix is the streak-saver shape — run
   hourly, compare each rooftop's local clock — and not a second schedule,
   which would mean two sources of truth about when the post goes out.

   ---------------------------------------------------------------------------
   THE SCREEN AND THIS MESSAGE READ THE SAME LOADER
   ---------------------------------------------------------------------------
   loadRollcall, once, for both. A hand-rolled aggregation for the message
   would be a second answer to the same question — and the one nobody opens is
   the one that drifts, which is how a confident wrong number gets into a
   channel twice a day with nobody checking it against the screen.

   ---------------------------------------------------------------------------
   THE SERVICE CLIENT, AND WHY THAT IS NOT A HOLE
   ---------------------------------------------------------------------------
   There is no session here, so RLS cannot be the scope and the rooftop filter
   IS the scope. app_event_rollcall is security_invoker, which means it obeys
   app_event's policy for a session role and is bypassed by the service role —
   so this route must name its rooftop explicitly and does, every time. It
   never loads "everything the policies allow", because for this caller that
   is everything.

   ---------------------------------------------------------------------------
   THE ROOFTOP COMES FROM A UUID, NEVER FROM A NAME
   ---------------------------------------------------------------------------
   `?rooftop=<uuid>` for an ad-hoc run, else ROLLCALL_ROOFTOP_ID. There is
   deliberately no "find the store called Beaumont" fallback: a name match
   returns the wrong row without erroring, and membership.op_code_id already
   pointed four accounts at other people's books that way. Nor is there a
   "whichever store has the most accounts" fallback, which would silently
   re-target the post the week a second store onboards.

   With neither set this REFUSES — 503, and the heartbeat records why. An
   unconfigured job that returned 200 would report success for doing nothing,
   which is the one failure mode this project can least afford.

   ---------------------------------------------------------------------------
   "WHAT CHANGED" IS KEYED ON THE LAST SUCCESSFUL POST, NOT THE LAST RUN
   ---------------------------------------------------------------------------
   cron_heartbeat.ran_at moves on every run, including one where Slack was
   unreachable. If "since" were ran_at, a failed post would swallow the window
   it failed to report and the next message would say "nothing new" about
   changes nobody had been told. So the instant is kept in the heartbeat's
   detail and only advanced when postToSlack actually returned posted: true.
   ============================================================================ */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { postToSlack } from "@/lib/slack/send";
import { loadRollcall, loadRollcallChanges } from "@/lib/rollcall";
import { buildRollcallMessage } from "@/lib/rollcall-message";
import { isUuid } from "@/lib/events/kinds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel signs its own cron invocations with CRON_SECRET when that variable
 * exists. Without the variable this endpoint would be an unauthenticated way
 * to make the app post a roster of names into Slack, so a missing secret is a
 * refusal rather than a default-open. Copied from streak-saver deliberately —
 * one protection shape for every cron.
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

  const url = new URL(request.url);
  const asked = url.searchParams.get("rooftop");
  const configured = process.env.ROLLCALL_ROOFTOP_ID;
  const rooftopId = (asked || configured || "").trim();

  const supabase = createServiceClient();

  if (!isUuid(rooftopId)) {
    const detail = {
      posted: false,
      reason: asked
        ? "the ?rooftop= parameter is not a uuid"
        : "ROLLCALL_ROOFTOP_ID is not set, or is not a uuid",
    };
    /* The heartbeat still gets written, because "did not run" and "ran and
       refused" are the two explanations 0108 exists to separate. */
    await supabase.rpc("note_cron_run", { _job: "rollcall", _detail: detail });
    return NextResponse.json(detail, { status: 503 });
  }

  /* The rooftop's own name and zone, read before anything else — a message
     headed with the wrong store is worse than no message. */
  const { data: rooftop } = await supabase
    .from("rooftop")
    .select("id, name, timezone")
    .eq("id", rooftopId)
    .maybeSingle();

  if (!rooftop) {
    const detail = { posted: false, reason: `no rooftop with id ${rooftopId}` };
    await supabase.rpc("note_cron_run", { _job: "rollcall", _detail: detail });
    return NextResponse.json(detail, { status: 503 });
  }

  /* ---- The last successful post, from the heartbeat's detail ------------- */
  const { data: heartbeat } = await supabase
    .from("cron_heartbeat")
    .select("ran_at, detail")
    .eq("job", "rollcall")
    .maybeSingle();

  const previousPostedAt =
    typeof (heartbeat?.detail as Record<string, unknown> | null)?.posted_at === "string"
      ? new Date((heartbeat!.detail as Record<string, string>).posted_at)
      : null;
  const since =
    previousPostedAt && !Number.isNaN(previousPostedAt.getTime()) ? previousPostedAt : null;

  // ---- The roll ------------------------------------------------------------
  const rollcall = await loadRollcall(supabase, rooftopId);

  const changes = since
    ? await loadRollcallChanges(
        supabase,
        rooftopId,
        since,
        rollcall.rows.map((r) => r.userId)
      )
    : new Map();

  const now = new Date();
  const message = buildRollcallMessage({
    rollcall,
    rooftopName: rooftop.name as string,
    timezone: (rooftop.timezone as string | null) ?? null,
    now,
    since,
    changes,
  });

  // ---- Post ---------------------------------------------------------------
  const slack = await postToSlack(
    process.env.SLACK_ROLLCALL_WEBHOOK,
    message.text,
    "rollcall-slack"
  );

  /*
   * THE SUMMARY IS COMPUTED FROM WHAT HAPPENED, and the status code is a
   * function of it. ingest-videos.ts printed "Mux is transcoding" over 102
   * failures and exited 0; a line that would print unchanged on the failure
   * path is decoration.
   *
   * posted_at only moves on a real post — see the header. On a failure it
   * keeps the previous value, so the window this run could not report is
   * reported by the next one.
   */
  const detail = {
    posted: slack.posted,
    reason: slack.posted ? null : slack.reason,
    rooftop_id: rooftopId,
    rooftop: rooftop.name,
    accounts: rollcall.total,
    installed: rollcall.nativeInstalled,
    onboarded: rollcall.onboarded,
    completed_today: rollcall.today ? rollcall.completedToday : null,
    listed: message.listed,
    dropped: message.dropped,
    changed: message.changed,
    since: since?.toISOString() ?? null,
    posted_at: slack.posted
      ? now.toISOString()
      : (previousPostedAt?.toISOString() ?? null),
  };

  await supabase.rpc("note_cron_run", { _job: "rollcall", _detail: detail });

  /*
   * A 502 when Slack refused, not a 200 with a sad note. The row is not the
   * record here — the MESSAGE is the deliverable, and the only honest status
   * for "the deliverable did not go" is a failure the platform will show.
   * `no_url` is the same thing: until Ryan sets the webhook, this job is not
   * doing its job and should not report that it is.
   */
  return NextResponse.json(detail, { status: slack.posted ? 200 : 502 });
}
