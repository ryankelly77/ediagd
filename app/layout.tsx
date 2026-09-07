import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";
import { LaunchScreen } from "@/components/brand/LaunchScreen";
import { LaunchScreenGate } from "@/components/brand/LaunchScreenGate";
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
      </head>
      <body className="ediagd-app min-h-full" suppressHydrationWarning>
        {/* First in the body: it covers everything, and being early in the
            markup means it paints before the page it is covering. */}
        <LaunchScreen />
        <LaunchScreenGate />
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
