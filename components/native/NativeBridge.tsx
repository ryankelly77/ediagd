"use client";

/* ============================================================================
   EDIAGD — mounts the native shell's behaviour, and nothing at all in a browser

   One client component, mounted once in the app layout. In a normal tab every
   branch below short-circuits on `isNative()` and this renders null having done
   no work. Inside the shell it registers for push, forwards the token to
   Supabase, and turns notification taps and universal links into router
   navigations.

   WHY IT LIVES IN THE ROOT LAYOUT AND NOT THE (app) ONE. It was in (app) first,
   and that shipped a bug straight to the emulator: /login sits OUTSIDE that
   group, so on a cold launch to the login screen this never mounted, and with
   `launchAutoHide: false` the splash screen had nobody to hide it. The app
   opened to a permanent splash. A notification tap or a universal link can also
   arrive while signed out, and both need the listener to already exist.

   PUSH REGISTRATION IS GATED ON A SESSION, splash and deep links are not. There
   is no point asking a stranger on the login screen for notification permission
   — iOS only offers that prompt once — and register_push_token would fail
   without a session anyway.
   ============================================================================ */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  handleAppLinks,
  isNative,
  readyShell,
  registerForPush,
} from "@/lib/native/bridge";

export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let cleanupLinks: (() => void) | undefined;

    (async () => {
      if (!(await isNative())) return;

      const go = (route: string) => {
        if (!disposed) router.push(route);
      };

      /* Deep links and the splash must work signed out. Do them first, so a
         failure in the push path below can never leave the splash up. */
      cleanupLinks = await handleAppLinks(go);
      await readyShell();

      const supabaseAuth = createClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) return;

      /*
       * Token -> device_push_token, through the RPC in 0056 so RLS applies and
       * a token can never be registered against somebody else's account.
       *
       * Failure here is deliberately quiet. Push is an enhancement; an advisor
       * on the drive should never see an error toast because a token round-trip
       * lost a race with a network handover.
       */
      const result = await registerForPush(
        async (token, platform) => {
          const { error } = await supabaseAuth.rpc("register_push_token", {
            _token: token,
            _platform: platform,
          });
          if (error) console.error("[ediagd] register_push_token", error.message);
        },
        go
      );

      if (result === "denied") {
        // Not an error state. They can turn it on in Settings, and the app is
        // fully usable without it.
        console.info("[ediagd] push permission not granted");
      }

    })();

    return () => {
      disposed = true;
      cleanupLinks?.();
    };
  }, [router]);

  return null;
}
