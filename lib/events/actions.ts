"use server";

/* ============================================================================
   EDIAGD — the two Rollcall events a browser is allowed to ask for
   SERVER ONLY. A "use server" module may only export async functions; the
   types and the whitelist live in lib/events/kinds.ts.

   ---------------------------------------------------------------------------
   WHY A BROWSER HAS TO ASK AT ALL, WHEN THE PAGES ARE SERVER COMPONENTS
   ---------------------------------------------------------------------------
   The obvious build is to write the event inside the page's own server render.
   It is wrong, and the reason is the prefetch: Next renders a route's RSC
   payload when a <Link> to it comes into view, so /certifications — which is
   on the tab bar of every signed-in screen — would record an open every time
   anybody looked at any page. "Certs opened: 112" for somebody who has never
   tapped it is the confident-wrong-answer shape this project keeps meeting.

   So the event is fired from a CLIENT component's mount effect
   (components/events/RecordOpen.tsx). A prefetch does not mount anything, so
   it cannot log. That is a construction in which the unsafe state is not
   representable, rather than a convention somebody has to remember on the
   next page they add.

   ---------------------------------------------------------------------------
   THE USER AND THE ROOFTOP COME FROM THE SESSION. ALWAYS.
   ---------------------------------------------------------------------------
   No userId parameter, for the same reason completeLibraryItem has none: a
   server action is reachable by direct POST, and an id parameter would be a
   "write an event in anybody's name" endpoint. The kind is accepted from the
   caller but only from a four-item whitelist, and the target is accepted only
   if it is shaped like a uuid. See the trust-boundary note in kinds.ts.
   ============================================================================ */

import { createClient } from "@/lib/supabase/server";
import { recordEvent, recordSignIn } from "@/lib/events/record";
import { asTargetId, isClientOpenKind, isSignInPlatform } from "@/lib/events/kinds";

/**
 * The signed-in user and the rooftop their events count against.
 *
 * ANY active membership will do, which is the same rule completeLibraryItem
 * applies: a person at two stores is one person, and the first active
 * membership is the one every other surface already uses for them.
 */
async function viewer(): Promise<{ userId: string; rooftopId: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  return {
    userId: user.id,
    rooftopId: (membership?.rooftop_id as string | null) ?? null,
  };
}

/**
 * Somebody opened Certs, a track, the library, or a module.
 *
 * Returns void and never throws: the caller is a mount effect with nothing to
 * do with the answer, and a failed event must not surface anywhere near a
 * person reading a lesson.
 */
export async function recordOpen(kind: string, targetId?: string | null): Promise<void> {
  try {
    /* A kind that is not one of the four is DROPPED, not coerced to a default.
       A default would file somebody's forged POST under a real column. */
    if (!isClientOpenKind(kind)) {
      console.warn(`[rollcall] refused an open event for unknown kind ${JSON.stringify(kind)}`);
      return;
    }

    const who = await viewer();
    if (!who) return;

    await recordEvent({
      userId: who.userId,
      rooftopId: who.rooftopId,
      kind,
      targetId: asTargetId(targetId),
    });
  } catch (error) {
    console.error("[rollcall] recordOpen threw", error);
  }
}

/**
 * Somebody has the app open, and this is the shell it is running in.
 *
 * The platform is the ONE fact the server cannot derive for itself — only the
 * shell knows whether it is a shell (lib/native/bridge.ts), and the user agent
 * of a Capacitor webview is a Safari one. So it is accepted from the client,
 * validated against three literals, and is the only thing this action takes.
 *
 * A caller claiming `ios` from a desktop browser would move one person into
 * the installed column. Accepted, and said out loud in the Rollcall header:
 * this column is a proxy for a TestFlight install, and App Store Connect is
 * the record.
 */
export async function recordSignInPing(platform: string): Promise<void> {
  try {
    if (!isSignInPlatform(platform)) {
      console.warn(`[rollcall] refused a sign-in ping for platform ${JSON.stringify(platform)}`);
      return;
    }

    const who = await viewer();
    if (!who) return;

    await recordSignIn(who.userId, who.rooftopId, platform);
  } catch (error) {
    console.error("[rollcall] recordSignInPing threw", error);
  }
}
