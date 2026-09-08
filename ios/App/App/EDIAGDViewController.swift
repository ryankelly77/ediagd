import UIKit
import WebKit
import Capacitor

/// ============================================================================
/// EDIAGD — the bridge back from the web app to the launch overlay
///
/// ---------------------------------------------------------------------------
/// A MESSAGE HANDLER, NOT A PLUGIN
/// ---------------------------------------------------------------------------
/// One bit of information travels in one direction, once per launch: "the shell
/// has painted." A Capacitor plugin would give that a package, a JS wrapper, an
/// entry in packageClassList and a registration order to depend on — and the
/// registration order is the part that matters, because the signal fires in the
/// first bytes of the document, which is the earliest moment the bridge exists
/// at all.
///
/// `webkit.messageHandlers` is installed here, before the page is loaded, and
/// is available to the document from its first line. Nothing to register,
/// nothing to sequence, and it degrades to a thrown exception the web side
/// already catches when it is absent (a browser, where there is no shell and no
/// overlay to dismiss).
/// ============================================================================
final class EDIAGDViewController: CAPBridgeViewController {

    static let readyMessageName = "ediagdLaunchReady"

    private let readyHandler = LaunchReadyHandler()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        /*
         * ---- SWIPE BACK, THE WAY EVERY OTHER APP ON THE PHONE DOES ---------
         *
         * A Capacitor shell is ONE webview with no navigation controller, so
         * the edge-swipe every iPhone user reaches for lands on nothing. The
         * only way back was the breadcrumb — Ryan, on the admin video screens:
         * "instead of tapping on the small breadcrumb up top". A small target
         * at the top of a large phone is the least reachable place on the
         * screen, and it is the one place the app made mandatory.
         *
         * WKWebView keeps its own back/forward list, and Next's client-side
         * navigations are pushState entries in it, so turning this on gives
         * the real gesture — interactive, with the rubber-band and the
         * cancel-if-you-let-go — over routes the app already has. Not a
         * JavaScript imitation of it: a touch handler cannot preview the
         * previous screen or follow the finger back, and on an admin screen
         * full of horizontally scrolling tables it would have to guess whether
         * a drag was a swipe or a scroll. The system gesture starts at the
         * screen edge and never has to guess.
         *
         * Forward comes with it, which is correct — a back gesture that cannot
         * be undone is a worse deal than the one iOS ships.
         *
         * CONFIRMED WORKING on build 10, including for client-side routes. I
         * had shipped this doubting whether the back/forward list includes
         * same-document pushState entries, and briefly wrote a JavaScript
         * handler on the assumption that it does not. It does. The doubt was
         * worth stating and the replacement was not worth keeping — the system
         * gesture renders the previous screen behind the thumb and cancels
         * properly, and nothing written in JavaScript can do either.
         *
         * The only thing it needs from a person is knowing to start AT the
         * edge, which is iOS's convention rather than ours.
         */
        bridge?.webView?.allowsBackForwardNavigationGestures = true

        guard let controller = bridge?.webView?.configuration.userContentController else {
            // No webview means no page, which means no ready signal will ever
            // arrive — the overlay's own cap will clear it. Nothing to do here
            // but not crash.
            assertionFailure("Capacitor loaded without a webview; the launch overlay will time out")
            return
        }

        controller.add(readyHandler, name: Self.readyMessageName)
    }

    deinit {
        // The user content controller holds handlers strongly. This controller
        // lives for the life of the app, so the leak would never be observed —
        // which is exactly why it is worth removing anyway rather than leaving
        // a rule that only holds by accident.
        bridge?.webView?.configuration.userContentController
            .removeScriptMessageHandler(forName: Self.readyMessageName)
    }
}

/// Separate from the view controller on purpose: `userContentController` retains
/// its handlers, so a view controller that handled its own messages would retain
/// itself through the webview configuration.
private final class LaunchReadyHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        // The payload is ignored. The message arriving IS the signal, and
        // reading a body sent by a remote page would be one more thing that can
        // be malformed on a screen that must not be able to get stuck.
        LaunchOverlay.shared.signalReady()
    }
}
