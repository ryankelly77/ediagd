/** Routes with no app chrome — the immersive daily flow and the login screen. */
export const IMMERSIVE_ROUTES = ["/today", "/login"];

/** Shared by AppHeader and TabBar so the top and bottom bars can never disagree. */
export function isImmersive(pathname: string): boolean {
  return IMMERSIVE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
