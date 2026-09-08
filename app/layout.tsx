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
              "align-items:center;justify-content:center;background:#0c1c2c;" +
              "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}" +
              "html[data-launched='1'] #ediagd-launch{display:none}" +
              "html[data-launch-leaving='1'] #ediagd-launch{opacity:0;pointer-events:none;transition:opacity 260ms ease-out}" +
              ".ediagd-launch__stage{display:flex;flex-direction:column;align-items:center;gap:1.25rem}" +
              ".ediagd-launch__mark{width:min(78vw,460px);height:auto}" +
              "html:not([data-launch-go='1']) #ediagd-launch *{animation-play-state:paused!important}" +
              "@media (prefers-reduced-motion:no-preference){" +
              ".ediagd-launch__ring{opacity:0;transform-origin:48px 48px;animation:ediagd-ring 360ms cubic-bezier(.22,1,.36,1) 0ms both}" +
              ".ediagd-launch__sun{animation:ediagd-sun 620ms cubic-bezier(.34,1.42,.64,1) 150ms both}" +
              ".ediagd-launch__rays{transform-origin:60px 33px;animation:ediagd-rays 420ms cubic-bezier(.22,1,.36,1) 550ms both}" +
              ".ediagd-launch__palm{transform-origin:80px 78px;animation:ediagd-palm-sway 620ms ease-in-out 700ms both}" +
              ".ediagd-launch__swell--1{animation:ediagd-swell 460ms ease-in-out 600ms both}" +
              ".ediagd-launch__swell--2{animation:ediagd-swell 460ms ease-in-out 700ms both}}" +
              "@keyframes ediagd-ring{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}" +
              "@keyframes ediagd-sun{from{opacity:0;transform:translateY(31px)}60%{opacity:1}to{opacity:1;transform:translateY(0)}}" +
              "@keyframes ediagd-rays{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:scale(1)}}" +
              "@keyframes ediagd-palm-sway{0%{transform:rotate(0)}45%{transform:rotate(-2.5deg)}100%{transform:rotate(0)}}" +
              "@keyframes ediagd-swell{0%{transform:translateY(0)}45%{transform:translateY(-2.5px)}100%{transform:translateY(0)}}",
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
              // START THE SEQUENCE HERE, not in the React effect.
              //
              // The keyframes are paused until data-launch-go, so until
              // something sets it the overlay paints a mark with every element
              // still at its opening value — ring at zero opacity, sun below
              // the horizon. That is an empty navy field. Setting it here, as
              // the body parses, is what makes the sequence start on the first
              // painted frame instead of waiting for React to hydrate.
              //
              // The timestamp is left behind for the gate, so its hold is
              // measured from the first moving frame rather than from whenever
              // hydration happened to catch up.
              "if(d.dataset.launched!=='1'){d.dataset.launchGo='1';" +
              "window.__ediagdLaunchAt=performance.now()}" +
              // And lift the native splash. Best-effort: the bridge may not
              // have registered its plugin proxies this early, and the config's
              // short launchShowDuration is the real floor. A splash that will
              // not hide must never be able to strand the app.
              "try{window.Capacitor.Plugins.SplashScreen.hide()}catch(e){}" +
              "})();",
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
