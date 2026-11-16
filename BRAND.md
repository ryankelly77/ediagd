# EDIAGD — Brand Guideline (engineering reference)

Codified from **EDIAGD Brand Book v2.0**. Where this differs from the earlier prototype, the brand book wins. Values here match `styles/brand.css` and `lib/brand.ts` exactly — change them there, not in components.

**Brand in one line:** dealership performance coaching wrapped in the spirit of Aloha — warm, human, and positive. Every interaction ends in gratitude (*Mahalo*).

---

## 1. Color (sampled from the brand book)

| Token | Hex | Role |
|---|---|---|
| `navy` | `#0C1C2C` | Deep panels, primary text, logo ring |
| `navy-deep` | `#061422` | Gradient anchor |
| `teal` | `#4AA8B0` | Brand accent, the wave, tagline, "Mahalo" |
| `teal-soft` | `#B2DADC` | Tints, chips, on-dark accent text |
| `ocean` | `#2A7A8A` | Deeper teal-blue for secondary accents |
| `gold` | `#E8B44C` | The sun, primary CTA, emphasis words |
| `gold-soft` | `#F4E0B0` | Gold tint |
| `cream` | `#F4F0E4` | Paper / app background |
| `cream-card` | `#FCFAF4` | Card surface |
| `ink` / `ink-soft` | `#0C1C2C` / `#687080` | Body / secondary text |
| `line` | `#E0D8C6` | Hairline borders |
| `palm` | `#3B9E6A` | Success / "on track" (app UI) |
| `clay` | `#C9762F` | Warm attention — **the closest we get to red** |

### The one hard rule: never red.

The brand is Aloha — positivity practiced as discipline. Red reads as alarm and failure, which is off-brand. When something needs attention, use **clay** (`#C9762F`): warm, an opportunity, not an error. Applies to the lowest service status, the Zero tier, and every alert state.

> `palm` and `clay` are app-UI status colors (from the working product) alongside the book's core navy/teal/gold/cream. They exist because the app needs a success and an attention color the print book didn't define — both stay warm, neither is red.

---

## 2. Typography (brand book faces)

| Role | Brand book | In code |
|---|---|---|
| Wordmark + headings | **Times-family serif**, tracked, often uppercase | `--font-display` -> serif stack (`ui-serif, Georgia, "Times New Roman"`) |
| Body, labels, eyebrows | **Helvetica** | `--font-body` -> `"Helvetica Neue", Helvetica, system-ui` |
| "Mahalo" accent | **Apple-Chancery** (chancery script) | `--font-script` -> chancery/script stack |

Pacifico is **not** part of this brand — it was a prototype guess and has been removed. The wordmark is the serif in tracked uppercase (`EDIAGD`); eyebrows/labels are Helvetica in tracked uppercase.

For a guaranteed cross-platform match, load web equivalents in `app/fonts.ts` (e.g. Playfair Display for the serif, Pinyon Script for the Apple-Chancery accent) and point the CSS vars at them.

---

## 3. Logo

The mark is the **sunrise, palm and wave inside a ring**: a rayed gold sun, a
leaning palm, and the wave beneath, held in a navy ring. **The palm is part of
the mark**, not an optional flourish — a ring with only a sun and a wave is the
old mark and is not current anywhere.

The tagline sits beneath the serif `EDIAGD` wordmark in tracked teal caps
(`components/brand/Wordmark.tsx`).

### Where the mark actually lives

```
public/brand/svg/ediagd-mark-primary-dark.svg     the two sources
public/brand/svg/ediagd-mark-primary-light.svg
public/brand/svg|png|jpg/                         134 exports built from them
public/brand/README.txt                           what each file is for
```

Every lockup, one-ink variant and raster export in that kit was rebuilt from
those two sources, so they agree by construction. **Take the mark from the kit.
Do not redraw it**, and do not copy it out of a component — a hand-copied mark
is how the old one survived in the first place.

The palm is the quickest way to tell current from stale: a current mark
contains the path beginning `M86 78 C 86 68`. Anything with a ring at
`r="44"`, a sun at `cx="60" cy="33"` or the wave `M14 62 C 23 40` is the old
mark.

> **`components/brand/Logo.tsx` is NOT current.** It draws the mark inline —
> ring, sun, two wave paths, no palm — and is reached through `Wordmark.tsx`
> from `FrontDoor.tsx`. It is listed here rather than fixed quietly because it
> is the one copy a visitor actually sees. The same is true of the boot overlay
> in `native/www/index.html` and `ios/App/App/public/index.html`, and of the
> `big_wave` badge. `native/assets-src/splash.svg` already carries the palm.

The prototype's "Eddie" tiki is **not** the logo and has been removed from the package. If you keep Eddie as an in-app guide *character*, treat it as a separate illustration — never the brand mark.

---

## 4. Voice & the Aloha values

Warm, plain, positive. Frame gaps as opportunities, never failures. Every EDIAGD interaction closes with **Mahalo** (thank you) — use the `<Mahalo />` accent. The coaching maps to five Hawaiian values:

- **Akahai** — kindness / tenderness
- **Lokahi** — unity / harmony
- **ʻOluʻolu** — agreeableness / pleasantness
- **Haʻahaʻa** — humility / modesty
- **Ahonui** — patient persistence

---

## 5. App status & tier systems (from the product)

**Service status** — a single glanceable dot vs. the store average; detail one tap deeper.

| Status | Color | Rule |
|---|---|---|
| **On track** | `palm` | `rate >= storeAvg` |
| **Close** | `gold` | `rate >= storeAvg x 0.6` |
| **Pursue** | `clay` | below (an action, never "needs work") |

**Advisor tier** (`<TierBadge>`): Elite `gold` >=0.85 - Strong `palm` >=0.50 - Low `ocean` >=0.20 - Zero `clay`.

---

## 6. Shape, elevation, motion

Cards `16px` radius, pills fully round, buttons `~11px`. `shadow-card` at rest, `shadow-pop` for modals. Always a visible **gold** focus ring. Motion subtle; `prefers-reduced-motion` respected in `brand.css`.

---

## Settled: tagline wording

In-app the tagline is **"Every Day Is A Great Day"** — GREAT. The printed brand book says GOOD, and the "name is the philosophy" section builds the EDIAGD acronym on it (E-D-I-A-G-D); the acronym still reads with GREAT because the spacing is unchanged (E-D-I-A-G-D), only the adjective differs.

Single source of truth is `BRAND.tagline` in `lib/brand.ts`. Render it from that token — `app/layout.tsx` metadata, `app/page.tsx`, and `app/login/page.tsx` all do. Never retype the tagline inline.
