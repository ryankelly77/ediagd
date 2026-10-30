-- 0169_manager_films_carry_their_placement.sql
--
-- The 17 Vol 3 manager films carry placement NULL. 0168 gave Vol 4 a named
-- placement; this gives it to the films that came before, and then makes the
-- NULL unrepresentable.
--
-- Migration only. The ingest route, the daily loop and /meetings are not
-- touched by this file.
--
-- =========================================================================
-- WHY A NULL PLACEMENT IS NOT MERELY UNTIDY
-- =========================================================================
-- Those films are excluded from every advisor picker today, but only because
-- their op_code and service_family both happen to be null:
--
--   service_family_content arm 1   c.service_family IS NOT NULL AND
--                                  coalesce(c.placement,'') <> 'reference'
--   service_family_content arm 2   c.op_code IS NOT NULL AND
--                                  coalesce(c.placement,'') <> 'reference'
--
-- Both arms exclude exactly ONE placement, BY NAME. A NULL placement is not
-- that name, so it passes both — and the only thing keeping these 17 films out
-- of the view the advisor pitch slot reads is that two other columns are empty.
-- Nothing enforces that. One backfill, one hand-edit, one future ingest that
-- sets a service_family on a manager film, and they are in the loop.
--
-- 0128 wrote this down after the menu films: a NULL is "invisible to the
-- surface that selects the value, and not excluded by the gate that excludes
-- it." The fix is to carry the value, not to add a condition somewhere that
-- remembers to look for the absence of one.
--
-- WHAT THIS FIXES. Every advisor PICKER now excludes these films by
-- construction, because each selects by positive equality:
--
--   lib/loop.ts:181      .eq("placement", "daily_lifestyle")
--   lib/daily.ts:899     .eq("placement", "daily_lifestyle")
--   lib/daily.ts:1017    .eq("placement", "technician_daily")
--   lib/mileage.ts:101   .eq("placement", REFERENCE)
--   app/onboarding       .eq("placement", "onboarding_intro")
--
-- A value none of them names cannot be drawn by any of them, and the NULL
-- that used to sit there cannot come back — see the constraint below.
--
-- WHAT THIS DOES NOT FIX, STATED PLAINLY SO NOBODY READS MORE INTO IT.
-- service_family_content is NOT closed by this migration. Both its arms
-- exclude one placement BY NAME, and 'manager_meeting' is not that name.
-- Measured on the local replay, 30 October: a manager film on
-- placement = 'manager_meeting' carrying a service_family appears in
-- service_family_content — count 1, not 0.
--
-- So the 17 films stay out of that view for exactly the reason they did
-- before: their op_code and service_family are null. This migration does not
-- change that, and claiming otherwise would be the more dangerous half of
-- the problem it is fixing. 0168 avoided the issue for Vol 4 by keeping the
-- op code off content entirely; closing it for service_family means editing
-- a view the loop depends on, which is deliberately not done here.

-- =========================================================================
-- 1. REFUSE BEFORE WRITING, rather than force
-- =========================================================================
-- A manager film already sitting on some OTHER placement is not a thing this
-- migration knows how to resolve: it would mean a manager film deliberately
-- filed onto an advisor shelf, and overwriting that silently is exactly the
-- kind of "fix" that loses information. Measured on production 30 October:
-- 17 rows, all placement NULL, 0 on any other value. If that is not what this
-- meets, it stops and names them.

do $$
declare _bad int; _rows text;
begin
  select count(*),
         coalesce(string_agg(id::text || ' (' || placement::text || ') ' || coalesce(title,''), E'\n  '), '')
    into _bad, _rows
    from content
   where type = 'manager_video'
     and placement is not null
     and placement <> 'manager_meeting';

  if _bad > 0 then
    raise exception E'0169: % manager film(s) already carry another placement — refusing to overwrite:\n  %',
      _bad, _rows;
  end if;
end $$;

-- =========================================================================
-- 2. THE BACKFILL
-- =========================================================================
-- WHERE-clause present and load-bearing. Supabase runs pg_safeupdate for the
-- API roles, and a WHERE-less UPDATE in a migration applies as `postgres` and
-- then throws for every PostgREST caller — the defect this project already
-- paid for once in recompute_certification_content().

do $$
declare _n int;
begin
  update content
     set placement = 'manager_meeting',
         updated_at = now()
   where type = 'manager_video'
     and placement is null;

  get diagnostics _n = row_count;
  raise notice '0169: % manager film(s) moved from NULL to manager_meeting', _n;
end $$;

-- =========================================================================
-- 3. THE CONSTRAINT, AND WHY IT IS NOT WRITTEN THE OBVIOUS WAY
-- =========================================================================
-- The obvious form is
--
--     check (type <> 'manager_video' or placement = 'manager_meeting')
--
-- and it DOES NOT WORK. A CHECK constraint passes when it evaluates to NULL,
-- and for a manager film with placement NULL the second arm is
-- `NULL = 'manager_meeting'` -> NULL, so the whole expression is NULL and the
-- row is ACCEPTED. It would have backfilled the 17 and then let the 18th
-- recur — the one thing it exists to prevent.
--
-- Demonstrated before this was written:
--     as specified   insert (manager_video, NULL) -> ACCEPTED
--     null-safe      insert (manager_video, NULL) -> refused
--     null-safe      insert (manager_video, 'manager_meeting') -> accepted
--     null-safe      insert (manager_video, 'daily_pitch')     -> refused
--     null-safe      insert (advisor_video, NULL)              -> accepted
--
-- IS NOT DISTINCT FROM returns true or false and never null, which is the
-- whole reason it is here. Advisor and technician rows are untouched: the
-- first arm short-circuits for every type that is not manager_video, so a
-- NULL placement stays legal everywhere it already was.

alter table content drop constraint if exists content_manager_placement;
alter table content
  add constraint content_manager_placement
  check (type <> 'manager_video' or placement is not distinct from 'manager_meeting');

comment on constraint content_manager_placement on content is
  'A manager film carries placement = ''manager_meeting'', always. Written with '
  'IS NOT DISTINCT FROM because `placement = ''manager_meeting''` evaluates to '
  'NULL for a NULL placement and a CHECK passes on NULL — the obvious form '
  'would admit exactly the row this forbids. 0169.';

-- =========================================================================
-- 4. ASSERT THE RESULT, from the table rather than from intent
-- =========================================================================
-- Note what is NOT asserted here: "no manager film appears in an advisor
-- picker". On a freshly reset database there are no films at all, so that
-- assertion would pass by being empty — a check that cannot fail. The
-- picker behaviour is proven outside this file, against a database with rows
-- in it. What IS asserted here is the thing this migration is responsible
-- for, and it is false if the backfill did not happen.

do $$
declare _null_left int; _total int; _named int;
begin
  select count(*) filter (where placement is null),
         count(*),
         count(*) filter (where placement = 'manager_meeting')
    into _null_left, _total, _named
    from content where type = 'manager_video';

  if _null_left > 0 then
    raise exception '0169: % manager film(s) still carry a NULL placement', _null_left;
  end if;
  if _total <> _named then
    raise exception '0169: % manager film(s) of % are not on manager_meeting', _total - _named, _total;
  end if;
  raise notice '0169: all % manager film(s) carry manager_meeting', _total;
end $$;

notify pgrst, 'reload schema';
