-- ============================================================================
-- EDIAGD — 0114  The streak-saver harness, told what time it is
-- ============================================================================
-- 0112 moved the nudge from 19:00 to noon and added a 16:50 last call. It did
-- not move the acceptance harness in 0104, which pins its clock at 19:15 and
-- its expected copy at 0102's wording. The result: four scenarios — the happy
-- path, idempotency, the copy, and the proposed-closure case — quietly stopped
-- exercising anything, because at 19:15 the generator now correctly writes
-- nothing and "expected a row, got none" is indistinguishable from a genuine
-- regression.
--
-- Every scenario asserting SILENCE kept passing throughout, which is what made
-- it look survivable. A harness that can only fail in the direction of "sends
-- nothing" is not testing a notification.
--
-- This replaces the function with one that derives both the hour and the copy
-- from the sources the generator itself reads, and adds the coverage the last
-- call never had. Nothing else in 0104 changes.
--
-- Still rolls itself back the same way: every fixture row is undone by the
-- ZZ_ROLLBACK_FIXTURES exception at the end, so this is safe against the live
-- database while real advisors are using it.
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
  _day       date := date '2026-09-09';
  /* ------------------------------------------------------------------------
     THE CLOCK IS DERIVED, NOT TYPED — AND THAT IS WHY THIS BROKE ONCE
     ------------------------------------------------------------------------
     This used to be the literal 19:15, "inside the 19:00 window". Then 0112
     moved the nudge to noon and added a last call at 16:50, and 19:15 stopped
     being inside any window at all. Every scenario that expects a row to be
     WRITTEN silently began asserting against an empty outbox and failing,
     while every scenario expecting silence carried on passing — a harness
     that looks half alive and is really just agreeing with itself.

     So the hour now comes from the same setting the generator reads. Move the
     nudge again and this follows it. The `least(..., 19)` mirrors the clamp in
     0102's trigger, so the fixture cannot aim at an hour the policy would
     refuse to schedule. */
  _hour      int := least(
                      (select streak_saver_hour_local from game_settings limit 1),
                      19);
  /* Quarter past, so it sits inside [target, target + 60min) — see 0112 on
     why the window is an hour wide and not an instant. -05 is CDT, which is
     what America/Chicago is on this date. */
  _now       timestamptz := (_day::text || ' ' ||
                             to_char(make_time(_hour, 15, 0), 'HH24:MI:SS') ||
                             '-05')::timestamptz;
  /* 16:50 is picked up by the 17:00 cron run, not at 16:50 — 0112 again. */
  _last_call timestamptz := (_day::text || ' 17:00:00-05')::timestamptz;
  _want_t    text;
  _want_b    text;
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
    /* The EXPECTED strings are read from push_copy() and interpolated here the
       same way the generator does, rather than typed out. Typed-out copy is
       how this scenario went stale when 0112 rewrote the nudge: the assertion
       was still checking 0102's words, which no longer exist. What is worth
       testing is that the tokens get substituted and the link carries its
       attribution — not that somebody retyped Ryan's sentence correctly. */
    select replace(replace(title, '{days}', '3'), '{days_next}', '4'),
           replace(replace(body,  '{days}', '3'), '{days_next}', '4')
      into _want_t, _want_b
      from push_copy('streak_keeper');

    select count(*) into _n from notification_outbox
     where recipient_id = _uid and local_date = _day
       and title = _want_t
       and body  = _want_b
       and body not like '%{%'
       and deep_link = '/today?opened_via=streak_saver';
    _out := _out || jsonb_build_object(
      'name', 'copy interpolates the streak and the link carries attribution',
      'pass', _n = 1, 'detail', format('matching=%s, want=%L / %L',
                                       _n, _want_t, _want_b));

    -- ---- 3b. The 16:50 last call ------------------------------------------
    /* Added with 0112. Without it the second of the two messages had no
       coverage at all, and the one thing it does differently — tagging its
       deep link streak_last_call so the two can be told apart in the report —
       is exactly the thing that was missed when it was first written.

       Run from a clean outbox: the last call has its own dedup key, but
       counting rows is clearer when only one thing can be in there. */
    delete from notification_outbox where recipient_id = _uid;
    perform generate_push_outbox(_last_call);

    select replace(replace(title, '{days}', '3'), '{days_next}', '4'),
           replace(replace(body,  '{days}', '3'), '{days_next}', '4')
      into _want_t, _want_b
      from push_copy('streak_last_call');

    select count(*) into _n from notification_outbox
     where recipient_id = _uid and local_date = _day
       and kind = 'streak_last_call'
       and title = _want_t
       and body  = _want_b
       and body not like '%{%'
       and deep_link = '/today?opened_via=streak_last_call';
    _out := _out || jsonb_build_object(
      'name', 'the 16:50 last call sends, tagged as its own kind',
      'pass', _n = 1, 'detail', format('matching=%s, want=%L / %L',
                                       _n, _want_t, _want_b));

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
