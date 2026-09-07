/** Routes with no app chrome — the immersive daily flow and the login screen. */
/*
 * ---------------------------------------------------------------------------
 * /today IS NOT HERE ANY MORE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * It used to be, so AppHeader and TabBar both returned null over the whole
 * route. Right for the three-minute ritual, and wrong for the rest-day card
 * that also lives at /today: that screen has no Continue, no step dots and no
 * close button, so with the chrome gone the only way off it was to take a rep
 * the app had just finished saying nobody owed. A destination with no exit.
 *
 * The RITUAL is what should be immersive, not the URL. DailyFlow renders the
 * loop inside a fixed overlay that covers the bars; the rest card is a plain
 * page underneath them, with the tab bar as its answer to "how do I leave".
 */
export const IMMERSIVE_ROUTES = ["/login"];

/** Shared by AppHeader and TabBar so the top and bottom bars can never disagree. */
export function isImmersive(pathname: string): boolean {
  return IMMERSIVE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
