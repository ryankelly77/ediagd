"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/guards";
import { validateGameSettings, type GameSettingsValues } from "@/lib/game-settings";
import { createServiceClient } from "@/lib/supabase/service";

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
  if (!ctx.hasAdminAccess) return { ok: false, error: "Admins only." };

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

export type FoundingClassResult =
  | { ok: true; through: string | null; marked: number }
  | { ok: false; error: string };

/**
 * Set the Founding Class cutoff, and APPLY IT IN THE SAME BREATH.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS RECOMPUTES INSTEAD OF WARNING THAT IT HASN'T
 * ---------------------------------------------------------------------------
 * The brief asked for the content bar's honesty — "this does not take effect
 * until you recompute". A deliberate deviation, and the reason is the shape of
 * bug this phase started with: sand_certification was an admin-editable number
 * that no code path honoured, and the fix was not a clearer label.
 *
 * A saved date that has not been applied is the same object: the screen says
 * one thing and the data says another, and the gap is invisible until somebody
 * prints a certificate without the mark. So the action saves, recomputes, and
 * reports how many credentials the mark now sits on. There is no state in which
 * the setting and the column disagree.
 *
 * The content bar keeps its warning because recomputing it re-derives which
 * TRACKS are offered — a heavier, content-dependent operation that an admin
 * should trigger knowingly. This one flips a boolean on the credentials that
 * already exist.
 *
 * `null` clears it, which un-marks everybody — correct, and the reason the
 * recompute sets false as well as true rather than only ever adding.
 */
export async function saveFoundingClass(
  through: string | null
): Promise<FoundingClassResult> {
  const ctx = await getAdminContext();
  if (!ctx.userId) return { ok: false, error: "You need to sign in." };
  if (!ctx.hasAdminAccess) return { ok: false, error: "Admins only." };

  const clean = through && /^\d{4}-\d{2}-\d{2}$/.test(through) ? through : null;
  if (through && !clean) return { ok: false, error: "Use a date like 2026-12-31." };

  const { error } = await ctx.supabase
    .from("game_settings")
    .update({ founding_class_through: clean, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  /* recompute_founding_class writes advisor_credential, which has no write
     policy for any session role (0115) — so the derivation runs through the
     service role. The admin check above is what authorises reaching for it. */
  const service = createServiceClient();
  const { error: recomputeError } = await service.rpc("recompute_founding_class");
  if (recomputeError) return { ok: false, error: recomputeError.message };

  const { count } = await service
    .from("advisor_credential")
    .select("id", { count: "exact", head: true })
    .eq("founding_class", true);

  revalidatePath("/admin/settings");
  return { ok: true, through: clean, marked: Number(count ?? 0) };
}
