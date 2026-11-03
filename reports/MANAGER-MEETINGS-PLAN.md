# Manager Meetings — the plan

Mapping the spec onto the schema and code as they stand on `main` at `c94e835`.
No feature code written. Read against `MANAGER_MEETINGS.md` for the branch rules
and the Preview constraint.

---

## The one finding that changes the shape of the work

**The pitch picker ranks service families. The spec ranks op codes. Those are
not the same grain, and the schema cannot currently join them.**

| | key | where it lives |
|---|---|---|
| DMS performance | **dealer** op code (`'13D'`, `'QL20D'`) → resolved to a **family** | `advisor_op_metric.op_code` → `service_line.op_code` |
| Films, advisor | **EDIAGD catalog** code (`'OF-008'`) | `content.op_code` → `op_code_catalog.code` |
| Films, manager | **EDIAGD catalog** code | `manager_meeting_op_code.op_code` (0168) |
| The bridge | dealer code → catalog code, **per rooftop** | `dms_op_code_map` (0093) |

`derive_focus_family()` ranks families precisely because the family is the only
grain the two sides share today. `advisor_op_metric` resolves a line as far as
`resolved_family`, then stops; there is no canonical op code on the metric grain,
and **no op-code-grain attach rate exists anywhere in the schema.**

So op-code ranking is reachable only through `dms_op_code_map`, and the usable
fraction of the feed is exactly its coverage. That number is unmeasured here and
is the gate on whether item (a) is buildable as written — which is why slice 1
measures and builds nothing.

`dms_op_code_map` is also **platform-owner-only** (0093), so the bridge is
invisible to managers and to admins. Any ranking that crosses it has to run as a
definer function or as the service role, the way `derive_focus_family` already
does.

---

## The second finding: the gate excludes the viewer it is built for

This is live in the schema right now, before a line of this feature exists.

`op_code_catalog_read` and `op_code_family_read` (0081) both gate on:

```sql
(select is_platform_owner()) or exists (select 1 from admin_rooftops())
```

and `admin_rooftops()` (0045) is platform owner, `role = 'admin'`, and the
`group_owner` org role. **`manager` is not on that list.**

So the meeting screen — the screen whose entire audience is managers — cannot
read the op code's own **name**. A manager querying `op_code_catalog` gets zero
rows and no error. `manager_meeting_op_code`'s own policy (0168) does include
manager and admin, so the association is readable while the thing it points at
is not.

This is the sub-pattern AGENTS.md says has earned its own name, for the fourth
time: `has_performance_surface()`, `op_code_family` in `pickPitch`,
`dms_advisor_read` on `/advisor`, and now this.

**Naming the roles that will really call the meeting screen:**

| role | `op_code_catalog` | `op_code_family` | `dms_op_code_map` | `advisor_op_metric` | `family_store_benchmark` | `manager_meeting_op_code` |
|---|---|---|---|---|---|---|
| platform owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **manager** | **❌** | **❌** | ❌ | ✅ | ✅ | ✅ |
| advisor | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| technician | ❌ | ❌ | ❌ | ✅ | ❌ (0096) | ❌ |
| service_role | ✅ | ✅ | ✅ | ✅ | ✅ (0123) | ✅ |

**The fix is to widen `op_code_catalog_read` to `managed_rooftops()`**, not to
copy the name onto the serve row. The catalog holds a code, a name, a category
and piggyback notes — reference data, no per-store numbers, so a manager reading
it discloses nothing. A denormalised name on the serve row would be a second
definition of what a code is called, and it would drift. `op_code_family` and
`dms_op_code_map` stay exactly as they are; the definer function reads them.

**There is a trap in verifying this.** Beaumont's two managers may well hold
`admin` as well as `manager`. An acceptance suite that signs in as them and
passes would have tested the one context in which the gate cannot fail. The
suite signs in as a fixture user holding **`role = 'manager'` and nothing else.**

---

## What already exists

Considerably more than expected. 0168 and 0169 did the hard structural work.

- **`manager_meeting_op_code`** (0168) — `content_id` → `op_code_catalog.code`,
  with `origin in ('manifest','manual')` so a hand correction is distinguishable
  from a pipeline one. Deliberately **not** unique on `op_code`: Vol 5 may coach
  the same code again. RLS includes manager and admin. Deliberately **not**
  `content.op_code`, because `service_family_content` excludes only
  `placement = 'reference'` by name and a manager film carrying an op code would
  enter the view the advisor pitch slot reads.
- **`placement = 'manager_meeting'`** (0168) on the enum, and (0169) backfilled
  onto all 17 Vol 3 films with a null-safe CHECK — `IS NOT DISTINCT FROM`,
  because `placement = 'manager_meeting'` evaluates to NULL for a NULL and a
  CHECK passes on NULL. Every advisor picker selects by positive equality, so a
  manager film cannot be drawn by any of them.
- **The ranking**, `derive_focus_family()` (0123):
  `missed_ros = greatest(store_avg_pct − attach_rate_pct, 0) / 100 × advisor_ros`,
  tie-broken by `opportunity` (`missed_ros × labor_per_ro`) then by name for
  determinism. Clamped at zero so being ahead of the store is not a negative
  opportunity. Inner-joined to supply so a family with no film is not a
  candidate however large its gap.
- **The lock precedent**, `advisor_focus_family`: an open row with `ended_on`
  null, `source in ('derived','manager')`, and a manager ruling that the
  derivation will not overwrite.
- **`min_ros_for_coaching()` = 20**, and the departed-advisor exclusion in
  `family_store_benchmark` (0096). Both reused, never restated — 0123 says why:
  a store average that can disagree with the one on the advisor's own screen is
  worse than no derivation at all.
- **`has_performance_surface()`** (0096, repaired 0123) — manager **is**
  included, and `bypasses_rls()` lets the backend through. Nothing to fix here.
- **`app_event`** (0163) — `kind` CHECK over seven known values, service-role
  the only writer, `managed_rooftops()` read, advisor reads nothing. 0163 also
  asserts its own constraint is not vacuous.
- **`/meetings`** — browse by topic, `type = 'manager_video'`, behind
  `checkEntitlement(…, ["manager"], "manager_meetings")`. **Never reads
  `placement`**, so 0169 left it untouched. In `check:nav`'s `WATCHED` list, so
  routes beneath it are checked for reachability.
- **Impact** (0029/0032/0033) — `impact_rollup` carries `attach_rate_pct`,
  `prev_attach_rate_pct`, `delta_pts` per advisor × family × period. Prior art
  for item (f), at the wrong grain.
- **`game_settings`** — single row, columns added by `alter table`, with
  `coaching_block_days_sane` as the sanity-constraint precedent.
- **"Attach rate"** is already the standing word on `/advisor`, `/manager`,
  `/admin/impact`, `/admin/dms` and the dealer-codes screens. Item (e) needs no
  new vocabulary, only consistency with what is there.
- **`scripts/focus-family-acceptance.ts`** — creates a throwaway rooftop, auth
  users, period, DMS metrics, op codes and films; exercises each path as the
  role that will really call it; deletes it all; refuses a non-localhost
  `SB_URL`. Exactly the harness the Preview constraint requires.

**Entitlement reality:** `manager_meetings` is active for **one** rooftop —
Doggett Ford of Beaumont (0164) — and two managers. Everything below serves one
store on day one. The serve is therefore gated on `rooftop_product`, so turning
the product on for a store is what starts its Mondays. Never a list of rooftop
ids.

---

## Item by item

### (a) Weekly pick per rooftop

**Exists:** the ranking formula and all of its inputs; the lock pattern;
`manager_meeting_op_code`.

**Two grain changes, and they are different problems.**

**1. Advisor → rooftop.** `missed_ros` is a per-advisor quantity measured against
the rooftop's *own* average. Re-deriving the formula at rooftop grain yields zero
by construction — store average minus store average. The only aggregation that
reuses the picker's metric rather than inventing a second one is to **sum the
per-advisor `missed_ros` across the rooftop's advisors**: "how many ROs the
below-average half of this drive is missing on this op code." Same numerator,
same clamp, same floor; one grain up. That is a defensible manager-meeting
metric, and it is a **decision that needs Ryan's yes** rather than something to
slip in under "the same ranking".

**2. Family → op code.** The blocker above. Gated on slice 1's measurement.

**New:**
- `advisor_op_code_attach` — view, attach rate per advisor × catalog op code ×
  period, through `dms_op_code_map`. Reuses `min_ros_for_coaching()` and the
  departed-advisor exclusion.
- `op_code_store_benchmark` — view, the store average and best at op-code grain.
  Role-scoped by `has_performance_surface()`, tenancy-scoped the way
  `family_store_benchmark` is.
- `manager_pick_supply` — view, catalog codes with a published manager film,
  mirroring `family_pitch_supply`. Inner-joined by the pick, so a code with no
  film cannot be served however large its gap.
- `rank_manager_meeting_op_codes(_rooftop uuid, _period uuid)` — definer, no
  grants, returning the ranked candidates. Reads the platform-owner-only bridge,
  which is why it is a definer.
- `manager_meeting_serve` — the lock. See (b).

### (b) Skip anything served in the last N weeks

**Exists:** `game_settings` and its constraint precedent.

**New:** `game_settings.manager_meeting_repeat_weeks int not null default 8`,
plus a sanity CHECK. The suppression lives inside the pick, reading
`manager_meeting_serve`.

**Two things to get right.**

The spec suppresses a **film**; the pick selects an **op code**. 0168
deliberately allows one film to carry several codes, so suppressing a film can
remove more than one candidate. Correct, and worth saying out loud on the screen
when it happens.

If suppression empties the candidate list, **serve nothing and say so.** Never
fall back to a repeat, and never serve the most-recently-shown film because it
sorted first. That is `derive_focus_family`'s honest null, and the acceptance
half that will get skipped is the one proving a film **outside** the window is
served again — which is the half that catches a window computed in the wrong
direction.

### (c) The five codes are manager-pick only

**Exists:** nothing that distinguishes them. BTT-035, TPS-050, WWF-016, OF-008
and BCS-032 are all in `op_code_catalog`, all in `data/op_code_family_map.csv`
with a family, and all marked `coachable = true` — two at `ruled` confidence and
three at `high`.

**New, and it is deliberately both mechanisms, because they answer different
questions:**

- **By construction:** a code with no mapped DMS volume produces no ranking row
  and so cannot be picked. Free and self-maintaining.
- **By value:** `op_code_catalog.manager_pick_only boolean not null default
  false`, set for the five by name in the migration. `not null default false`
  means no row can decline to carry it — AGENTS.md's rule that an exclusion by
  value is only as strong as the guarantee the column is written.

The structural exclusion is what works today. The column records the **ruling**,
so that if the mapping later acquires BTT-035, the code does not silently become
auto-pickable without somebody deciding that it should. Construction alone would
let a mapping change rewrite a policy.

**A question for Ryan:** "not in the DMS feed" is stated as a global fact, but
`dms_op_code_map` is **per rooftop**. Is this five-code list a property of the
Doggett feed, or of every feed we expect to meet? Slice 1 measures which it is.

### (d) Swap, and served / watched / swapped as events

**Exists:** `app_event` and its non-vacuous constraint test (0163).
`content_progress` as the format-agnostic consumption record — and memory worth
repeating: `content_progress.source` is last-writer-wins and says which surface
touched the row *last*, not which finished it. `app_event` is the append-only
answer.

**New:** three kinds on the CHECK constraint — `manager_meeting_served`,
`manager_meeting_watched`, `manager_meeting_swapped` — with 0163's
constraint-is-not-vacuous assertion mirrored.

**One real obstacle.** `app_event.user_id` is `not null references app_user(id)`.
The Monday serve is a **rooftop-level act by a cron**; it has no user. Two ways
out, and the recommendation matters:

- ✅ **Write one `served` event per manager at serve time.** The cron knows the
  rooftop's managers from `membership`, so it writes one row each. `user_id`
  stays honestly not-null, and served/watched pair up per person — which is what
  an engagement funnel needs anyway.
- ❌ Relax `user_id` to nullable. It weakens an invariant every existing reader
  of the table holds, to serve one kind.

The authoritative "this was served" fact is the `manager_meeting_serve` row, not
the events. The events are the engagement record.

**The swap leaves a trace in the row, not only in an event.** AGENTS.md's hold/
override rule: a correct automatic pick that a manager overrides must be
recoverable afterwards, or a swapped week and a week nobody touched look
identical. So the serve row carries `source`, `overridden_from_content_id`,
`swapped_at` and `swapped_by` — a manager swapping is legitimate and often
right; what must not happen is it leaving no record.

### (e) The meeting screen

**Exists:** the entitlement check; "Attach rate" as the standing word;
`lib/manager.ts`, which keys the roster on `advisor_op_id` and falls back to the
op code when the name is unreadable — the never-identify-by-name rule already
honoured.

**New:** `/meetings/this-week` (inside the watched `meetings` tree, so
`check:nav` covers it), a loader, and the `op_code_catalog_read` widening from
the second finding. Attach rate by advisor comes from
`advisor_op_code_attach` — manager-readable, floored at
`min_ros_for_coaching()`, with "too thin to judge" rendered rather than a
number, the way `/manager` already handles `hasVolume`.

Exercised as a fixture user holding `manager` and nothing else.

### (f) Four weeks later, the attach rate change

**Exists:** `impact_rollup`, `admin_impact_rooftop`, `impact_settings` and
`ImpactV2` — the same quantity in percentage points, at advisor × family ×
**month** grain.

**The spec and the schema disagree, and AGENTS.md says report it rather than
pick one.** Attach rate exists only per `perf_period`, and a period is a
**month** (`label` 'June 2026', `is_partial` when the source stops early). "Four
weeks after the meeting" is not expressible. The nearest honest measurement is
*the first period starting after the meeting week, compared with the period
containing it* — so the screen must name the two months it compared rather than
print "4 weeks".

And it can only be reported once that later month's DMS has landed. Until then
the screen says **not yet measurable**, never `0.0`. A sync in this very area
already reported a cursor it was not resuming from and announced success with
ten months missing; a zero here would be the same confident wrong answer.

"Reported, not required" is taken literally: this never gates serving, never
blocks the screen, and its absence is not an error.

### (g) The 17 Vol 3 films

**Exists: all of it. Nothing to build.**

The Manager Bank Account series — an introduction, eight deposits, seven
withdrawals and an outro — is `type = 'manager_video'`, now
`placement = 'manager_meeting'` (0169), and carries no op code. The pick
inner-joins `manager_meeting_op_code`, so **a film with no row there cannot be
auto-picked, by construction** — no condition for anyone to remember.

Browsing is untouched: `listManagerTopics` and `loadManagerVideos` select on
`type = 'manager_video'` and have never read `placement`.

One consequence to state rather than discover: (d) says a manager may swap to
*any other manager film*, so a Vol 3 film is a legitimate swap target. It cannot
be picked and it can be chosen, which is the right asymmetry.

---

## Build order

Each slice is reviewable alone. Migrations are authored and replayed locally and
renumbered at merge; nothing is applied from this branch.

| # | slice | shape | why here |
|---|---|---|---|
| **0** | **Preview write guard** | `lib/deploy-env.ts` → `refuseWriteOnPreview()`, reading `VERCEL_ENV` (read nowhere today). Every write path added later calls it. | The constraint, by construction. No schema. First because everything after it depends on it. |
| **1** | **Measure, build nothing** | `report:manager-pick-coverage`, read-only, run against Preview. | Decides whether (a) is buildable as specified. See below. |
| **2** | **Op-code attach rate, read side** | `advisor_op_code_attach`, `op_code_store_benchmark`; widen `op_code_catalog_read` to `managed_rooftops()`. | Fixes and proves the gate finding. Four roles, refusals asserted. |
| **3** | **The pick, serving nothing** | `rank_manager_meeting_op_codes()`, `manager_pick_supply`. | Ranking provable in isolation, before any row is written. |
| **4** | **Serve table and the lock** | `manager_meeting_serve`; `game_settings.manager_meeting_repeat_weeks`; suppression inside the pick. | First write path. Both halves of N weeks. |
| **5** | **Events** | three `app_event` kinds + the non-vacuous test. | Small, and (d) says from day one. |
| **6** | **The screen** | `/meetings/this-week`, read-only. | Needs 2–4. Driven as a manager. |
| **7** | **The swap** | server action; override trace on the row; the event. | Needs 4–6. |
| **8** | **Four-week change** | two periods compared, months named, "not yet measurable". | Reported, not required — so it comes after the screen works. |
| **9** | **The cron** | `/api/cron/manager-meeting-serve`, `CRON_SECRET`, the Monday/store-date rule in a lib the way `lib/rollcall-schedule.ts` does it, and the `vercel.json` entry. | **Last.** Vercel runs crons only on Production, so the entry is inert on Preview and live the moment it merges. Until it lands, serving is a manual admin action. |

### What slice 1 has to answer

Read-only, two paths reconciled, scope stated before the finding:

1. Per rooftop, how many `op_code_catalog` codes have **mapped** DMS volume via
   `dms_op_code_map` — and what share of ROs and of labor dollars that mapping
   covers. Counted both from the map and from the raw feed, because a
   path-scoped count stated as a fact about the subject is a mistake this
   project has already made four times.
2. Whether the five named codes are absent from **every** feed or only
   Doggett's.
3. How many Beaumont advisors clear `min_ros_for_coaching()` in the latest
   period — item (e) renders nothing useful below it.
4. How many catalog codes could have both a manager film and rankable volume, if
   Vol 4 covered them.

**If coverage is too thin, (a) is not buildable as specified, and that is the
finding rather than something to work around.** The fallback worth pricing in
that case is to rank **families** exactly as the pitch picker does, aggregate to
the rooftop, and pick the manager film whose op code sits in the winning family
— one metric, one grain, and the mapping stops being load-bearing. It is a
different product decision and would be Ryan's to make.

---

## Every place that needs a fixture, because Vol 4 is not filmed

No Vol 4 film exists, so **no op code has a manager film, so the pick's inner
join returns nothing for every rooftop.** Every slice from 3 onward is
untestable without fixtures. All of them local, created and deleted by the same
script.

1. **Manager films and their codes** — throwaway `content` rows
   (`type='manager_video'`, `placement='manager_meeting'`, `status='published'`,
   a `mux_playback_id`) plus `manager_meeting_op_code` rows pointing at catalog
   codes the fixture feed actually carries. *Slices 3–9.*
2. **The DMS side at op-code grain** — `perf_period`, `advisor_op_metric` and
   `dms_op_code_map` rows so a catalog code has mapped volume with a real spread
   across advisors. Extends the shape `focus-family-acceptance.ts` already
   builds. *Slices 2–4.*
3. **Repeat-suppression history** — backdated `manager_meeting_serve` rows both
   inside and outside the N-week window, to prove the skip **and** prove a film
   outside the window is served again. The second is the half that gets skipped
   and the half that catches a window computed backwards. *Slice 4.*
4. **A manager-pick-only code with volume** — one of the five given mapped
   volume large enough to rank first, to prove it is still not auto-picked; and
   an ordinary code in the same fixture that **is** picked, so the test cannot
   pass by refusing everything. *Slice 4.*
5. **Two periods for the four-week change** — the same op code at different
   attach rates across two `perf_period` rows with a serve row in the earlier,
   **plus** a third case with no later period at all, asserting "not yet
   measurable" rather than `0.0`. *Slice 8.*
6. **Three or more advisors at the throwaway rooftop**, at least one below
   `min_ros_for_coaching()`, so item (e) proves "too thin" renders instead of a
   number. *Slices 2, 6.*
7. **Two or more candidate films** so there is something to swap *to*, plus one
   film with no op code (a Vol 3 stand-in) to prove swapping to an unmapped film
   works. *Slice 7.*
8. **A manager who is only a manager** — `role = 'manager'`, no admin
   membership. Without this the `op_code_catalog` gate is tested in the one
   context where it cannot fail. *Slices 2, 6, 7.*
9. **A bought rooftop and an unbought one** — one with
   `rooftop_product('manager_meetings')` and one without, to prove the serve
   skips the store that has not bought it. Both halves; a gate that refuses is
   not self-verifying. *Slices 4, 9.*

---

## Open questions, and the places the spec and the schema disagree

1. **"The same ranking, aggregated to the rooftop"** — read as *sum the
   per-advisor `missed_ros` over the rooftop's advisors*. Re-deriving the formula
   at rooftop grain gives zero by construction. Needs a yes.
2. **Op-code grain is not reachable from the DMS** except through
   `dms_op_code_map`, whose coverage is the gate on (a). Slice 1 measures it;
   the family-grain fallback is priced above.
3. **"Four weeks after" cannot be four weeks.** Attach rate exists only per
   monthly `perf_period`. Month-over-month, with the two months named, is the
   nearest honest measurement.
4. **Are the five codes absent from every feed, or only Doggett's?**
   `dms_op_code_map` is per rooftop; the spec states the list globally.
5. **Suppression is per film, the pick is per op code**, and 0168 deliberately
   lets one film carry several codes — so one suppressed film can remove more
   than one candidate.
6. **`op_code_catalog_read` must widen to `managed_rooftops()`** or the screen's
   own audience cannot read the name of the thing it is about. Recommended over
   denormalising the name onto the serve row.
