/* ============================================================================
   EDIAGD — the app noticing that somebody opened it
   SERVER ONLY.

   ---------------------------------------------------------------------------
   daily_activity STOPPED FILLING AND NOBODY NOTICED
   ---------------------------------------------------------------------------
   The engagement screens read it; the seed scripts were the only thing that
   ever wrote it. Round B verified that and the table has not gained a row since
   31 July — so "days they opened the app" has been answering with a fossil, and
   answering confidently, which is the part that matters. A screen that says
   "last seen 31 Jul" about somebody who used the app this morning is worse than
   one that says nothing.

   ---------------------------------------------------------------------------
   DERIVED, NOT COUNTED
   ---------------------------------------------------------------------------
   `videos_watched` is computed from content_progress — the rows the player
   already writes — rather than incremented by a second counter alongside it.
   Two counters for one fact drift, and the one nobody looks at drifts silently;
   there is no way to tell which is right afterwards, because both are just
   numbers in a column.

   ---------------------------------------------------------------------------
   THE SERVICE CLIENT, DELIBERATELY
   ---------------------------------------------------------------------------
   0081 removed daily_activity's self-write policy: a user who could write their
   own engagement row could manufacture a record of turning up. The table now
   has exactly one policy, a team READ. So this writes as the service role, from
   the server, keyed to the session's own user id — the id is never taken from a
   caller.
   ============================================================================ */

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { storeToday } from "@/lib/mapping/epoch";

/**
 * Record that this user opened the app today, at their store's date.
 *
 * ROLE-BLIND ON PURPOSE. An advisor, a manager and a technician all open the
 * app and all should appear in engagement; nothing here asks what they are.
 *
 * NEVER THROWS. This is bookkeeping attached to rendering a page — if it fails,
 * the page still owes the person their screen. A missing engagement row costs a
 * tick on an admin chart; an exception here costs somebody their morning.
 */
export async function markActiveToday(
  userId: string,
  rooftopId: string
): Promise<void> {
  try {
    if (!userId || !rooftopId) return;
    const service = createServiceClient();

    /* The ROOFTOP's date. Engagement is counted in store-days everywhere else,
       and a Hawaii store rolling over at a different instant from an Ohio one
       is the whole reason rooftop_today exists. */
    const { data: todayRaw } = await service.rpc("rooftop_today", {
      _rooftop: rooftopId,
    });
    const today = (todayRaw as string | null) ?? storeToday();

    /*
     * Videos watched today, from the player's own records. `updated_at` is
     * touched by record_watch_progress on every write, so a row that moved
     * today was watched today.
     */
    const { count: watched } = await service
      .from("content_progress")
      .select("content_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("updated_at", `${today}T00:00:00Z`);

    /*
     * UPSERT ON THE NATURAL KEY. First load of the day inserts; every later
     * load refreshes the derived count. `logged_in` only ever becomes true —
     * there is no path that unsets it, because opening the app is not
     * undoable.
     */
    await service.from("daily_activity").upsert(
      {
        user_id: userId,
        rooftop_id: rooftopId,
        activity_date: today,
        logged_in: true,
        videos_watched: Number(watched ?? 0),
      },
      { onConflict: "user_id,activity_date" }
    );
  } catch {
    /* Deliberately silent — see the note above. */
  }
}
