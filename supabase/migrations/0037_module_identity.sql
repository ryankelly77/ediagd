-- ============================================================================
-- EDIAGD — 0037 A module's name is its identity within a course
--
-- 0035 created `module` with no unique constraint, and import.sql inserted into
-- it with `on conflict do nothing`. With no constraint there is nothing to
-- conflict ON: the clause is dead, every id comes from gen_random_uuid(), and a
-- second run of the importer inserts a complete duplicate set — 253 modules
-- becomes 506, and the cue-placement UPDATE then joins each course/module name
-- to two rows.
--
-- The importer's header claimed it was idempotent. For courses it was, because
-- `course` carries unique (track, name). For modules it was not, and the only
-- reason production is intact is that the import has been run exactly once.
--
-- This is the constraint that makes the claim true. It also gives the importer
-- a conflict target to UPSERT against, which is what lets a re-run CORRECT a
-- module's sort_order and name_status instead of ignoring the new values.
--
-- Safe to apply as-is: measured on production, all 253 modules are already
-- distinct on (course_id, name).
-- ============================================================================

alter table module
  drop constraint if exists module_course_name_key;

alter table module
  add constraint module_course_name_key unique (course_id, name);

comment on constraint module_course_name_key on module is
  'A module is identified within its course by name. This is the importer''s '
  'upsert target — without it, re-running the curriculum import duplicates '
  'every module.';

notify pgrst, 'reload schema';
