"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/guards";
import { validateGameSettings, type GameSettingsValues } from "@/lib/game-settings";

export type SaveSettingsResult =
  | { ok: true; values: GameSettingsValues }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

/**
 * Update the single game_settings row.
 *
 * RLS (0011) already restricts writes to admins, but Server Functions are
 * reachable by direct POST, so this re-checks admin the same way the CMS
 * actions do. Defence in depth, not decoration.
 */
export async function saveGameSettings(
  values: GameSettingsValues
): Promise<SaveSettingsResult> {
  const ctx = await getAdminContext();
  if (!ctx.userId) return { ok: false, error: "You need to sign in." };
  if (!ctx.isAdmin) return { ok: false, error: "Admins only." };

  const { fieldErrors, clean } = validateGameSettings(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  // Single-row table: id = true is enforced by a check constraint, so this
  // updates in place and can never insert a second row.
  const { data, error } = await ctx.supabase
    .from("game_settings")
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: "No settings row found to update.",
    };
  }

  revalidatePath("/admin/settings");
  return { ok: true, values: clean };
}
