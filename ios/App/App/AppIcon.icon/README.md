# AppIcon.icon — the layered Liquid Glass icon

Authored by hand rather than in Icon Composer: the tool is GUI-only and this
project is built from a terminal. `actool` compiles this bundle, Xcode builds
it, and the simulator renders it — which is the only validation that counts.

## Why the background is a sky-to-teal gradient, not navy

The first version used a flat `#0C1C2C` field, matching the launch screen, and
Ryan's verdict was "doesn't look very liquid glass to me." He was right, and the
cause is worth writing down because the instinct is to fix it by adding effects.

The glass material WAS being applied — a specular rim measured on the dark
version. Liquid Glass reads as depth by bending and catching light, and a flat
near-black field gives it no light to bend. Nothing was missing; there was
nothing for it to work with.

Four fills were rendered and compared side by side, and the first pick —
sky at the top fading to teal at the bottom — was WRONG for a reason worth
recording: it was judged at 3x upscale, where it looked best. At true icon size
the teal wave sat on teal ground and vanished. An icon has to be judged at the
size it is seen.

Inverting it — teal at the top, near-white at the bottom — fixed the wave but
Ryan's verdict on that was "washed out too", and he was right: a light field
pales the gold sun as well as the wave. Every element in this mark is a mid
tone, so there is no light background they all survive.

SHIPPED: FLAT NAVY — Mitch's call, and the palm changed the arithmetic.

The gradient rounds below were all run on the UNTREED mark, where every
element was a mid tone and a dark field left the glass nothing to catch. The
master's palm is drawn in cream, so the icon now has bright strokes on navy
for the specular to ride. That is why the flat field works here and did not
before: the artwork supplies the contrast the background used to have to.

The reasoning from those rounds is kept below, because it is still true of any
future fill and cost four builds to learn.

WAS: TEAL AT THE TOP, NAVY AT THE BOTTOM. It is the only arrangement that
serves both elements, and the reason is placement rather than taste — the sun
sits high and needs a mid-tone behind it for the glass to catch, the wave sits
low and needs something dark to bite against. A single flat colour cannot do
both, which is why the original navy looked flat and the light versions looked
washed.

If this ever still reads soft, the next lever is the ARTWORK — deepen the wave's
teal or warm the sun — not the background. The background has been through four
rounds and this is where it lands.

A lighter icon is also the more honest brand choice. The login screen is a
bright sunrise, the mark is navy on cream, and every app surface is cream — the
dark icon was the outlier. A sunrise over water wants light behind it.

## Structure

Two groups, rendered back to front, which is the mark's story in the medium:

  1 Water   the wave and its two swell lines
  2 Sun     the sun disc and its rays, with a neutral shadow so it floats

No ring. A drawn circle inside a shape the system already rounds reads as a
sticker under cellophane.

## Gotchas

- `"specular": "automatic"` CRASHES actool (`NSPlaceholderArray` nil insert).
  Automatic is the default, so it is simply omitted. `shadow` and
  `translucency` are fine.
- This file REPLACES the asset catalog's AppIcon — Apple's docs are explicit
  that you get one or the other. Xcode generates the pre-iOS-26 images from
  here, so nothing regresses. `scripts/native-sync.sh` deletes the appiconset
  that `@capacitor/assets` regenerates, or there would be two things named
  AppIcon.
- Layer PNGs are produced from the brand SVG by `native/icon-layers/*.svg`
  via headless Chrome (no rasteriser on this machine, and Chrome gives exact
  brand hex with real alpha).
