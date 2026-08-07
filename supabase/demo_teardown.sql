-- ============================================================================
-- EDIAGD — REMOVE THE DEMO DATA
--
-- Undoes SECTION 5 of supabase/seed.sql and nothing else. Run it when the demo
-- has served its purpose:
--
--   psql "$DATABASE_URL" -f supabase/demo_teardown.sql
--
-- WHAT MAKES THIS SAFE
--
--   * It only ever matches the two markers SECTION 5 stamps on everything it
--     creates: orgs and rooftops named '[DEMO] %', and logins at the reserved
--     domain '@ediagd.test' beginning 'demo.'. Nothing else can match.
--   * It refuses to run if either pattern would catch a real row. The Doggett
--     rooftop and ryan@pearanalytics.com are named explicitly and checked, so a
--     future rename that collides with the prefix aborts instead of deleting.
--   * One transaction. Either the whole demo goes or none of it does.
--
-- Deleting the auth.users rows is what removes most of it: app_user cascades
-- from auth.users, and membership, daily_activity, daily_completion, swell,
-- work_schedule, island_time and sand_dollar_entry all cascade from app_user.
-- The rooftop and org deletes then take rooftop_product and any stragglers.
-- ============================================================================

do $teardown$
declare
  _doggett  uuid := '22222222-2222-2222-2222-222222222222';
  _ryan     uuid := '78929620-f92b-416f-80ac-41fcc3a6e3e8';
  _users    int;
  _rooftops int;
  _orgs     int;
  _activity int;
begin
  -- ---- Refuse to run if the patterns reach anything real ------------------
  if exists (
    select 1 from rooftop where name like '[DEMO]%' and id = _doggett
  ) then
    raise exception 'Refusing to run: the Doggett rooftop is named like a demo rooftop.';
  end if;

  if exists (
    select 1 from auth.users
     where id = _ryan and email like 'demo.%@ediagd.test'
  ) then
    raise exception 'Refusing to run: the real account matches the demo email pattern.';
  end if;

  -- A demo login must never hold a membership at a rooftop that is not a demo
  -- rooftop. If one does, something outside SECTION 5 has been attached to it
  -- and deleting the user would take that with it.
  if exists (
    select 1
      from auth.users u
      join membership m on m.user_id = u.id
      join rooftop r on r.id = m.rooftop_id
     where u.email like 'demo.%@ediagd.test'
       and r.name not like '[DEMO]%'
  ) then
    raise exception 'Refusing to run: a demo account holds a membership at a real rooftop.';
  end if;

  -- ---- What is about to go -------------------------------------------------
  select count(*) into _users
    from auth.users where email like 'demo.%@ediagd.test';
  select count(*) into _rooftops
    from rooftop where name like '[DEMO]%';
  select count(*) into _orgs
    from org where name like '[DEMO]%';
  select count(*) into _activity
    from daily_activity da join rooftop r on r.id = da.rooftop_id
   where r.name like '[DEMO]%';

  raise notice 'Removing % demo logins, % rooftops, % orgs, % activity rows.',
    _users, _rooftops, _orgs, _activity;

  -- ---- Remove --------------------------------------------------------------
  delete from auth.users where email like 'demo.%@ediagd.test';
  delete from rooftop where name like '[DEMO]%';
  delete from org where name like '[DEMO]%';

  -- Only present if a seed run died before its own cleanup.
  drop schema if exists demo cascade;

  raise notice 'Demo data removed. Rooftops left: %.', (select count(*) from rooftop);
end
$teardown$;
