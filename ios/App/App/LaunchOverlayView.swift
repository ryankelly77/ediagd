import UIKit

/// ============================================================================
/// EDIAGD — the launch mark, drawn by the shell
///
/// ---------------------------------------------------------------------------
/// WHY THIS IS NATIVE NOW
/// ---------------------------------------------------------------------------
/// This animation lived in the web app, as an inline SVG in the first bytes of
/// the document. It was moved here because the web version had hit a floor it
/// could not get under: the shell loads a REMOTE url, so nothing the page
/// contains can appear before WKWebView's first paint of that page. Measured
/// cold, that was about 1.3s of empty navy no matter how small the document
/// got — and the whole point of a launch animation is to occupy the fetch, not
/// to follow it.
///
/// A native layer has no such dependency. It exists at process launch, so it
/// starts while the request is still in flight, which is what the feature was
/// always specified to do.
///
/// ---------------------------------------------------------------------------
/// THE WEB SEQUENCE IS THE REFERENCE
/// ---------------------------------------------------------------------------
/// Every duration, delay and curve below is the one from the @keyframes block
/// that used to be in styles/brand.css, kept so the two could be compared frame
/// by frame during the move. The order is the thing that carries the meaning:
///
///   0.00  the ring fades in — the frame arrives first, so the animation has
///         somewhere to happen rather than assembling in empty space
///   0.15  the sun rises, with an overshoot and settle
///   0.55  the rays bloom from the sun that just arrived
///   0.60  one swell passes through the water
///   0.70  the palm leans once and returns
///   1.32  settled
///
/// The sun rising out of the water is free: the master paints the sun BEFORE
/// the wave, so the wave already occludes it. No mask, no clip — just the
/// z-order the logo has always had. Keep the layer order below intact.
/// ============================================================================
final class LaunchOverlayView: UIView {

    /// When the last keyframe lands. The dismissal never cuts in before this.
    static let sequenceDuration: CFTimeInterval = 1.32

    /// The mark against the viewport, matching `min(78vw, 460px)` from the web.
    /// The mark is the whole composition — there is no wordmark under it — so
    /// it is most of the phone's width. The ceiling stops it becoming a
    /// billboard on an iPad.
    private static func markSide(for bounds: CGRect) -> CGFloat {
        min(bounds.width * 0.78, 460)
    }

    private let container = CALayer()
    private let ring = CAShapeLayer()
    private let rays = CAShapeLayer()
    private let sun = CAShapeLayer()
    private let palm = CAShapeLayer()
    private let wave = CAShapeLayer()
    private let swells = [CAShapeLayer(), CAShapeLayer()]

    /// The overlay must be indistinguishable from the storyboard splash it
    /// replaces, or the handoff shows a seam. #0C1C2C is the literal the launch
    /// image was generated with and the one capacitor.config hands the shell —
    /// see the note in styles/brand.css. It is NOT BrandInk.navy, which is the
    /// ink the ARTWORK is drawn in (#132a40) and a different colour on purpose.
    static let field = UIColor(red: 0.0471, green: 0.1098, blue: 0.1725, alpha: 1)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = LaunchOverlayView.field
        isUserInteractionEnabled = false
        buildLayers()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    // MARK: - Drawing

    private func buildLayers() {
        // Z-ORDER IS THE DRAWING. Ring, rays, sun, palm, then the water on top
        // — the water is what the sun rises out from behind.
        ring.path = CGPath(
            ellipseIn: CGRect(
                x: BrandInk.ringCenter.x - BrandInk.ringRadius,
                y: BrandInk.ringCenter.y - BrandInk.ringRadius,
                width: BrandInk.ringRadius * 2,
                height: BrandInk.ringRadius * 2
            ),
            transform: nil
        )
        ring.fillColor = nil
        ring.strokeColor = BrandInk.cream.cgColor
        ring.lineWidth = 2.4

        rays.path = SVGPath.combined(BrandInk.rays.map { SVGPath.line(from: $0.0, to: $0.1) })
        rays.fillColor = nil
        rays.strokeColor = BrandInk.sun.cgColor
        rays.lineWidth = 2.2
        rays.lineCap = .round

        sun.path = CGPath(
            ellipseIn: CGRect(
                x: BrandInk.sunCenter.x - BrandInk.sunRadius,
                y: BrandInk.sunCenter.y - BrandInk.sunRadius,
                width: BrandInk.sunRadius * 2,
                height: BrandInk.sunRadius * 2
            ),
            transform: nil
        )
        sun.fillColor = BrandInk.sun.cgColor

        palm.path = SVGPath.combined(BrandInk.palmPaths.map { SVGPath.path(from: $0) })
        palm.fillColor = nil
        palm.strokeColor = BrandInk.cream.cgColor
        palm.lineWidth = 2.4
        palm.lineCap = .round

        wave.path = SVGPath.path(from: BrandInk.wavePath)
        wave.fillColor = BrandInk.wave.cgColor

        for (i, swell) in swells.enumerated() {
            swell.path = SVGPath.path(from: BrandInk.swellPaths[i])
            swell.fillColor = nil
            swell.strokeColor = BrandInk.wave.cgColor
            swell.lineWidth = 2.2
            swell.lineCap = .round
            swell.opacity = i == 0 ? 1 : 0.6
        }

        for layer in [ring, rays, sun, palm, wave] + swells {
            container.addSublayer(layer)
        }
        self.layer.addSublayer(container)
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        let side = LaunchOverlayView.markSide(for: bounds)
        let scale = side / BrandInk.side

        // One transform for the whole mark rather than pre-scaled paths: the
        // paths stay in master coordinates, so every anchor point below can be
        // written in the numbers the SVG uses.
        CATransaction.begin()
        CATransaction.setDisableActions(true)

        container.bounds = CGRect(x: 0, y: 0, width: BrandInk.side, height: BrandInk.side)
        container.position = CGPoint(x: bounds.midX, y: bounds.midY)
        container.transform = CATransform3DMakeScale(scale, scale, 1)

        let full = CGRect(x: 0, y: 0, width: BrandInk.side, height: BrandInk.side)
        for layer in [ring, rays, sun, palm, wave] + swells {
            layer.frame = full
        }

        // Anchor points are what make the transforms mean anything: the rays
        // bloom from the sun's centre, and the palm bends at the base of its
        // trunk so the crown travels and the roots do not.
        anchor(rays, at: CGPoint(x: 60, y: 33))
        anchor(palm, at: CGPoint(x: 80, y: 78))
        anchor(ring, at: BrandInk.ringCenter)

        CATransaction.commit()
    }

    private func anchor(_ layer: CALayer, at point: CGPoint) {
        layer.anchorPoint = CGPoint(x: point.x / BrandInk.side, y: point.y / BrandInk.side)
        layer.position = point
    }

    // MARK: - The sequence

    /// Runs the animation. With Reduce Motion on this does nothing at all —
    /// and that is the correct behaviour rather than a degraded one, because
    /// every layer's RESTING state is the finished mark. Nothing here is hidden
    /// or offset by default; motion is added on top. So the accessible path is
    /// a correct logo on the first frame, with nothing to cancel and no chance
    /// of a flash of some pre-animation state.
    func play() {
        guard !UIAccessibility.isReduceMotionEnabled else { return }

        let softLanding = CAMediaTimingFunction(controlPoints: 0.22, 1, 0.36, 1)
        // Control points past 1 are legal and are the overshoot: a sun coming
        // up has momentum, and without this it reads as a slide.
        let overshoot = CAMediaTimingFunction(controlPoints: 0.34, 1.42, 0.64, 1)
        let easeInOut = CAMediaTimingFunction(name: .easeInEaseOut)
        let start = layer.convertTime(CACurrentMediaTime(), from: nil)

        func add(_ animation: CAAnimation, _ layer: CALayer, key: String,
                 duration: CFTimeInterval, delay: CFTimeInterval,
                 timing: CAMediaTimingFunction) {
            animation.duration = duration
            animation.beginTime = start + delay
            animation.timingFunction = timing
            // `both` in CSS terms: hold the first frame through the delay and
            // the last frame afterwards. Without this the ring would flash in
            // at full opacity before its own animation began.
            animation.fillMode = .both
            animation.isRemovedOnCompletion = false
            // A grouped animation with no duration of its own falls back to
            // Core Animation's 0.25s default and finishes early, which shows up
            // as the sun stopping short of the waterline. The group's duration
            // does not cascade, so it is pushed down explicitly.
            if let group = animation as? CAAnimationGroup {
                for child in group.animations ?? [] {
                    child.duration = duration
                    child.timingFunction = timing
                    child.fillMode = .both
                    child.isRemovedOnCompletion = false
                }
            }
            layer.add(animation, forKey: key)
        }

        // The ring: opacity 0 → 1 with a slight scale up.
        add(group([
            basic("opacity", from: 0, to: 1),
            basic("transform.scale", from: 0.94, to: 1),
        ]), ring, key: "ring", duration: 0.36, delay: 0, timing: softLanding)

        // The sun: 31 master units down is just below the waterline, behind the
        // wave that is painted over it. Opacity reaches 1 at 60% so it is solid
        // before it clears the water rather than fading in mid-air.
        let rise = CABasicAnimation(keyPath: "transform.translation.y")
        rise.fromValue = 31
        rise.toValue = 0
        let appear = CAKeyframeAnimation(keyPath: "opacity")
        appear.values = [0, 1, 1]
        appear.keyTimes = [0, 0.6, 1]
        add(group([rise, appear]), sun, key: "sun", duration: 0.62, delay: 0.15, timing: overshoot)

        // The rays bloom outward from the sun that has just arrived.
        add(group([
            basic("opacity", from: 0, to: 1),
            basic("transform.scale", from: 0.55, to: 1),
        ]), rays, key: "rays", duration: 0.42, delay: 0.55, timing: softLanding)

        // A single lean and return. Enough to say "wind"; a palm that holds
        // perfectly still looks pasted on, and one that keeps swaying turns a
        // doorway into a screensaver.
        let sway = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        sway.values = [0, -2.5 * .pi / 180, 0]
        sway.keyTimes = [0, 0.45, 1]
        add(sway, palm, key: "palm", duration: 0.62, delay: 0.70, timing: easeInOut)

        // ONE swell, not a loop — this screen is a doorway rather than a place.
        for (i, swell) in swells.enumerated() {
            let bob = CAKeyframeAnimation(keyPath: "transform.translation.y")
            bob.values = [0, -2.5, 0]
            bob.keyTimes = [0, 0.45, 1]
            add(bob, swell, key: "swell", duration: 0.46,
                delay: i == 0 ? 0.60 : 0.70, timing: easeInOut)
        }
    }

    private func basic(_ keyPath: String, from: CGFloat, to: CGFloat) -> CABasicAnimation {
        let a = CABasicAnimation(keyPath: keyPath)
        a.fromValue = from
        a.toValue = to
        return a
    }

    /// A group so the members share one begin time and one curve — two
    /// animations with the same delay set independently drift apart under load.
    private func group(_ animations: [CAAnimation]) -> CAAnimationGroup {
        let g = CAAnimationGroup()
        g.animations = animations
        return g
    }
}
