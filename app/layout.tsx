import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";
import { LaunchScreen } from "@/components/brand/LaunchScreen";
import { LaunchScreenGate } from "@/components/brand/LaunchScreenGate";
import { ChunkReload } from "@/components/ChunkReload";
import { NativeBridge } from "@/components/native/NativeBridge";

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

// viewport-fit=cover is what makes env(safe-area-inset-*) resolve to real
// values on notched phones — without it the bottom tab bar sits under the
// home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      {/* suppressHydrationWarning covers ONE level — attributes on <body>
          itself. Browser extensions (ColorZilla's cz-shortcut-listen, password
          managers, translators) inject attributes here before React hydrates,
          and the resulting warnings would otherwise drown out a real mismatch.
          We set no dynamic body attributes ourselves, so nothing genuine is
          hidden; anything deeper in the tree still warns normally. */}
      <head>
        {/*
          BEFORE FIRST PAINT, which is the only moment this can run.

          The launch overlay is in the server-rendered HTML so it is already on
          screen when the native splash hides — that is what makes the handoff
          seamless. But it must only appear on a COLD start, and whether this
          session has already launched is a fact only the client holds. A React
          effect would run after the browser had painted the overlay, so a
          mid-session reload would flash the mark and then remove it.

          So the check happens here, synchronously, in the head: read the flag,
          stamp the html element, and let CSS hide the overlay before anything
          is drawn. Same pattern a theme script uses, for the same reason.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(sessionStorage.getItem('ediagd:launched'))document.documentElement.dataset.launched='1'}catch(e){}`,
          }}
        />
        {/*
          CRITICAL, AND INLINE, BECAUSE AN EXTERNAL STYLESHEET IS A SECOND
          ROUND TRIP.

          The overlay's real rules live in styles/brand.css, which the browser
          cannot apply until it has fetched it. Between our HTML arriving and
          that file arriving the document has no background — which is white,
          and which showed up on a cold Safari load as a flash before the navy.
          Ryan: "duolingo doesn't do that." Duolingo is native and its splash
          covers that gap; the Capacitor shell does the same. Safari has no such
          cover, so the navy has to be in the FIRST bytes.

          These are only the declarations that decide what colour the screen is
          in the first frame. Everything else — the stage, the animation, the
          fade-out — stays in the stylesheet where it belongs.

          The html rule is scoped to :not([data-launched]) so it applies during
          launch and stops the moment the gate marks the session launched. A
          permanent navy html would sit behind every cream screen in the app and
          show through on rubber-band scroll.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html:not([data-launched='1']){background:#0c1c2c}" +
              "#ediagd-launch{position:fixed;inset:0;z-index:90;display:flex;" +
              "align-items:center;justify-content:center;background:#0c1c2c}",
          }}
        />
      </head>
      <body className="ediagd-app min-h-full" suppressHydrationWarning>
        {/* First in the body: it covers everything, and being early in the
            markup means it paints before the page it is covering. */}
        <LaunchScreen />
        {/*
          HIDE THE NATIVE SPLASH AT FIRST PAINT, NOT AT HYDRATION.

          This is the difference between a launch that feels instant and one
          that does not. The gate is a React effect, so it cannot run until the
          JS chunks have downloaded and hydrated — measured at 3.5s on Ryan's
          phone, which is 3.5s of the user looking at a splash with the app
          already sitting underneath it, drawn and ready.

          This script is inline and sits immediately after the overlay markup,
          so it runs as the body parses. The rAF defers it by exactly one frame
          — long enough for the overlay above to have painted, so the splash
          never lifts onto an empty webview, and no longer.

          Capacitor injects its bridge before page scripts, so the plugin is
          callable here. In a browser there is no bridge and the try simply
          fails, which is correct: there is no splash to hide.

          The gate still calls hide() as a backstop for the case where the
          bridge was not ready this early.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement;" +
              // START THE SEQUENCE HERE TOO, not in the React effect. The
              // keyframes are paused until data-launch-go, so the overlay
              // painted a mark whose every element is still at its opening
              // value — ring at zero opacity, sun below the horizon. That is
              // an empty navy field, and it lasted for the whole hydration:
              // 0.9s on a local server, longer on a phone over cellular.
              // Releasing at first paint is the feature as specified — the
              // animation plays DURING the fetch. The timestamp is left for
              // the gate so its hold is measured from the first moving frame.
              "if(d.dataset.launched!=='1'){d.dataset.launchGo='1';" +
              "window.__ediagdLaunchAt=performance.now()}" +
              // Poll, do not try once. A single rAF fires before Capacitor has
              // registered its plugin proxies, so the call threw and we silently
              // fell back to the gate at hydration — measured 1.8s of blank navy.
              // 40 tries at 25ms hides within a frame of the bridge being ready,
              // and gives up after a second rather than spinning.
                            "(function(){var d=document.documentElement;" +
              // START THE SEQUENCE HERE, not in the React effect. The keyframes
              // are paused until data-launch-go, so the overlay used to paint a
              // mark with every element still at its opening value — ring at zero
              // opacity, sun below the horizon. That is an empty navy field, and
              // it lasted the whole hydration: 0.9s on a local server, longer on a
              // phone. Releasing at first paint is the feature as specified — the
              // animation plays DURING the fetch, not after it. The timestamp is
              // left for the gate so its hold is measured from the first moving
              // frame rather than from whenever React caught up.
              "if(d.dataset.launched!=='1'){d.dataset.launchGo='1';" +
              "window.__ediagdLaunchAt=performance.now()}" +
              // And lift the native splash. Best-effort: the bridge may not have
              // registered its plugin proxies this early, and the config's short
              // launchShowDuration is the real floor. Never let a splash that
              // will not hide stop the app being revealed.
              "try{window.Capacitor.Plugins.SplashScreen.hide()}catch(e){}})();",
          }}
        />
        <LaunchScreenGate />
        {/* Recovers from a deploy landing mid-session: chunk filenames change,
            an open tab still holds the old ones, and the next link click throws
            ChunkLoadError. Reloads once, then stops. See ChunkReload.tsx. */}
        <ChunkReload />
        {/* Capacitor shell only: hides the splash, routes notification taps and
            universal links, and registers for push once signed in. Renders null
            and does nothing at all in a browser.

            MUST BE IN THE ROOT LAYOUT. /login lives outside the (app) group, so
            mounting it there meant a cold launch to the login screen never hid
            the splash — the app opened to a permanent logo. */}
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
