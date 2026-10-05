# The Lesson Library audit: what an advisor sees, and what is actually missing

*5 October 2026. Read-only against production. Nothing was written to the
database, no migration exists yet, and nothing below the ruling line has moved.*

**Generated tables:** `reports/library-audit-5-october.md`
(`npm run audit:library`) — every course, every module, the three counts.
**Film evidence:** `reports/library/unattached-film-transcripts.md` — the opening
of all 38 unattached films' transcripts.
**Routing rulings:** `npm run report:hopper`, unchanged, re-run on production.

---

## The short answer to what Ryan is looking at

**"Start Here" is a course, not a module, and it is not empty.** It holds five
modules and **25 published cue rows with real text in every one** (87–371
characters of body). Those cues **do render** for an entitled advisor — this is
not a loader fault, and `loadModuleItems` does not drop them.

What Start Here has is **no film**, and three consequences follow that make it
read as empty:

1. The module page lifts the film **out** of the deck and puts it above it
   (`CueDeck.tsx:97–101`). With no film, the page synthesises a placeholder, so
   the first thing on screen is an **empty video slot** — before any cue.
2. Since 0143, `items_done` counts only `gating_content_types()` = `advisor_video`.
   A module with no film has **zero gating items and can never complete**, so it
   reads **0% forever** no matter how many cues are finished.
3. The header still counts cues: `total_items` was deliberately left counting
   everything (0143), so Start Here's modules read **"0 of 8 · 0%"** — a
   denominator the advisor can drive to 8 while the percentage never moves.

So the complaint is correct in substance and mislocated in cause. **35 of 45
courses are in this state**, not just Start Here.

---

## 1. Every course and module

**Population, stated first.** `course → module → content.module_id`,
`status = 'published'`, `retired_at is null` — the path the Lesson Library itself
walks (`my_course_progress` over `my_module_progress`). *films* counts
`advisor_video` only, because since 0143 that is the only type that can complete
a module. *cues* counts every other published type and gates nothing. This is
**not** evidence about content reachable via `service_family_content`, which is a
different path and is counted separately at the end.

**45 courses · 338 modules.** No orphaned modules, no module-less courses.

| | has films | cue-only | nothing |
|---|---|---|---|
| **modules** (338) | **97** | **208** | **33** |
| **courses** (45) | **9** | **33** | **3** |

| track | courses | with films | cue-only | empty | modules | films | cues |
|---|---|---|---|---|---|---|---|
| Craft | 4 | 4 | 0 | 0 | 45 | 45 | 0 |
| Foundations | 13 | 5 | 7 | 1 | 111 | 52 | 410 |
| Product Knowledge | 16 | **0** | 14 | 2 | 64 | **0** | 286 |
| Service Knowledge | 12 | **0** | 12 | 0 | 118 | **0** | 680 |

**An advisor who taps into Product Knowledge sees sixteen courses and not one
film. Service Knowledge: twelve courses, not one film.** That half of the
library — 28 courses, 182 modules, 966 cues — cannot complete a single module.

The nine courses with films are the eight core Craft/Foundations tracks plus
Phones and Tones. The three courses holding **nothing at all**: Everyday
Touchpoints (Foundations), Belts & Hoses and Engine & Perf (Product Knowledge).

Per-module detail is in `reports/library-audit-5-october.md`.

### Start Here, exactly as it stands

| # | module | name_status | films | cue rows | distinct titles |
|---|---|---|---|---|---|
| 1 | Accountability | ok | 0 | 4 | 1 |
| 2 | Knowledge Notes 1 | needs_name | 0 | 8 | 6 |
| 3 | Knowledge Notes 2 | needs_name | 0 | 1 | 1 |
| 4 | Closing Strategies 1 | needs_name | 0 | 8 | 7 |
| 5 | Closing Strategies 2 | needs_name | 0 | 4 | 4 |

Four of the five modules still carry deck-import placeholder names. Nothing in
Start Here is a start — it is a slice of the deck import that landed under that
title.

---

## 2. What the advisor sees

### The screenshots are the one thing I could not produce

**The Chrome extension is not connected** (`tabs_context_mcp` returns "Browser
extension is not connected", twice, ten minutes apart). I did not screenshot the
Library, the Start Here course page, or its five module pages. That half of item
2 is **not done**, and I am not going to describe pixels I did not see.

I also did not sign in to production as anyone. Entering a password on a live
host is not something I do, and minting a session for a real account to look
around would be impersonating that person on production.

**To unblock:** connect the extension and leave a tab signed in as the test
advisor, and I will take the six shots. Tell me which account id is the test
account — I have the seven advisor ids but not which one is yours.

### What I established instead, and why it is tight

The question item 2 poses — loader fault, or missing film? — turns out to be
answerable from the schema with no session at all, and the answer is **not a
loader fault**:

- **`loadModuleItems` has no type filter.** It selects every published row with
  that `module_id` (`lib/lms.ts:290–302`) and maps each to a `cue` or `video`
  card. Nothing drops cues.
- **RLS cannot hide cues while showing films.** `content_entitled_read` keys on
  `role_for_content_type(type)` and `product_for_content_type(type)`
  (`0010_content.sql:89–99`), and **both functions return the same answer for
  `cue` and `advisor_video`** — `advisor` and `advisor_base`
  (`0010_content.sql:49–66`). There is no state in which an advisor reads a
  film and not a cue. That is the decisive fact, and it is the one I would
  otherwise have had to take on trust from a screenshot.
- **The cue rows carry real text.** All 25 Start Here bodies are 87–371
  characters. The deck will render cards with content, not blanks.

So for an entitled advisor the Start Here deck is: a **"film coming" block
above**, then **8 cue cards** (module 2) plus the terminal card. Cues present,
film absent.

### The one account for whom the library really is empty

Checked by id, never by name, with the service role — and re-run after a first
attempt read a column that does not exist (`rooftop_product.product_key`) and
returned `entitled = false` for all nine accounts. That false negative looked
exactly like a finding. The column is `product`.

| accounts with an active advisor role | 7 |
|---|---|
| entitled (advisor role at a rooftop with `advisor_base` live) | **6** |
| **not entitled** | **1** |

One advisor account (`645a4739…`) sits at a rooftop with no live `advisor_base`
row. For that account **every course reads "0 of 0", every deck shows the film
placeholder and no cards at all** — which is precisely the symptom item 2
describes as the loader-fault signature. It is a provisioning gap, not a loader
bug, and it is indistinguishable from one on screen. Two further accounts
(`78929620…`, `c5e6ee88…`) hold `admin` **and** advisor and would read the
library through `content_admin_all` regardless, so neither is a safe test
account for this question.

---

## 3. The unattached film pool

**Population.** `status = 'published'`, `retired_at is null`,
`type = 'advisor_video'`, `collection = 'Craft'`, `module_id is null`: **44
rows**. Six of those are a track's `entry_film_content_id` — homed without being
attached, by design since 0132 — leaving **38 genuinely unhomed films**.

**The reconciliation is the proof:** 38 = hopper's 23 routed + 15 unrouted, and
44 = 38 + 6 entry films. Two routes, same number.

All 38 have a stored transcript (`mux_caption`). Openings are in
`reports/library/unattached-film-transcripts.md`.

### Routed by an existing ruling — the attach has not happened (23)

| series | n | track by ruling | module-level home |
|---|---|---|---|
| Coverage is Key (10 parts + opener + closer) | 12 | **Chemical Warranty** (AGENTS.md slate table; the slate says Coverage is Key) | **no modules fit — see below** |
| 30 Second Walk-Around (parts 1, 3, 4, 7, 8, 9) | 6 | Walk Around | **no modules fit — see below** |
| Two Minute Walk-Around (parts 1, 2) | 2 | Walk Around | **no modules fit — see below** |
| Phones and Tones — Opener, Closer | 2 | Phones and Tones (Master) | held: Master is October's scope |
| Menus — Closer | 1 | Menus | **already ruled** — module 10, carried in from #50 |

**Openers and closers are already ruled in the openers brief and I am not
proposing again.** The five core openers are entry films; the five core closers
landed as modules in 0159; Coverage is Key's and Phones and Tones' remain held.

### Deliberately unrouted, with the reason (15)

CSI (6) — 6 films against 12 quiz parts, Master-or-skill-library is Ryan and
Mitch's October ruling. The Big Ticket Visit (4) — no track named for it.
Pre-Write (1) — a rung-2 stage fallback for the pitch lookup, not a lesson.
Sing It (1), Wrap-Up (1) — candidate Power of Positive Language curriculum, the
ruling is Ryan's. Strawberry Lemonade (1) — no series, no track. You Cannot Lose
(1) — a Mindset quote film carrying `collection = Craft`, attribution
unresolved, a holds-list item.

### Why "no modules fit" is the honest answer, not a shrug

I am not proposing module assignments for the 20 Walk-Around and Coverage films,
because the modules they would go into do not exist and inventing them is a
curriculum decision. The evidence:

**The Walk-Around course serves a nine-part sequential routine with six parts
missing, and the three present are attached to modules named for other topics.**

| # | module | film attached |
|---|---|---|
| 1 | 1. The Walk-Around Routine | The Four Minute Walk-Around, Part 1 |
| 2 | 2. What the Vehicle Tells You | The Four Minute Walk-Around, Part 2 |
| 3 | 3. Reading the Customer | The Four Minute Walk-Around, Part 3 |
| 4 | 4. Raising a Problem Well | 30 Second Walk-Around, **Part 2**, Four Goals, Two Words |
| 5 | 5. Tires on the Drive | 30 Second Walk-Around, **Part 5**, Step 4, Wheels to the Left |
| 6 | 6. Visibility and Wipers | 30 Second Walk-Around, **Part 6**, Step 5, Washer Fluid |
| 7 | 7. The Handback | **none** |

An advisor working this course is shown 30 Second parts 2, 5 and 6 and never
parts 1, 3, 4, 7, 8 or 9 — including Part 1 ("before we go outside, there's
three things that have to be straight in your head") and Part 9, which is the
whole routine performed end to end in 42 seconds. Modules 5 and 6 are defensible
matches on subject. Module 4 pairing "Raising a Problem Well" with "Four Goals,
Two Words" is not obviously one.

**The MOC Warranty Program** is the course Chemical Warranty points at. It has
six modules — `Knowledge Notes 1`, `Knowledge Notes 2`, `Closing Strategies 1–4`,
all deck-import placeholders — **two cues in total and no films**, against a
ten-part film series plus opener and closer. There is no mapping here to propose;
there is a course to build.

Both of these are **a slate naming the shoot, not the curriculum**. Joining part
number to module number is the join AGENTS.md's slate table records five
near-misses on, so I have put the evidence in front of the ruling instead.

---

## 4. The Services shelf

**It is not reachable from More, and the shelf the brief describes does not
exist as a screen.**

`listServiceBuckets` and `loadServiceContent` in `lib/library.ts` have **zero
callers** anywhere in the repo. There is no service-family index route. The only
`/service` page on disk is `app/(app)/service/[family]/page.tsx`, and it does not
use either function — it uses `loadFamilyContent` from `lib/service-family.ts`.

`/service/[family]` is linked from exactly two places, both on `/advisor`:
`FocusFamilyCard` and `PitchDialog`. `MEMBER_SECTIONS` does not list it, and
`check:nav` carries it as deliberately unwatched for that reason.

**So the brief's inference does not hold.** The knowledge courses' material has a
second route *in the data* — 966 knowledge-track cues all carry a
`service_family`, across 13 families, and `service_family_content` exposes 1,673
distinct published rows across 14 — but **an advisor can reach exactly one
family: whichever is their current focus family.** There is no door to the other
thirteen. The material is not homed elsewhere; it is homed nowhere an advisor can
browse to.

*(The `/library` row in `MEMBER_SECTIONS` is also mislabelled — its hint reads
"Coaching cues and pitch videos, by service", which describes the shelf that was
never built, not the course list it actually opens.)*

---

## Things I found that the brief did not ask about

### The 295 duplicate cue attachments are 23, and the key is the finding

The brief carries "295 surplus duplicate cue attachments (Walk Around module 4
holds the same cue three times)". My first measurement reproduced **295
exactly**, which is what made me check it rather than trust it.

| key | duplicated groups | surplus rows |
|---|---|---|
| (`module_id`, `title`) | 229 | **295** |
| (`module_id`, `title`, `body`) | 11 | **23** |

**272 of the 295 are distinct cues that happen to share a title.** Start Here's
module 1 holds four rows titled "Accountability" with bodies of 168, 227, 196 and
191 characters — four different cues. **A dedupe keyed on title would have
deleted 272 pieces of curriculum and reported a successful cleanup.** The title
is the derived label; the body is what was observed.

The 23 real duplicates, byte-identical in title and body:

| course | module | cues | surplus |
|---|---|---|---|
| The Walk-Around | 7. The Handback | 11 | **7** |
| The Walk-Around | 2. What the Vehicle Tells You | 10 | **4** |
| The Walk-Around | 6. Visibility and Wipers | 8 | **4** |
| The Walk-Around | 3. Reading the Customer | 8 | **3** |
| Brake Fluid | Closing Strategies 2 | 11 | **3** |
| The Walk-Around | 5. Tires on the Drive | 10 | **2** |

Five of the six are in The Walk-Around, which points at 0144's moves rather than
the deck import. **Module 4 — the one the brief names — has no true duplicates at
all.** A dedupe is still worth doing; it is a 23-row change, not a 295-row one.

### Power of Positive Language is an active core certification with no film

`item_count = 51`, `active = true`, **0 films**. `item_count` counts cues, so the
credential claims 51 items of which **none can gate a module** — `items_done`
requires an `advisor_video`. The track is unearnable by construction and says
nothing about it. Walk Around is the same shape at one remove: `item_count = 62`
= 6 films + 56 cues.

This is the `item_count` half of the same measurement problem as the hopper's
"videos" column: a number counting two populations under one name.

### Baselines, recorded now for the later proof

`module_completion`: **5 rows**. `content_progress`: **97 rows**. Six tracks now
carry an entry film, so **0159 is applied to production** — the openers brief's
"before" table (only Menus) no longer describes it.

---

## Where the brief and the codebase disagree

Per AGENTS.md I am reporting these rather than picking one:

1. **"The Services shelf … Is that shelf reachable from More"** presupposes a
   screen that does not exist. `listServiceBuckets`/`loadServiceContent` are dead
   code; the reachable page is `/service/[family]` from `/advisor`, one family at
   a time.
2. **"295 surplus duplicate cue attachments"** — 295 is a title-only count. The
   content-keyed count is 23, and the named example (module 4) is not among them.
3. **"A module called Start Here"** — Start Here is a course of five modules.
4. **The 29 September restore's figures have moved**: 45 courses still, but **338
   modules not 253**, and the empty-module count is 33 across the courses named,
   which I have re-measured per course rather than carrying forward.

---

## What has not moved

No migration written. No `course.visible` column, no attach, no dedupe, no
`captions:sync`, no 0157 guard, no Walk Around module 7 change. Those are the fix
phase and they wait on the rulings below. The only files added are the two
read-only report scripts and their output.

## What I need from Ryan

1. **Which account id is the test advisor**, and the Chrome extension connected,
   so item 2's six screenshots get taken.
2. **The `course.visible` rule** as proposed, or changed — and note that under it
   **28 of 45 courses disappear** for advisors, which is the whole Product and
   Service Knowledge half of the library.
3. **Start Here**: renamed, dissolved into Mindset & Philosophy, or left hidden.
4. **The Walk-Around**: six missing 30 Second parts and two Two Minute parts need
   modules that do not exist. Build the 30 Second routine as its own course, or
   extend this one?
5. **The MOC Warranty Program**: six placeholder modules against a twelve-film
   series. Same question.
6. **Power of Positive Language** active with no film — leave, or deactivate until
   Sing It and Wrap-Up are ruled into it?
7. **The dedupe at 23 rows, not 295** — confirmed?
