# Doggett Ford of Beaumont goes first

*30 September 2026. Branch `beaumont-first` (stacked on `light-track`).
Migrations 0148–0149, the role-grant script, F3 and F6 closed. Part two —
invites and `provision:advisor` runs — is Ryan's runbook and writes nothing
until each invite is accepted. This staggering replaces "sixty advisors on
1 October" everywhere it was assumed; the two live code comments that said it
are swept.*

## Part one, delivered

**0148 — `advisor_base` for rooftop `84bef302`, nothing else.** Idempotent;
asserts the row exists after AND that no other product exists at the store
(`manager_meetings` is unfilmed and would only surface an empty tile to
Patterson and Reck; `joe_the_pro` is unbought). Refuses if the rooftop id
resolves to any name but Doggett Ford of Beaumont; quiet no-op on a fresh
local. F2 note: this grant alone changes nothing anybody sees — the store has
no memberships until the runbook writes each one against the confirmed roster.

**`npm run grant:beaumont-roles`** — the rows `provision:advisor` refuses to
write (it demands an op code), as a script rather than a migration because
every row is keyed on an `app_user` id that exists only after the invite is
accepted, and provisioning scripts never mint users:

- `--as=lance` — admin at every rooftop in the Doggett org (eleven, read from
  the org, never a list that goes stale). **Never `is_platform_owner`.**
- `--as=patterson` — manager + advisor-on-500570 (two rows).
- `--as=reck` — manager + advisor with no op code; 530029 is dead and never
  mapped.
- `--as=sztaba` / `--as=pinder` — advisor, no op code. One
  `provision:advisor` run maps Sztaba when a period carries 831000; Pinder
  maps to 500573 once the light-track floor is live, and the floor keeps her
  light until her ROs cross it.

Proven on the local restore: unknown names refuse (`--as=anthony` names the
right path), a nonexistent user refuses, the Lance dry-run reads back all
eleven rooftops, a re-run reports `exists` instead of duplicating, and a
mapping conflict **refuses before writing anything** — the first version
wrote the manager row and then refused the advisor row, a refusal that had
already done half the work; it now checks every grant before the first
insert.

**F3 closed (0149).** `my_book_owner()` — definer, one name for the caller's
own mapped op code, `authenticated` may execute, `anon` may not, and the
roster's other columns stay unreadable. The page's swallowed error is gone: a
failure throws. Proven as the viewers:

```
ok  mapped advisor gets the book owner's roster name over PostgREST
    (got "Hill, Teroneka (400025)")
ok  the advisor still cannot read dms_advisor itself
ok  an unmapped account gets nothing back — no name is invented
```

That first line is F2's privacy case rendering for the first time to the role
it protects: the test account mapped to 400025 now sees whose book it reads.

**F6 closed — the proper fix.** `loadAdvisorDetails` takes the rooftop; each
chunk loads the store's confirmed closures, the full swell state (grace
columns included) and the paddle settings; `swellAsOf` runs per advisor with
schedule + calendar-year Island Time + closures. Both callers pass their
rooftop. Proven both ways:

```
ok  a streak bridged by store closures reads ALIVE at 7
ok  the same gap with no closures reads 0 while the stored row still says 7
ok  the stored number was never touched — display moved, the ledger did not
```

(The closure fixture's first version failed silently against
`closed_day_confirmed_is_stamped` — a confirmed closure must be stamped — and
the suite's setup now checks its own errors, because an acceptance whose
setup can fail silently is a check that cannot fail honestly.)

**F4 stays open**, with its baseline: the six Beaumont mappings (Patterson
500570, Booker 274, Martin 747, Upshaw 710, Abate 902050, and Sztaba's
deliberate no-code) were confirmed by Ryan against the store's roster on
30 September. The runbook's read-back lines land in
`reports/beaumont-provisioning-<date>.md`.

PHASE_3_PLAN's F3 and F6 sections carry dated CLOSED notes so the plan and
the code cannot disagree.

## Validated

Full `supabase db reset --local` replay through 0149; 0148/0149 build paths
green on the production restore; `accept:beaumont` 6 of 6; grant-script gates
exercised at the CLI; `next build`, tsc, eslint clean.

## For Ryan (part two, unchanged from the brief)

Invites first, lowercase; dry-run `provision:advisor` per mapped advisor and
read WHOSE BOOK it names before applying; `grant:beaumont-roles` for Lance,
Patterson's manager row, Reck, Sztaba and Pinder after their invites; the
read-backs into `reports/beaumont-provisioning-<date>.md`. Blocking before
the first morning: your own test account's full morning at Beaumont, one
mapped-advisor morning, the door decision, one confirmed login per person.
