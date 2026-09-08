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
/**
 * PUSH IS DORMANT, AND THAT IS THE WHOLE POINT OF SHIPPING IT NOW.
 *
 * The Capacitor push plugin is compiled into the shell — it is in Package.swift
 * and the binary — so the NATIVE half of notifications is already on every
 * phone that installs this build. What is switched off is the web half: no
 * permission prompt, no register() call, no listeners, nothing visible.
 *
 * That split is deliberate. Adding a native plugin later means a new binary, a
 * new TestFlight round and Mitch re-installing; flipping this constant means a
 * deploy. So the expensive half ships early and inert, and the day
 * notifications are actually built it is web plus server work against a shell
 * that already has the capability.
 *
 * AWAKE AS OF THE STREAK SAVER. The dormancy above is the history of this
 * constant, kept because it explains why the whole path below was written
 * months before anything used it.
 */
export const PUSH_ENABLED = true;

/**
 * ASKING AND REGISTERING ARE NOT THE SAME ACT, and separating them is the
 * entire permission design.
 *
 * iOS shows its notification dialog ONCE per install. Calling this on every
 * launch — which is what the original single function did — would fire that
 * one-shot dialog at whatever moment the app happened to open, cold, with no
 * explanation in front of it. A "no" there is permanent.
 *
 *   prompt: false  the launch path. Resumes an EXISTING grant silently, so a
 *                  rotated token still reaches us, and does nothing at all if
 *                  permission has never been given. Never raises a dialog.
 *   prompt: true   called only from the soft-ask card, after somebody has said
 *                  yes to our own card in our own words.
 */
export async function registerForPush(
  onToken: TokenSink,
  onOpen: Navigate,
  options: { prompt?: boolean } = {}
): Promise<
  "granted" | "denied" | "unavailable" | "not_asked" | "no_token" | `failed: ${string}`
> {
  /* The flag is checked HERE as well as at the call site: a plugin that can
     raise an OS permission prompt should not rely on every future caller
     remembering to ask first. */
  if (!PUSH_ENABLED) return "unavailable";

  if (!(await isNative())) return "unavailable";

  const platform = await nativePlatform();
  if (!platform) return "unavailable";

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const existing = await PushNotifications.checkPermissions();
  let status = existing.receive;
  if (status === "prompt" || status === "prompt-with-rationale") {
    /* The one-shot dialog. Only from the soft-ask. */
    if (!options.prompt) return "not_asked";
    status = (await PushNotifications.requestPermissions()).receive;
  }
  if (status !== "granted") return "denied";

  // Fires once the OS hands back a token, and again whenever it rotates one.
  await PushNotifications.removeAllListeners();

  await PushNotifications.addListener("registration", async (t) => {
    await onToken(t.value, platform);
    settle?.("granted");
  });

  /*
   * A REGISTRATION ERROR MUST REACH A PERSON, NOT A CONSOLE.
   *
   * This used to console.error and return "granted" regardless, because
   * register() resolves as soon as the request is made and the token arrives
   * later on a listener. So the two states "you have notifications" and "iOS
   * refused to issue a token" were indistinguishable from the caller — and the
   * second one is what happened for weeks: the shell shipped with the plugin
   * compiled in but no aps-environment entitlement, so every registration
   * failed with "no valid aps-environment entitlement string found" and the app
   * reported success. The only symptom anywhere was a device_push_token table
   * that never gained a row.
   *
   * The listeners stay for the life of the app — a token can rotate at any time
   * — and the race below exists only to give THIS call something to report.
   */
  let settle: ((outcome: string) => void) | undefined;
  const outcome = new Promise<string>((resolve) => {
    settle = resolve;
  });

  await PushNotifications.addListener("registrationError", (err) => {
    const detail =
      typeof err?.error === "string" ? err.error : JSON.stringify(err ?? {});
    console.error("[ediagd] push registration failed", detail);
    settle?.(`failed: ${detail}`);
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

  /*
   * Ten seconds, then give up on REPORTING — not on registering. The listeners
   * are still attached, so a token that arrives late is still stored; all this
   * bounds is how long a person watches a spinner before being told something
   * honest. APNs is normally sub-second on a working connection, so ten seconds
   * without an answer is a real problem rather than a slow one.
   */
  const timeout = new Promise<string>((resolve) =>
    setTimeout(() => resolve("no_token"), 10_000)
  );

  return (await Promise.race([outcome, timeout])) as
    | "granted"
    | "no_token"
    | `failed: ${string}`;
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
