/* ============================================================================
   EDIAGD — server-side access guards
   SERVER ONLY (touches cookies via the Supabase server client). Never import
   this from a client component.
   ============================================================================ */

import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string | null;
  /** Dealer admin at one or more rooftops — scoped to those rooftops. */
  isAdmin: boolean;
  /** Platform owner (Ryan, Mitch) — sees every rooftop. A user property, not
   *  a membership role; see 0015. */
  isPlatformOwner: boolean;
  /** Either one may reach the admin tools. */
  hasAdminAccess: boolean;
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

  if (!user) {
    return {
      supabase,
      userId: null,
      isAdmin: false,
      isPlatformOwner: false,
      hasAdminAccess: false,
    };
  }

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("membership")
      .select("rooftop_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    // Readable under app_user_self; the flag is immutable to the user (0015).
    supabase
      .from("app_user")
      .select("is_platform_owner")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const isAdmin = Boolean(membership);
  const isPlatformOwner = Boolean(profile?.is_platform_owner);

  return {
    supabase,
    userId: user.id,
    isAdmin,
    isPlatformOwner,
    hasAdminAccess: isAdmin || isPlatformOwner,
  };
}
