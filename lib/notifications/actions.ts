"use server";

/* ============================================================================
   EDIAGD — notification writes
   SERVER ONLY. A "use server" module may only export async functions.

   The only thing a recipient may change about a notification is whether they
   have read it — 0030's update policy allows nothing else, so even a forged
   POST cannot rewrite the message.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Mark everything in the caller's inbox as read. */
export async function markAllRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // No recipient filter: RLS restricts the update to this user's own rows, and
  // adding an id parameter here would create the "mark anyone's mail read"
  // endpoint that not having one avoids.
  const { error } = await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw new Error(`Could not update notifications: ${error.message}`);

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

/** In-app / email / both. Only in-app is wired; the preference is stored now. */
export async function setNotificationChannel(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const channel = String(formData.get("channel") ?? "in_app");
  if (!["in_app", "email", "both"].includes(channel)) {
    throw new Error("Unknown delivery channel.");
  }

  const { error } = await supabase
    .from("notification_pref")
    .upsert({ user_id: user.id, channel, updated_at: new Date().toISOString() });

  if (error) throw new Error(`Could not save preference: ${error.message}`);
  revalidatePath("/notifications");
}
