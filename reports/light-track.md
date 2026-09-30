# The light track: no pitch until the numbers can carry one

*30 September 2026. Migration 0147 plus lib and UI; branch `light-track`.
Ryan confirms the floor numbers below before the migration is applied.*

## The floor, proposed from the measurement

Two conditions, both required, measured in the **rooftop's latest complete
period** (not partial, not superseded):

1. **Total ROs ≥ `min_ros_for_coaching()` = 20.** Not a new number — 0053 owns
   it and the derivation already filtered on it; 0147 makes the refusal
   recorded instead of silent. The RO distribution breaks naturally at exactly
   this line: 21 above, 19 below, no operator at 20.
2. **At least one stocked family (`family_pitch_supply`) with `fam_ros` ≥
   `min_fam_ros_for_pitch()` = 5** — new `game_settings` column + function,
   same one-owner pattern. 5 is TWO_LADDERS' own 2026-09-23 measurement of
   where attach stops being noise (median CV 0.65 at 0–2 ROs vs 0.10 at 50+).

**Why the rooftop's period, not the operator's:** the derivation ranks in the
operator's newest attach period, which for a dormant book is months old — op
626 (last traded January) would derive a confident pitch from an eight-month-
old period today, and that dormant operator is exactly what a mis-mapped
account reads (F2). Against the rooftop's latest period, an absent book reads
as 0 ROs: light.

## Where the known cases land

| person / account | op | total ROs | days | best stocked fam_ros | side |
|---|---|---|---|---|---|
| Abate | 902050 | 140 | 23 | 47 | pitch |
| Booker | 274 | 136 | 25 | 61 | pitch |
| Patterson | 500570 | 41 | 20 | 16 | pitch |
| **Upshaw** | 710 | 24 | 10 | 13 | **pitch** — the roster called him thin; the measurement disagrees, by 4 ROs over the floor |
| Martin | 747 | 6 | 1 | 2 | light |
| Anthony | 623 | 4 | 2 | 1 | light |
| Tiner/Pinder | 500573 | 0 in any complete period since May (1 RO there) | — | 0 | light |
| app 78929620 | 35122 | 98 | 22 | 22 | pitch |
| app 921e2537 | 400025 | 82 | 22 | 32 | pitch |
| app c5e6ee88 | 671 | 56 | 18 | 15 | pitch |
| app 645a4739 | 626 | 0 in the latest period (dormant since January) | — | 0 | light |

**Population: 73 operators with rows in the latest complete period (August
2026) across the eleven Doggett rooftops. 54 pitch, 19 light.** The full
73-row table is at the bottom. Ryan confirms; the floor values live in
`game_settings` and move without a migration.

## The rule as built (0147)

- `derive_focus_family` measures the floor before ranking. Below it, a row:
  `source = 'light'`, `family` NULL, `note` naming both measurements against
  both floors — e.g. *"light: 6 ROs in the latest complete period (floor 20);
  best stocked family 2 ROs (floor 5)"*. Never a silent null; check
  constraints make the half-states unrepresentable (a light row must carry a
  note and no family; nothing else may omit a family).
- `advance_focus_family` returns a light row untouched until the rooftop's
  latest complete period **changes**, then ends it and re-derives — the
  advisor crosses out on the first period that clears the floor, never
  sooner, never by hand. History keeps every crossing.
- No op code: `return null` exactly as before — missing mapping and thin data
  stay distinguishable.
- `source = 'manager'` is exempt before any measurement.
- The loop needed no change: a light row's null family assembles the same
  two-slot morning through the existing `compositeOrNull` guard.

## The three surfaces, each checked as its viewer

| surface | viewer | what renders | policy that decides |
|---|---|---|---|
| `/advisor` (and `/certifications`) | the advisor | "Your coaching pitch starts when your repair orders come in." — one line where the pitch family would be named; never a number, never "not enough data" | `advisor_focus_family` self-read |
| manager team roster | the manager | a quiet "Light" chip beside the name, with the sentence as its title text | the `managed_users()` arm |
| `/admin/engagement` | the admin | " · light" on the advisor's detail line | admin memberships sit inside `managed_rooftops()`, so the same arm |

The advisor line renders only on a live light row, so it can never appear
beside a derived family — asserted, not assumed.

## Files changed

`supabase/migrations/0147_the_light_track.sql` · `lib/service-family.ts`
(`loadLightMode`, `loadLightUsers`) · `lib/manager.ts` (AdvisorSummary.light) ·
`app/(app)/advisor/page.tsx` · `app/(app)/certifications/page.tsx` ·
`app/(app)/manager/page.tsx` · `components/manager/TeamRoster.tsx` ·
`app/(app)/admin/engagement/page.tsx` · `scripts/light-track-acceptance.ts`.

## Proven as the viewer — 14 passed, 0 failed

`npm run accept:light-track`, local restore of the production dump, over
PostgREST as `authenticated` by id (test account repointed onto Martin's
operator 747, restored after):

```
ok  thin advisor (op 747): the light morning is the two-slot morning
ok  the light row is recorded and the ADVISOR reads it over PostgREST
ok  the reason names both measurements against both floors
    ("light: 6 ROs in the latest complete period (floor 20);
      best stocked family 2 ROs (floor 5)")
ok  loadLightMode is true for the thin advisor — the copy line renders
ok  real advisor (op 400025): three slots, family "Belts & Cooling"
ok  loadLightMode is false for a derived advisor
ok  the first period that clears the floor re-derives: pitch on, "Filters"
ok  the crossing is history, not an overwrite: light ended, derived active
ok  loadLightMode turns itself off — nobody touched a setting
ok  manager override on a thin advisor produces a pitch regardless
ok  an overridden advisor is not light — the ruling stands
ok  no op code: two slots and NO assignment, exactly as today
ok  no light row is written for missing mapping
ok  loadLightUsers marks neither the unmapped nor the derived advisor
```

One scope note: the manager roster is built from operators with period data,
so an advisor with zero DMS rows (Pinder pre-mapping, Sztaba) is not on that
roster at all — a pre-existing shape, named here rather than silently
extended.

## The full measurement (latest complete period, August 2026)

| op | rooftop | total ROs | days | best stocked | side |
|---|---|---|---|---|---|
| 901770 | Doggett Toyota of Beaumont | 249 | 21 | 107 | pitch |
| 175569 | Doggett Honda of Beaumont | 224 | 24 | 38 | pitch |
| 500658 | Doggett Toyota of Beaumont | 223 | 21 | 100 | pitch |
| 500572 | Doggett Toyota of Beaumont | 210 | 20 | 92 | pitch |
| 1119 | Doggett Honda Med Center | 198 | 25 | 84 | pitch |
| 800047 | Doggett Nissan of Beaumont | 191 | 25 | 97 | pitch |
| 344 | Doggett Honda Med Center | 174 | 25 | 60 | pitch |
| 901926 | Doggett Ford South Loop | 174 | 24 | 49 | pitch |
| 900023 | Volkswagen of Beaumont | 171 | 21 | 37 | pitch |
| 520055 | Doggett Toyota of Beaumont | 166 | 20 | 84 | pitch |
| 901659 | Doggett Nissan of Beaumont | 150 | 24 | 54 | pitch |
| 721 | Doggett Honda Med Center | 147 | 22 | 33 | pitch |
| 667 | Doggett Ford South Loop | 143 | 15 | 21 | pitch |
| 902050 | Doggett Ford of Beaumont | 140 | 23 | 47 | pitch |
| 274 | Doggett Ford of Beaumont | 136 | 25 | 61 | pitch |
| 564 | Doggett Honda Med Center | 135 | 23 | 74 | pitch |
| 500242 | Doggett Ford | 133 | 24 | 44 | pitch |
| 500032 | Doggett Ford | 131 | 24 | 35 | pitch |
| 50 | Doggett Honda Med Center | 127 | 24 | 56 | pitch |
| 356 | Doggett Ford | 122 | 23 | 38 | pitch |
| 593 | Volkswagen of Beaumont | 118 | 21 | 29 | pitch |
| 901931 | Doggett Honda Med Center | 114 | 23 | 44 | pitch |
| 901937 | Doggett Ford South Loop | 112 | 20 | 40 | pitch |
| 5551 | Doggett Honda Med Center | 110 | 20 | 28 | pitch |
| 901847 | Doggett Ford | 107 | 19 | 17 | pitch |
| 742 | Doggett Honda Med Center | 100 | 23 | 38 | pitch |
| 35122 | Doggett Chrysler Dodge Jeep Ram | 98 | 22 | 22 | pitch |
| 901815 | Doggett Honda of Beaumont | 94 | 16 | 11 | pitch |
| 640 | Doggett Ford | 93 | 24 | 8 | pitch |
| 902021 | Doggett Honda Med Center | 86 | 23 | 47 | pitch |
| 397 | Doggett Ford South Loop | 84 | 19 | 12 | pitch |
| 700026 | BMW Of Beaumont | 84 | 21 | 28 | pitch |
| 10181 | Doggett Ford South Loop | 82 | 22 | 20 | pitch |
| 400025 | Doggett Chrysler Dodge Jeep Ram | 82 | 22 | 32 | pitch |
| 610034 | Mercedes Benz of Beaumont | 80 | 21 | 28 | pitch |
| 221 | Doggett Ford South Loop | 73 | 20 | 21 | pitch |
| 610036 | Mercedes Benz of Beaumont | 72 | 20 | 13 | pitch |
| 517 | Doggett Honda Med Center | 70 | 17 | 23 | pitch |
| 901597 | BMW Of Beaumont | 69 | 15 | 23 | pitch |
| 671 | Doggett Chrysler Dodge Jeep Ram | 56 | 18 | 15 | pitch |
| 610039 | Mercedes Benz of Beaumont | 55 | 19 | 11 | pitch |
| 800020 | Doggett Honda of Beaumont | 53 | 20 | 18 | pitch |
| 901891 | BMW Of Beaumont | 52 | 22 | 16 | pitch |
| 11341 | Doggett Ford South Loop | 49 | 22 | 20 | pitch |
| 735 | Doggett Ford | 49 | 12 | 12 | pitch |
| 610028 | Mercedes Benz of Beaumont | 42 | 18 | 28 | pitch |
| 500570 | Doggett Ford of Beaumont | 41 | 20 | 16 | pitch |
| 800019 | Doggett Nissan of Beaumont | 36 | 10 | 16 | pitch |
| 901954 | Doggett Ford South Loop | 35 | 17 | 6 | pitch |
| 21831 | Doggett Ford South Loop | 32 | 18 | 12 | pitch |
| 700015 | BMW Of Beaumont | 29 | 9 | 10 | pitch |
| 589 | Doggett Honda Med Center | 28 | 7 | 16 | pitch |
| 710 | Doggett Ford of Beaumont | 24 | 10 | 13 | pitch |
| 676 | Doggett Ford South Loop | 21 | 13 | 9 | pitch |
| 708 | Doggett Honda of Beaumont | 19 | 4 | 5 | light |
| 500409 | Doggett Ford | 18 | 10 | 10 | light |
| 547 | Doggett Ford | 17 | 9 | 0 | light |
| 901443 | Doggett Chrysler Dodge Jeep Ram | 16 | 9 | 9 | light |
| 733 | Doggett Ford of Beaumont | 7 | 2 | 3 | light |
| 747 | Doggett Ford of Beaumont | 6 | 1 | 2 | light |
| 901515 | Doggett Honda of Beaumont | 6 | 4 | 2 | light |
| 623 | Doggett Ford of Beaumont | 4 | 2 | 1 | light |
| 961 | Doggett Ford South Loop | 4 | 4 | 2 | light |
| 500057 | Doggett Ford | 4 | 3 | 0 | light |
| 400030 | Doggett Chrysler Dodge Jeep Ram | 3 | 2 | 2 | light |
| 901982 | Doggett Honda of Beaumont | 3 | 3 | 0 | light |
| 5271 | Doggett Honda Med Center | 3 | 3 | 0 | light |
| 999 | Doggett Ford | 2 | 2 | 0 | light |
| 481 | Doggett Ford South Loop | 2 | 2 | 1 | light |
| 231 | Doggett Ford | 2 | 2 | 1 | light |
| 500571 | Doggett Toyota of Beaumont | 1 | 1 | 1 | light |
| 901992 | Volkswagen of Beaumont | 1 | 1 | 0 | light |
| 901736 | Doggett Ford | 1 | 1 | 0 | light |
