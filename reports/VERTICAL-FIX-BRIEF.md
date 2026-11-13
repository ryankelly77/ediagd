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
