/* ============================================================================
   EDIAGD — no more orphaned admin screens

   Four times now a working admin screen has shipped with nothing linking to it.
   A registry alone doesn't prevent a fifth — someone adds a route and forgets
   the registry, which is exactly the mistake that has already happened four
   times. So this walks the admin routes on disk and fails if any of them has no
   path through navigation.

       npm run check:nav

   A route passes if it is:
     * in ADMIN_TOOLS,
     * listed in NAV_EXEMPT with a written reason, or
     * underneath a registered tool — a detail page reachable from its own list.

   Dynamic segments are only exempt when their PARENT is registered, so
   /admin/thing/[id] is fine and /admin/thing is not.
   ============================================================================ */

import { readdirSync, statSync } from "fs";
import { join } from "path";
import { ADMIN_TOOLS, NAV_EXEMPT } from "../lib/admin-tools";

const ADMIN_DIR = join(process.cwd(), "app", "(app)", "admin");

/** Every route under app/(app)/admin that has a page. */
function adminRoutes(dir: string, prefix = "/admin"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "page.tsx") {
      found.push(prefix);
      continue;
    }
    if (statSync(full).isDirectory()) {
      found.push(...adminRoutes(full, `${prefix}/${entry}`));
    }
  }
  return found;
}

function main(): void {
  const registered = new Set(ADMIN_TOOLS.map((t) => t.href));
  const routes = adminRoutes(ADMIN_DIR).sort();

  const orphans: string[] = [];

  for (const route of routes) {
    if (registered.has(route)) continue;
    if (route in NAV_EXEMPT) continue;

    // Reachable from a registered section? "/admin/content/search" is covered
    // by "/admin/content".
    //
    // "/admin" can never do the covering. It is the hub, so it sits above every
    // admin route by definition — if it counted, every route would pass and
    // this check would verify nothing. It is currently exempt rather than
    // registered, which makes the filter belt-and-braces; the belt has already
    // slipped once, when registering the hub as a tool silently disabled the
    // whole check.
    const covered = [...registered]
      .filter((tool) => tool !== "/admin")
      .some((tool) => route.startsWith(`${tool}/`));
    if (covered) continue;

    orphans.push(route);
  }

  console.log(`Checked ${routes.length} admin routes.`);
  for (const route of routes) {
    const how = registered.has(route)
      ? "registry"
      : route in NAV_EXEMPT
        ? "exempt"
        : orphans.includes(route)
          ? "ORPHAN"
          : "under a registered tool";
    console.log(`  ${how.padEnd(22)} ${route}`);
  }

  if (orphans.length > 0) {
    console.error(
      `\n${orphans.length} admin route(s) have no way in:\n` +
        orphans.map((o) => `  ${o}`).join("\n") +
        `\n\nAdd each to ADMIN_TOOLS in lib/admin-tools.ts so it appears on ` +
        `/admin and in the More menu, or to NAV_EXEMPT with the reason it ` +
        `doesn't need to.\n`
    );
    process.exit(1);
  }

  console.log("\nEvery admin route is reachable.");
}

main();
