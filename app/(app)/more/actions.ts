"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Ends the session and returns the user to the login screen. */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
