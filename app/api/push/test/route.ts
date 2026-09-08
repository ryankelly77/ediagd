/* ============================================================================
   EDIAGD — send a real notification to your own phone, on demand

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
import { isApnsConfigured, sendToTokens } from "@/lib/notifications/apns";
import { PUSH_COPY } from "@/lib/notifications/push-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
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

  if (!isApnsConfigured()) {
    return NextResponse.json({
      ok: false,
      reason:
        "APNs is not configured — check APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY_P8 " +
        "are set in Vercel and that the deployment was rebuilt after adding them.",
    });
  }

  /* Service role to read tokens: the RLS policy on device_push_token is
     select-own, which would work, but the worker path reads them this way and a
     test should exercise the same route the real send does. */
  const service = createServiceClient();
  const { data: devices } = await service
    .from("device_push_token")
    .select("token, platform, last_seen")
    .eq("user_id", user.id)
    .is("retired_at", null);

  if (!devices || devices.length === 0) {
    return NextResponse.json({
      ok: false,
      reason:
        "No live device on file for you. Open the app in the shell and turn " +
        "Streak reminders on in /profile, then allow the iOS prompt.",
    });
  }

  /* The REAL copy, with a real streak number substituted, so what arrives on
     the lock screen is exactly what an advisor would see. */
  const copy = PUSH_COPY.streak_keeper;
  const results = await sendToTokens(
    devices.map((d) => d.token as string),
    {
      title: copy.title.replace("{days}", "7"),
      body: copy.body,
      deepLink: copy.deepLink,
    }
  );

  return NextResponse.json({
    ok: [...results.values()].some((r) => r.ok),
    devices: devices.length,
    results: [...results.entries()].map(([token, r]) => ({
      device: token.slice(-6),
      ok: r.ok,
      status: r.status,
      reason: r.reason ?? null,
    })),
  });
}
