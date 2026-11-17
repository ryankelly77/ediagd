#!/usr/bin/env python3
# ============================================================================
# EDIAGD — give the LEGACY Android launcher icons the ground the adaptive one
#          already has
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS AND WHY IT IS NOT A GENERATOR FLAG
# ---------------------------------------------------------------------------
# @capacitor/assets takes --iconBackgroundColor, and native-sync.sh passes
# #0C1C2C. That flag feeds `_generateAdaptiveIconBackground` ONLY. The legacy
# square icons are written by a different path that hard-codes
#
#     background: { r: 0, g: 0, b: 0, alpha: 0 }
#
# (dist/platforms/android/index.js, in the version pinned by npx). There is no
# option for it — checked by reading the generator, not by guessing — so the
# ground has to be applied afterwards.
#
# ---------------------------------------------------------------------------
# WHO SEES THESE AT ALL
# ---------------------------------------------------------------------------
# minSdkVersion is 24; adaptive icons begin at 26. So on API 24 and 25 Android
# ignores mipmap-anydpi-v26/ic_launcher.xml entirely and falls back to these
# PNGs — and they shipped as a cream mark on nothing, sitting on whatever
# colour the launcher happened to use behind it. Everywhere from 26 up is
# unaffected by this file.
#
# ---------------------------------------------------------------------------
# THE ROUND ONE GETS A DISC, NOT A SQUARE, AND THAT IS THE WHOLE CARE HERE
# ---------------------------------------------------------------------------
# ic_launcher_round.png is the round resource. Flattening it onto an opaque
# SQUARE would make it opaque and stop it being round — a launcher asking for
# the round icon would get a square one, which is a worse defect than the one
# being fixed. Measured before deciding: both legacy files arrive ~93-95%
# transparent and carry NO filled silhouette at all, so the round file has no
# shape of its own to preserve. It gets an inscribed disc; the square file gets
# a full square.
#
# The mark itself is never touched — it is composited over the new ground
# exactly as it arrived.
#
# NOT TOUCHED: ic_launcher_foreground.png and ic_launcher_background.png (the
# adaptive layers, which are already correct), anything under ios/, and
# native/assets/icon.png.
#
# Idempotent, and that took two attempts — see flattened(). Proven rather than
# claimed: a fresh generate reports "12 flattened, 0 already opaque" and every
# run after it reports "0 flattened, 12 already opaque", with the counters read
# from a pixel comparison against what was on disk.
#
# Requires Pillow. It REFUSES rather than skipping, because a silently skipped
# step here ships the transparent icon it exists to prevent.
# ============================================================================
import pathlib
import sys

GROUND = (0x0C, 0x1C, 0x2C, 0xFF)  # #0C1C2C — the adaptive background's colour
RES = pathlib.Path("android/app/src/main/res")
SQUARE, ROUND = "ic_launcher.png", "ic_launcher_round.png"
SS = 4  # supersample, so the disc edge is not a staircase

try:
    from PIL import Image, ImageDraw
except ModuleNotFoundError:
    sys.exit(
        "patch-android-legacy-icon: Pillow is not installed.\n"
        "  The legacy launcher icons (API 24-25) would ship transparent.\n"
        "  Install it and run again:  python3 -m pip install Pillow"
    )


def disc_mask(size: int) -> "Image.Image":
    """An inscribed circle as an alpha channel, antialiased by supersampling."""
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def flattened(name: str, mark: "Image.Image") -> "Image.Image":
    """The mark on the ground, with the round file kept round.

    THE ROUND ONE SETS ITS ALPHA TO THE MASK, IT DOES NOT COMPOSITE OVER A DISC.
    The first version drew an antialiased disc and composited the mark onto it,
    which looks identical and is NOT a fixed point: re-running composited the
    previous half-transparent edge pixels onto a fresh edge and thickened them
    a little each time. Setting alpha := mask over an already-opaque square
    gives exactly the same bytes on every run, which is what lets this sit in
    a script that is run repeatedly.
    """
    size = mark.size[0]
    out = Image.new("RGBA", (size, size), GROUND)
    out.alpha_composite(mark)
    if name == ROUND:
        out.putalpha(disc_mask(size))
    return out


def main() -> int:
    if not RES.is_dir():
        print(f"  android: {RES} not present — nothing to patch")
        return 0

    done, already, missing = 0, 0, 0
    for name in (SQUARE, ROUND):
        for path in sorted(RES.glob(f"mipmap-*/{name}")):
            mark = Image.open(path).convert("RGBA")
            w, h = mark.size
            if w != h:
                print(f"  REFUSING {path}: not square ({w}x{h})")
                return 1
            out = flattened(name, mark)
            # OBSERVED, not inferred. The first version of this counted a file
            # as "already done" when it was >99% opaque, which the round icon
            # never is — its corners are transparent by design — so a no-op run
            # would have reported twelve flattenings it did not perform. Compare
            # the result with what was on disk instead.
            if list(out.getdata()) == list(mark.getdata()):
                already += 1
            else:
                out.save(path)
                done += 1
        if not list(RES.glob(f"mipmap-*/{name}")):
            missing += 1

    if missing:
        print(f"  REFUSING: {missing} of 2 legacy icon names matched no file under {RES}")
        return 1

    # Counted from what the loop did, never printed regardless.
    print(f"  android: legacy launcher icons on #0C1C2C — {done} flattened,"
          f" {already} already opaque (square filled, round inscribed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
