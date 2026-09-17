/* ============================================================================
   EDIAGD — content queries that need the server Supabase client.
   SERVER ONLY. Kept apart from lib/content.ts so client components can import
   the types and display language without pulling in cookies().
   ============================================================================ */

import type { AdminContext } from "@/lib/guards";

/**
 * Distinct service names, for the editor's datalist.
 *
 * PostgREST has no DISTINCT, so we page a single column and dedupe here. This
 * is what keeps Mitch picking "Brake Service" instead of typing "brake svc".
 */
export async function listServiceNames(
  supabase: AdminContext["supabase"]
): Promise<string[]> {
  const pageSize = 1000;
  const names = new Set<string>();

  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      /* The resolved derivation (0123): a service whose only content is
         op-code films would otherwise be missing from this list entirely. */
      .from("content_service")
      .select("resolved_service_family")
      .not("resolved_service_family", "is", null)
      .order("resolved_service_family", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error || !data || data.length === 0) break;
    for (const row of data) {
      const value = (row.resolved_service_family as string | null)?.trim();
      if (value) names.add(value);
    }
    if (data.length < pageSize) break;
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}
