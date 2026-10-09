# The rendition a phone plays: 447 films, one reading

*9 October 2026. For every published film, the rendition a phone actually gets —
the vertical where `vertical_status = 'ready'`, otherwise the master letterboxed,
which is the rule `renditionsFor` and `pickRendition` apply — read once at a
10-second window at each end. No escalation ladder: one window, one reading.*

| | films |
|---|---:|
| **pass** | **385** |
| **Ryan's list** | **62** |
| total | 447 |

Tail judged at **1.5s**, the standard `trim-measure.ts` built this library to.
**106 films** have a tail between 1.0s and 1.5s — they pass here and would not
at the 1.0s the brief asked for.

The head comparison is made by audio **energy**, not by whisper's word-start:
built on the latter it falsely failed *10,000 Mile Dealer Upsell Menu, Part 4*,
which reads `alohaAt` 0.58 on the master and 0.00 on the vertical with the same
transcript. Across the 414 films whose vertical was compared, whisper's delta
exceeds 0.5s on 7 films and energy's on 1 — so whisper would have staled 7 good crops.

A phone gets the vertical on 413 films and the master letterboxed on 34.
1 vertical failed this check and was set `stale`, so that film is
judged on the master a phone now plays instead.

**head verified** — the gap between where sound starts on the served rendition and
on the master, by energy. 0.00 where the served rendition *is* the master.
**tail verified** — how long the served rendition runs past Mahalo.
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
| 15,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.02 | 8.82 | ready | Ryan's list — runs 8.82s past Mahalo · look at 88.85s |
| 15,000 Mile Dealer Upsell Menu, Part 5 | Menu | yes | 0.01 | 0.76 | ready | pass |
| 150,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.76 | ready | Ryan's list — opens "150", not Aloha · look at 0.07s |
| 150,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.84 | ready | pass |
| 150,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.01 | 0.94 | ready | pass |
| 150,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.91 | ready | pass |
| 20 Years to Build a Reputation | Mindset | no sign-off | 0.01 | — | ready | Ryan's list — closes "pride.", not Mahalo · look at 0.32s |
| 20,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.75 | ready | pass |
| 20,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.02 | 0.78 | ready | pass |
| 20,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.02 | 0.90 | ready | pass |
| 20,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.77 | ready | pass |
| 25,000 Mile Dealer Upsell Menu (2748) | Menu | no sign-off | 0.02 | — | ready | Ryan's list — opens "25", not Aloha; closes "off", not Mahalo · look at 1.82s |
| 25,000 Mile Dealer Upsell Menu (2749) | Menu | yes | 0.00 | 0.70 | stale | pass |
| 25,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.72 | ready | pass |
| 25,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.48 | ready | pass |
| 25,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.02 | 0.80 | ready | pass |
| 25,000 Mile Dealer Upsell Menu, Part 5 | Menu | yes | 0.02 | 0.80 | ready | pass |
| 30 Second Walk-Around, Part 1, Before You Go Outside | Craft | yes | 0.02 | 0.53 | ready | pass |
| 30 Second Walk-Around, Part 2, Four Goals, Two Words | Craft | yes | 0.00 | 0.89 | ready | Ryan's list — opens "30", not Aloha · look at 6.36s |
| 30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone | Craft | yes | 0.01 | 4.99 | ready | Ryan's list — runs 4.99s past Mahalo · look at 117.87s |
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
| 40,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.02 | 7.48 | ready | Ryan's list — runs 7.48s past Mahalo · look at 213.16s |
| 45,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.01 | 0.75 | ready | pass |
| 45,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.02 | 0.76 | ready | pass |
| 45,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.80 | ready | pass |
| 45,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.00 | 0.79 | ready | pass |
| 5,000/7,500 Mile Dealer Upsell Menu (2714) | Menu | yes | 0.01 | 0.80 | ready | pass |
| 5,000/7,500 Mile Dealer Upsell Menu (2716) | Menu | yes | 0.00 | 7.76 | ready | Ryan's list — runs 7.76s past Mahalo · look at 196.44s |
| 50,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.93 | ready | pass |
| 50,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.78 | ready | pass |
| 50,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.02 | 0.76 | ready | pass |
| 50,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.01 | 0.81 | ready | pass |
| 55,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.82 | ready | pass |
| 55,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 6.06 | ready | Ryan's list — runs 6.06s past Mahalo · look at 89.01s |
| 55,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.02 | 6.87 | ready | Ryan's list — runs 6.87s past Mahalo · look at 98.76s |
| 60,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.91 | ready | pass |
| 60,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 0.80 | ready | pass |
| 60,000 Mile Dealer Upsell Menu, Part 3 | Menu | yes | 0.00 | 0.82 | ready | pass |
| 60,000 Mile Dealer Upsell Menu, Part 4 | Menu | yes | 0.10 | 0.76 | ready | pass |
| 65,000 Mile Dealer Upsell Menu, Part 1 | Menu | yes | 0.02 | 0.80 | ready | pass |
| 65,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.00 | 0.77 | ready | pass |
| 70,000 Mile Dealer Upsell Menu, Part 2 (2821) | Menu | no sign-off | 0.00 | — | stale | Ryan's list — opens "70", not Aloha; closes "nothing decoded", not Mahalo; tail: no audio decoded (0 words) · look at 6.75s |
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
| 90,000 Mile Dealer Upsell Menu, Part 2 | Menu | yes | 0.01 | 4.57 | ready | Ryan's list — runs 4.57s past Mahalo · look at 155.84s |
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
| After-MPI | Pitches by Op Code | no sign-off | 0.01 | — | ready | Ryan's list — closes "do.", not Mahalo · look at 0.30s |
| After-MPI | Pitches by Op Code | yes | 0.00 | 1.16 | stale | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.77 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.77 | ready | pass |
| After-MPI | Pitches by Op Code | yes | 0.01 | 0.73 | ready | pass |
| After-MPI, Part 1 | Pitches by Op Code | yes | 0.04 | 1.38 | ready | pass |
| After-MPI, Part 1 | Pitches by Op Code | yes | 0.08 | 0.73 | ready | pass |
| After-MPI, Part 2 | Pitches by Op Code | yes | 0.04 | 2.00 | ready | Ryan's list — runs 2.00s past Mahalo · look at 165.81s |
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
| At the Kiosk | Pitches by Op Code | no sign-off | — | — | ready | Ryan's list — partial pull: came back 6.80s of 10.00s |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 1.14 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.00 | 1.46 | stale | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 1.00 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 0.90 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.04 | 1.55 | ready | Ryan's list — runs 1.55s past Mahalo · look at 118.47s |
| At the Kiosk | Pitches by Op Code | yes | 0.02 | 0.48 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.03 | 0.73 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.04 | 0.73 | ready | pass |
| At the Kiosk | Pitches by Op Code | no | 0.02 | 0.96 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.00 | 0.80 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.02 | 0.78 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.01 | 0.76 | ready | pass |
| At the Kiosk | Pitches by Op Code | yes | 0.03 | 0.91 | ready | pass |
| At the Kiosk, Part 1 | Pitches by Op Code | yes | 0.00 | 0.73 | stale | pass |
| At the Kiosk, Part 2 | Pitches by Op Code | yes | 0.00 | 1.77 | stale | Ryan's list — runs 1.77s past Mahalo · look at 119.89s |
| Be Better Than That | Mindset | yes | 0.00 | 1.43 | ready | pass |
| Be the Reason Someone Believes | Mindset | yes | 0.02 | 1.03 | ready | pass |
| Brave Enough | Mindset | yes | 0.00 | 1.03 | stale | pass |
| Buffalos and the Cows | Mindset | no sign-off | 0.00 | — | stale | Ryan's list — closes "day", not Mahalo · look at 0.44s |
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
| Create the Life You Can't Wait to Wake Up To | Mindset | yes | 0.04 | 1.70 | ready | Ryan's list — runs 1.70s past Mahalo · look at 45.22s |
| CSI — CSI Is Not a Score, Part 1 | Craft | yes | 0.02 | 0.73 | ready | pass |
| CSI — Prior to Arrival, Part 2 | Craft | yes | 0.01 | 5.45 | ready | Ryan's list — runs 5.45s past Mahalo · look at 111.08s |
| CSI — The 2 Week and 2 Month Follow-Ups, Part 6 | Craft | yes | 0.01 | 0.68 | ready | pass |
| CSI — The 2222 Follow-Up, Part 5 | Craft | yes | 0.02 | 0.78 | ready | pass |
| CSI — Upon Arrival, Part 3 | Craft | yes | 0.02 | 0.75 | ready | pass |
| CSI — Upon Departure, Part 4 | Craft | yes | 0.01 | 0.76 | ready | pass |
| Day One or One Day | Mindset | yes | 0.01 | 1.26 | ready | pass |
| Dealer Upsell Menus and Interval Charts — Opener | Craft | no sign-off | 0.00 | — | ready | Ryan's list — closes "need.", not Mahalo · look at 3.44s |
| Decide What to Do With the Time Given | Mindset | yes | 0.01 | 0.97 | ready | pass |
| Demand Excellence | Mindset | yes | 0.00 | 0.92 | ready | pass |
| Did I Get Better Today? | Mindset | no sign-off | 0.02 | — | ready | Ryan's list — closes "has.", not Mahalo · look at 0.56s |
| Diesel, Part 1 | Menu | yes | 0.01 | 0.89 | ready | pass |
| Diesel, Part 2 | Menu | yes | 0.00 | 0.79 | ready | pass |
| Diesel, Part 3 | Menu | yes | 0.01 | 0.80 | ready | pass |
| Diesel, Part 4 | Menu | yes | 0.19 | 5.05 | ready | Ryan's list — runs 5.05s past Mahalo · look at 150.35s |
| Diesel, Part 5 | Menu | yes | 0.01 | 4.79 | ready | Ryan's list — runs 4.79s past Mahalo · look at 74.11s |
| Diesel, Part 6 | Menu | yes | 0.01 | 4.78 | ready | Ryan's list — runs 4.78s past Mahalo · look at 185.76s |
| Discipline, Addictive Discipline, Obsession | Mindset | yes | 0.01 | 0.79 | ready | pass |
| Diversification & Ignorance | Mindset | yes | 0.06 | 0.78 | ready | Ryan's list — opens "Diversification", not Aloha · look at 0.06s |
| Don't Quit, Someone Needs Who You're Becoming | Mindset | yes | 0.00 | 1.33 | ready | pass |
| Don't Tell Me You Can't | Mindset | yes | 0.01 | 0.63 | ready | pass |
| Doubt Is a Strange Thing | Mindset | yes | 0.02 | 1.30 | ready | pass |
| EV Series, Part 1 | Menu | yes | 0.00 | 0.76 | ready | pass |
| EV Series, Part 2 | Menu | yes | 0.11 | 0.78 | ready | pass |
| EV Series, Part 3 | Menu | yes | 0.00 | 0.69 | stale | pass |
| EV Series, Part 4 | Menu | yes | 0.02 | 0.80 | ready | pass |
| Every Day Is a Great Day to Be Mitch | Mindset | yes | 0.01 | 1.05 | ready | pass |
| Every Step of the Road | Mindset | yes | 0.01 | 1.26 | ready | pass |
| Everybody, Anybody, Somebody and Nobody | Mindset | no sign-off | 0.00 | — | ready | Ryan's list — closes "pointing?", not Mahalo · look at 2.94s |
| Fearful When Others Are Greedy | Mindset | yes | 0.01 | 0.70 | ready | pass |
| Four Step Close — Closer | Craft | yes | 0.02 | 0.75 | ready | pass |
| Four Step Close — Opener | Craft | yes | 0.09 | 0.76 | ready | pass |
| Four Step Close, Part 1 | Craft | yes | 0.00 | 0.64 | ready | pass |
| Four Step Close, Part 10 | Craft | yes | 0.14 | 0.87 | ready | pass |
| Four Step Close, Part 2 | Craft | yes | 0.00 | 0.70 | stale | pass |
| Four Step Close, Part 3 | Craft | yes | 0.01 | 0.81 | ready | pass |
| Four Step Close, Part 4 | Craft | yes | 0.01 | 5.71 | ready | Ryan's list — runs 5.71s past Mahalo · look at 61.59s |
| Four Step Close, Part 5 | Craft | yes | 0.01 | 6.22 | ready | Ryan's list — runs 6.22s past Mahalo · look at 69.75s |
| Four Step Close, Part 6 | Craft | yes | 0.00 | 1.06 | ready | pass |
| Four Step Close, Part 7 | Craft | yes | 0.00 | 0.81 | ready | Ryan's list — opens "4", not Aloha · look at 3.20s |
| Four Step Close, Part 8 | Craft | yes | 0.01 | 0.79 | ready | pass |
| Four Step Close, Part 9 | Craft | yes | 0.02 | 0.86 | ready | pass |
| Four Things You Can Stop Doing | Mindset | yes | 0.02 | 1.58 | ready | Ryan's list — runs 1.58s past Mahalo · look at 77.72s |
| Four Things You Can't Get Back | Mindset | yes | 0.01 | 1.57 | ready | Ryan's list — runs 1.57s past Mahalo · look at 65.97s |
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
| Lasting Impressions — Closer | Craft | yes | 0.06 | 0.79 | ready | Ryan's list — opens "That's", not Aloha · look at 0.06s |
| Lasting Impressions — Opener | Craft | yes | 0.01 | 0.76 | ready | pass |
| Lasting Impressions, Part 1 | Craft | yes | 0.01 | 0.81 | ready | pass |
| Lasting Impressions, Part 10 | Craft | yes | 0.00 | 0.76 | ready | pass |
| Lasting Impressions, Part 11 | Craft | yes | 0.02 | 0.80 | ready | pass |
| Lasting Impressions, Part 12 | Craft | yes | 0.06 | 0.79 | ready | Ryan's list — opens "Prospect.", not Aloha · look at 2.04s |
| Lasting Impressions, Part 2 | Craft | yes | 0.06 | 7.26 | ready | Ryan's list — runs 7.26s past Mahalo · look at 102.74s |
| Lasting Impressions, Part 3 | Craft | yes | 0.02 | 0.82 | ready | pass |
| Lasting Impressions, Part 4 | Craft | yes | 0.02 | 0.72 | ready | pass |
| Lasting Impressions, Part 5 | Craft | yes | 0.00 | 6.01 | ready | Ryan's list — runs 6.01s past Mahalo · look at 99.86s |
| Lasting Impressions, Part 6 | Craft | yes | 0.01 | 0.47 | ready | pass |
| Lasting Impressions, Part 7 | Craft | yes | 0.00 | 0.69 | stale | pass |
| Lasting Impressions, Part 8 | Craft | yes | 0.00 | 0.70 | stale | pass |
| Lasting Impressions, Part 9 | Craft | yes | 0.18 | 0.79 | ready | pass |
| Lazy People vs. Winners | Mindset | yes | 0.00 | 1.33 | ready | pass |
| Mediocre People Don't Like High Achievers | Mindset | yes | 0.00 | 1.44 | ready | pass |
| Menu Wrap-Up, Part 1 | Craft | yes | 0.06 | 0.87 | ready | Ryan's list — opens "coverage.", not Aloha · look at 1.86s |
| Menu Wrap-Up, Part 2 | Craft | yes | 0.00 | 0.90 | ready | pass |
| Menus — Closer | Craft | yes | 0.02 | 0.78 | ready | pass |
| More Life | Mindset | yes | 0.00 | 1.31 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 1.15 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 1.15 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.02 | 1.31 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.00 | 0.94 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 1.23 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 1.12 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.00 | 0.81 | ready | Ryan's list — opens "Tires,", not Aloha · look at 0.81s |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 0.92 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.04 | 1.12 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.04 | 0.86 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 0.75 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.91 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.00 | 0.82 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.15 | 1.08 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.72 | ready | pass |
| MPI Setup | Pitches by Op Code | no sign-off | 0.06 | — | ready | Ryan's list — opens "Let's", not Aloha; closes "Hector.", not Mahalo · look at 0.06s |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.92 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.35 | 0.86 | ready | pass |
| MPI Setup | Pitches by Op Code | no | 0.02 | 0.55 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.00 | 1.21 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.01 | 1.31 | ready | pass |
| MPI Setup | Pitches by Op Code | yes | 0.06 | 0.52 | ready | pass |
| Name Tag — Closer | Craft | yes | 0.07 | 0.75 | ready | Ryan's list — opens "That's", not Aloha · look at 0.07s |
| Name Tag — Opener | Craft | yes | 0.00 | 0.67 | stale | pass |
| Name Tag, Part 1 | Craft | yes | 0.01 | 0.75 | ready | pass |
| Name Tag, Part 10 | Craft | yes | 0.00 | 0.71 | ready | pass |
| Name Tag, Part 2 | Craft | yes | 0.01 | 0.94 | ready | pass |
| Name Tag, Part 3 | Craft | yes | 0.02 | 0.82 | ready | pass |
| Name Tag, Part 4 | Craft | yes | 0.01 | 0.78 | ready | pass |
| Name Tag, Part 5 | Craft | yes | 0.00 | 0.96 | ready | pass |
| Name Tag, Part 6 | Craft | no sign-off | 0.01 | — | ready | Ryan's list — closes "advisor.", not Mahalo · look at 0.23s |
| Name Tag, Part 7 | Craft | yes | 0.00 | 0.81 | ready | pass |
| Name Tag, Part 8 | Craft | yes | 0.00 | 0.65 | ready | pass |
| Name Tag, Part 9 | Craft | yes | 0.01 | 7.09 | ready | Ryan's list — runs 7.09s past Mahalo · look at 143.74s |
| Never Lose Money | Mindset | no sign-off | 0.00 | — | stale | Ryan's list — closes "fee...", not Mahalo · look at 0.41s |
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
| On the Drive | Pitches by Op Code | yes | 0.01 | 2.35 | ready | Ryan's list — runs 2.35s past Mahalo · look at 231.28s |
| On the Drive | Pitches by Op Code | no | 0.02 | 1.25 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.04 | 1.29 | ready | pass |
| On the Drive | Pitches by Op Code | no | 0.03 | 1.06 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.00 | 0.79 | ready | pass |
| On the Drive | Pitches by Op Code | yes | 0.02 | 1.78 | ready | Ryan's list — runs 1.78s past Mahalo · look at 214.68s |
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
| On the Drive, Part 2 | Pitches by Op Code | yes | 0.02 | 1.79 | ready | Ryan's list — runs 1.79s past Mahalo · look at 123.21s |
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
| Piggyback | Pitches by Op Code | no sign-off | — | — | ready | Ryan's list — partial pull: came back 6.75s of 10.00s |
| Piggyback | Pitches by Op Code | yes | 0.06 | 1.74 | ready | Ryan's list — runs 1.74s past Mahalo · look at 177.37s |
| Piggyback | Pitches by Op Code | yes | 0.02 | 1.14 | ready | pass |
| Planted, Not Buried | Mindset | yes | 0.01 | 0.80 | ready | pass |
| Practice Makes Improvement | Mindset | yes | 0.02 | 1.04 | ready | pass |
| Pre-Write | Pitches by Op Code | yes | 0.00 | 0.77 | ready | pass |
| Pre-Write | Craft | no | 0.02 | 1.19 | ready | pass |
| Print Money, Not Time | Mindset | yes | 0.02 | 1.47 | ready | pass |
| Problems or Solutions | Mindset | yes | 0.00 | 1.08 | ready | pass |
| Promise Yourself | Mindset | yes | 0.00 | 1.53 | ready | Ryan's list — runs 1.53s past Mahalo · look at 119.43s |
| Read It Backwards | Mindset | yes | 0.02 | 0.96 | ready | pass |
| Results Happen Over Time | Mindset | yes | 0.01 | 0.91 | ready | pass |
| Seasonal Menus, Part 1 | Menu | yes | 0.01 | 0.79 | ready | pass |
| Seasonal Menus, Part 2 | Menu | yes | 0.01 | 0.77 | ready | pass |
| Seasonal Menus, Part 3 | Menu | yes | 0.01 | 0.74 | ready | pass |
| Seasonal Menus, Part 4 | Menu | yes | 0.17 | 4.77 | ready | Ryan's list — runs 4.77s past Mahalo · look at 172.93s |
| Seasonal Menus, Part 5 | Menu | yes | 0.00 | 0.69 | stale | pass |
| Selling Skills, Part 1 | Craft | yes | 0.00 | 5.29 | ready | Ryan's list — runs 5.29s past Mahalo · look at 96.15s |
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
| Success Cycle, Part 10, Anatomy of the Speech | Craft | yes | 0.00 | 0.81 | ready | Ryan's list — opens "nothing decoded", not Aloha; head: no audio decoded (0 words); neither head decoded words, so the two cannot be compared · look at 1.70s |
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
| The Big Ticket Visit, Part 2 | Craft | yes | 0.02 | 1.65 | ready | Ryan's list — runs 1.65s past Mahalo · look at 137.21s |
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
| The More Things You Give | Mindset | yes | 0.01 | 1.63 | ready | Ryan's list — runs 1.63s past Mahalo · look at 77.64s |
| The Most Dangerous Person | Mindset | no sign-off | 0.00 | — | ready | Ryan's list — closes "one.", not Mahalo · look at 1.32s |
| The OE Approach — Lifetime Fluid | Craft | yes | 0.00 | 0.10 | ready | pass |
| The OE Approach — Severe Conditions | Craft | yes | 0.00 | 0.23 | ready | pass |
| The OE Approach — The Maintenance Menu | Craft | no sign-off | 0.00 | — | ready | Ryan's list — closes "guessing.", not Mahalo · look at 1.62s |
| The OE Approach — Use the Chart | Craft | yes | 0.00 | 1.52 | ready | Ryan's list — runs 1.52s past Mahalo · look at 172.65s |
| The OE Stagger — Running It | Craft | yes | 0.02 | 1.00 | ready | pass |
| The OE Stagger — The Order and Why | Craft | no sign-off | 0.00 | — | ready | Ryan's list — closes "time.", not Mahalo · look at 1.82s |
| The OE Stagger — Why We Spread Them Out | Craft | yes | 0.00 | 1.73 | ready | Ryan's list — runs 1.73s past Mahalo · look at 166.07s |
| The One Thing You Can Control Every Day Is Your Attitude | Mindset | yes | 0.04 | 0.97 | ready | pass |
| The Will to Win | Mindset | yes | 0.01 | 0.99 | ready | pass |
| The Wolf Climbing the Hill | Mindset | yes | 0.00 | 1.01 | stale | pass |
| This Too Shall Pass | Mindset | yes | 0.02 | 0.88 | ready | pass |
| Three Things in a Teammate, Dependable, Skilled, Selfless | Mindset | yes | 0.02 | 0.64 | ready | pass |
| Today Is the Tomorrow You Were Worried About | Mindset | yes | 0.08 | 0.80 | ready | pass |
| Tomorrow Me vs. Today Me | Mindset | yes | 0.01 | 0.76 | ready | pass |
| Two Minute Walk-Around, Part 1, Pop the Hood | Craft | yes | 0.00 | 0.89 | ready | Ryan's list — opens "2", not Aloha · look at 6.97s |
| Two Minute Walk-Around, Part 2, 4 things under the hood | Craft | yes | 0.01 | 0.88 | ready | pass |
| Wall Street | Mindset | no sign-off | 0.04 | — | ready | Ryan's list — closes "tricks.", not Mahalo · look at 2.02s |
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
| Your Toughest Opponent Is Staring at You | Mindset | no sign-off | 0.00 | — | stale | Ryan's list — closes "full...", not Mahalo · look at 0.29s |

## Ryan's list — 62 films, with what is heard

A phone plays the **crop** on 57 of these and the **master** on 5. On 54 of
the 57 the crop was checked against the master and matches it, so both renditions
carry the same fault: the question is about the take, not about which cut is
served. Mark each one cut-at-this-time or reshoot. Nothing here is a reshoot
list; that is your call from this evidence.

### 15,000 Mile Dealer Upsell Menu, Part 4
`3790edc4-71e4-4ee2-8b4e-405c07e69fa5` · Menu · 98s · vertical `ready`

- runs 8.82s past Mahalo
- **the second to look at: 88.85s**
- the 447-film plan measured this tail at **5.21s** and proposed no tail cut — it flagged itself: `offset-suspect(captions 108.36 vs words 104.70)`
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! One more offering for 15 ,000 miles and it begins our Tire Maintenance Talks. That service is in alignment."
- tail: "Mahalo."

### 150,000 Mile Dealer Upsell Menu, Part 1
`dbaa8209-4991-420d-8e7a-f13a3e908e54` · Menu · 134s · vertical `ready`

- opens "150", not Aloha
- **the second to look at: 0.07s**
- head: "150 ,000 miles. I didn't think I was gonna make it. And this is the last rung on the ladder, but it's not the end of the road for the vehicle. So we gotta."
- tail: "So share what it needs, do it organized, do it honestly, and let them decide what happens today. Mahalo."

### 20 Years to Build a Reputation
`e4d40ca9-0587-48f6-ba40-95a55251ce0c` · Mindset · 22s · vertical `ready`

- closes "pride.", not Mahalo
- **the second to look at: 0.32s**
- head: "Aloha! It takes 20 years to build a reputation and about five minutes to ruin it. If you think about that, you'll do things differently. That's a quote by Warren B."
- tail: "What I think this means is don't lie. It just isn't worth it. Folks are gonna find out, but even if they don't, you gotta be able to look that man in the glass with pride."

### 25,000 Mile Dealer Upsell Menu (2748)
`d0b1084d-db49-4c5e-b608-9fb594355861` · Menu · 42s · vertical `ready`

- opens "25", not Aloha
- closes "off", not Mahalo
- **the second to look at: 1.82s**
- head: "25 ,000 mile dealer interval ups..."
- tail: "and build off"

### 30 Second Walk-Around, Part 2, Four Goals, Two Words
`2b05500d-4be0-474c-9879-90d7cd7ce9ec` · Craft · 142s · vertical `ready`

- opens "30", not Aloha
- **the second to look at: 6.36s**
- head: "30 second walk around part two. Four goals, two goals."
- tail: "You said that makes you right. And being right is how a stranger decides to trust you in less than a minute. Mahalo."

### 30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone
`4a7b6ae9-df0e-4563-8d5d-6c259d0aede8` · Craft · 123s · vertical `ready`

- runs 4.99s past Mahalo
- **the second to look at: 117.87s**
- the 447-film plan measured this tail at **4.85s** and proposed no tail cut — it flagged itself: `offset-suspect(captions 132.32 vs words 137.15)`
- head: "Aloha! Step one in its one sentence. Welcome to XYZ Motors. My name is Mitch. Are you here to see anyone in particular?"
- tail: "two steps. Next we'll talk about starting the vehicle and what we're going to do then. Mahalo."

### 40,000 Mile Dealer Upsell Menu, Part 3
`c4c4e3dd-6fdc-405c-9a9e-b64e0e117572` · Menu · 221s · vertical `ready`

- runs 7.48s past Mahalo
- **the second to look at: 213.16s**
- the 447-film plan measured this tail at **-0.03s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! 40 ,000 miles and something changed 4 ,000 miles ago that this customer may not have thought about since. Their bumper to bumper coverage is..."
- tail: "Baltimore already knows why you are. Mahalo."

### 5,000/7,500 Mile Dealer Upsell Menu (2716)
`eef634f1-3a07-4826-8d0f-f398bdfeb5b5` · Menu · 204s · vertical `ready`

- runs 7.76s past Mahalo
- **the second to look at: 196.44s**
- the 447-film plan measured this tail at **0.31s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Part 1 of the 5 ,000 -7 ,500 -mile service video said, offer nothing and mention deodorizers. Now let's talk"
- tail: "he does. Mahalo."

### 55,000 Mile Dealer Upsell Menu, Part 2
`057afb81-0b1e-44d8-9d26-be5299990c28` · Menu · 95s · vertical `ready`

- runs 6.06s past Mahalo
- **the second to look at: 89.01s**
- the 447-film plan measured this tail at **0.58s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! There's a tool that can sell nitrogen better than you can. And the reason it works better than you is the customer is actually selling themselves."
- tail: "one tire. It's like buy three, get one free. Mahalo."

### 55,000 Mile Dealer Upsell Menu, Part 3
`ad3bd915-9e95-4b58-b6bb-5fa234fe91ab` · Menu · 106s · vertical `ready`

- runs 6.87s past Mahalo
- **the second to look at: 98.76s**
- the 447-film plan measured this tail at **3.15s** and proposed no tail cut — it flagged itself: `offset-suspect(captions 118.72 vs words 114.98)`
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha, they're buying tires! This is one of the few times all day the wheels are off and everything behind those wheels is exposed."
- tail: "at 60 ,000 miles. Let's get to it. Mahalo."

### 70,000 Mile Dealer Upsell Menu, Part 2 (2821)
`fe35f2ea-2fa7-4b07-acca-ea16e2e2c8c7` · Menu · 57s · vertical `stale`

- opens "70", not Aloha
- closes "nothing decoded", not Mahalo
- tail: no audio decoded (0 words)
- **the second to look at: 6.75s**
- head: "70 ,000 mile dealer upsell using"

### 90,000 Mile Dealer Upsell Menu, Part 2
`ee3849c1-9708-4ee7-b20e-8879f5a4606b` · Menu · 161s · vertical `ready`

- runs 4.57s past Mahalo
- **the second to look at: 155.84s**
- the 447-film plan measured this tail at **2.21s** and proposed no tail cut — it flagged itself: `offset-suspect(captions 177.20 vs words 174.60)`
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! 90 ,000 miles and this is the heaviest repeat rung on the whole ladder. Let me walk you through all of what"
- tail: "bit. Be ready with warranties. 90K's a big K. Gotta save it. Mahalo."

### After-MPI
`b24b51a7-43eb-4400-8664-a601f9059500` · Pitches by Op Code · 150s · vertical `ready`

- closes "do.", not Mahalo
- **the second to look at: 0.30s**
- head: "Aloha! Let's offer that AC EVAP service after a multi -point inspection. Now, remember, you could have done this on the drive, but you didn't..."
- tail: "You can go to the Beat the Heat section of the platform and learn that. And you can also offer this as a package. Very, very cool thing to do."

### After-MPI, Part 2
`11a5d2ac-7a08-442a-8525-50fcc5825ed2` · Pitches by Op Code · 168s · vertical `ready`

- runs 2.00s past Mahalo
- **the second to look at: 165.81s**
- the 447-film plan measured this tail at **0.57s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Part two of the multi -point inspection selling on an AC recharge. Get the AC concern handled first. Signed to prove done."
- tail: "off of an AC recharge. And that's why we had the customers leave instead of waiting. Mahalo."

### At the Kiosk
`74f7fb33-6cf9-49d4-a9c4-7678841c6e4c` · Pitches by Op Code · 168s · vertical `ready`

- partial pull: came back 6.80s of 10.00s

### At the Kiosk
`a3212d65-7489-45b9-90a0-da91eab2ec99` · Pitches by Op Code · 120s · vertical `ready`

- runs 1.55s past Mahalo
- **the second to look at: 118.47s**
- the 447-film plan measured this tail at **-0.56s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Let's talk charge port cleaning at the kiosk. Now whether you open the port door or not there's still ample opportunity."
- tail: "No problem at all, Mr. Smith. Let me have our certified technician Hector take a look and we'll go over how we grade your vehicle. Mahalo."

### At the Kiosk, Part 2
`6f69a096-6aef-453d-9784-e42faa9c15ba` · Pitches by Op Code · 122s · vertical `stale`

- runs 1.77s past Mahalo
- **the second to look at: 119.89s**
- the 447-film plan measured this tail at **1.32s** and proposed no tail cut
- head: "Aloha! Let's talk AC Recharge at the kiosk part 2. Now the text is doing the real work. Because the customer is gone, they're going to..."
- tail: "with you exactly what's going on. That answer builds more trust than any number you could just throw at them. Mahalo."

### Buffalos and the Cows
`9fd634f3-82af-4e04-a250-a9ed85fec4bb` · Mindset · 96s · vertical `stale`

- closes "day", not Mahalo
- **the second to look at: 0.44s**
- head: "Aloha! This comes from a book called Take the Stairs by Rory Vaden. He grew up in Colorado and being here in the CO..."
- tail: "conversation six hours every day is a great day"

### Create the Life You Can't Wait to Wake Up To
`66d633b5-8d4d-409a-a51a-8245ffb4d35b` · Mindset · 47s · vertical `ready`

- runs 1.70s past Mahalo
- **the second to look at: 45.22s**
- the 447-film plan measured this tail at **0.24s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Create a life you can't wait to wake up to by the old anonymous internet. Creating a life you cannot wait to wake up to."
- tail: "to be mid, pick one. Focus on what excites you or brings you joy every possible chance you get. Mahalo."

### CSI — Prior to Arrival, Part 2
`9a4190b3-16cb-47bb-adfc-1e062b1d5028` · Craft · 116s · vertical `ready`

- runs 5.45s past Mahalo
- **the second to look at: 111.08s**
- the 447-film plan measured this tail at **5.48s** and proposed no tail cut — it flagged itself: `tail-unmeasured(captions put a Mahalo ending at 122.00s)`
- head: "Aloha! You want to see a bump in your CSI numbers? First thing you need to do is dissuade people from waiting. This one's sort of counterintuitive."
- tail: "someone visiting for the very first time. Disway waiters. Mahalo."

### Dealer Upsell Menus and Interval Charts — Opener
`a5b0f57b-55a7-4d18-b06f-6c569b72d5f0` · Craft · 157s · vertical `ready`

- closes "need.", not Mahalo
- **the second to look at: 3.44s**
- head: "Aloha! Using the factory recommendations is a solid strategy for some, but many places are not"
- tail: "We are going to cover each mileage interval in your arsenal and by the end of this segment you will be ready to offer menus and services based on any of the items you need."

### Did I Get Better Today?
`d2f9dc9a-5ae7-443d-86d8-be3ddf61b1d8` · Mindset · 36s · vertical `ready`

- closes "has.", not Mahalo
- **the second to look at: 0.56s**
- head: "Aloha! Did I get better today by Kobe Bryant? At the end of every day, you look yourself in the mirror and you ask yourself, are you getting better today?"
- tail: "times, five months, 10 months, 15 years. How much better are you going to be by then? The end of the day mirror question has."

### Diesel, Part 4
`eac42e00-5aa1-4368-8dc5-fef14ca95b70` · Menu · 155s · vertical `ready`

- runs 5.05s past Mahalo
- **the second to look at: 150.35s**
- the 447-film plan measured this tail at **-0.58s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Here are a couple more differences on the gas and diesel menu. We'll go over a few of these. First is the oil. It's different from gas."
- tail: "over the ladders, especially setting up those larger services. Mahalo!"

### Diesel, Part 5
`2cfa11d2-d475-421d-b701-07a8eeb2f89a` · Menu · 79s · vertical `ready`

- runs 4.79s past Mahalo
- **the second to look at: 74.11s**
- the 447-film plan measured this tail at **0.23s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Let's talk about two things on a diesel menu that recur over and over and over again. The first is the engine treatment. You got to offer it every"
- tail: "you can get a lot more warranty, so ask your local rep about that as well. Mahalo!"

### Diesel, Part 6
`4a5cf641-c4ec-41ac-ba0b-fbac1c4d2f48` · Menu · 191s · vertical `ready`

- runs 4.78s past Mahalo
- **the second to look at: 185.76s**
- the 447-film plan measured this tail at **0.31s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Let's talk some of that little two -part fuel system service and DPF cleaner. Very important for diesel engines. I want to share with you..."
- tail: "services and you will have your diesel customers eating out of the palm of your hand. Mahalo!"

### Diversification & Ignorance
`c420f15a-e640-4283-9054-47da0ff20b87` · Mindset · 34s · vertical `ready`

- opens "Diversification", not Aloha
- **the second to look at: 0.06s**
- head: "Diversification is a protection against ignorance. That's a quote by Warren Buffett. Short and sweet like me. I love simple quotes that mean different things to different folks."
- tail: "offerings, the money follows, and the customers are actually happier. People love choices and options, so let's give it to them. Mahalo."

### Everybody, Anybody, Somebody and Nobody
`0e52ecf5-1d70-4faa-9222-af5bf3ea4491` · Mindset · 40s · vertical `ready`

- closes "pointing?", not Mahalo
- **the second to look at: 2.94s**
- head: "Aloha, everybody, anybody, somebody, and nobody, by Charles Swindle."
- tail: "when nobody did what anybody could have. That's accountability, baby. Every dealership has this dynamic. Remember, too much finger pointing?"

### Four Step Close, Part 4
`15b3e307-9a19-4c28-bf61-913965a81fce` · Craft · 67s · vertical `ready`

- runs 5.71s past Mahalo
- **the second to look at: 61.59s**
- the 447-film plan measured this tail at **5.53s** and proposed no tail cut — it flagged itself: `tail-unmeasured(captions put a Mahalo ending at 74.44s)`
- head: "Aloha! Step 3, when will it be ready? A time on your phone, not the number of minutes. Done by 1245. Never in..."
- tail: "A light vehicle with no call is a broken promise. Mahalo."

### Four Step Close, Part 5
`6326b8df-7e33-43f9-bbb0-3da11f1dca20` · Craft · 76s · vertical `ready`

- runs 6.22s past Mahalo
- **the second to look at: 69.75s**
- the 447-film plan measured this tail at **0.62s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Step four, the ask. Well, we're not really asking. We're saying, all I need is your authorization. All I need is your approval. All I need is your approval."
- tail: "All I need is your authorization. Mahalo!"

### Four Step Close, Part 7
`3a1a6e00-b92c-42a6-a598-c25930cf0824` · Craft · 99s · vertical `ready`

- opens "4", not Aloha
- **the second to look at: 3.20s**
- head: "4 step close part 7."
- tail: "ask it at the middle. At the end, we are assuming that the customers are going to buy something because we've done such a great job. Mahalo."

### Four Things You Can Stop Doing
`c95e46ba-22d7-414e-8284-76cf924ae7ab` · Mindset · 79s · vertical `ready`

- runs 1.58s past Mahalo
- **the second to look at: 77.72s**
- the 447-film plan measured this tail at **1.26s** and proposed no tail cut
- head: "Aloha, four things to stop doing. That's by Author Unknown. I kind of like Author Unknown. Four things to stop doing right now if you value your..."
- tail: "bad history with a customer. Logging just a few notes in your system about a customer can impact your future with them greatly. Mahalo."

### Four Things You Can't Get Back
`4701a64c-61a5-40b1-b254-443dce8c5e8d` · Mindset · 67s · vertical `ready`

- runs 1.57s past Mahalo
- **the second to look at: 65.97s**
- the 447-film plan measured this tail at **1.40s** and proposed no tail cut
- head: "Aloha! Four things you can't get back. The word after it is said, an opportunity after it's missed, time after it's..."
- tail: "our actions. In the car business, we need to use our words, our opportunity, and our trust with care. Mahalo."

### Lasting Impressions — Closer
`2a458ec9-6f0c-4d77-ac95-3be768576347` · Craft · 70s · vertical `ready`

- opens "That's", not Aloha
- **the second to look at: 0.06s**
- head: "That's lasting impressions baby. Active delivery. Shut the door, wipe the mirror and wave. That's how to do it. So now what?"
- tail: "that makes it even better. Share a story with me about the customer who remembered you, and that'll make me happy. Mahalo."

### Lasting Impressions, Part 12
`7e15c899-dbec-4702-9973-82d5f528d12a` · Craft · 102s · vertical `ready`

- opens "Prospect.", not Aloha
- **the second to look at: 2.04s**
- head: "Prospect. Aloha, two more things before the customer bounces. One, ask for business. Are you currently prospecting at delivery?"
- tail: "door, you wipe the mirror, you wave, and that's the lasting impression a customer is gonna have with you. Mahalo!"

### Lasting Impressions, Part 2
`142ef72e-7ca4-4eee-943b-328b594546cb` · Craft · 110s · vertical `ready`

- runs 7.26s past Mahalo
- **the second to look at: 102.74s**
- the 447-film plan measured this tail at **1.66s** and proposed no tail cut — it flagged itself: `offset-suspect(captions 118.28 vs words 112.64)`
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Mobile pay is where active delivery, where those lasting impressions actually start in this process."
- tail: "folks that just have a smelly car. Mahalo!"

### Lasting Impressions, Part 5
`b7f57bba-614d-48cf-9be4-ef4c29c6ac9f` · Craft · 106s · vertical `ready`

- runs 6.01s past Mahalo
- **the second to look at: 99.86s**
- the 447-film plan measured this tail at **0.36s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! When they show up, we need to go over the vehicle report and go over it in the same way you pitched it. Let's talk about that order first."
- tail: "not decline decline. So final, that's not what we're doing. Mahalo!"

### Menu Wrap-Up, Part 1
`dbc3b4ad-c86b-4d69-86ee-5a1d05404ac3` · Craft · 144s · vertical `ready`

- opens "coverage.", not Aloha
- **the second to look at: 1.86s**
- head: "coverage. Aloha. We've walked the whole ladder 5 ,000 to 150 ,000 miles. Now, here's a handful of things"
- tail: "train ends. You gotta report to the customer what they're getting for their money and how it is valuable. Mahalo!"

### MPI Setup
`508e939e-ed11-4c8d-8321-3b8f1bbde208` · Pitches by Op Code · 97s · vertical `ready`

- opens "Tires,", not Aloha
- **the second to look at: 0.81s**
- head: "Tires, setting up the multi -point inspection. Okay."
- tail: "So talk to him about it. It's a really big deal. Set up that multi -point inspection and you'll give Hector the best chance he's got. Mahalo!"

### MPI Setup
`ca5dc36a-442a-4726-be11-c5a06834e6af` · Pitches by Op Code · 146s · vertical `ready`

- opens "Let's", not Aloha
- closes "Hector.", not Mahalo
- **the second to look at: 0.06s**
- head: "Let's set up the multi -point inspection and see if we can offer an AC evaporator core cleaning service. So remember, you could have done it at pre -rise."
- tail: "at all. Now, to get certified in that, you can go to the Get the Hell Outta Here Speech and get certified and truly set up Hector."

### Name Tag — Closer
`02812647-59a7-473a-b2c1-20b29b2764fb` · Craft · 70s · vertical `ready`

- opens "That's", not Aloha
- **the second to look at: 0.07s**
- head: "That's what's in the nametag. Your dealership, your brand, you, and your advice. So now what? How about a challenge?"
- tail: "four things, what's one thing? And remember, if you need some inspiration, just look down at that name tag. Mahalo."

### Name Tag, Part 6
`3e12212a-02b0-4f41-9b47-9cab52bb58ed` · Craft · 113s · vertical `ready`

- closes "advisor.", not Mahalo
- **the second to look at: 0.23s**
- head: "Aloha! Third thing on your name tag is your title. Now, you gotta know who you are. You are a service advisor and you gotta..."
- tail: "You're a service advisor."

### Name Tag, Part 9
`1fecaeec-2747-409d-a574-948e87b6e615` · Craft · 151s · vertical `ready`

- runs 7.09s past Mahalo
- **the second to look at: 143.74s**
- the 447-film plan measured this tail at **0.49s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha. Everything on your name tag runs through one skill, listening. And most people don't listen. They wait to speak."
- tail: "motion, then address the vehicle. Mahalo."

### Never Lose Money
`801aa254-a12f-4448-9d15-a07ac9e486e1` · Mindset · 22s · vertical `stale`

- closes "fee...", not Mahalo
- **the second to look at: 0.41s**
- head: "Aloha! Rule number one, never lose money. Rule number two, never forget rule number one. That's a quote by Warren Buffett."
- tail: "Do not discount. Take away features before gross. Customer won't lock in on a three -part service. Offer them a two -part service. Find where fee..."

### On the Drive
`2ff913f2-0a78-4f56-92ed-7ed02d9b20a4` · Pitches by Op Code · 234s · vertical `ready`

- runs 2.35s past Mahalo
- **the second to look at: 231.28s**
- the 447-film plan measured this tail at **0.04s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Let's offer an evaporator service right on the drive. Now remember, you could have done pre -writes, and you could have pre -sold a"
- tail: "to pull that cabin air filter and video it or do a picture of it and let that do the work. Mahalo."

### On the Drive
`a118a9a8-b129-4dd6-86d0-5f9c21140efa` · Pitches by Op Code · 216s · vertical `ready`

- runs 1.78s past Mahalo
- **the second to look at: 214.68s**
- the 447-film plan measured this tail at **0.94s** and proposed no tail cut
- head: "Aloha! Let's talk charge port cleaning on the drive, new opcode, and a new kind of customer, or at least it could be."
- tail: "If they say no, let it go, but make a note of it. Next visit, it won't be a brand new idea anymore. Mahalo."

### On the Drive, Part 2
`249b3f98-c658-4145-939e-a212a35977ab` · Pitches by Op Code · 125s · vertical `ready`

- runs 1.79s past Mahalo
- **the second to look at: 123.21s**
- the 447-film plan measured this tail at **-0.31s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Let's go into part two of offering coolant hoses on the drive. Why this matters more than a customer expects is say that part out loud because customers"
- tail: "Two things all day, every day. You gotta remember on these hard op codes, yourself and your team. Everything else is just offerings. Mahalo."

### Piggyback
`0298ebf1-89dc-40a5-9399-277b17693cec` · Pitches by Op Code · 179s · vertical `ready`

- partial pull: came back 6.75s of 10.00s

### Piggyback
`48f897e0-87e3-4a38-9bcf-11a6ea980f36` · Pitches by Op Code · 179s · vertical `ready`

- runs 1.74s past Mahalo
- **the second to look at: 177.37s**
- the 447-film plan measured this tail at **0.57s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Let's find some Timing Belt piggyback sales. You sold the Timing Belt. Whew! That was a big one. Now let's talk about what comes with it."
- tail: "That's you being straight with somebody about a decision they'd want to make a different one in the future. Mahalo."

### Promise Yourself
`ad521817-19fb-4bea-bf9b-1b137f609380` · Mindset · 121s · vertical `ready`

- runs 1.53s past Mahalo
- **the second to look at: 119.43s**
- the 447-film plan measured this tail at **1.33s** and proposed no tail cut
- head: "Aloha! Promise yourself to be so strong that nothing can disturb your peace of mind. Promise yourself to talk to God."
- tail: "expectation and confidence that one will experience positive outcomes in life and that's all we need. Mahalo."

### Seasonal Menus, Part 4
`1e3b8e57-2fde-4af0-8f49-253572d8adf3` · Menu · 178s · vertical `ready`

- runs 4.77s past Mahalo
- **the second to look at: 172.93s**
- the 447-film plan measured this tail at **-0.79s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Spring is the other prep season, and it's the one almost nobody works, because nothing's broken yet. Same as fall, same opportunity."
- tail: "of stuff working for you. Everything else rides along. Mahalo!"

### Selling Skills, Part 1
`1abbfde9-ee7f-4583-a1a8-3d2d124f04e5` · Craft · 102s · vertical `ready`

- runs 5.29s past Mahalo
- **the second to look at: 96.15s**
- the 447-film plan measured this tail at **0.06s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Before you pick up the phone, there's something that only the good advisors do. They watch that multi -point inspection video. Your certified techni -"
- tail: "Overcoming the objection before you make the call. Mahalo."

### Success Cycle, Part 10, Anatomy of the Speech
`e5d1de92-01c1-4d36-9949-aac66309735f` · Craft · 218s · vertical `ready`

- opens "nothing decoded", not Aloha
- head: no audio decoded (0 words)
- neither head decoded words, so the two cannot be compared
- **the second to look at: 1.70s**
- tail: "speech. Go through it. Pick the words you like. Take off the words that you don't like, but be consistent in your speech. Mahalo."

### The Big Ticket Visit, Part 2
`f080ab6a-b69f-4ae8-841a-4c1967fc5e05` · Craft · 139s · vertical `ready`

- runs 1.65s past Mahalo
- **the second to look at: 137.21s**
- the 447-film plan measured this tail at **0.25s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Big Ticket Visit Part 2. The multi -point inspection still happening. This is the one that gets skipped and it's the most"
- tail: "But some will say yes and they'll say yes because you were straight with them about why you were asking. Mahalo."

### The More Things You Give
`e89f11a4-bd83-4551-bd85-2fc93f0e13a8` · Mindset · 79s · vertical `ready`

- runs 1.63s past Mahalo
- **the second to look at: 77.64s**
- the 447-film plan measured this tail at **1.48s** and proposed no tail cut
- head: "Aloha! The more things you give, the more you get. That's one for me. No famous name or no book to go by. Just something I've watched happen on the drive -"
- tail: "for no reason at all. You didn't ask for it, you built it. 40 pushes at a time. Every day is a great day to turn the wheel. Mahalo."

### The Most Dangerous Person
`b822e731-6522-4f55-930b-722ad575b965` · Mindset · 107s · vertical `ready`

- closes "one.", not Mahalo
- **the second to look at: 1.32s**
- head: "Aloha, the most dangerous person by Bruce Lee. The most dangerous person listens, thinks,"
- tail: "rather than through fours. The intake conversation, listen more than you talk. The quiet advisor is the dangerous one."

### The OE Approach — The Maintenance Menu
`7574149a-5477-4959-adbf-e34a09c02479` · Craft · 167s · vertical `ready`

- closes "guessing.", not Mahalo
- **the second to look at: 1.62s**
- head: "Aloha! Every manufacturer has a maintenance schedule. Toyota, Ford, BMW, Hyundai, Subaru, all of them."
- tail: "3 milestones, we're going to speak about severe conditions, lifetime fluid conversations, and how to use a chart instead of guessing."

### The OE Approach — Use the Chart
`6ca783a5-8a7e-4f0e-984b-d7c9559a2c05` · Craft · 174s · vertical `ready`

- runs 1.52s past Mahalo
- **the second to look at: 172.65s**
- the 447-film plan measured this tail at **1.11s** and proposed no tail cut
- head: "Aloha! Let's talk about a chart that can help you out. Last one in this module, and it's about what you do instead of guessing. Here's how you do it."
- tail: "Because knowing what's due at $30 ,000 is one thing, presenting five services on one visit without losing all five is another. Mahalo."

### The OE Stagger — The Order and Why
`14f20d45-178a-4cbc-9761-bb8a1d26f4f0` · Craft · 254s · vertical `ready`

- closes "time.", not Mahalo
- **the second to look at: 1.82s**
- head: "Aloha! Five fluids, five visits. And the order is not random. Break fluid, differential, power steering, transmission, and"
- tail: "and then finally the long one. Break, diff, power steering, transmission, and then coolant. Learn it, run it, every customer, every time."

### The OE Stagger — Why We Spread Them Out
`412e2cd0-75b9-4a8f-8a59-3c3a4c677523` · Craft · 168s · vertical `ready`

- runs 1.73s past Mahalo
- **the second to look at: 166.07s**
- the 447-film plan measured this tail at **0.22s** and proposed no tail cut
  (a head cut cannot lengthen a tail, so that earlier number is the unreliable one)
- head: "Aloha! Here's the problem this module solves and it's the biggest one on a menu. Your customer hits 30 ,000 miles. Open the factory's schedule and you can see the"
- tail: "visit, five visits, all five sold, and a customer who never once felt like they got hit with a list. Mahalo."

### Two Minute Walk-Around, Part 1, Pop the Hood
`ee8551f3-c0af-4345-8dc1-5c2e7d092a65` · Craft · 151s · vertical `ready`

- opens "2", not Aloha
- **the second to look at: 6.97s**
- head: "2 minute walk around part 1. Pop the hood."
- tail: "with a customer standing right next to you because then you lose their confidence. Next up, what we're actually looking for under the hood. Mahalo."

### Wall Street
`6ac8ff68-b979-43f3-8a72-e32c0feb0e89` · Mindset · 59s · vertical `ready`

- closes "tricks.", not Mahalo
- **the second to look at: 2.02s**
- head: "Aloha, Wall Street is the only place that people ride to work in a Rolls Royce to get advice from someone who took the subway."
- tail: "from a person making half of what you make. The porter sees things you don't. So does the customer. Be the old dog that learns new tricks."

### Your Toughest Opponent Is Staring at You
`704a5728-23e1-444d-b724-7b8888e54e77` · Mindset · 26s · vertical `stale`

- closes "full...", not Mahalo
- **the second to look at: 0.29s**
- head: "Aloha! Your toughest opponent is staring back at you. Look yourself in the mirror. You see this guy staring back at you? That's your toughest opponent."
- tail: "manifestation of bad thoughts is real. So is manifestation of good thoughts. You must first have that person in the glass as a believer before you can reach your full..."

## Verticals set `stale` by this check — 1

The crop is wrong; the master is not. A phone letterboxes the master on these
until somebody re-cuts them, which is the re-derive ticket and not this pass.

- **70,000 Mile Dealer Upsell Menu, Part 2 (2821)** `fe35f2ea-2fa7-4b07-acca-ea16e2e2c8c7` — its sound starts 2.889s from where the master's does

