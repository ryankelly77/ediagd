"use client";

/* ============================================================================
   EDIAGD — catch an auth credential that landed on the wrong screen

   ---------------------------------------------------------------------------
   WHAT GOES WRONG WITHOUT THIS
   ---------------------------------------------------------------------------
   Supabase only redirects to URLs on its allow-list. Anything else silently
   falls back to the project's Site URL — no error, no warning, just a different
   destination. Traced with curl against a real invite:

     …/auth/v1/verify?token=…&type=invite&redirect_to=…/reset-password
       -> https://app.ediagd.ai#access_token=…&type=invite

   The root, not /reset-password. The root has no handler for a credential in
   the hash, so it does what it does for anybody without a session: sends them
   to /login. The invite dies there, and the person who was invited sees a
   sign-in form asking for a password they have never set.

   That is precisely how Tracie's invite would have failed — and it would have
   looked like she did something wrong.

   ---------------------------------------------------------------------------
   WHY THE APP FIXES IT RATHER THAN THE CONSOLE
   ---------------------------------------------------------------------------
   Adding /reset-password to the allow-list would also work, and it should still
   be done. But a product whose account recovery depends on a setting in a
   dashboard — one that fails silently and identically to a dozen other causes —
   is a product with a trapdoor in it. The Site URL is allow-listed by
   definition; anything that lands there can be forwarded from here.

   ---------------------------------------------------------------------------
   WHAT IT WILL NOT TOUCH
   ---------------------------------------------------------------------------
   Only a hash carrying BOTH an access token and an invite/recovery type, and
   only when it is not already on the screen that handles it. A normal session
   has no such hash; an OAuth return has a different one. The hash is carried
   across verbatim rather than parsed — the screen that consumes it knows its
   own shapes, and re-encoding somebody's credential in transit is a way to
   corrupt it.
   ============================================================================ */

import { useEffect } from "react";

const HANDLER = "/reset-password";

export function AuthHashRouter() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const type = params.get("type");
    const hasCredential = params.has("access_token") || params.has("token_hash");

    if (!hasCredential) return;
    if (type !== "invite" && type !== "recovery") return;
    if (window.location.pathname === HANDLER) return;

    /* replace(), not push(): the URL that carried the credential should not be
       somewhere the back button can return to — the token is single-use and
       going back would land on a page that can no longer do anything. */
    window.location.replace(`${HANDLER}${hash}`);
  }, []);

  return null;
}
