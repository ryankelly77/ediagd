-- ============================================================================
-- EDIAGD — 0073 The other two seeders stop being able to revert a person
--
-- 0071 inverted op_text_rule because `npm run remap` wiped it from a file. The
-- Mapping screens that just shipped recreate exactly that trap one table over,
-- and it was worth catching before somebody found it the hard way:
--
--   npm run seed:op-codes   upserts all 73 rows of op_code_catalog on `code`,
--                           overwriting name, category and notes — screen 1
--
--   npm run seed:op-family  upserts all 73 rows of op_code_family on `code`,
--                           overwriting family, coachable, confidence and
--                           note — screen 2
--
-- Before the screens existed those seeders were the only writer, so an upsert
-- was simply how a revision landed. The moment a person can edit these tables
-- in the app, a routine re-seed from a CSV silently reverts them — with no
-- warning, no log, and no way to connect the two events. That is the same
-- failure, and it deserves the same answer.
--
-- ---------------------------------------------------------------------------
-- THE TABLE WINS, AND THE TABLE SAYS WHO WROTE EACH ROW
-- ---------------------------------------------------------------------------
-- `origin` is stamped by a trigger rather than by the writer, because the one
-- update that forgets to set it is precisely the one a later seed would revert.
-- A seeder runs as the service role with no auth.uid(), so it keeps 'file'; an
-- edit made in the app has a session, so it becomes 'admin'.
-- ============================================================================


-- ---- 1. Provenance on both tables ------------------------------------------
alter table op_code_catalog
  add column if not exists origin text not null default 'file',
  add column if not exists updated_by uuid references app_user(id);

alter table op_code_family
  add column if not exists origin text not null default 'file',
  add column if not exists updated_by uuid references app_user(id);

alter table op_code_catalog drop constraint if exists op_code_catalog_origin_valid;
alter table op_code_catalog add constraint op_code_catalog_origin_valid
  check (origin in ('file', 'admin'));

alter table op_code_family drop constraint if exists op_code_family_origin_valid;
alter table op_code_family add constraint op_code_family_origin_valid
  check (origin in ('file', 'admin'));

comment on column op_code_catalog.origin is
  '''file'' = from data/op_code_seed.csv and untouched; ''admin'' = edited in '
  'the app, and the seeder will not overwrite it.';
comment on column op_code_family.origin is
  '''file'' = from data/op_code_family_map.csv and untouched; ''admin'' = '
  'edited in the app, and the seeder will not overwrite it.';


-- ---- 2. One stamping function, both tables ---------------------------------
/*
 * Shared rather than copied. Two triggers with the same job and separate bodies
 * is how one of them ends up subtly different — and the difference would only
 * show up as a row somebody's edit quietly lost.
 *
 * `retired_at` is deliberately NOT a reason to stamp 'admin' on op_code_catalog
 * — retiring is already recorded in its own column and survives a re-seed,
 * since the seeders never write it.
 */
create or replace function mapping_stamp_admin()
returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null then
    new.origin := 'admin';
    new.updated_by := (select auth.uid());
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists op_code_catalog_marks_its_edits on op_code_catalog;
create trigger op_code_catalog_marks_its_edits
  before insert or update on op_code_catalog
  for each row execute function mapping_stamp_admin();

drop trigger if exists op_code_family_marks_its_edits on op_code_family;
create trigger op_code_family_marks_its_edits
  before insert or update on op_code_family
  for each row execute function mapping_stamp_admin();


-- ---- 3. What the seeders are allowed to overwrite ---------------------------
/**
 * The codes a file-driven seed may still write.
 *
 * The seeders read this before upserting and drop anything not in it, so the
 * rule lives in ONE place that both scripts and any future importer share —
 * rather than in a `.filter()` each of them has its own copy of.
 */
create or replace view mapping_seedable as
  select 'op_code_catalog'::text as table_name, code from op_code_catalog where origin = 'file'
  union all
  select 'op_code_family'::text, code from op_code_family where origin = 'file';

alter view mapping_seedable set (security_invoker = on);
grant select on mapping_seedable to authenticated;
