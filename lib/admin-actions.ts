"use server";

/* ============================================================================
   EDIAGD — admin writes
   SERVER ONLY.

   NOTE: a "use server" module may only export async functions.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Recompute the engagement rollup now instead of waiting for 08:00 UTC.
 *
 * Called with the CALLER'S session, never the service role — that is what makes
 * it safe to hand to a form. refresh_engagement_rollup() (0028) refuses anyone
 * who is not the platform owner, so authorisation lives in one place in the
 * database rather than being re-decided here; a direct POST from an advisor
 * gets the same refusal this does.
 *
 * It exists because a freshly seeded or edited dataset is otherwise invisible
 * until the next overnight run, which would make the screen untestable.
 *
 * Takes no arguments so it can be passed straight to <form action={...}>, and
 * throws rather than failing quietly: a recalculation that silently did nothing
 * is worse than an error, because the stale numbers look like fresh ones.
 */
export async function refreshEngagementRollup(): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase.rpc("refresh_engagement_rollup");
  if (error) throw new Error(`Could not recalculate engagement: ${error.message}`);

  revalidatePath("/admin/engagement");
}
