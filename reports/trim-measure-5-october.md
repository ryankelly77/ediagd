# Every film opens on Aloha and closes on Mahalo — what the measurement found

*5 October 2026. `npm run trim:measure`, read-only, over all 447 published
films. Nothing has been cut. `reports/trim-plan.json` is the record and
`reports/trim-plan.md` is the table.*

Ryan, 4 October: *"Get the Hell Out of Here, Part 1" plays the camera running
before Mitch says Aloha and keeps running after he says Mahalo. There may be
others.*

There are. **254 of 447 published films carry dead air worth cutting — 65
minutes across a 16.9-hour library, 6.4% of everything.**

---

## The film you reported

| | |
|---|---|
| content id | `c61fb5c9-f8f4-4355-baf7-c20be394ac19` |
| asset duration (Mux float) | 100.576 s |
| `content.duration_sec` (DB integer) | 101 |
| head — silence and slate before "Aloha" | **17.40 s** |
| tail — after the end of "Mahalo" | **4.45 s** |
| proposed cut | `--trim-start=17.10 --trim-end=96.83` |
| new length | 79.73 s |

**Twenty-two seconds of a hundred-second film.** The slate is two full spoken
cues before the greeting:

> *"Get the hell out of here speech. Multipoint inspection set up part one, the
> easiest sell you'll ever make."* — then **Aloha** at 17.4 s.

Two independent routes agree on where the words are. Mux's caption track puts
the Aloha cue at 17.200 and the Mahalo cue at 96.200; the word-level pass says
Aloha starts 17.400 and Mahalo ends 96.125. **That agreement is the proof, and
it is also a gate** — any film where the two routes disagree by more than 2.5 s
has nothing proposed for it.

### Frame evidence

| frame | what it shows |
|---|---|
| `trim-frames/…-at-0.0s.jpg` — the current first frame | Mitch looking down, not addressing camera |
| `trim-frames/…-at-17.10s.jpg` — the proposed start | Mitch mid-greeting, facing camera |

**The head cut is confirmed on picture as well as audio. The tail cut is
confirmed on audio only** — see *Open question* at the end.

---

## The counts

| | films |
|---|---:|
| published, measured | **447** |
| screened into the word pass | 269 |
| **to cut — head only** | **23** |
| **to cut — tail only** | **47** |
| **to cut — both ends** | **184** |
| **to cut — total** | **254** |
| fine as they are | 187 |
| no greeting heard — your ruling | 3 |
| no sign-off heard — your ruling | 4 |
| two passes disagree, nothing proposed | 8 |
| could not be measured | 4 |
| no English text track | 0 |

Buckets overlap: a film can have a cuttable tail and a head awaiting a ruling.

**65.1 minutes** comes off, mean **15.4 s** per cut film, max **26.4 s**.

### Where it is concentrated

| collection | to cut / total |
|---|---:|
| Menu | **92 / 92** |
| Craft | 124 / 141 |
| Pitches by Op Code | 26 / 118 |
| Mindset | 11 / 95 |
| Onboarding | 1 / 1 |

| placement | to cut / total |
|---|---:|
| `reference` (the mileage shelf) | **100 / 100** |
| `daily_craft` | 108 / 116 |
| `daily_pitch` | 26 / 118 |
| `daily_lifestyle` | 19 / 112 |

**Every Menu film and every reference film needs cutting.** Their heads cluster
at 17–21 s because they share one spoken slate — *"Dealer upsells using menus
and interval charts. <N> Mile Dealer Upsell Menu. Part N."* The uniformity has a
real common cause rather than being an artefact, which is the question AGENTS.md
says to ask of any suspiciously consistent number.

The low counts are equally explained: Mindset and the pitches are mostly films
`trim:slates` already cut at the head in September, so only their tails remain.

### The old ledger, and the thing that must not happen

165 films had their heads cut by `trim:slates`. **18 of them are in this cut,
and all 18 are tail-only — zero heads are touched a second time.** That is not a
convention anybody has to remember: a side is cut only when it was measured to
the word AND still exceeds its threshold, and these films measure 0.0–0.6 s at
the head, so there is nothing to propose.

---

## For your ruling — nothing is proposed for these

### No greeting heard (3)

| film | opens with |
|---|---|
| `508e939e` MPI Setup | *"Tires, setting up the multi-point inspection. Okay, say you didn't walk around and do the tires on the drive…"* |
| `c420f15a` Diversification & Ignorance | *"Diversification is a protection against ignorance. That's a quote by Warren Buffett. Short and sweet, like me."* |
| `e5d1de92` Success Cycle, Part 10, Anatomy of the Speech | *"Success Cycle Part 10, Anatomy of the Speech. Now here's my whole speech from start to finish."* |

Both passes agree there is no Aloha in these. They open on the slate or straight
into content.

### No sign-off heard (4)

| film | closes with |
|---|---|
| `2dfb0041` On the Drive, Part 1 | *"On the drive, part two is coming up next. That's where we talk about what's actually at stake with these belts and chains."* |
| `3e12212a` Name Tag, Part 6 | *"Offer everything that's appropriate and let them decide. Remember, you're a service advisor."* |
| `d0b1084d` 25,000 Mile Dealer Upsell Menu (2748) | *"…carbon is not where it's build up. **And build off…**"* |
| `fe35f2ea` 70,000 Mile Dealer Upsell Menu, Part 2 (2821) | *"…warranty, last or long longing engine or the engine line. **Come on Mitch, the fuck.**"* |

> **The last two are not trim problems — they are broken films.** One ends
> mid-sentence; the other ends on an outtake with profanity. Both are published,
> both are `placement = reference` so they sit on the mileage shelf rather than
> in the daily loop, and neither has a sign-off because neither take was
> finished. They want a reshoot or a hand edit, not an automated tail cut. The
> trim pass surfaced them as a side effect of asking where Mahalo is.

### Could not be measured (4)

`small.en` cannot hear a word Mux's caption model caught, reproducibly, across
three attempts. Each film gets its other side cut and the contested side left
alone.

| film | which side |
|---|---|
| `15b3e307` Four Step Close, Part 4 | tail — captions put a Mahalo ending at 74.44 s |
| `6c9f2411` Coverage is Key, Part 8 | head — captions put an Aloha at 10.00 s |
| `9a4190b3` CSI — Prior to Arrival, Part 2 | tail — captions put a Mahalo ending at 122.00 s |
| `9fd634f3` Buffalos and the Cows | tail — captions put a Mahalo ending at 89.48 s |

`--model=medium.en` is available if you would rather a bigger model tried than
rule these by ear.

### The two passes disagree (8)

The reconciliation gate fired on eight films — captions and words differ about
where Mahalo ends by 2.5–6.2 s. Nothing is proposed for those tails. Their heads
are unaffected and six of them still get a head cut.

---

## Two corrections to the brief, both measured

**The never-trimmed population is 282, not 253.** 447 − 165 = 282. The 253 in
the brief is the figure for the **418-film 29 September restore**; the 29 films
published on 1 October are the difference. They are all Craft, so Craft is 122
never-trimmed rather than 93.

**Those 29 were never head-trimmed at all.** The brief says they had their heads
cut inline by `replace:video` and are "in the ledger for the head". They are not
in the ledger — it holds exactly 165 and none of the 29 — and `archived_asset_id`
is an independent witness: it is set for **165 of 165** ledgered films and **0 of
29** of these, so their masters were never swapped. INGEST.md agrees with the
measurement rather than with the brief: `replace:video` does not write the
ledger.

This changes nothing about safety, because **the measurement is the gate, not
the ledger** — a film whose head was already cut measures short and is left
alone, which is exactly what the 18 tail-only rows demonstrate. But it does mean
29 Craft films were carrying full spoken slates, and they are in this cut.

---

## Five fault classes the run found, and none of them raised an error

Every one produced a confident wrong answer rather than a crash, which is the
failure this project says is worse than a crash.

1. **A partial pull passed the guard and poisoned the offset.** `ffmpeg` exits
   **0** on a truncated HLS pull — measured, printing `Error during demuxing`
   and writing a short wav. The tail offset is `assetDuration − wavDuration`, so
   a short pull comes out *late by exactly what was lost*, shifting every word in
   that window by the same amount. The self-calibration was converting truncated
   pulls into plausible wrong timestamps. Now the pull must prove it ends where
   it was asked to, retries three times, and refuses rather than returning a
   number.

2. **"No sign-off" was being ruled from audio nobody read.** A failed window and
   a film that genuinely never says Mahalo both arrive as `mahaloEnd == null`.

3. **The tail window could not reach the film it was hunting.** Anchoring on
   "the last 30 seconds" marks a film with 40 s of dead air as `no-signoff` —
   precisely the film this pass exists to find. It now anchors on the caption
   Mahalo, then on the end of the last cue with any text.

4. **One film failed its whole batch.** A single alignment fault discarded
   twenty films' results, including head measurements that had already
   succeeded.

5. **A full-length pull that whisper heard as silence.** *CSI — CSI Is Not a
   Score, Part 1* came back 30.000 s, mean volume −28.4 dB, real audio by every
   measure available — and transcribed as sixteen dots. The length check could
   not see it because the length was right; the zero-words check did not fire
   because sixteen dots are sixteen words. It was reported as `no-greeting`.
   **Re-measured, its Aloha is at 12.14 s and it wants an 11.82 s head cut.**

   Found at the head, so the same question was asked at the tail, where it had
   three more instances. **Across the run this mislabelled 2 of 5 no-greeting
   films and 3 of 7 no-signoff films — five rulings you would have been asked to
   make about films nobody had successfully measured.** A ruling now requires
   both passes to agree the word is absent.

The alignment fault itself is a faster-whisper bug, not a pull problem: the same
wav fails alone on a fresh model while a wav from the same film pulled 11 ms away
succeeds. A second of appended silence fixes it and cannot move any word's
position, because it goes after all of them. **31 films needed that retry, and
each one carries a note saying so.**

---

## Is the measurement stable? Two full runs say yes

Runs 2 and 3 are independent full passes over the same 447 films.

| | agreement |
|---|---|
| `proposedStart` within 0.05 s | **446 / 447** |
| `proposedEnd` within 0.05 s | **445 / 447** |
| word-measured heads | max drift **0.020 s**, mean 0.0001 s |
| word-measured tails | **233 of 234 drift 0.000 s** |

All three differing rows are run 3 being *more* correct — two of them are the
silent-pull and reconciliation fixes working.

**One film is genuinely unstable** and you may want to drop it: *The OE Approach
— The Maintenance Menu* put Mahalo's end at 168.134 s in one run and 166.654 s
in the other, on a 168.16 s film. The proposed cut removes 0.81 s, so the
downside is small either way, but it is the one measurement here I would not
call settled.

---

## Open question I have not resolved

A frame grabbed at the proposed **end** of the film you reported (96.83 s) shows
an **empty room**, which cannot be right if Mahalo ends at 96.125 s — Mitch
cannot be out of frame seven tenths of a second later.

The likely explanation is that `ffmpeg -ss` before `-i` on HLS is an
*approximate* seek to a keyframe, so that grab is probably not showing 96.83 s
at all. **I have not proven that**, and I am not willing to call the tail cut
visually confirmed on an unverified frame. The audio measurement is confirmed
twice over; the picture at the tail is not.

This wants resolving before the tail cuts are applied.

---

## What exists, and what happens next

| | |
|---|---|
| `npm run trim:measure` | read-only; writes `reports/trim-plan.json` |
| `npm run trim:table` | renders `reports/trim-plan.md` |
| `npm run test:trim-measure` | **28 assertions**, positive half first |

The suite is proven non-vacuous against four deliberate breaks: unknown
screening out, offset-suspect no longer blocking, caption provenance allowed to
propose, and a scenario that was passing for the wrong reason. The third break
initially passed 27/27 because the scenario was guarded by a null rather than by
the gate it named; a scenario was added that isolates it.

**`trim:apply` is deliberately not built.** This PR is the measurement only. When
you have read the table and said go — possibly with a different pad, which is a
flag rather than a constant — the apply pass is the next piece of work: its own
ledger keyed on `mux_asset_id`, the lock pattern from `trim-slates.ts`, serial
`replace:video --trim-only`, a ledger row written the moment each swap commits,
and a run timed for after 21:00 Central or a Sunday so no advisor loses their
place mid-film.
