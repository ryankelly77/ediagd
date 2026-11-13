# Audio and picture back in sync across the library

Ryan, 28 October: "Many videos that have been cut to remove the slate have audio and video off. We need to fix this in the entire library asap."

## What is known

Every trimmed film measured so far is out of sync and the untrimmed control is not (The Most Dangerous Person +1240 ms, others −228 and worse, against −38 ms untrimmed with near-perfect correlation). The offsets differ in size and sign, so this is not one constant to subtract: the cut itself is misaligning the two streams, most likely picture snapping to a keyframe while audio is cut at the exact sample. The sync scan (floor 0.50, ±2 s sanity bound, about 2 min a film, 462 films, writing incrementally) is running and is the list of what to fix. Nothing in this brief waits for it to finish except the batch itself.

Originals exist for every cut: `archived_asset_id` on the row for Mux-side cuts, the untrimmed upload kept by `replace:video` since #61, and the masters in Published for the rest. The ledger `reports/trim-pass.json` has the cut points and the method used per film.

## Part 1, the method, on three films, before anything else

Take three films the scan has already measured as bad, with different offsets and, if the ledger shows more than one cut method, different methods. For each, from the untrimmed original and the ledger's cut points, produce the cut two ways:

- **Local re-encode**: ffmpeg with `-ss` before `-i` (accurate seek), both streams re-encoded (libx264 at the master's resolution and rate, aac), no stream copy anywhere, upload as a new Mux asset.
- **Mux clip** from the original asset with `start_time` and `end_time`, if the ledger shows that path was used on any bad film.

Measure sync on each result with the scan's own instrument, on both renditions a viewer can get (the master's HLS and the derived vertical once derived). Report a 3 by 2 table: offset and correlation per film per method. The method that lands every film within 40 ms is the method; if neither does, stop and report, with the ffprobe stream starts of the originals, because then the originals themselves need looking at. Do not go past this part on a hunch.

## Part 2, the batch, unattended

For every film the scan lists over 100 ms: re-cut from the original with the proven method at the ledger's points, verify-before-swap with two gates, the existing head and tail check at 10 s and the new sync gate (within 40 ms, correlation at least 0.50, on the finished asset), swap, ledger row with method and measured offset, `position_sec` shifted where a completion needs it, vertical marked stale by the swap and re-derived through the guarded derive only when a master is available, with the same sync gate on the vertical before it is marked ready. Serial, the same lock as `trim:apply`, overnight; at four minutes of Mux time a film plus measurement, 200 films is a night. A film that fails either gate is left as it is and listed, never re-measured a second time in the run.

Order: the films on core certification tracks first (Walk Around, Setting up the MPI, Four Step Close, Success Cycle, Overcoming Objections, Lasting Impressions, Name Tag, Menus), then the daily pitches, then Mindset, then the rest.

## Part 3, the gate stays

The sync measurement becomes a permanent step of `replace:video` and `trim:apply`: no asset is swapped in, and no vertical is marked ready, without a measured offset within 40 ms on the finished file. `INGEST.md` and the trim doctrine say so. This is what makes the three Mitch recuts and everything after them safe.

## Also in this run

- Lasting Impressions: cut it with the proven method as the first film of Part 2, not before.
- ACR-047's three duplicate pairs (At the Kiosk, After-MPI, On the Drive, each an old long .MOV and a newer Mitch Hardt v1): Ryan's ruling is the same as for the Cabin Air Filter reshoots: the newer film is the one that stays; retire the old one of each pair with a `library_reason` naming the replacement, history kept, then finish the MPI retitles.

## Prove it

The 3 by 2 table from Part 1. For Part 2: the first five films done, each with before and after offset, correlation, head and tail numbers, on both renditions. One film deliberately failed through the gate (a stream-copy cut) to show the swap is refused. `trim:verify` over everything swapped, all pass. `tsc`, `eslint` clean; `git status -sb` clean; ledger complete.

## Report

The scan's final count by offset band (under 100 ms, 100 to 500, over 500), the method table, the batch table (film, before, after, method), what was left alone and why, and the retired ACR-047 rows. PR against main from current main, base checked by hand, for the gate and the scripts; the swaps are production writes logged in the ledger.
