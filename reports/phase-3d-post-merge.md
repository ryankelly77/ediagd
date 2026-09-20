# Phase 3d, part ten — the merge has not landed, and a numbering collision

*Sunday 20 September 2026, 10:20 CT. **PR #8 is still `OPEN` and `main` is
unchanged**, so the nine checks cannot run — all nine are marked accordingly.
Everything that does not depend on the merge is done, including Ruling 2's
answer, which is worse than expected. **And there is a second open PR carrying a
different migration numbered `0123`** — §2, and it wants deciding before either
merges.*

---

## 1. The merge did not happen

Your message opens "Merged." Production says otherwise, and I am not going to
run nine checks against code that is not there.

```
$ gh api repos/ryankelly77/ediagd/commits/main
  b6e5c47   Merge pull request #6 ...   2026-09-18T13:57:00Z

$ gh pr view 8
  state=OPEN   mergedAt=null   mergeCommit=null

$ gh pr list --state all
  #8 OPEN    Phase 3 — The Two Ladders …
  #7 OPEN    One resolved service family, everywhere
  #6 MERGED  The importer reads the header instead of remembering it
  #5 MERGED  Currency begins at the credential, not at the track
```

Checked three times, several minutes apart, once via the REST API directly to
rule out CLI caching. `main` has not moved since 18 September; the most recent
merge is still #6.

**Had I taken "Merged." at its word, I would have run the nine checks against
the old deployed code and reported the results as the new code's.** Several
would have passed — the shelf, track entry, the honest empty — because they read
production data that the migrations already changed. That is the failure this
whole fortnight is about, and it would have been the worst instance of it,
because it would have been *me* certifying a deploy that never happened.

**All nine checks: `could not run — not merged`.** Detail in §5.

---

## 2. There are two different migrations numbered `0123`, and one will vanish

**PR #7, "One resolved service family, everywhere"**, opened 17 September, is
still open and contains:

```
supabase/migrations/0123_resolved_service_family.sql
```

My PR #8 contains `supabase/migrations/0123_two_ladders_spine.sql`, **and that
one is already applied to production.**

```
$ supabase migration list --linked
  {"local":"0123","remote":"0123"}      <- this is 0123_two_ladders_spine.sql
```

**Supabase tracks migrations by the version prefix, not the filename.** So if
PR #7 merges:

- `0123_resolved_service_family.sql` is read as version `0123`
- version `0123` is already recorded as applied
- **it is skipped. Silently. Permanently.**
- and the code in PR #7 that reads what it creates deploys anyway

A migration that never runs while the ledger says it did, and application code
shipping against a schema that was never built. **It would not error.** It is
the precise shape of every finding in this phase, arriving from a direction
neither of us was watching.

### They are also solving the same problem, twice

PR #7's header:

> *cues carry `content.service_family`; videos carry `content.op_code`, resolved
> through `op_code_family`. Both answer "which service area is this about".*

That is the contradiction 3c was built around, and **0125
(`service_family_content`) already resolves it on production.** PR #7 is an
earlier, parallel attempt at the same unification. It also touches five files
PR #8 modifies — `lib/daily.ts`, `lib/library.ts`, `lib/content.ts`,
`lib/content-server.ts`, `lib/certification-server.ts` — so a textual conflict
is likely on top of the numbering one.

> **This is yours to rule and I have changed nothing.** The options as I see
> them: close #7 as superseded by 0125, or renumber its migration to `0126+`
> and reconcile its code against `service_family_content` — but not merge it as
> it stands, in either order, because the migration cannot apply.

I did not know PR #7 existed until I checked the merge state. It has been open
the entire phase.

---

## 3. Ruling 2 — can a mis-mapped advisor see the colleague's name?

**No. And that is the finding, not the reassurance.**

I expected to report a leak. What is actually there is worse: **a disclosure
that exists, works, and is switched off for exactly the people it protects.**

### The safeguard exists and says so

`app/(app)/advisor/page.tsx:105-125`, in its own words:

> *An admin who attaches a real operator id to their own membership to see real
> data then reads "Aloha, Ryan / Here are your numbers" over somebody else's
> book … The DMS roster knows the real name, so the screen says it when it
> differs.*

It reads `dms_advisor.display_name` for the viewer's `op_code_id` and renders
`bookOwner` whenever the roster name differs from the logged-in name.

### It cannot fire for a plain advisor

`dms_advisor_read` (0046) grants select to `is_platform_owner()`,
`admin_rooftops()` (role `admin`) and `managed_rooftops()` (role `manager` or
`admin`). **Advisor is not on that list.**

| Account | Roles | Can read `dms_advisor` | Sees "whose book" |
|---|---|---|---|
| Ryan Kelly | admin, manager, advisor | yes | **yes — "David Esparza"** |
| Mitch Hardt | admin, manager, advisor | yes | **yes — "Erin Helton"** |
| **Demo Advisor** | **advisor** | **no — RLS refuses** | **no** |
| **Tracie Mendoza** | **advisor** | **no — RLS refuses** | **no** |

The safeguard works for the two accounts that are admins anyway — who could
already read the roster and are least likely to be fooled — and is silent for
the two that are only advisors, which is the entire pilot cohort shape.

**And the read swallows its error** — a bare `const { data: rosterRow }` — so
the RLS refusal is indistinguishable from "this operator has no roster row".
Nothing logs. Nothing renders. `bookOwner` is simply always null.

> **This is `has_performance_surface()` again** — a gate keyed on a role that
> excludes the viewer it exists to protect. Third time this exact shape has
> appeared in this phase, and this one is on the privacy surface.

### So what does a mis-mapped advisor actually get?

| Surface | Colleague's **name** | Colleague's **numbers** |
|---|---|---|
| `/advisor` | **no** (RLS) | **yes** — attach rates, ROs, labor |
| `/today` focus card *(new)* | **no** — no name in the props at all | **yes** — "Your {family} attach is X%" |
| Pitch derivation *(new)* | n/a | **yes** — coaching derived from their weaknesses |
| Any unrendered API response | **no** — `dms_advisor` is the only name source and it is refused | — |

**The numbers leak; the name does not.** Which is the wrong way round. Being
shown a colleague's performance *labelled as theirs* would be a disclosure. Being
shown it **labelled as your own, with the label suppressed**, is the thing you
described — one advisor seeing another's numbers, at a dealership, with nothing
on screen to reveal it.

### It is already live, concretely

The **Demo Advisor** is advisor-only and mapped to op `400025` = **"Hill,
Teroneka"**. Her focus card, once #8 merges, reads:

> *Your Belts & Cooling attach is **4.3%** — the store averages **5.0%**.*

**Those are Teroneka Hill's numbers, and the word is "Your".** No disclosure,
because the Demo Advisor cannot read `dms_advisor`.

### Where it goes on the fix list

You said if the answer is yes it moves up past everything except the stamp.
**The answer is "no, and the no is the problem"** — so I am not going to apply
your rule mechanically. My reading:

1. **The stamp and the two date fallbacks** — unchanged at the top. It traps a
   person with no way out and we send traffic into the window.
2. **F3, the invisible disclosure** — because it is the *only* thing standing
   between a mis-mapped advisor and a colleague's numbers, and today it stands
   there for admins only. It is also small: widen the policy to the advisor's
   own mapped row, or move the lookup behind a definer function.
3. `lib/entitlements.ts`
4. `lib/service-family.ts:132`

`/verify` before February. **But F2 outranks all of it operationally**: none of
this matters for Tracie if nobody provisions her rooftop, and provisioning it
without re-mapping is what makes the leak real for her.

---

## 4. Rulings 1, 3 and 4

### Ruling 1 — `PHASE_3_PLAN.md` now carries **F2**

> ### F2 — Provisioning a rooftop and re-mapping its advisors is ONE act
>
> A rooftop is provisioned **and** its advisors' `membership.op_code_id` values
> are confirmed against the DMS roster, **together, or neither happens.**
>
> | | Tracie today | After provisioning alone |
> |---|---|---|
> | What she sees | "Your rooftop isn't set up" | A working-looking loop |
> | Is it true? | **Yes** | **No** — derives from op 626 |
> | Who is 626? | — | **"Nguyen, Thomas"**, last seen 2026-01-21 |
> | Result | Honest, blocked | **Permanent two-slot morning, no error** |
>
> **We would have traded an honest broken state for a silent wrong one**, which
> is the trade this whole phase exists to refuse.
>
> `rooftop_product` for Doggett Honda Med Center holds **no row of any kind**, so
> the entitlement half is one grant. The mapping half is a separate question for
> whoever knows who actually writes ROs at that store.

It also records that this is a privacy act, pointing at F3.

### Ruling 3 — **F4**, and the mark is explicit

> The mark must be **explicit and per account, with a reason** — a column on
> `membership`, set by a person. The signature then alarms on **anything
> unmarked**.
>
> **Do not infer intent from the pattern.** "Three of them are almost certainly
> deliberate" is the reasoning that produced the blind baseline in the first
> place.

Recorded as written. I had reached for exactly that inference last turn and you
were right to cut it off — "almost certainly deliberate" was me reading intent
out of data that cannot carry it.

### Ruling 4 — accepted

The prediction was not wrong, it was **attached to the wrong event**. When the
reason for a prediction disappears, the move is to ask what else it was true of.
Deleting it was the same error as the "required" UPDATE seen from the other
side: a claim and its justification coming apart, and only one of the two getting
re-examined. I withdrew the claim and kept nothing.

---

## 5. The nine checks

**Every one: `could not run — not merged.`** Production is serving `b6e5c47`,
the pre-3b five-step loop.

| # | Check | Result |
|---|---|---|
| 1 | Three slots, mindset first | **could not run — not merged** |
| 2 | The pick — Filters, 7.39 missed ROs | **could not run — not merged** |
| 3 | Two-slot renders (Mitch), finishable | **could not run — not merged** |
| 4 | Honest empty — Tracie gets `RooftopNotReady` | **could not run — not merged** |
| 5 | The shelf — 12 films, no "Soon" | **could not run — not merged** |
| 6 | Watch-ahead | **could not run — not merged** |
| 7 | Track entry not firing | **could not run — not merged** |
| 8 | A real day — swell 7 → 8 | **could not run — not merged** |
| 9 | Rest card offers the rep, reveals three slots | **could not run — not merged** |

Checks 4, 5 and 7 read data the migrations already changed, so they would
**pass against the old deployed code** and tell you nothing. Marking them
`passed` would have been the most expensive kind of green in this project.

**Still true today, and still cheap:** today is a rest day for Ryan, Demo and
Mitch (`works_sun=false`), and the rest card offers "Take today's rep anyway",
so check 9 and check 8 remain runnable the moment the merge lands. The window is
open until roughly 19:00 CT, when the stamp trap's band begins.

---

## 6. Where this leaves the merge

**PR #8 — https://github.com/ryankelly77/ediagd/pull/8 — `OPEN`, `MERGEABLE`,
69 files.** Both part-nine blockers stayed answered: the UTC fallback is
pre-existing, and a rest day does not prevent any check.

**One new thing to decide first: PR #7.** Merging #8 does not break #7, but
merging #7 at any point after #8 silently drops its migration. If #7 is going
to be closed or renumbered, doing it before #8 merges keeps the history clean.

Merge when you are at the desk with the morning ahead and I will run all nine
inside the hour.

```
$ git status -sb
## phase-3-two-ladders...origin/phase-3-two-ladders [ahead 1]
 M .gitignore
?? data/File.png

$ gh api repos/ryankelly77/ediagd/commits/main
  b6e5c47  2026-09-18T13:57:00Z   — unchanged

$ gh pr view 8
  #8  OPEN  MERGEABLE  69 files
```

`.gitignore` (Drop Zone scope) and `data/File.png` (a stray) remain the
deliberate exclusions, on your disk and out of the PR. Nothing on `main`.
