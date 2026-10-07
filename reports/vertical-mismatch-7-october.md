# What the phone actually plays

*7 October 2026. Read-only. Nothing re-cut, nothing re-derived.*

Ryan's phone plays the first lesson of **The MOC Warranty Program** from 0:00 and
hears *"…ever wrote. I did do one afternoon…"*. My verification of that film said
0.47 s of air then Aloha.

**Both are correct. They are different renditions of the same row.**

---

## Which row the slot serves

The course is `048fe2b4` **The MOC Warranty Program**, 18 modules. Module
`sort_order = 1` is **Coverage is Key — Opener**, content
`8b48d7b3-1816-4061-ae60-8a5d250ce5c3`. Part 1 is module 2.

My earlier 0.47 s measurement was of **Coverage is Key, Part 1** — a different
row, and the wrong one for this question.

---

## The two renditions, first 10 s each

Pulled signed, by the same playback ids the player uses.

| | `mux_playback_id` (landscape) | `vertical_playback_id` (phone) |
|---|---|---|
| id | `uzD01PoY6ebg…` | `dQR2OKX7F2fY…` |
| asset | `bkojJ5ulpE02KC…` | `s2fOSaVONrzArb…` |
| duration | **79.59 s** | **77.90 s** |
| aspect | 16:9, 3840×2160 | 9:16, 1080×1920 |
| created | 1791324713 | 1791324832 |

**Landscape, first words:**
> `Aloha!@0.0 Welcome@1.54 to@1.76 Coverage@2.18 is@2.54 Key.@2.88 This@3.56 was@3.68 the@3.86 second@4.1 class@4.44 I@4.92 ever@5.12 wrote.@5.32 I@6.08 did@6.1 so@6.4 one@6.7`

**Vertical, first words:**
> `I@0.0 did@1.1 so@1.36 one@1.72 afternoon@1.94 in@2.46 southeast@2.84 Texas@3.24 after@3.78 I@4.44 was@4.66 challenged@4.82 by@5.34 a@5.7 manager@5.88`

**The vertical begins at the landscape's 6.08 s.** The greeting and the opening
sentence are not in it. What Ryan heard — *"…ever wrote. I did do one
afternoon…"* — is exactly the landscape at 5.3–6.7 s, which is where the
vertical starts.

Both renditions **end** on the same words: *"…what coverage is key is all about.
Enjoy. Mahalo."* So the vertical is not the uncut original; it has the same
ending and a missing opening.

---

## The three checks asked for

**1. Does `vertical_playback_id` belong to the new clipped asset?**

It belongs to its **own** asset, `s2fOSaVO…`, created 119 seconds *after* the
clipped landscape asset — so it is not the pre-trim vertical. Across all 447
published films there are **447 distinct `mux_playback_id` and 447 distinct
`vertical_playback_id`**, with **zero shared between films** and **zero ids used
as both**. So it is not another film's vertical either.

The id is right. The content inside it is wrong.

**2. Did the vertical derive apply its own start offset?**

No. `scripts/derive-vertical.ts` contains no `-ss`, no `start_time`, and no seek
of any kind. It reads `row.mux_asset_id` — the current master — and runs
`crop=ih*9/16:ih,scale=1080:1920`. The offset is not coming from the derive's
own arguments.

What it *does* do is prefer Mux's **master/mezzanine URL** over HLS when Mux will
prepare one (`sourceUrl()`), falling back to the HLS top rendition. That is the
only place a different timeline could enter, and it is the first thing to look at
— but I have not proven it, and said so rather than guessing.

**3. A/V drift, per rendition**

Measured from each container's per-stream `start_time`. PTS sampling at
start/middle/end was discarded as an instrument: the vertical's video values came
back as exactly 5.0167 + 0 / 35 / 70, which is GOP quantisation, not drift.

| rendition | audio vs video start |
|---|---:|
| Opener — landscape | **−0.004 s** |
| Opener — vertical | **−0.079 s** |
| Part 1 — landscape | −0.017 s |
| Part 1 — vertical | −0.079 s |

**All four are within 80 ms. There is no A/V desync in any rendition.** The
kung-fu effect is not lip-sync — it is the vertical playing a different cut.

One loose end worth recording: the vertical's "Mahalo" lands 1.05 s later than a
constant 6.08 s offset predicts, which would imply a ~1.4% rate difference rather
than a pure shift. Both of those numbers come from whisper on 10-second windows,
so the 1.05 s is near the edge of that instrument's noise and I would not build
on it without a better measurement.

---

## Scope: how many films does this affect

Every published film's vertical asset duration was compared against its landscape
asset duration (447 films, both read from Mux).

| | films |
|---|---:|
| vertical duration disagrees with landscape by > 1 s | **6** |
| …of those, films this pass cut | 5 |
| …of those, films this pass never touched | 1 |

Duration alone cannot catch a same-length vertical that is offset, so eight cut
films whose durations **do** agree were sampled and their first words compared
across renditions: **six matched word-for-word, two were silent in both**. No
mismatch where durations agree, so the duration check is a sound proxy.

Comparing first words across renditions for all six mismatches:

| film | landscape opens | vertical opens | same? |
|---|---|---|:--:|
| **Coverage is Key — Opener** | *Aloha! Welcome to Coverage is Key…* | *I did so one afternoon in southeast…* | **NO** |
| **Name Tag — Opener** | *Aloha! Welcome to What's in a Name* | *each burned out service advisors. However, nametag…* | **NO** |
| After-MPI | *Aloha! Let's offer that rodent deterrent…* | same | yes |
| 30,000 Mile Dealer Upsell Menu (2769) | *Aloha, 30,000 miles. Look at what…* | same | yes |
| 25,000 Mile Dealer Upsell Menu (2749) | *Aloha, 25,000 miles, and this rung…* | same | yes |
| On the Drive, Part 2 | *Aloha! You've read the tire, you shared…* | same | yes |

> **Two films of 447 play a different cut on a phone than on a desktop, and both
> are Openers.** The other four differ in encoded length by 1–2.4 s while playing
> the same content from the same first word.

`After-MPI` is in that list and was **never cut by this pass** — so a
vertical/landscape length disagreement is not something the trim introduced.

---

## What this does and does not say about the trim pass

It does not exonerate the trim: `Name Tag — Opener` was cut by this pass and its
vertical is wrong. It does bound it: 2 films of 447, both Openers, and the defect
is in the **vertical rendition**, not in the cut. The landscape of both films
opens correctly on "Aloha".

It also means my earlier report was measuring the wrong artifact. Every check in
this pass — length, captions, and the word-level verifier — read
`mux_playback_id`. **Not one of them ever read the rendition a phone plays.**
That is the same shape as every other failure here: a check that was correct
about the thing it looked at, and silent about the viewer it was for.

---

## Not done, pending Ryan

Nothing re-cut, nothing re-derived, as instructed. The obvious next step is to
re-derive the two Openers' verticals and verify the result on the
`vertical_playback_id`, but the mechanism is not yet proven and re-deriving
before it is understood risks reproducing it.
