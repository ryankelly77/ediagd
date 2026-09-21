# Phase 3e — 0127 applied, #10 merged

*Sunday 20 September 2026, 22:30 CT. `0127_good_news_story.sql` is on production
and **PR #10 is merged as `6ca5842`**. The credential says four legs on day one.
**This closes the engineering run.***

---

## 1. 0127 — applied and exercised, not just applied

```
backups/pre-0127-schema.sql     505 KB
  verified as the PRE state:  advisor_story 0 refs · story_required 0 refs
  verified 0126 still present: AND ("c"."service_family" IS NULL)

supabase db push --linked
  {"migrations":["0127_good_news_story.sql"]}
```

*(My first backup check reported 0126's precedence missing. That was my grep,
not the dump — `pg_dump` quotes identifiers, so the source spelling
`and c.service_family is null` does not appear. Worth the thirty seconds it cost
to confirm rather than raise a false alarm; production reads 1,607 rows either
way.)*

**Exercised as roles I actually hold**, because applying cleanly proves nothing:

| Check | As | Result |
|---|---|---|
| `advisor_story` exists | service role | **200**, `*/0` rows |
| `game_settings.story_required` | service role | **`true`** |
| `advisor_story` | **anon** | **401 — refused** |
| `advisor_story_revision` | **anon** | **401 — refused** |
| `my_story_for()` | **anon** | **401 — refused** |
| `mark_story_reviewed()` | **anon** | **401 — refused** |
| **`content`** — the non-vacuity control | **anon** | **200** |

The last row is the point: the same anon key that is refused four times reads
`content` fine, so those 401s are the grants working rather than a broken key.

The four **advisor/manager** rules are proved in `accept:story` (24/0) against
local, because that suite writes and refuses any non-localhost URL — correctly.

---

## 2. #10 merged, and the one real deploy risk checked

```
PR #10   MERGED  2026-09-21T03:26:03Z
main     6ca5842
```

`loadStoryGate` **throws** on a read error rather than swallowing it — the right
call, and it means a wrong grant breaks `/certifications` for every advisor
rather than quietly under-reporting. So that page was the thing to check.

**It renders on production for Ryan:** Walk Around 28 of 56, Filters 1 of 47,
Brake Service 3 of 126. `loadStoryGate` is running live against production and
not throwing. No track is at 100%, so nothing says "Your Good News Story" yet —
which is correct, not a missing feature.

---

## 3. The warm-up — recorded as a no, with the reason

Ruling 1 accepted, and the reasoning is now in two places so it is not
re-litigated by someone who only sees the absence:

- **`lib/story.ts`**, at the top of the file anyone building the form will open.
- **`PHASE_3_PLAN.md` F7.**

> As built, nothing can be written until February, so the customer-name question
> is a February question. A warm-up would have converted it into a nine-day one,
> for a feature nobody asked for. **Revisit in November**, once Doggett has used
> the product for a month and we know whether advisors want to write or have to
> be asked.

### And the thing that makes that ruling load-bearing: there is no form

Worth stating plainly, because "Piece B is done" could be read as more than it
is. **0127 built the record, the RLS and the gate. Nothing in the product writes
an `advisor_story`.** `/certifications` names the outstanding story; it does not
yet offer a way to write one. Nothing can be, before February.

F7 carries the form, and the line of copy that ships with it:

> **Don't use customer names.**
>
> Advisors will otherwise write *"Mrs. Henderson in the blue Pacifica wouldn't
> buy the alignment until…"*, because that is how people describe their work. It
> is copy, not policy; it costs nothing and it prevents most of what the
> retention policy would otherwise have to clean up.

Retention, deletion, and what a manager sees about a departed advisor stay
proposed — `phase-3e-good-news-story.md` §6, for Mitch and Ryan, before February.

---

## 4. `AGENTS.md` — never identify a person by name

Added beside the sweep rule, with both instances:

> **Ids only** — in fixtures, in scripts, in production paths, everywhere. Names
> collide, and a query that matches on one will happily return the wrong person
> without erroring.
>
> - A screenshot fixture looked an advisor up by `app_user.full_name`, got the
>   wrong one of two rows sharing that name, and **backfilled progress onto a
>   user who was not the browser session.**
> - `membership.op_code_id` pointed four app accounts at other people's DMS
>   books — the same defect in production. One of them showed an advisor a
>   colleague's attach rates labelled "Your".
>
> Derive the id from the thing you actually mean — the session, the row you just
> inserted, the membership you are acting on. **A name is for printing, never for
> matching.** If a lookup must start from a name, assert it returned exactly one
> row before using it.

---

## 5. Ruling 5 — onboarding is a surface, not documentation

Stated for the record, because it is the general lesson rather than two fixes:

Onboarding was describing a product that no longer existed. The loop list showed
the pre-3b morning, so **an advisor was told one order and handed another on the
very next screen** — the exact failure the comment above that list warns against,
sitting there while the comment warned about it. And "No homework" became false
the moment the credential asked for writing.

Both were found by building Piece A, neither was in the brief, and nothing was
watching either. **Onboarding goes stale like any other surface** — it just has
no user who can report it, because the only people who see it are seeing
everything for the first time and have no way to know it is wrong.

---

## 6. Verification

```
accept:story          24 passed, 0 failed
accept:family         34 passed, 0 failed
accept:loop           77 passed, 0 failed
accept:focus-family   43 passed, 0 failed
test:streak          127 passed, 0 failed
test:certification    70 passed, 0 failed
test:watch            67 passed, 0 failed
test:day-ticket       35 passed, 0 failed
test:rest-day         22 passed, 0 failed

db reset --local  0001 → 0127 clean · tsc clean · eslint 0 errors · build ✓
production migration state: 0127 → 0127
```

---

## 7. Where this leaves 1 October

**The engineering run is closed.** Nine days out, and the four blockers are not
code:

| # | Blocker | Owner |
|---|---|---|
| 1 | **MOU** — Mitch and Pear Tree | Ryan |
| 2 | **Pilot scope** — one rooftop or more | Ryan and Mitch |
| 3 | **Provision and re-map together (F2)** | Mitch confirming names against operator ids |
| 4 | **Invitations** — nobody has been invited yet | Ryan |

On (3), the one thing worth repeating from 3d because it is the trap: **provision
Tracie's rooftop alone and she goes from an honest "not set up" to a silently
wrong morning**, deriving from `op_code_id` 626 — "Nguyen, Thomas", last seen
January, absent from every recent period. Provision and re-map together, or
neither.

The follow-up list keeps: the Mux signing swallow, the stamp and the two date
fallbacks, `lib/entitlements.ts`, F3's disclosure gap, `service-family.ts:132`,
F5's precedence, F6's admin streak, F7's form. All written down, all still there
on 2 October.

```
$ git log --oneline -1
6ca5842 Merge pull request #10 from ryankelly77/good-news-story

$ git status -sb
## main...origin/main
 M .gitignore
?? data/File.png
```

No ahead count. Nothing uncommitted but the two standing exclusions —
`.gitignore` (Drop Zone scope) and `data/File.png` (a stray). `backups/` is
gitignored.
