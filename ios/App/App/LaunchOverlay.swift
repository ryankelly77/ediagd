import UIKit

/// ============================================================================
/// EDIAGD — when the launch overlay arrives, and when it is allowed to leave
///
/// ---------------------------------------------------------------------------
/// THE RULE, UNCHANGED FROM THE WEB VERSION
/// ---------------------------------------------------------------------------
/// The animation plays DURING the fetch, never in addition to it.
///
///   app ready first   the sequence still finishes. Cutting a 1.32s animation
///                     at 0.6s to reveal the app is worse than the 0.7s it
///                     saves; a launch that ends mid-gesture reads as a bug,
///                     and the sun stopping half out of the water reads as a
///                     crash.
///   fetch slower      the SETTLED MARK holds. It is already on screen and
///                     already finished, so it becomes the loading state at no
///                     cost. There is never an animation followed by a spinner,
///                     because there is never a spinner.
///
/// So: leave at max(sequence end, web ready). Both conditions, whichever is
/// later, and nothing in between.
///
/// ---------------------------------------------------------------------------
/// AND THE FAILSAFE, WHICH IS THE IMPORTANT HALF
/// ---------------------------------------------------------------------------
/// The ready signal comes from JavaScript running in a page fetched over the
/// network. Every part of that can fail: airplane mode, a server that is down,
/// a bad deploy, an exception before the signal fires. This session shipped a
/// syntax error in exactly that script and it ran unnoticed on production,
/// which is precisely the scenario to design for.
///
/// A web-side failure must degrade to "no animation dismissal", never to a
/// stuck screen. So there is a hard cap: at `maximumHold` the overlay leaves
/// regardless, and reveals whatever the webview has — including its own offline
/// state, which is a screen somebody can act on. A logo they cannot leave is
/// not.
/// ============================================================================
final class LaunchOverlay {

    static let shared = LaunchOverlay()

    /// The backstop. Long enough that a slow-but-working start is never cut
    /// short, short enough that a broken one is not a hostage situation.
    private static let maximumHold: TimeInterval = 4.0

    /// Matches the web overlay's fade — the mark dissolves into the app rather
    /// than being switched off.
    private static let fadeDuration: TimeInterval = 0.25

    private var view: LaunchOverlayView?
    private var presentedAt: CFTimeInterval = 0
    private var sequenceEndsAt: CFTimeInterval = 0
    private var isDismissing = false

    /// Cold start only.
    ///
    /// This is called from `scene(_:willConnectTo:)`, which runs when a scene
    /// CONNECTS — not when one returns from the background. A resume never
    /// reaches this code, so there is no overlay to suppress and no flash to
    /// avoid. The flag is belt and braces for the case where iOS reconnects a
    /// scene within a living process.
    private var hasPresented = false

    private init() {}

    func present(in window: UIWindow) {
        guard !hasPresented else { return }
        hasPresented = true

        let overlay = LaunchOverlayView(frame: window.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(overlay)
        // Above everything, including the Capacitor splash view, which is added
        // to the root view controller rather than to the window.
        window.bringSubviewToFront(overlay)

        view = overlay
        presentedAt = CACurrentMediaTime()

        // Reduce Motion has no sequence to wait for: the mark is finished on
        // its first frame, so the only thing left to wait for is the app.
        let reduced = UIAccessibility.isReduceMotionEnabled
        sequenceEndsAt = presentedAt + (reduced ? 0 : LaunchOverlayView.sequenceDuration)

        // layoutIfNeeded first: play() reads anchor points that layoutSubviews
        // establishes, and a first frame drawn from an unlaid-out layer tree
        // puts the mark in the corner for one frame.
        overlay.layoutIfNeeded()
        overlay.play()

        DispatchQueue.main.asyncAfter(deadline: .now() + Self.maximumHold) { [weak self] in
            guard let self, self.view != nil, !self.isDismissing else { return }
            // Deliberately not waiting for the sequence here. If we have
            // reached the cap, something is wrong, and finishing a flourish is
            // no longer the priority.
            self.dismiss()
        }
    }

    /// The web app reports that its shell has painted.
    func signalReady() {
        guard view != nil, !isDismissing else { return }
        let remaining = max(0, sequenceEndsAt - CACurrentMediaTime())
        if remaining == 0 {
            dismiss()
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + remaining) { [weak self] in
                self?.dismiss()
            }
        }
    }

    private func dismiss() {
        guard let overlay = view, !isDismissing else { return }
        isDismissing = true

        UIView.animate(withDuration: Self.fadeDuration, animations: {
            overlay.alpha = 0
        }, completion: { _ in
            overlay.removeFromSuperview()
        })
        // Released here rather than in the completion block: once the fade has
        // started this object has no further say, and holding the reference
        // only creates a window in which a late signal can act on a view that
        // is already leaving.
        view = nil
    }
}
