"use client";

/* ============================================================================
   EDIAGD — mounts the native shell's behaviour, and nothing at all in a browser

   One client component, mounted once in the app layout. In a normal tab every
   branch below short-circuits on `isNative()` and this renders null having done
   no work. Inside the shell it registers for push, forwards the token to
   Supabase, and turns notification taps and universal links into router
   navigations.

   WHY IT LIVES IN THE LAYOUT RATHER THAN A PAGE. A notification tap can land on
   any route, and the listener has to already exist when it does. Mounting it
   per-page would mean the first tap after a cold start is dropped.
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

      /*
       * Token -> device_push_token, through the RPC in 0056 so RLS applies and
       * a token can never be registered against somebody else's account.
       *
       * Failure here is deliberately quiet. Push is an enhancement; an advisor
       * on the drive should never see an error toast because a token round-trip
       * lost a race with a network handover.
       */
      const supabase = createClient();
      const result = await registerForPush(
        async (token, platform) => {
          const { error } = await supabase.rpc("register_push_token", {
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

      cleanupLinks = await handleAppLinks(go);
      await readyShell();
    })();

    return () => {
      disposed = true;
      cleanupLinks?.();
    };
  }, [router]);

  return null;
}
