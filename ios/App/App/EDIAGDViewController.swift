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
