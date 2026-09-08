-- ============================================================================
-- EDIAGD — 0102 The streak saver: one notification, and everything that makes
--          it safe to send
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ALREADY HERE, AND WHY THIS IS NOT A NEW SYSTEM
-- ---------------------------------------------------------------------------
-- 0056 built the outbox, the device token table, rooftop wall-clock helpers, a
-- per-kind policy table, a generator that runs on the STORE's clock, and a
-- `streak_keeper` kind. It stopped one step short of delivery: nothing has ever
-- drained the outbox to a device.
--
-- So this migration does not add a parallel `notification_send` / `user_device`
-- pair. Two tables meaning "we sent somebody a push" is precisely the drift the
-- rest of this schema is written to avoid, and the outbox already carries the
-- dedup key, the one-per-day guard and the rooftop clock that a second table
-- would have to re-derive. What it lacked was a count of devices, a record of
-- the open, a per-device delivery outcome, and a way to retire a dead token —
-- which are columns and a child table, not a new system.
--
-- `notification_send` exists at the end of this file as a VIEW over the outbox
-- with exactly the column names the brief names, so anything written against
-- that vocabulary reads true.
--
-- ---------------------------------------------------------------------------
-- THE FIVE CONDITIONS, AND WHERE EACH ONE LIVES
-- ---------------------------------------------------------------------------
--   1. today is a scheduled work day   is_scheduled_day(), extended below
--   2. today's block is not complete    not exists daily_completion
--   3. current streak >= 2 AND ALIVE    swell + previous_scheduled_day()
--   4. has a live token, not opted out  device_push_token + user_notification_pref
--   5. nothing sent today               the outbox dedup index, unchanged
--
-- If any fails: silence. Most advisors on most days get nothing, and that is
-- the feature working rather than the feature broken.
--
-- ---------------------------------------------------------------------------
-- A NOTE ON 0030'S RULE 2
-- ---------------------------------------------------------------------------
-- 0030 wrote into the schema that advisors receive wins only, because an
-- alerting system left alone becomes the inspection tool the brand book names
-- as the industry's failure. A nudge about an incomplete day sits closer to
-- that line than anything shipped so far.
--
-- It stays on the right side of it because of what it is allowed to say and
-- when. It fires only while the streak is ALIVE — never to report one broken —
-- and the words are an invitation with a number in them, not a warning. The
-- copy rules in lib/notifications/push-copy.ts are load-bearing here, not
-- decoration.
-- ============================================================================


-- ---- 1. The send hour ------------------------------------------------------
/**
 * 7pm at the store, as a policy Mitch can move.
 *
 * It lives in game_settings because that is where every other tunable number in
 * this product lives, and it is mirrored into outbox_policy by the trigger
 * below because outbox_policy is the mechanism the generator reads. One place
 * to edit, one place to read, and a trigger keeping them honest — rather than a
 * second number somebody has to remember to change.
 */
alter table game_settings
  add column if not exists streak_saver_hour_local int not null default 19;

do $$ begin
  alter table game_settings
    add constraint game_settings_streak_saver_hour_range
    check (streak_saver_hour_local between 0 and 23);
exception when duplicate_object then null; end $$;

/**
 * Keep outbox_policy's streak_keeper time in step with game_settings.
 *
 * 19:00 is the LAST minute the quiet-hours check constraint on the outbox
 * allows, which is not a coincidence: the streak saver is the one kind that
 * wants the very end of the working day, and anything later is a phone buzzing
 * at somebody's dinner table. An hour past 19 would make every insert fail at
 * the constraint, so it is clamped here rather than discovered at 7pm.
 */
create or replace function sync_streak_saver_hour()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update outbox_policy
     set target_local_time = make_time(least(new.streak_saver_hour_local, 19), 0, 0)
   where kind = 'streak_keeper';
  return new;
end $$;

drop trigger if exists game_settings_streak_saver_hour on game_settings;
create trigger game_settings_streak_saver_hour
  after insert or update of streak_saver_hour_local on game_settings
  for each row execute function sync_streak_saver_hour();

/* Apply it once for the row that already exists. */
update outbox_policy
   set target_local_time = make_time(
         least((select streak_saver_hour_local from game_settings limit 1), 19), 0, 0),
       note = 'End of the working day, and only when the streak is genuinely at '
              'risk today. Never on a rest day. Hour is game_settings.streak_saver_hour_local.'
 where kind = 'streak_keeper';


-- ---- 2. v1 IS ONE NOTIFICATION ---------------------------------------------
/**
 * The other four kinds are switched off, not deleted.
 *
 * This matters more than it looks. The outbox has a ONE PER PERSON PER DAY
 * unique index, so a daily_numbers row queued at 07:00 would silently consume
 * the day's only slot and the streak saver at 19:00 would lose the insert. The
 * kinds were never going to co-exist by accident, and v1 ships exactly one.
 *
 * They stay in the enum and in the policy table with enabled=false, because
 * the brief's own ruling is that the streak saver's numbers decide what earns a
 * slot next. Re-enabling is a one-row update when that decision is made.
 */
update outbox_policy set enabled = false where kind <> 'streak_keeper';
update outbox_policy set enabled = true  where kind =  'streak_keeper';


-- ---- 3. Condition 1: rest days, ALL of them --------------------------------
/**
 * is_scheduled_day() gains confirmed closures.
 *
 * It was written in 0030 and covered the work schedule and Island Time, which
 * were the only two rest reasons that existed then. 0101 added the third — a
 * per-rooftop closure calendar — and this predicate never learned about it, so
 * every caller has been treating Thanksgiving as a work day.
 *
 * Fixing it here rather than special-casing the streak saver is the whole point
 * of there being ONE predicate. lib/work-schedule.ts:restDayFor is the
 * TypeScript half of the same rule and already has all three; this brings the
 * SQL half level with it, and every existing caller is more correct for it.
 *
 * CONFIRMED ONLY. A proposed closure is inert everywhere else in the product
 * and must be inert here too — a manager who has not yet ruled on Christmas has
 * not told us the store is shut.
 *
 * The rooftop comes from the user's active memberships. Somebody who belongs to
 * two rooftops is at rest only if EVERY rooftop they are active at is shut,
 * which is the conservative reading: if one of their stores is open, the day is
 * a work day and the streak engine will count it.
 */
create or replace function is_scheduled_day(_user uuid, _d date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when not exists (select 1 from work_schedule w where w.user_id = _user)
        -- No schedule on file: the streak engine treats every day as a work
        -- day, and so does this, so the two can never disagree.
        then true
      else (
        select case extract(isodow from _d)::int
          when 1 then w.works_mon
          when 2 then w.works_tue
          when 3 then w.works_wed
          when 4 then w.works_thu
          when 5 then w.works_fri
          when 6 then case w.saturday_mode
                        when 'every' then true
                        when 'alternating' then w.saturday_anchor is not null
                                             and (abs(_d - w.saturday_anchor) % 14) = 0
                        else false
                      end
          else w.works_sun
        end
        from work_schedule w where w.user_id = _user
      )
    end
    and not exists (
      select 1 from island_time it
       where it.user_id = _user and _d between it.start_date and it.end_date
    )
    /* The store being shut is a rest day for everybody in it. */
    and not (
      exists (select 1 from membership m where m.user_id = _user and m.active)
      and not exists (
        select 1
          from membership m
         where m.user_id = _user
           and m.active
           and not exists (
             select 1 from rooftop_closed_day cd
              where cd.rooftop_id = m.rooftop_id
                and cd.closed_on = _d
                and cd.status = 'confirmed'
           )
      )
    );
$$;

grant execute on function is_scheduled_day(uuid, date) to authenticated;

/**
 * The last day before `_d` this person was due on the drive.
 *
 * Needed because "current streak >= 2" is not the same as "the streak is still
 * alive". swell.current_len is only recomputed when somebody COMPLETES a day,
 * so an advisor who ran a 3-day streak and then missed a work day still reads
 * current_len = 3 until their next completion. Sending them "Day 3 is on the
 * line" would be a lie about a streak that is already gone.
 *
 * So the generator asks a stricter question: was their last completion on the
 * previous day they were scheduled to work? If yes the streak is demonstrably
 * live and today is genuinely the day it is at stake.
 *
 * SIXTY DAYS OF SCAN, then null. A gap longer than that is somebody returning
 * from an absence, and the honest answer is silence.
 *
 * NOT GRACE-AWARE, deliberately. A streak bridged by a paddle-out is alive but
 * its last completion is not on the previous work day, so it gets no nudge.
 * Silence when unsure beats a notification carrying a number we had to guess.
 */
create or replace function previous_scheduled_day(_user uuid, _d date)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare _i int;
begin
  for _i in 1..60 loop
    if is_scheduled_day(_user, _d - _i) then
      return _d - _i;
    end if;
  end loop;
  return null;
end $$;

grant execute on function previous_scheduled_day(uuid, date) to authenticated;


-- ---- 4. Condition 4a: a token that is retired, never deleted ---------------
/**
 * 0056 deleted a token on sign-out. This retires it instead.
 *
 * The difference is what happens when somebody comes back. A deleted row takes
 * with it the fact that this handset was ever registered, so re-enabling means
 * a fresh iOS permission prompt — and that prompt is one-shot. A retired row
 * un-retires on the next registration and delivery resumes with no dialog at
 * all.
 *
 * It is also the honest record. APNs telling us a token is dead is an EVENT
 * worth keeping, not a reason to forget the device existed.
 */
alter table device_push_token
  add column if not exists retired_at timestamptz;

alter table device_push_token
  add column if not exists retired_reason text;

create index if not exists device_push_token_live
  on device_push_token (user_id) where retired_at is null;

/**
 * Registration un-retires. Somebody reinstalling the app, or turning
 * notifications back on, is telling us the device is alive again — and they are
 * a more current source on that than a 410 from last month.
 */
create or replace function register_push_token(_token text, _platform push_platform)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'register_push_token: not signed in';
  end if;
  if _token is null or length(trim(_token)) = 0 then
    raise exception 'register_push_token: empty token';
  end if;

  insert into device_push_token (user_id, platform, token, last_seen)
  values (_uid, _platform, trim(_token), now())
  on conflict (token) do update
    set user_id        = excluded.user_id,
        platform       = excluded.platform,
        last_seen      = now(),
        retired_at     = null,
        retired_reason = null;

  return jsonb_build_object('registered', true, 'platform', _platform);
end $$;

revoke all on function register_push_token(text, push_platform) from public, anon;
grant execute on function register_push_token(text, push_platform) to authenticated;

/** Sign-out, or "this handset is not mine any more". Retires; never deletes. */
create or replace function forget_push_token(_token text)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update device_push_token
     set retired_at = now(), retired_reason = 'signed_out'
   where token = trim(_token) and user_id = auth.uid() and retired_at is null
  returning jsonb_build_object('forgotten', true);
$$;

revoke all on function forget_push_token(text) from public, anon;
grant execute on function forget_push_token(text) to authenticated;

/**
 * What the delivery worker calls when APNs says a token is gone (410, or a
 * reason of 'Unregistered' / 'BadDeviceToken').
 *
 * Service role only: this is a statement about a device, made by the transport,
 * and no signed-in user should be able to retire somebody else's handset.
 */
create or replace function retire_push_token(_token text, _reason text)
returns void
language sql
security definer
set search_path = public
as $$
  update device_push_token
     set retired_at = now(), retired_reason = coalesce(_reason, 'apns_rejected')
   where token = trim(_token) and retired_at is null;
$$;

revoke all on function retire_push_token(text, text) from public, anon, authenticated;


-- ---- 5. Condition 4b: the soft-ask, and the switch -------------------------
/**
 * Why this is server-side and not localStorage.
 *
 * The iOS permission dialog is ONE SHOT. Ask at the wrong moment, get a "no",
 * and the app has permanently lost the ability to speak — the only route back
 * is Settings, which nobody walks. So the real prompt is never shown cold; it
 * is shown behind our own card, at a moment the advisor has just had a good
 * experience, and only twice ever.
 *
 * That budget is meaningless if it lives on a device. Advisors switch phones,
 * reinstall, and sign in on a loaner from the service drive — every one of
 * which would hand them a fresh set of two asks. The count is a fact about the
 * PERSON, so it lives with the person.
 *
 * push_enabled is separate from having a token on purpose. Turning it off must
 * not cost the OS permission that was so expensive to get: the tokens stay, the
 * sends stop, and turning it back on is instant and silent.
 */
create table if not exists user_notification_pref (
  user_id            uuid primary key references app_user(id) on delete cascade,

  /* The in-app switch on /profile. Default true so that somebody who has
     granted the OS prompt starts receiving without a second opt-in — the OS
     dialog WAS the opt-in. */
  push_enabled       boolean not null default true,

  /* The soft-ask, which is ours, and the OS prompt, which is Apple's. Both are
     recorded because "we asked and they said no" and "we asked and iOS refused"
     are different facts with different next steps. */
  soft_ask_count     int not null default 0,
  soft_ask_last_at   timestamptz,
  soft_ask_answer    text check (soft_ask_answer in ('yes', 'not_now')),
  soft_ask_answered_at timestamptz,

  updated_at         timestamptz not null default now()
);

alter table user_notification_pref enable row level security;

drop policy if exists user_notification_pref_own on user_notification_pref;
create policy user_notification_pref_own on user_notification_pref
  for select using (user_id = (select auth.uid()));

drop policy if exists user_notification_pref_own_write on user_notification_pref;
create policy user_notification_pref_own_write on user_notification_pref
  for insert with check (user_id = (select auth.uid()));

drop policy if exists user_notification_pref_own_update on user_notification_pref;
create policy user_notification_pref_own_update on user_notification_pref
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on user_notification_pref to authenticated;

/** The /profile switch. */
create or replace function set_push_enabled(_enabled boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'set_push_enabled: not signed in'; end if;

  insert into user_notification_pref (user_id, push_enabled, updated_at)
  values (_uid, _enabled, now())
  on conflict (user_id) do update
    set push_enabled = excluded.push_enabled, updated_at = now();

  return jsonb_build_object('push_enabled', _enabled);
end $$;

grant execute on function set_push_enabled(boolean) to authenticated;

/** Record that the soft-ask card was shown, and what they said to it. */
create or replace function record_soft_ask(_answer text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'record_soft_ask: not signed in'; end if;
  if _answer is not null and _answer not in ('yes', 'not_now') then
    raise exception 'record_soft_ask: unknown answer %', _answer;
  end if;

  insert into user_notification_pref (user_id, soft_ask_count, soft_ask_last_at,
                                      soft_ask_answer, soft_ask_answered_at)
  values (_uid, 1, now(), _answer,
          case when _answer is null then null else now() end)
  on conflict (user_id) do update
    set /* The count only moves when the card is SHOWN, which is the call with
           no answer. An answer to a card already counted must not spend a
           second one of their two. */
        soft_ask_count = user_notification_pref.soft_ask_count
                         + case when _answer is null then 1 else 0 end,
        soft_ask_last_at = case when _answer is null then now()
                           else user_notification_pref.soft_ask_last_at end,
        soft_ask_answer  = coalesce(_answer, user_notification_pref.soft_ask_answer),
        soft_ask_answered_at = case when _answer is null
                                    then user_notification_pref.soft_ask_answered_at
                                    else now() end,
        updated_at = now();

  return jsonb_build_object('ok', true);
end $$;

grant execute on function record_soft_ask(text) to authenticated;


-- ---- 6. What actually happened to a send -----------------------------------
alter table notification_outbox
  add column if not exists device_count int not null default 0;

alter table notification_outbox
  add column if not exists opened_at timestamptz;

create index if not exists notification_outbox_opened
  on notification_outbox (kind, local_date) where opened_at is not null;

/**
 * One row per device per send, because "sent" is not one fact when somebody
 * carries two handsets.
 *
 * This is where an APNs failure becomes visible. Without it a send row says
 * device_count = 2 and nothing records that one of the two was rejected, which
 * is exactly the state in which a silent delivery failure survives for months.
 */
create table if not exists push_delivery (
  id          uuid primary key default gen_random_uuid(),
  outbox_id   uuid not null references notification_outbox(id) on delete cascade,
  token_id    uuid references device_push_token(id) on delete set null,
  /* Kept verbatim rather than as a foreign key alone: the token may be retired
     and reassigned later, and this row is a record of what we sent to THEN. */
  token_tail  text not null,
  ok          boolean not null,
  apns_status int,
  apns_reason text,
  apns_id     text,
  at          timestamptz not null default now()
);

create index if not exists push_delivery_outbox on push_delivery (outbox_id);
create index if not exists push_delivery_failures on push_delivery (at desc) where not ok;

alter table push_delivery enable row level security;
/* Nobody reads this from the app. The worker is service-role; admins read it
   through the view below. */
grant select on push_delivery to authenticated;

drop policy if exists push_delivery_admin_read on push_delivery;
create policy push_delivery_admin_read on push_delivery
  for select using (is_platform_owner());


-- ---- 7. The generator's streak_keeper branch, corrected --------------------
/**
 * Three things were wrong with the branch 0056 shipped, and none of them could
 * have been noticed without a transport to make them visible.
 *
 *   1. `s.last_completed_on = _l_date - 1` is calendar arithmetic in a product
 *      whose entire premise is that a week is not seven work days. A Mon–Fri
 *      advisor on a Monday has last_completed_on = Friday, so the one advisor
 *      shape the system was built for would NEVER have received this. Now it
 *      asks previous_scheduled_day().
 *   2. It could not see closures, because is_scheduled_day() could not. Fixed
 *      above, for every caller.
 *   3. It ignored whether the person wanted to hear from us at all, and would
 *      queue rows for advisors with no device on file — filling the outbox with
 *      messages that can never leave, and burning their one-per-day slot.
 *
 * The window is also widened from 30 minutes to 60, because delivery is now
 * driven by an HOURLY Vercel cron rather than only by pg_cron's half-hour beat.
 * Widening is free: every insert carries a dedup key and lands `on conflict do
 * nothing`, so a window seen twice produces one row.
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

      if _p.kind = 'streak_keeper' then
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'streak_keeper', _p.channel,
          replace(c.title, '{days}', s.current_len::text),
          replace(c.body,  '{days}', s.current_len::text),
          /* Into today's block, not home, and carrying its own attribution so
             an open can be told apart from somebody who happened to open the
             app at seven. */
          '/today?opened_via=streak_saver',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('%s-day Swell, scheduled today, not yet completed at %s local.',
                 s.current_len, _p.target_local_time),
          format('streak_keeper:%s:%s', m.id, _l_date)
        from membership m
        join swell s on s.user_id = m.user_id
        cross join lateral (select * from push_copy('streak_keeper')) c
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
        -- 5. once per person per day, by the index
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


/**
 * The copy, kept in step with lib/notifications/push-copy.ts.
 *
 * Only streak_keeper changes here — the other four are v1-disabled and their
 * strings are left exactly as 0056 wrote them, so re-enabling one does not also
 * silently ship a copy edit nobody reviewed.
 *
 * `npm run preview:push` asserts this function and the TypeScript agree. If you
 * change one and not the other, that script is what tells you.
 */
create or replace function push_copy(_kind outbox_kind)
returns table (title text, body text)
language sql
immutable
as $$
  select c.title, c.body from (values
    ('daily_numbers',  'Aloha — yesterday''s numbers are in',
                       'Take three minutes and see where you landed.'),
    ('eddies_pick',    'Eddie''s Pick is ready',
                       '{family} is your biggest opportunity today. Here''s the word track.'),
    ('personal_best',  'That''s a personal best',
                       'Your best month yet. Take the win — you earned it.'),
    ('streak_keeper',  'Day {days} is on the line',
                       'One rep keeps the streak alive — today''s is still open.'),
    ('manager_digest', 'Your team''s week',
                       'A look at how your {n} advisors finished the week.')
  ) as c(kind, title, body)
  where c.kind = _kind::text
$$;

grant execute on function push_copy(outbox_kind) to authenticated;


-- ---- 8. What the transport reads and writes -------------------------------
/**
 * The due batch, one row per (message, live device).
 *
 * Re-checks push_enabled and retired_at at READ time rather than trusting the
 * generator's decision from an hour ago. Somebody who opts out at 6:55pm must
 * not receive a message queued at 6:00.
 */
/* Dropped rather than replaced: the column list gains token_id, and
   `create or replace view` refuses to rename or reorder columns. */
drop view if exists push_outbox_due;
create view push_outbox_due as
select
  o.id, o.recipient_id, o.rooftop_id, o.kind, o.channel,
  o.title, o.body, o.deep_link, o.scheduled_for, o.local_date, o.rationale,
  t.id as token_id, t.token, t.platform
from notification_outbox o
join device_push_token t on t.user_id = o.recipient_id and t.retired_at is null
where o.status = 'pending'
  and o.channel = 'push'
  and o.scheduled_for <= now()
  and coalesce(
        (select p.push_enabled from user_notification_pref p
          where p.user_id = o.recipient_id), true);

alter view push_outbox_due set (security_invoker = on);
grant select on push_outbox_due to authenticated;

/** Delivered to at least one device. */
create or replace function mark_push_sent(_id uuid, _device_count int)
returns void
language sql
security definer
set search_path = public
as $$
  update notification_outbox
     set status = 'sent', sent_at = now(), device_count = greatest(_device_count, 0)
   where id = _id and status = 'pending';
$$;

revoke all on function mark_push_sent(uuid, int) from public, anon, authenticated;

/**
 * Every device refused it, or there was nothing to send to.
 *
 * A skipped row does NOT consume the one-per-day slot (the index excludes
 * them), which is right: a message nobody received is not a message somebody
 * received.
 */
create or replace function mark_push_skipped(_id uuid, _reason text)
returns void
language sql
security definer
set search_path = public
as $$
  update notification_outbox
     set status = 'skipped', skipped_reason = coalesce(_reason, 'no_delivery')
   where id = _id and status = 'pending';
$$;

revoke all on function mark_push_skipped(uuid, text) from public, anon, authenticated;

/**
 * The deep link landed.
 *
 * Runs as the invoker and stamps only the caller's own row, so an open cannot
 * be claimed on somebody else's behalf. Idempotent: the first tap wins, and a
 * second one does not overwrite the time with a later one.
 */
create or replace function mark_push_opened(_kind outbox_kind, _local_date date)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare _uid uuid := auth.uid(); _n int;
begin
  if _uid is null then return jsonb_build_object('stamped', false); end if;

  update notification_outbox
     set opened_at = now()
   where recipient_id = _uid
     and kind = _kind
     and local_date = _local_date
     and status = 'sent'
     and opened_at is null;

  get diagnostics _n = row_count;
  return jsonb_build_object('stamped', _n > 0);
end $$;

grant execute on function mark_push_opened(outbox_kind, date) to authenticated;


-- ---- 9. The brief's vocabulary, over the outbox ---------------------------
/**
 * `notification_send` as specified — user_id, store_date, kind, sent_at,
 * device_count, opened_at — without a second table claiming to be the record of
 * a send. Unique on (user_id, store_date, kind) is already true underneath:
 * notification_outbox_one_per_day enforces it for every kind v1 ships.
 */
drop view if exists notification_send;
create view notification_send as
select
  o.id,
  o.recipient_id as user_id,
  o.local_date   as store_date,
  o.kind,
  o.sent_at,
  o.device_count,
  o.opened_at,
  o.status,
  o.rooftop_id
from notification_outbox o
where o.status in ('sent', 'skipped');

alter view notification_send set (security_invoker = on);
grant select on notification_send to authenticated;

/**
 * Completion-after-nudge, which is the number that decides whether this feature
 * earns its slot.
 *
 * Of the sends that went out on a day the block was incomplete — which is every
 * send, by condition 2 — how many of those advisors finished before the store
 * day ended? No dashboard reads this yet; the point of writing it now is to
 * prove the tables can answer it.
 */
drop view if exists streak_saver_effect;
create view streak_saver_effect as
select
  o.local_date    as store_date,
  o.rooftop_id,
  count(*)                                          as sent,
  count(o.opened_at)                                as opened,
  count(dc.id)                                      as completed_after,
  round(100.0 * count(dc.id) / nullif(count(*), 0), 1) as completed_pct
from notification_outbox o
left join daily_completion dc
       on dc.user_id = o.recipient_id
      and dc.completion_date = o.local_date
where o.kind = 'streak_keeper'
  and o.status = 'sent'
group by o.local_date, o.rooftop_id;

alter view streak_saver_effect set (security_invoker = on);
grant select on streak_saver_effect to authenticated;

notify pgrst, 'reload schema';
