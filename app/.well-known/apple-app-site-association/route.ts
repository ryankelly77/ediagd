/* ============================================================================
   EDIAGD — Apple universal links

   THIS IS THE FIRST ROUTE HANDLER IN THE CODEBASE, and it is a deliberate
   exception rather than a new convention. The house style is server components
   for reads and server actions for writes (README). Apple, however, fetches a
   file at a fixed path with no extension and REQUIRES `application/json`, and a
   file dropped in public/ with no extension is served as octet-stream. There is
   no way to satisfy that with the existing patterns.

   Two rules Apple enforces that are easy to get wrong:
     * The path is exact — /.well-known/apple-app-site-association, no .json.
     * It must be served over https with no redirect. A 301 to www fails
       silently and the links simply open Safari instead.

   TEAM ID IS NOT KNOWN YET. Ryan's Apple developer account is mid-renewal, so
   APPLE_TEAM_ID is read from the environment and the route refuses to serve a
   placeholder — an AASA with a wrong team id is worse than none, because iOS
   caches it and the failure looks like the feature was never built.
   ============================================================================ */

const BUNDLE_ID = "ai.ediagd.app";

/**
 * Routes the app claims. Everything a notification can deep-link to, plus the
 * shallow entry points somebody might share.
 *
 * NOT "*": claiming the whole domain would swallow the Supabase auth callback
 * and password-reset links into the app, where they cannot complete.
 */
const CLAIMED_PATHS = [
  "/advisor",
  "/advisor/*",
  "/today",
  "/manager",
  "/streak",
  "/badges",
  "/library",
  "/library/*",
  "/notifications",
];

const EXCLUDED_PATHS = [
  "/login",
  "/auth/*",
  "/api/*",
];

export const dynamic = "force-dynamic";

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID;

  if (!teamId) {
    return new Response(
      JSON.stringify({
        error: "APPLE_TEAM_ID is not set. Universal links are not configured.",
      }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }

  const body = {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${BUNDLE_ID}`],
          components: [
            ...EXCLUDED_PATHS.map((p) => ({ "/": p, exclude: true })),
            ...CLAIMED_PATHS.map((p) => ({ "/": p, comment: "Opens in the app" })),
          ],
        },
      ],
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // iOS caches this hard. Short TTL while the shell is being set up.
      "cache-control": "public, max-age=300",
    },
  });
}
