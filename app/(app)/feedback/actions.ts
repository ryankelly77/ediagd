"use server";

/* ============================================================================
   EDIAGD — feedback submission

   The advisor sends body + an optional screenshot. EVERYTHING ELSE IS OURS and
   is attached here, from the session and the request, never from the form — so
   a report cannot claim a rooftop or a role that is not the sender's.

   ORDER AND FAILURE ISOLATION (the night-of-launch rule):
     1. the row      — the record. If this fails, the whole thing fails.
     2. Slack        — best effort. Keeps the promise when email cannot.
     3. email        — best effort. May be skipped entirely until the ediagd.ai
                       domain verifies at Resend; emailed_at stays null.
   Slack failing never blocks email, email failing never blocks the row, and none
   of the three failing after the row lands changes the advisor's "Got it."

   The insert runs as the SIGNED-IN ADVISOR (RLS insert-own is the real control).
   The rate-limit count and the best-effort timestamp stamps run as the service
   role, because an advisor cannot read feedback — not even their own.
   ============================================================================ */

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email/send";
import { postToSlack } from "@/lib/slack/send";

export type FeedbackResult = { ok: true } | { ok: false; error: string };

/** The team's inbox. */
const FEEDBACK_EMAIL_TO = "appdeveloper@peartreecompanies.com";
/** Per-advisor hourly cap, enforced here. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_BODY = 4000;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** A safe internal path for the `from` provenance, or /more as the default. */
function safeFrom(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  // Only an in-app path: must start with a single slash. Never an absolute URL,
  // never a protocol-relative "//host" that would record an off-site origin.
  return /^\/(?!\/)/.test(v) ? v.slice(0, 200) : "/more";
}

function storeLocalTime(timezone: string | null): string {
  // The server clock in the rooftop's zone. Not rooftop_today (date only) — a
  // report wants the moment, and "16:48" is what tells you it came in at close.
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone ?? "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

export async function submitFeedback(formData: FormData): Promise<FeedbackResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Add a note so we know what happened." };
  if (body.length > MAX_BODY) {
    return { ok: false, error: "That's a long one — trim it a little and send again." };
  }

  const service = createServiceClient();

  /* ---- Rate limit, before anything is written --------------------------- */
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recent } = await service
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((recent ?? 0) >= RATE_LIMIT) {
    return {
      ok: false,
      error: "Thanks — we've got your last few. Give us a little time, then send more if you need to.",
    };
  }

  /* ---- Context: everything that is ours, built server-side -------------- */
  const [{ data: membership }, { data: profile }, hdrs] = await Promise.all([
    service
      .from("membership")
      .select("rooftop_id, role, rooftop:rooftop_id(name, timezone)")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    service.from("app_user").select("full_name").eq("id", user.id).maybeSingle(),
    headers(),
  ]);

  const roof = (membership?.rooftop ?? null) as { name?: string; timezone?: string } | null;
  const rooftopId = (membership?.rooftop_id as string | null) ?? null;
  const fromRoute = safeFrom(formData.get("from"));

  // Platform / shell version come from the client bridge (App.getInfo is native-
  // only) — device metadata, not form content. The user agent is cross-checked
  // from the request so a spoofed platform is at least visible beside it.
  const clientPlatform = String(formData.get("platform") ?? "");
  const platform =
    clientPlatform === "ios" || clientPlatform === "android" ? clientPlatform : "web";
  const shellVersion = (String(formData.get("shellVersion") ?? "").trim() || null);
  const shellBuild = (String(formData.get("shellBuild") ?? "").trim() || null);

  const deploy = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null;

  const context = {
    email: user.email ?? null,
    display_name: profile?.full_name ?? null,
    rooftop_name: roof?.name ?? null,
    rooftop_id: rooftopId,
    membership_role: (membership?.role as string | null) ?? null,
    from_route: fromRoute,
    store_local_time: storeLocalTime(roof?.timezone ?? null),
    platform,
    shell_version: shellVersion,
    shell_build: shellBuild,
    user_agent: hdrs.get("user-agent") ?? null,
    deploy,
  };

  /* ---- The screenshot, if one came ------------------------------------- */
  // Generated here so the storage path is known before the insert and no RETURNING
  // is needed (an advisor has no select policy, so RETURNING would come back empty).
  const id = crypto.randomUUID();
  let screenshotPath: string | null = null;

  const file = formData.get("screenshot");
  if (file && typeof file === "object" && "size" in file && (file as File).size > 0) {
    const f = file as File;
    if (f.size > MAX_SCREENSHOT_BYTES) {
      return { ok: false, error: "That image is over 5 MB — pick a smaller one, or send without it." };
    }
    const ext = EXT_BY_TYPE[f.type];
    if (!ext) {
      return { ok: false, error: "That file isn't an image we can take — try a PNG or a JPG." };
    }
    const path = `${user.id}/${id}.${ext}`;
    // Uploaded as the signed-in advisor, so the insert-own bucket policy is the
    // control. A failed upload is not fatal: the words matter more than the shot.
    const bytes = new Uint8Array(await f.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("feedback")
      .upload(path, bytes, { contentType: f.type, upsert: false });
    if (upErr) {
      console.error("[feedback] screenshot upload failed", { userId: user.id, error: upErr });
    } else {
      screenshotPath = path;
    }
  }

  /* ---- 1. THE ROW — as the advisor, RLS insert-own --------------------- */
  const { error: insErr } = await supabase.from("feedback").insert({
    id,
    user_id: user.id,
    rooftop_id: rooftopId,
    body,
    screenshot_path: screenshotPath,
    context,
  });
  if (insErr) {
    // The raw Postgres error is for the log, not the advisor. Same discipline as
    // the onboarding fix: a constraint name never reaches the screen.
    console.error("[feedback] insert failed", { userId: user.id, error: insErr });
    return {
      ok: false,
      error: "We couldn't send that just now. Try once more, and if it still won't go, let your manager know.",
    };
  }

  // Everything below is best-effort and must not change the advisor's success.
  await notifyTeam({
    service,
    id,
    body,
    context,
    screenshotPath,
  });

  return { ok: true };
}

/* ---- 2 + 3. Slack, then email. Both best-effort, both stamped on success. */
async function notifyTeam({
  service,
  id,
  body,
  context,
  screenshotPath,
}: {
  service: ReturnType<typeof createServiceClient>;
  id: string;
  body: string;
  context: Record<string, unknown>;
  screenshotPath: string | null;
}): Promise<void> {
  const rooftop = (context.rooftop_name as string | null) ?? "No rooftop";
  const who = (context.display_name as string | null) ?? (context.email as string | null) ?? "Unknown";

  const contextLines = [
    `From: ${who} (${context.email ?? "no email"})`,
    `Rooftop: ${rooftop}${context.rooftop_id ? ` (${context.rooftop_id})` : ""}`,
    `Role: ${context.membership_role ?? "—"}`,
    `Screen: ${context.from_route}`,
    `When: ${context.store_local_time} (store local)`,
    `Platform: ${context.platform}${context.shell_version ? ` ${context.shell_version} (${context.shell_build ?? "?"})` : ""}`,
    `Deploy: ${context.deploy ?? "—"}`,
    `User agent: ${context.user_agent ?? "—"}`,
  ];

  /* ---- 2. Slack (best effort) ------------------------------------------ */
  const slackText = [
    `:speech_balloon: *EDIAGD feedback* — ${rooftop} · ${who}`,
    "",
    body,
    "",
    ...contextLines.map((l) => `• ${l}`),
  ].join("\n");
  const slack = await postToSlack(process.env.SLACK_FEEDBACK_WEBHOOK, slackText, "feedback-slack");
  if (slack.posted) {
    await service.from("feedback").update({ slack_posted_at: new Date().toISOString() }).eq("id", id);
  }

  /* ---- 3. Email (best effort; may be skipped until the domain verifies) - */
  // A signed link to the screenshot, good for seven days, minted by the service
  // role (the bucket is otherwise unreadable).
  let shotLink: string | null = null;
  if (screenshotPath) {
    const { data: signed } = await service.storage
      .from("feedback")
      .createSignedUrl(screenshotPath, 60 * 60 * 24 * 7);
    shotLink = signed?.signedUrl ?? null;
  }
  const emailText = [
    body,
    "",
    "—",
    ...contextLines,
    shotLink ? `Screenshot (7-day link): ${shotLink}` : "Screenshot: none",
  ].join("\n");
  const email = await sendEmail({
    to: FEEDBACK_EMAIL_TO,
    subject: `EDIAGD feedback: ${rooftop} · ${who}`,
    text: emailText,
  });
  if (email.sent) {
    await service.from("feedback").update({ emailed_at: new Date().toISOString() }).eq("id", id);
  }
}
