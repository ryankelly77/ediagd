# MOC references and branded product names a user can see

> **RULED, 24 November 2026 — `ABT-054` keeps the label `Arctic Blast`.** Ryan:
> *"Arctic Blast is a product that Doggett uses, so we are not violating
> anything. We should remove it at some point if we roll out to other dealers who
> do not use that product, but I think it can stay for now."*
>
> So §2 and §4 below are **closed, not open**. One correction to what §2 first
> implied: `reports/manager-meetings-library-adjustments.md` records that Mitch
> retitled the meeting *"to comply with the cease and desist from MOC"*, which
> made it look as though the catalog label might be covered too. It is not — the
> rename was about the meeting title, and the product is one Doggett actually
> buys.
>
> **The condition is the part to keep.** The label becomes wrong on the day the
> first rooftop that does not use the product is onboarded, and nothing will
> announce that day. Trigger written down here so it is met deliberately: the fix
> is one line in `data/op_code_seed.csv` plus a re-seed.

**Read-only. Nothing in this report was changed.** Step 3 of Ryan's 21 November
prompt: find every place the manager meetings library text or the op code catalog
shows a user a MOC reference or a branded product name, including the catalog
label for ABT-054. Ryan decides what, if anything, gets renamed.

**Scope stated before the finding.** Three populations, measured separately
because they have different owners and different fixes:

1. Mitch's three new library files in `drop/` — the workbook, the cheat sheet,
   the teleprompter lines.
2. `op_code_catalog`, as seeded from `data/op_code_seed.csv` (73 codes).
3. The existing repo, for context only — not swept, because a prior pass already
   covered the films and it is somebody else's to act on.

---

## 1. Mitch's new library is clean. This is the good news and it is load-bearing

**Zero MOC references across all three files.** `pdftotext` over the cheat sheet
and the teleprompter lines finds no occurrence of "MOC" in any case, and the
workbook has exactly one — in its own README, which says so deliberately:

> *"No MOC references. No op codes on this sheet."*

So Mitch wrote this library to the rule already. Worth recording because it means
**nothing in the 213 loaded rows needs editing**, and a future reader who finds
MOC elsewhere in the product should not assume this library is implicated.

**No branded product name appears in the library's own prose either.** The one
place a brand could have leaked in is the A/C performance meeting, and Mitch
writes the generic service phrase — *"an A/C performance treatment"* — not the
product name. See §2, where the catalog does the opposite.

---

## 2. The catalog: one branded name, and 0182 just widened who can read it

`op_code_catalog.name` is the label the app shows for an op code. Of the 73 seeded
codes, **exactly one is a brand**:

| code | catalog `name` | what it is |
|---|---|---|
| **ABT-054** | **`Arctic Blast`** | A/C performance treatment. A product name, not a service. |

Everything else in the 73 is descriptive — `Engine Air Filter`, `Brake Fluid
Flush`, `Fuel System Cleaner`. `BFF-013 Brake Quiet` is the only other
product-flavoured label and it reads as a service outcome rather than a brand.

**Who can see it today:** admins only. Every surface that selects
`op_code_catalog.name` is under `app/(app)/admin/` —
`admin/mapping/op-codes`, `admin/mapping/families`,
`admin/mapping/dealer-codes/op-code` and `lib/content-detail.ts` (the admin
content editor). There is no non-admin render of the catalog name in the app
today; checked by grep over `app/`.

**Who can see it next, and this is the point of raising it.** `0182` widened
`op_code_catalog_read` to `managed_rooftops()` so that the meeting screen can name
the op code its film teaches — that was the whole purpose of slice 1. The plan's
slice 6 then shows that name to a **manager**. So the first non-admin human to
read the word "Arctic Blast" in this product will be a service manager running a
Monday meeting, and the film they are watching will be calling it an *A/C
performance treatment*.

**Two labels for one thing, disagreeing, on one screen.** That is the concrete
cost, and it is a question for Ryan rather than a defect to fix here:

- **Rename `ABT-054` to a generic label** (e.g. `A/C Performance Treatment`) —
  agrees with Mitch's prose, agrees with the catalog's own convention for the
  other 72, and removes a vendor name from a customer-adjacent screen. The
  catalog is seeded from `data/op_code_seed.csv`, so this is a one-line data
  change plus a re-seed, not a migration.
- **Leave it.** "Arctic Blast" is what the dealership orders and what the shop
  calls it, and a manager may recognise it faster than a generic phrase.

Not changed either way: it is a naming decision about Mitch's product catalogue,
and §4 records why the mechanical change is small whenever Ryan wants it.

### A second, smaller inconsistency in the same place

The catalog spells it **`AC`** — `ACR-047 AC Recharge`, `ACS-048 AC System
Check`, `ACE-053 AC Evaporator Cleaning`, `MNU-007 AC Service Menu`. Mitch's
workbook spells it **`A/C`** — three boost meeting titles keep the slash.

Ruling 5 happens to resolve this for the fourth one: *"AC Performance"* matches
the catalog's convention. The other three (`A/C Recharge`, `A/C System Check`,
`A/C Evaporator Cleaning`) do not. Ryan's call, and a reason to decide it
deliberately: those three slashes are also the four-titles-contain-a-slash
parsing hazard recorded in `reports/MANAGER-MEETINGS-PLAN.md`, so a decision to
drop them would simplify the ingest as a side effect. **Not reslated here** —
AGENTS.md is explicit that a film keeps the name Mitch gave it and the routing
decision is recorded separately.

---

## 3. The existing repo, for context — not swept, and not this branch's to fix

MOC is present in the product today, outside the manager meetings library:

- **`supabase/curriculum/curriculum_map.csv`** carries a whole course named
  *"The MOC Warranty Program"*, and knowledge-note rows that name **MOC Products
  Company, Inc.** with its address and phone number. There are also two rows that
  teach advisors *not* to say vendor names to customers — *"Vendor names — MOC,
  Mighty, BG, Valvoline … should never come out of the advisor's mouth"* — which
  is the product being internally consistent about the rule while the catalog
  label breaks it.
- **`reports/moc-in-the-films.md`** is a prior read-only scrub, run twice (22
  October and 11 November) for MOC, Mock *and* Arctic Blast across the film
  transcripts. Its finding: 9 mentions across 6 films, all in "Coverage is Key",
  and 8 of the 9 are **captioned wrongly as "mock"** — a live caption defect it
  already documents.

**Deliberately not swept.** The films and the curriculum belong to other work,
`reports/moc-in-the-films.md` already covers the transcripts better than a fresh
pass would, and this branch's question was the manager meetings library and the
catalog. Saying "the repo is clean" on the strength of the two populations I did
measure would be a scoped measurement reported as a general one.

---

## 4. Asked, and answered

> **Does `ABT-054` keep the catalog label `Arctic Blast`, now that a manager will
> read it on the meeting screen next to a film that calls it an A/C performance
> treatment?**

**Answered 24 November: yes, for now.** It is a product Doggett uses, so there is
nothing to comply with, and a manager recognising the name is a point in its
favour. Revisit on rollout to a dealer that does not use it.

Kept because it is still true of the mechanics. If it changes: `data/op_code_seed.csv` and `data/op_code_family_map.csv` carry the
name, `scripts/seed-op-codes.ts` re-seeds it, and nothing joins on `name` — every
join is on `code`, so a rename cannot break a mapping. If it stays, the only
action is to know that the two words will appear together.

Two smaller things, for the same sitting:

- the `AC` / `A/C` spelling across the three remaining A/C boost meeting titles;
- whether the curriculum's *"The MOC Warranty Program"* course title is intended
  to be user-visible, which is somebody else's branch and is noted here only
  because the question arrived with this one.
