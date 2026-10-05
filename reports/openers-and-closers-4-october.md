# Openers, closers and the Walk-Around films take their places

*4 October 2026. Migration 0159, one acceptance suite, one refusal suite, the
hopper's third column, and the transcript store moved out of git.*

*Validated on a restore of a **freshly taken** production dump
(`reports/dumps/pre-0159-20261004-2150.dump`, 24.8 MB, verified by
`db-migrate.sh --verify-only`) and on a local chain replay. Both halves of every
gate are proven: the build path accepts real data, the skip path is a clean
no-op, and eight deliberately broken inputs are each refused by name.*

**Nothing is applied to production.** 0159 is on the branch; the merge and the
apply are Ryan's.

---

## Report first — what is actually there

### Population, stated before the finding

`status = 'published'`, `retired_at is null`, `module_id is null`,
`collection = 'Craft'`, `type = 'advisor_video'` — measured against production
on 4 October: **52 rows**. Of those, **16 match the Opener or Closer title
form**, not the 11 the #36 run created. The extra five are the Menus opener
0132 set (which has `module_id = null` by design — an opener is a pointer, not
an attachment) and the four Master-series films #36 parked.

Slates are transcribed from `content_transcript` (source `mux_caption`), which
is the only surviving copy — see "The transcript store" below.

| film | spoken slate | secs | captions (column / Mux) | names the track | disposition |
|---|---|---|---|---|---|
| Setting up the MPI — Opener | *"intro, get the hell out of here."* | 53 | false / **ready** | Setting up the MPI ✓ core | **entry film set** |
| Setting up the MPI — Closer | *"Outro, get the hell out of here."* | 86 | false / **ready** | Setting up the MPI ✓ core | **module 11** |
| Four Step Close — Opener | *"intro the four-step close."* | 94 | false / **ready** | Four Step Close ✓ core | **entry film set** |
| Four Step Close — Closer | *"Aloha! That's the 4-step close."* | 71 | false / **ready** | Four Step Close ✓ core | **module 13** |
| Success Cycle — Opener | *"intro success cycle."* | 136 | false / **ready** | Success Cycle ✓ core | **entry film set** |
| Success Cycle — Closer | *"Outro, this success cycle."* | 86 | false / **ready** | Success Cycle ✓ core | **module 20** |
| Lasting Impressions — Opener | *"intro, lasting impressions"* | 71 | false / **ready** | Lasting Impressions ✓ core | **entry film set** |
| Lasting Impressions — Closer | *"Alotro, lasting impressions."* | 86 | false / **ready** | Lasting Impressions ✓ core | **module 13** |
| Name Tag — Opener | *"Intro, what's in the name tag?"* | 91 | false / **ready** | Name Tag ✓ core | **entry film set** |
| Name Tag — Closer | *"Aotro, what's in a name tag?"* | 87 | false / **ready** | Name Tag ✓ core | **module 11** |
| Dealer Upsell Menus and Interval Charts — Opener | — (pre-existing, 0132) | 162 | false / **ready ×2** | Menus ✓ core | already the entry film |
| Menus — Closer | *"Menus Outro"* | 77 | false / **ready** | Menus ✓ core | **HELD** — would be a third closer |
| Coverage is Key — Opener | *"Intro, coverage is key."* | 95 | false / **ready** | **no track of that name** | **HELD** |
| Coverage is Key — Closer | *"Alotro coverage is key."* | 78 | false / **ready** | **no track of that name** | **HELD** |
| Phones and Tones — Opener | *"intro, phones and tones."* | 69 | false / **ready** | Phones and Tones — Master, not core | **HELD** |
| Phones and Tones — Closer | *"Outro, phones and tones."* | 70 | false / **ready** | Phones and Tones — Master, not core | **HELD** |

*"Alotro" and "Aotro" are whisper mangling "Outro", which is the behaviour
INGEST.md already warns about for proper nouns. The slate's word is "Outro" in
both cases; nothing was renamed on the strength of a transcript.*

### The two holds are different kinds of hold, and the distinction matters

- **Coverage is Key** names a track that **does not exist by that name.** This
  is the hold INGEST.md describes. The resolution is already recorded in
  AGENTS.md's slate table — the series belongs to **Chemical Warranty** — and it
  was caught by the identification pass, not by the title. Its ten lesson films
  are also unattached, so the opener and closer should move with the series
  rather than ahead of it.
- **Phones and Tones** names a track that **does exist** — `is_master_track`,
  active, and carrying 12 attached films. It is held only because Master is
  October's scope and this migration's is the nine core tracks.

### certification.entry_film_content_id, before anything changed

Measured on production before 0159. The brief's expectation holds exactly:

| track | sort | entry film before |
|---|---|---|
| Walk Around | 1 | null |
| Setting up the MPI | 2 | null |
| Four Step Close | 3 | null |
| Success Cycle | 4 | null |
| Overcoming Objections | 5 | null |
| Power of Positive Language | 6 | null |
| Lasting Impressions | 7 | null |
| Name Tag | 8 | null |
| Menus | 9 | **`a5b0f57b…`** — "Dealer Upsell Menus and Interval Charts — Opener" |

**One set, eight null.** All nine core tracks were already `active`.

---

## Per-track reconciliation against the nine core tracks

| track | opener | closer | what 0159 does |
|---|---|---|---|
| Walk Around | **no — owed** | **no — owed** | three lesson films attached to modules 4, 5, 6 |
| Setting up the MPI | yes | yes | entry film set; closer at module 11 of 11 |
| Four Step Close | yes | yes | entry film set; closer at module 13 of 13 |
| Success Cycle | yes | yes | entry film set; closer at module 20 of 20 |
| Overcoming Objections | **no — owed** | **no — owed** | nothing |
| Power of Positive Language | **no — owed** | **no — owed** | nothing |
| Lasting Impressions | yes | yes | entry film set; closer at module 13 of 13 |
| Name Tag | yes | yes | entry film set; closer at module 11 of 11 |
| Menus | yes (0132) | **has two; a third arrived** | **nothing — held for a ruling** |

Five openers, five closers, exactly as the brief expected. Every closer module
is **strictly last on its course**, computed as `max(sort_order) + 1` rather
than written as a literal — which matters because 0144 moved every Knowledge
Notes module to the end, so "after the lessons" is not "after everything".
Success Cycle is the case that proves it: its seven cue modules occupy 13–19,
and the closer is 20.

### item_count, before and after, with `active` from the function

`recompute_certification_content()` runs at the end of the migration and its
answer is **checked, not written**. Bar is 5.

| track | items before | items after | change | active |
|---|---|---|---|---|
| Walk Around | 59 | **62** | +3 Walk-Around films | yes |
| Setting up the MPI | 11 | **12** | +1 closer | yes |
| Four Step Close | 12 | **13** | +1 closer | yes |
| Success Cycle | 67 | **68** | +1 closer | yes |
| Overcoming Objections | 41 | 41 | — | yes |
| Power of Positive Language | 51 | 51 | — | yes |
| Lasting Impressions | 12 | **13** | +1 closer | yes |
| Name Tag | 10 | **11** | +1 closer | yes |
| Menus | 9 | 9 | — (held) | yes |

**Nine of nine core tracks active, by computation.** Every touched track gains
items, so none can lose `active` — asserted anyway, in both directions.
`module_completion` asserted unchanged at **5 rows**.

---

## Menus — the three slates side by side, for Ryan's ruling

Menus carries two closer modules from 0144 and a third film arrived on
30 September. **0159 attaches none of them and asserts the hold**: Menus keeps
its nine modules and `Menus — Closer` stays unattached. Break the assertion by
attaching it and the migration refuses by name — proven.

| film | spoken slate | secs | where it is | what it actually does |
|---|---|---|---|---|
| Menu Wrap-Up, Part 1 | *"Menu wrap up part one, the total coverage."* | **160** | module 8 (0144) | **teaches one technique** — totalling the coverage, with three rules for saying it |
| Menu Wrap-Up, Part 2 | *"Menu wrap-up part two. Tips that work on any rung."* | **210** | module 9 (0144) | **teaches eight more tips** — say what isn't due, say the time and the mileage, group the three things… |
| Menus — Closer | *"Menus Outro"* | **77** | unattached | *"Send me your Menus Good News story… what was your stance before the course? What's the one thing you changed?"* |

### The transcripts change what the choice is, so both options are reported

The brief offers two options — replace one of the two, or park the new one in
the library. Reading the three transcripts suggests a third, and AGENTS.md says
to report the disagreement rather than pick:

**`Menus — Closer` is the only one of the three that is a closer in form.** All
five closers 0159 attaches follow one shape: *"That's <track>. Now I want to
hear from you. Send me your good news story — where were you before this class,
what one thing did you change, tell me the story, what are you changing next."*
`Menus — Closer` is that shape, almost line for line. The two Menu Wrap-Ups are
**lesson films**: they teach techniques and end on "Mahalo", with no challenge
and no story request. They were pressed into service as the closer worked
example in 0144 because no true closer existed yet — the report that shipped
them says exactly that.

So the three options, with no recommendation acted on:

1. **Replace one** (the brief's option a). Retire Menu Wrap-Up Part 1 or Part 2
   with a reason in `content.retired_reason`, put `Menus — Closer` in its
   module. Loses a lesson that nothing else teaches — the coverage total is
   *"the most underused move of any on the menu"* in Mitch's own words.
2. **Park it in the library** (the brief's option b). Menus keeps two closers
   that are really lessons, and the one film that closes the track is the one
   advisors never see.
3. **Keep both Wrap-Ups as lessons and add `Menus — Closer` as module 10.**
   Menus becomes 7 lessons + 2 lessons + 1 closer, which is the same shape every
   other track now has, and nothing is retired. This is what the content says;
   it is not what the brief asked for, which is why it is here as a third option
   rather than done.

**A note Ryan will want before ruling on option 1:**
`recompute_certification_content()` counts `status = 'published'` and does **not
filter `retired_at`**, so retiring a Menu Wrap-Up will not reduce `Menus.item_count`.
The count would stay at 9 (or rise to 10) regardless. That is pre-existing
behaviour, not something 0159 changed, and it is worth knowing before a decision
is made on the basis of a number.

Whatever he rules is a follow-up migration, not this one.

---

## The three Walk-Around attaches, with the sentence that decides each

Ryan's ruling on the #36 proposal, applied. The films are **step-based** and the
modules are **thematic**, so each attach is argued from the transcript body
rather than the title — a slate names the shoot, not the curriculum. Every
sentence below is verbatim from `content_transcript` and is quoted in 0159's own
header, so the attach carries its evidence.

| module | film | secs | the deciding sentence | corroborated by |
|---|---|---|---|---|
| **4. Raising a Problem Well** | 30 Second Walk-Around, Part 2, Four Goals, Two Words | 146 | *"Every ding, every scratch, document it, and **never a negative without a positive solution**."* | the module's own cues: "Never Bring Up a Negative Without a Positive Solution", "No Negative Without a Positive Solution — The Paint…" |
| **5. Tires on the Drive** | 30 Second Walk-Around, Part 5, Step 4, Wheels to the Left | 143 | *"**That view is what sets up Rotate Balance Alignment and Tires.** Hang on to it. You'll use that again in step 7."* | the module's cue "The Tire Maintenance Ladder — Rotate · Balance · Alignment" |
| **6. Visibility and Wipers** | 30 Second Walk-Around, Part 6, Step 5, Washer Fluid | 126 | *"Rubbing a blade gets you one wiper set. **Running the system opens up wipers, glass treatment, washer fluid and a complete service.**"* | the module's cue "Check Wipers on Every RO — Including Big Tickets" |
| **7. The Handback** | **none** | — | the step films are the intake walk-around; none covers returning the car | module 7's questions are about PPE removal and proofing the car at handback |

Each film lands at `module_order = 1` with `placement = 'daily_craft'`. The
modules' existing cues sort at `module_order` **11–36**, so the film leads its
module without colliding with or reordering anything, and **no quiz question and
no cue is touched.** Walk Around keeps its seven modules at `sort_order` 1–7 and
its `is_core` sort position 1 — asserted.

### What these three attaches change that is bigger than three films

Before 0159, Walk Around modules 4–7 held **cues only**. A cue never gates
(0143), so `items_done` requires at least one gating item and those four modules
could **never complete** — which means Walk Around, the first track every
advisor meets, was structurally unearnable. Three of the four can now complete.

**Module 7 still cannot**, so **Walk Around still cannot be completed as a
track** until Mitch delivers The Handback film. 0159 asserts module 7 is
filmless and fails loudly if a film ever lands there quietly, so the gap stays
visible rather than becoming a mystery later.

---

## Captions on the openers — and the column is wrong

The brief asks for captions state on the openers, because a mandatory entry
morning without captions was Mitch's open item and 2-October item 18.

**`content.captions_ready` is `false` on all five openers. Mux has a ready
English caption track for every one of them.** The column is stale, not the
captions.

Measured two ways, which is what makes it trustworthy:

```
POPULATION: published, unretired, collection='Craft', advisor_video = 141 films

  the column says captions_ready = true      2
  the column says captions_ready = false   139

  MUX, asked at the LIVE playback id:
    a READY text track                     141
    no ready text track                      0
    more than one ready en track            19

  DISAGREEMENT
    column false, Mux ready                139
    column true,  Mux none                   0
```

Every one of the 141 is `generated_vod/en:ready`. The cause is structural rather
than anybody's mistake: **`captions_ready` is written in exactly one place** —
`app/api/mux/webhook/route.ts:144`, at `asset.ready` time — and auto-generated
subtitles are a separate track that finishes afterwards. **Nothing ever reads Mux
again.** A second, independent witness agrees: `content_transcript` holds a
`mux_caption`-sourced transcript for **16 of 16** openers and closers, and
`transcripts-backfill.ts` only writes that source after finding a text track with
`status = 'ready'` at the live playback id.

**So the answer to "do the openers have captions" is yes, and the entry morning
is not the accessibility problem it looked like.** 2-October item 18 says
*"2 of 100 published craft films have captions_ready — enable Mux
auto-generated subtitles over the API and report the before and after count."*
The enabling appears already done; what was never done is writing the column
back.

**Not fixed in this PR, deliberately.** It is a 139-row backfill plus a webhook
change, it is item 18's scope, and folding it into a migration about openers and
closers would make a single-purpose migration two things. **The question it
raises, recorded so it is not lost:** *who reads `captions_ready` raw?* —
`fully_captioned` in 0123 and 0125 (`bool_and(coalesce(captions_ready,false))`,
so every certification's aggregate is wrong the same way) and
`scripts/lms-gap-report.ts`. The fix belongs where the value is created: a
webhook that also handles the caption-track event, so the column stops being a
claim about upload time.

---

## Also in this PR

### The hopper's unattached-films column (item 19)

`npm run report:hopper` — read-only — derives **all three measurements** and
writes the table into `reports/unhomed-series-for-mitch.md` between markers.
The population line names all three, as item 19 requires.

It also found a **fourth state the item did not anticipate**: a track's opener
has `module_id = null` *forever*, because it lives on
`entry_film_content_id`. Counting null as "unattached" would have reported every
opener as homeless the moment it was correctly homed — the same defect item 19
exists to fix, one column over. `entry film` is now its own column.

Measured after 0159: **97 attached, 23 unattached-but-routed, 197 cues**, plus
15 unattached and deliberately unrouted with a written reason each.

**The script fails — exit 1 — when it meets an unattached film whose series
nobody has routed**, and it fails on the reverse too (a routing entry naming a
series with no published film, because a stale ruling silently covers the next
film that reuses the name). That guard earned itself immediately: it caught a
bug in my own series derivation, where `"CSI — Upon Arrival, Part 3"` split on
the part number and yielded the series `"CSI — Upon Arrival"`. Trying the two
delimiters in a fixed order is wrong for half the library in one direction or
the other, so the series is now the **shortest** candidate prefix and no
precedence has to be guessed.

### The `db:migrate` guard — nothing to do, both halves shown

Shipped in #49. **Both directions, because a refusal is not self-verifying:**

```
# on main, up to date
$ npm run db:migrate -- --guard-only
  GUARD ONLY — the database is not touched
  on main, up to date with origin/main
  checkout accepted.                                    exit 0

# on this branch
$ npm run db:migrate -- --guard-only
  GUARD ONLY — the database is not touched
  REFUSING — git checkout main && git pull              exit 1
```

### The transcript store is out of git

`reports/dropzone-transcripts.json` was **tracked**, so a `git reset` mid-run
on 30 September reverted it and cost a full re-transcription. It is now
`git rm --cached` plus a `.gitignore` entry, with the reason written there.

**The path is unchanged**, so all three readers keep working with no edit —
`identify-videos.ts`, `slate-plan.ts` and `transcripts-backfill.ts`. Two of the
three already guarded its absence; **the backfill did not**, and threw an ENOENT
that took down the whole run *including its own Mux caption pass, which needs no
local file at all.* Guarded now, with a message naming the rebuild command. Same
question, answered in two places out of three.

INGEST.md gains a "Where the transcripts live" section saying where it is, that
it is a **cache and not the record** (the record is `content_transcript`, 447
rows), and the thing the next run needs to know: **the store holds
`IMG_2161`–`IMG_2512` only, 168 files.** The 30 September batch is not in it —
that is what the reset destroyed. Those transcripts survive only in the
database, which is the argument for the database being the record.

---

## Prove it as the viewer — `npm run accept:openers`

Against local Supabase carrying the restored production dump with 0159 applied.
**Four real advisor accounts, each signed in over PostgREST and reading through
RLS. No check runs as an admin.** AGENTS.md records the Daily Loop preview
walking the morning as an admin — who has no DMS book — and therefore serving a
two-slot morning every time; an opener is a mandatory *advisor* morning, so an
advisor is the only role that proves it.

```
  rooftop a896b9d0-…   store today 2026-10-04
  ok    recompute_certification_content() over PostgREST as service role

  A · the entry morning, as a fresh advisor on Setting up the MPI
        (setup) 62 items on the tracks before it, consumed
  ok    no advisor_track_entry row for Setting up the MPI
  ok    the morning is a track_entry morning (got "track_entry")
  ok    its film is the track's own opener (got "Setting up the MPI — Opener")
  ok    the film is the row the migration pointed at
  ok    the pitch slot is withheld — the film is the day
  ok    the item slot is withheld — the film is the day
  ok    the track is named (got "Setting up the MPI")
  ok    the day completes on the opener alone (streak 1)
  ok    completing it wrote the advisor_track_entry row
  ok    the entry row records the opener as the film that opened it
  ok    the next morning is no longer an entry morning

  B · an advisor already on the track gets no opener
  ok    not a track_entry morning (got "two_slot")
  ok    no opener is served
  ok    the track does not report entering
  ok    the item slot serves the track's first lesson (got "Get the Hell Out of Here, Part 1")
  ok    the item is a film
  ok    the mindset slot is served
  ok    two slots without a DMS book, three with one (got "two_slot", pitch none)

  C · Name Tag's closer is the last item, and the track then completes
  ok    the closer is the last module of the track (sort 11 of 11)
        (setup) 10 Name Tag lesson items consumed
  ok    the loop serves the closer (got "Name Tag — Closer")
  ok    in the closer module (got "Name Tag — Closer")
  ok    the closer is a film
  ok    it is the LAST item of the track (position 11 of 11)
        story_required is true (read from game_settings, not assumed)
  ok    trackComplete() reads false after the closer — story_required true, story not told
  ok    with the Good News Story told, trackComplete() reads true
  ok    the real engine grants Name Tag through accrueFromModule (earned: [craft-name-tag])

  D · Walk Around module 4 serves Part 2 as a gated film, not a cue
        (setup) 24 items on modules 1-3 consumed
  ok    the loop serves 30 Second Part 2 (got "30 Second Walk-Around, Part 2, Four Goals, Two Words")
  ok    in module 4 (got "4. Raising a Problem Well")
  ok    served as a FILM, not a cue
  ok    its type is in gating_content_types() (advisor_video in [advisor_video])
  ok    items_done is true on the film alone (1 of 7 items done, 6 cues unwatched)
  ok    and the module is NOT fully consumed — a cue never gates
  ok    the film alone does NOT complete the module — its 4 published questions still gate it
  ok    with the quiz passed, the LMS writes the module_completion row
  ok    module_7 still holds no film, so it can never gate-complete (11 cues, 0 films)

  36 passed, 0 failed
```

### Three scope notes, because a scoped measurement reported as a general one is a wrong answer

1. **B is a two-slot morning, not three, and that is correct.** `normal` needs a
   servable pitch; a pitch needs a DMS book; a fixture advisor has none. The
   brief asked for "a normal three-slot morning" and what the loop correctly
   produces here is mindset + item. Calling that three slots would be the
   confident wrong answer this project keeps finding. The **pitch slot is
   covered by `npm run accept:loop`**, which seeds a book for exactly that
   purpose. What this suite proves is the part that is about 0159: no opener is
   served, `entering` is false, and the item slot serves the track's first
   lesson.
2. **C's `trackComplete()` reads false immediately after the closer**, because
   `story_required` is `true` in `game_settings` and no story has been told.
   That is the documented gate — Ryan's 30 September ruling, the legs are
   modules *and* story — so the closer finishes the modules and the Good News
   Story finishes the track. Asserted in both directions: false before the
   story, true after, and then the **real** engine (`accrueFromModule`, the same
   path the LMS calls) grants `craft-name-tag`. Asserting through the real engine
   rather than through a reconstruction is the point; a second accounting that
   agreed with itself would prove nothing.
3. **D separates two things that sound like one.** The watch gate makes
   `items_done` true **on the film alone**, with six cues unwatched — that is
   0143's rule, seen from the advisor's own view. Full module *completion*
   additionally needs module 4's four published questions passed, which
   `moduleRequirementsMet()` correctly withholds until they are. Both directions
   asserted so "it completed" cannot be misread as "the film was enough".

### One thing the suite caught that reading the code did not

The first run failed: **`the morning is a track_entry morning (got "two_slot")`**.
Without Mux signing keys in the process, `shapeVideo()` returns null, so
`track.film` is null and `assembleMorning` falls through — the suite would have
been asserting that an entry morning *does not happen*. It failed rather than
passing **because the positive half is asserted by default.** A suite that only
checked "no opener leaks to a mid-track advisor" would have passed with every
film null and proven nothing at all. Keys are now borrowed from `.env.local`
and their absence is fatal and loud, so "no film" reads as a broken harness
rather than as a finding.

---

## The refusals — `npm run refusals:0159`

The build path accepting real data is the acceptance half. This is the other
half: eight deliberately broken inputs, each inside a transaction that is rolled
back, each required to be refused **by a specific message**.

```
  ok      a subset refuses (one opener retired)                 -> 0159: partial
  ok      an opener served by video_url rather than Mux         -> 0159: partial
  ok      an unpublished opener refuses                         -> 0159: partial
  ok      two films titled the same opener refuse               -> an opener must be exactly one
  ok      an existing different entry film is not overwritten   -> refusing to overwrite a ruling
  ok      the Menus hold is enforced                            -> must stay unattached pending Ryan
  ok      a film on Walk Around module 7 is caught              -> Mitch owes it
  ok      a closer attached outside its course refuses          -> is attached to a module outside

  8 passed, 0 failed
```

**Two of these tests had to be rewritten, and the reason is a good one.** The
first attempts tried to null a published film's `mux_playback_id` and to clone
an opener row, and the *schema refused both* —
`content_video_playable` and `content_mux_policy_required`. The unsafe state is
not merely avoided, it is **unrepresentable**, which is the stronger
construction AGENTS.md asks for and it is already in force. The reachable
version of the same exposure is a film carrying a `video_url` instead of a Mux
id: legal under the constraint, and still something `pickItem()` will not serve.
That is what is tested now.

---

## Migration validation — and one blocker that is not mine

**The build path**, on a restore of the fresh production dump: applies clean,
5 openers + 5 closers + 3 attaches, Menus held at 9 modules, module 7 filmless,
`module_completion` unchanged at 5, nine core tracks active by computation,
`item_count` agreeing with an independently recomputed rule. **Applied a second
time**: every leg reports "already done — nothing to do", and the state is
identical. Idempotent.

**The skip path**, on a local chain replay with no Craft films: every leg takes
its "not present — skipping" branch, the migration is a no-op, exit 0, and the
activation assertion correctly declines to assert.

### `supabase db reset --local` cannot complete the chain, and 0157 is why

A **full** local replay is blocked before 0159 is ever reached:

```
Applying migration 0157_front_door.sql...
ERROR: insert or update on table "front_door_slot" violates foreign key
constraint "front_door_slot_content_id_fkey" (SQLSTATE 23503)
Key (content_id)=(66bfaa74-9941-403d-924c-0f93c80d9e72) is not present in table "content".
```

0157 inserts `front_door_slot` rows naming **four hardcoded `content_id`s** with
no population guard, so on an empty seed the FK fails and the chain dies there.
0158 and 0159 are never applied. This is the same defect
`reports/lock-basic-certification-1-october.md` correction 3 records for 0140
and 0143 — *"0140 asserted 70 film joins on a database that has no films"* — and
it has recurred.

**I have not fixed it**, because 0157 is applied to production and merged, and
the standing rule is that an applied migration is never edited. So the deepest
honest replay is **0001 → 0156, which is green**, and 0159's skip path is proven
on that. Stated as the scope it is rather than reported as "validated on a full
replay", which would be a scoped measurement wearing a general name.

**Recommended follow-up:** a new migration making 0157's four slots
population-scoped (skip when the content ids are absent) so the chain replays
end to end again. It is a small change and it restores a check the project
relies on.

### Other checks

```
npm run check:nav       Every watched route is reachable.
npm run check:gating    gating allowlist is consistent (advisor_video; 6 enum values)
npm run lint            0 errors (10 pre-existing warnings, none in new files)
npm run build           clean
```

---

## What Mitch still owes

- **Openers and closers** for the three core tracks with neither:
  **Walk Around**, **Overcoming Objections**, **Power of Positive Language**.
  Six films. All three read `entry_film_content_id = null` after 0159, asserted.
- **Walk Around module 7, The Handback** — a lesson film. Nothing in the catalog
  teaches returning the car, and **until it exists Walk Around cannot be
  completed as a track**, because a cue-only module can never gate-complete.
  This is the single highest-value film outstanding: it is the first track every
  advisor meets.
- **Master opener/closers** — Coverage is Key and Phones and Tones are shot and
  published, and wait on Master being defined rather than on Mitch.

## What Ryan owes

- **The Menus ruling** — three closers, compared above.
- **Chemical Warranty** — 12 published Coverage is Key films, including its
  opener and closer, attached to nothing.
- **CSI** — 6 films against 12 quiz parts; the October ruling.

---

## Two things found on the way that are not in this PR

Both measured, neither fixed, because each is wider than the change in hand.

1. **`captions_ready` is wrong on 139 of 141 published Craft films** — above.
2. **295 surplus duplicate items, all cues, across 99 modules.**
   Population: published, unretired, attached — 1,465 rows; 229 distinct
   `(module_id, title)` groups hold more than one row. Walk Around module 4 has
   the same cue **three times** at the same `module_order`; module 7 has eight
   surplus rows. Every one inflates `item_count` and will be served to an
   advisor as a separate morning — the same cue two or three times. Worst
   affected: `7. The Handback` (+8), `Closing Strategies 2` (+7),
   `Coolant Exchanges` (+6), `Brake Fluid Warranty` (+6).
   Not touched here because de-duplicating means retiring rows that
   `content_progress` and `module_completion` may reference, which is its own
   migration with its own acceptance.

---

## For Ryan

- **Apply order:** `git checkout main && git pull` after merging, then
  `npm run db:migrate`. 0159 is idempotent and refuses partial states. The
  production ledger now reads **0158** (item 21's gap has been reconciled), so
  0159 is the only pending version.
- **After apply:** `npm run check:gating`, and one real advisor morning — the
  first advisor to reach Setting up the MPI gets the entry morning.
- PR opened against `main`; **the merge is yours.** Vercel deploys on merge.
- `git status -sb` shows **no ahead count** on `main`; the branch carries the
  work.
