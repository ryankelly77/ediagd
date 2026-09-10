-- ============================================================================
-- EDIAGD — 0112 Lunchtime nudge, and a last call before the drive closes
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED AND WHY
-- ---------------------------------------------------------------------------
-- The streak saver fired at 19:00 — the last minute the send window allows.
-- Ryan: "end of day right before signing off seems too late to me. If the
-- advisor didn't have a chance in the morning, then we remind them at lunch."
--
-- He is right about the mechanics of the job. An advisor at 7pm has left, or
-- is leaving; the notification arrives after the last moment it could have
-- changed anything. Noon is the first point in the day where "you have not
-- done this yet" is both true and actionable — there is a lunch break, and
-- there are still hours of drive left.
--
-- The hour itself is game_settings.streak_saver_hour_local and was moved to 12
-- as data. This migration is the second half: a LAST CALL at 16:50, and copy
-- that matches what each of the two moments actually is.
--
-- ---------------------------------------------------------------------------
-- THIS RELAXES A RULE THE SCHEMA CALLS HARD, DELIBERATELY
-- ---------------------------------------------------------------------------
-- 0056 wrote "ONE PER ADVISOR PER DAY" into the schema as a hard rule, with
-- personal_best named as the single exemption, because an alerting system left
-- alone becomes the inspection tool the brand book warns about. Two streak
-- messages in a day is a second exemption, and it is being made on purpose
-- rather than by accident — so it is written down here in the same voice.
--
-- What keeps it honest is that BOTH still require the streak to be genuinely
-- at risk: a real streak of 2+, alive as of the previous scheduled day, on a
-- day they were rostered, not yet completed, and not on Island Time or a
-- closure. An advisor who does their three minutes at 9am gets neither. An
-- advisor who does them at 12:30 gets the first and not the second. The only
-- person who receives two is the one who has a live streak, was asked to work,
-- and has still not opened the app by ten to five — and for that person the
-- second message is the difference between keeping it and not.
--
-- If that ever stops being true, the fix is to disable this row, not to add a
-- third.
--
-- ---------------------------------------------------------------------------
-- 16:50 ARRIVES AT 17:00
-- ---------------------------------------------------------------------------
-- The cron runs hourly on the hour, and the generator fires a policy when the
-- rooftop's local clock is inside [target, target + 60min). 16:50 is therefore
-- picked up by the 17:00 run, not at 16:50. Ryan asked for 4:50; what lands is
-- 5:00 unless the cron is moved to */10, which is a vercel.json change and 144
-- invocations a day instead of 24. 16:50 is stored rather than 17:00 so that
-- the intent survives if the cron ever does get finer.
-- ============================================================================

-- ---- 1. The policy row ------------------------------------------------------
insert into outbox_policy (kind, target_local_time, min_days_between, channel, enabled, note)
values (
  'streak_last_call',
  time '16:50',
  0,
  'push',
  true,
  'Last call before the drive closes, for a streak still unclaimed after the '
  'lunchtime nudge. Same five conditions as streak_keeper. Fires on the 17:00 '
  'cron run — see the note in 0112 about hourly granularity.'
)
on conflict (kind) do update
  set target_local_time = excluded.target_local_time,
      enabled           = excluded.enabled,
      note              = excluded.note;


-- ---- 2. The copy ------------------------------------------------------------
/**
 * Both streak strings, in Ryan's words.
 *
 * {days} is the streak as it stands. {days_next} is what it becomes if they
 * go today — the last call names the number they are about to earn rather
 * than the one they are about to lose, which is the same fact told the way
 * this product tells things.
 *
 * The other four kinds are untouched. They are v1-disabled and their strings
 * are 0056's; re-enabling one must not also ship a copy edit nobody reviewed.
 */
create or replace function push_copy(_kind outbox_kind)
returns table (title text, body text)
language sql
immutable
as $$
  select c.title, c.body from (values
    ('daily_numbers',    'Aloha — yesterday''s numbers are in',
                         'Take three minutes and see where you landed.'),
    ('eddies_pick',      'Eddie''s Pick is ready',
                         '{family} is your biggest opportunity today. Here''s the word track.'),
    ('personal_best',    'That''s a personal best',
                         'Your best month yet. Take the win — you earned it.'),
    ('streak_keeper',    'Keep your Swell going!',
                         'It''s just 3 minutes. Now is a good moment.'),
    ('streak_last_call', 'Don''t forget your 3 minutes at EDIAGD!',
                         'Keep that Swell going to {days_next} days!'),
    ('manager_digest',   'Your team''s week',
                         'A look at how your {n} advisors finished the week.')
  ) as c(kind, title, body)
  where c.kind = _kind::text
$$;

grant execute on function push_copy(outbox_kind) to authenticated;


-- ---- 3. The generator, now serving both -------------------------------------
/**
 * ONE BRANCH FOR BOTH KINDS, not two copies of the same forty lines.
 *
 * The eligibility test is identical — that is the design, not a shortcut. The
 * two differ only in when they fire and what they say, and both of those are
 * already data: target_local_time on the policy row, and the strings in
 * push_copy. Duplicating the WHERE clause would be duplicating the five
 * conditions, and the second copy is the one that would eventually drift and
 * start messaging somebody on their day off.
 *
 * The dedup key takes _p.kind, so the two occupy different slots and the
 * unique index still refuses a third of either.
 */
create or replace function generate_push_outbox(_now_override timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _at        timestamptz := coalesce(_now_override, now());
  _queued    int := 0;
  _skipped   int := 0;
  _n         int := 0;
  _r         record;
  _p         record;
  _local_now timestamp;
  _l_date    date;
  _l_time    time;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
    or auth.uid() is null   -- pg_cron runs with no JWT at all
  ) then
    raise exception 'generate_push_outbox: platform owner only';
  end if;

  for _r in
    select r.id as rooftop_id, r.timezone
      from rooftop r
     where exists (select 1 from membership m where m.rooftop_id = r.id and m.active)
  loop
    _local_now := _at at time zone _r.timezone;
    _l_date    := _local_now::date;
    _l_time    := _local_now::time;

    for _p in select * from outbox_policy where enabled loop
      -- Has this kind's moment passed today, within the last hour?
      continue when not (_l_time >= _p.target_local_time
                     and _l_time <  _p.target_local_time + interval '60 minutes');
      continue when _p.target_local_time < time '06:30'
                 or _p.target_local_time > time '19:00';

      if _p.kind in ('streak_keeper', 'streak_last_call') then
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, _p.kind, _p.channel,
          replace(replace(c.title, '{days}', s.current_len::text),
                  '{days_next}', (s.current_len + 1)::text),
          replace(replace(c.body,  '{days}', s.current_len::text),
                  '{days_next}', (s.current_len + 1)::text),
          /* Into today's block, not home, and carrying its own attribution so
             an open can be told apart from somebody who happened to open the
             app at seven. The two kinds tag differently so the report can say
             which of the two actually moves people. */
          case when _p.kind = 'streak_last_call'
               then '/today?opened_via=streak_last_call'
               else '/today?opened_via=streak_saver' end,
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('%s-day Swell, scheduled today, not yet completed at %s local.',
                 s.current_len, _p.target_local_time),
          format('%s:%s:%s', _p.kind, m.id, _l_date)
        from membership m
        join swell s on s.user_id = m.user_id
        cross join lateral (select * from push_copy(_p.kind)) c
        where m.rooftop_id = _r.rooftop_id
          and m.active and m.role = 'advisor'
          -- 3. the streak is real AND still alive
          and s.current_len >= 2
          and s.last_completed_on is not null
          and s.last_completed_on = previous_scheduled_day(m.user_id, _l_date)
          -- 1. today is a work day: schedule, Island Time and closures
          and is_scheduled_day(m.user_id, _l_date)
          -- 2. not already done
          and not exists (
            select 1 from daily_completion dc
             where dc.user_id = m.user_id and dc.completion_date = _l_date
          )
          -- 4. they want it, and there is somewhere to send it
          and coalesce(
                (select p.push_enabled from user_notification_pref p
                  where p.user_id = m.user_id), true)
          and exists (
            select 1 from device_push_token t
             where t.user_id = m.user_id and t.retired_at is null
          )
        -- 5. once per person per day PER KIND, by the index
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;
      end if;

    end loop;
  end loop;

  return jsonb_build_object(
    'generated_at', _at,
    'queued', _queued,
    'skipped', _skipped
  );
end $$;

revoke all on function generate_push_outbox(timestamptz) from public, anon;

notify pgrst, 'reload schema';
