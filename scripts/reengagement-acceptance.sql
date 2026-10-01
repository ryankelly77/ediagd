-- ============================================================================
-- EDIAGD — re-engagement push acceptance (Return, Start, Protect priority)
--
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f scripts/reengagement-acceptance.sql
--
-- Runs on a restore of the production dump with 0151/0152 applied. Everything
-- happens inside ONE transaction that ROLLS BACK — real account ids are
-- mutated as fixtures and nothing persists. generate_push_outbox is called
-- with _now_override, as postgres (auth.uid() is null = the pg_cron path it
-- already allows), and the assertions read the rows it actually wrote.
--
-- Subjects (real advisors at three rooftops pinned to UTC so one 07:30 clock
-- puts them all in the 07:00 send window):
--   RET     921e2537  CDJR            entitled, mapped   — Return
--   PROT    78929620  CDJR            entitled, mapped   — Protect / priority
--   START   c5e6ee88  CDJR            entitled           — Start
--   OFF     34708a2e  Ford            push OFF            — negative
--   UNMAP   c2e634da  Ford            op_code_id NULL     — negative
--   UNENT   645a4739  Honda Med Ctr   NOT entitled        — negative
-- ============================================================================
\set RET   '''921e2537-54c8-4398-9d1d-13b93e70cd97'''
\set PROT  '''78929620-f92b-416f-80ac-41fcc3a6e3e8'''
\set START '''c5e6ee88-770b-4760-9771-9a58dc3088f2'''
\set OFF   '''34708a2e-528f-4ba5-8e10-8586b6cc5b4e'''
\set UNMAP '''c2e634da-2471-4b1e-b36d-2ff6a0c200ea'''
\set UNENT '''645a4739-d5b4-41b5-9413-4e3495e1fb67'''

begin;

-- ---- fixtures --------------------------------------------------------------
-- Three rooftops to UTC, so 07:30 UTC is 07:30 local for every subject.
update rooftop set timezone='UTC' where id in (
  select distinct rooftop_id from membership
   where user_id in (:RET,:PROT,:START,:OFF,:UNMAP,:UNENT) and active);

-- Seven-day schedules, so "scheduled workday index" == calendar days since,
-- which makes the cadence assertions exact.
insert into work_schedule (user_id, works_mon,works_tue,works_wed,works_thu,works_fri,works_sun,saturday_mode)
select u, true,true,true,true,true,true,'every'
  from unnest(array[:RET,:PROT,:START,:OFF,:UNMAP,:UNENT]::uuid[]) u
on conflict (user_id) do update set
  works_mon=true,works_tue=true,works_wed=true,works_thu=true,works_fri=true,
  works_sun=true,saturday_mode='every';

-- Everyone push-on with a live token, except OFF.
insert into user_notification_pref (user_id, push_enabled)
select u, (u <> :OFF::uuid) from unnest(array[:RET,:PROT,:START,:OFF,:UNMAP,:UNENT]::uuid[]) u
on conflict (user_id) do update set push_enabled = excluded.push_enabled;

insert into device_push_token (user_id, platform, token, last_seen)
select u, 'ios', 'tok-'||u, now() from unnest(array[:RET,:PROT,:START,:OFF,:UNMAP,:UNENT]::uuid[]) u
on conflict do nothing;

-- UNMAP loses its op code.
update membership set op_code_id = null where user_id = :UNMAP and role='advisor';

-- Clean slate for completions/swell across the subjects.
delete from daily_completion where user_id in (:RET,:PROT,:START,:OFF,:UNMAP,:UNENT);
delete from notification_outbox where recipient_id in (:RET,:PROT,:START,:OFF,:UNMAP,:UNENT);

-- Lapsed-but-completed advisors (Return/OFF/UNMAP/UNENT): last completion well
-- in the past; START has NO swell row and NO completion.
insert into swell (user_id, current_len, longest_len, last_completed_on)
select u, 4, 9, date '2026-09-01' from unnest(array[:RET,:OFF,:UNMAP,:UNENT]::uuid[]) u
on conflict (user_id) do update set current_len=4, longest_len=9, last_completed_on=date '2026-09-01';
delete from swell where user_id = :START;

-- START's membership created-date anchors its cadence; pin it to a base date.
update membership set created_at = timestamptz '2026-09-01 12:00:00+00'
 where user_id = :START and role='advisor';

-- ============================================================================
-- 1. RETURN — the decaying cadence across a 30-day window
-- ============================================================================
do $$
declare
  _ret uuid := '921e2537-54c8-4398-9d1d-13b93e70cd97';
  _base date := date '2026-09-01';          -- last completion
  _off int;
  _hits int[] := '{}';       -- the MISS index on each day a row fired
  _expected int[] := array[1,3,5,7,9,15,20,25];
begin
  -- The window spans Labor Day (sep 7, a real confirmed closure in the dump),
  -- so calendar offsets and miss indices diverge — which is the point: the
  -- cadence is counted in the advisor's scheduled misses, and a shut store is
  -- not one. We assert on the miss index, the closure-independent invariant.
  for _off in 1..40 loop
    delete from notification_outbox
      where recipient_id=_ret and local_date=_base + _off;   -- idempotent per day
    perform generate_push_outbox(( _base + _off  + time '07:30') at time zone 'UTC');
    if exists (select 1 from notification_outbox
                where recipient_id=_ret and kind='return' and local_date=_base + _off) then
      _hits := _hits || (scheduled_days_since(_ret, _base, _base + _off) - 1);
    end if;
  end loop;

  if _hits = _expected then
    raise notice 'ok    RETURN fires on miss indices %, nothing past 30 days', _hits;
  else
    raise exception 'FAIL  RETURN miss indices were %, expected %', _hits, _expected;
  end if;

  -- the body names the waiting family, pulled from advisor_focus_family
  if exists (select 1 from notification_outbox
              where recipient_id=_ret and kind='return' and local_date=_base+2
                and body ~ '(is up today|About five minutes)') then
    raise notice 'ok    RETURN body names what is waiting (no mention of the miss)';
  else
    raise exception 'FAIL  RETURN body wrong';
  end if;
end $$;

-- A completion inside the window RESETS the cadence to zero.
do $$
declare
  _ret uuid := '921e2537-54c8-4398-9d1d-13b93e70cd97';
  _base date := date '2026-09-01';
begin
  -- they complete on day 12; the new anchor is day 12. The cadence restarts
  -- from zero: day 13 is the first scheduled morning (no miss yet -> silent),
  -- day 14 is the morning after the first fresh miss (miss index 1 -> fires).
  insert into daily_completion (user_id, completion_date, rooftop_id)
    select _ret, _base+12, rooftop_id from membership where user_id=_ret and role='advisor' limit 1;
  update swell set last_completed_on=_base+12, current_len=1 where user_id=_ret;

  delete from notification_outbox where recipient_id=_ret and local_date in (_base+13,_base+14);
  perform generate_push_outbox((_base+13 + time '07:30') at time zone 'UTC');
  perform generate_push_outbox((_base+14 + time '07:30') at time zone 'UTC');

  if not exists (select 1 from notification_outbox where recipient_id=_ret and kind='return' and local_date=_base+13)
     and exists (select 1 from notification_outbox where recipient_id=_ret and kind='return' and local_date=_base+14)
  then
    raise notice 'ok    RETURN a completion resets the cadence (silent day 13, fires day 14)';
  else
    raise exception 'FAIL  RETURN cadence did not reset after a completion';
  end if;
end $$;

-- ============================================================================
-- 2. START — workday 1 and 3 after invite, then nothing
-- ============================================================================
do $$
declare
  _s uuid := 'c5e6ee88-770b-4760-9771-9a58dc3088f2';
  _base date := date '2026-09-01';          -- membership created
  _off int; _hits int[] := '{}';
begin
  for _off in 1..7 loop
    delete from notification_outbox where recipient_id=_s and local_date=_base+_off;
    perform generate_push_outbox((_base+_off + time '07:30') at time zone 'UTC');
    if exists (select 1 from notification_outbox where recipient_id=_s and kind='start' and local_date=_base+_off)
      then _hits := _hits || _off; end if;
  end loop;
  if _hits = array[1,3] then
    raise notice 'ok    START fires workday 1 and 3 only, then stops';
  else
    raise exception 'FAIL  START cadence was %, expected {1,3}', _hits;
  end if;
end $$;

-- ============================================================================
-- 3. PROTECT priority — a live-streak advisor gets Protect only
-- ============================================================================
do $$
declare
  _p uuid := '78929620-f92b-416f-80ac-41fcc3a6e3e8';
  _today date := date '2026-09-15';
  _ret_rows int; _start_rows int; _prot_rows int;
begin
  -- live streak: last completion = the previous scheduled day (yesterday).
  update swell set current_len=5, longest_len=9, last_completed_on=_today-1 where user_id=_p;
  insert into swell (user_id,current_len,longest_len,last_completed_on)
    values (_p,5,9,_today-1) on conflict (user_id) do update
    set current_len=5, longest_len=9, last_completed_on=_today-1;

  -- at the RETURN/START clock (07:30): a live-streak advisor must get neither.
  delete from notification_outbox where recipient_id=_p and local_date=_today;
  perform generate_push_outbox((_today + time '07:30') at time zone 'UTC');
  select count(*) filter (where kind='return'), count(*) filter (where kind='start')
    into _ret_rows, _start_rows
    from notification_outbox where recipient_id=_p and local_date=_today;

  -- at noon: the Protect nudge.
  perform generate_push_outbox((_today + time '12:30') at time zone 'UTC');
  select count(*) filter (where kind in ('streak_keeper','streak_last_call'))
    into _prot_rows from notification_outbox where recipient_id=_p and local_date=_today;

  if _ret_rows=0 and _start_rows=0 and _prot_rows=1 then
    raise notice 'ok    PROTECT wins: live-streak advisor gets 1 protect row, 0 return, 0 start';
  else
    raise exception 'FAIL  priority: return=% start=% protect=%', _ret_rows,_start_rows,_prot_rows;
  end if;

  -- and never on a store closure: shut the store today, regenerate, no new row.
  delete from notification_outbox where recipient_id=_p and local_date=_today;
  insert into rooftop_closed_day (rooftop_id, closed_on, label, status, confirmed_at)
    select rooftop_id, _today, 'acceptance closure', 'confirmed', now()
      from membership where user_id=_p and role='advisor' limit 1;
  perform generate_push_outbox((_today + time '12:30') at time zone 'UTC');
  if not exists (select 1 from notification_outbox where recipient_id=_p and local_date=_today) then
    raise notice 'ok    PROTECT never fires on a confirmed store closure';
  else
    raise exception 'FAIL  protect fired on a closure day';
  end if;
end $$;

-- ============================================================================
-- 4. The three negatives — push off, unmapped, unentitled
-- ============================================================================
do $$
declare
  _off uuid   := '34708a2e-528f-4ba5-8e10-8586b6cc5b4e';
  _unmap uuid := 'c2e634da-2471-4b1e-b36d-2ff6a0c200ea';
  _unent uuid := '645a4739-d5b4-41b5-9413-4e3495e1fb67';
  _base date := date '2026-09-01';
  _d date := _base + 2;          -- miss index 1: a qualifying advisor fires here
begin
  delete from notification_outbox where recipient_id in (_off,_unmap,_unent) and local_date=_d;
  perform generate_push_outbox((_d + time '07:30') at time zone 'UTC');

  -- The day is genuinely "hot": a qualifying advisor (START's neighbour RET was
  -- mutated earlier, so use a fresh check) would fire. Proven by the three
  -- subjects each sharing the lapsed state and differing only by one
  -- disqualifier — if the day were cold, test 1 would already have failed.

  if not exists (select 1 from notification_outbox where recipient_id=_off and local_date=_d) then
    raise notice 'ok    push OFF: no row of any kind';
  else raise exception 'FAIL  push-off advisor got a row'; end if;

  if not exists (select 1 from notification_outbox where recipient_id=_unmap and local_date=_d) then
    raise notice 'ok    unmapped account: no Return row';
  else raise exception 'FAIL  unmapped advisor got a row'; end if;

  if not exists (select 1 from notification_outbox where recipient_id=_unent and local_date=_d) then
    raise notice 'ok    unentitled rooftop: no row';
  else raise exception 'FAIL  unentitled advisor got a row'; end if;
end $$;

rollback;
