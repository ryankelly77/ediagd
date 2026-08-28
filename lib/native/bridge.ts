/* ============================================================================
   EDIAGD — the seam between the web app and the shell

   Everything native the app does goes through this file, and every function in
   it is a NO-OP IN A BROWSER. That is the whole design rule: the web app must
   behave exactly as it does today when these are called from a normal tab, so
   that there is one codebase and not two.

   `Capacitor.isNativePlatform()` is the only gate. It is false in a browser,
   true inside the shell, and the plugins are dynamically imported so their
   native bindings never reach the web bundle.
   ============================================================================ */

/** True only inside the Capacitor shell. False in every browser. */
export async function isNative(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function nativePlatform(): Promise<"ios" | "android" | null> {
  if (typeof window === "undefined") return null;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : null;
  } catch {
    return null;
  }
}

/* ---- Push ---------------------------------------------------------------- */

type TokenSink = (token: string, platform: "ios" | "android") => Promise<void>;
type Navigate = (route: string) => void;

/**
 * Ask for permission, register with APNs/FCM, and hand the token upward.
 *
 * PERMISSION IS REQUESTED, NOT ASSUMED. iOS shows the prompt once ever; asking
 * on first launch — before the person has seen a single number — spends that
 * one chance on a stranger. The caller decides when; this only does the asking.
 *
 * Returns the permission outcome so a caller can decide whether to explain
 * itself and try again later.
 */
export async function registerForPush(
  onToken: TokenSink,
  onOpen: Navigate
): Promise<"granted" | "denied" | "unavailable"> {
  if (!(await isNative())) return "unavailable";

  const platform = await nativePlatform();
  if (!platform) return "unavailable";

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const existing = await PushNotifications.checkPermissions();
  let status = existing.receive;
  if (status === "prompt" || status === "prompt-with-rationale") {
    status = (await PushNotifications.requestPermissions()).receive;
  }
  if (status !== "granted") return "denied";

  // Fires once the OS hands back a token, and again whenever it rotates one.
  await PushNotifications.removeAllListeners();

  await PushNotifications.addListener("registration", async (t) => {
    await onToken(t.value, platform);
  });

  await PushNotifications.addListener("registrationError", (err) => {
    // Not fatal: the app works without push. Logged so it is visible in a
    // device console rather than silently swallowed.
    console.error("[ediagd] push registration failed", err);
  });

  /*
   * A tap on a notification. `deep_link` is set by the generator in 0056 and is
   * always an in-app route — never an external URL, never /login.
   */
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const route = action.notification?.data?.deep_link;
    if (typeof route === "string" && route.startsWith("/")) onOpen(route);
  });

  await PushNotifications.register();
  return "granted";
}

/** Sign-out, or handing the phone to somebody else. */
export async function unregisterPush(): Promise<void> {
  if (!(await isNative())) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.removeAllListeners();
}

/* ---- Universal / app links ------------------------------------------------ */

/**
 * A tap on an https://<our host>/... link outside the app.
 *
 * The OS hands us the full URL; we keep the path and let the webview route it,
 * so the session and scroll position behave exactly as an in-app navigation.
 */
export async function handleAppLinks(onOpen: Navigate): Promise<() => void> {
  if (!(await isNative())) return () => {};
  const { App } = await import("@capacitor/app");

  const sub = await App.addListener("appUrlOpen", (event) => {
    try {
      const u = new URL(event.url);
      const route = `${u.pathname}${u.search}${u.hash}`;
      if (route.startsWith("/")) onOpen(route);
    } catch {
      /* A malformed URL is not worth crashing the app over. */
    }
  });

  return () => { void sub.remove(); };
}

/* ---- Chrome -------------------------------------------------------------- */

export async function readyShell(): Promise<void> {
  if (!(await isNative())) return;
  const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import("@capacitor/splash-screen"),
    import("@capacitor/status-bar"),
  ]);
  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* Android 15+ deprecates colour control; style alone is enough. */
  }
  await SplashScreen.hide();
}

/* ---- Biometric unlock: stubbed, wired later ------------------------------- */

/**
 * DELIBERATE STUB. The task after this one wires a real plugin
 * (@aparajita/capacitor-biometric-auth or similar) and the Apple review
 * argument leans on it, so the seam exists now and the implementation lands
 * next.
 *
 * Returns "unavailable" everywhere today, which callers must already handle —
 * a phone without Face ID has always been a supported case.
 */
export async function biometricUnlock(): Promise<"ok" | "failed" | "unavailable"> {
  if (!(await isNative())) return "unavailable";
  return "unavailable";
}
