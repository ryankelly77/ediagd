/* ============================================================================
   EDIAGD — who may see admin-only screens
   Server-side. Takes a client so it works with either the caller's session
   client (RLS applies) or the service role.
   ============================================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/**
 * True for a rooftop admin or the platform owner.
 *
 * Used to gate the design previews. They render app chrome with fabricated
 * data, so they must never be reachable by an advisor — a preview of the badge
 * celebration would look exactly like earning one.
 */
export async function isAdminViewer(client: Client, userId: string): Promise<boolean> {
  const [{ data: adminMemberships }, { data: profile }] = await Promise.all([
    client
      .from("membership")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .eq("active", true)
      .limit(1),
    client.from("app_user").select("is_platform_owner").eq("id", userId).maybeSingle(),
  ]);

  return (
    ((adminMemberships as unknown[] | null)?.length ?? 0) > 0 ||
    Boolean((profile as { is_platform_owner?: boolean } | null)?.is_platform_owner)
  );
}
