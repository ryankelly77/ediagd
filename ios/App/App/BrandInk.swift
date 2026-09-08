// GENERATED FILE — DO NOT EDIT.
//
// Written by scripts/gen-brand-ink-swift.mjs from lib/brand-ink.ts, which is
// itself taken verbatim from the designer's masters in public/brand/svg.
// Run `npm run brand:ink` after changing the mark. Editing this file by hand
// reintroduces exactly the drift brand-ink.ts was created to stop.

import UIKit

enum BrandInk {
    /// #132a40 — from lib/brand-ink.ts
    static let navy = UIColor(red: 0.0745, green: 0.1647, blue: 0.2510, alpha: 1)

    /// #f2efe8 — from lib/brand-ink.ts
    static let cream = UIColor(red: 0.9490, green: 0.9373, blue: 0.9098, alpha: 1)

    /// #e3b15c — from lib/brand-ink.ts
    static let sun = UIColor(red: 0.8902, green: 0.6941, blue: 0.3608, alpha: 1)

    /// #6fbcc6 — from lib/brand-ink.ts
    static let wave = UIColor(red: 0.4353, green: 0.7373, blue: 0.7765, alpha: 1)

    /// The master viewBox is square; every path below is in these units.
    static let side: CGFloat = 120

    /// Trunk first, then five fronds.
    static let palmPaths: [String] = [
        "M86 78 C 86 68, 84.5 56, 80 47",
        "M80 47 C 72.5 42, 64 42.5, 58 47",
        "M80 47 C 75 39.5, 67.5 36.5, 60 37.5",
        "M80 47 C 82.5 38.5, 88 34, 95 33.5",
        "M80 47 C 87.5 42.5, 95 43, 101 48",
        "M80 47 C 79.5 39, 76 32.5, 70.5 29",
    ]

    static let wavePath = "M16 76 C 22 52, 46 43, 57 55 C 48 52, 40.5 58, 42.5 67 C 53 60, 70 63, 80 73 C 60 82, 33 82, 16 76 Z"

    /// The second is the fainter one.
    static let swellPaths: [String] = [
        "M26 88 C 42 93, 66 93.5, 86 88.5",
        "M36 97 C 48 100.5, 64 100.5, 76 97.5",
    ]

    /// The sun's five rays, as line segments.
    static let rays: [(CGPoint, CGPoint)] = [
        (CGPoint(x: 52, y: 22), CGPoint(x: 52, y: 17)),
        (CGPoint(x: 41, y: 26), CGPoint(x: 38, y: 22.5)),
        (CGPoint(x: 63, y: 26), CGPoint(x: 66, y: 22.5)),
        (CGPoint(x: 36.5, y: 36), CGPoint(x: 31.5, y: 34.5)),
        (CGPoint(x: 67.5, y: 36), CGPoint(x: 72.5, y: 34.5)),
    ]

    static let sunCenter = CGPoint(x: 52, y: 38)
    static let sunRadius: CGFloat = 9

    static let ringCenter = CGPoint(x: 60, y: 60)
    static let ringRadius: CGFloat = 56
}
