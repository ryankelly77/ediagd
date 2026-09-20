# 0123 — applied to production

*19 September 2026, 20:30 CT. `0123_two_ladders_spine.sql` is on production.
0124 and 0125 are **not**. Stopping here for your read.*

---

## What was done

```
supabase db dump --linked -f backups/pre-0123-schema.sql     476 KB
  verified: contains has_performance_surface (8), contains advisor_focus_family (0)

0124 and 0125 moved out of supabase/migrations/ before the push
  — `db push` applies every pending migration, and "one at a time" has to be
    enforced rather than intended. Restored immediately afterwards.

supabase db push --linked
  Applying migration 0123_two_ladders_spine.sql...
  {"migrations":["0123_two_ladders_spine.sql"]}
```

`supabase migration list` confirmed only 0123 was pending at push time. Both held
files are back in place — verified in the same command, not assumed.

---

## The check

**`select count(*) from family_store_benchmark` as the service role.**

| | Result |
|---|---|
| **Before** (measured this morning, pre-migration) | `status 200`, **0 rows** |
| **After** | `HTTP 206`, `content-range: 0-0/**3833**` |

```
first row: [{"family":"Alignment"}]
```

**3,833 rows where there were none.** This is the bug 0123 §0 exists to fix, and
the one that stayed invisible for thirty migrations: `has_performance_surface()`
keyed on `auth.uid()`, the service role has no JWT, and so every server-side read
of the store benchmark returned a *200 with nothing in it*. A confident empty.

`derive_focus_family` reads that view. Without this it would have returned null
for every advisor, forever, while the migration applied cleanly and every suite
stayed green.

### Supporting checks

| Relation | Before | After |
|---|---|---|
| `advisor_focus_family` | PGRST205 — does not exist | **HTTP 200** |
| `advisor_track_entry` | PGRST205 | **HTTP 200** |
| `family_pitch_supply` | PGRST205 | **HTTP 200** |

`has_performance_surface()` called as the service role returns **`true`** — the
`bypasses_rls()` clause is live.

### One thing I could not verify on production, stated rather than implied

**That a technician still sees zero benchmark rows.** That is the other half of
0123 §0 — the clause had to open for the backend *without* opening for the role
0096 deliberately excluded. Verifying it on production needs a technician's JWT,
and the one technician account is a real person's.

It is asserted in `accept:focus-family` against local ("a technician still sees
no benchmark", and it goes red if the clause is widened too far), and the SQL
applied here is byte-identical to the SQL that assertion runs against. That is
evidence, but it is local evidence, and I am not going to call it a production
check when it is not one.

---

## What did not change

No data was written. 0123 creates tables, a view and two functions, and amends
one function; it touches no existing row. `advisor_focus_family` and
`advisor_track_entry` are both empty, which is correct — nothing derives an
assignment until 0124 gives the loop something to call.

The four advisor accounts see no difference today: `/today` still runs the
pre-3b five-step loop, because the code that reads any of this is not deployed
and 0124 is not applied.

---

## Next

**0124 on your go.** It carries the floor, and applying it is the first moment
production behaviour changes for a real advisor — the loop's shape, and Mitch
dropping to a two-slot morning.

It also **writes data**: 0124 §2 closes every open `coaching_block` (two rows in
production). That is required — `completeDay` asserts the day's stamp and the
open block agree, so a block left open refuses every new-shape morning — but it
is a real change to two real people's history and worth naming before it runs.
I will take a data dump of `coaching_block` alongside the schema dump for that
one.

```
$ git status -sb
## main...origin/main
 M .gitignore
 M AGENTS.md
 M app/(app)/advisor/page.tsx
 M app/(app)/today/page.tsx
 M components/advisor/PitchButton.tsx
 M components/advisor/PitchDialog.tsx
 M components/advisor/ServiceList.tsx
 M components/daily/DailyFlow.tsx
 M lib/daily.ts
 M lib/day-stamp.ts
 M lib/gamification/completeDay.ts
 M lib/library-actions.ts
 M lib/lms.ts
 M lib/navigation.ts
 M package.json
 M scripts/brakes-acceptance.ts
 M scripts/check-admin-nav.ts
 M scripts/day-ticket-scenarios.ts
?? PHASE_3_PLAN.md
?? TWO_LADDERS.md
?? app/(app)/service/
?? components/advisor/FocusFamilyCard.tsx
?? components/advisor/ServiceShelf.tsx
?? components/daily/RooftopNotReady.tsx
?? data/File.png
?? lib/entitlement.ts
?? lib/gamification/dayGate.ts
?? lib/loop-preview.ts
?? lib/loop.ts
?? lib/pg-composite.ts
?? lib/service-family.ts
?? reports/
?? scripts/family-acceptance.ts
?? scripts/focus-family-acceptance.ts
?? scripts/loop-acceptance.ts
?? scripts/loop-screenshot-fixture.ts
?? scripts/tsconfig.family.json
?? scripts/tsconfig.focusfamily.json
?? scripts/tsconfig.loop.json
?? scripts/tsconfig.shotfixture.json
?? supabase/migrations/0123_two_ladders_spine.sql
?? supabase/migrations/0124_two_ladders_loop.sql
?? supabase/migrations/0125_one_resolved_family.sql
```

No ahead count. Nothing committed. `backups/` is gitignored, so the dump does
not appear above.
