# Manager Meetings — the plan

Mapping the spec onto the schema and code as they stand on `main` at `c1f3b4b`.
No feature code written. Read with `MANAGER_MEETINGS.md` for the branch rules and
the Preview constraint.

**Revision 4**, 21 November 2026 — the library arrives. Mitch's 213 meetings are
catalogued and loadable, Ryan's six rulings are recorded as data, and three things
the work discovered are written down. See *Revision 4* immediately below.

**Revision 3**, re-grounded on `origin/main`. Revision 2 mapped onto
`c94e835`; thirty-three commits and six new migrations have landed since, and this revision
is what re-reading them changed. Nothing in the *design* moved — rulings A–I all
still hold, and every view, function and library the plan leans on is byte-identical
on `main` today. What moved is four things the plan said about its surroundings, and
one of them is the number it would have written into a migration filename.

**What revision 3 changes, and why each one matters.**

1. **The first migration number is `0182`.** Revision 2 said `0174`; revision 3
   first said `0180`, because `0174`–`0179` landed while revision 2 sat in review;
   then `0180_story_review.sql` took that; then PR #109 merged its own `0181`
   while ours was already written and pushed. **Four catches on one branch**,
   which is the clearest possible argument for the re-check rule — this document
   has now gone stale on the very line that explains why it goes stale. See
   *Build order*.
2. **Ruling H now has a precedent on `main`, and the plan should copy it rather
   than invent.** `0179` (8 November) widened a manager-facing read in exactly the
   shape slice 1 needs. See *The gate that excludes the viewer it is built for*.
3. **`0178` measured the cost of the construction slice 1 would reach for.** A
   function call inside an RLS qual cannot be folded into the planner's InitPlan and
   is evaluated per row — 4.5–5.2x on `content`. It changes the idiom slice 1 writes,
   and it is a measurement rather than a preference.
4. **Slice 5 was half a change.** `app_event` has a `dedup_key` the plan never
   mentioned and a companion file, `lib/events/kinds.ts`, that a new kind is
   *required* to edit. Both are now in the slice. See *(d)*.

Revision 2's own record of what the rulings settled is kept at the end, unchanged.

---

## Revision 4 — the library arrives, 21 November 2026

Mitch's Manager Meetings library is catalogued: **213 meetings**, of which **57
are op-code boost meetings**. The workbook, the cheat sheet and the teleprompter
lines are Mitch's files and are not committed; `scripts/extract-manager-meetings.py`
turns them into two reviewable inputs in `data/`, and
`scripts/load-manager-meetings.ts` writes draft `content` rows and
`manager_meeting_op_code` rows from those.

**The library is not final and nothing in this plan asserts a count.** About 100
films are shot and about 115 are still to come, with more manager mindset films
after that. Every number here is a reading of the 18 November workbook, reported
and never required — the one exception is that a boost meeting with no op code is
a hard refusal, because such a film loads cleanly and can never be picked.

### Ryan's rulings, with Mitch, 21 November 2026

| # | meeting | ruling |
|---|---|---|
| 1 | Engine Cleaning Service | **EFL-046** Engine Flush |
| 2 | Tank Additive | **FSC-017** Fuel System Cleaner |
| 3 | Complete Fuel System Service | **FSC-017** — explicitly *not* MNU-005 |
| 4 | Decarb Service | **FSC-017**, no new catalog code |
| 5 | A/C Performance Treatment | **ABT-054**, retitled **"AC Performance"** |
| 6 | the 17 Bank Account films | unchanged — own topic, placement as-is, never auto-picked, not loaded |

Recorded as data, not only as prose:
`data/manager_meeting_op_code_rulings.csv` and
`data/manager_meeting_overrides.csv`. The loader reads both, so a ruling is an
input rather than a thing somebody remembers.

**Ruling 3 is the one with teeth, and the guard was proved.** MNU-005 is
`coachable = false`, and both supply views filter on `coachable` — so a film on
MNU-005 would load without complaint, sit in the library, and never be served.
The extractor refuses any code that is absent from the catalog or marked
`coachable = false`; pointing a ruling at MNU-005 on purpose produces
`REFUSING TO WRITE — 1 problem(s)` and exit 1, and leaves the previously good
CSVs untruncated.

**Ruling 5's old title is gone from everything user-facing**: the exact string
*"A/C Performance Treatment Boost Meeting"* appears **0 times** in any field the
loader writes. The phrase *"performance treatment"* does survive inside Mitch's
own prose on six meetings — five of which are not the renamed one — because that
is him describing the service, not naming the meeting. Not edited; reported.

### Three things the work discovered, which the plan did not know

**1. `content.service_family` must not carry the Topic, and this was found by
doing it.** It was the obvious home — `listManagerTopics` buckets browse on it.
Loading 213 rows that way put **all 213 into `service_family_content`**, the view
the advisor pitch slot reads, with `true as coachable` hardcoded on the arm they
entered through.

That arm is `where service_family is not null and coalesce(placement,'') <>
'reference'`. It excludes **one placement, by name**, so `'manager_meeting'`
passes straight through. 0168 saw this coming for the *other* route in — its
comment is why the op code lives in `manager_meeting_op_code` rather than
`content.op_code` — but the family_tag arm has the identical hole and nobody had
to guard it, because until now no manager film had ever carried a
`service_family`.

So the loader does not write it. Nothing is lost: the Topic is segment 2 of the
classification line and a column in the committed CSV, and browse behaves exactly
as it does today, with every manager film in `MANAGER_GENERAL_TOPIC` alongside
the 17 Bank Account films — ruling 6 honoured by doing nothing.

> **Open, and it belongs to whoever buckets browse by Topic.** That slice has to
> close the family_tag hole first, or publishing these films puts them in the
> advisor pitch slot. `content.service_family` is read by six things that all
> mean "which service": `family_pitch_supply`, `service_family_content`,
> `service_family_cue_count`, `impact_coaching`, both `blog_corpus_*` views and
> `lib/daily.ts`. "Leading Yourself" is not a service family.

**2. The classification line cannot be rebuilt, so it is stored.** 0183 adds
`content.classification_line`, unique where not null. The line is observed —
Mitch wrote it and says it on camera — and every apparent component of it is
derived: the line reads `10 mins` where `meeting_length` reads `10 minutes`, and
**four A/C titles contain a literal `/`**, so the line does not split into four
parts. `scripts/trim-slates.ts` already paid for this exact lesson here, matching
0 of 73 on a derived name and reporting success.

The unique index then earned itself immediately. One title is
`"Questions, Comments, Concerns?" — The Three-Part Close`; a PostgREST
`in.(...)` filter mangled the quote and the commas, the loader concluded the
meeting was absent and tried to insert a second row, and the index refused it
with a 23505. The loader's own duplicate check saw nothing — the duplicate was
not in the input, it was in the lookup — so **only the construction was
positioned to notice**. The lookup now pages and matches in memory, escaping
nothing.

**3. A code carries several films, and 0168 already allows it.** FSC-017 now
carries three meetings after rulings 2, 3 and 4. `manager_meeting_op_code`'s
primary key is `content_id` and `op_code` is only indexed, so three rows with one
code are fine by construction — 0168 chose that deliberately, against a unique
index, for exactly this case. Verified on the loaded data.

**What a manager sees today: nothing new, and that is correct.** All 213 rows are
`draft`, and both `listManagerTopics` and `loadManagerVideos` filter
`status = 'published'`. Under ruling B the pick orders by last-served with
never-served first and ties by op code, so once these are published the three
FSC-017 films are three separate candidates in the Fuel System family, served one
after another on successive visits to that family rather than competing — which
is the intended behaviour and needed no change.

### The six changes from the adjustments doc, folded in 24 November

`reports/manager-meetings-library-adjustments.md` is now in the repo, so the gap
revision 4 recorded is closed. Its six changes, each with what this plan does
about it:

**1. Supply.** Folded — see *Every place that needs a fixture* below, rewritten.
The doc's own conclusion holds and is now measured: every boost code maps to a
`coachable` code, so **open question 2 does not bite this library**. That question
stays open for a future menu-bundle film and is no longer blocking anything.

**2. Identity is the Classification line, and ingest matches the spoken line.**
Folded and built. `content.classification_line` (0183), and
`lib/video/manager-slate.ts` reads it off the transcript — exact, then case and
punctuation folded, and a miss **holds**. The doc's note that *"the 17 Bank
Account films used a different slate shape and are not in this library"* is
asserted in the fixture test rather than left as prose.

**3. Browse metadata.** Folded, with **one correction to the doc**. It says
*"`content.service_family` carries the topic today and `listManagerTopics` groups
on it."* The second half is true; **the first half is not**, and acting on it is
what put 213 films into the advisor pitch view — see the finding above. The
columns the doc asks for are in 0183: `meeting_length`, `meeting_format`,
`situation_tags text[]` with the 24-tag CHECK, plus `series`, `best_used_for`,
`body` and `subcategory` as it specifies. `Status` and `Academy course` are not
stored.

**4. Family versus group — stated, not reconciled.** Folded as the doc asks.
Mitch's boost group is a browse label and lives in `content.subcategory`; the
ranking family comes from `op_code → op_code_family` and is a **different
partition**. Oil Filter and Engine Oil Service rank under Oil Change while Mitch
files them under Filters and Fluids; Battery and Bulbs sit under Electrical and
lighting while the catalog splits Battery from Lighting.

> **So a manager may see "Oil Change" named as the family on a film Mitch filed
> under Filters, and that is correct rather than a bug.** The screen names the
> family *the pick ranked*, because that is the number the meeting is about. The
> two partitions are not reconciled and must not be: one is how Mitch organises a
> library, the other is how the DMS measures a drive.

**5. The meeting screen grows, and browse gains filters.** Recorded for slice 6
rather than built — slice 6 is not in hand. It was film + family + attach rate by
advisor; it now also shows the card (`best_used_for`) and the run sheet
(`body`), because the run sheet is what the manager actually uses. `/meetings`
gains filters on topic, length, format, situation tag and series. **Academy course
is held back** — it belongs to a product that does not exist yet.

**6. The 17 Bank Account films.** Folded; ruling 6 above. Not loaded, moved or
retitled, and the slate matcher is asserted not to claim them.

Two further facts from the doc, recorded because a later reader will want them:

- **Catalog codes with no boost meeting:** DPF-059, SUS-058, ACC-060, MPI-061,
  UCI-062, OAD-063, HYB-064 and the 13 MNU codes. **Families with no supply after
  mapping:** Accessories, Inspections, Maintenance, Suspension. Expected, not a
  gap — `no_supply` is the right answer for a rooftop whose weakest family is one
  of those.
- **The README's rules:** no meeting numbers, no MOC references, no op codes on
  the sheet, *Series or set is a browse filter and not a play order*, and show
  "When to use it" on the card. The third is why the op code mapping is its own
  file; the fourth is why `content.series` is a label and nothing sorts by it.

### `ABT-054` / "Arctic Blast" — ruled, 24 November

The adjustments doc raised this as possibly covered by a cease and desist from
MOC. **It is not.** Ryan, 24 November: *"Arctic Blast is a product that Doggett
uses, so we are not violating anything. We should remove it at some point if we
roll out to other dealers who do not use that product, but I think it can stay
for now."*

So the catalog label **stays**, and this is closed rather than open. The condition
is worth keeping because it is a real future trigger: **the first rooftop that
does not buy that product is the day the label becomes wrong**, and at that point
it is a one-line change in `data/op_code_seed.csv` plus a re-seed — nothing joins
on `name`, every join is on `code`. Recorded in
`reports/MANAGER-MEETINGS-BRAND-REVIEW.md`.

What remains true regardless: Mitch's own library never says "Arctic Blast". It
says *"an A/C performance treatment"*. So a manager on the meeting screen will
read the catalog's product name beside a film using the generic phrase — not a
defect, just worth having decided on purpose.

---

## The ranking is the pitch picker's, one level up

**Rank service families exactly as `derive_focus_family()` does, summed across
the rooftop's advisors. Serve a manager film whose op code sits in the winning
family.** No op-code-grain attach rate is built.

The formula, unchanged from 0123:

```
missed_ros = greatest(store_avg_pct − attach_rate_pct, 0) / 100 × advisor_ros
```

clamped at zero so an advisor ahead of the store is not a negative opportunity,
tie-broken by `opportunity` (`missed_ros × labor_per_ro`) and then by family name
so a dead heat resolves the same way on every server.

Aggregating to the rooftop means **summing that per-advisor numerator across the
rooftop's advisors** — "how many ROs the below-average half of this drive is
missing in this family." Re-deriving the formula at rooftop grain would give zero
by construction, because `store_avg_pct` *is* the rooftop's own average: the
store cannot have a gap against itself. Same numerator, same clamp, same floor,
one grain up.

**It reads the same two views the picker reads, including where they disagree
with each other.** `derive_focus_family` takes the advisor's own rate from
`advisor_family_attach` (0055) and the store average from
`family_store_benchmark` (0096), which is built on `advisor_family_attach_all`
(0081) — and only `_all` is epoch-aware about `sub_category_map`'s
`effective_from` / `retired_at`. That asymmetry is pre-existing. **This branch
reproduces the picker's pairing rather than improving it**, because a manager
meeting that disagreed with the advisor's own pitch about which family is
weakest would be worse than either answer. If the pairing is wrong it is wrong
for the pitch too, and that is its own task with its own verification.

Likewise `min_ros_for_coaching()` (20) and the departed-advisor exclusion are
**called, not restated**. 0123 already paid for the reason: a store average that
can disagree with the one on the advisor's own screen is worse than no
derivation at all.

---

## The measurement that is not being built on

Ruling A: measure `dms_op_code_map` coverage once, as a finding, so we know
whether op-code grain is reachable later. **Build nothing from it.**

**This has not been run, and here is why.** The measurement needs service-role
access, because `dms_op_code_map` is platform-owner-only (0093) and the counts
cross `advisor_op_metric`. The three Supabase variables are stored as **Vercel
Secrets** and cannot be pulled (`vercel env pull` writes `[SENSITIVE]`
placeholders for them), and the only `.env.local` on this machine lives in
`~/ediagd`, which this branch may not touch. Reporting a number I did not take
would be the thing this project has been caught on four times.

So the query is specified and ready, and it needs one thing: a service-role key
in `~/ediagd-manager/.env.local`, or the result of running this read-only block
against Preview.

```sql
-- Scope stated before the finding: ONE rooftop at a time, latest closed period.
-- Two paths, reconciled, because a path-scoped count read as a fact about the
-- subject is this project's most repeated mistake.

-- PATH 1 — from the map outward: how much of the catalog is bridged at all.
select r.name as rooftop,
       count(*)                                                   as map_rows,
       count(*) filter (where m.status = 'confirmed')              as confirmed,
       count(*) filter (where m.status = 'proposed')               as proposed,
       count(*) filter (where m.status = 'no_match')               as no_match,
       count(distinct m.canonical_code)                            as catalog_codes_reached
  from dms_op_code_map m
  join rooftop r on r.id = m.rooftop_id
 where m.retired_at is null
 group by r.name order by r.name;

-- PATH 2 — from the feed outward: what share of the WORK is bridged.
-- This is the number that decides whether op-code grain is possible, and it is
-- weighted by ROs and by dollars because a mapping can cover many rare codes
-- and little real volume.
select r.name as rooftop,
       sum(d.cp_ros)                                               as ros_total,
       sum(d.cp_ros)    filter (where m.canonical_code is not null) as ros_mapped,
       round(100.0 * sum(d.cp_ros) filter (where m.canonical_code is not null)
                   / nullif(sum(d.cp_ros), 0), 1)                   as ros_pct,
       sum(d.labor_sales)                                           as labor_total,
       sum(d.labor_sales) filter (where m.canonical_code is not null) as labor_mapped,
       round(100.0 * sum(d.labor_sales) filter (where m.canonical_code is not null)
                   / nullif(sum(d.labor_sales), 0), 1)              as labor_pct
  from dms_daily_metric d
  join rooftop r on r.id = d.rooftop_id
  left join dms_op_code_map m
    on m.rooftop_id = d.rooftop_id
   and m.dms_op_code = d.op_code
   and m.retired_at is null
   and m.canonical_code is not null
 where r.name not like '[DEMO]%'
 group by r.name order by r.name;
```

**What the repo can already tell us, and it is a real part of the answer.**
Counted from `data/op_code_seed.csv` and `data/op_code_family_map.csv`, which
are the files the catalog was seeded from:

| | |
|---|---|
| catalog op codes | **73** |
| distinct families they fall into | **19** |
| codes ruled `coachable = false` | **13** (the `MNU-*` bundles and MPI-061, per 0066) |

So the family grain is **19 buckets over 73 codes** — roughly four codes per
family. That ratio is why ruling A de-risks the work: a family is measurable as
soon as *any* of its codes is bridged, where an op code needs its own bridge row.
Nineteen buckets is also small enough that a rooftop's ranking is legible on a
screen.

What the SQL above still has to settle is whether the bridged share of ROs and
dollars is large enough to make op-code grain worth returning to. Until it runs,
the honest statement is: **unmeasured, and nothing in this plan depends on it.**

---

## The gate that excludes the viewer it is built for — ruling H

Live in the schema now, before a line of this feature exists.
`op_code_catalog_read` and `op_code_family_read` (0081) both gate on:

```sql
(select is_platform_owner()) or exists (select 1 from admin_rooftops())
```

and `admin_rooftops()` (0045) is platform owner, `role = 'admin'`, and the
`group_owner` org role. **`manager` is not on that list.**

So the meeting screen — whose entire audience is managers — cannot read the
**name** of the op code its film teaches. A manager querying `op_code_catalog`
gets zero rows and no error. `manager_meeting_op_code`'s own policy (0168) does
admit managers, so the association is readable while the thing it points at is
not.

Fourth instance of the sub-pattern AGENTS.md has already named three times:
`has_performance_surface()`, `op_code_family` in `pickPitch`, `dms_advisor_read`
on `/advisor`.

**Ruling H: widen `op_code_catalog_read` to `managed_rooftops()`, in its own
slice with its own migration.** The catalog holds a code, a name, a category and
piggyback notes — reference data with no per-store numbers, so a manager reading
it discloses nothing about anybody. The alternative, copying the name onto the
serve row, would be a second definition of what a code is called and it would
drift.

**`op_code_family` stays exactly as it is.** Under family grain the screen never
needs it: the family is plain text on `advisor_family_attach` and
`family_store_benchmark`, both of which a manager can already read. Only the
definer function reads `op_code_family`, and it runs as its owner.

Verified against current `origin/main`: `0081`'s policy body is unchanged, and
`admin_rooftops()` (0045) still excludes `manager`. The defect is live today.

### `0179` is this slice's precedent, and slice 1 copies its shape

**Authored 8 November and merged to `main` 9 November in PR #100 (`c1f3b4b`), while revision 2 was in review.** The same PR also edited `0117` in place; nothing in this plan reads `0117`.
`0179_managers_read_their_advisors_completions` is the same move on a different
table: a manager-facing surface could not read the one relation it needed,
returned a confident `0%` for an entire roster with no error, and the remedy was
the read path rather than a heuristic that detects its absence. It is shaped on
`advisor_certification_read` (0115), and slice 1 is now shaped on it in turn:

- **Three arms, in that order** — `is_platform_owner()`, the caller's own scope,
  then the managed scope.
- **`(select ...)` scalar subqueries rather than bare calls**, so the planner
  hoists them into an InitPlan instead of calling them per row. That is 0027's
  rule, and 0178 is the measurement behind it.
- **One policy, not two that have to agree — and the first version of this
  paragraph was wrong.** 0179 dropped `module_completion_own` because its whole
  content had become an arm of the new policy, and two permissive policies are
  ORed anyway, so leaving it would be a duplicate clause nobody would think to
  edit in step.

  This paragraph used to say *"slice 1 has no such duplicate —
  `op_code_catalog_read` is the only select policy on the table."* **There is a
  second policy.** `op_code_catalog_admin` (0062) is declared `for all`, so it
  covers select as well as insert, update and delete, and the two policies are
  **ORed** exactly as 0179 describes: an admin reads the catalog through either
  one. It has granted admins full write access to this table since 0062.

  **How the claim was reached is the part worth keeping.** It came from grepping
  for the string `op_code_catalog_read` across the migrations, finding it in 0062
  and 0081, and reporting that as a fact about the table's policies. That is
  evidence about *one policy's history*, stated as a fact about *the table* — the
  scope error this document already catalogues three times under "a sample is
  evidence about the sample." A grep for a name can only find the name you
  already thought of.

  **The fix is the listing, not a better grep.** `select polname, polcmd from
  pg_policy where polrelid = '<table>'::regclass` enumerates what is actually
  there, including the policy whose name you would never have guessed, and it is
  what caught this. Run against the live local database it returned two rows
  where the plan predicted one. Any future claim in this document about who may
  read or write a table is to be taken from that listing.

  **0182 leaves `op_code_catalog_admin` untouched**, and asserts that it is
  untouched — the read widens, the write does not move, and a manager gains no
  insert, update or delete. That assertion is the reason this matters rather than
  being a footnote: without the listing, slice 1 would have shipped an
  "exactly one select policy" check that failed against a correct schema, and a
  "no write policies" check that passed against a table whose admins can write
  it. See `reports/POLICY-WRITE-COUNT-FINDING.md` for the second half, which is
  a main concern and is not confined to this branch.
- **Stale comments are replaced in the same pull request, not softened.** 0179
  rewrote the two sentences that still described the ruling it reversed, on the
  stated grounds that a comment describing a rule the codebase has stopped
  following instructs the reader not to look. Slice 1 inherits that: 0081's own
  commentary about who may read the catalog is part of the change, not a follow-up.

**And 0178 is why the idiom is a measurement rather than a preference.** It found,
on production as a Beaumont advisor, that moving an entitlement predicate out of
an inline `EXISTS` and into a shared function cost **4.5–5.2x on every read of
`content`** — an inline `EXISTS` inside an RLS qual is compiled into the plan's
InitPlan / hashed-SubPlan machinery and evaluated once, and a function call cannot
be folded into that, so it runs per row. A second remedy, hoisting the question to
one call per query behind `= any(...)`, measured *worse* than the thing it was
fixing.

The honest read for slice 1: `op_code_catalog` holds **73 rows**, so the per-row
cost is bounded and nothing here is in `content`'s league — and the existing policy
*already* uses `exists (select 1 from admin_rooftops())`, as do its three siblings
in 0081. So this slice keeps the established shape rather than reaching for a
rewrite 0178 would not justify at this size. What 0178 forbids is the opposite
move — "improving" these four policies onto one shared function — and that is
written down here so nobody attempts it on this branch believing it to be a
tidy-up.

### Widening to `managed_rooftops()` also admits `group_manager`, and that is a decision

`managed_rooftops()` is not simply "admin plus manager". It is:

```sql
  membership.role in ('manager', 'admin')
  union
  org_rooftops(array['group_owner', 'group_manager'])
```

and `admin_rooftops()` **deliberately excludes `group_manager`** — 0045 says why,
in terms: *"running several stores is not the same as administering the account,
and the admin surfaces carry pricing, gamification settings and the DMS
importer."*

So this widening hands catalog read to a role the admin gate refused on purpose.
**The plan accepts that and states it rather than inheriting it silently**, because
AGENTS.md's rule is to name the roles that will really call it — and revision 2's
table named four of the seven. The reasoning: 0045's exclusion is about pricing,
settings and the importer, none of which is in `op_code_catalog`, and a group
manager running several stores has a plainer claim to read the *name* of an op code
than an advisor does. If Ryan disagrees, the alternative is a bespoke predicate —
which is a second definition of "manages this rooftop", and therefore the thing to
avoid rather than the safe option.

Roles named — all seven this time, with the widening applied:

| role | `op_code_catalog` | `op_code_family` | `advisor_family_attach` | `family_store_benchmark` | `manager_meeting_op_code` |
|---|---|---|---|---|---|
| platform owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| **manager** | ✅ *(widened)* | ❌ *(not needed)* | ✅ | ✅ | ✅ |
| group_owner | ✅ *(already, via 0045)* | ✅ | ✅ | ✅ | ✅ |
| **group_manager** | ✅ *(widened — newly granted, see above)* | ❌ | ✅ | ✅ | ✅ |
| advisor | ❌ | ❌ | ✅ | ✅ | ❌ |
| technician | ❌ | ❌ | ✅ | ❌ (0096) | ❌ |
| service_role | ✅ | ✅ | ✅ | ✅ (0123) | ✅ |

### The new parity gate is not evidence about this slice

`db:migrate` now runs `check:entitlement-parity` as step 5 after every successful
push, and it is a real gate — it exits non-zero on any difference and fails the
migrate. **It is scoped to `content`**: it compares the three permissive policies
on `content` against `content_entitled_for`, for every advisor on the database and
every value of `content_type`.

It therefore says **nothing** about `op_code_catalog`, and a green `db:migrate` on
the slice-1 migration is not evidence that slice 1 is right. Stated because a
check that passes alongside your change reads like a check *of* your change — which
is this document's own scope rule, and the reason slice 1 carries its own
acceptance.

**The verification trap, and it is the whole slice.** Beaumont's two managers may
well hold `admin` as well as `manager`. A suite that signed in as them and passed
would have tested the one context in which this gate cannot fail. So the fixture
user holds **`role = 'manager'` and nothing else**, and the slice proves both
halves: that user reads the catalog after the migration, and a technician fixture
user still does not.

---

## What already exists

0168 and 0169 did the structural work, and ruling A means most of it is now
directly usable.

- **`manager_meeting_op_code`** (0168) — `content_id` → `op_code_catalog.code`,
  `origin in ('manifest','manual')` so a hand correction is distinguishable from
  a pipeline one. Deliberately **not unique** on `op_code`: Vol 5 may coach the
  same code again. RLS admits manager and admin. Deliberately **not**
  `content.op_code`, because `service_family_content` excludes only
  `placement = 'reference'` by name and a manager film carrying an op code would
  enter the view the advisor pitch slot reads.
- **`placement = 'manager_meeting'`** (0168 on the enum, 0169 backfilled onto all
  17 Vol 3 films) behind a null-safe CHECK — `IS NOT DISTINCT FROM`, because
  `placement = 'manager_meeting'` evaluates to NULL for a NULL placement and a
  CHECK passes on NULL. Every advisor picker selects by positive equality, so a
  manager film cannot be drawn by any of them.
- **The ranking and all of its inputs** — `derive_focus_family()` (0123),
  `advisor_family_attach` (0055), `family_store_benchmark` (0096/0123),
  `advisor_family_labor` (0055), `min_ros_for_coaching()` (20).
- **`family_pitch_supply`** (0123) — the shape to mirror for manager films,
  including its `and f.coachable` filter.
- **The lock precedent** — `advisor_focus_family`: an open row with `ended_on`
  null, a `source` that distinguishes derived from manager, and the derivation
  refusing to overwrite a manager ruling.
- **`perf_period.is_partial`** (0039, `not null default false`) — which is what
  makes "the last **full** period" in ruling F representable at all, rather than
  a thing a reader has to judge.
- **`app_event`** (0163) — `kind` CHECK over seven known values, service role the
  only writer, `managed_rooftops()` read, advisor reads nothing. 0163 also
  asserts its own constraint is not vacuous, which is the test to mirror.
- **`/meetings`** — browse by topic over `type = 'manager_video'`, behind
  `checkEntitlement(…, ["manager"], "manager_meetings")`. **Never reads
  `placement`**, so 0169 left it untouched. Already in `check:nav`'s `WATCHED`,
  so routes beneath it are checked for reachability.
- **The family attach-rate UI, already built.** `lib/advisor.ts`
  (`buildServiceFamilies`, `hasCoachingVolume`, `advisorTier`) and
  `lib/manager.ts` render exactly what ruling E asks for, keyed on
  `advisor_op_id` with the op code as the fallback label — the
  never-identify-by-name rule already honoured, and `hasVolume` already rendering
  "too thin to judge" instead of a number.
- **`game_settings`** — single row, columns added by `alter table`, with
  `coaching_block_days_sane` as the sanity-constraint precedent.
- **"Attach rate"** is already the standing word on `/advisor`, `/manager`,
  `/admin/impact`, `/admin/dms` and the dealer-codes screens. Ruling E keeps it.
- **`scripts/focus-family-acceptance.ts`** — creates a throwaway rooftop, auth
  users, a period, DMS metrics, op codes and films; exercises each path *as the
  role that will really call it*; deletes it all; refuses a non-localhost
  `SB_URL`. Exactly the harness the Preview constraint requires, and the suite
  that already proves this ranking.

**Entitlement reality:** `manager_meetings` is active for **one** rooftop —
Doggett Ford of Beaumont (0164) — and two managers. Everything below serves one
store on day one. The serve is gated on `rooftop_product`, so turning the product
on for a store is what starts its Mondays. Never a list of rooftop ids.

---

## Item by item

### (a) Weekly pick per rooftop — family grain

**Exists:** the whole ranking, its inputs, the lock pattern,
`manager_meeting_op_code`, and `family_pitch_supply` as the template.

**New:**
- `rooftop_family_missed` — view. Per rooftop × family × period: the sum of
  per-advisor `missed_ros`, the summed `opportunity`, and `advisors_counted`.
  Built on the same two views and the same floor the picker uses.
- `manager_meeting_supply` — view. Families that have at least one published
  manager film, via `manager_meeting_op_code` → `op_code_family`. Mirrors
  `family_pitch_supply`, including `and f.coachable`. **Inner-joined by the
  pick**, so a family with no manager film is not a candidate however large its
  gap — the same construction that keeps ten filmless advisor families out of
  the pitch slot today.
- `pick_manager_meeting(_rooftop uuid, _period uuid)` — definer, no grants. The
  family walk in ruling B. Definer because it reads `op_code_family`, which is
  admin-scoped.

**One question for Mitch or Ryan, not for me.** `family_pitch_supply` filters
`and f.coachable`, and 0066 draws that line as *"map for reporting but never
coach"* — 13 of the 73 codes, the `MNU-*` bundles and MPI-061. A manager meeting
is coaching, so the plan keeps the filter. But it is a standing ruling about
advisor coaching being applied to a new surface, and if a manager film is ever
made about a menu bundle the filter will silently hide it.

### (b) Within the winning family, and when to fall through — ruling B

**Order inside a family:** the eligible film **least recently served to that
rooftop**, **never-served first**, ties broken by **op code**.

Expressed as `order by last_served_at asc nulls first, op_code asc`. `nulls
first` is doing the "never-served first" work, and it is the kind of clause that
inverts silently if someone later changes the sort — so the acceptance suite
asserts a never-served film beats a served one directly, rather than only
asserting the full ordering.

**Fall-through:** if every film in a family is inside the N-week window, the walk
moves to the next family by rank.

**Nothing eligible anywhere: no pick, and a stated reason.** The reason is a
value on the row, not a log line, and it distinguishes the cases that look
identical on a screen:

| reason | what happened |
|---|---|
| `no_period` | no closed DMS period for this rooftop |
| `no_ranked_family` | every family has a clamped gap of zero |
| `no_supply` | families rank, none has a manager film |
| `all_suppressed` | every candidate film is inside the N-week window |
| `not_entitled` | the rooftop has not bought `manager_meetings` |

This is `derive_focus_family`'s honest null with the reason attached. A silent
no-pick and a rooftop nobody has configured are indistinguishable otherwise, and
`no_supply` is the expected state for every rooftop until Vol 4 is filmed — so
it must read as a normal state rather than a fault.

### (c) — withdrawn by ruling D

Dropped. Under family grain its reason is gone: **the family is measured even
when one code in it is not.**

Confirmed against `data/op_code_family_map.csv` — all five of the named codes sit
in families that are measured by other codes:

| code | family |
|---|---|
| OF-008 | Oil Change |
| WWF-016 | Wipers |
| BCS-032 | Brake Service |
| BTT-035 | Battery |
| TPS-050 | Tires & Rotation |

So a manager film carrying BTT-035 becomes servable when Battery ranks, which is
the intended effect of the ruling and not a side effect of it. No column, no
list, no migration. **Nothing is built for this item, and the five codes are
named here only so a later reader knows the question was asked and answered.**

### (d) Swap, and served / watched / swapped — ruling G

**Exists:** `app_event` and 0163's constraint-is-not-vacuous assertion.
`content_progress` as the format-agnostic consumption record — and the caution
worth repeating: `content_progress.source` is last-writer-wins and says which
surface touched the row *last*, not which finished it. `app_event` is the
append-only answer.

**New:** three kinds — `manager_meeting_served`, `manager_meeting_watched`,
`manager_meeting_swapped` — with 0163's non-vacuous test mirrored.

**Revision 3: this slice was half a change, and three things were missing.**

**1. A kind is a migration *and* a line in `lib/events/kinds.ts`.** 0163 says so
outright, and the file repeats it: *"Adding a kind means editing BOTH — a
migration and this file — and that friction is the feature."* The two are one
claim stated twice, the database refusing an unknown kind with a 23514 and
`APP_EVENT_KINDS` refusing it before the round trip. Revision 2 named only the
constraint, which would have left `AppEventKind` unable to type the call sites
that write these rows. Both halves are in the slice.

**2. None of the three goes in `CLIENT_OPEN_KINDS`, and the reason is the trust
boundary.** That array is the whole of it, and its comment is explicit that a
server action is reachable by direct POST — so the kinds that are *evidence of
work* are deliberately absent and emitted from inside the functions that have
already verified the thing happened. All three of these are evidence of work:

| kind | written from | why not client-named |
|---|---|---|
| `manager_meeting_served` | the serve path, service role | a rooftop-level act with no browser in it at all |
| `manager_meeting_watched` | inside the verified watch path, as `lesson_completed` is | a client that could post it could manufacture a record of watching |
| `manager_meeting_swapped` | inside the swap server action, after the swap is written | the event must not be able to disagree with the serve row it describes |

**3. `app_event.dedup_key` exists, and the serve needs it.** 0163 gives the table
a `dedup_key` and a **partial** unique index (`app_event_dedup_idx`, unique on
`dedup_key` where it is not null). Revision 2 never mentioned it, and the gap is
real: the unique index on `manager_meeting_serve` (rooftop × week) protects the
*serve row*, so a cron that fires twice — or is retried — writes one serve and a
second full set of `served` events. The authoritative fact stays correct while the
engagement record silently doubles, which is the funnel reading high for reasons
nothing reports.

So the `served` insert carries a dedup key per **(rooftop, week, manager)** and
uses 0163's existing arbiter. 0175 is the worked precedent, including the part
that bites: `on conflict (dedup_key) where dedup_key is not null` — the index
predicate is **required** to infer against a partial unique index, and omitting it
is not a style question, the statement simply errors.

`watched` takes no dedup key — a manager rewatching is a real second act — and
`swapped` takes none for the same reason, since swapping twice in a week is two
decisions and the serve row's override trace is what records the current state.

**Ruling G: one `served` event per manager at serve time.
`app_event.user_id` stays `not null`.** The serve is a rooftop-level act with no
user, but the server knows the rooftop's managers from `membership`, so it writes
one row each. Relaxing `user_id` would weaken an invariant every existing reader
holds in order to serve one kind. Pairing served with watched per person is also
what an engagement funnel actually needs.

The authoritative "this was served" fact is the `manager_meeting_serve` row. The
events are the engagement record, not the state.

**The swap leaves a trace in the row, not only in an event.** AGENTS.md's
hold/override rule: a manager swapping is legitimate and often right; what must
not happen is it leaving no record, because afterwards a swapped week and a week
nobody touched look identical. So the serve row carries `source`,
`overridden_from_content_id`, `swapped_at` and `swapped_by`.

### (e) The meeting screen — ruling E

**The film, the family named, and the family's attach rate by advisor for the
rooftop.** "Attach rate" stays the word.

**Exists: nearly all of it.** `advisor_family_attach` and
`family_store_benchmark` are both manager-readable and both carry `family` as
plain text, so **no new view is needed for this item** and `op_code_family` is
never consulted. `lib/advisor.ts` and `lib/manager.ts` already build the
per-advisor family rows, keyed on `advisor_op_id`, with the op code as fallback
label and `hasVolume` rendering "too thin to judge" below
`min_ros_for_coaching()`.

**New:** `/meetings/this-week` — inside the watched `meetings` tree, so
`check:nav` covers it — plus a loader. Behind the same `manager_meetings`
entitlement `/meetings` already uses. Driven as a fixture manager, not an admin.

**The serve row stores the family it ranked.** Not a denormalisation that can
drift: it is a historical fact about the pick, exactly as
`advisor_focus_family` stores `missed_ros` and `period_id`. The inputs change
every month, and a meeting from March must still say which family it was about.

### (f) Follow-up — ruling F

**Month over month, both months named on screen. "Moved" wording only.**

- **Before** = the last **full** `perf_period` before the meeting week.
- **After** = the first **full** `perf_period` that starts after it.
- Until that period closes, the row **names the month it is waiting on.**

"Full" is `not is_partial` (0039), which exists precisely because *"a partial
month read as a full one looks like a collapse in performance."* So this reads a
column rather than judging a date range.

Never `0.0` while waiting — "waiting on November" and "moved 0.0 points" are
different facts and only one of them is true. A sync in this very area already
reported a cursor it was not resuming from and announced success with ten months
missing; a premature zero here is the same confident wrong answer.

Prior art at the right grain: `impact_rollup` carries `attach_rate_pct`,
`prev_attach_rate_pct` and `delta_pts` per advisor × **family** × period, and
`ImpactV2` already renders percentage-point movement. Under ruling A this is now
the same grain, so the follow-up reads the family attach rate the screen already
shows rather than anything new.

**Reported, not required:** it never gates serving, never blocks the screen, and
its absence is not an error.

### (g) The 17 Vol 3 films

**Exists: all of it. Nothing to build.**

The Manager Bank Account series — an introduction, eight deposits, seven
withdrawals and an outro — is `type = 'manager_video'`, now
`placement = 'manager_meeting'` (0169), and carries no op code. The pick
inner-joins `manager_meeting_op_code`, so **a film with no row there cannot be
auto-picked, by construction** — no condition for anybody to remember.

Browsing is untouched: `listManagerTopics` and `loadManagerVideos` select on
`type = 'manager_video'` and have never read `placement`.

One consequence stated rather than discovered: (d) lets a manager swap to *any
other manager film*, so a Vol 3 film is a legitimate swap target. It cannot be
picked and it can be chosen — the right asymmetry.

---

## Build order — ten slices

Each reviewable alone. Migrations are authored and replayed locally, numbered
when the PR opens and re-checked immediately before the merge; nothing is
applied from this branch.

Four of the ten slices carry a migration: 1 (the catalog read), 2 (two views),
3 (the serve table and the setting), 5 (the event kinds). They take consecutive
numbers in that order at PR time.

### The number, and the four times this branch has been caught by it

**The next free number is `0182`, and slice 1 has taken it.** `origin/main` holds
`0174` through `0181` as of `0693559`.

Revision 2 said the first number here was `0174`, and told the story of `0173`
landing from another branch as the reason the re-check rule exists. **Then the
same thing happened to revision 2, six times over, while it sat in review** —
`0174`–`0179` all landed on `main` between the two revisions.

That is worth more than a corrected number, because it answers a question the rule
only implied: *how fast does this go stale?* Six numbers in one week. So the number
in this document is a **reading, not a reservation** — it is accurate as of
`0693559` and it will be wrong again. The operative instruction is the re-check
immediately before Ryan merges, and the thing to re-check against is current
`origin/main` **and the migrations directory**, not this line.

**And it happened a third time, to the table that was correcting the second.**
`0180` was taken by `0180_story_review.sql`, which landed on `main` the night
after revision 3 was written.

**And a fourth time, which is a different failure from the first three.** Slice 1
was written as `0181`, committed and pushed. PR #109 then merged its own
`0181_a_watch_ping_files_where_the_completion_does.sql`, so slice 1 is now
**`0182`**. Four catches: `0173`, then `0174`–`0179`, then `0180`, now `0181`.

**The fourth is the first caused by two open PRs rather than by `main` moving
ahead of a stale document.** The first three were staleness — a number read
correctly and then overtaken. This one was a genuine collision: both numbers were
live and correct when they were taken, and neither branch could have seen the
other's file. Re-reading `origin/main` more often would not have prevented it,
because at the moment slice 1 was numbered, `0181` *was* the next free number.

**It also arrived with no error, exactly as the rule predicted.** `git merge
origin/main` reported a clean merge and said nothing, because the two files have
different names — `0181_a_manager_reads_the_op_code_catalog.sql` and
`0181_a_watch_ping_files_where_the_completion_does.sql` — so there is no textual
conflict for git to find. Both sat in `supabase/migrations/` at once, and the only
thing that would have noticed is the replay, at whichever end of it ran second.
This is the plan's own sentence coming true: *"a collision does not announce
itself."*

So the re-check before Ryan merges is not only about staleness. **It is also the
only thing standing between two correctly-numbered branches and a silently
dropped migration**, and it has to be a re-check of the *directory* and not just
of `origin/main`'s high-water mark.

Slice 1's number is **taken and real** — the file exists on this branch. The rest
stay provisional and are to be re-derived at PR time.

| slice | migration | status |
|---|---|---|
| 1 — the catalog read widens | `0182` | **merged and applied to production** |
| the library columns (revision 4) | **`0183`** | taken; file is in this PR, unapplied |
| 2 — the two ranking views | `0184` | provisional |
| 3 — the serve table and the setting | `0185` | provisional |
| 5 — the event kinds | `0186` | provisional |

**`main` is merged in, and stays merged in.** The branch rule is to merge at least
weekly and *always* before writing a migration — a number taken on a stale base
is the first defect above, and a migration authored on one replays against a
schema nobody is running. Both merges so far were clean, and `docs/WORK_LOG.md`
arrived byte-identical to `main`; its rows are never stashed or checked out over
(AGENTS.md, 9 November).

**But merging is not sufficient, and the fourth catch is why.** A clean merge is
silent about two files claiming one number. After every merge, check the
*directory* for a duplicated prefix — `ls supabase/migrations | cut -c1-4 | sort |
uniq -d` returns nothing when the chain is sound and names the collision when it
is not. That is a check which fails when it meets something, rather than one that
says nothing and reads as a pass.

| # | slice | what lands | why here |
|---|---|---|---|
| **0** | **Preview write guard** ✅ **built** | `lib/deploy-env.ts` → `refuseWriteOnPreview()`, reading `VERCEL_ENV` (read nowhere else in the codebase). `scripts/deploy-env-scenarios.ts` / `npm run test:deploy-env` — 19/19, and proved non-vacuous in both directions: neutering the throw fails 4 cases, throwing always fails 8. No caller yet, by design. | The branch constraint, by construction rather than by memory. No schema. First because everything after depends on it. |
| **1** | **The catalog read widens** — ruling H ✅ **built, `0182`** | `0182_a_manager_reads_the_op_code_catalog.sql`: `op_code_catalog_read` → `managed_rooftops()`, shaped on `0179`, two arms not three (the catalog has no owner column), `op_code_catalog_admin` asserted untouched. 0081's stale commentary corrected in place. `scripts/catalog-read-acceptance.ts` / `npm run accept:catalog-read` — 3 failing before the migration, 17/17 after. Not applied anywhere. | Its own slice and its own migration, per the ruling. Independent of everything else, and it was a live defect. |
| **2** | **Rooftop family ranking** | `rooftop_family_missed`, `manager_meeting_supply`. Read-only; serves nothing. | The metric, provable in isolation against the fixture before any row is written. Reuses the picker's views, floor and clamp. |
| **3** | **Serve table and the lock** | `manager_meeting_serve` (+ unique index on rooftop × week), `game_settings.manager_meeting_repeat_weeks int not null default 8` with a sanity CHECK. Schema only — no picker. | The pick in slice 4 needs somewhere to read history from. Splitting the table from the logic keeps both reviewable. |
| **4** | **The pick** — rulings A, B, C | `pick_manager_meeting()`: family walk by rank, least-recently-served film within a family, never-served first, ties by op code, fall through on a fully suppressed family, honest null with a reason. | Reads 2 and 3. The first slice with real decision logic, and the one with the most acceptance surface. |
| **5** | **Events** — ruling G | Three `app_event` kinds **and the matching lines in `lib/events/kinds.ts`**, none of them in `CLIENT_OPEN_KINDS`; 0163's non-vacuous test mirrored; one `served` row per manager, carrying a `dedup_key` per rooftop × week × manager. | Small, and (d) asks for it from day one. |
| **6** | **The screen** — ruling E | `/meetings/this-week`: the film, the family named, the family's attach rate by advisor. Reuses `lib/advisor.ts` and `lib/manager.ts`. | Needs 1, 2, 4. Driven as a fixture manager. |
| **7** | **The swap** | Server action; override trace on the serve row; the `swapped` event. Calls the slice-0 guard. | Needs 4–6. |
| **8** | **Follow-up** — ruling F | Before/after full periods, both months named, the waiting-on state. | Reported not required, so it comes after the screen works. |
| **9** | **The cron** — ruling I | `/api/cron/manager-meeting-serve`, `CRON_SECRET`, the Monday-and-store-date rule in a lib the way `lib/rollcall-schedule.ts` does it. **The `vercel.json` entry is requested, not committed** — see below. | **Last.** Vercel runs crons only on Production, so the entry is inert on Preview and live the moment the branch merges. Until it lands, serving is a manual admin action. |

**Slice 9 does not edit `vercel.json`.** Another branch has a pending one-line
schedule change to that same file, and a file with two editors at once is how
one of them quietly loses — the merge reports success and says nothing about
what it dropped. So slice 9 delivers the route, the secret check and the
schedule rule, and hands over the one line to add:

```json
{ "path": "/api/cron/manager-meeting-serve", "schedule": "0 13 * * 1" }
```

`0 13 * * 1` is Monday 07:00 Central in daylight time, 06:00 in winter — Vercel
crons are UTC and do not observe DST, which `app/api/cron/rollcall/route.ts`
already documents at length. The hour is deliberately loose because the decision
of *whether* it is Monday at that store is made in the route against the store's
own date, not by the cron expression: `30 22 * * 1` would put half the rule in
`vercel.json` and half in the code, which is two sources of truth about when a
meeting is served. Same reasoning the Rollcall post settled.

Dropped from revision 1: the op-code attach rate and store benchmark (ruling A),
and the `manager_pick_only` column (ruling D). The coverage measurement is no
longer a slice — ruling A makes it a finding in this document, built on by
nothing.

---

## Every place that needs a fixture — and what the boost library changes

**Superseded in part, 21 November.** This section used to open *"No Vol 4 film
exists, so no family has a manager film, so the pick's inner join returns nothing
for every rooftop — the `no_supply` reason is the correct answer for all eleven
rooftops today."* That was true when it was written and it is now false, which is
the better outcome and the reason this section is rewritten rather than annotated.

**Mitch's library gives the pick real supply.** 213 meetings are catalogued, 57
of them op-code boost meetings, and **every one of the 57 carries exactly one
catalog code that is present and `coachable = true`** — measured, see the loader
report. Those 57 codes fall into real families, so a rooftop whose weakest family
is Brakes or Fuel System now has something to be served.

Two things that have NOT changed, and both matter more than the supply:

- **Nothing is published.** The loader writes `status = 'draft'` with no Mux id,
  because the films are not shot — about 100 of the library is in the can and
  about 115 is still to come. Whatever the pick's supply view ends up filtering
  on, a draft row is not a servable film, so `no_supply` remains the correct
  answer in production until Ryan publishes.
- **`no_supply` therefore still needs its fixture.** It is now the *expected
  state while filming continues* rather than the permanent state, which makes it
  more important to test and not less: it is the reason a manager sees nothing on
  a Monday, and it must read as a normal state rather than a fault.

**The supply view must filter on `status`, and that is new work this discovers.**
`manager_meeting_supply` was specified as "families that have at least one
published manager film". With 213 draft rows in the table that word *published*
stops being decorative and becomes the whole of the gate — and it is exactly the
shape of condition this document has been caught by twice (an exclusion by value,
on a column that something else writes). Slice 2 asserts it with a draft fixture
that must NOT appear in supply.

1. **Manager films and their codes** — *rewritten 21 November.* The real library
   now exists, so this is no longer "invent some films". Two different fixtures
   are needed and conflating them is how a suite passes for the wrong reason:

   - **A published film, hand-built** (`type='manager_video'`,
     `placement='manager_meeting'`, `status='published'`, a `mux_playback_id`)
     plus its `manager_meeting_op_code` row, on a code whose family the fixture
     DMS feed measures. This is the only way to exercise a successful pick, and
     it stays a throwaway fixture precisely because no real film is publishable
     yet. *Slices 2, 4, 6–9.*
   - **A draft film from the real library**, left exactly as the loader wrote it,
     asserted to be **absent** from `manager_meeting_supply` and never picked.
     Without this the `status` filter above is a convention. *Slices 2, 4.*

   **Do not build fixtures by loading the real library into the test rooftop.**
   The loader is keyed on the classification line and `content` has no rooftop
   column, so the 213 rows are global — a suite that loaded them would be
   mutating the shared library to test a pick, and its teardown would be deleting
   rows somebody else's run depends on. The acceptance suite builds its own films
   and deletes them; the loader is exercised separately, by its own dry run.
2. **The DMS side** — `perf_period`, `advisor_op_metric` and `sub_category_map`
   rows giving two or more families a real spread across advisors, so one family
   genuinely outranks another. Extends the shape `focus-family-acceptance.ts`
   already builds. *Slices 2, 4.*
3. **Three or more advisors**, at least one below `min_ros_for_coaching()`, so
   the rooftop sum is a sum and item (e) proves "too thin" renders instead of a
   number. *Slices 2, 6.*
4. **Two or more films in the winning family, with different serve histories** —
   one never served, one served long ago, one served recently — to prove ruling
   B's ordering. Plus two films sharing an op code to force the tie-break.
   *Slice 4.*
5. **Backdated `manager_meeting_serve` rows** both inside and outside the N-week
   window, to prove the skip **and** prove a film outside the window is served
   again. The second is the half that gets skipped, and the half that catches a
   window computed in the wrong direction. *Slices 3, 4.*
6. **A family whose every film is suppressed**, with a lower-ranked family that
   has an eligible one, to prove the fall-through in ruling B actually falls
   rather than returning nothing. *Slice 4.*
7. **A film carrying two op codes** (0168 permits it), to prove ruling C: it
   suppresses only itself and not the other code's films. *Slice 4.*
8. **One case per no-pick reason** — five fixtures, so each reason is reached by
   the state it names rather than all five collapsing onto one code path.
   *Slice 4.*
9. **Two full periods and one partial** — the same family at different attach
   rates across two `perf_period` rows with `is_partial = false`, a serve row in
   the earlier, **plus** a case where the later period exists but is partial, to
   prove the screen names the month it is waiting on instead of reporting `0.0`.
   *Slice 8.*
10. **A manager who is only a manager** — `role = 'manager'`, no admin
    membership. Without it, ruling H's gate is tested in the one context where it
    cannot fail. *Slices 1, 6, 7.*
11. **A bought rooftop and an unbought one** — one with
    `rooftop_product('manager_meetings')` and one without, to prove the serve
    skips the store that has not bought it and records `not_entitled`. Both
    halves: a gate that refuses is not self-verifying. *Slices 4, 9.*
12. **Two or more candidate films outside the winning family**, plus one Vol 3
    stand-in with no op code, so there is something to swap *to* and the unmapped
    case is covered. *Slice 7.*

---

## What the rulings settled, and what is still open

**Settled.** A: family grain, summed across advisors; coverage measured as a
finding only. B: least-recently-served within the family, never-served first,
ties by op code, fall through, honest null with a reason. C: suppression per
film. D: item (c) withdrawn. E: the family's attach rate, family named, "attach
rate" kept. F: month over month, both named, "moved". G: one served event per
manager, `user_id` untouched. H: catalog read widened in its own slice. I: cron
last.

**Still open.**

0. **THE `service_family` HOLE IN `service_family_content` — the one with a
   deadline.** Listed first because it is the only open item that becomes a live
   defect through somebody else's ordinary work rather than through neglect.

   `service_family_content`'s family_tag arm is:

   ```sql
   select c.service_family as family, c.id, 'family_tag', true as coachable
     from content c
    where c.service_family is not null
      and coalesce(c.placement::text, '') <> 'reference'
   ```

   It excludes **one placement, by name**, and hardcodes `coachable`. So **any**
   manager film that acquires a `service_family` enters the view the advisor pitch
   slot reads, announcing itself coachable. 0168 guarded the `content.op_code`
   route into this view and its comment says why; **nobody guarded this arm**,
   because until the loader existed no manager film had ever carried a
   `service_family`.

   **Measured, both ways.** Writing the Topic there put 213 of 213 manager films
   into the view. Not writing it puts 0 there.

   **Who this is for:** whoever buckets `/meetings` browse by Topic — which
   adjustment 5 asks for, so it is scheduled work and not hypothetical. That
   slice cannot simply set `service_family`; it must either close this arm first
   or carry the topic somewhere else.

   **The shape of the fix, if it is taken here:** exclude on `type`, not on
   another placement name. `content.type` is `not null`, so `type <>
   'manager_video'` cannot be forgotten by a row that takes a default — whereas a
   second placement name in the exclusion list is one more value somebody must
   remember to add, which is the defect this arm already has.

   **Not done on this branch, deliberately.** It is a change to the view the
   advisor daily loop reads, this branch's standing rule is to reproduce the
   picker rather than improve it, and nothing here needs it because the loader
   does not write the column. Recorded so the next person meets the question
   before the rows meet the advisors.

   **One thing I could not check from here, and it matters.** The adjustments doc
   says `content.service_family` *"carries the topic today"*. If the 17 Bank
   Account films already have it set in **production**, they are already in
   `service_family_content` and this is a live defect rather than a future one.
   The local stack carries no `manager_video` rows and this branch has no
   production credentials, so it is unmeasured. **One query answers it:**
   `select count(*) from content where type = 'manager_video' and service_family
   is not null;`


1. **The coverage measurement has not been run.** It needs a service-role key
   placed in `~/ediagd-manager/.env.local`, or you running the two queries above
   against Preview. Nothing in this plan waits on it.

   **The staging database will not answer it.** The question is what share of the
   *real* Doggett feed is bridged, so it has to be asked of production data —
   which is exactly why the read is read-only and why it is the one thing this
   branch wants from Preview.

   **Re-checked for revision 3 and still true:** there is no `.env.local` in
   `~/ediagd-manager`, so the blocker has not moved. Recorded rather than left to
   be assumed, because "still blocked" and "nobody looked again" read identically
   in a document.
2. **`coachable = false` and manager films.** The supply view keeps
   `family_pitch_supply`'s filter, so the 13 codes 0066 marks *"map for
   reporting but never coach"* cannot supply a manager meeting. Right by
   default; wrong the day Mitch films a menu bundle. Mitch's or your call.
3. **`advisor_family_attach` is not epoch-aware and `advisor_family_attach_all`
   is.** The picker pairs them that way and this branch reproduces the pairing
   rather than fixing it, so the manager meeting and the advisor's pitch cannot
   disagree. Worth its own task, and it is a change to the daily loop rather
   than to this branch.

---

## What revision 3 checked, by what means, and what it did not

Scope before finding. Everything below was read from **git objects on
`origin/main` at `c1f3b4b`** — `git show origin/main:<path>` in this worktree. No
database was queried, nothing was applied, replayed or seeded, no cron was run,
and nothing was written from a Preview deploy. No other checkout was touched.

**Confirmed unchanged on `main`, so the plan's claims still hold:**

| claim | how checked |
|---|---|
| `op_code_catalog_read` still gates on `admin_rooftops()` | 0081 is the latest definition; only 0062 and 0081 mention the policy |
| `admin_rooftops()` still excludes `manager` | 0045 body read |
| `VERCEL_ENV` is read nowhere — slice 0's premise | `git grep VERCEL_ENV` over `origin/main`: no hits |
| `vercel.json` is byte-identical on `main` and this branch | both blobs printed and compared; two crons, neither one ours |
| `APP_EVENT_KINDS` still has seven values | `lib/events/kinds.ts`, unchanged since the merge base |
| `lib/advisor.ts`, `lib/manager.ts`, `app/meetings`, `scripts/focus-family-acceptance.ts` | `git diff --name-only` across the 22 commits: **zero changes to any of them** |

**Found changed, and folded in above:** the migration high-water mark
(`0179`), `0179` itself as ruling H's precedent, `0178`'s RLS measurement,
`app_event.dedup_key`, the `lib/events/kinds.ts` requirement, the
`group_manager` consequence of `managed_rooftops()`, and
`check:entitlement-parity` now running inside `db:migrate`.

**Not checked, and therefore not claimed.** The `dms_op_code_map` coverage
numbers (open question 1 — no credentials here). Whether the four provisional
migration numbers are free *at PR time* — by construction that cannot be settled
in advance, which is the point of the re-check. And nothing in this document has
been exercised against a running database: every slice's acceptance is still
future work, and a plan that reads correctly is not evidence that the SQL in it
runs.
