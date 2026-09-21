# Phase 3i — The story form

*Sunday 20 September 2026. Branch `story-form`, **PR open, not merged.** No
migration. **Two of the four report deliverables are missing and I could not get
them — §1.** Everything else is built and green.*

---

## 1. What I could not do, first, because it is the thing you asked for

**Ruling 4's before/after count was not measured, and there are no screenshots.**

Browser automation stopped being able to drive the local login. The fields would
not take keystrokes — click-and-type, `form_input` by ref, and keyboard-only
Tab-through all left the inputs empty, and one attempt navigated the tab onto a
`chrome-extension://` URL, which looks like an autofill extension taking the
page. I tried across two tabs and five approaches before stopping.

The credentials are not the problem — a direct password grant against local auth
returns a token for the fixture user. It is the browser.

**So the honest position on Ruling 4:**

```
dev server log:
  GET /certifications/craft-walk-around/story?preview=1  307
  GET /certifications/craft-walk-around/story?preview=1  307

advisor_story          before: 0    after: 0
advisor_story_revision before: 0    after: 0
```

**Those zeros are not evidence.** Both requests were 307s — redirects to login.
**The preview page never rendered, so nothing was walked and nothing was
submitted.** Reporting 0/0 as if it demonstrated anything would be exactly the
failure the fixture made last phase: a number that describes a state nobody
created.

You asked for this measured rather than asserted, because the loop preview filed
a `watch_gate` row nobody expected. That reasoning is right and it still applies.
**The measurement is outstanding.** What I can say is narrower and I am marking
it as such:

- The preview branch in `StoryForm.save()` returns **before** `submitStory` is
  called — it does not reach the server at all, rather than reaching it with a
  flag checked inside.
- The page forces `existing = null` under preview, so an admin who had written a
  story would still see the empty form.

**Both of those are code inspection, which is the weaker thing.** Run
`npm run fixture:story`, sign in as the printed advisor, and walk
`/certifications/craft-walk-around/story?preview=1` — the counts either side are
one `select count(*)` each.

---

## 2. Ruling 8 — there is no flag to flip, and the trap is the other way round

**`game_settings.story_required` is already `true` on production.** It has been
since 0127 applied, because 3e Ruling 2 said ship it on and it shipped on. I
verified rather than took the premise:

```
$ curl .../game_settings?select=story_required
[{"story_required":true}]
```

So nothing flips with this deploy, and the two cannot drift apart because there
is only one of them.

**But the state you were guarding against exists today, inverted.** Since 0127
the flag has been ON *with no form* — so a track reaching 100% of modules right
now would be blocked with no way to write the story. It is latent rather than
live (no track is close; none completes before February), and **shipping this
form closes that gap rather than opening one.**

---

## 3. The form

`/certifications/[slug]/story`, reached from the track that needs it and from
nowhere else.

**It is the end of a track, not a form field.** The hero names the track and says
what they just finished — *"That's all 56 items and every check. One thing left,
and it's the part nobody else asks for."* Then the prompt. No confetti; the
celebration belongs to the credential, not to submitting.

**The prompt** (Mitch's to rewrite — flagged, not invented):

> Tell us about a time you did something differently on the drive because of
> this track.

**Under the box, before they type:** *"Please don't use customer names."* Plain,
short, not a legal notice — a liability paragraph here would make the whole
screen feel like one.

**No character minimum.** Empty and whitespace-only are rejected; nothing else.
The reasoning is in `lib/story-actions.ts` under a heading aimed at whoever comes
back to this:

> **IF YOU ARE HERE IN SIX MONTHS ABOUT STORY QUALITY:** adding `length < 120` is
> the obvious move and it is the wrong one. The manager reading the story is the
> check. A character count would replace a person's judgement with a number that
> measures typing.

**Submitted, then editable** — one screen, branching on whether a live row
exists rather than on what the caller claims. Reopening reads as *yours, and you
can change it*: "Submitted 14 March. It counts already — you can change it
whenever you like." An edit files the previous text to `advisor_story_revision`
**before** the overwrite, and **if that file fails the overwrite does not
happen** — losing the history silently would make it a label with nothing behind
it.

**Sharing says who.** Not a toggle labelled "Share":

- off → *"Only you and your manager can read this"*
- on → *"Visible to advisors at {rooftop}"*

Both halves name the audience, and the off state says the manager reads it
either way — something an advisor should know before they write, not discover
after.

---

## 4. Ruling 7 — the outstanding state is a link now

`statusLine` already named it. Until the form existed, "Your Good News Story"
with no way to write one was a better dead end than "Finishing up" but a dead end
all the same. The tile is now a link when the story is what is outstanding, and
the line renders in ocean and underlined so it reads as a way forward.

`check:nav` confirms the new route is **watched, not exempt**:

```
registry                /certifications
under a registered tool /certifications/[slug]/story
```

That check is in `AGENTS.md` as a thing that once passed while watching nothing,
so I read its output for the route rather than trusting "every watched route is
reachable".

---

## 5. The preview entry

Added to `ADMIN_PREVIEWS`:

> **Good News Story — the end of a track**
> *What an advisor writes to finish a track. Always the empty form; nothing is
> saved.*

The reason it needs a menu entry is the same as the track-entry morning: **it is
the one screen that cannot be reached by using the product**, so it is the one
nobody would review before it ships.

**Also fixed while there:** the onboarding preview hint said *"All six
screens."* 3e made it seven. A count in a hint is the same kind of claim as
anything else on a screen, and that one had been wrong since the moment it
stopped being true.

---

## 6. I matched a person by name again — one turn after writing the rule

While setting up the fixture I granted admin with
`where a.full_name = 'Dana Whitfield'`. It matched **three** advisors.

The demo seed is full of duplicate names — Alex Whitlock, Avery Vance, Casey
Carrington and Sam Ashby each appear under two different user ids. So my
fixture, by naming its advisor "Dana Whitfield", **guaranteed** the collision
that bit me last phase; it was not bad luck either time.

Two fixes:

- The fixture now names its advisor after its own unique tag and **prints the
  id**, so nothing downstream has to guess.
- `AGENTS.md` already carries the rule from last phase. This is the second
  instance, and the seed is the reason it will keep happening.

*(The stray admin grants rolled back on their own — `psql -c` wraps multiple
statements in one transaction and a later syntax error aborted the lot. Verified
by listing every admin membership rather than assuming.)*

---

## 7. Report, do not build — the manager's reading surface

The RLS grants it and `accept:story` proves a manager can read their rooftop's
stories. **Nothing in the product shows them.** A story nobody reads is a diary.

**Where it belongs: the advisor detail page**, `/admin/rooftop/[id]` → an
advisor. Not a rooftop-wide list, and the reason is the one that has decided
every other call in this phase: a list of everyone's stories is a **feed**, and a
feed invites skimming, comparison and ranking — which is 0030's rule 2 (*a team
summary read by an advisor is a leaderboard*) arriving for managers. Stories are
coaching material about one person's work; they belong in the place where a
manager is already thinking about that person.

What it would take, roughly:

| | |
|---|---|
| Read | `advisor_story` filtered by `user_id`, ordered by track. The RLS already scopes it to the manager's rooftop — no new policy. |
| Show | The track, the text, submitted/edited dates, and the revision history when there is one. **The edit history is the part with teeth** — a story that changed after it was read is the thing the manager should be able to see, and it is already recorded. |
| Act | `mark_story_reviewed()` exists and gates nothing. A "read" stamp, not an approval. |
| Cost | Small. No migration, no new policy, one panel. |

**Two things to decide before building it**, both yours and Mitch's:

1. **Does the advisor know when their manager has read it?** `reviewed_at`
   exists. Showing it is kind; showing it also turns an unread story into a
   visible slight. I would not show it without deciding that on purpose.
2. **Does a manager see retired stories?** The RLS says yes — they can read
   their rooftop's rows including retired ones. That is right for the edit
   history and questionable for a story somebody withdrew. Retention, §6 of the
   3e report, still unruled.

---

## 8. Verification

```
accept:story          24 passed, 0 failed
accept:family         34 passed, 0 failed
tsc --noEmit          clean
eslint                0 errors (9 pre-existing warnings)
next build            ✓ Compiled successfully
check:nav             Every watched route is reachable
db reset --local      0001 → 0127 clean
```

**No migration in this phase.** 0127 already built everything the form writes to.

---

## 9. What is outstanding from this phase

1. **Ruling 4's before/after count**, and both screenshots — §1. Blocked on
   browser automation, not on the code.
2. Mitch's wording for the prompt.

```
$ git status -sb
## story-form...origin/story-form
 M .gitignore
?? data/File.png

$ gh pr view 11
PR #11  OPEN  MERGEABLE  story-form -> main  files 8
```

No ahead count. Nothing on `main`. The two standing exclusions — `.gitignore`
(Drop Zone scope) and `data/File.png` (a stray) — remain on your disk and out of
the PR.
