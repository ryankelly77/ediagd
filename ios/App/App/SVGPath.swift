import UIKit

/// ============================================================================
/// EDIAGD — the smallest SVG path parser that can draw the mark
///
/// ---------------------------------------------------------------------------
/// WHY PARSE AT ALL
/// ---------------------------------------------------------------------------
/// The launch overlay has to draw the same palm, wave and swell the web draws.
/// The alternative to parsing is transcribing those curves into a sequence of
/// `addCurve(to:controlPoint1:controlPoint2:)` calls by hand — which is a
/// second copy of the geometry in a second language, and the exact failure
/// lib/brand-ink.ts exists to prevent. Path data is the format the masters are
/// already in, so the shell reads path data.
///
/// ---------------------------------------------------------------------------
/// DELIBERATELY INCOMPLETE
/// ---------------------------------------------------------------------------
/// This handles M, L, H, V, C, S, Z in both cases. It does NOT handle arcs,
/// quadratics, or the implicit-lineto-after-moveto rule. That is not laziness:
/// a parser that silently accepts a command it draws wrongly is worse than one
/// that refuses, because the failure surfaces as a subtly wrong logo months
/// later. Anything unsupported traps in debug and stops the path in release,
/// so a bad input is loud in the only place anybody would notice it — the
/// simulator, on the very next run.
///
/// The mark's masters use only M, C and Z today. The others are here because
/// the cost is a line each and the cost of not having one is a rebuild.
/// ============================================================================
enum SVGPath {

    /// Parses `d` into a path in the master's own coordinate space.
    ///
    /// Scaling is the caller's job — every layer in the overlay shares one
    /// scale factor, so applying it once at the layer is both cheaper and
    /// harder to get inconsistently wrong than baking it into each path.
    static func path(from d: String) -> CGPath {
        let path = CGMutablePath()
        var scanner = Scanner(d)
        var current = CGPoint.zero
        var start = CGPoint.zero
        /// The reflection of the previous cubic's second control point, for S.
        var lastControl: CGPoint?
        var command: Character = " "

        while let next = scanner.peekCommandOrNumber() {
            if let letter = next.letter {
                command = letter
                scanner.advance()
            } else if command == " " {
                assertionFailure("SVG path begins with a number, not a command: \(d)")
                return path
            }
            // Otherwise the command repeats with fresh operands, which is how
            // "C … C …" is written as "C … …".

            let relative = command.isLowercase
            func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
            }

            switch Character(command.lowercased()) {
            case "m":
                guard let x = scanner.number(), let y = scanner.number() else { return path }
                current = point(x, y)
                start = current
                path.move(to: current)
                lastControl = nil

            case "l":
                guard let x = scanner.number(), let y = scanner.number() else { return path }
                current = point(x, y)
                path.addLine(to: current)
                lastControl = nil

            case "h":
                guard let x = scanner.number() else { return path }
                current = CGPoint(x: relative ? current.x + x : x, y: current.y)
                path.addLine(to: current)
                lastControl = nil

            case "v":
                guard let y = scanner.number() else { return path }
                current = CGPoint(x: current.x, y: relative ? current.y + y : y)
                path.addLine(to: current)
                lastControl = nil

            case "c":
                guard let x1 = scanner.number(), let y1 = scanner.number(),
                      let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return path }
                let c1 = point(x1, y1), c2 = point(x2, y2)
                current = point(x, y)
                path.addCurve(to: current, control1: c1, control2: c2)
                lastControl = c2

            case "s":
                guard let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return path }
                // With no preceding cubic the first control point coincides
                // with the current point, per the spec.
                let c1 = lastControl.map {
                    CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y)
                } ?? current
                let c2 = point(x2, y2)
                current = point(x, y)
                path.addCurve(to: current, control1: c1, control2: c2)
                lastControl = c2

            case "z":
                path.closeSubpath()
                current = start
                lastControl = nil

            default:
                assertionFailure("Unsupported SVG path command '\(command)' in: \(d)")
                return path
            }
        }

        return path
    }

    /// A line segment, which is how the rays are stored.
    static func line(from a: CGPoint, to b: CGPoint) -> CGPath {
        let path = CGMutablePath()
        path.move(to: a)
        path.addLine(to: b)
        return path
    }

    /// One path holding several subpaths — the rays and the palm each draw as
    /// a single layer, so they animate as one object rather than five.
    static func combined(_ paths: [CGPath]) -> CGPath {
        let path = CGMutablePath()
        for p in paths { path.addPath(p) }
        return path
    }

    // ------------------------------------------------------------------------

    /// A cursor over the path string. Not `Foundation.Scanner`: this needs to
    /// distinguish a command letter from a number's sign without backtracking,
    /// which is three lines here and a fight there.
    private struct Scanner {
        private let chars: [Character]
        private var i = 0

        init(_ s: String) { chars = Array(s) }

        enum Token { case letter(Character), number
            var letter: Character? { if case let .letter(c) = self { return c }; return nil }
        }

        mutating func advance() { i += 1 }

        mutating func peekCommandOrNumber() -> Token? {
            skipSeparators()
            guard i < chars.count else { return nil }
            let c = chars[i]
            if c.isLetter { return .letter(c) }
            return .number
        }

        mutating func number() -> CGFloat? {
            skipSeparators()
            var s = ""
            if i < chars.count, chars[i] == "-" || chars[i] == "+" { s.append(chars[i]); i += 1 }
            while i < chars.count, chars[i].isNumber || chars[i] == "." {
                s.append(chars[i]); i += 1
            }
            guard let v = Double(s) else { return nil }
            return CGFloat(v)
        }

        private mutating func skipSeparators() {
            while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" {
                i += 1
            }
        }
    }
}
