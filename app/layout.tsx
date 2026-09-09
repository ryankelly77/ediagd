import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";
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
          THE ONE THING THE WEB STILL DOES FOR THE LAUNCH: SAY WHEN IT IS READY.

          The launch mark itself now belongs to the shell — a Core Animation
          layer presented at process launch, drawn from the same masters, in
          ios/App/App/LaunchOverlayView.swift. It moved because the web version
          had hit a floor it could not get under: the shell loads a REMOTE url,
          so nothing in this document can appear before WKWebView's first paint
          of it. Measured cold, that was ~1.3s of empty navy however small the
          document got, and a launch animation that starts after the wait is not
          doing the job it was specified to do.

          What is left is a single message in one direction: the shell has
          painted, so the overlay may leave once its sequence has finished.
          Fired after a double rAF so it means "drawn", not merely "parsed".

          Guarded and silent in a browser, where there is no message handler and
          no overlay to dismiss. Browser visitors get no launch animation, which
          is the accepted trade — a browser has its own loading affordances, and
          this is an app-launch experience.

          IF THIS SCRIPT FAILS, NOTHING HANGS. The overlay has its own cap and
          leaves on its own. That is deliberate: this session shipped a syntax
          error in a script exactly like this one and it sat on production
          unnoticed, so the shell is built to survive its web app being broken.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // iOS ONLY SENDS :active IF THE DOCUMENT LISTENS FOR TOUCH.
              // Safari and WKWebView suppress the active state on every element
              // until something has registered a touch handler, so without this
              // one empty listener the press-feedback rules in styles/brand.css
              // are dead on the device this product is built for. Passive, so it
              // costs nothing and cannot block a scroll.
              // A CREDENTIAL THAT LANDED ON THE WRONG SCREEN, FORWARDED BEFORE
              // ANYTHING ELSE RUNS.
              //
              // Supabase falls back to the Site URL when a redirect_to is not
              // allow-listed — silently — so an invite arrives at "/" with the
              // token in the hash and the root sends the person to /login.
              // Traced with curl on a real invite.
              //
              // This has to happen in the HEAD, not in a React effect. The
              // effect version worked and still failed: by the time it ran, the
              // Supabase client had already consumed the hash on the root page,
              // so /reset-password received a credential that had been spent
              // and told an invited person their invite had expired. Racing the
              // auth client is not something to attempt; this simply goes first.
              "(function(){try{var h=location.hash;if(h.length>1){" +
              "var p=new URLSearchParams(h.slice(1));var t=p.get('type');" +
              "if((t==='invite'||t==='recovery')&&(p.get('access_token')||p.get('token_hash'))" +
              "&&location.pathname!=='/reset-password'){location.replace('/reset-password'+h);}}}catch(e){}})();" +
              "document.addEventListener('touchstart',function(){},{passive:true});" +
              "(function(){var fired=false;function ready(){if(fired)return;fired=true;" +
              "try{window.webkit.messageHandlers.ediagdLaunchReady.postMessage(1)}catch(e){}}" +
              "function afterPaint(){requestAnimationFrame(function(){requestAnimationFrame(ready)})}" +
              "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',afterPaint)}" +
              "else{afterPaint()}})();",
          }}
        />
      </head>
      <body className="ediagd-app min-h-full" suppressHydrationWarning>
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
