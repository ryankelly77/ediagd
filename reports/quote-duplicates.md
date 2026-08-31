# Quote duplicate report

**Date:** 2026-08-31 · **Project:** ediagd
**Phase 1 — report only. No writes. Nothing retired.**
**CSV:** `reports/quote-duplicates.csv` — the `decision` column is blank for you.

---

## The three seed pairs, found unaided

```
Q0063 / Q0095   group 37   drift    survivor Q0095   LINKED
Q0224 / Q0309   group 26   drift    survivor Q0309   LINKED
Q0141 / Q0142   group 34   excerpt  survivor Q0141   LINKED
```

All three survivors are decided by tiebreak 1 — the row a video points at —
not by the text rules. That is the rule working as specified rather than a
coincidence, and it is worth noticing that it did all the work.

---

## The Happy Kid pair needed a third test

Q0224 / Q0309 fails both tests the spec names:

```
Q0224  Don't try to make a happy kid happier. If it's not broken, don't break it.
Q0309  The most underrated management skill is knowing when to do nothing.
       Don't try to make a happy kid happier.
```

Neither body contains the other, and their token-set similarity is **0.35** —
nowhere near 0.90. Each row wraps the same line in different framing, so
comparing whole bodies cannot see it.

So I added a third relation: **a whole shared sentence**. Split on terminal
punctuation, normalize, and require at least four content-bearing words so
"This too shall pass" doesn't match everything. That is how this library was
actually built — somebody kept a good sentence and rewrote what surrounded it —
which makes a shared sentence stronger evidence of one idea entered twice than
any similarity score on the full body.

It found the seed pair and 8 more groups the other two tests missed.

---

## Counts

**436 live quotes.** 47 duplicate groups covering 104 rows.

| | Groups |
| --- | ---: |
| **exact** — normalized bodies identical | **1** |
| **near — drift** — comparable length, one line written twice | **19** |
| **near — excerpt** — one row far shorter than the other | **27** |
| identical text in different voices | **0** |
| groups with no survivor proposed | **0** |

**57 rows proposed for retirement. 47 survive.**

`exact` counts 1 because a group holding an identical pair *and* a looser
variant is reported as `near` — the weaker evidence wins, since that is the row
that needs reading. Counted as pairs rather than groups there are **2**
identical pairs.

---

## Drift is the tier that matches the August audit

**20 groups** (the 1 exact + 19 drift). The August Quote Master audit counted
17 duplicate texts, so this is the same population plus a few the audit's
eye missed. These are safe in the ordinary sense: the same line, entered twice,
differing by a word or a comma.

```
Q0067 / Q0121   No structure. No standards. No discipline.  vs  commas and a dash
Q0070 / Q0103   "Stack it for 90 days"  vs  "Stack that for 90 days"
Q0075 / Q0112   "It will not."  vs  "It will not process failure."
Q0198 / Q0270   same sentences, different order — Jaccard 1.000
```

---

## Excerpt is where your judgement is needed, and it is not a backlog

**27 groups.** The rule fires correctly — one row genuinely does contain or
share a sentence with the other — but "correct" is not the same as "should be
retired". A short standalone line living inside a longer passage may be
deliberate: the punchy version is what fits on the quote card.

The clearest case against blanket approval is **group 10**:

```
Q0024  Dreams without goals are just dreams. And ultimately they fuel…
Q0025  Without commitment, you'll never start. But without consistency…
Q0026  Dreams without goals are just dreams. On the road you must apply…   SURVIVE
```

Q0024 and Q0025 are two *different* lines that each appear inside Q0026's
longer passage. The proposal retires both and collapses three usable quotes
into one. That may be what you want, or it may lose two good cards.

Groups retiring more than one row: **4** (five "This too shall pass" variants
down to one), **10**, **13**, **16**, **22**, **23**, **31**, **32**.

The other end of the tier is unambiguous — **group 34**, where Q0142's whole
body is `"Ask yourself what's important now` — an unterminated fragment with a
stray quote mark. That one is broken, not short.

---

## The link overrode the text rule twice

Acceptance asked for this to be flagged. Both are in the CSV's `flag` column:

| Group | Link picks | Text would pick | |
| --- | --- | --- | --- |
| 11 | **Q0072** "Demand excellence from YOURSELF." | Q0106 (the fuller passage) | link wins |
| 24 | **Q0205** "Practice doesn't make perfect…" | Q0285 | link wins |

Group 11 is the one to read: the survivor is a four-word quote and the row
retiring is the fuller Kobe passage it was clipped from. The link wins because
a video points at Q0072 and retiring it would leave that video pointing at a
withdrawn row — but the *content* argument runs the other way. If you'd rather
keep Q0106, the fix is to move the video's link first and then retire Q0072,
which Phase 2 will refuse to do on its own.

---

## Nothing linked is proposed for retirement

Eight of the 21 linked quotes appear in a duplicate group:

```
Q0072  Q0094  Q0095  Q0108  Q0141  Q0205  Q0309  Q0311
```

All eight are proposed to **survive**. No group holds two linked rows, so the
"needs a person" case never fired.

For a quote the link is **inbound** — the pointer lives on the video and names
the quote — so this reads who references the row, not what the row references.
Checked: 0 quotes have their own `artifact_id` set, and all 21 links target
quotes. Reading the wrong direction would have found nothing and proposed
retiring exactly the rows that must not be retired.

---

## Zero voice conflicts

No two rows share identical text in different voices, so the misattribution
section of the CSV is empty. Worth stating because it was the failure the
matcher's voice gate was built for — it just doesn't occur in this library.

---

## What to do

Fill the `decision` column in `reports/quote-duplicates.csv` and hand it back.
Phase 2 (`scripts/dedupe-quotes.ts`) retires only what you approve, moves any
inbound `artifact_id` and slot membership to the survivor first, and refuses to
retire a linked row, both rows of a group, or across a voice mismatch.

My read: the **20 drift groups are safe**, the **27 excerpt groups are a
question about what this library should hold** — short cards or long passages —
and **group 11 deserves a decision about the video link before anything is
retired**.
