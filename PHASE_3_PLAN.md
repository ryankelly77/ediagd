# PHASE 3 — the Two Ladders build

Architecture: `TWO_LADDERS.md`. This is the sequence.

## Dependency chain

```
  service-family resolution  --+   (already prompted, awaiting Code)
                               |
  3a  ground truth + spine  ---+-->  3b  the loop  -->  3c  the card
      queries, schema, no UI   |         behavior          /today
                               |
                               +-->  (3c also needs family resolution:
                                      the card lists a family's films)

  3d  Good News Story  -- gated on Mitch's approval, not on code
```

**One phase in Code's hands at a time.** Each ends with a report and a migration Ryan
applies himself.

## 3a — Ground truth and the spine

*No user-visible change. This is the phase that stops us guessing.*

**Report first, build second.** Six questions, all cheap, several of which block
decisions we cannot make without the answers:

1. Quotes — how many published, do they carry `module_id`, how does `collection` group
   them.
2. Published films per service family, via `op_code_family`. Decides whether a *week* is
   the right cycle for the focus family or whether the cycle should be supply-shaped.
3. Modules across the core eight with at least one attached video. Expected: zero. The
   number tells Mitch how much attaching is left.
4. Runtime distribution for Mindset and for Pitches by Op Code. Decides whether "five
   minutes or less" survives three slots.
5. Item counts per module across the core eight — validates the ~25-mornings-per-track
   figure the duration math rests on.
6. **What the loop does today.** Current selection behavior for every slot, stated from
   the code rather than from memory. Nothing gets rewritten before it is described.

**Then the schema.** Three things need to exist:

- **`advisor_focus_family`** — the locked assignment. One active row per advisor;
  history retained. Carries the source (`derived` / `manager` / `default`) so an override
  is distinguishable from a derivation.
- **A consumption record** — read and written by both the loop and the card, which is
  what makes "watch ahead, never see it twice" work. Extend whatever exists rather than
  adding a second one.
- **Track-entry state** — how the loop knows an advisor is entering a track rather than
  mid-track. Report what already exists before adding anything.

Plus the derivation itself: focus family ranked by **missed opportunity volume**, not
attach rate.

## 3b — The loop

Two morning types. Three slots named `mindset` / `pitch` / `item`. Completion gate and
streak working on a two-slot day. Format-agnostic item rendering. No repeat inside a
cycle. Both credential counters proven to advance, entitlement proven to survive.

Blocked by 3a: the loop reads the assignment row and the consumption record.

## 3c — The Eddie's Pick card (on /advisor, not /today)

Eddie's Pick becomes focus-family progress — *Belts & Cooling - 3 of 7 - continue*.
Shares the consumption record with the loop.

Blocked by 3a **and** by service-family resolution: the card lists the films in a family,
which is exactly the query that returns nothing today.

No equivalent card on the craft side.

## 3d — Good News Story

Out of scope until Mitch approves the direction. Not blocked by code — blocked by a
decision. **Do not design schema for it speculatively.** Reversibility constraints are
recorded in `TWO_LADDERS.md`.

## What is Mitch's, in the order it is needed

| Needed for | What |
|---|---|
| 3b | Which track each film opens |
| 3b | Track order — fixed, or manager-set per advisor |
| 3b | Starting family for an advisor with no DMS history |
| 3b | Whether quotes are module items (after 3a answers the query) |
| Content, not code | Item budget for the four remaining tracks (~33 each) |
| Before Doggett | Captions on the eight track films |
| 3d | Approval of the Good News Story direction |

None of these block 3a.

## Numbered follow-ups — carried deliberately, not forgotten

These are labels with nothing behind them that we chose to create, knowing the
cost, because the alternative was worse at the time. `AGENTS.md` rule two says a
label with nothing behind it is a defect; creating one deliberately is allowed,
leaving it is not. Each has an owner and a trigger.

### F1 — Close the two vestigial coaching blocks, and the screen that counts them

**Trigger:** after the 3b/3c code is deployed. **Owner:** Ryan.

0124 deliberately does NOT close the open `coaching_block` rows — see its §2 for
why the statement was removed before it shipped. The consequence is two open
blocks that nothing reads:

| Advisor | Family | Started | Served | State |
|---|---|---|---|---|
| Ryan Kelly | Belts & Cooling | 2026-09-11 | 2 of 6 | open, vestigial after deploy |
| Demo Advisor | Filters | 2026-09-02 | 0 of 6 | open, never used |

Two things to do together, once the deploy has made them genuinely inert:

1. A tidy-up migration setting `ended_on` on both. Safe then, because the old
   engine that would have opened replacements is no longer serving.
2. **`/admin/mapping/families/confirm` reads them** — it counts "advisors
   currently mid-block on this code" to warn that an op-code ruling would change
   coaching under somebody's feet. After 3b that warning is false in both
   directions: it counts blocks that no longer drive coaching, and it says
   nothing about the advisors a ruling genuinely does affect, who are the ones
   with an `advisor_focus_family` row on that family. **The screen has to move
   to `advisor_focus_family` or lose the warning — closing the blocks without
   touching it leaves a warning that always reads zero**, which is worse than
   the wrong number it shows today.

Do not do (1) without (2).

### F2 — Provisioning a rooftop and re-mapping its advisors is ONE act

**Trigger:** before any rooftop is provisioned, including Doggett Honda Med
Center. **Owner:** Ryan, with Mitch.

A rooftop is provisioned **and** its advisors' `membership.op_code_id` values are
confirmed against the DMS roster, **together, or neither happens.**

This looks like two tickets and is one. Provisioning alone makes the advisor
**worse off**:

| | Tracie Mendoza, today | After provisioning alone |
|---|---|---|
| What she sees | "Your rooftop isn't set up" | A working-looking loop |
| Is it true? | **Yes** | **No** — it derives from `op_code_id` 626 |
| Who is 626? | — | **"Nguyen, Thomas"**, last seen 2026-01-21, absent from all six recent periods |
| Result | Honest, blocked | **Permanent two-slot morning, no error, no explanation** |

**We would have traded an honest broken state for a silent wrong one**, which is
the trade this whole phase exists to refuse.

`rooftop_product` for Doggett Honda Med Center currently holds **no row of any
kind** — so the entitlement half is one grant. The mapping half is a separate
question for whoever knows who actually writes ROs at that store.

**And it is a privacy act, not only a correctness one.** `advisor_family_attach`
is an advisor's own performance. A mis-mapped `op_code_id` shows an advisor a
**colleague's attach rates presented as their own**, and derives their coaching
from that colleague's weaknesses. See F3.

### F3 — The "whose book is this" disclosure is invisible to the role that needs it

**Trigger:** before 1 October. **Owner:** Ryan.

`app/(app)/advisor/page.tsx:114-125` exists precisely to stop somebody reading
their numbers over another person's book — its own comment says so. It reads
`dms_advisor.display_name` and renders `bookOwner` when the roster name differs
from the logged-in name.

**It cannot fire for a plain advisor.** `dms_advisor_read` (0046) grants select
to `is_platform_owner()`, `admin_rooftops()` and `managed_rooftops()` — admin
and manager only.

| Account | Roles | Reads `dms_advisor`? | Sees the disclosure? |
|---|---|---|---|
| Ryan Kelly | admin, manager, advisor | yes | **yes** — "David Esparza" |
| Mitch Hardt | admin, manager, advisor | yes | **yes** — "Erin Helton" |
| **Demo Advisor** | **advisor** | **no — RLS refuses** | **no** |
| **Tracie Mendoza** | **advisor** | **no — RLS refuses** | **no** |

So the safeguard works for the two people who could already see the roster, and
fails silently for the only two who would actually be misled. The read is a bare
`const { data: rosterRow }`, so the RLS refusal is indistinguishable from "no
roster row for this operator".

**This is the `has_performance_surface()` shape again** — a gate keyed on a role
that excludes the viewer it exists to protect — and this time it is on a privacy
surface.

Two options, and (1) is not obviously right: widen `dms_advisor_read` so an
advisor may read **their own mapped row only**, or move the disclosure to a
`security definer` function that returns just the book-owner name. Either way
the swallowed error goes.

### F4 — Signature 3 needs an explicit "this mapping is deliberate" mark

**Trigger:** before 1 October. **Owner:** Ryan and Mitch, per account.

The DMS-link detector asks "is the operator real, and did it trade recently".
By that test **three of the four app accounts pass while pointed at somebody
else's book** — Esparza, Hill and Helton. A detector whose baseline contains the
defect cannot fire on it.

The mark must be **explicit and per account, with a reason** — a column on
`membership`, set by a person. The signature then alarms on **anything
unmarked**.

**Do not infer intent from the pattern.** "Three of them are almost certainly
deliberate" is the reasoning that produced the blind baseline in the first place.

### F5 — The one ruling PR #7 had that 0125 does not: precedence on disagreement

**Trigger:** before anyone tags content with a family and an op code that point
different ways. **Owner:** Mitch's ruling, Ryan's call on whether it needs SQL.

PR #7 (`0123_resolved_service_family.sql`) was closed as superseded by 0125.
Read in full before closing; it contained **one decision 0125 never made.**

When a content row carries **both** an explicit `service_family` **and** an
`op_code` resolving to a *different* family:

| | Behaviour |
|---|---|
| PR #7 — `coalesce(service_family, resolved)` | **Explicit wins.** One family. *"A cue that names its family is not second-guessed by an op code it happens to carry."* |
| 0125 — `UNION` of both arms | **Both.** The row appears on both shelves. |
| 0117 `my_certification_progress` | **Both** (an `OR` with `distinct`) — so 0125 is consistent with what already shipped. |

**Measured on production: 714 published rows carry both, and all 714 agree.
Zero disagreements.** So the two implementations return identical answers today
and nothing is broken — but only PR #7 had *decided* what happens when that
stops being true.

0125 is not wrong; it matches 0117, which is what the certification catalogue
has always done. The gap is that the answer is **emergent rather than ruled**.
Either is defensible; leaving it undecided until a cue disagrees is not.

Also worth carrying forward, and cheaper than a migration:

- PR #7 marked `content.service_family` with `comment on column … 'SUPERSEDED as
  the authority by 0123 … deliberately not backfilled: two sources that can
  drift is the bug, not the cure.'` **0125 left no such marker.** The next
  person to read the column has nothing telling them it is no longer the
  authority.
- PR #7's `content_service` is a **`security_invoker`** view returning
  `content.*` plus a resolved column — a drop-in for reading `content`. 0125's
  `service_family_content` is a definer *mapping* view, which is why
  `loadFamilyContent` pages it by hand and why F-list item
  `lib/service-family.ts:132` exists at all. If that pager is ever rewritten,
  the invoker-view shape is the better starting point.

### F6 — The last display surface still reading `current_len` raw

**Trigger:** before 1 October. **Owner:** Ryan. **Not a patch — a proper fix.**

`lib/admin-advisor-detail.ts:289` feeds `/admin/engagement` and
`/admin/rooftop/[id]`. Every advisor-facing surface now asks `swellAsOf`; this
one still reads the stored number, so a manager can be shown a Swell that has
been dead since last Wednesday.

**It was left out of the hotfix deliberately.** `loadAdvisorDetails(client,
userIds, today)` takes no rooftop and loads no closures, and
`countMissedWorkDays` without closures counts a shut store as a missed day. The
quick version would therefore tell a manager that a **live** streak is gone.

> A manager congratulating somebody on a stale streak is awkward. Telling
> somebody their live streak is dead is a wound. **Trading an over-report for an
> under-report is not a hotfix.**

The fix is to thread the rooftop and its confirmed closures through the bulk
loader so `swellAsOf` can be called per advisor with a complete context — the
same three inputs `loadScheduleContext` already assembles for one user, batched.
Do it properly or leave it reading raw; do not do it halfway.

## Standing rules, unchanged

`pg_dump` before every prod migration. Migrations left written and validated on a full
local replay — **Ryan applies them**. Code does not commit. Every report ends with
`git status -sb` showing no ahead count.
