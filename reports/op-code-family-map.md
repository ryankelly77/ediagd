# Catalog code → service family — proposed mapping

**Date:** 2026-08-31 · **Draft for Ryan to rule on, then Mitch to confirm.**
**CSV:** `data/op_code_family_map.csv` — 73 rows, one per catalog code.

Families spelled exactly as `SERVICE_FAMILIES` in `lib/dms/mapping.ts` (20 of
them). No code was invented and no family was invented without saying so.

| Confidence | Rows | |
| --- | ---: | --- |
| **high** | 44 | name or category settles it; no judgement involved |
| **medium** | 9 | defensible either way, one reading is clearly better |
| **low** | 20 | **your call** — listed in full below |

---

## The 20 that need a decision

### 1 · Four codes have no family at all (4)

These need a **decision about the family list**, not about the mapping.

| Code | Name | |
| --- | --- | --- |
| `CPC-051` | Charge Port Cleaner | EV work. Proposed new family: **EV & Hybrid** |
| `HYB-064` | Hybrid / EV Maintenance | same — **and the EV Hybrid tab has 89 draft rows waiting on it** |
| `DPF-059` | Diesel Particulate Filter Service | an emissions service, not a filter sale |
| `MNU-004` | Tire & Brake Menu | spans *two* families; cannot map to one |

The EV pair is the urgent one: without an **EV & Hybrid** family, the 89
re-imported EV/Hybrid cues have no `service_family` and stay unreachable by the
loop — exactly the Q5 hazard the mapping exists to close.

### 2 · The eleven menus (11)

`MNU-001` … `MNU-011` are **bundles, not services**. A menu is how three
services are sold together; there is no menu attach rate to be below benchmark
on. I have proposed the family of whatever each menu leads with, but my
recommendation is to **exclude all eleven from the loop** — map them for
reporting, never coach them. `MNU-004` (Tire & Brake) proves the point: it
cannot have one family.

### 3 · The oil-change orbit (3)

| Code | Name | Proposed | Why it's a call |
| --- | --- | --- | --- |
| `OF-008` | Oil Filter | **Oil Change** | Catalog says Filters. An oil filter is never sold alone — coaching it as a Filters gap coaches the wrong conversation. This is the case you flagged. |
| `EFL-046` | Engine Flush | **Oil Change** | An oil-change add-on. Fluids is arguable. |
| `OAD-063` | Oil Additive | **Oil Change** *(medium)* | Same reasoning. |

If you'd rather these three stay in Filters/Fluids, say so and the whole orbit
moves together — they should not be split.

### 4 · Genuinely ambiguous singles (5)

| Code | Name | Proposed | The other reading |
| --- | --- | --- | --- |
| `DFF-005` | Differential Filter | **Differential** | Filters. Kept with `DFF-014` so one differential service isn't in two families. |
| `PCV-006` | PCV Valve | **Filters** | It is not a filter. No better family exists among the 20. |
| `WWF-016` | Washer Fluid Top-Off | **Fluids** | Wipers — it's windshield work and rides with a blade sale. |
| `RDD-052` | Rodent Deterrent | **Accessories** | Filed under EV/Hybrid in the catalog but isn't EV-specific. Accessories never coaches, which may be right. |
| `MPI-061` | Multi-Point Inspection | **Inspections** *(medium)* | Maps cleanly by name, but MPI is the **process that generates every other sale**, not a service sold against a benchmark. Coaching it as a family may not behave like the other nineteen. Your flag was right. |

---

## Three catalog problems found on the way

Not mapping decisions — data problems worth fixing while Mitch is looking:

1. **`BFF-012` is Brake Fluid Flush; `BFF-013` is Brake Quiet.** Two unrelated
   services one digit apart, sharing a prefix that reads as "brake fluid".
2. **`TPS-026` is TPMS Service; `TPS-050` is Tire Pressure Check.** Same
   collision, and `TPS-050` is additionally filed under *Engine & Performance*
   rather than *Tires*, which looks like a data-entry slip.
3. **`OIL-009` Engine Oil Service is categorised *Fluids***, though Oil Change
   is its own coachable family. The category column is wrong here; the name is
   right. Mapping follows the name.

---

## Two of Mitch's three A/C unknowns are already answered

The re-import found `ABL-006`, `ACO-010`, `EVC-007` in the A/C HVAC tab, none
in the catalog. Two have obvious catalog equivalents that already exist:

| Old code (tab) | Catalog code that exists | Confidence |
| --- | --- | --- |
| `ABL-006` "Arctic Blast" | **`ABT-054` Arctic Blast** | same name, same service |
| `EVC-007` "Evap Core" | **`ACE-053` AC Evaporator Cleaning** | strong, but Mitch should confirm |
| `ACO-010` "A/C Odor" | **nothing matches** | genuinely open |

So Mitch's question narrows: `ABL-006` and `EVC-007` look like **aliases** for
codes already in the catalog under newer numbers, and only **A/C Odor** needs a
real answer — new service (`055`–`057`), or folded into `ACR-047`/`ACS-048`?

Note that all five of those codes map to **HVAC**, which is content-gated with
zero cues today. The A/C HVAC re-import is what turns HVAC on.

---

## What happens once you rule

`op_code_family` becomes a real table seeded from this CSV — same pattern as
`op_code_catalog` and `scripts/seed-op-codes.ts`, idempotent on re-run, so your
edits land by editing the CSV and re-running. It is the bridge for two things
at once:

- **the loop** — a family-grain pick can select cues by op code within the family
- **the importer** — re-imported rows get `service_family` from it, which closes
  the Q5 hazard where a `zero`/`low` knowledge row is unreachable and a
  `generic` one is reachable by every advisor for no reason

I have not created the table or written the seeder yet — that is the first half
of commit 1, and it waits on your rulings above.
