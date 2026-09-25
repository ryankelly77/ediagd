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

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  ADMIN_TOOLS,
  MANAGER_TOOLS,
  MEMBER_SECTIONS,
  NAV_EXEMPT,
  TAB_ROUTES,
} from "../lib/navigation";

const APP_DIR = join(process.cwd(), "app", "(app)");

/**
 * The trees this walks. Admin was where every orphan happened, and the member
 * libraries are the newest place one could — they are entitlement-gated, so a
 * missing link would look like "not entitled" rather than "not linked", which
 * is the hardest kind of orphan to notice.
 */
const WATCHED = [
  "admin",
  "library",
  "joe-the-pro",
  "meetings",
  "island-time",
  /* Added when the certifications wall shipped. It was outside the watched set
     at first, which meant the suite reported "every watched route is
     reachable" while saying nothing whatsoever about it — a pass that reads
     green and checks nothing is worse than no check at all. */
  "certifications",
  /* Added with the family shelf in 3c, and for the same reason as
     certifications above: a route outside this list is one the suite reports
     "every watched route is reachable" about while saying nothing whatsoever
     about it. /service/[family] is reached from the focus-family card and the
     pitch dialog, never from a menu, which is exactly the shape that goes
     unnoticed. */
  "service",
  /*
   * Added with the mileage shelf. THIRD TIME — certifications, then service, now
   * this — so the pattern is worth naming rather than just repeating: a new
   * top-level route is outside this list by default, and the suite's green
   * "every watched route is reachable" is then a statement about a set the new
   * route is not in. The default is silence, which is the wrong default for a
   * check.
   *
   * /mileage is reached from the celebration screen after a morning completes,
   * never from a menu — the same shape as /service/[family], and the shape this
   * suite is least likely to be asked about.
   */
  "mileage",
];

/**
 * ===========================================================================
 * EVERY TOP-LEVEL ROUTE IS EITHER WATCHED OR EXPLAINED. NOTHING IS SILENT.
 * ===========================================================================
 *
 * WATCHED above is a fixed list, and a fixed list meets new things by saying
 * nothing about them. Three routes proved it — certifications, service, then
 * mileage — and in all three cases this suite printed "Every watched route is
 * reachable" while the new route was outside the set it was describing. That
 * reads identically to passing.
 *
 * So the list is now checked against the filesystem. A top-level directory under
 * app/(app) that is in neither WATCHED nor this map is a HARD FAILURE, because
 * an unfamiliar route is precisely the case this suite exists for. Adding one
 * costs a line and a sentence; the alternative cost three silent passes.
 *
 * These are the trees deliberately out of scope, each with the reason. Not
 * "unimportant" — differently checked, or not navigation at all.
 */
const UNWATCHED_REASON: Record<string, string> = {
  today: "the ritual itself, and the tab bar's home. Reached by every path there is.",
  advisor: "the numbers hub, on the tab bar.",
  manager: "the manager hub, on the tab bar; its tools are checked via MANAGER_TOOLS.",
  more: "the More menu — it is the thing that links other screens, not a screen linked from one.",
  profile: "reached from More and from the avatar on every screen.",
  streak: "the Swell hero on /today and /advisor link it; /streak/paddle-out is linked from /streak.",
  badges: "linked from the celebration and from /profile.",
  notifications: "linked from /profile and from the soft-ask card.",
  saved: "linked from More.",
  group: "linked from More, for multi-rooftop owners.",
  "sand-dollars": "linked from the celebration and the economy strip.",
  swag: "linked from More and from /sand-dollars.",
  daily: "the legacy loop route. Superseded by /today and kept only so an old bookmark resolves.",
};

/** Every route under app/(app)/admin that has a page. */
function routesUnder(dir: string, prefix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "page.tsx") {
      found.push(prefix);
      continue;
    }
    if (statSync(full).isDirectory()) {
      found.push(...routesUnder(full, `${prefix}/${entry}`));
    }
  }
  return found;
}

function main(): void {
  const registered = new Set([
    ...ADMIN_TOOLS.map((t) => t.href),
    /* Manager-owned screens are reachable too — from /manager and the More
       menu — just by a different audience. An orphan is a route NOBODY links
       to, not one the platform owner's hub happens not to list. */
    ...MANAGER_TOOLS.map((t) => t.href),
    ...MEMBER_SECTIONS.map((s) => s.href),
    /* The tab bar is the third way a screen gets linked, and the one this
       check used to be blind to. /certifications is reached ONLY from the bar
       — it left MEMBER_SECTIONS when it was promoted — so without this it
       would read as an orphan. */
    ...Object.values(TAB_ROUTES),
  ]);

  /*
   * ---- THE LIST IS CHECKED AGAINST THE FILESYSTEM, BEFORE ANYTHING ELSE ----
   *
   * This runs first and exits non-zero, because every assertion below is scoped
   * to WATCHED and is therefore worthless about a tree that is not in it. A
   * suite that is silent by default is not a check.
   */
  const topLevel = readdirSync(APP_DIR).filter((e) => {
    try {
      return statSync(join(APP_DIR, e)).isDirectory();
    } catch {
      return false;
    }
  });
  const unaccounted = topLevel
    .filter((d) => !WATCHED.includes(d) && !(d in UNWATCHED_REASON))
    .sort();

  if (unaccounted.length) {
    console.error(
      `\nUNACCOUNTED ROUTE TREE${unaccounted.length > 1 ? "S" : ""}: ` +
        unaccounted.map((d) => `/${d}`).join(", ") +
        `\n\nThis suite only checks the trees in WATCHED, so it would have said ` +
        `nothing whatsoever about ${unaccounted.length > 1 ? "these" : "this"} ` +
        `— which reads exactly like passing. That has happened three times ` +
        `(certifications, service, mileage).\n\n` +
        `Add each to WATCHED to have its links checked, or to UNWATCHED_REASON ` +
        `with a sentence saying how it is reached instead.\n`
    );
    process.exit(1);
  }

  /* And the reverse: a reason left behind for a tree that no longer exists is a
     stale excuse that would quietly cover a future route of the same name. */
  const phantom = Object.keys(UNWATCHED_REASON)
    .filter((d) => !topLevel.includes(d))
    .sort();
  if (phantom.length) {
    console.error(
      `\nUNWATCHED_REASON names ${phantom.length} tree(s) that no longer exist: ` +
        `${phantom.join(", ")}\n\nRemove them — a leftover excuse would silently ` +
        `cover a future route that happens to reuse the name.\n`
    );
    process.exit(1);
  }

  const routes = WATCHED.flatMap((name) =>
    routesUnder(join(APP_DIR, name), `/${name}`)
  ).sort();

  const orphans: string[] = [];
  /* Routes that ARE registered but whose parent hub never links them. */
  const unlinked: string[] = [];

  /**
   * A REGISTERED ROUTE CAN STILL BE UNREACHABLE FROM ITS OWN HUB.
   *
   * That is the hole this closes, and it was a real one:
   * /admin/mapping/dealer-codes was in ADMIN_TOOLS, so /admin rendered a link
   * and this check passed — while /admin/mapping, the screen anybody looking
   * for it would actually open, still showed a dashed "Not built" card. The
   * suite was green and the screen was reachable only by typing the URL.
   *
   * So: a route with a registered ancestor must be LINKED FROM that ancestor's
   * page. Registering it is a claim about navigation, and this is the claim
   * being checked rather than taken on trust.
   *
   * Exempt routes are excused — they are the ones with a written reason for not
   * being linked, which is a different promise.
   */
  function linkedFrom(parentRoute: string, childRoute: string): boolean {
    const file = join(APP_DIR, parentRoute.replace(/^\//, ""), "page.tsx");
    try {
      if (readFileSync(file, "utf8").includes(childRoute)) return true;
    } catch {
      /* No page on disk — the caller only asks about routes that have one. */
    }
    /*
     * A SCREEN IS ITS PAGE PLUS WHAT IT RENDERS.
     *
     * /admin/content/search is reached from ContentSearchBar, which pushes the
     * route from a client component — a real link the page's own source never
     * mentions. Missing those would push somebody to write a NAV_EXEMPT reason
     * that is not true.
     *
     * The cost is precision: this proves the route is referenced by SOME
     * component rather than by this parent's. It is still enough to catch the
     * failure this check exists for — a hub showing a placeholder where a link
     * should be, with the route named nowhere but the registry.
     */
    return componentSources().some((src) => src.includes(childRoute));
  }

  let _components: string[] | null = null;
  function componentSources(): string[] {
    if (_components) return _components;
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) out.push(readFileSync(full, "utf8"));
      }
    };
    try {
      walk(join(process.cwd(), "components"));
    } catch {
      /* No components tree is not an error; it just means no extra links. */
    }
    _components = out;
    return out;
  }

  const routeSet = new Set(routes);

  for (const route of routes) {
    if (route in NAV_EXEMPT) continue;
    /*
     * DYNAMIC ROUTES ARE NOT CHECKED FOR A LITERAL LINK. `/admin/impact/[id]`
     * is linked as `/admin/impact/${row.id}` and no amount of string matching
     * will find it. Their reachability is the existing "under a registered
     * parent" rule, which is what it was written for.
     */
    if (route.includes("[")) continue;

    /*
     * The nearest ancestor THAT HAS A PAGE, not the nearest registered tool.
     * /admin/mapping/families/confirm is opened from /admin/mapping/families,
     * which is where its link lives; asking /admin/mapping to link a
     * grandchild would be asking for a link that should not exist.
     *
     * /admin never counts, for the same reason it cannot cover an orphan.
     */
    const parent = routes
      .filter((r) => r !== "/admin" && r !== route && route.startsWith(`${r}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (parent && routeSet.has(parent) && !linkedFrom(parent, route)) {
      unlinked.push(`${route}  (no link on ${parent})`);
    }
  }

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

  console.log(`Checked ${routes.length} routes across ${WATCHED.length} trees.`);
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

  if (unlinked.length > 0) {
    console.error(
      `\n${unlinked.length} route(s) are registered or nested but their own hub ` +
        `does not link them:\n` +
        unlinked.map((u) => `  ${u}`).join("\n") +
        `\n\nAdd a link on the parent screen, or add the route to NAV_EXEMPT ` +
        `with the reason it is reached some other way. A route nobody can click ` +
        `to is a route nobody finds.\n`
    );
    process.exit(1);
  }

  if (orphans.length > 0) {
    console.error(
      `\n${orphans.length} admin route(s) have no way in:\n` +
        orphans.map((o) => `  ${o}`).join("\n") +
        `\n\nAdd each to ADMIN_TOOLS or MEMBER_SECTIONS in lib/navigation.ts ` +
        `so it appears in navigation, or to NAV_EXEMPT with the reason it ` +
        `doesn't need to.\n`
    );
    process.exit(1);
  }

  console.log("\nEvery watched route is reachable.");
}

main();
