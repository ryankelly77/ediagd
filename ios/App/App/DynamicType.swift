import UIKit
import WebKit

/// ============================================================================
/// EDIAGD — carry the phone's text-size setting into the web app
///
/// ---------------------------------------------------------------------------
/// WHY NOTHING HAPPENED BEFORE
/// ---------------------------------------------------------------------------
/// Ryan turned the text size up in iOS Settings and the app looked identical.
/// That was not a stale build: iOS Dynamic Type reaches UIKit labels, and a
/// WKWebView is not made of UIKit labels. A web app inside a Capacitor shell
/// hears nothing about the setting unless the shell tells it, and nothing in
/// this shell was telling it.
///
/// The work that landed earlier made the app SURVIVE larger text — headers that
/// wrap, tiles that reflow, a regression suite at 100/125/150/200%. This is the
/// half that makes larger text HAPPEN.
///
/// ---------------------------------------------------------------------------
/// IT DRIVES THE SAME KNOB THE AUDIT TURNS
/// ---------------------------------------------------------------------------
/// scripts/larger-text-audit.mjs proves those four scales by setting
/// `document.documentElement.style.fontSize` to 16, 20, 24 and 32px. So that is
/// exactly what this sets, and for the same reason: the styling is in rem, so
/// the root size scales the whole app through one property.
///
/// Driving anything else — page zoom, a viewport meta, a separate native scale
/// factor — would mean shipping a text size nothing has ever been tested at.
///
/// ---------------------------------------------------------------------------
/// IT STOPS AT 200%, AND THAT IS A LIMIT WORTH KNOWING ABOUT
/// ---------------------------------------------------------------------------
/// The accessibility sizes run past 300%. The audit's ceiling is 200%, and
/// "structurally sound at 200%" is the strongest claim anybody has measured
/// here. Handing an AX5 reader 312% would be shipping three untested sizes on
/// the word of arithmetic.
///
/// So the scale is clamped to the tested range: every category below AX3 maps
/// to its true size, and AX3/AX4/AX5 all land on 200%. Those readers get less
/// enlargement than they asked for, which is a real cost and is the honest
/// trade until the audit is extended past 200%.
/// ============================================================================
enum DynamicType {

    /// Message name the document-start script uses to ask for the live value.
    static let queryMessageName = "ediagdTextScale"

    /// The root font-size the web app is built around. 1rem at 100%.
    private static let basePx: Double = 16

    /// The largest size scripts/larger-text-audit.mjs actually proves.
    private static let maxPx: Double = 32

    /// Apple's body point size per category, over .large's 17pt.
    ///
    /// Taken from the type scale rather than invented: these are the ratios the
    /// system itself applies to body text, so a reader who has calibrated the
    /// rest of their phone gets the same step here.
    private static func multiplier(for category: UIContentSizeCategory) -> Double {
        switch category {
        case .extraSmall:                        return 14.0 / 17.0
        case .small:                             return 15.0 / 17.0
        case .medium:                            return 16.0 / 17.0
        case .large:                             return 1.0
        case .extraLarge:                        return 19.0 / 17.0
        case .extraExtraLarge:                   return 21.0 / 17.0
        case .extraExtraExtraLarge:              return 23.0 / 17.0
        case .accessibilityMedium:               return 28.0 / 17.0
        case .accessibilityLarge:                return 33.0 / 17.0
        case .accessibilityExtraLarge:           return 40.0 / 17.0
        case .accessibilityExtraExtraLarge:      return 47.0 / 17.0
        case .accessibilityExtraExtraExtraLarge: return 53.0 / 17.0
        default:                                 return 1.0
        }
    }

    /// The root font-size for the phone's current setting, in CSS px.
    static func currentRootPx() -> Double {
        let category = UIApplication.shared.preferredContentSizeCategory
        let raw = basePx * multiplier(for: category)
        return min(max(raw, basePx * 0.8), maxPx)
    }

    /// The applier, plus a first value so the page never paints at the wrong size.
    ///
    /// Two things happen here, in this order, and the order is the point:
    ///
    ///   1. the size computed at launch is applied SYNCHRONOUSLY, before the
    ///      document has any content to lay out. No flash of 100% text.
    ///   2. the page then asks the shell what the size is RIGHT NOW and applies
    ///      that if it differs.
    ///
    /// Step 2 exists because step 1's number is baked into this string when the
    /// app launches, and the setting can change afterwards. Most navigation in a
    /// Next app is pushState — same document, this script does not re-run — but
    /// a hard reload after a settings change would otherwise come back at the
    /// old size and stay there until the app was killed.
    static func bootstrapScript() -> WKUserScript {
        let launchPx = currentRootPx()
        let source = """
        (function () {
          var root = document.documentElement;
          function apply(px) {
            if (!px || !isFinite(px)) return;
            root.style.fontSize = px + 'px';
            /* Anything that wants to react to the step rather than just inherit
               the size — a container query, a compact variant — can read this. */
            root.style.setProperty('--ediagd-root-px', px);
            root.dataset.ediagdTextScale = String(Math.round((px / 16) * 100));
          }
          window.__ediagdApplyTextScale = apply;
          apply(\(launchPx));

          /* Ask the shell for the live value. In a browser there is no shell and
             no handler, so this throws and the launch value simply stands. */
          try {
            window.webkit.messageHandlers.\(queryMessageName)
              .postMessage(null)
              .then(function (px) { apply(px); })
              .catch(function () {});
          } catch (e) {}
        })();
        """
        return WKUserScript(source: source,
                            injectionTime: .atDocumentStart,
                            forMainFrameOnly: true)
    }

    /// Push the current value into a page that is already open.
    static func push(to webView: WKWebView?) {
        guard let webView else { return }
        let px = currentRootPx()
        webView.evaluateJavaScript(
            "window.__ediagdApplyTextScale && window.__ediagdApplyTextScale(\(px));"
        )
    }
}

/// Answers the document-start script's question with the value as it stands now.
///
/// Separate from the view controller because `userContentController` retains its
/// handlers — the same reason LaunchReadyHandler is its own type.
final class TextScaleQueryHandler: NSObject, WKScriptMessageHandlerWithReply {
    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        replyHandler(DynamicType.currentRootPx(), nil)
    }
}
