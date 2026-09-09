# EDIAGD Design Language — App Screens

The visual system for the in-app screens (not the marketing/login). Goal: bring the **richness and depth of the login screen** to every app screen, using the brand palette, so the app feels crafted and cohesive rather than functional-but-flat. Every screen inherits this language; nothing invents its own.

This is the source of truth for the design polish pass. Claude Code applies it; it does not improvise beyond it.

---

## The problem we're solving

Today the app screens are flat cream with floating white cards and lots of empty space — they read as "functional," not "designed." The login screen, by contrast, has depth (layered sunrise, frosted card over video), warmth, and intentional composition. This spec closes that gap **without** putting video on every screen — depth comes from gradient, shadow, texture, and the sun/wave motif, not motion.

---

## 1. Palette (from the brand book — unchanged, this is reference)

- **Midnight** `#0C1C2C` — primary dark / navy hero surfaces, primary text on light
- **Deep Water** `#163A54` — secondary dark, gradient partner to Midnight
- **Ocean** `#2C6E8A` — mid blue, accents
- **Reef / Teal** `#4AA8B0` — the interactive accent (active states, links, eyebrows)
- **Seafoam** `#7EC8CD` — light teal, soft accents, "close" tier
- **Sunrise Gold** `#E8B44C` — RESERVED for **wins, and the single primary action on a screen**: celebration, the Swell, milestones, and the one button that is the point of the screen. Per brand: "if every ping glows gold, none of them do." Gold is special; don't spend it on ordinary chrome.
  - *"The single primary action"* is the operative half. Scarcity comes from **one gold thing per screen**, not from withholding gold across a flow — the daily loop's Continue is gold on all five steps, and the admin's Save works the same way. A flow that switches primary colour partway reads as a bug, not as a distinction.
  - Corollary: a **disabled** primary is not clay or red, it is muted — border, cream fill, soft ink. It keeps its words and its place. See the watch gate on daily-loop steps 3 and 4.
- **Sand / Cream** `#F4F0E4` — the warm base surface
- **Mist** `#D9ECEE` — palest tint, subtle fills
- Status: **palm/green** = on track, **gold** = close, **clay** `#C9762F` = pursue. **Never red.**

---

## 2. The core moves (what creates "richness")

### A. Gradient hero surfaces, not flat cream
The app's warm cream base stays, but **hero/header zones get depth via gradient**:
- **Navy hero cards** (Eddie's Pick, celebration, the app header on key screens): a subtle vertical gradient `#0C1C2C → #163A54` (Midnight → Deep Water), not flat navy. This echoes the login's sunrise depth in the dark register.
- **Sunrise moments** (celebration, the Swell/streak hero): a warm gradient in the Sunrise Gold family (`#F3E2BD → #E8B44C`), used sparingly, only where the brand earns gold.
- Ordinary page background stays warm cream (`#F4F0E4`) — but consider a *very* subtle top-down warmth (cream → slightly lighter) so it's not dead flat.

### B. Depth through soft, warm shadows
- Cards get a **soft, warm-tinted shadow** (not harsh gray): e.g. `0 4px 16px rgba(12,28,44,0.08)` — navy-tinted, low-opacity, generous blur. This lifts cards off the cream instead of outlining them.
- Layer intentionally: hero cards sit "above" the page; secondary cards sit lower. Two elevation levels, not five.

### C. The sun/wave motif as recurring texture
- The brand mark is a sun over waves. Use that as a **subtle recurring visual signature**: a faint sun-ray or wave arc in the corner of hero cards, a horizon line, the rising-sun in streak/celebration. Low-opacity, decorative, never loud. This is what ties screens to the brand without a logo on every card.
- Keep it whisper-quiet (5–10% opacity tints) — texture, not decoration.

### D. Typography with intention
- **Marcellus** for display/wordmark moments (headings that want brand voice). Load it via next/font if not already.
- **Montserrat SemiBold** for eyebrows/labels (the tracked uppercase teal labels we already use — "TODAY'S FOCUS").
- Body stays clean sans (system/Helvetica). 
- Establish a real scale: hero number (the daily stat, the streak day) should be LARGE and confident (Marcellus or heavy sans, 40px+); eyebrows small and tracked; body comfortable. Right now everything's similar-sized and it reads flat.

### E. Generous, intentional composition
- Less floating-in-void. Group related things, use consistent rhythm (a spacing scale: 4/8/16/24/32).
- The current screens have big empty gaps — fill them with either intentional breathing room (deliberate) or content, not accidental void.

---

## 3. Component patterns (apply consistently everywhere)

- **Hero card** (the day's headline — daily stat, Eddie's Pick, celebration): navy gradient surface, cream text, gold accent, optional faint sun/wave motif, soft shadow, generous padding, one large confident number/headline.
- **Standard card**: cream-white surface (`#FDFBF6` or white), soft warm shadow, 16px radius, comfortable padding. For lists and secondary content.
- **Status row** (the service list): keep the glanceable dot + label, but give rows more presence — subtle divider or hairline, comfortable height, the dot slightly larger and richer (a filled circle with a soft ring, echoing the badge construction).
- **Eyebrow label**: Montserrat SemiBold, uppercase, tracked `0.2em+`, Reef teal. (Already in use — keep.)
- **Big number**: the hero stat / streak day — large, Marcellus or heavy, navy on cream or cream on navy. Confident.
- **Pill / chip** (Sand Dollar balance, tier badge): rounded, soft-filled with the relevant family color, darker text of that family. Never red.
- **Primary button**: Sunrise Gold fill, navy text, soft shadow, comfortable height. (Gold is earned here — it's the primary action.)

---

## 4. Badges (the real brand art — replaces emoji)

Per brand book: **a circle, a dotted inner ring, one motif from the brand's world (sun, wave, palm), flat palette colors. Never metallic gradients, never cartoon trophies, never red. The tier is carried by the ring color** (seafoam → gold).

- Build as **SVG** (crisp at any size, themeable): outer circle, dotted inner ring, a simple flat motif (sun for First Light, wave for the Swells, etc.).
- Ring color = tier: seafoam for early (First Light, 7-day), gold for milestones (30/90-day, Big Wave).
- Earned = full color; unearned = greyed/outline with the same construction.
- These replace the 🌅 emoji placeholders everywhere (streak, celebration, badges wall).

---

## 5. What NOT to do

- Don't use gold for ordinary chrome — it's reserved for the Swell, celebration, milestones, primary CTAs.
- Don't use red, ever — clay for attention.
- Don't add harsh gray shadows or hard outlines — warm, soft, navy-tinted depth.
- Don't make every card a navy hero — one hero per screen (the headline), the rest quieter.
- Don't over-motif — the sun/wave texture is a whisper, not wallpaper.
### Text scales, artwork does not

- The app must be whole at **125%**, which is the slider in Display & Brightness
  — for advisors on a service drive it may be the median setting, not an
  accessibility edge case. 100–150% is clean; 200% is structurally sound
  (nothing clipped, no sideways scroll) even if it is not pretty.
- **Containers grow, text wraps.** `truncate` is only allowed where the full
  value is somewhere else on the same screen. A library that hides its own film
  titles has stopped doing its job.
- **Grids reflow, they do not squeeze.** `auto-fit` with a minimum, so a row of
  three becomes two and then one rather than crushing a currency figure out of
  its box.
- **Artwork is capped.** The mark, the wordmark and the step dots are held at
  their designed size with `min(Xrem, Xpx)`. Somebody who turned text up did it
  to read words; a logo half again as large is not a better logo. Anything that
  is a fixed optical nudge — a negative margin pulling an icon to an edge — is a
  constant in px, never a rem that grows into a page-level overflow.
- **Touch targets are the exception that SHOULD grow.** The bell and the avatar
  get bigger with the text, and that is right; if the header has to become two
  rows to allow it, it becomes two rows.
- `npm run test:larger-text` enforces all of this. It drives headless Chrome at
  an iPhone viewport through every advisor route at four sizes and fails on
  measured truncation, clipping or overflow. A screen that breaks at 125% fails
  there, not in somebody's hand.

### Every control acknowledges a tap

- A phone has **no hover**. `hover:` alone is not feedback on the device this
  product is used on — it is feedback for the laptop it was written on. An audit
  found 142 controls and not one with an `active:` state; the daily loop's
  "Leave for now" was the one somebody finally noticed.
- The press state is **global**, in `styles/brand.css`, not per button. A rule
  per call site is a rule that drifts, because the next button copies the one
  beside it.
- Subtle: a slight dim and a scale small enough to feel rather than watch. A
  control should acknowledge a finger, not perform.
- Opt out with `data-no-press` where a press state would be wrong — a full-bleed
  scrim, where dimming reads as the sheet flinching.
- **If tapping starts something slow, say so.** A press state acknowledges the
  tap; it does not cover a second of navigation. Anything that leaves the screen
  gets a pending label.
- iOS only sends `:active` once the document has a touch listener. There is one
  in `app/layout.tsx` and it exists for no other reason.

- Don't break the mobile-first rule — depth must not cost legibility or tap-target size on a phone.

---

## 6. Application order

1. **Pilot: the advisor daily screen** — it has every element type (hero stat, Eddie's Pick hero, service list, eyebrows, pills). Perfect the language here.
2. Review the rendered pilot, refine this spec.
3. **Badges as real SVG art** (concrete, satisfying, used across streak/celebration/badges).
4. **The celebration screen** (the emotional peak — deserves the most gold/sunrise richness).
5. Roll the language across: streak, manager, admin, content CMS, profile.
6. Load **Marcellus** so the display typography is brand-accurate.

The tokens for all of this should live in `styles/brand.css` / the Tailwind theme as reusable classes (`.ediagd-hero`, `.ediagd-card`, shadow tokens, gradient tokens) so screens inherit the language rather than each re-implementing it — the same "one source of truth" discipline we've used for logic.
