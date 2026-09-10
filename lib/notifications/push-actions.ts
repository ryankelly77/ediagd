"use server";

/* ============================================================================
   EDIAGD — the four things the client may say about notifications

   Every one of these resolves the user from the session and takes no user id.
   Server Actions are reachable by direct POST, so "you can only ever change
   your own notification settings" has to be a property of the code rather than
   of the caller's good manners.

   All four are quiet on failure. Notifications are an enhancement; an advisor
   standing on a service drive should never see an error toast because a
   preference round-trip lost a race with a network handover.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** The soft-ask card was put in front of them. Spends one of their two. */
export async function noteSoftAskShown(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("record_soft_ask", { _answer: null });
}

/**
 * What they said to it.
 *
 * "yes" is recorded BEFORE the OS dialog appears, deliberately. What we are
 * recording is that they accepted OUR offer — whether iOS then grants
 * permission is Apple's business and a different fact, held by the presence or
 * absence of a token. Recording it after would lose the answer of anybody who
 * said yes and then dismissed the system dialog, and would ask them again.
 */
export async function answerSoftAsk(answer: "yes" | "not_now"): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("record_soft_ask", { _answer: answer });
  revalidatePath("/today");
}

/** The switch on /profile. Off stops the sends; the tokens are kept. */
export async function setPushEnabled(enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("set_push_enabled", { _enabled: enabled });
  revalidatePath("/profile");
}

/**
 * The deep link landed and the app is open.
 *
 * Stamps the send row for today, which is what makes an open attributable —
 * without it "they opened the app at 7:04pm" and "they opened the app because
 * we asked them to" are the same event.
 *
 * Idempotent in SQL: the first tap wins and a second does not move the time.
 */
export async function stampStreakSaverOpened(
  /* Which of the two streak messages was tapped. Defaults to the lunchtime
     one so existing callers keep their behaviour. */
  kind: "streak_keeper" | "streak_last_call" = "streak_keeper"
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  /*
   * No date argument. The STORE's today is resolved in SQL (0103) because a
   * browser answering with its own local date would look for a row that does
   * not exist — a 7pm send in Honolulu is already tomorrow in UTC — and the
   * failure would be invisible, reading as "nobody opens these".
   */
  await supabase.rpc("mark_push_opened", { _kind: kind });
}
