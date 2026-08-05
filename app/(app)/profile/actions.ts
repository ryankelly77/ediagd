"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
// A "use server" module may only export async functions, so the limits and the
// result type live in lib/profile.ts.
import { NAME_MAX, PASSWORD_MIN, type ProfileResult } from "@/lib/profile";

/**
 * Server Actions are reachable by direct POST, so each of these re-resolves the
 * user from the session and validates its own input. Nothing trusts the client,
 * and no action takes a user id — you can only ever change your own account.
 */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/* ---- Display name -------------------------------------------------------- */

/**
 * Writes app_user.full_name for the signed-in user.
 *
 * This does NOT trip the platform-owner guard from 0015: that trigger only
 * raises when is_platform_owner actually changes value, and this update never
 * touches the column.
 */
export async function updateDisplayName(rawName: string): Promise<ProfileResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length === 0) return { ok: false, error: "Please enter a name." };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Keep it under ${NAME_MAX} characters.` };
  }

  const { error } = await supabase
    .from("app_user")
    .update({ full_name: name })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  // The header greeting and avatar initials read this, so refresh the shell too.
  revalidatePath("/", "layout");
  revalidatePath("/profile");
  return { ok: true, message: "Name updated." };
}

/* ---- Email --------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Starts an email change. Supabase does NOT switch the address immediately: it
 * emails a confirmation link, and the change lands only when that link is
 * clicked. The caller must not imply otherwise — see the returned message.
 *
 * There is no app_user.email column, so nothing needs syncing: the address
 * lives solely on auth.users and the app reads it from the session.
 */
export async function updateEmail(rawEmail: string): Promise<ProfileResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  if (email === user.email?.toLowerCase()) {
    return { ok: false, error: "That's already your email address." };
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  return {
    ok: true,
    message: `Check ${email} and click the confirmation link to finish the change. Your current address stays active until then.`,
  };
}

/* ---- Password ------------------------------------------------------------ */

export async function updatePassword(
  password: string,
  confirmation: string
): Promise<ProfileResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` };
  }
  if (password !== confirmation) {
    return { ok: false, error: "Those two passwords don't match." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  return { ok: true, message: "Password updated. It's active right away." };
}

/**
 * Supabase's auth errors are accurate but bleak. The ones worth translating are
 * the session-age failures: password changes can require a recent login, and
 * "sign out and back in" is the actionable instruction — not the raw message.
 */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("reauthentication") || lower.includes("nonce")) {
    return "For your security this needs a fresh sign-in. Sign out, sign back in, and try again.";
  }
  if (lower.includes("session") || lower.includes("jwt") || lower.includes("expired")) {
    return "Your session has expired. Sign out, sign back in, and try again.";
  }
  if (lower.includes("same as the old") || lower.includes("should be different")) {
    return "That's already your password — pick a new one.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Another account already uses that email address.";
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return "Too many attempts just now. Wait a minute and try again.";
  }
  return message;
}
