# Verticals cut from the repaired masters, and the 13 films still out of sync

Ryan, 30 October: the loop played The Most Dangerous Person landscape, audio now in sync, and asked whether the vertical fix is coming. Not from the job that is running.

## What phase 5 of sync-finish did

It tried 67 stale verticals and passed none. The gate refused every one, so nothing wrong reached a phone, but each left an orphan Mux asset and the job would spend the next twelve hours doing the same to the other 214. Two defects in `phase5()` of `scripts/sync-finish.mjs`:

1. **No cut.** It runs ffmpeg on the whole disk master (`-i m`, no `-ss`, no `-t`), so the vertical carries the slate the landscape cut removed, and its length and every `position_sec` disagree with the landscape. The cut window is on every swapped film in `reports/sync-recut.json` (`window`), and in the trim ledger for the rest. The vertical is cut from the disk master at the same window as the served landscape, accurate seek before `-i`, crop and full re-encode in the same pass, so both renditions are one cut.
2. **The gate compares a crop to the full frame.** `sync-instrument.py` hashes the vertical's 9:16 frames against the master's full frames. A crop never matches the full picture, so the picture lag is noise: offsets from minus 42 seconds to plus 0.4 seconds, or null. Give the instrument a crop mode that crops the master the same way before hashing. Prove crop mode on one vertical that is already ready (one of the 208) before trusting it on new ones.

## Three things the run was asked for that did not happen

- **Phase 2 shifted by the wrong number.** It used the old served asset's offset (Piggyback -241.9, On the Drive -78 ms) and both re-cuts landed at almost exactly that shift (-240.7, -74.7). So the method cut itself is near zero on both and the shift was the error. Re-cut both at their ledger windows with the method and no shift, gate, swap on pass. Only if a residual over 40 ms survives, shift once by that cut's own residual, in the direction that cancels it.
- **Phase 3 measured the 11 and cut none.** Each was marked "needs a cut" (After-MPI WBF-018 -320, The OE Stagger +1184, How to Take a No -175, and eight Mindset quotes from -171 to -279 ms). Cut each with the method from its disk master at its ledger window, gate with the master-alignment instrument because the correlator cannot read them, swap on pass. The OE Stagger first.
- **Coolant Hoses.** The retitle left "On the Drive, Coolant Hoses" ambiguous. List the two candidate titles for Ryan in the report; do not pick.

## Order of work

0. **Stop the job now**: `PID=$(cat reports/.sync-finish.lock); kill -- -$PID 2>/dev/null || kill $PID`, then confirm no ffmpeg or node from it is left. Its phase 5 ledger rows are all failed derives: copy the ledger aside, clear the `p5:` rows so a resume derives them again. Then `git switch main && git pull` in `~/ediagd` and branch.
1. **Fix and prove on three**: The Most Dangerous Person (Ryan watched it today), one 30 Second Walk-Around film, one menu film (static picture). For each: vertical duration equals the landscape within 0.5 s, the first spoken word lands at the same time in both within 0.1 s, crop-mode offset within 40 ms. Mark these three ready only on all three checks.
2. **Clean up Mux**: delete the vertical assets the failed phase 5 uploaded and the two phase 2 assets, by the `newAssetId` on their ledger rows, after checking no `content` row references any of them. Count them in the report.
3. **Launch detached, exactly as before** (nohup, caffeinate, setsid, write-ahead ledger, pid lock, resumable, gates on, no stopping for Ryan): the 13 films first, then every stale vertical, films swapped this week first, core tracks first within them. Two vertical derives at a time with one ledger writer; swaps stay serial. The ingest agent is also on this Mac in `~/ediagd-ingest`; leave that worktree alone.
4. **PR now** for the phase 5 fix and the crop mode, against main from current main, base checked by hand. When phase 5 finishes, a second one-line PR that uncomments the `derive-vertical.yml` schedule; not before, or the cron races the run.

## Report

The three proofs with the numbers, how many orphan assets were deleted, the two Coolant Hoses candidates, PR number, and the time the run started. Then in the morning: the 13 by verdict, verticals ready and failed with the reason for each failure. Nothing else.

---

# Two confirmed wrong-cut mezzanines, 21 November

> **Scope, added 27 November.** Everything in this section measures the crops
> **cut on 21 November**, which were refused and never linked. It is *not* about
> the crops the rows point at. For Brave Enough those are two different assets
> with two different verdicts, and conflating them is what the 27 November
> update below had to untangle. **Brave Enough no longer needs a new mezzanine**
> — see that update.

`scripts/derive-vertical.ts`'s header has carried this open question since
8 October:

> *"On the two failing films the mezzanine begins about five seconds INTO the
> film and contains no 'Aloha' at all, while the HLS — which is what a desktop
> plays — opens on it. THE DURATIONS AGREE IN ALL FOUR CASES, to within a
> quarter second. That is what hid it… Why only some rows is NOT known, and
> trim status does not predict it. That is the open question, and it belongs to
> the re-derive ticket."*

**Two more rows are now confirmed to have it, with the transcripts to prove
it.** Both were refused by the fidelity gate during the 21 November drain, and
both refusals were correct. They are named here so the re-derive ticket has
real cases rather than a description.

### Lasting Impressions, Part 8

```
master (HLS)  "Aloha! Two more things in the packet, and both of them are
               free to include. Number one is accessories. If a truck rolls
               in, put a ..."
vertical      "free to include. 1. The accessories. If a truck rolls in, put
               a rack brochure in the packet..."
```

The crop begins at **"free to include"** — roughly five seconds in. Lengths
agree: 96.73 s against a stored 97.

### Brave Enough

```
master (HLS)  "Aloha! Brave Enough by Sarah Bahada. Let's be honest, the
               service drive can feel like a relentless machine. Between the
               angry customers..."
vertical      "The service drive can feel like a relentless machine between
               the angry customers, the backordered parts and the constant
               pressure to hit your numbers."
```

The crop begins at **"The service drive"** — it loses the Aloha *and* the
title card. Lengths agree: 70.63 s against a stored 71.

> **RESOLVED 27 NOVEMBER — Brave Enough does not need a new mezzanine.** The
> crop measured above is the asset cut on 21 November, which was refused and
> never linked. The crop the row actually points at was cut on **8 October** and
> is a faithful, complete cut of the current master; it was verified head,
> middle and tail and re-served, and a phone gets the vertical again. The
> wrong-cut 21 November asset is
> `rX501BVzkNf3nqQ78GRvn02r6D801NbsN00O5w02PUwEnLEs`, still in Mux, not deleted.

### What this adds to the question

Both tails close on "Mahalo." in the master and in the crop, and the durations
agree to within a tenth of a second.

> **CORRECTED 22 NOVEMBER.** This section first said *"the mezzanine is not
> shifted; it is missing a piece of the front and nothing else."* **The second
> half was wrong**, and it was wrong because it was inferred from a ten-second
> tail window instead of measured against the whole file. Timing both ends says
> something much more specific:

```
                              duration   "Mahalo." ends   silence after
Brave Enough        master      70.55 s        69.52 s         1.03 s
                    crop        70.63 s        64.52 s         6.11 s
                                           DELTA  -5.00 s

Lasting Impressions master      96.79 s        96.10 s         0.69 s
  Part 8            crop        96.75 s        91.10 s         5.65 s
                                           DELTA  -5.00 s
```

**The export window slid late by five seconds, and the duration was preserved
with silence at the end.** The crop's content is the master from +5 s onward,
laid down at crop-time zero, then padded. That is why the front is missing, why
the total length still matches, and why the tail still says "Mahalo" — at
91.10 s instead of 96.10 s, which a ten-second tail read still catches and so
reported as agreement.

**MINUS FIVE POINT ZERO ZERO ON BOTH FILMS.** Not 4.8 and 5.3 — the same number
twice, to the centisecond, on two films of different lengths cut on different
days. AGENTS.md already says what to do with that: *"when a difference is
suspiciously uniform, that uniformity is the thing to explain, not the thing
that makes it credible."* Two independent accidents do not agree to a
centisecond. Whatever produces the mezzanine is applying a constant five-second
offset, and that is a far narrower thing to go looking for than "why only some
rows".

It also rules out "the vertical was derived before the trim" for these two: the
crops were made on 21 November from the masters as they stand today.

Neither film can be repaired by re-deriving. Until the mezzanine question is
answered they serve the landscape cut letterboxed, which is the correct
fallback and is what they do today.

**Not to be confused with the three in the same batch that were refused
wrongly** — Two Minute Walk-Around Part 1, Never Lose Money and Your Toughest
Opponent. Those crops are faithful; the gate's one-word comparison was not.
That is fixed separately, in `scripts/vertical-match.ts`.

---

# Update, 27 November — one film re-served, one still landscape

## Brave Enough: the 8 October crop was faithful all along

Measured over signed HLS against the **current** master, head, middle and tail:

```
                        duration   opens                              "Mahalo." ends   trailing silence
master                   70.55 s   "Aloha! Brave Enough by Sarah…"         69.52 s          1.03 s
crop the row points at   70.66 s   "Aloha! Brave Enough by Sarah…"         69.56 s          1.10 s
                                   @30 s and @55 s: word-for-word identical
```

Everything inside 0.11 s. The crop was created in Mux on 8 October from the
master that has been in place since 8 September, so it never had a later take to
fall behind. Re-served with one `set_vertical_rendition()` call using the ids the
row already held — no encode, no upload, no new asset. Before and after values
are in `docs/WORK_LOG.md`. Proven afterwards through `renditionsFor()` and
`pickRendition()` on the live row: iPhone 14, iPhone SE and iPad portrait return
`vertical-fits`; desktop still returns `wide-viewport`, the server's first render
still `not-measured`.

**The lesson is the one this file keeps relearning.** Two assets for one film,
both called "the vertical", with opposite verdicts — and the row's
`vertical_error` described the *refused* one while the row *pointed at* the good
one. A film-level statement about "the crop" was never a statement about a
single thing.

## Lasting Impressions, Part 8: no change, and it stays landscape

The crop it points at is wrong, and `stale` is the right flag. What the record
adds:

- The master was swapped at **2026-10-06 20:55:22**; the crop was linked at
  **20:57:21** — **1 minute 59 seconds later**. The crop therefore postdates its
  master, and "the vertical was derived before the trim" does not explain it.
- The archived pre-trim master is **117.84 s**, the current master **96.79 s**,
  so the trim removed **21.05 s**.

**The pre-trim-timeline explanation does not survive the arithmetic, and it
should not be written down as the cause.** Two measurements rule it out:

1. The crop is **96.75 s** and its content runs **5.00 s** ahead of the current
   master. A cut taken on the pre-trim timeline would be displaced by whatever
   the trim removed from the front — part of 21.05 s — not by 5.00 s.
2. **Brave Enough's 21 November crop shows the identical −5.00 s**, and Brave
   Enough's master was last swapped on **8 September**, 74 days earlier. No swap
   could have landed mid-run, yet the same offset appears. Whatever produces
   −5.00 s is therefore not a swap landing mid-run.

What is established is narrower and already in `derive-vertical.ts`'s header: on
some assets the source the derive reads begins about five seconds into the film
while the HLS opens on the Aloha. **Not yet tested on these two films**, because
reading the master download requires granting master access — a Mux write, held
for Ryan. A static rendition of each asset (Mux's own re-encode, deleted again
immediately) opens on "Aloha!" for both, which says the stored asset is correct
from its start and points the finger at the source the derive reads, not at the
asset.

## The two "unreadable" films — and two more crops that start five seconds late

`At the Kiosk — Battery Replacement` and `Piggyback — Front Wiper Blades` were
refused by the 25 November sweep with no master transcript at all, at either
end, while their crops read fine. **It is neither of the two things that looked
likely.** Not a silent or musical open: the master's first ten seconds measure
**−25.1 dB and −27.0 dB** with speech in them. Not a failed transcription
either — a pull that *accepts* a short read transcribes them correctly. The
cause is in a field nothing downstream reads:

```
readEnds -> note: "partial pull: came back 6.78s of 10.00s"   At the Kiosk
readEnds -> note: "partial pull: came back 6.47s of 10.00s"   Piggyback
```

The master's HLS returns a short read, `pull()` requires `got >= expect - 0.75`,
retries three times and gives up — and `readEnds` funnels that into `e.note` and
returns empty strings. `EndsLike` has no `note`, so **the comparator never sees
why it got nothing**, and a reason that exists was sitting one field away from
the verdict for a fortnight. Re-read at 30 s: still a partial pull, still
unreadable. The widening is right and it is not enough; the pull itself is what
needs fixing, and that is not in this change.

**And the reason it matters more than a logging defect.** Probing the master at
successive offsets and asking where it starts saying what the crop says first:

```
At the Kiosk — Battery Replacement
  crop   @0s  "Think about the other opcodes, cabin air filter, coolant, wipers…"
  master @0s  "The kiosk is not normally where batteries get sold."
  master @4s  "get sold. Think about the other opcodes, cabin air filter…"
  master @6s  "other op codes, cabin air filter, coolant, wipers…"
                              -> the crop begins about 5.5 s into its master

Piggyback — Front Wiper Blades
  crop   @0s  "And this one turns a $40 sale into a real ticket item…"
  master @0s  "You sold the front blades, now let's talk about the rest of it. The piggyback"
  master @4s  "The piggyback and this one turns a $40 sale into a real ticket item…"
                              -> the crop begins about 5 s into its master
```

Lengths agree: 168.07 s against 167.98 s, and 178.90 s against 178.72 s. **Late
start, duration preserved** — the same shape as Lasting Impressions, Part 8 and
the 21 November Brave Enough crop, and now the same ≈5 s on four films.

> **Both rows are `vertical_status = 'ready'` and are being served to phones
> today.** They were linked in October, before any transcript comparison
> existed, and the gate that would have caught them could not read their
> masters. Nothing has been changed: this prompt permitted one database write
> and it was spent on Brave Enough. These two are reported, not touched.

That makes the uniform ≈5 s the thing to explain rather than a coincidence, on a
fourth and fifth independent film — and it means the population of late-starting
crops is **not** the two that refuse. It is at least four, and the only reason we
know about these two is that their masters happened to be unreadable. **Nobody
has asked how many `ready` crops would fail the comparison if it were run
against them**, which is a sweep, not a guess: the 25 November sweep's 472
passes include every row the `absolute` Aloha/Mahalo test rescued without the
comparator ever agreeing.

## Can `derive-vertical` still cut from an old timeline if a swap lands mid-run?

**Yes, and the gate cannot see it.**

`deriveOne` reads `mux_asset_id`, `mux_playback_id` and `duration_sec` once from
`vertical_derivation_queue` at the top of the sweep, then downloads, crops,
uploads, waits for transcode, compares and writes — minutes later, all against
that snapshot. A swap landing in the middle produces two failures at once:

1. The crop is of the **superseded** master.
2. `set_vertical_rendition()` writes `ready` on `where id = _content_id` with no
   reference to the master the crop came from, so it **overwrites the `stale`
   that the swap had just set correctly**.

And the fidelity gate is blind to it *by construction*: it compares the new crop
against `row.mux_playback_id` — the **old** playback id from the same snapshot.
Old crop against old master, which agree. The gate is self-consistent inside a
stale snapshot, so a tighter transcript comparison cannot help here. This is the
same class as a cursor that reports one field while resuming from another.

**The guard, not built.** Make the write conditional on the master not having
moved, rather than asking the worker to re-check:

```sql
set_vertical_rendition(_content_id, _asset_id, _playback_id, _from_asset_id text)
  update content … where id = _content_id and mux_asset_id = _from_asset_id;
  -- and then: if not found, RAISE. A write that matches zero rows must not
  -- return success — that is exactly how mark_push_opened lost every opened_at.
```

The caller passes the `mux_asset_id` it actually downloaded. A crop of a master
that is no longer the master then **cannot** be linked, rather than merely being
unlikely to be — which is the construction this file prefers. Note this is also
the only guard that would have caught the race at the moment it happened; a
later sweep comparing transcripts catches it only after a phone has played it.

## Re-judging the whole library from the saved sweep

The 25 November sweep saved every transcript it read, so the new comparator was
re-run over all 479 records without transcribing anything again.

**Exactly four verdicts change, and they are the four false refusals:**

| film | collection | 25 November | now |
|---|---|---|---|
| 30 Second Walk-Around, Part 2, Four Goals, Two Words | Craft | refuse (head) | **pass** |
| Name Tag — Closer | Craft | refuse (head) | **pass** |
| Dealer Upsell Menus and Interval Charts — Opener | Craft | refuse (tail) | **pass** |
| MPI Setup — AC Evaporator Cleaning | Pitches by Op Code | refuse (tail) | **pass** |

```
25 November   472 pass   5 head        2 tail
now           476 pass   1 head        2 unreadable
```

The one remaining refusal is Lasting Impressions, Part 8. The two `unreadable`
are the pair above — same films, same outcome of not being served a crop, but
now distinguishable from a film that was judged and failed.

### A correction, because the first version of this table said 41

My first re-run reported **41** changed verdicts. That was my mistake and not
the comparator's, and the cause is worth keeping because it is this file's
recurring one: **I inferred what a stored field meant instead of reading the
code that wrote it.**

`sweep.js` stores `ok: absolute || nm.ok`, where `absolute` is "the crop opens
Aloha and closes Mahalo". So a row could pass live on the absolute test while
the transcript comparison refused it, and `which`/`detail` were nulled on those
rows — the comparator's own verdict is **not recoverable** from the file. I
compared my new comparator against that conflated field and counted 37 rows
where nothing about the served outcome had ever changed.

Reading `sweep.js` corrected a second assumption in the same pass: heads are
stored `slice(0, 160)` and tails `slice(-160)`, so heads keep their **starts**
and tails keep their **endings** — which is exactly what the head test and the
tail test each read. The saved text was fit for purpose; I had assumed tails
were clipped at the end and nearly discarded the whole re-run on it.

**Scope of the re-run, before the finding:** it is evidence about the **text**
comparison only. `whisperFirstStart` was never stored, so the start-time guard
is not exercised by it. Any row whose only defect is a late start with matching
words would pass this re-run and refuse in a live derive.
