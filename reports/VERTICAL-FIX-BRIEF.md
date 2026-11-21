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

### What this adds to the question

Both tails are intact and correct — each closes on "Mahalo." in both the master
and the crop. **So the mezzanine is not shifted; it is missing a piece of the
front and nothing else.** The durations still agree to a quarter second, which
means the mezzanine is padded or re-timed somewhere, not simply truncated. That
is a sharper statement of the defect than 8 October could make, and it rules
out "the vertical was derived before the trim" for these two: the crops were
made on 21 November from the masters as they stand today.

Neither film can be repaired by re-deriving. Until the mezzanine question is
answered they serve the landscape cut letterboxed, which is the correct
fallback and is what they do today.

**Not to be confused with the three in the same batch that were refused
wrongly** — Two Minute Walk-Around Part 1, Never Lose Money and Your Toughest
Opponent. Those crops are faithful; the gate's one-word comparison was not.
That is fixed separately, in `scripts/vertical-match.ts`.
