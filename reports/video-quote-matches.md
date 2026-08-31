# Video ↔ quote match report

**Date:** 2026-08-31 · **Project:** ediagd
**Phase 1 — report only. No writes. Nothing linked.**
**CSV:** `reports/video-quote-matches.csv` — the `decision` column is blank for you.

---

## Test case — passed unaided

```
MINDSET — Never Lose Money (Buffett) — v1
  ->  Q0469   tier A   score 1.000
      "Rule #1: Never lose money. Rule #2: Never forget rule #1."
```

Found by the general rule, not a special case: the normalized video string
`never lose money` appears verbatim inside the normalized quote body.

---

## Counts

**56 Mindset videos** (retired excluded) against **436 quotes**.

| Tier | Videos |
| --- | ---: |
| **A — exact** | **12** |
| **B — strong** (≥ 0.85) | **4** |
| **C — possible** (0.65–0.85) | **6** |
| none | 34 |
| **quotes matched by more than one video** | **0** |

### By voice — A or B / total

| Voice | | |
| --- | ---: | --- |
| Mitch Hardt | 4 / 35 | expected — most are his own, filmed once |
| Warren Buffett | 7 / 10 | |
| Kobe Bryant | 5 / 8 | |
| Lou Holtz | 0 / 1 | landed C, see below |
| Alan Watts | 0 / 1 | **no twin can exist** |
| Les Brown | 0 / 1 | **no twin can exist** |

21 non-Mitch videos in scope, not 19 — the 11th Buffett video is the retired
duplicate cut, correctly out of scope.

---

## How it matched

**Never on quote title.** A quote's title is its category label — Q0469 is filed
as *"Risk / Capital preservation"* — so title matching would have scored the
correct pair at zero. The words live in `body`.

**Voice is a gate, not a signal.** Disagreement removes a pair entirely rather
than ranking it low. That gate earned its place immediately: my earlier ad-hoc
pass in this session matched *"Practice Makes Improvement"* (Les Brown) to a
**Vince Lombardi** quote on word overlap alone. It was a false positive, and the
gate now makes it impossible.

**Containment, not Jaccard**, for tiers B and C — `|A ∩ B| / |A|`, where A is the
video's tokens. The video string is short and the quote is long, so Jaccard
divides by the union and would score the true Never Lose Money pair at **0.33**.
Containment asks the question that matters — how much of the video's title is
present in the quote — and scores it **1.0**. The cost is that a one-word title
would match anything containing that word, so a candidate needs at least two
content-bearing tokens to be scored at all.

Tier A compares the quote **as written**; tiers B and C drop a leading
enumerator (`Rule #1:`) first, since a numbering scheme the video title would
never carry should not count against the overlap.

---

## All 12 tier-A matches, checked by eye — no false positives

```
Fearful When Others Are Greedy   -> Q0486  Be fearful when others are greedy…
Demand Excellence                -> Q0072  Demand excellence from YOURSELF.
You Are Not Tired                -> Q0066  You are not tired. You are undisciplined.
Perfect Practice Makes Perfect   -> Q0205  Practice doesn't make perfect. Perfect practice…
Wall Street                      -> Q0479  Wall Street is the only place…
The Mamba Mentality              -> Q0094  The Mamba Mentality simply means…
Build the Habits You Admire      -> Q0489  Develop and build the habits you admire…
Never Lose Money                 -> Q0469  Rule #1: Never lose money…
Be Better Than That              -> Q0222  Be better than that.
Always Keep Going                -> Q0108  Always keep going. The storm eventually ends…
I Looked in Your Cup             -> Q0311  I looked in your cup to see if you have enough…
20 Years to Build a Reputation   -> Q0470  It takes 20 years to build a reputation…
```

---

## The C tier is where your judgement is actually needed

Four of the six are, on reading, **correct pairs that scored low because the
video title is a paraphrase of the quote rather than a phrase from it** — Mitch
titles by topic, not by extract:

| Video | Quote | Score |
| --- | --- | ---: |
| Owning Portions of Businesses | Q0474 *"When we own portions of outstanding businesses…"* | 0.667 |
| Successful vs. Really Successful | Q0473 *"The difference between successful people and really successful people…"* | 0.667 |
| Solving Difficult Problems | Q0476 *"Charlie and I have not learned how to solve difficult business problems…"* | 0.667 |
| WIN: What's Important Now | Q0141 *"Ask yourself what's important now — because it'll evaluate the past…"* | 0.750 |

The WIN one is instructive: **"WIN" is an acronym that never appears in the
quote**, so a quarter of the video's tokens can't match by construction. The
matcher is right to hesitate and you will be right to approve it.

I did **not** lower the threshold to sweep these into B. Moving the line to
0.65 would also promote genuinely weak pairs, and the C tier exists precisely so
these reach you rather than a rule.

---

## The 34 with nothing — mostly correct, and provably so

31 are Mitch Hardt. His own words filmed once are **video-only artifacts, not
failures** — there is no text row because there never was one.

For the five non-Mitch misses I checked whether a twin could exist at all:

| Video | Finding |
| --- | --- |
| The Lowest Point Is the Doorway (Watts) | **0 quotes exist in that voice.** No twin possible. |
| Practice Makes Improvement (Les Brown) | **0 quotes exist in that voice.** No twin possible. |
| Doubt Is a Strange Thing (Kobe) | 69 Kobe quotes, none containing "doubt" |
| Did I Get Better Today? (Kobe) | 69 Kobe quotes, none on that idea |
| The Moment You Feel Comfortable (Kobe) | nearest are Q0069 / Q0102 on *"Growth is uncomfortable"* — related, not the same line |

So the matcher is not missing them. Two of the five **cannot** match, and the
Watts and Les Brown videos are the first evidence that the quote library has
voices the video library doesn't.

---

## Zero multi-match flags

No quote is the best match for two videos, so there is no duplicate-take or
multi-quote-in-one-take hazard in this batch. Worth stating because the retired
Buffett orphan was exactly that pattern — it is already out of scope, and
nothing else looks like it.

---

## What to do

Fill the `decision` column in `reports/video-quote-matches.csv` with
`link`, `skip`, or `note`, and hand it back. Phase 2
(`scripts/link-artifacts.ts`) applies only rows marked `link`, dry-run by
default, and refuses any pair whose voices differ or whose rows are retired.

My read, for what it's worth: **the 12 tier-A are safe**, the **4 tier-B worth a
glance**, and the **4 paraphrase pairs in C are almost certainly right** — but
they are yours to call, which is the whole reason this stopped here.
