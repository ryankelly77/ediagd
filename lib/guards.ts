/* ============================================================================
   EDIAGD — server-side access guards
   SERVER ONLY (touches cookies via the Supabase server client). Never import
   this from a client component.
   ============================================================================ */

import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string | null;
  isAdmin: boolean;
};

/**
 * Resolve the caller and whether they hold `admin` at ANY rooftop.
 *
 * That mirrors the content_admin_all policy in 0010: global content editing is
 * really a platform power, and admin-anywhere is how the database currently
 * decides it. When that tightens to a dedicated content-editor role, this is
 * the one place to change.
 */
export async function getAdminContext(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, userId: null, isAdmin: false };

  const { data } = await supabase
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  return { supabase, userId: user.id, isAdmin: Boolean(data) };
}
