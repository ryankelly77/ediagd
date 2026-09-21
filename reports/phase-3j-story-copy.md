# Phase 3j — Story form copy

*Monday 21 September 2026. Branch `story-copy`, **PR open, not merged.** No
migration. **And the 3i measurement is in — §1.***

---

## 1. The after-counts, and this time they are evidence

You walked the preview on production and pressed submit. Taken immediately
after:

| | Before (captured pre-walk) | **After** |
|---|---|---|
| `advisor_story` | 0 | **0** |
| `advisor_story_revision` | 0 | **0** |

```
$ curl .../advisor_story?select=*            ->  []
$ curl .../advisor_story_revision?select=*   ->  []
```

**The difference from last time is that the walk happened.** In 3i both requests
were 307s — the page never rendered — and I refused to report those zeros. These
zeros describe a state somebody created: an admin opened the preview, typed, and
submitted. Nothing was written.

**Ruling 4 of 3i is satisfied.** The preview writes nothing, measured rather
than asserted.

---

## 2. The one that needed checking — and it does not adapt

**`and every check` was wrong on six of seven tracks.** Measured on production:

```
track                        modules  modules-with-quiz  questions
Walk Around                        7                  7         28
Setting up the MPI                 1                  0          0   <-- no checks
Four Step Close                    2                  0          0   <-- no checks
Success Cycle                      7                  0          0   <-- no checks   (active)
Overcoming Objections              5                  0          0   <-- no checks   (active)
Power of Positive Language         7                  0          0   <-- no checks   (active)
Chemical Warranty                  6                  0          0   <-- no checks

tracks with at least one quiz question:  1
tracks with modules and none:            6   (three of them active)
```

So it is the fix rather than a copy tweak, as you said. The page now measures it
— `trackHasChecks()`, certification → courses → modules → `quiz_question_public`
— and the hero reads:

- with checks: *"That's all 56 items and every check."*
- without: *"That's all 55 items."*

Every step of that lookup takes its error. A refusal reading as "no checks"
would quietly change what the hero claims, which is the same defect one layer
down.

---

## 3. Ruling 1 — the preview frame is in one place now

**"Saved — in the real thing." is gone.** Every string on the page is now exactly
what an advisor sees; the preview only speaks in the banner.

And the banner is **sticky**, which is the fix you pointed at rather than the one
I would have reached for. It also now names the substitution:

> Preview — nothing you type here is saved. Shown as an advisor who has finished
> the track would see it.

That second sentence earns its place because of §4: the preview asserts
`completesTrack` so the credential landing is visible. That is a substitution,
and the same posture as the track-entry morning borrowing a film — substitute,
and say so on screen.

---

## 4. Ruling 2 — the confirmation is a credential landing

You are right that this was the bigger miss, and that "Saved" reading thin was
the symptom.

```
trackComplete = modules.every(moduleComplete) && (storyRequired ? storySubmitted : true)
```

On submit, when the story is the last leg:

> ### That's Walk Around done.
> Every item, every check, and the part nobody else asks for. It counts towards
> your credential from now.

**It only says that when it is true.** `completesTrack` comes from the same
`my_certification_progress` rollup the wall uses, so the two cannot disagree.
Somebody arriving by URL with modules outstanding gets the smaller, honest line
instead:

> Your story is saved. The track finishes when the rest of the modules are done.

That distinction is the whole reason it is not a static string: a screen that
announced a finished track to somebody with four modules left would be the
label-with-nothing-behind-it failure on the most important sentence in the
product.

---

## 5. Ruling 3 — the switch, and the default

**The label was missing and `Toggle` had already said so.** Its own doc: *"What
a screen reader announces. **The visible text lives beside it.**"* I passed the
audience sentence as `label`, which is `aria-label` only, and put no visible text
beside it. So it rendered as a bare switch — unreadable state, unreadable
purpose.

Now:

> **Share with my team** &nbsp;&nbsp;&nbsp;&nbsp; ( switch )
> *Off — only you and your manager. Turn it on to let advisors at Doggett
> Chrysler Dodge Jeep Ram read it too.*

### The default is off, and I can show it three ways

| | |
|---|---|
| Schema | `shared_to_team boolean not null default false` — 0127 line 77 |
| Form state | `useState(existing?.sharedToTeam ?? false)` |
| In preview | `existing` is forced to `null`, so it is always `false` |

**So it was not showing you a default of on.** There is no path by which that
control starts on. What it was showing you is an unlabelled switch, and an
unlabelled switch is a coin-flip — which is your Ruling 3 exactly. The state was
correct and unreadable, which is the more interesting failure of the two.

*(If you did tap it, that would also explain it — but the point stands either
way: neither of us could tell from the screen, and that was the bug.)*

---

## 6. Ruling 4 — the three small ones

- **`56items`** — fixed, and the cause is documented in this codebase already:
  SWC drops a plain leading space on a text node that wraps to the next line.
  The same note sits in `OnboardingFlow` with the same `{" "}` fix. I had read
  that comment and then written the bug anyway.
- **"Your manager can either way"** → *"Your manager reads it either way."*
- **"because of this track"** — gone. The hero says **Walk Around** in 40px
  directly above. *"Tell us about a time you did something differently on the
  drive."* Three lines of large bold become two.

---

## 7. Ruling 5 — the button stops offering to submit

It said "Submit my story" after submitting because it branched on `isEdit` —
the state the page **loaded** in — which is false on a fresh submit however many
times you press it.

It now tracks what is true:

| State | Button |
|---|---|
| Never submitted | **Submit my story** |
| Submitted, unsaved edits in the box | **Save changes** |
| Submitted, nothing pending | **Saved** |

Legible without reading the line above it, which was the ask.

---

## 8. Verification

```
accept:story          24 passed, 0 failed
test:certification    70 passed, 0 failed
tsc --noEmit          clean
eslint                0 errors (9 pre-existing warnings)
next build            ✓ Compiled successfully
check:nav             Every watched route is reachable
```

**No migration.** Nothing here needed schema — `hasChecks` and `completesTrack`
are reads of what already exists.

---

## 9. Still open

- **Mitch's wording for the prompt.** Mine is a placeholder and flagged as one.
- The manager's reading surface — reported in 3i §7, not built.
- Retention and deletion — 3e §6, still Mitch's and yours, before February.

```
$ git status -sb
## story-copy...origin/story-copy
 M .gitignore
?? data/File.png

$ gh pr view 12
PR #12  OPEN  MERGEABLE  files 3
```

No ahead count. Nothing on `main`. `.gitignore` and `data/File.png` remain the
two standing exclusions, on your disk and out of the PR.
