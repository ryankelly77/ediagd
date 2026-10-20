# Beaumont roster, checked against what is provisioned

**Ryan, 20 October.** His list, verbatim:

> Valerie — Drive manager
> Austin Abate — Advisor
> Konner Upshaw — Advisor
> Destiny Booker — Advisor
> Heather Sztaba — Advisor

Read-only against production, 20 October. Rooftop
`84bef302-ebd2-4536-ba9f-693c535f10d4`, Doggett Ford of Beaumont. Nothing was
changed.

---

## First, a correction I owe

My 15 October push audit opened with *"the population is the 9 active advisor
memberships at Beaumont"* and then reported on it as if it were the store's
advisor roster. **It was the query's population, not the store's.** The query
was `role = 'advisor' AND active`, and that set includes two people who are
*also* managers, plus a test account. By Ryan's list the advisor count is
**four**.

Everything the audit said about those nine is still true of those nine. What
was wrong is the label on the table. That is this project's most-repeated
mistake and I made it on the line that introduced the measurement.

---

## His five

| Ryan says | Provisioned as | Op code | Verdict |
|---|---|---|---|
| **Valerie** — Drive manager | **manager _and_ advisor** | 500570 (on the advisor row) | **extra advisor membership** |
| **Austin Abate** — Advisor | advisor | 902050 | ✓ |
| **Konner Upshaw** — Advisor | advisor | 710 | ✓ |
| **Destiny Booker** — Advisor | advisor | 274 | ✓ provisioned, **never signed in** |
| **Heather Sztaba** — Advisor | advisor | **none** | **unmapped** |

All five have accounts. Two have something wrong with them.

**Valerie Patterson** holds two memberships at this rooftop — `manager` and
`advisor` — which the schema allows (`unique (user_id, rooftop_id, role)`). The
advisor one is why she is counted as an advisor everywhere: the Rollcall, the
Slack post, and the push generator all select `role = 'advisor'`. She is also
the most engaged person at the store: **7 app-days and 6 completed mornings, all
on web.** So the advisor membership is not dormant — she is using the advisor
morning daily.

**Heather Sztaba has no `op_code_id`.** The DMS has her as
`Sztaba, Heather (831000)`, first seen 15 September, last seen 30 September.
Unmapped means no volume to read, so Eddie's Pick has nothing to coach her on —
and `return` pushes require `op_code_id is not null`, so she could never receive
one even with a phone. She onboarded **today** and completed her first morning.

---

## Five accounts not on his list

| | Role | Op code | DMS | App use |
|---|---|---|---|---|
| **Mathew Martin** | advisor | 747 | `Martin, Mathew (747)`, active to 30 Sep | never signed in |
| **Matthew Reck** | **manager + advisor** | none | `Reck, Matthew (530029)`, last seen **Oct 2025** | 3 days, 2 mornings, iOS |
| **Amanda Pinder** | advisor | none | no `Pinder`; there is `Tiner, Amanda (500573)` | 1 day, 1 morning, web |
| **Lance Parish** | admin | — | — | never signed in |
| **Test Advisor** | advisor | none | — | `ryan+beaumont@pearanalytics.com` |

- **Mathew Martin** is writing ROs at the store under op 747 through 30
  September but is not on the list and has never opened the app. Still there?
- **Matthew Reck** is the mirror of Valerie: manager *and* advisor, actively
  using the advisor morning, and his DMS operator has been quiet for a year —
  which is what a promotion off the drive looks like.
- **Amanda Pinder** is using the app and is not on the list. The DMS has an
  Amanda at a different surname. **Not assumed to be the same person** — a name
  match returns the wrong row without erroring, and this one would attach
  somebody else's book to her account.
- **Lance Parish** is `admin` at **eleven** Doggett rooftops. Group admin,
  correctly absent from an advisor list, nothing to do.
- **Test Advisor** is the test account. Harmless, but it is one of the nine the
  Rollcall and the Slack post count as an advisor.

---

## Who is actually using it

| | Onboarded | App days | Mornings | Sessions |
|---|---|---|---|---|
| Valerie Patterson | 12 Oct | 7 | **6** | web ×7 |
| Austin Abate | 12 Oct | 5 | **4** | **iOS** ×5 |
| Matthew Reck | 12 Oct | 3 | 2 | **iOS** ×3 |
| Konner Upshaw | 19 Oct | 2 | 2 | **iOS** ×2 |
| Heather Sztaba | **20 Oct** | 1 | 1 | **iOS** ×1 |
| Amanda Pinder | 19 Oct | 1 | 1 | web ×1 |
| Destiny Booker | — | 0 | 0 | — |
| Mathew Martin | — | 0 | 0 | — |
| Lance Parish | — | 0 | 0 | — |
| Test Advisor | 1 Oct | 4 | 0 | — |

This has moved a long way since 15 October, when four of nine were onboarded and
two had ever opened a phone. **Six people have now completed a morning and four
are on the iOS build.**

---

## And push is still blocked, for a reason worth chasing

Re-checked today, with the column names verified first:

- **Zero `device_push_token` rows** for anybody at Beaumont.
- **Zero `user_notification_pref` rows** — the soft-ask card has never been
  *shown* to anybody here. (`record_soft_ask` writes that row on show, not on
  answer.)

That second number is the interesting one now. Four people have completed
mornings **inside the iOS shell**, and `shouldOfferSoftAsk` returns true for
every one of them: no live token, `soft_ask_count = 0`, `completions >= 1`. The
card should have appeared. It has not, for anyone.

**What that narrows it to, and what it does not.** Either the card is not
rendering, or it renders and `noteSoftAskShown()` is not landing. Their
`signed_in` events carry `platform: 'ios'`, which comes from the same
`nativePlatform()` bridge the card's `isNative()` gate uses — so the shell is
being recognised. That points at where the card sits (the sign-off screen at the
end of the flow) rather than at platform detection, but **I have not established
which, and I am not going to guess.** It needs a device or a repro.

Worth saying plainly: until this is fixed, nothing in the push work ships any
value at Beaumont — not the cadence, not the new `push_return` view, none of it.
Everything downstream is correct and waiting on a card nobody has seen.

---

---

## What Matthew Reck is seeing, and where

> *"I am going through some of the other parts of the App and noticed a few old
> advisors… Can you please clean the list."* — 20 October

**One surface shows a manager a list of advisors: `/manager`.** `/meetings`
lists none, and the `/admin/*` roster screens need the `admin` role — Lance
Parish has it, Reck does not. He also holds an advisor membership, but those
screens are about his own numbers.

**The list is not built from who has an account.** It comes from
`advisor_period_totals` for the latest `perf_period` — **September 2026**, the
last closed month — so it is *whoever wrote ROs that month*. Leaving the company
does not take you off last month's numbers.

The seven rows, exactly as rendered:

| Shown as | Op | ROs | Labor $ | DMS last seen | App account |
|---|---|---|---|---|---|
| **Amanda Tiner** | 500573 | 1 | $40 | 3 Sep | **none** |
| Austin Abate | 902050 | 87 | $44,017 | 30 Sep | ✓ advisor |
| Destiny Booker | 274 | 108 | $46,668 | 30 Sep | ✓ advisor |
| Heather Sztaba | 831000 | 48 | $7,877 | 30 Sep | **none — unmapped** |
| Konner Upshaw | 710 | 60 | $11,421 | 28 Sep | ✓ advisor |
| **Mathew Martin** | 747 | 40 | $6,879 | 30 Sep | ✓ advisor |
| Valerie Patterson | 500570 | 33 | $15,873 | 30 Sep | ✓ advisor |

**The two he means are Amanda Tiner and Mathew Martin** — which matches "a few",
and matches Ryan's read that both are being dropped.

Three things to be careful of before touching it:

- **"Amanda Tiner" is not the "Amanda Pinder" account.** The roster shows the
  DMS name against op 500573. The app account *Amanda Pinder* has no op code, so
  she does not appear on this screen at all. Same first name, two different
  rows, and nothing in the data says they are one person.
- **Heather Sztaba appears here only because of the DMS name.** She is a current
  advisor with no `op_code_id` on her membership. Cleaning by "remove anyone
  without an app account" would delete a working advisor and keep both of the
  stale ones.
- **Valerie is on this list** — op 500570, 33 ROs. Whatever is decided about her
  manager/advisor memberships, she is genuinely in the September numbers.

### Deactivating their accounts will not clean it

Worth saying before anybody tries. The roster maps **every row of
`advisor_period_totals`** with no filter on membership and no filter on
departure — verified by reading the assembly, not assumed.

There *is* a proper departure mechanism: `set_advisor_departed(rooftop, op,
date, note)` (0053), callable by a manager, which stamps `departed_on` and
deactivates the membership in one transaction. And there is already an agreed
rule for what a departure means to a period:

```sql
and (d.departed_on is null or d.departed_on >= p.starts_on)
```

**But that rule is only on `family_store_benchmark`** — the store average. The
roster list never adopted it. So departing them correctly would take them out of
the store average and leave them on the screen.

That is this file's standing pattern again: the fix went exactly where the bug
was found, and nobody asked who else reads the same list raw.

**The fix is one condition on the manager page**, reusing the rule that already
exists rather than inventing a second one. Note what it will and will not do:
both of them genuinely worked in September, so `departed_on >= starts_on` keeps
them in the **September** view and drops them from **October onward**. If the
list must be clean *now*, that is a different and stronger rule — "exclude
anyone departed as of today" — and it would make the September figures disagree
with the September store average, which is the sort of quiet contradiction worth
deciding on purpose rather than by accident.

Either way it self-corrects once the October period loads: Amanda Tiner has no
October volume at all, and Mathew Martin has none after 30 September.

## What I did not do

Nothing was changed. Every item below alters a real person's account — which
surfaces they see, or whose numbers they read — and `membership.op_code_id`
already pointed four accounts at other people's books once.

**Ready to go on your word:**

1. **Valerie** — drop the advisor membership, keep manager? She is using the
   advisor morning daily, so this would take it away from her. If a Drive
   manager should still get the morning, the right fix is to leave her as she is
   and teach the Rollcall to count by primary role instead.
2. **Heather Sztaba** — map to op **831000**. Unambiguous in the DMS, and the
   same shape as the other four.
3. **Matthew Reck** — same question as Valerie.
4. **Mathew Martin** — still employed? If not, deactivate; if so, he needs
   chasing, not provisioning.
5. **Amanda Pinder** — is she `Tiner, Amanda (500573)`, and is she an advisor?
6. **Destiny Booker** — provisioned and mapped, has never signed in. Chase.

---

## Done, 20 October

Ryan: *"do all 3, drop them now and map heather."*

### 1. Departed, with the reason on the row

`set_advisor_departed` — the 0053 transaction, which stamps the roster and
deactivates the membership together so the two cannot drift.

| Op | | `departed_on` | Membership |
|---|---|---|---|
| 500573 | Tiner, Amanda | 2026-09-03 | **0 deactivated** — see below |
| 747 | Martin, Mathew | 2026-09-30 | 1 deactivated |

**The date is each one's last DMS activity, not today.** 0053 defines the column
as *"Last day this advisor worked at this rooftop"*, so today would have been
the day we recorded it rather than the day they left. The recording date and
the reason are in `departed_note`: *"Matthew Reck, 20 Oct 2026: complete advisor
list excludes them."*

Refused-by-construction before writing: both rows had to exist, and neither
could already carry a `departed_on` — overwriting somebody else's departure
decision with a fresh one is not a thing this should be able to do by re-running.

### 2. The roster filter

`splitDeparted` in `lib/manager.ts`, applied on the manager page after the trend
is attached and before `teamPriorities`, so "N advisors are pursuing this"
counts people who can actually be coached.

**10 pure assertions** (`npm run test:manager-roster`). The ones that matter are
not the hides:

- **the five who must survive do** — a function that hid everybody would pass
  every "it hides departed advisors" test;
- **Heather Sztaba in particular**, because she had no app account at the time
  and a "remove anyone unmapped" rule would have deleted a working advisor and
  kept both stale ones;
- **an operator with no roster row at all is SHOWN**, not hidden. The rule keys
  on a column and nothing guarantees that column is written, so an absent row
  has to mean "still here" — getting that backwards takes a new advisor off
  their manager's screen in their first month;
- **an empty map — the shape of a failed read — hides nobody**, and the page
  renders a warning for that case instead of a silently short list.

### 3. Heather mapped

Through `npm run provision:advisor`, not a hand-written UPDATE, so the existing
guards ran: the op code must be a real undeparted operator at this rooftop, and
it must not already be claimed. The dry run reported `op code 831000 = Sztaba,
Heather (831000)` and **"matches the account name"** before anything was
written.

Her morning changes with it: 48 ROs clears the coaching floor of 20, so the
pitch slot fills on Fuel System and she moves from a two-slot morning to three.

### The result

```
/manager roster, period 2026-09-01 → 2026-09-30

  SHOWN (5)
    Austin Abate        op 902050    87 ROs
    Destiny Booker      op 274      108 ROs
    Heather Sztaba      op 831000    48 ROs
    Konner Upshaw       op 710       60 ROs
    Valerie Patterson   op 500570    33 ROs

  HIDDEN (2) — named on screen, not silently dropped
    Amanda Tiner        op 500573   departed 2026-09-03
    Mathew Martin       op 747      departed 2026-09-30
```

Exactly Reck's list.

### Who else reads an advisor list raw

The question this bug was an answer to, asked everywhere rather than only where
it was found. Two paths, both now covered:

- **Period-based** (`/manager`) — fixed here by the departure filter.
- **Membership-based** (`loadOnboardingStatus` → the admin Rollcall and the
  17:30 Slack post) — needed nothing, because `set_advisor_departed` deactivates
  the membership in the same transaction. Mathew Martin dropped off both
  automatically.

### Still open, and deliberately not acted on

**The `Amanda Pinder` account was not touched** — `memberships_deactivated: 0`.
Departing op 500573 marked *Tiner, Amanda* on the DMS roster; the app account
*Amanda Pinder* carries no op code, so the transaction had nothing to deactivate
and she is still an active advisor. She completed a morning on 19 October.

Reck's "complete list" has no Amanda on it, so her account probably should go —
but whether Pinder and Tiner are one person is the thing I said I could not
establish, and deactivating somebody who used the app yesterday on an inference
I had already refused to make is not a call to make quietly. **One question for
Mitch or Reck: is Amanda Pinder the same person as Tiner, Amanda (500573), and
should her login be switched off?**

Two other active advisor memberships are not on Reck's list either, and both are
understood: **Matthew Reck's own advisor membership** (the manager/advisor
duplicate, still awaiting the Valerie ruling) and **Test Advisor**. Neither
appears on `/manager` — no op code means no September volume means no roster row
— but both are still counted as advisors by the Rollcall and the Slack post.
