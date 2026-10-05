# Films with no track — a ten-minute conversation for Mitch

> ## Four inactive tracks activate from films already published.
>
> Not a build, not a shoot, not a migration. **Five series need a home, and
> confirming where they belong turns four dead tracks live.** Nothing else
> available this week moves the credential as far.

**Mostly done, 4 October — the lede below is kept as written and corrected
here, not rewritten.** It said *"102 films are published and reachable by
nobody, against twelve videos reachable inside tracks."* After 0144, 0142 and
0159 the measured figures are **97 films attached inside core and Master
tracks, 38 still unattached** — 23 of them routed by a ruling that has not yet
been applied, 15 deliberately unrouted. All nine core tracks are active. The
remaining decisions are Chemical Warranty (12 Coverage is Key films), CSI
(6 films against 12 quiz parts) and whether Power of Positive Language is a
track at all; see the derived table below for the current numbers rather than
these sentences.

Naming is not routing. These are all named, published and live in the catalog —
the only missing decision is which track each series belongs to, and that is
Mitch's.

Every series name and part title below is **transcribed from Mitch's own spoken
slate**, not inferred.

---

## The state of the credential right now

**Corrected again, 30 September — the 28 September correction repeated the same
class of error one column over.** The *videos* column below counts films
**attached to modules**, not films that exist for the track. "Films attached"
and "films that exist for this track" are two measurements with one name — the
`duration_sec` lesson in AGENTS.md. **Success Cycle had twelve published,
unattached films** (`Success Cycle, Part 1, Not a Rut Team` through `Part 12,
Your song, Go Sing It`) on the day this table said it had none; "no video at
all" was true of the modules and false of the library. 0144 attaches all
twelve. Power of Positive Language's zero remains true by name — no film in any
state is named for it — but see item 11 of `2-october-list.md` for the
candidate curriculum already sitting in the quiz bank.

**Corrected 28 September.** An earlier version of this table had a column headed
*"films it can serve"* that was counting `item_count` — which counts **cues**. The
numbers below separate them, and the picture is very different: Success Cycle and
Power of Positive Language, previously shown as 55 and 51 films, were shown with
**no attached video**.

**Corrected 4 October, and this time the table is DERIVED rather than typed.**
Two corrections in a row restated the same number by hand, which is how the
error repeated one column over. `npm run report:hopper` now measures all three
populations and `-- --write` writes the block below; **the numbers between the
markers are not to be hand-edited.** The script also refuses — exit 1 — when it
meets an unattached film whose series nobody has routed, because a film nobody
has homed is the case the table exists to surface and a blank cell reads
exactly like a zero.

The table below is measured on the production dump `pre-0159-20261004-2150`
**with 0159 applied**, so it is the state after Ryan applies the migration.

<!-- hopper:begin -->
*Derived by `npm run report:hopper`. Do not hand-edit between these markers — the numbers are measured, and a hand-typed one is how the "Success Cycle has 0 videos" error happened twice.*

| track | ladder | attached | unattached-matching | cues | entry film | active |
|---|---|---|---|---|---|---|
| Lasting Impressions | core | **13** | — | 0 | yes | yes |
| Success Cycle | core | **13** | — | 55 | yes | yes |
| Overcoming Objections | core | **12** | — | 29 | — | yes |
| Four Step Close | core | **11** | — | 2 | yes | yes |
| Name Tag | core | **11** | — | 0 | yes | yes |
| Setting up the MPI | core | **10** | — | 2 | yes | yes |
| Menus | core | **9** | 1 | 0 | yes | yes |
| Walk Around | core | **6** | 8 | 56 | — | yes |
| Power of Positive Language | core | **0** | — | 51 | — | yes |
| Phones and Tones | Master | **12** | 2 | 0 | — | yes |
| A Day in the Life | Master | **0** | — | 0 | — | **no** |
| Chemical Warranty | Master | **0** | 12 | 2 | — | **no** |

**Population — three measurements, and no single one of them is "what exists".** *attached* counts published, unretired `advisor_video` rows whose `module_id` is a module of one of the track's courses: **97** across these tracks. *unattached-matching* counts published films carrying no `module_id` whose **series** is routed to the track by a ruling in `scripts/hopper.ts`: **23**. *cues* counts published non-film items in those same modules: **197**. A track's **opener** is neither — it lives on `certification.entry_film_content_id` and its `module_id` is null by design, so it is reported in its own column and excluded from "unattached" rather than counted as homeless. A further **15** published Craft films are unattached and **deliberately unrouted**, listed below with the reason for each.

**Unattached and routed** — a ruling exists; the attach has not happened:

- **Chemical Warranty** (12): Coverage is Key — Closer; Coverage is Key — Opener; Coverage is Key, Part 1; Coverage is Key, Part 10; Coverage is Key, Part 2; Coverage is Key, Part 3; Coverage is Key, Part 4; Coverage is Key, Part 5; Coverage is Key, Part 6; Coverage is Key, Part 7; Coverage is Key, Part 8; Coverage is Key, Part 9
- **Menus** (1): Menus — Closer
- **Phones and Tones** (2): Phones and Tones — Closer; Phones and Tones — Opener
- **Walk Around** (8): 30 Second Walk-Around, Part 1, Before You Go Outside; 30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone; 30 Second Walk-Around, Part 4, Step 3, Start It; 30 Second Walk-Around, Part 7, The Four Step Close; 30 Second Walk-Around, Part 8, Step 6 and 7, Miles, Shut It Off and Tires; 30 Second Walk-Around, Part 9, 42 seconds; Two Minute Walk-Around, Part 1, Pop the Hood; Two Minute Walk-Around, Part 2, 4 things under the hood

**Unattached and unrouted** — looked at, and deliberately not homed:

- **CSI** (6) — 6 films against 12 quiz parts; Master-track-or-skill-library is Ryan and Mitch's October ruling (ingest-30-september.md)
- **Pre-Write** (1) — wired as a rung-2 stage fallback for the pitch lookup (mapping_alias), not a track lesson
- **Sing It** (1) — candidate curriculum for Power of Positive Language; a deck name is a label and the ruling is Ryan's (2 October list, item 11)
- **Strawberry Lemonade** (1) — no series and no track named for it; never routed
- **The Big Ticket Visit** (4) — no track named for it; IMG_2249 names itself in sentence one and then teaches the pre-write packet (identify-videos ruling)
- **Wrap-Up** (1) — candidate curriculum for Power of Positive Language; same ruling
- **You Cannot Lose** (1) — a MINDSET quote film carrying collection=Craft; the attribution is unresolved ('unattributed') and it is a holds-list item, not a lesson

<!-- hopper:end -->

**What has changed since 28 September.** Three tracks contained any video and
there were twelve videos across the whole credential. That was true of the
modules and false of the library, which is the whole lesson of this file: 0144
attached 43 films, 0159 adds five closers and three Walk-Around lessons, and
the *unattached-matching* column now names what is still loose instead of
leaving it invisible.

---

## A · Two series that look like they have a home already

These two are not really open questions — a track of exactly that name exists and
is empty. Worth thirty seconds each to confirm rather than assume.

### Phones and Tones — 12 films, 20 minutes

There is a **Master track called "Phones and Tones" with zero films in it.**

| part | title | secs |
|---|---|---|
| 1 | *(opens the series)* | 105 |
| 2 | Before You Say Hello | 90 |
| 3–5 | — | 84, 93, 93 |
| 6 | Get it right the first time | 108 |
| 7 | — | 103 |
| 8 | Offer the first available | 88 |
| 9 | Don't race off the phone | 158 |
| 10–11 | — | 134, 102 |
| 12 | For the BDC — protect the promise | 106 |

### Coverage is Key — 10 films, 22 minutes

The earlier identification pass read this series as **Chemical Warranty**, a
Master track that currently holds 2 films and is inactive.

| part | title | secs |
|---|---|---|
| 1 | — | 100 |
| 2 | Who qualifies? | 131 |
| 3–8 | — | 101, 127, 125, 130, 109, 146 |
| 9 | The questions you'll get | 102 |
| 10 | Don't keep it a secret | 164 |

---

## B · Three series with genuinely no track

### 1 · Name Tag — 10 films, 24 minutes

What it teaches: why the customer is really at your dealership, and what the
advisor's role actually is. It builds to listening and ownership.

| part | title | secs |
|---|---|---|
| 1 | Why do they come here? | 170 |
| 2 | Always be right | 119 |
| 3 | The reveal | 122 |
| 4 | Dealership — why ain't we? | 128 |
| 5 | Brag on your brand | 192 |
| 6 | You are not a financial advisor | 128 |
| 7 | Give real advice | 177 |
| 8 | You are the reason | 134 |
| 9 | Active listening | 165 |
| 10 | Log it, reset it, own it | 158 |

**Candidates: CSI or Lasting Impressions** — both core, both empty, both inactive.
A ten-part series would activate either one on its own.

### 2 · Selling Skills — 10 films, 16 minutes

What it teaches: practical moves for handling a customer who has said no — and
one film about steering *toward* objections rather than bracing for them.

| part | title | secs |
|---|---|---|
| 1 | Watch the video first | 111 |
| 2 | Send the link before you call | 92 |
| 3 | Hand them something | 105 |
| 4 | We caught it in time | 78 |
| **—** | **The Steer Objection** | 105 |
| 6 | The redirect and the dentist | 118 |
| 7 | Information overload | 110 |
| 8 | The trade-in | 77 |
| 9 | Read the customer | 96 |
| 10 | After the second no | 100 |

**Part 5 is missing and "The Steer Objection" has no spoken part number.** It is
published unnumbered. Checked before deciding: Part 6 opens on a fresh scenario
("a customer who said no, first no") and Part 4 closes with *Mahalo* and no
hand-off — **neither refers back to it**, so there is no evidence it is Part 5.
If Mitch says it is, the number is one rename.

**Candidate: Overcoming Objections**, which is core, active and already holds 31
items.

### 3 · Get the Hell Out of Here — 9 films, 18 minutes

What it teaches: the speech that sets up the multi-point inspection — how to
frame it, who does it, and how to get the customer to approve from their phone.

| part | title | secs |
|---|---|---|
| 1 | The easiest sell you'll ever make | 100 |
| 2 | The speech | 85 |
| 3 | Certified technician and completing | 125 |
| 4 | The 90-second highlight video | 101 |
| 5 | Name the favourites | 126 |
| 6 | Text it, and speed matters | 105 |
| 7 | The green approve button | 166 |
| 8 | May I give you a quick call? | 111 |
| 9 | Set up your teammate | 104 |

**Candidate: "Setting up the MPI"** — a core track holding 2 films and inactive.
Every slate in this series says "multi-point inspection setup" in Mitch's own
words, so this is the strongest match of the three.

---

## What the answers are worth

If the three unhomed series land where they appear to belong, **four inactive
tracks become active** — CSI or Lasting Impressions, Setting up the MPI, Phones
and Tones, Chemical Warranty. That is a third of the credential's tracks, from
films already shot, already published, already paid for.

No shooting required. Only the routing decision.
