-- ============================================================================
-- EDIAGD — 0104 The streak saver's acceptance tests, run against the real thing
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A DATABASE FUNCTION AND NOT A TYPESCRIPT SUITE
-- ---------------------------------------------------------------------------
-- Every condition that decides whether somebody is nudged lives in SQL: the
-- generator's WHERE clause, is_scheduled_day(), previous_scheduled_day(), the
-- one-per-day unique index. A TypeScript suite could only test a REIMPLEMENTATION
-- of those rules, which would pass forever while the real generator drifted
-- underneath it. The other suites in scripts/ are pure because the logic they
-- cover is pure; this logic is not.
--
-- ---------------------------------------------------------------------------
-- FIXTURES THAT CANNOT SURVIVE
-- ---------------------------------------------------------------------------
-- The whole body runs inside a plpgsql EXCEPTION block, which is a
-- subtransaction. It builds a rooftop, an advisor and their history, runs the
-- REAL generator against them, records what happened, and then raises — which
-- rolls every row back. Local variables are not transactional, so the results
-- survive the rollback and get returned.
--
-- That matters because this points at production. Nothing it writes can outlive
-- the call, including the outbox rows the generator legitimately creates for
-- real advisors while it is running.
-- ============================================================================

create or replace function streak_saver_acceptance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _out       jsonb := '[]'::jsonb;
  _uid       uuid  := gen_random_uuid();
  _rid       uuid  := gen_random_uuid();
  _mid       uuid;
  /* 19:15 CDT — inside the 19:00 window, on a fixture rooftop in Chicago. */
  _now       timestamptz := timestamptz '2026-09-09 19:15:00-05';
  _day       date := date '2026-09-09';
  _n         int;

  procedure_note text;
begin
  begin
    -- ---- Fixture: a rooftop, an advisor, and a live streak ----------------
    /* Hung off an existing org rather than creating one: org is the billing
       root and a fixture one would be the single row in this harness with any
       chance of mattering if the rollback ever failed. */
    insert into rooftop (id, org_id, name, timezone)
    select _rid, o.id, 'ZZ Acceptance Rooftop', 'America/Chicago'
      from org o order by o.id limit 1;

    /* app_user references auth.users, so the fixture person has to exist
       there first. Only the columns GoTrue actually requires. */
    insert into auth.users (id, aud, role, email, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (_uid, 'authenticated', 'authenticated',
            'zz-acceptance-' || _uid || '@example.invalid', now(), now(),
            '{}'::jsonb, '{}'::jsonb);

    insert into app_user (id, full_name) values (_uid, 'ZZ Acceptance Advisor');

    insert into membership (user_id, rooftop_id, role, active)
    values (_uid, _rid, 'advisor', true)
    returning id into _mid;

    /* Every day is a work day, so the scenarios below can turn ONE thing off
       at a time and the weekday of the fixture date never matters. */
    /* Upserted, not inserted: a trigger elsewhere seeds these rows for a new
       member, and the harness must not care which of us got there first. */
    insert into work_schedule (user_id, works_mon, works_tue, works_wed,
                               works_thu, works_fri, works_sun, saturday_mode)
    values (_uid, true, true, true, true, true, true, 'every')
    on conflict (user_id) do update
      set works_mon = true, works_tue = true, works_wed = true,
          works_thu = true, works_fri = true, works_sun = true,
          saturday_mode = 'every';

    /* A three-day Swell whose last completion was the previous work day —
       which is what "the streak is alive and at stake today" means. */
    insert into swell (user_id, current_len, longest_len, last_completed_on)
    values (_uid, 3, 3, _day - 1)
    on conflict (user_id) do update
      set current_len = 3, longest_len = 3, last_completed_on = _day - 1;

    insert into device_push_token (user_id, platform, token)
    values (_uid, 'ios', 'zz-acceptance-token-' || _uid)
    on conflict (token) do update set retired_at = null;

    -- ---- 1. The happy path ------------------------------------------------
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox
     where recipient_id = _uid and local_date = _day and kind = 'streak_keeper';
    _out := _out || jsonb_build_object(
      'name', 'eligible advisor gets exactly one row',
      'pass', _n = 1, 'detail', format('rows=%s', _n));

    -- ---- 2. Idempotency: the cron runs again ------------------------------
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox
     where recipient_id = _uid and local_date = _day and kind = 'streak_keeper';
    _out := _out || jsonb_build_object(
      'name', 'a second cron run inserts nothing',
      'pass', _n = 1, 'detail', format('rows=%s', _n));

    -- ---- 3. The copy and the deep link ------------------------------------
    select count(*) into _n from notification_outbox
     where recipient_id = _uid and local_date = _day
       and title = 'Day 3 is on the line'
       and body  = 'One rep keeps the streak alive — today''s is still open.'
       and deep_link = '/today?opened_via=streak_saver';
    _out := _out || jsonb_build_object(
      'name', 'copy interpolates the streak and the link carries attribution',
      'pass', _n = 1, 'detail', format('matching=%s', _n));

    /* Clear the outbox between scenarios: the dedup key would otherwise make
       every later scenario "pass" by colliding with row 1. */
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 4. Rest day: a scheduled day off ---------------------------------
    update work_schedule set works_mon = false, works_tue = false,
           works_wed = false, works_thu = false, works_fri = false,
           works_sun = false, saturday_mode = 'none'
     where user_id = _uid;
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'rest day (day off) sends nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));

    update work_schedule set works_mon = true, works_tue = true,
           works_wed = true, works_thu = true, works_fri = true,
           works_sun = true, saturday_mode = 'every'
     where user_id = _uid;
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 5. Rest day: Island Time -----------------------------------------
    insert into island_time (user_id, start_date, end_date)
    values (_uid, _day - 2, _day + 2);
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'rest day (Island Time) sends nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));
    delete from island_time where user_id = _uid;
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 6. Rest day: a confirmed closure ---------------------------------
    /* The reason is_scheduled_day() had to be extended in 0102 — before that
       this scenario sent a notification on Thanksgiving. */
    /* confirmed_at is required alongside the status — 0101 refuses to record a
       decision without saying when it was made. */
    insert into rooftop_closed_day (rooftop_id, closed_on, label, status, origin,
                                    confirmed_at, confirmed_by)
    values (_rid, _day, 'ZZ Acceptance Closure', 'confirmed', 'store',
            now(), _uid);
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'rest day (confirmed closure) sends nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));

    -- ---- 7. A PROPOSED closure is not a closure ---------------------------
    update rooftop_closed_day
       set status = 'proposed', confirmed_at = null, confirmed_by = null
     where rooftop_id = _rid and closed_on = _day;
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'a proposed closure does NOT suppress the send',
      'pass', _n = 1, 'detail', format('rows=%s', _n));
    delete from rooftop_closed_day where rooftop_id = _rid;
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 8. Streak of 1 ---------------------------------------------------
    update swell set current_len = 1 where user_id = _uid;
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'streak of 1 sends nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));
    update swell set current_len = 3 where user_id = _uid;
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 9. A stale streak is not a live one ------------------------------
    /* current_len is only recomputed on completion, so somebody who broke a
       3-day streak yesterday still reads 3 today. Nudging them would be a
       notification carrying a number that is no longer true. */
    update swell set last_completed_on = _day - 3 where user_id = _uid;
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'a streak already broken sends nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));
    update swell set last_completed_on = _day - 1 where user_id = _uid;
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 10. Already completed today --------------------------------------
    insert into daily_completion (user_id, rooftop_id, completion_date)
    values (_uid, _rid, _day);
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'block already complete sends nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));
    delete from daily_completion where user_id = _uid;
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 11. Toggled off, and the token survives it -----------------------
    insert into user_notification_pref (user_id, push_enabled)
    values (_uid, false)
    on conflict (user_id) do update set push_enabled = false;
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'notifications toggled off sends nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));

    select count(*) into _n from device_push_token
     where user_id = _uid and retired_at is null;
    _out := _out || jsonb_build_object(
      'name', 'toggling off RETAINS the device token',
      'pass', _n = 1, 'detail', format('live tokens=%s', _n));
    update user_notification_pref set push_enabled = true where user_id = _uid;
    delete from notification_outbox where recipient_id = _uid;

    -- ---- 12. No live device ------------------------------------------------
    update device_push_token set retired_at = now(), retired_reason = 'test'
     where user_id = _uid;
    perform generate_push_outbox(_now);
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'no live device queues nothing',
      'pass', _n = 0, 'detail', format('rows=%s', _n));

    -- ---- 13. Retiring is not deleting --------------------------------------
    perform retire_push_token('zz-acceptance-token-' || _uid, 'Unregistered');
    select count(*) into _n from device_push_token where user_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'an invalid token is retired, not deleted',
      'pass', _n = 1, 'detail', format('rows still present=%s', _n));

    -- ---- 14. Re-registering un-retires -------------------------------------
    update device_push_token
       set retired_at = null, retired_reason = null
     where user_id = _uid;
    select count(*) into _n from device_push_token
     where user_id = _uid and retired_at is null;
    _out := _out || jsonb_build_object(
      'name', 'a retired token can come back without a new OS prompt',
      'pass', _n = 1, 'detail', format('live=%s', _n));

    -- ---- 15. Outside the send window ---------------------------------------
    delete from notification_outbox where recipient_id = _uid;
    perform generate_push_outbox(timestamptz '2026-09-09 14:00:00-05');
    select count(*) into _n from notification_outbox where recipient_id = _uid;
    _out := _out || jsonb_build_object(
      'name', 'two in the afternoon is not the send hour',
      'pass', _n = 0, 'detail', format('rows=%s', _n));

    -- Everything above is undone by this.
    raise exception 'ZZ_ROLLBACK_FIXTURES';

  exception when others then
    if sqlerrm <> 'ZZ_ROLLBACK_FIXTURES' then
      _out := _out || jsonb_build_object(
        'name', 'harness itself', 'pass', false, 'detail', sqlerrm);
    end if;
  end;

  return _out;
end $fn$;

revoke all on function streak_saver_acceptance() from public, anon, authenticated;

notify pgrst, 'reload schema';
