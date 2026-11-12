# Where Mitch says "MOC" — and where the captions get a brand wrong

**Ryan, 22 October:** scan all 400+ videos for where Mitch mentions "Moc"
(sounds like "mock"), particularly the MOC warranty.

**Ryan, 11 November:** scrub the library again for MOC, Mock *and* **Arctic
Blast**. *"I am not concerned about retired films."*

Read-only against production. Nothing changed.

---

## What the second pass changed — 11 November

The October answer **held**: six films, one series, nothing outside it. A second
sweep by a different method returned the same six, on the same corpus size
(860,781 characters against October's 861k) and the same 465 transcript rows.
Three things moved, and a fourth arrived.

| | |
|---|---|
| **MOC mentions** | **8 → 9.** Part 8 says it twice, not once — see below |
| **"0 live films unsearchable"** | **expired.** 17 live films now have no transcript |
| **`M.O.C.` census row** | **withdrawn.** It does not reproduce; it was a double count |
| **Arctic Blast** | **new.** 26 mentions, 13 live films, 11 of them captioned *"Arctic Glass"* |

**Retired films are excluded from every count below**, per Ryan's ruling of
11 November. Where October's numbers included them, the figure is restated.

---

## What MOC is — corrected

**Ryan, 22 October:** *"no — MOC provides dealership with products like repair
kits, lubricants, etc."*

My first pass called MOC a warranty administrator. **That was wrong, and it
matters.** MOC is the **supplier**: repair kits, lubricants, chemicals. The
warranty is what comes *with* using their products on the ticket — which is why
the films keep saying things like *"claims are reduced by half if MOC fluid
isn't used"* and *"a MOC oil product needs to be on every ticket, every 5,000
miles because we don't want the coverage to lapse."* The coverage is the
consequence of the product, not the thing being sold.

The cue library bears this out — these are a catalogue, not a warranty desk:

> MOC A/C Quiet MAX (PN 0136) · MOC Ultra DOT 5.1 (PN 0602) · MOC Charge Port
> Cleaner · MOC Cooling-System Fast Flush · MOC Gear Guard (PN 0148) · MOC
> Limited-Slip Concentrate · MOC Banish · MOC Cool Off

---

## Scope first

### As at 22 October

| | |
|---|---|
| Video rows in `content` (`advisor_video`, `manager_video`) | **482** |
| …with a transcript | **447** |
| …**without** — no search can see into these | **35** |
| Corpus searched | 828,000 characters |
| Transcript source | **`mux_caption`, all 447** |

The 35 with no transcript are **17 Bank Account manager films** and 18 retired
duplicates (After-MPI, At the Kiosk, MPI Setup, Selling speech…). **None is
warranty- or coverage-related by title**, so the gap does not hide a MOC film —
but it is a gap and it is stated rather than rounded away.

### As at 11 November — and this is the part that moved

| | 22 Oct | 11 Nov |
|---|---|---|
| Films (`content` rows carrying a `mux_playback_id`) | — | **498** |
| …live, i.e. not retired | — | **479** |
| …live **and searchable** | — | **462** |
| …live with **no transcript at all** | **0** | **17** |
| Transcript rows | 465 | **465** |
| Corpus | 861k chars | **860,781 chars** |

The same query the October pass used — `type in (advisor_video, manager_video)`
— returned **482** then and returns **499** now. The library grew by seventeen
rows, and those seventeen rows are **exactly** the films with no transcript.

They all arrived on **2026-11-02**, eleven days after the October sweep:

> Power of Positive Language, **Parts 1–13** · Power of Positive Language —
> **Opener** · **Closer** · Overcoming Objections — **Opener** · **Closer**

All seventeen are `advisor_video`, `status = draft`, live. **None has ever been
searched for MOC, Arctic Blast, or anything else** — by October's pass, which
predates them, or by November's, which cannot see into a film with no
transcript.

> **This is the October report's own stated scope going stale, not an error in
> it.** The closing line below — *"unsearchable: 17 films — ALL RETIRED, 0
> live"* — was true on the day it was measured. A corpus that grows turns a
> correct measurement into a wrong claim without anybody touching the file, and
> nothing re-runs this search when a film lands.
>
> **The honest status is not "the library is clear." It is "462 of 479 live
> films are clear, and 17 live drafts have never been looked at."**

Clearing them is the same job October already did once: run
`scripts/transcribe-dropzone.py` over the masters and backfill
`content_transcript` with `source = 'whisper'`. The recipe, the join trap and
the duration corroboration are all recorded further down this file.

**The transcripts are the captions.** `source = mux_caption` for every row, and
`captions_ready` is 12 of 12 on this series. These are not a separate research
transcript — they are **the subtitles that play on screen**.

---

## The answer: 9 mentions, 6 films, all in "Coverage is Key"

Searched for every plausible rendering — `moc`, `mock`, `mach`, `moch`, `mok`,
`moque`, `mocha`, `mac`, `mack`, `maac`, `mauk`, `moke`, and `M.O.C.` with any
separator — because ASR writes what it *hears* and the spelling Mitch means is
not the spelling on the page.

Times are **estimated** from character position across the film's duration, not
read from the caption track. Treat them as "roughly here", not cue points.

| Film | ~Time | Caption reads | The line |
|---|---|---|---|
| **Part 1** (1:25) | ~0:51 | `mock` | "We don't want this to be a **mock** warranty." |
| **Part 1** | ~0:54 | `mock` | "Your customers don't know who **mock** is, and we want to keep it that way." |
| **Part 5** (1:49) | ~1:03 | `mock` | "Number one, claims are reduced by half if **mock** fluid isn't used." |
| **Part 6** (1:55) | ~1:08 | `mock` | "The move here is a **mock** oil product needs to be on every ticket, every 5,000 miles…" |
| **Part 7** (1:29) | ~0:44 | `mock` ×2 | "If you started them on **mock** coolant exchanges before that factory coverage ran out, now **mock** pays for that pump." |
| **Part 8** (2:10) | ~0:30 | **`mockproducts`** | "reach out to your local rep or go to the website, **mockproducts**.com/w oranty-claims" |
| **Part 8** (2:10) | ~0:48 | `mock` | "What do you want **mock** to replace?" |
| **Part 9** (1:25) | ~0:13 | **`MOC`** | "Do you send out an engineer? Does **MOC** send out an engineer?" |

**Eight of the nine are captioned "mock". Only Part 9 got it right.**

### The ninth, added 11 November — and it is the worst one

October's sweep tested `mock` and `mocks` as **whole words**, so
**`mockproducts`** matched neither and Part 8 was recorded as saying it once.
It says it twice. Both censuses agree the bare token `mock` appears 7 times;
the eighth is the compound, and it is the one that does damage:

> *"One is to reach out to your local rep or go to the website,
> **mockproducts.com/w oranty-claims**."*

That is **a working instruction with a wrong address in it**. An advisor who
reads the caption and types what it says goes nowhere — and the same line
mangles "warranty" into "w oranty", so neither half of the URL survives. Every
other mis-caption in this file makes a sentence read oddly. This one sends
somebody to a domain that is not the supplier's.

**The lesson for the next search:** match on a prefix (`mock\w*`), not on a
word list. A list of spellings is a list of the forms somebody thought of, and
a brand name turns up inside URLs, filenames and compounds where no space
precedes the next letter.

### The series is twelve films; six mention it

| Mentions MOC | Does not |
|---|---|
| Parts 1, 5, 6, 7, 8, 9 | Parts 2, 3, 4, 10, Opener, Closer |

The six that don't are still the same series on the same subject — the "other
similar videos" worth reviewing alongside.

---

## This is a live caption defect, not just a search artefact

Part 1, at about fifty seconds, puts this on screen under Mitch's face:

> **"We don't want this to be a mock warranty. Your customers don't know who
> mock is, and we want to keep it that way."**

An advisor reading the subtitles is told the product is a *mock* — a fake —
warranty. The sentence is a brand instruction and the caption inverts it.
Part 7's "now **mock** pays for that pump" and Part 8's "what do you want
**mock** to replace" read as nonsense rather than as a company doing the paying.

### The catalogue already knows the right spelling

**178 cues name "MOC" correctly**, across the families Mitch sells on:

| Family | Cues |
|---|---|
| Fluids | 55 |
| (no family) | 47 |
| Fuel System | 33 |
| Brake Service | 15 |
| Differential | 12 |
| EV & Hybrid | 9 |
| HVAC | 4 |
| Battery, Oil Change | 3 |

e.g. *"VERIFY ELIGIBILITY OUT LOUD — 10 years old or newer, 100K or fewer, MOC
Warranty"*, *"EVERY MOC SERVICE RO INCLUDES THE WARRANTY"*, *"MOC A/C Quiet MAX
(PN 0136)"*, *"MOC Ultra DOT 5.1 (PN 0602)"*.

So this is not an open question about what the word is. The written catalogue
spells it MOC 178 times; Mux's speech recognition hears "mock" and writes it,
and nothing compares the two. **That comparison is the check that does not
exist** — a known proper noun, spelled correctly in 178 rows, mis-transcribed in
7 of the 8 places it is spoken, and no surface anywhere would have raised it.

---

## One more thing worth knowing

The certification these films belong to:

```
Chemical Warranty   slug craft-chemical-warranty   kind craft
                    is_core = false   active = FALSE
```

**The track is inactive.** Whatever is decided about the captions, no advisor is
currently being walked through this series by the certification ladder.

---

## The reshoot list

Six films. All live and published, none retired, all in one series.

| # | Film | Length | Says it | content id |
|---|---|---|---|---|
| 1 | **Coverage is Key, Part 1** | 1:25 | ×2 | `44cfa330-24ab-4338-9667-705a35a27306` |
| 2 | **Coverage is Key, Part 5** | 1:49 | ×1 | `fec78df5-1a2d-4956-a1d6-3543193fe3fc` |
| 3 | **Coverage is Key, Part 6** | 1:55 | ×1 | `007a0a13-8e80-40cd-b7aa-f448b42f075c` |
| 4 | **Coverage is Key, Part 7** | 1:29 | ×2 | `6700b936-9943-4d70-96b7-0d1ed655abf1` |
| 5 | **Coverage is Key, Part 8** | 2:10 | **×2** | `6c9f2411-0da6-4638-b356-1bfffda60134` |
| 6 | **Coverage is Key, Part 9** | 1:25 | ×1 | `c51a6e82-2577-4c92-bd5b-8c64433b145c` |

Masters are `CRAFT — Coverage is Key, Part N — Mitch Hardt — v1.mov`.

### The lines to rewrite

Times are **estimated** from position in the transcript, not read from the
caption track — close enough to find the moment, not to cut on.

**Part 1** — ~0:51 and ~0:54, two in a row, and the hardest to re-word because
the brand *is* the point of the sentence:
> "We don't want this to be a **MOC** warranty."
> "Your customers don't know who **MOC** is, and we want to keep it that way."

**Part 5** — ~1:03
> "Number one, claims are reduced by half if **MOC** fluid isn't used."

**Part 6** — ~1:08
> "The move here is a **MOC** oil product needs to be on every ticket, every
> 5,000 miles because we don't want the coverage to lapse."

**Part 7** — ~0:44, two in one sentence
> "If you started them on **MOC** coolant exchanges before that factory coverage
> ran out, now **MOC** pays for that pump."

**Part 8** — ~0:30 and ~0:48, two lines *(the first added 11 November)*
> "go to the website, **MOCproducts.com/warranty-claims**"
> "What do you want **MOC** to replace?"

The first of those is the only line in the whole list where the caption is
**wrong rather than merely odd** — it reads `mockproducts.com/w oranty-claims`
on screen. Whatever is decided about the brand being named, that address needs
to be right.

**Part 9** — ~0:13
> "Do you send out an engineer? Does **MOC** send out an engineer?"

### Same series, NOT on the list

Six more films, none of which says it — no reshoot needed:

> Coverage is Key — Opener · Part 2 · Part 3 · Part 4 · Part 10 ·
> Coverage is Key — Closer

---

## How confident this list is complete

Three independent passes, because a missed film means a reshoot round that does
not finish the job.

**1 — Thirteen spellings, whole corpus.** Every rendering an ASR might reach for
on that sound was tried across all 447 transcripts and 828,000 characters:

| spelling | hits | | spelling | hits |
|---|---|---|---|---|
| `moc / mocs` | **1** | | `mac / mack` | 0 |
| `mock / mocks` | **7** | | `muck / mawk` | 0 |
| `mocc / moque` | 0 | | `maac / mauk` | 0 |
| `mok / moch` | 0 | | `moke / maude` | 0 |
| `mocha` | 0 | | `marque / marc` | 0 |
| `mach` | 0 | | `M.O.C.` spelled out | ~~**1**~~ **0** |
| | | | `em oh see` | 0 |

**Nothing outside Coverage is Key, anywhere.** The zeroes are reported because a
net nobody can see the mesh of proves nothing.

> **Correction, 11 November — the `M.O.C.` row is withdrawn.** Searching
> `m[.\s-]+o[.\s-]+c` across all 465 transcripts returns **zero**. The only
> literal in the corpus is the plain `MOC` in Part 9, which the `moc / mocs`
> row above already counts, so the two patterns were matching the same single
> occurrence. "Two spellings hit" was **one spelling plus a double count.**
> Harmless to the conclusion — same film, same mention — but a census that
> double-counts is one that could hide a real find next time.
>
> The same correction shows why the thirteen-spelling net missed
> `mockproducts`: **every entry in it is a whole word.** Match on a prefix
> (`mock\w*`), because a brand turns up inside URLs, filenames and compounds
> where no space precedes the next letter.

**1b — Ask the corpus what is there, 11 November.** The opposite of a guess
list: every token matching `m[oa](c|ck|k|cks|ch)\w{0,3}` or `ar?c?tic\w*` across
all 860,781 characters, counted and printed before any term was chosen.

```
make 283 · makes 105 · making 35 · arctic 27 · maker 9
mock 7 · machine 7 · moc 1 · makers 1
```

Nothing else exists. The `artic` (12), `mach` (9) and `moke` (2) *substring*
hits that look alarming on a first pass are **"particular", "machine" and
"smoke"** — ruled out by word boundaries rather than by assumption.

**2 — By subject, not by spelling.** 87 films talk about warranty, coverage,
claims, kits, lubricants or chemicals. Of those 87, exactly **6 name the brand**
and 81 do not. A film where the ASR dropped the word entirely would still have
been caught in this net for review — none was.

**3 — Against the written catalogue.** The cue library spells MOC correctly
**316 times**; the transcripts contain it once. That gap is the mis-transcription,
not missing films: the brand is written constantly and spoken rarely, which is
exactly what you would expect from a name advisors are told to keep off the
customer's ear.

---

## The caption gap is now closed — Whisper run, 22 October

The 35 films with no Mux captions were the one part of the corpus no search
could see. **They are now cleared**, not assumed.

Transcribed locally with `faster-whisper` (`small.en`) from the masters in
`02 - Published`, via the pipeline's own `scripts/transcribe-dropzone.py`:

```
requested 17 · transcribed 17 · failed 0 · never attempted 0
17 films, 30.7k characters
```

Plus **At the Kiosk, Part 2** — the only other *live* film without captions —
`requested 1 · transcribed 1 · failed 0`. The remaining 17 are retired
duplicates and need nothing.

**The same thirteen spellings over the new 33k characters: every one zero.**

| spelling | hits | | spelling | hits |
|---|---|---|---|---|
| `moc / mocs` | 0 | | `mac / mack` | 0 |
| `mock / mocks` | 0 | | `muck / mawk` | 0 |
| `mocc / moque` | 0 | | `maac / mauk` | 0 |
| `mok / moch` | 0 | | `moke / maude` | 0 |
| `mocha` | 0 | | `marque / marc` | 0 |
| `mach` | 0 | | `M.O.C.` spelled out | 0 |
| | | | `em oh see` | 0 |

A second net over the *subject* — warranty, coverage, claims, lubricants,
chemicals, kits, suppliers — returned two incidental hits across all 18 films,
both innocent on reading:

- Bank Account 05: *"Very few managers stand up and **claim** someone else's
  work outright"* — a leadership point, not a warranty claim.
- Bank Account 11: *"**Manufacturers** change program"* — generic business.

**Nothing in the Bank Account series touches MOC.** The reshoot list is
unchanged at six films.

### One corroboration worth keeping

*At the Kiosk, Part 2* says:

> "if you add the AC treatment, that's beat the heat. Customer gets a **30,000
> mile warranty** on their compressor."

That is a MOC product and a MOC warranty — described in full, sold in full, and
**the brand is never named.** It is the clearest demonstration that the
six-film list is complete rather than lucky: the warranty gets talked about all
over the library, and the supplier's name appears in only those six.

## Backfilled, 22 October — every live film is now searchable

The 18 Whisper transcripts are written into `content_transcript` with
`source = 'whisper'`, so the next search like this one covers the whole library
rather than 93% of it.

```
content_transcript: 465 rows   (whisper 18, mux_caption 447)
corpus:             861k characters, up from 828k
unsearchable:       17 films — ALL RETIRED, 0 live
```

> **Expired, 11 November.** That last line was true when it was written and is
> false now: **17 live films have no transcript**, all created 2026-11-02 —
> Power of Positive Language Parts 1–13 with its Opener and Closer, and the
> Overcoming Objections Opener and Closer. See *Scope first* at the top.
>
> Nothing re-runs this search when a film lands, so the claim decayed silently.
> A transcript backfill is a **promise about a moment**; what would make it a
> property is the ingest writing `content_transcript` as part of publishing a
> film, so a film with no transcript cannot exist rather than merely being
> noticed later.

**Full-corpus rescan after the write: unchanged.** Six films, same thirteen
spellings, `moc`=1 `mock`=7 `M.O.C.`=1 and ten zeroes. The reshoot list did not
move.

### The join nearly went wrong, and the dry run is what caught it

AGENTS.md's standing rule is to join on `source_filename`, because the ingest
*invents* `canonical_filename` and a Drop Zone batch matched **0 of 73** on the
invented key and **73 of 73** on the observed one.

Measured here, it is the other way round:

```
matches source_filename:    1 of 18
matches canonical_filename: 18 of 18
```

**Both were measured before anything was written, and that is the only reason
this did not silently write one row.** These masters live in `02 - Published`
and have already been *renamed to* the canonical form — so for a published
master, canonical IS what the disk observed. The Drop Zone is the opposite case
because its files have not been renamed yet.

The rule survives, sharpened: **the right key depends on which folder the file
is sitting in.** Measure the match count on both and refuse on zero — do not
carry the answer from the last batch.

A title join was tried and rejected for the same reason: *At the Kiosk, Part 2*
returned **30 candidates**, because "At the Kiosk" is a title a dozen op-code
pitches share. `canonical_filename` resolved it to one row.

### Corroborated by a second quantity

whisper read the **untrimmed** masters; `duration_sec` is the **trimmed** Mux
asset. The gap between them should be the spoken slate, and it is:

```
mean +8.0s, range +6.4s to +14.9s, none out of range
```

A consistent small positive offset across 18 films is the pairing confirming
itself. Had any pair been the wrong film, that number would have been noise.

### One difference between these rows and the other 447

The whisper rows are of the **untrimmed** master, so each begins with Mitch's
spoken slate — *"Manager Bank Account, Withdrawal Breaking Promises. Aloha…"*
The 447 Mux rows are of the trimmed asset and have no slate. Harmless for
search; worth knowing before anyone uses these as prose. Trimming them to
`aloha_at` is possible but was not done — that value can itself be the slate,
and guessing would cost the first line of a film.

---

---

# Arctic Blast — 11 November

**The same defect, a different brand, and nobody was looking for this one.**

`op_code_catalog` holds `ABT-054 · Arctic Blast` (HVAC, coachable, confidence
`high`). The library says it **26 times across 13 live films** — and **11 of
those 26 are captioned "Arctic Glass."**

Retired films are excluded, per Ryan. One retired film (`After-MPI`,
`871f2955…`) also says it, correctly, and is not counted.

## The five films that get it wrong

| Film | Glass | Blast | Length | content id |
|---|---|---|---|---|
| **At the Kiosk — Arctic Blast** | **5** | 0 | 1:10 | `5e3e962d-5236-4934-81b7-fba6066eae30` |
| **MPI Setup — Arctic Blast** | **2** | 0 | 1:07 | `02d8eccb-d30e-417c-87ee-69368cab50c7` |
| **On the Drive — Arctic Blast** | **2** | 1 | 3:58 | `2dcde986-3971-4604-9929-8d73c55b12f3` |
| After-MPI, Part 2 — AC Recharge | 1 | 0 | 2:48 | `11a5d2ac-7a08-442a-8525-50fcc5825ed2` |
| On the Drive, Part 3 | 1 | 0 | 3:02 | `1273cf85-9aec-46de-878f-0193bbf2d841` |

The first three are **ABT-054's own three stage films** — the product's pitch
set. Their masters are `ABT-054 — At the Kiosk — v1.MOV`, `— MPI Setup —`,
`— On the Drive —`. Their titles say Arctic Blast. Their captions do not.

**`At the Kiosk — Arctic Blast` never once says it correctly:**

> *"Aloha. Let's talk **Arctic Glass** at the kiosk… if you're a menu
> structure, **Arctic Glass** is really good to throw in on a menu at any
> mileage interval… My favourite part of this 15,000 mile service is **Arctic
> Glass**. Are you familiar with **Arctic Glass**? Have you ever had your AC
> maximized?"*

A film whose own title is the product name, telling the advisor to say the
product name, five times, wrong.

## The eight that get it right

15,000 Mile Dealer Upsell Menu **Part 3** (×3) and **Part 5** (×2) · 45,000
Mile Dealer Upsell Menu **Part 3** · **Coverage is Key, Part 6** (×2) · **EV
Series, Part 4** · **On the Drive — Cabin Air Filter** (×2) · **Part 2**
(ACR-047) · **Seasonal Menus, Part 4** (×2)

## It is the caption, not Mitch — and one film proves it

`On the Drive — Arctic Blast` says the product name three times, and the
caption renders it **both ways inside that single continuous read**:

> *"Aloha! Let's talk **Arctic Blast**."* — the opening line
> *"**Arctic glass** is something that you only have to do once."*
> *"All of these will make **Arctic glass** easy for you to sell right there on
> the drive."*

A person does not change how they pronounce a product name halfway through one
take. The engine changed how it spelled it.

Four further facts point the same way: the op code catalogue says Arctic Blast;
the masters are named `ABT-054`; the film titles say Arctic Blast; and eight
other films say it correctly, including two that name it three and two times
without a slip.

> **But this is weaker evidence than the MOC case, and the difference matters
> for what you do about it.**
>
> `mock` and `MOC` are **homophones**. The engine heard the word correctly and
> spelled it wrong — so for those six films the audio is certainly right, and
> only the text needs fixing.
>
> **`blast` and `glass` are not homophones.** `/blæst/` and `/glæs/` differ at
> the front *and* the back. That is a real acoustic error for an engine to
> make, which is exactly why the in-film split above is the load-bearing
> evidence rather than a detail — without it, "Mitch said Glass" would be live.
>
> **Only listening settles it**, and it is ten minutes of listening across
> three short films. Do that before deciding, because the remedy differs: a
> caption correction if the audio is right, a reshoot if it is not.

## Why nothing caught it

October already wrote the answer down, one brand early:

> *"The written catalogue spells it MOC 178 times; Mux's speech recognition
> hears 'mock' and writes it, and nothing compares the two. **That comparison
> is the check that does not exist.**"*

That is the whole of this section too. `op_code_catalog` has spelled it **Arctic
Blast** the entire time. The captions have said **Arctic Glass** eleven times.
No surface in the app, no script, and no report puts the two side by side — so
a second brand went through the same hole in the three weeks between the two
sweeps, and it took somebody asking for an unrelated word to find it.

**The check is small and it is the same one for both brands:** take the proper
nouns the system already knows it is right about — `op_code_catalog.name`, the
cue catalogue's MOC product list — and grep `content_transcript` for every
near-miss rendering of each. It fails loudly on a known name that the captions
spell a way the catalogue never does. Nothing in this file needed to be
discovered by hand.

---

# The gaps that remain — both brands

**1 — An ASR can substitute a word rather than mangle it.** Eight of the nine
MOC mentions came through as a recognisable "mock", which is the normal failure
and is what makes that list trustworthy. But if the engine ever "corrected" a
brand into an unrelated real word, no text search would find it. Only listening
rules that out.

**Arctic Blast is that risk arriving.** "Glass" *is* an unrelated real word, and
it is only because one film renders the same name both ways that we can say the
audio is probably right. A brand turned into a word that reads naturally is the
case no search catches.

**2 — 17 live films have never been searched** (see *Scope first*). Not cleared,
not checked. They are drafts, so no advisor is meeting them yet, and that is the
window in which to transcribe them.

**3 — Nothing compares the catalogue to the captions.** October named this check
as missing; by November a second brand had gone through the hole. Until it
exists, every answer in this file has a shelf life.

---

## One thing to decide before shooting — MOC

**Part 1 is the hard one.** The other five mention MOC in passing — "MOC fluid",
"MOC pays for that pump" — and a re-word is mechanical. Part 1's two lines are
*about* the brand being invisible to the customer:

> "We don't want this to be a MOC warranty. Your customers don't know who MOC
> is, and we want to keep it that way."

Remove the name and the sentence loses its subject. That one probably needs
rewriting rather than re-wording, and it is worth Mitch seeing the line before
the shoot rather than in front of the camera.

---

## What is actually on the desk — 11 November

| | |
|---|---|
| **Listen to three films** | `At the Kiosk`, `MPI Setup`, `On the Drive` — ABT-054, 6:15 of audio between them. Does Mitch say Blast or Glass? It decides caption-fix vs reshoot |
| **Fix one URL** | Coverage is Key, Part 8 — the caption reads `mockproducts.com/w oranty-claims` and sends an advisor nowhere |
| **Transcribe 17 drafts** | Power of Positive Language ×15, Overcoming Objections Opener and Closer. Never searched by anyone |
| **Build the one check** | catalogue proper nouns vs `content_transcript`. It would have found both brands without anybody asking |
| **MOC reshoot list** | unchanged at six films — Parts 1, 5, 6, 7, 8, 9 — with Part 8 now carrying two lines |

### The two situations are not alike, and this is the reason to do Arctic first

The Chemical Warranty track that holds the MOC films is `active = FALSE`, so no
advisor is being walked through those six by the certification ladder. The
mis-captions are real and nobody is meeting them.

**Arctic Blast is the opposite, and it was checked rather than assumed:**

```
op_code_family        ABT-054 · HVAC · coachable=true · confidence=high
service_family_content  all three films present, family HVAC, coachable=true
advisor_focus_family    2 OPEN HVAC assignments, both held by ACTIVE advisors
                        5e22cc2a… (op 274)  assigned 2026-11-02  shelf 22 films
                        77238cb4… (op 710)  assigned 2026-10-19  shelf 24 films
```

Two advisors have HVAC as their open focus family **right now**. The three
Arctic Blast films sit on their coachable shelf. Either of them can be served
`At the Kiosk — Arctic Blast` — the film that says the product name wrong five
times out of five — in tomorrow's pitch slot.

That is the difference between a defect in an inactive track and a defect in
front of somebody on Thursday morning.
