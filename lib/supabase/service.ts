/* ============================================================================
   EDIAGD — SERVICE ROLE Supabase client
   ⚠️  SERVER ONLY. THIS CLIENT BYPASSES ROW LEVEL SECURITY. ⚠️

   It authenticates as the `service_role`, which ignores every RLS policy in the
   database. Never import this from a client component, and never expose the key
   through a NEXT_PUBLIC_* variable — anything it touches is fully trusted.

   Use it ONLY in server actions and route handlers doing privileged writes that
   users must not be able to perform themselves:
     * granting Sand Dollars / updating swell after verifying a daily completion
       (the economy tables are read-only to users as of 0012)
     * cross-tenant provisioning
   For anything acting on behalf of a signed-in person, use lib/supabase/server.ts
   instead so RLS still applies.
   ============================================================================ */

/*
 * BUILD-TIME GUARD, ahead of the runtime one below.
 *
 * `server-only` makes an import of this module from a Client Component a BUILD
 * FAILURE naming the file, rather than a thrown error the first time somebody
 * loads the page it is on. lib/supabase/server.ts and lib/watch-ticket.ts have
 * carried it since they were written; this file — the one that actually holds
 * the key that bypasses RLS — did not.
 *
 * No script needs a stub for it: the scripts build their own service client
 * from SB_URL/SB_KEY and none of the scripts/tsconfig.*.json files pull this
 * module in.
 */
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  // Belt and braces: if this module is ever pulled into a client bundle, fail
  // loudly at runtime rather than shipping a privileged key to the browser.
  if (typeof window !== "undefined") {
    throw new Error(
      "createServiceClient() was called in the browser. This client bypasses RLS and is server-only."
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      // No user session is involved: don't persist or refresh anything.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default createServiceClient;
