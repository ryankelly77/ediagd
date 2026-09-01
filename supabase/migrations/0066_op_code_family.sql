-- ============================================================================
-- EDIAGD — 0066 The bridge between what Mitch coaches and what the DMS measures
--
-- Phase 0 of the loop contract found three op-code vocabularies and only one
-- bridge between them:
--
--   1  DMS op codes      advisor_op_metric.op_code    '30000' 'MOCACD' 'T0100'
--   2  catalog codes     op_code_catalog.code         'BFF-012' 'ACR-047'
--   3  service families  resolved_family, every view  'Brake Service'
--
-- 1 -> 3 exists (lib/dms/mapping.ts). 2 -> 3 did not exist in any form, so a
-- cue tagged with an op code could not be reached by a family-grained pick, and
-- a re-imported knowledge row with `service_family` null was either unreachable
-- or reachable by every advisor for no reason. This table is that bridge.
--
-- ---------------------------------------------------------------------------
-- A TABLE, NOT A DERIVATION FROM `category`
-- ---------------------------------------------------------------------------
-- op_code_catalog.category looks like it should already do this. It does not:
-- two of its fourteen values match a coachable family by name, and four
-- families have no category at all — Oil Change's code sits in Fluids,
-- Alignment's in Tires. The mapping is 73 editorial rulings, so it is stored
-- as 73 rows rather than computed from a column that disagrees with it.
-- ============================================================================


create table if not exists op_code_family (
  code      text primary key references op_code_catalog(code) on update cascade,
  family    text not null,

  /*
   * MAPPED FOR REPORTING, NOT NECESSARILY FOR COACHING.
   *
   * The eleven MNU-* rows are BUNDLES: a menu is how three services are sold
   * together, and there is no menu attach rate to be below benchmark on.
   * Coaching one would coach nothing. They still need a family so the RO
   * dollars land somewhere, hence a flag rather than a null family.
   *
   * MPI-061 is the other kind: the multi-point inspection is the PROCESS that
   * generates every other sale rather than a service sold against a benchmark.
   * Its coaching already exists as two of Mitch's six stages — MPI Setup and
   * After-MPI — so it must never become an Eddie's Pick.
   *
   * ACC-060 was already never coached, by the rule in lib/dms/mapping.ts.
   */
  coachable boolean not null default true,

  /*
   * How the ruling was reached, kept so the admin screen can ask Mitch to
   * confirm the ones that were judgement rather than derivation.
   *   high    name or category settles it
   *   medium  defensible either way, one reading clearly better
   *   ruled   Ryan decided it, 2026-08-31
   */
  confidence text not null default 'high'
    check (confidence in ('high', 'medium', 'ruled')),

  note       text,

  /*
   * THE MEASUREMENT-EPOCH HOOK.
   *
   * Moving a code between families moves the ROs an advisor is measured on.
   * Changing that silently would make last month's Eddie's Pick incomparable
   * to this month's without anything saying so. Nothing reads this column yet
   * — the admin Mapping screens are where it gets used — but it is here now so
   * the first edit after coaching starts has somewhere to record itself
   * instead of needing a migration in a hurry.
   */
  effective_from date not null default current_date,

  updated_at timestamptz not null default now()
);

comment on table op_code_family is
  'Catalog op code -> service family. Seeded from data/op_code_family_map.csv '
  'by scripts/seed-op-code-family.ts; re-running the seed is how a revision '
  'lands. `coachable` false means map for reporting but never coach.';

create index if not exists op_code_family_family_idx on op_code_family(family);

alter table op_code_family enable row level security;

-- Reference data, same posture as op_code_catalog: any signed-in user reads it,
-- admins write it.
drop policy if exists op_code_family_read on op_code_family;
create policy op_code_family_read on op_code_family
  for select using ((select auth.uid()) is not null);

drop policy if exists op_code_family_admin_write on op_code_family;
create policy op_code_family_admin_write on op_code_family
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));


-- ---- The 21st family -------------------------------------------------------
/*
 * EV & Hybrid. CPC-051, RDD-052 and HYB-064 had no family among the twenty,
 * and the EV Hybrid knowledge tab has 89 rows waiting on one. Added as a real
 * service line rather than folded into a catch-all: the benchmark floor
 * already protects it from low-volume noise, which is the usual argument
 * against a thin family.
 *
 * Guarded because service_family may or may not exist as a table depending on
 * how far 0038 got on a given environment; the insert is skipped rather than
 * failing the migration.
 */
do $$
begin
  if to_regclass('public.service_family') is not null then
    execute $i$
      insert into service_family (name)
      values ('EV & Hybrid')
      on conflict (name) do nothing
    $i$;
  end if;
end $$;


-- ============================================================================
-- Aliases — old names for canonical things
--
-- The A/C HVAC knowledge tab references ABL-006, ACO-010 and EVC-007. None is
-- in the catalog, and two of them turn out to be older numbers for services
-- that ARE:
--
--   ABL-006  'Arctic Blast'   ->  ABT-054  Arctic Blast              same name
--   EVC-007  'Evap Core'      ->  ACE-053  AC Evaporator Cleaning    Mitch confirms
--   ACO-010  'A/C Odor'       ->  ACE-053  AC Evaporator Cleaning    proposed
--
-- So they are translations, not missing services, and no new code is minted.
-- Kept general rather than op-code-specific because ingest needs the same
-- mechanism for filename prefixes (WALKAROUND -> Craft) and the importer will
-- need it for whatever the next workbook calls things.
-- ============================================================================

create table if not exists mapping_alias (
  id          uuid primary key default gen_random_uuid(),
  -- What kind of thing is being translated. Text with a check rather than an
  -- enum: the admin Aliases screen adds kinds, and ALTER TYPE ... ADD VALUE
  -- cannot be used in the same transaction that inserts with it.
  kind        text not null check (kind in ('op_code', 'collection', 'voice', 'service_family')),
  alias       text not null,
  canonical   text not null,
  -- False until Mitch says yes. A proposed alias is visible and inert: the
  -- importer resolves only confirmed ones, so a guess cannot quietly reroute
  -- content while it waits for an answer.
  confirmed   boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, alias)
);

comment on table mapping_alias is
  'Old names for canonical things: op codes, collections, voices. `confirmed` '
  'false means proposed and inert — the importer resolves confirmed rows only.';

alter table mapping_alias enable row level security;

drop policy if exists mapping_alias_read on mapping_alias;
create policy mapping_alias_read on mapping_alias
  for select using ((select auth.uid()) is not null);

drop policy if exists mapping_alias_admin_write on mapping_alias;
create policy mapping_alias_admin_write on mapping_alias
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));

insert into mapping_alias (kind, alias, canonical, confirmed, note) values
  ('op_code', 'ABL-006', 'ABT-054', true,
   'Arctic Blast. Same name, same service, newer number. Confirmed by name.'),
  ('op_code', 'EVC-007', 'ACE-053', true,
   'Evap Core -> AC Evaporator Cleaning. Active now; Mitch to confirm.'),
  ('op_code', 'ACO-010', 'ACE-053', false,
   'A/C Odor. Evaporator cleaning IS the odor service, so this proposes the '
   'same target as EVC-007 rather than minting a new code. PROPOSED — inert '
   'until Mitch rules.')
on conflict (kind, alias) do nothing;
