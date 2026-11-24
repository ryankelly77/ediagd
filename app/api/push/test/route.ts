/* ============================================================================
   EDIAGD — send a real notification to your own phone, on demand

   ---------------------------------------------------------------------------
   BOTH PLATFORMS NOW, AND THE DEFAULT IS BOTH
   ---------------------------------------------------------------------------
   This used to end `.eq("platform", "ios")` because APNs was the only
   transport. There are two now, and the route takes every live device the
   caller has unless a body names one platform. Defaulting to BOTH rather than
   to iOS is the whole value of the button: the question being asked is "does
   push work for me", and an answer scoped to one handset while the other sits
   silent is the scoped measurement reported as a general one that this
   codebase keeps paying for.

   Each device's line names its platform and the provider that answered it, so
   "it worked" and "it worked on the phone you are holding" stay different
   facts.

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   The streak saver is deliberately almost impossible to trigger: it needs a
   live streak of two or more, on a scheduled work day, before the day is
   finished, inside a one-hour window at the store's clock. That is the feature
   working — and it means the first time anybody sees whether APNs is wired up
   correctly would otherwise be a real 7pm send to a real advisor.

   The parts that can silently be wrong are all in the transport: a mistyped Key
   ID, a .p8 pasted without its BEGIN/END lines, the sandbox host against a
   TestFlight build. Every one of those fails as "no notification arrived",
   which is indistinguishable from "nobody was eligible".

   So this sends a real push, through the real APNs path, to the caller's own
   devices, and RETURNS APPLE'S ANSWER for each one. A wrong key stops being a
   mystery and becomes a line of JSON saying InvalidProviderToken.

   ---------------------------------------------------------------------------
   THE LIMITS ARE THE POINT
   ---------------------------------------------------------------------------
   Platform owner only, and it can only ever send to the CALLER's own tokens —
   there is no recipient parameter, so this cannot be turned into a way to buzz
   somebody else. It writes nothing to the outbox, so a test can never consume
   an advisor's one notification for the day or appear in the effect numbers.
   ============================================================================ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  configuredPlatforms,
  describePushTransports,
  isAnyTransportConfigured,
  sendPush,
} from "@/lib/notifications/push-send";
import { PUSH_COPY } from "@/lib/notifications/push-copy";

/** `{"platform":"android"}` narrows the send; anything else means every device. */
const TARGETS = ["ios", "android", "all"] as const;
type Target = (typeof TARGETS)[number];

/**
 * The body is optional and a bad one is not a failure.
 *
 * The existing button posts no body at all and must keep working, so an
 * unreadable or absent body means "all" rather than a 400. A VALUE that is not
 * a known target is different — that is somebody asking for something specific
 * and getting something else — so it is refused by name below.
 */
async function readTarget(
  request: Request
): Promise<{ target: Target } | { bad: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { target: "all" };
  }
  const raw = (body as { platform?: unknown } | null)?.platform;
  if (raw === undefined || raw === null) return { target: "all" };
  if (typeof raw === "string" && (TARGETS as readonly string[]).includes(raw)) {
    return { target: raw as Target };
  }
  return { bad: String(raw).slice(0, 40) };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* The default is ten seconds. A TLS handshake to Apple that never completes
   would otherwise be killed mid-flight and answer with an empty 500, which is
   the least informative failure this route can produce. */
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: me } = await supabase
    .from("app_user")
    .select("is_platform_owner")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_platform_owner) {
    return NextResponse.json({ error: "platform owner only" }, { status: 403 });
  }

  const wanted = await readTarget(request);
  if ("bad" in wanted) {
    return NextResponse.json({
      ok: false,
      reason:
        `"${wanted.bad}" is not a platform. Send no body for every device, or ` +
        `{"platform":"ios"} / {"platform":"android"} for one.`,
    });
  }
  const target = wanted.target;

  if (!isAnyTransportConfigured()) {
    return NextResponse.json({
      ok: false,
      reason:
        "No push transport is configured — APNs needs APNS_KEY_ID, APNS_TEAM_ID " +
        "and APNS_KEY_P8; Firebase needs FCM_PROJECT_ID, FCM_CLIENT_EMAIL and " +
        "FCM_PRIVATE_KEY. Set them in Vercel Production and redeploy; a Preview " +
        "deployment refuses to send even with every variable present.",
      config: await describePushTransports(),
    });
  }

  /* Service role to read tokens: the RLS policy on device_push_token is
     select-own, which would work, but the worker path reads them this way and a
     test should exercise the same route the real send does. */
  const service = createServiceClient();
  let query = service
    .from("device_push_token")
    .select("token, platform, last_seen")
    .eq("user_id", user.id)
    .is("retired_at", null);
  /*
   * NOT narrowed by default. 0106 added `.eq("platform","ios")` here because
   * Apple was the only transport and an Android token earned a guaranteed
   * BadDeviceToken. There are two transports now, so the filter's job has moved
   * into push-send.ts, which picks a provider per device and refuses a platform
   * it has no sender for BY NAME rather than dropping it.
   */
  if (target !== "all") query = query.eq("platform", target);
  const { data: devices } = await query;

  if (!devices || devices.length === 0) {
    const which = target === "all" ? "device" : `${target} device`;
    return NextResponse.json({
      ok: false,
      reason:
        `No live ${which} on file for you. Open the app in the installed shell ` +
        `on the phone itself — not a browser, not a simulator or emulator — and ` +
        `turn Streak reminders on in /profile, then allow the system prompt. ` +
        `On Android 13 and up that prompt is a separate permission and a "don't ` +
        `allow" there leaves the registration with no token.`,
      config: await describePushTransports(),
    });
  }

  /* The REAL copy, with a real streak number substituted, so what arrives on
     the lock screen is exactly what an advisor would see. */
  const copy = PUSH_COPY.streak_keeper;
  const results = await sendPush(
    devices.map((d) => ({
      token: d.token as string,
      platform: d.platform as "ios" | "android",
    })),
    {
      title: copy.title.replace("{days}", "7"),
      body: copy.body,
      deepLink: copy.deepLink,
    }
  );

  return NextResponse.json({
    ok: [...results.values()].some((r) => r.ok),
    devices: devices.length,
    target,
    /* What this deployment could have reached, beside what it tried. An
       all-platforms send that found only an iPhone looks identical to a
       working Android transport unless both are stated. */
    configuredPlatforms: configuredPlatforms(),
    config: await describePushTransports(),
    results: [...results.entries()].map(([token, r]) => ({
      device: token.slice(-6),
      platform: r.platform,
      transport: r.transport,
      ok: r.ok,
      status: r.status,
      reason: r.reason ?? null,
    })),
  });

  /*
   * NOTHING MAY ESCAPE THIS HANDLER.
   *
   * An unhandled throw in a Next route handler answers 500 with an empty body,
   * and that is exactly what happened the first time this ran: a real, specific
   * error about the signing key arrived at the phone as nothing at all. A
   * diagnostic endpoint that can fail silently is worse than no endpoint,
   * because it makes the configuration look fine.
   */
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: `Server error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
        /* The describe call is awaited inside a catch, so it must not be able
           to throw on its own. Both halves return a plain object on every
           path, including "not configured". */
        config: await describePushTransports(),
      },
      { status: 200 }
    );
  }
}
