# Provision the roster first, then invite

*12 October 2026. Ryan: "I should provision them first in the system based on
what they are, then send the invites. I don't want them signing up and waiting
on me for anything."*

**Nobody at Beaumont has been invited.** One test invite went to a Pear address
and its account has been removed. The roster needs nine email addresses that I
do not have; until they are filled in, the runner refuses every row.

---

## 1. The roster, as drafted

`reports/beaumont-roster.csv` — **nine people, every email cell `FILL-IN`.**

| name | roles | book |
|---|---|---|
| Lance | `admin:org` | — admin at all 11 Doggett rooftops |
| Valerie Patterson | `manager;advisor:500570` | Patterson, Valerie (500570) — 41 ROs |
| Matthew Reck | `manager;advisor` | none — 530029 is dead, never mapped |
| Destiny Booker | `advisor:274` | Booker, Destiny (274) — 136 ROs |
| Mathew Martin | `advisor:747` | Martin, Mathew (747) — 6 ROs |
| Konner Upshaw | `advisor:710` | Upshaw, Konner (710) — 24 ROs |
| Austin Abate | `advisor:902050` | Abate, Austin (902050) — 140 ROs |
| Sztaba | `advisor` | none — 831000 is not in the DMS data |
| Pinder | `advisor` | none — maps to 500573 once the light-track floor is live |

Drawn from `reports/beaumont-first.md` and the 30 September roster; the five
mapped names are the DMS display names for those op codes, read from
`dms_advisor` rather than typed.

**Four things to correct before this is the input:**

1. **The nine email addresses.** Nothing can run without them.
2. **Lance's full name.** `grant:beaumont-roles` only ever knew `--as=lance`,
   and he has no DMS row to read a name from.
3. **Sztaba's and Pinder's full names**, for the same reason.
4. **Pinder's future op code looks wrong.** `beaumont-first.md` says she maps
   to **500573** once the light-track floor is live. **500573 is
   "Tiner, Amanda"**, and 500573 has **0 ROs** in the August period. That is
   either a different person or a stale mapping; it is not this run's to decide,
   and it is not in the roster today — she is `advisor` with no op code, which
   is what the grant script does now. Worth a look before the floor ships.

Martin's 6 ROs are below the coaching floor of 20, so his pitch slot will be
empty until a period carries more. That is correct behaviour, not a provisioning
fault, and the dry run will say so per person.

---

## 2. The change

**`scripts/provisioning.ts`** — new. The checks **lifted** out of the two
existing scripts: `findAuthUserByEmail`, `resolveRooftop`, `orgRooftops`,
`resolveOperator`, `opCodeHeldByOthers`, `whoseBook`, `ensureAppUser`,
`ensureMembership`, `ensureRooftopProduct`, `parseRoles`. All three scripts now
import it; none re-implements any of it.

The one behavioural change the lift required: **every check returns a result
instead of exiting.** `provision:advisor` provisions one person, so dying on the
first refusal was fair. The roster runner provisions a store — one bad op code
in row four must refuse row four and still report rows five to nine, or a store
launch becomes nine separate investigations. `provision:advisor` still dies on
the first one, through a three-line `must()` wrapper.

**`scripts/provision-roster.ts`** — new.
`npm run provision:roster -- --file=… [--apply] [--resend]`, `SB_URL`/`SB_KEY`
like the others. Dry run is the default.

Per row, in order: resolve the file's own fields → resolve the rooftop → expand
roles into concrete grants → **run every op-code check** → invite → write
`app_user`, the membership rows, the org-wide admin, and `advisor_base`.

**A row that refuses sends no invite.** Every check runs before
`inviteUserByEmail`, and a refused row prints `no invite was sent for this row`.

### The invite-to-rows gap

`app_user.id` **is** the auth id, so there is no row to write until Supabase has
minted a user. The order inside a row is therefore fixed: invite, then rows.

What that costs is the gap between two statements inside one loop iteration —
under a second. **The gap being closed is the old one**: the hours or days
between an invite being sent and a person accepting it, which is where the four
Beaumont people with no book would have landed with nothing.

---

## 3. The dry-run plan

On the draft roster, every row refuses for the right reason:

```
  provision:roster — DRY RUN, nothing sent and nothing written
  file: reports/beaumont-roster.csv   rows: 9

    2  Lance  <fill-in>
       REFUSED — "fill-in" is not an email address — the draft roster ships with FILL-IN here
       no invite was sent for this row
    …
   10  Pinder  <fill-in>
       REFUSED — "fill-in" is not an email address — the draft roster ships with FILL-IN here
       no invite was sent for this row

  ────────────────────────────────────────────────────────────────────
    9  refused
  ────────────────────────────────────────────────────────────────────
```

And the shape a filled row produces, from the test row:

```
    2  Roster Test  <ryan+roster@pearanalytics.com>
       invite: NEW
       advisor on op 902050
       op 902050 = Abate, Austin (902050)  last seen 2026-08-31  NAME DOES NOT MATCH — deliberate borrow, or a mistake?
       would write: app_user, 1 membership(s), advisor_base on Doggett Ford of Beaumont
```

The `FILL-IN` placeholder is the safety, not a formality: a half-completed
roster **cannot** be applied, because every unfilled row refuses before the
invite. Reserved domains (`example.com`, `.invalid`, `.test`) refuse for the
same reason.

---

## 4. The test row — applied, proven, removed

`ryan+roster@pearanalytics.com`, `advisor:902050`, applied alone.

**Apply:**
```
    2  Roster Test  <ryan+roster@pearanalytics.com>
       invite: SENT
       op 902050 = Abate, Austin (902050)  … NAME DOES NOT MATCH — deliberate borrow, or a mistake?
       app_user created
       created advisor  at Doggett Ford of Beaumont on op 902050
       advisor_base exists on Doggett Ford of Beaumont
```

**Re-apply (proof 3):** `invite: skipped, already pending` · `app_user exists` ·
`exists advisor … on op 902050`. Nothing re-sent, nothing duplicated.

**The password step.** The invite's own action link (minted with
`generateLink`, which returns what the email carries) was followed in a browser:
the app's set-password screen rendered, a password was set, and the confirmation
read *"Welcome to EDIAGD — You're all set."* Verified rather than inferred by
signing in with that password through `supabase-js`:

```
SIGN-IN OK — the password set through the invite link works.
  email_confirmed_at: 2026-10-12T19:34:34Z
  full_name from invite metadata: "Roster Test"
  app_user: {"full_name":"Roster Test"} | memberships: [advisor, op 902050, active]
  work_schedule: ABSENT (onboarding will ask)
```

**The first morning.** `/today` opened on the closure card — Beaumont is shut
for Columbus Day, which is the closure calendar working — and
*"Take today's rep anyway"* opened the real morning: the four-slot progress bar,
*"GOOD AFTERNOON, ROSTER"*, and the mindset film playing. Nothing on any screen
asked for Ryan.

The book behind that morning, from the shared read-back:

```
  WHOSE BOOK
    op code 902050  =  Abate, Austin (902050)
  THE BOOK  (period 2026-08-01 → 2026-08-31)
    repair orders      140      coaching floor 20 — PASSES
  RANKED FAMILIES
    -> Filters   13.02 missed ROs   9.3pp   9 films
  THE MORNING
    1 mindset FILLS · 2 pitch FILLS (Filters, 9 films) · 3 item FILLS
    => normal (three slots)
```

Screenshots: `reports/roster-proof/`.

**Honest limits on this proof.** Two things I could not do and did not claim:

- **I cannot confirm the email arrived** — it went to Ryan's inbox, not one I
  can read. What is proven is that the invite was sent, the account exists, and
  the link that email carries sets a working password.
- **Onboarding was walked, not completed by clicking.** The flow rendered and
  greeted *"Aloha, Roster."* with the name the roster supplied, and advanced
  through its first screens; the blind clicker then fought the day-picker, so
  the `work_schedule` row was written directly in the same shape
  `lib/schedule-actions.ts` upserts. The provisioning is what was under test;
  the onboarding UI is unchanged by this work.

**Cleanup, read back rather than assumed:**
```
  auth account still present: no
  op 902050 held by: nobody — free for Ryan's apply
  Beaumont memberships now: Test Advisor (advisor, no op) — the pre-existing one
```

---

## 5. First sign-in — it already treats a provisioned account as normal

Checked rather than assumed, and the answer is good:

| what | finding |
|---|---|
| `app_user` | `lib/schedule-actions.ts` has its own `ensureAppUser`, which returns *"app_user already present"* when the row exists and treats a 23505 as success. It was written **because** nothing in the product creates that row; with the roster runner it simply never fires. |
| `membership` | **Nothing in the app inserts one** — grepped across `lib`, `app`, `components`. There is no path by which the app can duplicate or contradict the roster's rows. |
| `work_schedule` | The only thing first sign-in writes, via `upsert` on `onConflict: user_id`. **The roster deliberately does not write it** — the week is the advisor's to choose, not Ryan's to set. |
| the onboarding gate | `app/(app)/layout.tsx` redirects to `/onboarding` unless a schedule row exists. A provisioned advisor has memberships but no schedule, so they onboard once and land on a working morning. Confirmed live. |
| the name | `inviteUserByEmail(email, { data: { full_name } })` puts the roster's name in user metadata, which is both what `app_user` gets and what the app's fallback would read. The onboarding screen rendered *"Aloha, Roster."* |

**No change was needed.**

---

## 6. The old scripts still run

Both kept — they still cover the one-off, a new hire or a changed book — and
both dry runs verified after the lift:

- `grant:beaumont-roles --as=lance --dry` → reads back all 11 Doggett rooftops,
  `NEVER is_platform_owner`, one `would` line each.
- `provision:advisor --dry` → full morning projection, whose-book read-back,
  ranked families, the three slots.

**The lift caught a regression I introduced.** I had made the grant script's
"never repoints a book" rule refuse **every** op-code change, including
`null → 500570`. That is not repointing — it is the documented mapping step, and
`beaumont-first.md` has two people waiting on it ("one `provision:advisor` run
maps Sztaba when a period carries 831000"; Pinder maps to 500573 once the floor
is live). A blanket refusal would have broken the script's purpose while looking
like caution. The rule is now asymmetric:

```
current === target          exists, writes nothing
current null, target set    UPDATES — mapping a book onto a membership with none
anything else               REFUSES, including set -> null
```

The `provision:advisor` dry run is what surfaced it.

---

## 7. The exact apply command

Once the nine emails are in `reports/beaumont-roster.csv`:

```bash
cd ~/ediagd
set -a; source .env.local; set +a
SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  npm run provision:roster -- --file=reports/beaumont-roster.csv            # dry run, read it
SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  npm run provision:roster -- --file=reports/beaumont-roster.csv --apply    # sends 9 invites
```

Read the dry run first — the whose-book line for each of the five mapped
advisors is the thing only a person can check, and it is why the read-back
exists.

`--resend` re-sends to anyone who has not yet set a password. It is never
needed on a first run.

---

## 8. Checks

`tsc --noEmit` clean · `eslint` 0 errors (13 pre-existing warnings, none in the
new files) · both old scripts' dry runs verified · the service-role key appears
in no file in the repo.
