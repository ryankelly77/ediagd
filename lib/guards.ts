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

/**
 * The rooftops this caller MANAGES, and whether they may act everywhere.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT getAdminContext
 * ---------------------------------------------------------------------------
 * That guard asks whether somebody holds `admin` at any rooftop, which is how
 * global content editing is decided. The closure calendar is a different
 * question with a different answer: the service MANAGER at a store is the
 * person who knows whether it opens on Labor Day, and they are usually not an
 * admin anywhere.
 *
 * The set comes from managed_rooftops() itself rather than a query written to
 * resemble it. That function is what every RLS policy on rooftop_closed_day
 * uses, so asking it directly means the screen can never offer a rooftop the
 * database would then refuse the write for — and org-level group owners, who
 * hold no membership row at all, are included without this file knowing they
 * exist.
 *
 * PLATFORM OWNER SEES EVERY ROOFTOP, so Mitch can set up a dealer that has not
 * engaged yet. Same asymmetry the policies grant.
 */
export type ManagerContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string | null;
  /** Rooftop ids they manage. Empty for a platform owner — see `isPlatformOwner`. */
  managedRooftopIds: string[];
  isPlatformOwner: boolean;
  /** May reach the manager tools at all. */
  hasManagerAccess: boolean;
};

export async function getManagerContext(): Promise<ManagerContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      userId: null,
      managedRooftopIds: [],
      isPlatformOwner: false,
      hasManagerAccess: false,
    };
  }

  const [{ data: managed }, { data: profile }] = await Promise.all([
    supabase.rpc("managed_rooftops"),
    supabase.from("app_user").select("is_platform_owner").eq("id", user.id).maybeSingle(),
  ]);

  const isPlatformOwner = Boolean(profile?.is_platform_owner);

  /* A set-returning function comes back as rows of a scalar; PostgREST spells
     that either as bare values or as one-key objects depending on the call, so
     both shapes are read rather than assumed. */
  const ids = ((managed ?? []) as unknown[])
    .map((r) =>
      typeof r === "string" ? r : ((r as { managed_rooftops?: string })?.managed_rooftops ?? null)
    )
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  return {
    supabase,
    userId: user.id,
    managedRooftopIds: Array.from(new Set(ids)),
    isPlatformOwner,
    hasManagerAccess: isPlatformOwner || ids.length > 0,
  };
}
