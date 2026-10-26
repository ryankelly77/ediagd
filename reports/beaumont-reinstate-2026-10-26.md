# Reinstated at Beaumont, and two records combined into one person

**26 October 2026.** Ryan: *"we de-provisioned her last week and her manager said
put her on"*, then *"Pinder was the maiden name. Her name is now Tiner. Same
person"*, then *"combine and reinstate"*.

## The thing that nearly went wrong

The name in the prompt and the event in the prompt pointed at **different rows**.

| | Amanda **Pinder** | Amanda **Tiner** |
|---|---|---|
| auth id | `38dc500a-ca9b-42dc-b63e-6ee5a0bd1d1b` | `25679711-c644-476c-b8cb-86303d3132c4` |
| email | amanda.pinder@doggettauto.com | amanda.tiner@doggettauto.com |
| app account | provisioned 12 Oct, signed in 19 Oct, one film completed in the loop | auth user only — never confirmed, never signed in |
| membership | `a397ba06…` advisor, no op code, `active: false` | none, ever |
| DMS roster | not on it | op **500573**, `departed_on` 2026-09-03 |

Tiner never had an app account to de-provision. Pinder is the one whose login
was switched off. So *"de-provisioned her"* described Pinder's row while the
name said Tiner's — and the two were one person all along, under a maiden name.

**This question was already on file and already flagged, twice, in disagreement
with itself:**

- `reports/provision-roster.md:39` — *"Pinder's future op code looks wrong…
  500573 is "Tiner, Amanda"… That is either a different person or a stale
  mapping; it is not this run's to decide."*
- `reports/beaumont-first.md:31` — *"Pinder maps to 500573 once the light-track
  floor is live"*, assuming without saying so that the mapping was right.

Two documents disagreeing about the same fact is the bug. Ryan's ruling settles
it: **one person, married name.** Both documents should now say so rather than
leaving a reader to re-derive it.

Nothing here matched on a name. The names are printed; every write was keyed on
the id.

## Reck's note, which the un-depart destroyed

`set_advisor_departed(_departed => null)` nulls `departed_note`, and
`dms_advisor` has no column that carries a *reinstatement* reason. So the only
record of why she was removed is this, copied out verbatim before the write:

> **`dms_advisor.departed_note`, op 500573, as of 26 Oct 2026, now deleted:**
> *"Matthew Reck, 20 Oct 2026: complete advisor list excludes them. Recorded on
> Ryan's instruction; departure date = last DMS activity."*

**Her manager's own complete list, six days ago, excluded her.** The reinstatement
reverses that on his later say-so. Both halves are legitimate; what matters is
that after the write a reinstated advisor and one who was never departed are
indistinguishable in the row — which is the failure
`A hold that leaves no trace when it is overridden is not a hold` already names.

**Follow-up, not done here:** `dms_advisor` wants `reinstated_at` /
`reinstated_reason`, the same shape `0134` added for `content.retired_reason`
after fourteen retires left eleven reasons living only in migration comments.
This is the fifteenth instance of the same question. A migration is a schema
change on production and was not in this ask.

## The four writes

In this order, because `resolveOperator` in `scripts/provisioning.ts` refuses a
departed op code — the un-depart has to land before anything maps the book.

| # | write | before → after |
|---|---|---|
| 1 | `set_advisor_departed(84bef302…, '500573', null)` | `departed_on` 2026-09-03 → null |
| 2 | `membership a397ba06…` | `active` false → **true**; `op_code_id` null → **500573** |
| 3 | `app_user 38dc500a…` | `full_name` "Amanda Pinder" → **"Amanda Tiner"** |
| 4 | `dms_advisor 500573` | `linked_user_id` null → **`38dc500a…`** |

Write 4 is the combine: one DMS book, one app account, joined on the id.

Refusals checked before the first write, all clear:

- op 500573 held by **nobody else** — the check that `membership.op_code_id`
  failed four times.
- the duplicate auth user has **0 rows** in `app_user`, `membership` and
  `content_progress`, so calling it an orphan is measured rather than assumed.

`set_advisor_departed` returned `memberships_deactivated: 0`, which is correct:
the un-depart deliberately does not restore a login, so write 2 did it
explicitly.

## What her morning will actually do

The write says she is mapped to a book. **That is a label, so here is what is
behind it** — read from `advisor_family_labor`, not inferred from the mapping:

| | |
|---|---|
| latest complete period | `9c77c05e…`, 1–30 September 2026 |
| her book in that period | one family, **Tires & Rotation, `fam_ros = 1`** |
| `min_fam_ros_for_pitch()` | **5** |

**One RO against a floor of five.** She is below it, so `derive_focus_family`
records a `light` row — `family` null, `source = 'light'`, with a note — and she
gets the **two-slot morning**, the same one she had unmapped. The light track
holds her there until her ROs cross 5, which is precisely what `0147` was built
for and why mapping a dormant book is safe rather than an empty pitch slot.

`advisor_focus_family` has **no row for her yet**. That is deliberate: the
derivation runs on her first morning, as **her**, authenticated. It was not
called from here — it writes, and as `service_role` it reads gates that have
shut the backend out before (`has_performance_surface()` keyed on `auth.uid()`).
Deriving it from the wrong role would have recorded a confident wrong answer.

**Everything above was read as `service_role`.** The one thing not verified is
her morning as herself, which needs a sign-in.

## Open, and Ryan's to answer

**Which email does she sign in with now?** Her live account is still
`amanda.pinder@doggettauto.com` — that is the address with the history, the
schedule and the streak on it, and it works today. `amanda.tiner@doggettauto.com`
is held by the unused auth user `25679711…`.

If her dealership address changed with her name, she cannot receive a password
reset at the address she can still log in with, and the swap needs the orphan
removed first because Supabase will not hold one address twice. Deleting an auth
user is irreversible, so nothing was done. Three choices:

1. **Leave it.** She signs in as pinder@, display name reads Tiner. Nothing to do.
2. **Move the login to tiner@.** Delete the orphan `25679711…`, then change the
   email on `38dc500a…`. Her history, schedule and streak all follow, because
   they are keyed on the id.
3. **Confirm with the store first** which address actually reaches her.

## Unchanged

Her streak (`current_len: 1`, last completed 19 Oct) and her work schedule
(Mon–Fri, no Saturday) were already on the row and were not touched. Her
`swell.current_len` reads 1 and she has missed scheduled days since 19 Oct — so
anything quoting it raw will overstate it until her next completion. See the
`previous_scheduled_day()` rule.
