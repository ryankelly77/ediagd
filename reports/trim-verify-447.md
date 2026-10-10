# The rendition a phone plays: 447 films, one reading

*9 October 2026. For every published film, the rendition a phone actually gets —
the vertical where `vertical_status = 'ready'`, otherwise the master letterboxed,
which is the rule `renditionsFor` and `pickRendition` apply — read once at a
10-second window at each end. No escalation ladder: one window, one reading.*

| | films |
|---|---:|
| **pass — nothing to do** | **406** |
| **cut, verified before the swap** | **34** |
| unpublished, Mitch reshoots | 2 |
| left alone, and why is said | 5 |
| total | 447 |

*Of the 62 on Ryan's list: **34 cut**, **21 passed**, 
**2 unpublished**, **5 left alone**. The 385 that passed the 9 October
reading are untouched and their rows are unchanged below.*

*Of those 21 passes, **18 stand on the 9 October report's own evidence** and
**3 stand on a fresh reading of the master that CONTRADICTS the report** — the master won,
and nothing else corroborates it. Those rows say so individually. The distinction matters: the
first group needed no measurement, and the second is where the report was found to be wrong
about the very thing it put the film on the list for.*

Tail judged at **1.5s**, the standard `trim-measure.ts` built this library to.
**106 films** have a tail between 1.0s and 1.5s — they pass here and would not
at the 1.0s the brief asked for.

The head comparison is made by audio **energy**, not by whisper's word-start:
built on the latter it falsely failed *10,000 Mile Dealer Upsell Menu, Part 4*,
which reads `alohaAt` 0.58 on the master and 0.00 on the vertical with the same
transcript. Across the 414 films whose vertical was compared, whisper's delta
exceeds 0.5s on 7 films and energy's on 1 — so whisper would have staled 7 good crops.

**Re-counted after this batch, 2026-10-10:** of 445 published films, a phone gets
the vertical on **379** and the letterboxed master on **66** (66 `stale`, 0 with no crop).

The 9 October reading counted 413 and 34, of a population of 447 that included the two
films now unpublished. **32 of the stale crops are this batch's**, verified one by one
against the rows — every cut marks its crop `stale`, because that crop was taken from the
master the cut replaced. So the master a phone now letterboxes is the asset this batch read
before it went live, which is the right way round. Re-deriving the crops is t29 and
deliberately not this pass.

**head verified** / **tail verified** — these mean TWO DIFFERENT THINGS and the outcome
column tells you which. On a row whose outcome is `pass` from the 9 October reading, they are
that reading's numbers: the head is the *gap* between the served rendition and the master, by
energy, 0.00 where the served rendition *is* the master; the tail is how far the served
rendition runs past Mahalo. On a row this batch **cut**, **re-measured**, or **left alone**,
they are the ABSOLUTE air read on the master at a 10-second window — seconds of silence before
the first sound and after the last — because the crop is stale and the master is what a phone
now plays. An absolute and a gap are not comparable; do not read down these two columns as one
series.
**master cut** — whether anything has been taken off this master, from either
ledger. *no sign-off* means no Mahalo was heard, so the tail is kept by rule.
**vertical** — `ready` (a phone plays the crop), `stale` (a phone letterboxes the
master), `none` (no crop exists).

| film | series | master cut | head verified | tail verified | vertical | outcome |
|---|---|---|---:|---:|---|---|
| 10,000 Mile Dealer Upsell Menu | Menu | yes | 0.04 | 0.74 | ready | pass |
| 10,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.76 | ready | pass |
| 10,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.76 | ready | pass |
| 10,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.10 | 0.80 | ready | pass |
| 100,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.45 | ready | pass |
| 100,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.02 | 0.76 | ready | pass |
| 100,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.01 | 0.90 | ready | pass |
| 100,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.80 | ready | pass |
| 105,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.00 | 0.93 | ready | pass |
| 105,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.92 | ready | pass |
| 110,000 Mile Dealer Upsell Menu | Menu | yes | 0.01 | 0.45 | ready | pass |
| 120,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.78 | ready | pass |
| 120,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.69 | stale | pass |
| 120,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.01 | 0.82 | ready | pass |
| 120,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.78 | ready | pass |
| 15,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.00 | 0.69 | stale | pass |
| 15,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.79 | ready | pass |
| 15,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.01 | 0.76 | ready | pass |
| 15,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.59 | 0.70 | stale | cut — 8.76s past Mahalo became 0.70s |
| 15,000 Mile Dealer Upsell Menu, Part 5 | Menu | yes | 0.01 | 0.76 | ready | pass |
| 150,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.07 | — | ready | pass — opens "150" at 0.07s, Mitch already talking |
| 150,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.84 | ready | pass |
| 150,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.01 | 0.94 | ready | pass |
| 150,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.91 | ready | pass |
| 20 Years to Build a Reputation | Mindset | no sign-off | — | 0.32 | ready | pass — closes "pride.", not Mahalo; tail 0.32s is within standard |
| 20,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.75 | ready | pass |
| 20,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.02 | 0.78 | ready | pass |
| 20,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.02 | 0.90 | ready | pass |
| 20,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.77 | ready | pass |
| 25,000 Mile Dealer Upsell Menu (2748) | Menu | no sign-off | — | — | — | unpublished — the take was never finished; Mitch reshoots |
| 25,000 Mile Dealer Upsell Menu (2749) | Menu | yes | 0.00 | 0.70 | stale | pass |
| 25,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.72 | ready | pass |
| 25,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.48 | ready | pass |
| 25,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.02 | 0.80 | ready | pass |
| 25,000 Mile Dealer Upsell Menu, Part 5 | Menu | yes | 0.02 | 0.80 | ready | pass |
| 30 Second Walk-Around, Part 1, Before You Go Outside | Craft | yes | 0.02 | 0.53 | ready | pass |
| 30 Second Walk-Around, Part 2, Four Goals, Two Words | Craft | yes | 0.28 | 0.67 | stale | cut — 6.36s of air at the head became 0.28s |
| 30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone | Craft | yes | 0.20 | 0.75 | stale | cut — 4.86s past Mahalo became 0.75s |
| 30 Second Walk-Around, Part 4, Step 3, Start It | Craft | yes | 0.01 | 0.82 | ready | pass |
| 30 Second Walk-Around, Part 5, Step 4, Wheels to the Left | Craft | yes | 0.01 | 0.81 | ready | pass |
| 30 Second Walk-Around, Part 6, Step 5, Washer Fluid | Craft | yes | 0.08 | 0.78 | ready | pass |
| 30 Second Walk-Around, Part 7, The Four Step Close | Craft | yes | 0.01 | 0.84 | ready | pass |
| 30 Second Walk-Around, Part 8, Step 6 and 7, Miles, Shut It Off and Tires | Craft | yes | 0.01 | 0.79 | ready | pass |
| 30 Second Walk-Around, Part 9, 42 seconds | Craft | yes | 0.04 | 0.74 | ready | pass |
| 30,000 Mile Dealer Upsell Menu (2760) | Menu | yes | 0.01 | 0.81 | ready | pass |
| 30,000 Mile Dealer Upsell Menu (2769) | Menu | yes | 0.00 | 0.71 | stale | pass |
| 30,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.59 | ready | pass |
| 30,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.44 | ready | pass |
| 30,000 Mile Dealer Upsell Menu, Part 5 | Menu | yes | 0.00 | 0.74 | ready | pass |
| 35,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.00 | 0.82 | ready | pass |
| 35,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.02 | 0.78 | ready | pass |
| 35,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.01 | 0.78 | ready | pass |
| 40,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.79 | ready | pass |
| 40,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.77 | ready | pass |
| 40,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.55 | 0.69 | stale | cut — 7.38s past Mahalo became 0.69s |
| 45,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.75 | ready | pass |
| 45,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.02 | 0.76 | ready | pass |
| 45,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.80 | ready | pass |
| 45,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.00 | 0.79 | ready | pass |
| 5,000/7,500 Mile Dealer Upsell Menu (2714) | Menu | yes | 0.01 | 0.80 | ready | pass |
| 5,000/7,500 Mile Dealer Upsell Menu (2716) | Menu | yes | 0.94 | 0.74 | stale | cut — 7.70s past Mahalo became 0.74s |
| 50,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.93 | ready | pass |
| 50,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.78 | ready | pass |
| 50,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.02 | 0.76 | ready | pass |
| 50,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.81 | ready | pass |
| 55,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.82 | ready | pass |
| 55,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.28 | 0.70 | stale | cut — 6.01s past Mahalo became 0.70s |
| 55,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.45 | 0.71 | stale | cut — 6.77s past Mahalo became 0.71s |
| 60,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.91 | ready | pass |
| 60,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.80 | ready | pass |
| 60,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.82 | ready | pass |
| 60,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.10 | 0.76 | ready | pass |
| 65,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.80 | ready | pass |
| 65,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.77 | ready | pass |
| 70,000 Mile Dealer Upsell Menu, Part 2 (2821) | Menu | no sign-off | — | — | — | unpublished — the take was never finished; Mitch reshoots |
| 70,000 Mile Dealer Upsell Menu, Part 2 (2822) | Menu | yes | 0.04 | 0.67 | ready | pass |
| 75,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.87 | ready | pass |
| 75,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.90 | ready | pass |
| 75,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.81 | ready | pass |
| 75,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.92 | ready | pass |
| 80,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.00 | 0.80 | ready | pass |
| 80,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.82 | ready | pass |
| 85,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.04 | 0.75 | ready | pass |
| 90,000 Mile Dealer Upsell Menu | Menu | yes | 0.01 | 0.62 | ready | pass |
| 90,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.80 | ready | pass |
| 90,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.38 | 0.76 | stale | cut — 4.66s past Mahalo became 0.76s |
| 95,000 Mile Dealer Upsell Menu | Menu | yes | 0.02 | 0.83 | ready | pass |
| 99% of People | Mindset | yes | 0.02 | 1.12 | ready | pass |
| A Quote on Every Vehicle | Pitches by Op Code | yes | 0.01 | 0.76 | ready | pass |
| A Tree Grows in Two Directions | Mindset | yes | 0.01 | 0.95 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.68 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 1.21 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.98 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 0.83 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 0.82 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 1.10 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.04 | 1.06 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 0.91 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 0.91 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 0.96 | ready | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 0.98 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.02 | 1.26 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.92 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.00 | 1.27 | stale | pass |
| After-MPI | Pitches by Op Code | no | 0.02 | 0.78 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.89 | ready | pass |
| After-MPI | Pitches by Op Code | no sign-off | — | 0.30 | ready | pass — closes "do.", not Mahalo; tail 0.30s is within standard |
| After-MPI | Pitches by Op Code | yes | 0.00 | 1.16 | stale | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.77 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.77 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.73 | ready | pass |
| After-MPI, Part 1 | Pitches by Op Code | yes | 0.04 | 1.38 | ready | pass |
| After-MPI, Part 1 | Pitches by Op Code | yes | 0.08 | 0.73 | ready | pass |
| After-MPI, Part 2 | Pitches by Op Code | yes | 0.28 | 0.27 | ready | pass — the master does not reproduce the report; tail 0.27s |
| After-MPI, Part 2 | Pitches by Op Code | yes | 0.00 | 0.91 | ready | pass |
| All for One and One for All Versus Every Man for Himself | Mindset | yes | 0.06 | 0.80 | ready | pass |
| Always Keep Going | Mindset | yes | 0.00 | 0.95 | ready | pass |
| Amateur vs. Professional | Mindset | yes | 0.01 | 1.37 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.00 | 0.76 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 1.00 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.04 | 1.07 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.01 | 1.16 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 1.47 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 1.13 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.01 | 1.10 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 0.94 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.00 | 0.44 | stale | pass |
| At the Kiosk | Pitches by Op Code | no sign-off | — | — | ready | left alone — could not be read twice |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 1.14 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.00 | 1.46 | stale | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 1.00 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 0.90 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.66 | 0.75 | stale | cut — 1.41s past Mahalo became 0.75s |
| At the Kiosk | Pitches by Op Code | yes | 0.02 | 0.48 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.03 | 0.73 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.04 | 0.73 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 0.96 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.00 | 0.80 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.02 | 0.78 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.01 | 0.76 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.03 | 0.91 | ready | pass |
| At the Kiosk, Part 1 | Pitches by Op Code | yes | 0.00 | 0.73 | stale | pass |
| At the Kiosk, Part 2 | Pitches by Op Code | yes | 0.26 | 0.75 | stale | cut — 1.71s past Mahalo became 0.75s |
| Be Better Than That | Mindset | yes | 0.00 | 1.43 | ready | pass |
| Be the Reason Someone Believes | Mindset | yes | 0.02 | 1.03 | ready | pass |
| Brave Enough | Mindset | yes | 0.00 | 1.03 | stale | pass |
| Buffalos and the Cows | Mindset | no sign-off | — | 0.44 | stale | pass — closes "day", not Mahalo; tail 0.44s is within standard |
| Build the Habits You Admire | Mindset | yes | 0.04 | 1.11 | ready | pass |
| Carpe Diem | Mindset | yes | 0.01 | 1.18 | ready | pass |
| Choices | Mindset | yes | 0.01 | 1.19 | ready | pass |
| Compare Yourself to Yesterday | Mindset | yes | 0.00 | 1.09 | stale | pass |
| Confidence | Mindset | yes | 0.01 | 1.15 | ready | pass |
| Consistency Doesn't Guarantee Success | Mindset | yes | 0.06 | 1.32 | ready | pass |
| Coverage is Key — Closer | Craft | yes | 0.17 | 0.75 | ready | pass |
| Coverage is Key — Opener | Craft | yes | 0.00 | 0.69 | stale | pass |
| Coverage is Key, Part 1 | Craft | yes | 0.01 | 0.78 | ready | pass |
| Coverage is Key, Part 10 | Craft | yes | 0.00 | 0.92 | ready | pass |
| Coverage is Key, Part 2 | Craft | yes | 0.02 | 0.78 | ready | pass |
| Coverage is Key, Part 3 | Craft | yes | 0.01 | 0.78 | ready | pass |
| Coverage is Key, Part 4 | Craft | yes | 0.05 | 0.59 | ready | pass |
| Coverage is Key, Part 5 | Craft | yes | 0.02 | 0.78 | ready | pass |
| Coverage is Key, Part 6 | Craft | yes | 0.00 | 0.84 | ready | pass |
| Coverage is Key, Part 7 | Craft | yes | 0.02 | 0.82 | ready | pass |
| Coverage is Key, Part 8 | Craft | yes | 0.01 | 0.79 | ready | pass |
| Coverage is Key, Part 9 | Craft | yes | 0.00 | 0.72 | ready | pass |
| Create the Life You Can't Wait to Wake Up To | Mindset | yes | 0.31 | 1.53 | ready | left alone — the clip was refused before the swap |
| CSI — CSI Is Not a Score, Part 1 | Craft | yes | 0.02 | 0.73 | ready | pass |
| CSI — Prior to Arrival, Part 2 | Craft | yes | 0.23 | 0.70 | stale | cut — 5.33s past Mahalo became 0.70s |
| CSI — The 2 Week and 2 Month Follow-Ups, Part 6 | Craft | yes | 0.01 | 0.68 | ready | pass |
| CSI — The 2222 Follow-Up, Part 5 | Craft | yes | 0.02 | 0.78 | ready | pass |
| CSI — Upon Arrival, Part 3 | Craft | yes | 0.02 | 0.75 | ready | pass |
| CSI — Upon Departure, Part 4 | Craft | yes | 0.01 | 0.76 | ready | pass |
| Day One or One Day | Mindset | yes | 0.01 | 1.26 | ready | pass |
| Dealer Upsell Menus and Interval Charts — Opener | Craft | no sign-off | — | 3.44 | ready | pass — closes "need.", not Mahalo; tail 3.44s is within standard |
| Decide What to Do With the Time Given | Mindset | yes | 0.01 | 0.97 | ready | pass |
| Demand Excellence | Mindset | yes | 0.00 | 0.92 | ready | pass |
| Did I Get Better Today? | Mindset | no sign-off | — | 0.56 | ready | pass — closes "has.", not Mahalo; tail 0.56s is within standard |
| Diesel, Part 1 | Menu | yes | 0.01 | 0.89 | ready | pass |
| Diesel, Part 2 | Menu | yes | 0.00 | 0.79 | ready | pass |
| Diesel, Part 3 | Menu | yes | 0.01 | 0.80 | ready | pass |
| Diesel, Part 4 | Menu | yes | 0.10 | 0.74 | stale | cut — 4.83s past Mahalo became 0.74s |
| Diesel, Part 5 | Menu | yes | 0.48 | 0.74 | stale | cut — 1.55s past Mahalo became 0.74s |
| Diesel, Part 6 | Menu | yes | 0.55 | 0.76 | stale | cut — 4.60s past Mahalo became 0.76s |
| Discipline, Addictive Discipline, Obsession | Mindset | yes | 0.01 | 0.79 | ready | pass |
| Diversification & Ignorance | Mindset | yes | 0.06 | — | ready | pass — opens "Diversification" at 0.06s, Mitch already talking |
| Don't Quit, Someone Needs Who You're Becoming | Mindset | yes | 0.00 | 1.33 | ready | pass |
| Don't Tell Me You Can't | Mindset | yes | 0.01 | 0.63 | ready | pass |
| Doubt Is a Strange Thing | Mindset | yes | 0.02 | 1.30 | ready | pass |
| EV Series, Part 1 | Menu | yes | 0.00 | 0.76 | ready | pass |
| EV Series, Part 2 | Menu | yes | 0.11 | 0.78 | ready | pass |
| EV Series, Part 3 | Menu | yes | 0.00 | 0.69 | stale | pass |
| EV Series, Part 4 | Menu | yes | 0.02 | 0.80 | ready | pass |
| Every Day Is a Great Day to Be Mitch | Mindset | yes | 0.01 | 1.05 | ready | pass |
| Every Step of the Road | Mindset | yes | 0.01 | 1.26 | ready | pass |
| Everybody, Anybody, Somebody and Nobody | Mindset | no sign-off | — | 2.94 | ready | pass — closes "pointing?", not Mahalo; tail 2.94s is within standard |
| Fearful When Others Are Greedy | Mindset | yes | 0.01 | 0.70 | ready | pass |
| Four Step Close — Closer | Craft | yes | 0.02 | 0.75 | ready | pass |
| Four Step Close — Opener | Craft | yes | 0.09 | 0.76 | ready | pass |
| Four Step Close, Part 1 | Craft | yes | 0.00 | 0.64 | ready | pass |
| Four Step Close, Part 10 | Craft | yes | 0.14 | 0.87 | ready | pass |
| Four Step Close, Part 2 | Craft | yes | 0.00 | 0.70 | stale | pass |
| Four Step Close, Part 3 | Craft | yes | 0.01 | 0.81 | ready | pass |
| Four Step Close, Part 4 | Craft | yes | 0.41 | 0.74 | stale | cut — 5.54s past Mahalo became 0.74s |
| Four Step Close, Part 5 | Craft | yes | 0.09 | 0.75 | stale | cut — 2.74s past Mahalo became 0.75s |
| Four Step Close, Part 6 | Craft | yes | 0.00 | 1.06 | ready | pass |
| Four Step Close, Part 7 | Craft | yes | 0.30 | 0.56 | stale | cut — 3.20s of air at the head became 0.30s |
| Four Step Close, Part 8 | Craft | yes | 0.01 | 0.79 | ready | pass |
| Four Step Close, Part 9 | Craft | yes | 0.02 | 0.86 | ready | pass |
| Four Things You Can Stop Doing | Mindset | yes | 0.34 | 1.44 | ready | left alone — the clip was refused before the swap |
| Four Things You Can't Get Back | Mindset | yes | 0.73 | 0.33 | stale | cut — 1.42s past Mahalo became 0.33s |
| Get Better | Mindset | yes | 0.00 | 1.42 | ready | pass |
| Get the Hell Out of Here, Part 1 | Craft | yes | 0.01 | 0.77 | ready | pass |
| Get the Hell Out of Here, Part 2 | Craft | yes | 0.07 | 0.78 | ready | pass |
| Get the Hell Out of Here, Part 3 | Craft | yes | 0.05 | 0.76 | ready | pass |
| Get the Hell Out of Here, Part 4 | Craft | yes | 0.06 | 0.77 | ready | pass |
| Get the Hell Out of Here, Part 5 | Craft | yes | 0.02 | 0.74 | ready | pass |
| Get the Hell Out of Here, Part 6 | Craft | yes | 0.01 | 0.74 | ready | pass |
| Get the Hell Out of Here, Part 7 | Craft | yes | 0.01 | 0.75 | ready | pass |
| Get the Hell Out of Here, Part 8 | Craft | yes | 0.06 | 0.74 | ready | pass |
| Get the Hell Out of Here, Part 9 | Craft | yes | 0.05 | 0.78 | ready | pass |
| Greatness Is Inside | Mindset | yes | 0.01 | 1.37 | ready | pass |
| Hang With People Better Than You | Mindset | yes | 0.02 | 1.06 | ready | pass |
| Happy Kid, Happier Manager | Mindset | yes | 0.00 | 1.22 | ready | pass |
| Hard Worker vs. Working Hard | Mindset | yes | 0.01 | 1.26 | ready | pass |
| Have Patience with Yourself | Mindset | yes | 0.00 | 1.18 | ready | pass |
| I Do It Anyways | Mindset | yes | 0.01 | 1.29 | ready | pass |
| I Looked in Your Cup | Mindset | yes | 0.00 | 1.19 | ready | pass |
| I'd Rather Be Tired Than Wondering | Mindset | yes | 0.02 | 0.96 | ready | pass |
| Ideas, Events, People | Mindset | yes | 0.01 | 0.88 | ready | pass |
| If You Have to Ask | Mindset | yes | 0.02 | 1.28 | ready | pass |
| If You Want Average | Mindset | yes | 0.01 | 0.72 | ready | pass |
| If Your Life Was a Movie | Mindset | yes | 0.00 | 0.91 | ready | pass |
| It Couldn't Be Done | Mindset | yes | 0.01 | 1.09 | ready | pass |
| Language of Gratitude | Mindset | yes | 0.02 | 0.83 | ready | pass |
| Lasting Impressions — Closer | Craft | yes | 0.06 | — | ready | pass — opens "That's" at 0.06s, Mitch already talking |
| Lasting Impressions — Opener | Craft | yes | 0.01 | 0.76 | ready | pass |
| Lasting Impressions, Part 1 | Craft | yes | 0.01 | 0.81 | ready | pass |
| Lasting Impressions, Part 10 | Craft | yes | 0.00 | 0.76 | ready | pass |
| Lasting Impressions, Part 11 | Craft | yes | 0.02 | 0.80 | ready | pass |
| Lasting Impressions, Part 12 | Craft | yes | 0.30 | 0.54 | stale | cut at the greeting — opened on "Prospect", now "Aloha," with 0.30s of air |
| Lasting Impressions, Part 2 | Craft | yes | 0.00 | 0.76 | stale | cut — 1.54s past Mahalo became 0.76s |
| Lasting Impressions, Part 3 | Craft | yes | 0.02 | 0.82 | ready | pass |
| Lasting Impressions, Part 4 | Craft | yes | 0.02 | 0.72 | ready | pass |
| Lasting Impressions, Part 5 | Craft | yes | 0.43 | 0.74 | stale | cut — 5.80s past Mahalo became 0.74s |
| Lasting Impressions, Part 6 | Craft | yes | 0.01 | 0.47 | ready | pass |
| Lasting Impressions, Part 7 | Craft | yes | 0.00 | 0.69 | stale | pass |
| Lasting Impressions, Part 8 | Craft | yes | 0.00 | 0.70 | stale | pass |
| Lasting Impressions, Part 9 | Craft | yes | 0.18 | 0.79 | ready | pass |
| Lazy People vs. Winners | Mindset | yes | 0.00 | 1.33 | ready | pass |
| Mediocre People Don't Like High Achievers | Mindset | yes | 0.00 | 1.44 | ready | pass |
| Menu Wrap-Up, Part 1 | Craft | yes | 0.30 | 0.65 | stale | cut at the greeting — opened on "coverage.", now "Aloha." with 0.30s of air |
| Menu Wrap-Up, Part 2 | Craft | yes | 0.00 | 0.90 | ready | pass |
| Menus — Closer | Craft | yes | 0.02 | 0.78 | ready | pass |
| More Life | Mindset | yes | 0.00 | 1.31 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 1.15 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 1.15 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.02 | 1.31 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.00 | 0.94 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 1.23 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 1.12 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.30 | 0.60 | stale | cut — 0.81s of air at the head became 0.30s |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 0.92 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.04 | 1.12 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.04 | 0.86 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 0.75 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.91 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.00 | 0.82 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.15 | 1.08 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.72 | ready | pass |
| MPI Setup | Pitches by Op Code | no sign-off | 0.06 | — | ready | pass — opens "Let's" at 0.06s, Mitch already talking |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.92 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.35 | 0.86 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.55 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.00 | 1.21 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 1.31 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.06 | 0.52 | ready | pass |
| Name Tag — Closer | Craft | yes | 0.07 | — | ready | pass — opens "That's" at 0.07s, Mitch already talking |
| Name Tag — Opener | Craft | yes | 0.00 | 0.67 | stale | pass |
| Name Tag, Part 1 | Craft | yes | 0.01 | 0.75 | ready | pass |
| Name Tag, Part 10 | Craft | yes | 0.00 | 0.71 | ready | pass |
| Name Tag, Part 2 | Craft | yes | 0.01 | 0.94 | ready | pass |
| Name Tag, Part 3 | Craft | yes | 0.02 | 0.82 | ready | pass |
| Name Tag, Part 4 | Craft | yes | 0.01 | 0.78 | ready | pass |
| Name Tag, Part 5 | Craft | yes | 0.00 | 0.96 | ready | pass |
| Name Tag, Part 6 | Craft | no sign-off | — | 0.23 | ready | pass — closes "advisor.", not Mahalo; tail 0.23s is within standard |
| Name Tag, Part 7 | Craft | yes | 0.00 | 0.81 | ready | pass |
| Name Tag, Part 8 | Craft | yes | 0.00 | 0.65 | ready | pass |
| Name Tag, Part 9 | Craft | yes | 0.62 | 0.75 | stale | cut — 7.00s past Mahalo became 0.75s |
| Never Lose Money | Mindset | no sign-off | — | 0.41 | stale | pass — closes "fee...", not Mahalo; tail 0.41s is within standard |
| Nick Saban's 3 Rules | Mindset | yes | 0.00 | 1.27 | ready | pass |
| Objections | Pitches by Op Code | yes | 0.00 | 0.96 | stale | pass |
| Objections | Pitches by Op Code | yes | 0.04 | 0.98 | ready | pass |
| Objections | Pitches by Op Code | yes | 0.39 | 0.58 | ready | pass |
| Objections | Pitches by Op Code | yes | 0.01 | 0.75 | ready | pass |
| Objections | Pitches by Op Code | yes | 0.01 | 0.76 | ready | pass |
| Objections | Pitches by Op Code | yes | 0.00 | 1.29 | stale | pass |
| Objections | Pitches by Op Code | yes | 0.01 | 1.12 | ready | pass |
| Objections | Pitches by Op Code | yes | 0.01 | 1.06 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.00 | 0.87 | stale | pass |
| On the Drive | Pitches by Op Code | yes | 0.17 | 0.73 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 0.70 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.49 | 1.25 | ready | pass — the master does not reproduce the report; tail 1.25s |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.25 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.04 | 1.29 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.03 | 1.06 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.00 | 0.79 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.80 | 0.20 | stale | cut — 1.62s past Mahalo became 0.20s |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.38 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.07 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.00 | 1.05 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 0.55 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.32 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 0.77 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.01 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.34 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.04 | 1.01 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 0.62 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.14 | ready | pass |
| On the Drive, Part 1 | Pitches by Op Code | yes | 0.02 | 0.78 | ready | pass |
| On the Drive, Part 1 | Pitches by Op Code | yes | 0.01 | 0.82 | ready | pass |
| On the Drive, Part 1 | Pitches by Op Code | yes | 0.01 | 0.60 | ready | pass |
| On the Drive, Part 1 | Pitches by Op Code | yes | 0.01 | 0.52 | ready | pass |
| On the Drive, Part 1 | Pitches by Op Code | yes | 0.04 | 0.72 | ready | pass |
| On the Drive, Part 1 | Pitches by Op Code | yes | 0.01 | 0.79 | ready | pass |
| On the Drive, Part 2 | Pitches by Op Code | yes | 0.00 | 1.49 | ready | pass |
| On the Drive, Part 2 | Pitches by Op Code | yes | 0.14 | 0.75 | stale | cut — 1.33s past Mahalo became 0.75s |
| On the Drive, Part 2 | Pitches by Op Code | yes | 0.00 | 1.06 | stale | pass |
| On the Drive, Part 2 | Pitches by Op Code | yes | 0.01 | 1.41 | ready | pass |
| On the Drive, Part 2 | Pitches by Op Code | yes | 0.00 | 0.70 | stale | pass |
| On the Drive, Part 3 | Pitches by Op Code | yes | 0.01 | 0.94 | ready | pass |
| One Focus | Mindset | yes | 0.01 | 0.66 | ready | pass |
| Overcoming Objections, Part 1 | Craft | yes | 0.02 | 1.22 | ready | pass |
| Overcoming Objections, Part 2 — How to Take a No | Craft | yes | 0.01 | 1.27 | ready | pass |
| Owning Portions of Businesses | Mindset | yes | 0.02 | 1.17 | ready | pass |
| Part 2 | Pitches by Op Code | no | 0.02 | 1.26 | ready | pass |
| Perfect Practice Makes Perfect | Mindset | yes | 0.02 | 1.10 | ready | pass |
| Perish Attempting the Great and Impossible | Mindset | yes | 0.00 | 1.31 | ready | pass |
| Phones and Tones — Closer | Craft | yes | 0.06 | 0.73 | ready | pass |
| Phones and Tones — Opener | Craft | yes | 0.30 | 0.77 | ready | pass |
| Phones and Tones, Part 1 | Craft | yes | 0.17 | 0.87 | ready | pass |
| Phones and Tones, Part 10 | Craft | yes | 0.01 | 0.81 | ready | pass |
| Phones and Tones, Part 11 | Craft | yes | 0.02 | 0.77 | ready | pass |
| Phones and Tones, Part 12 | Craft | yes | 0.01 | 0.77 | ready | pass |
| Phones and Tones, Part 2 | Craft | yes | 0.01 | 0.92 | ready | pass |
| Phones and Tones, Part 3 | Craft | yes | 0.02 | 0.77 | ready | pass |
| Phones and Tones, Part 4 | Craft | yes | 0.00 | 0.83 | ready | pass |
| Phones and Tones, Part 5 | Craft | yes | 0.02 | 0.60 | ready | pass |
| Phones and Tones, Part 6 | Craft | yes | 0.02 | 0.52 | ready | pass |
| Phones and Tones, Part 7 | Craft | yes | 0.00 | 0.73 | ready | pass |
| Phones and Tones, Part 8 | Craft | yes | 0.00 | 0.92 | ready | pass |
| Phones and Tones, Part 9 | Craft | yes | 0.01 | 0.81 | ready | pass |
| Piggyback | Pitches by Op Code | no sign-off | — | — | ready | left alone — could not be read twice |
| Piggyback | Pitches by Op Code | yes | 0.00 | 0.71 | ready | pass — the master does not reproduce the report; tail 0.71s |
| Piggyback | Pitches by Op Code | yes | 0.02 | 1.14 | ready | pass |
| Planted, Not Buried | Mindset | yes | 0.01 | 0.80 | ready | pass |
| Practice Makes Improvement | Mindset | yes | 0.02 | 1.04 | ready | pass |
| Pre-Write | Pitches by Op Code | yes | 0.00 | 0.77 | ready | pass |
| Pre-Write | Craft | no | 0.02 | 1.19 | ready | pass |
| Print Money, Not Time | Mindset | yes | 0.02 | 1.47 | ready | pass |
| Problems or Solutions | Mindset | yes | 0.00 | 1.08 | ready | pass |
| Promise Yourself | Mindset | yes | 0.70 | 1.35 | ready | left alone — the clip was refused before the swap |
| Read It Backwards | Mindset | yes | 0.02 | 0.96 | ready | pass |
| Results Happen Over Time | Mindset | yes | 0.01 | 0.91 | ready | pass |
| Seasonal Menus, Part 1 | Menu | yes | 0.01 | 0.79 | ready | pass |
| Seasonal Menus, Part 2 | Menu | yes | 0.01 | 0.77 | ready | pass |
| Seasonal Menus, Part 3 | Menu | yes | 0.01 | 0.74 | ready | pass |
| Seasonal Menus, Part 4 | Menu | yes | 0.59 | 0.69 | stale | cut — 4.68s past Mahalo became 0.69s |
| Seasonal Menus, Part 5 | Menu | yes | 0.00 | 0.69 | stale | pass |
| Selling Skills, Part 1 | Craft | yes | 0.50 | 0.75 | stale | cut — 5.44s past Mahalo became 0.75s |
| Selling Skills, Part 10 | Craft | yes | 0.02 | 0.80 | ready | pass |
| Selling Skills, Part 2 | Craft | yes | 0.00 | 0.76 | ready | pass |
| Selling Skills, Part 3 | Craft | yes | 0.01 | 0.74 | ready | pass |
| Selling Skills, Part 4 | Craft | yes | 0.00 | 0.80 | ready | pass |
| Selling Skills, Part 6 | Craft | yes | 0.00 | 0.48 | ready | pass |
| Selling Skills, Part 7 | Craft | yes | 0.01 | 0.76 | ready | pass |
| Selling Skills, Part 8 | Craft | yes | 0.01 | 1.08 | ready | pass |
| Selling Skills, Part 9 | Craft | yes | 0.00 | 0.67 | stale | pass |
| Selling Skills, The Steer Objection | Craft | yes | 0.01 | 0.77 | ready | pass |
| Setting up the MPI — Closer | Craft | yes | 0.01 | 0.76 | ready | pass |
| Setting up the MPI — Opener | Craft | yes | 0.01 | 0.76 | ready | pass |
| Sing It | Craft | yes | 0.00 | 1.29 | ready | pass |
| Solving Difficult Problems | Mindset | yes | 0.01 | 0.68 | ready | pass |
| Start Today | Mindset | yes | 0.02 | 0.65 | ready | pass |
| Stay in a Great Mood | Mindset | yes | 0.02 | 0.86 | ready | pass |
| Strawberry Lemonade | Craft | yes | 0.07 | 1.40 | ready | pass |
| Success Cycle — Closer | Craft | yes | 0.01 | 0.72 | ready | pass |
| Success Cycle — Opener | Craft | yes | 0.01 | 0.78 | ready | pass |
| Success Cycle, Part 1, Not a Rut Team | Craft | yes | 0.06 | 0.76 | ready | pass |
| Success Cycle, Part 10, Anatomy of the Speech | Craft | yes | 0.29 | 0.64 | stale | cut — 1.70s of air at the head became 0.29s |
| Success Cycle, Part 11, The Repair Call | Craft | yes | 0.00 | 0.80 | ready | pass |
| Success Cycle, Part 12, Your song, Go Sing It | Craft | yes | 0.04 | 0.81 | ready | pass |
| Success Cycle, Part 2, Vocabulary That Sails | Craft | yes | 0.20 | 0.77 | ready | pass |
| Success Cycle, Part 3, More Vocabulary | Craft | yes | 0.01 | 0.75 | ready | pass |
| Success Cycle, Part 4, Green Yellow Red | Craft | yes | 0.02 | 0.84 | ready | pass |
| Success Cycle, Part 5, The 6 Stages | Craft | yes | 0.02 | 0.94 | ready | pass |
| Success Cycle, Part 6, More Staging | Craft | yes | 0.00 | 0.78 | ready | pass |
| Success Cycle, Part 7, Features and Benefits | Craft | yes | 0.01 | 0.80 | ready | pass |
| Success Cycle, Part 8, Anticipate the No | Craft | yes | 0.00 | 0.80 | ready | pass |
| Success Cycle, Part 9, More on Overcoming Objections | Craft | yes | 0.00 | 0.75 | ready | pass |
| Success Is a Choice | Mindset | yes | 0.00 | 0.68 | stale | pass |
| Successful vs. Really Successful | Mindset | yes | 0.00 | 0.66 | stale | pass |
| The Big Ticket Visit | Craft | no | 0.02 | 0.83 | ready | pass |
| The Big Ticket Visit, Part 1 | Craft | yes | 0.34 | 1.14 | ready | pass |
| The Big Ticket Visit, Part 2 | Craft | yes | 0.29 | 0.73 | stale | cut — 1.56s past Mahalo became 0.73s |
| The Big Ticket Visit, Part 3 | Craft | yes | 0.00 | 1.28 | stale | pass |
| The Biggest Mistake in Life | Mindset | yes | 0.13 | 1.28 | ready | pass |
| The Four F's | Mindset | yes | 0.02 | 1.22 | ready | pass |
| The Four Minute Walk-Around, Part 1 | Craft | yes | 0.00 | 0.61 | ready | pass |
| The Four Minute Walk-Around, Part 2 | Craft | yes | 0.01 | 1.19 | ready | pass |
| The Four Minute Walk-Around, Part 3 | Craft | yes | 0.01 | 1.20 | ready | pass |
| The Haves | Mindset | yes | 0.01 | 1.20 | ready | pass |
| The Invoice | Mindset | yes | 0.01 | 1.09 | ready | pass |
| The Lowest Point Is the Doorway | Mindset | yes | 0.02 | 1.02 | ready | pass |
| The Mamba Mentality | Mindset | yes | 0.04 | 1.16 | ready | pass |
| The Man in the Glass | Mindset | yes | 0.00 | 0.08 | ready | pass |
| The Moment You Feel Comfortable | Mindset | yes | 0.05 | 1.01 | ready | pass |
| The Money Mindset | Mindset | yes | 0.01 | 1.16 | ready | pass |
| The More Things You Give | Mindset | yes | 0.36 | 0.75 | stale | cut — 1.46s past Mahalo became 0.75s |
| The Most Dangerous Person | Mindset | no sign-off | — | 1.32 | ready | pass — closes "one.", not Mahalo; tail 1.32s is within standard |
| The OE Approach — Lifetime Fluid | Craft | yes | 0.00 | 0.10 | ready | pass |
| The OE Approach — Severe Conditions | Craft | yes | 0.00 | 0.23 | ready | pass |
| The OE Approach — The Maintenance Menu | Craft | no sign-off | — | 1.62 | ready | pass — closes "guessing.", not Mahalo; tail 1.62s is within standard |
| The OE Approach — Use the Chart | Craft | yes | 0.31 | 0.75 | stale | cut — 1.35s past Mahalo became 0.75s |
| The OE Stagger — Running It | Craft | yes | 0.02 | 1.00 | ready | pass |
| The OE Stagger — The Order and Why | Craft | no sign-off | — | 1.82 | ready | pass — closes "time.", not Mahalo; tail 1.82s is within standard |
| The OE Stagger — Why We Spread Them Out | Craft | yes | 0.36 | 0.69 | stale | cut — 1.65s past Mahalo became 0.69s |
| The One Thing You Can Control Every Day Is Your Attitude | Mindset | yes | 0.04 | 0.97 | ready | pass |
| The Will to Win | Mindset | yes | 0.01 | 0.99 | ready | pass |
| The Wolf Climbing the Hill | Mindset | yes | 0.00 | 1.01 | stale | pass |
| This Too Shall Pass | Mindset | yes | 0.02 | 0.88 | ready | pass |
| Three Things in a Teammate, Dependable, Skilled, Selfless | Mindset | yes | 0.02 | 0.64 | ready | pass |
| Today Is the Tomorrow You Were Worried About | Mindset | yes | 0.08 | 0.80 | ready | pass |
| Tomorrow Me vs. Today Me | Mindset | yes | 0.01 | 0.76 | ready | pass |
| Two Minute Walk-Around, Part 1, Pop the Hood | Craft | yes | 0.29 | 0.60 | stale | cut — 6.97s of air at the head became 0.29s |
| Two Minute Walk-Around, Part 2, 4 things under the hood | Craft | yes | 0.01 | 0.88 | ready | pass |
| Wall Street | Mindset | no sign-off | — | 2.02 | ready | pass — closes "tricks.", not Mahalo; tail 2.02s is within standard |
| Welcome from Mitch | Onboarding | yes | 0.01 | 0.75 | ready | pass |
| Where Are You Living? | Mindset | yes | 0.02 | 1.30 | ready | pass |
| WIN: What's Important Now | Mindset | yes | 0.02 | 0.91 | ready | pass |
| Work Hard in the Dark, Shine in the Light | Mindset | yes | 0.00 | 1.33 | stale | pass |
| Wrap-Up | Craft | no | 0.02 | 1.01 | ready | pass |
| You Are Not Tired | Mindset | yes | 0.05 | 1.18 | ready | pass |
| You Cannot Lose — unattributed | Craft | yes | 0.01 | 0.76 | ready | pass |
| You Don't Lose When You Get Knocked Down | Mindset | yes | 0.00 | 0.76 | ready | pass |
| You Fight Great, But I'm a Great Fighter | Mindset | yes | 0.00 | 1.29 | ready | pass |
| You'll Never Feel Ready | Mindset | yes | 0.01 | 1.42 | ready | pass |
| Your Toughest Opponent Is Staring at You | Mindset | no sign-off | — | 0.29 | stale | pass — closes "full...", not Mahalo; tail 0.29s is within standard |

## Cut, and verified before the swap — 34

Each of these was measured on its **master** at a 10-second window, cut, and the clip read again **before any row pointed at it**. The swap marks the vertical `stale`, so a phone letterboxes the master that was just verified. Re-deriving the crops is t29 and is not this pass.

### 15,000 Mile Dealer Upsell Menu, Part 4
`3790edc4-71e4-4ee2-8b4e-405c07e69fa5` · Menu · 98s → 90s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 8.76s past its sign-off; now 0.70s.
- master 97.65s → 89.59s, which is what the cut asked for
- closes "Mahalo!" — the head was untouched and reads 0.59s against 0.59s before
- the master and the 447 reading agreed to 0.042s about where to cut
- cut from the **archive**: archive 113.57s minus the prior head cut of 15.92s implies a 97.65s master and the master is 97.65s (off by 0.00s); master t maps to archive t + 15.92
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "are many important items to be discussed at this mileage and are repeats for the life of the vehicle. Mahalo!"

### 30 Second Walk-Around, Part 2, Four Goals, Two Words
`2b05500d-4be0-474c-9879-90d7cd7ce9ec` · Craft · 142s → 136s · vertical `stale`

- **cut at the energy onset − 0.3s pad.** Opened after 6.36s of air; now 0.28s.
- master 141.64s → 135.58s, which is what the cut asked for
- opens on "30" — the tail was untouched and reads 0.67s against 0.67s before
- the master and the 447 reading agreed to 0.004s about where to cut
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "ou said makes you right. And being right is how a stranger decides to trust you in less than a minute. Mahalo."
- head now: "30 Second Walk Around Part 2. 4 Goals, 2 Words. Aloha! What are you actually doing when you go to do a third"

### 30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone
`4a7b6ae9-df0e-4563-8d5d-6c259d0aede8` · Craft · 123s → 119s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 4.86s past its sign-off; now 0.75s.
- master 122.85s → 118.69s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.20s against 0.20s before
- the master and the 447 reading agreed to 0.118s about where to cut
- cut from the **archive**: archive 137.17s minus the prior head cut of 14.32s implies a 122.85s master and the master is 122.85s (off by 0.00s); master t maps to archive t + 14.32
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "are the first two steps. Next, we'll talk about starting the vehicle and what we're going to do then. Mahalo."

### 40,000 Mile Dealer Upsell Menu, Part 3
`c4c4e3dd-6fdc-405c-9a9e-b64e0e117572` · Menu · 221s → 214s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 7.38s past its sign-off; now 0.69s.
- master 220.61s → 213.92s, which is what the cut asked for
- closes "Mahalo!" — the head was untouched and reads 0.55s against 0.55s before
- the master and the 447 reading agreed to 0.064s about where to cut
- cut from the **archive**: archive 236.91s minus the prior head cut of 16.3s implies a 220.61s master and the master is 220.61s (off by 0.00s); master t maps to archive t + 16.3
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "est one in the program because by the time you make the offer, the customer already knows why you are. Mahalo!"

### 5,000/7,500 Mile Dealer Upsell Menu (2716)
`eef634f1-3a07-4826-8d0f-f398bdfeb5b5` · Menu · 204s → 197s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 7.70s past its sign-off; now 0.74s.
- master 204.17s → 197.17s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.94s against 0.94s before
- the master and the 447 reading agreed to 0.033s about where to cut
- cut from the **archive**: archive 222.77s minus the prior head cut of 18.6s implies a 204.17s master and the master is 204.17s (off by 0.00s); master t maps to archive t + 18.6
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "ioned? That's not a sale you made. That's a sale that came back for. That's what planning a seed does. Mahalo."

### 55,000 Mile Dealer Upsell Menu, Part 2
`057afb81-0b1e-44d8-9d26-be5299990c28` · Menu · 95s → 90s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 6.01s past its sign-off; now 0.70s.
- master 95.04s → 89.73s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.28s against 0.28s before
- the master and the 447 reading agreed to 0.023s about where to cut
- cut from the **archive**: archive 110.50s minus the prior head cut of 15.46s implies a 95.04s master and the master is 95.04s (off by 0.00s); master t maps to archive t + 15.46
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "truck or SUV saves up to $200. That could be the cost of one tire. It's like buy three, get one free. Mahalo."

### 55,000 Mile Dealer Upsell Menu, Part 3
`ad3bd915-9e95-4b58-b6bb-5fa234fe91ab` · Menu · 106s → 100s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 6.77s past its sign-off; now 0.71s.
- master 105.61s → 99.54s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.45s against 0.45s before
- the master and the 447 reading agreed to 0.082s about where to cut
- cut from the **archive**: archive 121.87s minus the prior head cut of 16.26s implies a 105.61s master and the master is 105.61s (off by 0.00s); master t maps to archive t + 16.26
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "on factory wrecks and that's okay. We have a big service coming up at 60 ,000 miles. Let's get to it. Mahalo."

### 90,000 Mile Dealer Upsell Menu, Part 2
`ee3849c1-9708-4ee7-b20e-8879f5a4606b` · Menu · 161s → 157s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 4.66s past its sign-off; now 0.76s.
- master 160.63s → 156.67s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.38s against 0.38s before
- the master and the 447 reading agreed to 0.127s about where to cut
- cut from the **archive**: archive 179.41s minus the prior head cut of 18.78s implies a 160.63s master and the master is 160.63s (off by 0.00s); master t maps to archive t + 18.78
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "down those referrals, be ready with sun bit, be ready with warranties. 90 K is a big K. Gotta save it. Mahalo."

### At the Kiosk
`a3212d65-7489-45b9-90a0-da91eab2ec99` · Pitches by Op Code · 120s → 119s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.41s past its sign-off; now 0.75s.
- master 119.95s → 119.24s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.66s against 0.66s before
- the master and the 447 reading agreed to 0.066s about where to cut
- cut from the **archive**: archive 124.34s minus the prior head cut of 4.39s implies a 119.95s master and the master is 119.95s (off by 0.00s); master t maps to archive t + 4.39
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "et me have our certified technician, Hector, take a look, and we'll go over how we grade your vehicle. Mahalo."

### At the Kiosk, Part 2
`6f69a096-6aef-453d-9784-e42faa9c15ba` · Pitches by Op Code · 122s → 121s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.71s past its sign-off; now 0.75s.
- master 121.67s → 120.66s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.26s against 0.26s before
- the master and the 447 reading agreed to 0.070s about where to cut
- cut from the **archive**: archive 126.84s minus the prior head cut of 5.17s implies a 121.67s master and the master is 121.67s (off by 0.00s); master t maps to archive t + 5.17
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "u exactly what's going on. That answer builds more trust than any number you could just throw at them. Mahalo."

### CSI — Prior to Arrival, Part 2
`9a4190b3-16cb-47bb-adfc-1e062b1d5028` · Craft · 116s → 112s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 5.33s past its sign-off; now 0.70s.
- master 116.48s → 111.84s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.23s against 0.23s before
- the master and the 447 reading agreed to 0.065s about where to cut
- cut from the **archive**: archive 127.48s minus the prior head cut of 11s implies a 116.48s master and the master is 116.48s (off by 0.00s); master t maps to archive t + 11
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "he phone or with a lifelong customer or have someone visiting for the very first time. Disway waiters. Mahalo."

### Diesel, Part 4
`eac42e00-5aa1-4368-8dc5-fef14ca95b70` · Menu · 155s → 151s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 4.83s past its sign-off; now 0.74s.
- master 155.34s → 151.20s, which is what the cut asked for
- closes "Mahalo!" — the head was untouched and reads 0.10s against 0.10s before
- the master and the 447 reading agreed to 0.155s about where to cut
- cut from the **archive**: archive 170.04s minus the prior head cut of 14.7s implies a 155.34s master and the master is 155.34s (off by 0.00s); master t maps to archive t + 14.7
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "ing. So be ready to share that menu, go over the ladders, especially setting up those larger services. Mahalo!"

### Diesel, Part 5
`2cfa11d2-d475-421d-b701-07a8eeb2f89a` · Menu · 79s → 78s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.55s past its sign-off; now 0.74s.
- master 78.89s → 78.04s, which is what the cut asked for
- closes "Mahalo!" — the head was untouched and reads 0.48s against 0.48s before
- the master and the 447 reading agreed to 0.000s about where to cut — but for this film the report had no number, so that cross-check is the master against itself and proves nothing
- cut from the **archive**: archive 92.47s minus the prior head cut of 13.58s implies a 78.89s master and the master is 78.89s (off by 0.00s); master t maps to archive t + 13.58
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "cleaner, you can get a lot more warranty. So ask your local rep about that as well. Mahalo!"

### Diesel, Part 6
`4a5cf641-c4ec-41ac-ba0b-fbac1c4d2f48` · Menu · 191s → 187s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 4.60s past its sign-off; now 0.76s.
- master 190.51s → 186.61s, which is what the cut asked for
- closes "Mahalo!" — the head was untouched and reads 0.55s against 0.55s before
- the master and the 447 reading agreed to 0.146s about where to cut
- cut from the **archive**: archive 203.71s minus the prior head cut of 13.2s implies a 190.51s master and the master is 190.51s (off by 0.00s); master t maps to archive t + 13.2
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "hese fuel system services and you will have your diesel customers eating out of the palm of your hand. Mahalo!"

### Four Step Close, Part 4
`15b3e307-9a19-4c28-bf61-913965a81fce` · Craft · 67s → 62s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 5.54s past its sign-off; now 0.74s.
- master 67.27s → 62.42s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.41s against 0.41s before
- the master and the 447 reading agreed to 0.134s about where to cut
- cut from the **archive**: archive 79.97s minus the prior head cut of 12.7s implies a 67.27s master and the master is 67.27s (off by 0.00s); master t maps to archive t + 12.7
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "4 -12 -45, not afterwards. A heads up is a service. A late vehicle with no call is a broken promise. Mahalo."

### Four Step Close, Part 5
`6326b8df-7e33-43f9-bbb0-3da11f1dca20` · Craft · 76s → 74s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 2.74s past its sign-off; now 0.75s.
- master 75.96s → 73.92s, which is what the cut asked for
- closes "Mahalo!" — the head was untouched and reads 0.09s against 0.09s before
- the master and the 447 reading agreed to 0.000s about where to cut — but for this film the report had no number, so that cross-check is the master against itself and proves nothing
- cut from the **archive**: archive 87.70s minus the prior head cut of 11.74s implies a 75.96s master and the master is 75.96s (off by 0.00s); master t maps to archive t + 11.74
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "the parts are there, all I need is your authorization. Mahalo!"

### Four Step Close, Part 7
`3a1a6e00-b92c-42a6-a598-c25930cf0824` · Craft · 99s → 97s · vertical `stale`

- **cut at the energy onset − 0.3s pad.** Opened after 3.20s of air; now 0.30s.
- master 99.42s → 96.52s, which is what the cut asked for
- opens on "4" — the tail was untouched and reads 0.56s against 0.56s before
- the master and the 447 reading agreed to 0.002s about where to cut
- cut from the **archive**: archive 104.94s minus the prior head cut of 0s implies a 99.42s master and the master is 99.42s (off by 0.00s); master t maps to archive t + 0
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "end, we are assuming that the customers are gonna buy something, because we've done such a great job. Mahalo."
- head now: "4 step close part 7. Assume the yes. Aloha."

### Four Things You Can't Get Back
`4701a64c-61a5-40b1-b254-443dce8c5e8d` · Mindset · 67s → 67s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.42s past its sign-off; now 0.33s.
- master 67.48s → 66.76s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.73s against 0.35s before
- the master and the 447 reading agreed to 0.094s about where to cut
- cut from the **master**: clipping the master directly: no prior cut in any ledger, so there is no offset to map by
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "our actions. In the car business, we need to use our words, our opportunity, and our trust with care. Mahalo."

### Lasting Impressions, Part 12
`7e15c899-dbec-4702-9973-82d5f528d12a` · Craft · 102s → 100s · vertical `stale`

- **cut at the greeting − 0.3s pad.** It opened on sound at 0.00s with the stray word "Prospect" in front of the Aloha; it now opens on "Aloha," with 0.30s of air. Ryan's ruling, 9 October: a word before the greeting is what the head rule removes, not a different rule.
- master 102.11s → 100.26s, which is what the cut asked for
- opens on "Aloha," — the tail was untouched and reads 0.54s against 0.54s before
- the anchor was measured on this master and **tested** — a short window pulled from 2.152s opens on "Aloha", after a pause of silence that separates the stray word from the greeting. There is no cross-check against the 447 reading here, and the gate is instead that the finished clip must open on "aloha", which it does.
- cut from the **archive**: archive 119.11s holds a 102.11s master at 12.06s (needs 114.17s); the remaining 4.94s is a prior tail cut the old ledger did not record; master t maps to archive t + 12.06
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "or, you wipe the mirror, you wave and that's the lasting impression a customer is gonna have with you. Mahalo!"
- head now: "Aloha, two more things before the customer bounces. One asks for business. Are you currently prospecting at de"

### Lasting Impressions, Part 2
`142ef72e-7ca4-4eee-943b-328b594546cb` · Craft · 110s → 109s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.54s past its sign-off; now 0.76s.
- master 110.00s → 109.15s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.00s against 0.00s before
- the master and the 447 reading agreed to 0.000s about where to cut — but for this film the report had no number, so that cross-check is the master against itself and proves nothing
- cut from the **archive**: archive 119.94s minus the prior head cut of 9.94s implies a 110.00s master and the master is 110.00s (off by 0.00s); master t maps to archive t + 9.94
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "Not to the folks that just have a smelly car. Mahalo."

### Lasting Impressions, Part 5
`b7f57bba-614d-48cf-9be4-ef4c29c6ac9f` · Craft · 106s → 101s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 5.80s past its sign-off; now 0.74s.
- master 105.83s → 100.73s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.43s against 0.43s before
- the master and the 447 reading agreed to 0.168s about where to cut
- cut from the **archive**: archive 117.41s minus the prior head cut of 11.58s implies a 105.83s master and the master is 105.83s (off by 0.00s); master t maps to archive t + 11.58
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "re you say anything else. And deferred, not decline, decline is so final. That's not what we're doing. Mahalo."

### Menu Wrap-Up, Part 1
`dbc3b4ad-c86b-4d69-86ee-5a1d05404ac3` · Craft · 144s → 142s · vertical `stale`

- **cut at the greeting − 0.3s pad.** It opened on sound at 0.00s with the stray word "coverage." in front of the Aloha; it now opens on "Aloha." with 0.30s of air. Ryan's ruling, 9 October: a word before the greeting is what the head rule removes, not a different rule.
- master 144.01s → 142.30s, which is what the cut asked for
- opens on "Aloha." — the tail was untouched and reads 0.65s against 0.65s before
- the anchor was measured on this master and **tested** — a short window pulled from 2.012s opens on "Aloha", after a pause of silence that separates the stray word from the greeting. There is no cross-check against the 447 reading here, and the gate is instead that the finished clip must open on "aloha", which it does.
- cut from the **archive**: archive 159.97s holds a 144.01s master at 11.42s (needs 155.43s); the remaining 4.54s is a prior tail cut the old ledger did not record; master t maps to archive t + 11.42
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "in ends. You gotta report to the customer what they're getting for their money and how it is valuable. Mahalo!"
- head now: "Aloha. We've walked the whole ladder, 5 ,000 to 150 ,000 miles. Now, here's a handful of things that make any"

### MPI Setup
`508e939e-ed11-4c8d-8321-3b8f1bbde208` · Pitches by Op Code · 97s → 96s · vertical `stale`

- **cut at the energy onset − 0.3s pad.** Opened after 0.81s of air; now 0.30s.
- master 96.97s → 96.46s, which is what the cut asked for
- opens on "Tires," — the tail was untouched and reads 0.60s against 0.60s before
- the master and the 447 reading agreed to 0.003s about where to cut
- cut from the **archive**: archive 101.11s minus the prior head cut of 0s implies a 96.97s master and the master is 96.97s (off by 0.00s); master t maps to archive t + 0
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "really big deal. Set up that multi -point inspection and you'll give Hector the best chance he's got. Mahalo!"
- head now: "Tires, setting up the multipoint inspection."

### Name Tag, Part 9
`1fecaeec-2747-409d-a574-948e87b6e615` · Craft · 151s → 145s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 7.00s past its sign-off; now 0.75s.
- master 150.83s → 144.53s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.62s against 0.62s before
- the master and the 447 reading agreed to 0.094s about where to cut
- cut from the **archive**: archive 164.77s minus the prior head cut of 13.94s implies a 150.83s master and the master is 150.83s (off by 0.00s); master t maps to archive t + 13.94
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "trating. I'm sorry. Let's take care of that right away. Address the emotion, then address the vehicle. Mahalo."

### On the Drive
`a118a9a8-b129-4dd6-86d0-5f9c21140efa` · Pitches by Op Code · 216s → 215s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.62s past its sign-off; now 0.20s.
- master 216.41s → 215.49s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.80s against 0.26s before
- the master and the 447 reading agreed to 0.106s about where to cut
- cut from the **master**: clipping the master directly: no prior cut in any ledger, so there is no offset to map by
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "t. If they say no, let it go, but make a note of it. Next visit, it won't be a brand new idea anymore. Mahalo."

### On the Drive, Part 2
`249b3f98-c658-4145-939e-a212a35977ab` · Pitches by Op Code · 125s → 124s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.33s past its sign-off; now 0.75s.
- master 125.00s → 124.38s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.14s against 0.14s before
- the master and the 447 reading agreed to 0.466s about where to cut
- cut from the **archive**: archive 129.57s minus the prior head cut of 4.57s implies a 125.00s master and the master is 125.00s (off by 0.00s); master t maps to archive t + 4.57
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "You got to remember on these hard op codes, yourself and your team. Everything else is just offerings. Mahalo."

### Seasonal Menus, Part 4
`1e3b8e57-2fde-4af0-8f49-253572d8adf3` · Menu · 178s → 174s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 4.68s past its sign-off; now 0.69s.
- master 177.69s → 173.71s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.59s against 0.59s before
- the master and the 447 reading agreed to 0.079s about where to cut
- cut from the **archive**: archive 193.61s minus the prior head cut of 15.92s implies a 177.69s master and the master is 177.69s (off by 0.00s); master t maps to archive t + 15.92
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "t beat the heat, you got filters, you got a lot of stuff working for you. Everything else rides along. Mahalo."

### Selling Skills, Part 1
`1abbfde9-ee7f-4583-a1a8-3d2d124f04e5` · Craft · 102s → 97s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 5.44s past its sign-off; now 0.75s.
- master 101.72s → 96.97s, which is what the cut asked for
- closes "Mahalo!" — the head was untouched and reads 0.50s against 0.50s before
- the master and the 447 reading agreed to 0.124s about where to cut
- cut from the **archive**: archive 111.34s minus the prior head cut of 9.62s implies a 101.72s master and the master is 101.72s (off by 0.00s); master t maps to archive t + 9.62
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "One, pitch, feature, benefit, common objection, overcoming the objection, before you make the call. Mahalo!"

### Success Cycle, Part 10, Anatomy of the Speech
`e5d1de92-01c1-4d36-9949-aac66309735f` · Craft · 218s → 216s · vertical `stale`

- **cut at the energy onset − 0.3s pad.** Opened after 1.70s of air; now 0.29s.
- master 217.53s → 216.13s, which is what the cut asked for
- opens on "Success" — the tail was untouched and reads 0.64s against 0.64s before
- the master and the 447 reading agreed to 0.000s about where to cut — but for this film the report had no number, so that cross-check is the master against itself and proves nothing
- cut from the **archive**: archive 221.41s minus the prior head cut of 0s implies a 217.53s master and the master is 217.53s (off by 0.00s); master t maps to archive t + 0
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "it. Pick the words you like, take off the words that you don't like, but be consistent in your speech. Mahalo."
- head now: "Success Cycle Part 2"

### The Big Ticket Visit, Part 2
`f080ab6a-b69f-4ae8-841a-4c1967fc5e05` · Craft · 139s → 138s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.56s past its sign-off; now 0.73s.
- master 138.86s → 138.00s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.29s against 0.29s before
- the master and the 447 reading agreed to 0.092s about where to cut
- cut from the **archive**: archive 143.77s minus the prior head cut of 4.91s implies a 138.86s master and the master is 138.86s (off by 0.00s); master t maps to archive t + 4.91
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "t some will say yes and they'll say yes because you were straight with them about why you were asking. Mahalo."

### The More Things You Give
`e89f11a4-bd83-4551-bd85-2fc93f0e13a8` · Mindset · 79s → 79s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.46s past its sign-off; now 0.75s.
- master 79.25s → 78.50s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.36s against 0.36s before
- the master and the 447 reading agreed to 0.155s about where to cut
- cut from the **archive**: archive 84.00s minus the prior head cut of 4.75s implies a 79.25s master and the master is 79.25s (off by 0.00s); master t maps to archive t + 4.75
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "You didn't ask for it, you built it. 40 pushes at a time. Every day is a great day to turn the wheel. Mahalo."

### The OE Approach — Use the Chart
`6ca783a5-8a7e-4f0e-984b-d7c9559a2c05` · Craft · 174s → 173s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.35s past its sign-off; now 0.75s.
- master 174.12s → 173.47s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.31s against 0.31s before
- the master and the 447 reading agreed to 0.121s about where to cut
- cut from the **archive**: archive 179.11s minus the prior head cut of 4.99s implies a 174.12s master and the master is 174.12s (off by 0.00s); master t maps to archive t + 4.99
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "due at 30 ,000 is one thing. Presenting five services on one visit without losing all five is another. Mahalo."

### The OE Stagger — Why We Spread Them Out
`412e2cd0-75b9-4a8f-8a59-3c3a4c677523` · Craft · 168s → 167s · vertical `stale`

- **cut at the Mahalo + 0.7s pad.** Ran 1.65s past its sign-off; now 0.69s.
- master 167.75s → 166.80s, which is what the cut asked for
- closes "Mahalo." — the head was untouched and reads 0.36s against 0.36s before
- the master and the 447 reading agreed to 0.029s about where to cut
- cut from the **archive**: archive 173.74s minus the prior head cut of 5.99s implies a 167.75s master and the master is 167.75s (off by 0.00s); master t maps to archive t + 5.99
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "r visit, five visits, all five sold. And a customer who never once felt like they got hit with a list. Mahalo."

### Two Minute Walk-Around, Part 1, Pop the Hood
`ee8551f3-c0af-4345-8dc1-5c2e7d092a65` · Craft · 151s → 144s · vertical `stale`

- **cut at the energy onset − 0.3s pad.** Opened after 6.97s of air; now 0.29s.
- master 150.69s → 144.02s, which is what the cut asked for
- opens on "2" — the tail was untouched and reads 0.60s against 0.62s before
- the master and the 447 reading agreed to 0.004s about where to cut
- cut from the **archive**: archive 154.47s minus the prior head cut of 0s implies a 150.69s master and the master is 150.69s (off by 0.00s); master t maps to archive t + 0
- verified at a 10-second window **before** the swap; the crop is now `stale`, so a phone letterboxes this master
- tail now: "o you because then you lose their confidence. Next up, what we're actually looking for under the hood. Mahalo!"
- head now: "2 minute walk around part 1. Pop the hood. Aloha. Now let's talk about the 2 minute walk around. We did the 30"

## Passes as it is — 21

The report already said enough. A film with no Mahalo heard still ends within the library's 1.5-second tail standard, and a film with no Aloha heard that starts talking at once has no air to remove. No cut, no reshoot.

### 150,000 Mile Dealer Upsell Menu, Part 1
`dbaa8209-4991-420d-8e7a-f13a3e908e54` · Menu · 134s · vertical `ready`

- **passes as it is.** opens "150" at 0.07s — Mitch is already talking, so there is nothing to cut
- no cut, no reshoot.

### 20 Years to Build a Reputation
`e4d40ca9-0587-48f6-ba40-95a55251ce0c` · Mindset · 22s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "pride."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### After-MPI
`b24b51a7-43eb-4400-8664-a601f9059500` · Pitches by Op Code · 150s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "do."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### After-MPI, Part 2
`11a5d2ac-7a08-442a-8525-50fcc5825ed2` · Pitches by Op Code · 168s · vertical `ready`

- **passes as it is.** the 447 report put this at 165.81s and the master reads 167.50s — a 1.69s disagreement the master wins. On the master the tail is 0.27s, inside the 1.5s standard, so there is nothing to cut. The report's number is not reproducible here.
- measured on the master: 0.28s air then "Aloha!" … "Mahalo." then 0.27s
- *this film's number comes from the master and nothing corroborates it — the 447 reading, which is the only other reading there is, disagrees.*
- no cut, no reshoot.

### Buffalos and the Cows
`9fd634f3-82af-4e04-a250-a9ed85fec4bb` · Mindset · 96s · vertical `stale`

- **passes as it is.** no Mahalo heard — closes "day"; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### Dealer Upsell Menus and Interval Charts — Opener
`a5b0f57b-55a7-4d18-b06f-6c569b72d5f0` · Craft · 157s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "need."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### Did I Get Better Today?
`d2f9dc9a-5ae7-443d-86d8-be3ddf61b1d8` · Mindset · 36s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "has."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### Diversification & Ignorance
`c420f15a-e640-4283-9054-47da0ff20b87` · Mindset · 34s · vertical `ready`

- **passes as it is.** opens "Diversification" at 0.06s — Mitch is already talking, so there is nothing to cut
- no cut, no reshoot.

### Everybody, Anybody, Somebody and Nobody
`0e52ecf5-1d70-4faa-9222-af5bf3ea4491` · Mindset · 40s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "pointing?"; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### Lasting Impressions — Closer
`2a458ec9-6f0c-4d77-ac95-3be768576347` · Craft · 70s · vertical `ready`

- **passes as it is.** opens "That's" at 0.06s — Mitch is already talking, so there is nothing to cut
- no cut, no reshoot.

### MPI Setup
`ca5dc36a-442a-4726-be11-c5a06834e6af` · Pitches by Op Code · 146s · vertical `ready`

- **passes as it is.** opens "Let's" at 0.06s — Mitch is already talking, so there is nothing to cut
- no cut, no reshoot.

### Name Tag — Closer
`02812647-59a7-473a-b2c1-20b29b2764fb` · Craft · 70s · vertical `ready`

- **passes as it is.** opens "That's" at 0.07s — Mitch is already talking, so there is nothing to cut
- no cut, no reshoot.

### Name Tag, Part 6
`3e12212a-02b0-4f41-9b47-9cab52bb58ed` · Craft · 113s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "advisor."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### Never Lose Money
`801aa254-a12f-4448-9d15-a07ac9e486e1` · Mindset · 22s · vertical `stale`

- **passes as it is.** no Mahalo heard — closes "fee..."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### On the Drive
`2ff913f2-0a78-4f56-92ed-7ed02d9b20a4` · Pitches by Op Code · 234s · vertical `ready`

- **passes as it is.** the 447 report put this at 231.28s and the master reads 232.36s — a 1.08s disagreement the master wins. On the master the tail is 1.25s, inside the 1.5s standard, so there is nothing to cut. The report's number is not reproducible here.
- measured on the master: 0.49s air then "Aloha!" … "Mahalo." then 1.25s
- *this film's number comes from the master and nothing corroborates it — the 447 reading, which is the only other reading there is, disagrees.*
- no cut, no reshoot.

### Piggyback
`48f897e0-87e3-4a38-9bcf-11a6ea980f36` · Pitches by Op Code · 179s · vertical `ready`

- **passes as it is.** the 447 report put this at 177.37s and the master reads 178.40s — a 1.03s disagreement the master wins. On the master the tail is 0.71s, inside the 1.5s standard, so there is nothing to cut. The report's number is not reproducible here.
- measured on the master: 0.00s air then "Aloha!" … "Mahalo." then 0.71s
- *this film's number comes from the master and nothing corroborates it — the 447 reading, which is the only other reading there is, disagrees.*
- no cut, no reshoot.

### The Most Dangerous Person
`b822e731-6522-4f55-930b-722ad575b965` · Mindset · 107s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "one."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### The OE Approach — The Maintenance Menu
`7574149a-5477-4959-adbf-e34a09c02479` · Craft · 167s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "guessing."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### The OE Stagger — The Order and Why
`14f20d45-178a-4cbc-9761-bb8a1d26f4f0` · Craft · 254s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "time."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### Wall Street
`6ac8ff68-b979-43f3-8a72-e32c0feb0e89` · Mindset · 59s · vertical `ready`

- **passes as it is.** no Mahalo heard — closes "tricks."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

### Your Toughest Opponent Is Staring at You
`704a5728-23e1-444d-b724-7b8888e54e77` · Mindset · 26s · vertical `stale`

- **passes as it is.** no Mahalo heard — closes "full..."; the tail is within the library's standard, so it is kept
- no cut, no reshoot.

## Unpublished — 2

Neither is a trim: the take was never taken to the end, so there is no sign-off to cut to. `status = 'draft'` with the reason on the row, everything else untouched, and the row survives to receive Mitch's reshoot in place. 0162 carries the argument.

### 25,000 Mile Dealer Upsell Menu (2748)
`d0b1084d-db49-4c5e-b608-9fb594355861` · Menu · 42s · vertical `—`

- **unpublished**, `status = 'draft'` with the reason on the row. Not retired: a reshoot
- replaces this row in place, so it has to survive to receive it.
- closes "off", not Mahalo — there is no sign-off to trim to
- opens "25", not Aloha

### 70,000 Mile Dealer Upsell Menu, Part 2 (2821)
`fe35f2ea-2fa7-4b07-acca-ea16e2e2c8c7` · Menu · 57s · vertical `—`

- **unpublished**, `status = 'draft'` with the reason on the row. Not retired: a reshoot
- replaces this row in place, so it has to survive to receive it.
- closes "nothing decoded", not Mahalo — there is no sign-off to trim to
- opens "70", not Aloha

## Left alone, and what was heard — 5

Nothing was changed on these and the reason is recorded. A film whose ends cannot be read is a film nothing is known about, and the honest response to that is to do nothing and say so.

### At the Kiosk
`74f7fb33-6cf9-49d4-a9c4-7678841c6e4c` · Pitches by Op Code · 168s · vertical `ready`

- **left alone.** re-read on the master FAILED the same way (partial pull: came back 6.80s of 10.00s) — left alone and listed; no third read
- the instrument said: `partial pull: came back 6.80s of 10.00s`
- the same failure, with the same number, on the **master** as on the vertical — so it is the
- asset or the instrument and not the crop. Nothing is known about this film's ends, so
- nothing was done to it.

### Create the Life You Can't Wait to Wake Up To
`66d633b5-8d4d-409a-a51a-8245ffb4d35b` · Mindset · 47s → 46s · vertical `ready`

- **left alone.** A clip was made and read, and it did not pass, so nothing was swapped.
- what the gate said: cut outside quiet hours with --force-window; clip REFUSED: closes "joy.", not Mahalo; tail 0s is under the 0.4s the sign-off needs — left in Mux, unreferenced; the row still serves what it served
- the film still serves exactly what it served before this batch
- tail now: "t now sees the day. Every day is a great day to be mid. Pick one. Focus on what excites you or brings you joy."

### Four Things You Can Stop Doing
`c95e46ba-22d7-414e-8284-76cf924ae7ab` · Mindset · 79s → 79s · vertical `ready`

- **left alone.** A clip was made and read, and it did not pass, so nothing was swapped.
- what the gate said: cut outside quiet hours with --force-window; clip REFUSED: tail 0s is under the 0.4s the sign-off needs — left in Mux, unreferenced; the row still serves what it served
- the film still serves exactly what it served before this batch
- tail now: "er. Logging just a few notes in your system about a customer can impact your future with them greatly. Mahalo."

### Piggyback
`0298ebf1-89dc-40a5-9399-277b17693cec` · Pitches by Op Code · 179s · vertical `ready`

- **left alone.** re-read on the master FAILED the same way (partial pull: came back 6.75s of 10.00s) — left alone and listed; no third read
- the instrument said: `partial pull: came back 6.75s of 10.00s`
- the same failure, with the same number, on the **master** as on the vertical — so it is the
- asset or the instrument and not the crop. Nothing is known about this film's ends, so
- nothing was done to it.

### Promise Yourself
`ad521817-19fb-4bea-bf9b-1b137f609380` · Mindset · 121s → 120s · vertical `ready`

- **left alone.** A clip was made and read, and it did not pass, so nothing was swapped.
- what the gate said: cut outside quiet hours with --force-window; clip REFUSED: closes "experience...", not Mahalo; tail 0s is under the 0.4s the sign-off needs; the end this cut did not touch moved -0.702s, so the archive offset of 4.97s is wrong — a correctly mapped archive cut drifts 0.000s — left in Mux, unreferenced; the row still serves what it served
- the film still serves exactly what it served before this batch
- tail now: "ave no time to criticize others. Optimism is the hope, expectation, and confidence that one will experience..."

## The method that was tried first, and what it would have shipped

Worth keeping, because it was wrong in the direction that looks like success.

The first attempt clipped each film's **current master** with `end_time` alone. Head cuts came
back perfect. Every tail cut came back with its sign-off cut in half:

| film | asked | came back | closed on |
|---|---|---|---|
| 15,000 Mile Dealer Upsell Menu, Part 4 | 0 → 89.59s | 89.59s | "Maha!" with 0.00s of air |
| 30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone | 0 → 118.69s | 118.69s | "Next!" with 0.12s of air |
| 40,000 Mile Dealer Upsell Menu, Part 3 | 0 → 213.92s | 213.92s | "are." with 0.56s of air |
| 5,000/7,500 Mile Dealer Upsell Menu (2716) | 0 → 197.17s | 197.17s | "plan" with 0.00s of air |

`mux://assets/ID` where ID is **itself a clip** does not deliver that clip's timeline. It
re-resolves to the underlying source and lands on a keyframe *before* the master's zero, by an
amount that varies per film — 0.90s on 15,000 Part 4, about 4.7s on 30 Second Walk-Around Part 3.

**The length was always exactly what was asked for.** That is why a length check cannot see this,
and it is why the first explanation offered for the 0.90s — "the re-encode moved the −40dB
crossing" — was both plausible and false. The same film cut from its **archive** in the archive's
timeline reads a drift of 0.000s, an onset of 0.59s matching the master to the centisecond, and
"Mahalo!" with the 0.70s pad that was asked for.

Nothing was served broken: all four were **refused before the swap**, which is the only reason
this is a note about a method rather than a note about four films.

## What this batch found and did not close

Each of these is a question rather than a task, and each names the films that are the evidence.

### Where else does this codebase clip an asset that may itself be a clip?

One `grep` for `mux://assets/`, and the answer in full:

| site | source it clips | exposed? |
|---|---|---|
| `scripts/trim-last-batch.ts` | the archive where it reconciles, else the master | fixed — and it refuses what it cannot reconcile |
| `scripts/trim-recut.ts` | `archived_asset_id`, always | safe by construction, and says so in its own header |
| `scripts/replace-video.ts` `--trim-only` | the master on the row | **exposed** on any film the trim passes have touched |
| `lib/mux/upload.ts` `clipAsset()` | whatever the caller passes | **exposed**, and has no callers today |
| `lib/mux/derive.ts` | the asset's own master download, falling back to its HLS | not exposed — never uses `mux://` |

`replace-video.ts` now carries a hazard note and prints a warning when the row already has an
`archived_asset_id`, with the `select` widened so that check can actually fire. Its **behaviour is
unchanged**: the right gate is probably "refuse `--trim-only` on a row that has an archive, and clip
the archive instead", and that belongs in its own change with its own acceptance run rather than
riding along with a trim batch.

### Two films' streams are shorter than the duration Mux reports for them

`At the Kiosk` and `Piggyback` could not be read at a 10-second window — twice, on the vertical and
then on the master, **returning the identical number both times**: 6.80s of 10.00s and 6.75s of
10.00s. Two renditions agreeing to the centisecond is not a network flake, so it was worth one
diagnostic pass.

Seeking into `At the Kiosk` at three different targets, ffmpeg lands a **constant 3.20s** short of
where `asset.duration` says it should:

| `-ss` asked | audio returned | so the stream really ends at |
|---|---|---|
| 157.98s | 6.80s | 164.78s |
| 161.98s | 2.80s | 164.78s |
| 152.98s | 11.80s | 164.78s |

A constant offset, not a keyframe effect — a keyframe snap would vary with the target. The Mux API
reports `duration 167.98` for that asset and the playable stream carries about **164.78s**, so the
last ~3.2s of what the row claims is not in what a phone would receive. `Piggyback` is the same
shape, about 3.25s.

**`trim-check.ts`'s `pull()` refusing was correct and protective**, not a limitation: it requires a
window to come back within 0.75s of what was asked, which is exactly why these two stopped and why
no film with a materially short stream reached a cut. The one visible difference between these two
assets and a normal one is **three** English text tracks each, against two.

Nothing is known about either film's ends, so nothing was done to them — the brief's "no third read"
and the honest answer agree here. What they need is a look at why their streams are short, which is a
delivery question and not a trim.

### Two films are cut tighter than the sign-off standard

`trim-check.ts` sets `MIN_TAIL_AFTER_MAHALO = 0.4` — "the sign-off must not run to the very edge".
The first build of this batch's gate used the HEAD constant, `MIN_FIRST_WORD_START = 0.15`, at the
tail. Two films cut through the master-fallback path got past it:

- **On the Drive** — closes "Mahalo." with **0.20s** of air, where 0.70s was asked for (the clip drifted 0.53s)
- **Four Things You Can't Get Back** — closes "Mahalo." with **0.33s** of air, where 0.70s was asked for (the clip drifted 0.38s)

Both close on a **whole, audible "Mahalo"** and both are inside the 1.5s ceiling the brief set, so
neither is broken — they are simply tighter than the house minimum. The constant is fixed in the
script. Re-cutting them would mean a third-generation clip for a tenth of a second, which is a worse
trade than leaving them, so they are left and named here instead of quietly.

### The fallback path is where every tight result came from

2 of the 34 cut films were clipped from their own master rather than an
archive, because no ledger could explain the master's length. Those are the only cut films with a
non-zero drift on the end they did not cut. The archive path produced `0.000s` every time. If this
batch has one reusable lesson for the next one, it is that **a drift of zero is the signature of a
correct source**, and it is cheap to read.
