/* ===========================================================================
   0152 — RETURN AND START: two producers beside streak protection
   ===========================================================================

   Streak protection (streak_keeper noon, streak_last_call 16:50) is UNTOUCHED.
   This adds two selections to generate_push_outbox and nothing else in the
   chain changes: the same cron, the same route, the same sender, the same
   push_outbox_due view (which is kind-agnostic — status/channel/clock only).

   ---------------------------------------------------------------------------
   THE THREE CLASSES ARE DISJOINT BY PREDICATE, WHICH IS WHY PRIORITY IS FREE
   ---------------------------------------------------------------------------
   Ryan's rule: an advisor is in at most one class on any day, Protect > Return
   > Start. These do not overlap by construction, so the priority is structural
   rather than a tie-break anyone has to maintain:

     Protect   live streak        current_len >= 2 AND last_completed_on =
                                   previous_scheduled_day(today)
     Return    completed, lapsed  last_completed_on IS NOT NULL AND
                                   last_completed_on < previous_scheduled_day
     Start     never completed    no daily_completion row, ever

   Protect needs the last scheduled day completed; Return needs it missed —
   mutually exclusive. Start needs zero completions; Protect and Return both
   need at least one — mutually exclusive. No advisor can satisfy two.

   And the backstop, if a future edit ever breaks that: the branches run
   Protect → Return → Start, and `notification_outbox_one_per_day` (unique on
   recipient_id, local_date, every kind but personal_best) refuses the second
   insert of the day. "At most one, never a third" is the database's, not the
   policy row's — which is where Ryan asked the caps to live.

   ---------------------------------------------------------------------------
   NEITHER CLASS TRUSTS current_len
   ---------------------------------------------------------------------------
   current_len only moves on a completion, so a lapsed streak reads stale (the
   F6 corpse). Return and Start are decided from last_completed_on and
   daily_completion directly — the facts — never from the counter. Protect's
   own branch is left exactly as it was.

   ---------------------------------------------------------------------------
   CADENCE IS POLICY, CAPS ARE CODE
   ---------------------------------------------------------------------------
   outbox_policy.cadence (jsonb) carries the tunable numbers — the 30-day stop,
   the every-second-workday interval, the weekly interval, the send hour, the
   Start send schedule — so they change without a deploy. The per-class caps
   (one a day, never on a closure, never to push-off / unmapped / unentitled)
   are enforced HERE, in the generator, not trusted to the policy row.
   =========================================================================== */

/* ---- 1. cadence parameters live on the policy row ------------------------ */

alter table outbox_policy add column if not exists cadence jsonb;

comment on column outbox_policy.cadence is
  'Class-specific cadence numbers, read by generate_push_outbox. return: '
  '{stop_after_days, fast_until_workday, fast_interval, slow_interval}. '
  'start: {sends:[workday numbers]}. Null for the streak kinds, whose timing '
  'is target_local_time alone. Tunable without a deploy; the caps are in code.';

insert into outbox_policy (kind, target_local_time, min_days_between, channel, enabled, cadence, note)
values
  ('return', time '07:00', 0, 'push', true,
   jsonb_build_object('stop_after_days', 30, 'fast_until_workday', 10,
                      'fast_interval', 2, 'slow_interval', 5),
   'Re-engagement for a lapsed advisor: the next scheduled morning after the '
   'first miss, every second scheduled workday through week two, then weekly, '
   'stopping 30 calendar days after the last completion. A completion resets it.'),
  ('start', time '07:00', 0, 'push', true,
   jsonb_build_object('sends', jsonb_build_array(1, 3)),
   'First-touch for an advisor who accepted the invite but has never completed '
   'a morning: the next scheduled morning (workday 1), once more two scheduled '
   'workdays later (workday 3), then stop.')
on conflict (kind) do update
  set target_local_time = excluded.target_local_time,
      channel           = excluded.channel,
      enabled           = excluded.enabled,
      cadence           = excluded.cadence,
      note              = excluded.note;

/* ---- 2. counting the advisor's scheduled workdays ------------------------ */

/**
 * How many SCHEDULED workdays fall in (_since, _through] for this advisor.
 *
 * The cadence is counted in the advisor's own scheduled workdays, not calendar
 * days — a Tue/Sat advisor and a Mon-Fri advisor on the same lapse are at
 * different points in the sequence. is_scheduled_day already folds in the
 * schedule, Island Time AND confirmed store closures, so a shut store or a
 * booked absence simply does not advance the count.
 *
 * Bounded by its own callers: Return stops at 30 calendar days and Start only
 * asks about workdays 1 and 3, so the series is never long.
 */
create or replace function scheduled_days_since(_user uuid, _since date, _through date)
  returns int
  language sql
  stable
  security definer
  set search_path = public
as $$
  select case
    when _since is null or _through <= _since then 0
    else (
      select count(*)::int
        from generate_series(_since + 1, _through, interval '1 day') g(d)
       where is_scheduled_day(_user, g.d::date)
    )
  end
$$;

revoke all on function scheduled_days_since(uuid, date, date) from public, anon;

/**
 * Is today a Return send day, given the workday index and the cadence?
 *
 *   workdays 1..fast_until   every `fast_interval`-th, starting at 1   (1,3,5,7,9)
 *   workdays past fast_until every `slow_interval`-th from there        (15,20,25)
 *
 * Pure arithmetic over the policy's own numbers; the 30-day stop is the
 * caller's calendar-day guard, not this.
 */
create or replace function return_send_due(_wd int, _cadence jsonb)
  returns boolean
  language sql
  immutable
as $$
  select case
    when _wd < 1 then false
    when _wd <= coalesce((_cadence->>'fast_until_workday')::int, 10)
      then (_wd % coalesce((_cadence->>'fast_interval')::int, 2)) = 1
    else ((_wd - coalesce((_cadence->>'fast_until_workday')::int, 10))
           % coalesce((_cadence->>'slow_interval')::int, 5)) = 0
  end
$$;

/* ---- 3. copy — three families, kept in step with push-copy.ts ----------- */

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
                         'A look at how your {n} advisors finished the week.'),
    /* RETURN — names what is waiting, never the miss. {family} is the advisor's
       locked pitch family, the same row the morning's pitch slot reads; it
       falls back to a family-less line when there is no assignment. */
    ('return',           'Your Swell is here when you are',
                         '{family} is up today. About five minutes.'),
    /* START — the first thing EDIAGD ever says to them. What the morning is,
       not that they are behind. */
    ('start',            'Welcome to EDIAGD',
                         'Your first morning is three minutes — a mindset video and one idea for the drive.')
  ) as c(kind, title, body)
  where c.kind = _kind::text
$$;

/* ---- 3b. the audience guard learns the two new invitations --------------
   0056's trigger admits an advisor-facing kind only if it is a win or an
   invitation (rule 2). return and start are both invitations — one points at
   what is ready today, the other describes the first morning — so they are
   added here, deliberately, the way the guard's own comment says new kinds
   must be. Without this every return/start insert would raise, which is the
   guard working; this is the decision it was waiting for. */

create or replace function notification_outbox_enforce_audience()
  returns trigger
  language plpgsql
as $function$
declare
  _role member_role;
  advisor_safe constant outbox_kind[] :=
    array[
      'daily_numbers',
      'eddies_pick',
      'personal_best',
      'streak_keeper',
      'streak_last_call',
      /* Re-engagement (0152). Both are invitations, not verdicts:
         return  — names what is waiting today, never the days missed.
         start   — describes the first morning to someone who has none yet. */
      'return',
      'start'
    ]::outbox_kind[];
begin
  select m.role into _role from membership m where m.id = new.membership_id;

  if _role = 'advisor' and not (new.kind = any (advisor_safe)) then
    raise exception
      'notification_outbox: % may not be sent to an advisor. Advisors receive wins and invitations only (0030 rule 2).',
      new.kind;
  end if;

  if new.kind = 'manager_digest' and _role not in ('manager', 'admin') then
    raise exception
      'notification_outbox: manager_digest is for coaches only — a team summary sent to an advisor is a comparison.';
  end if;

  return new;
end $function$;

/* ---- 4. the generator gains two selections ------------------------------ */

create or replace function generate_push_outbox(_now_override timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
        /* ================= PROTECT — UNCHANGED FROM 0112 ================= */
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
          and s.current_len >= 2
          and s.last_completed_on is not null
          and s.last_completed_on = previous_scheduled_day(m.user_id, _l_date)
          and is_scheduled_day(m.user_id, _l_date)
          and not exists (
            select 1 from daily_completion dc
             where dc.user_id = m.user_id and dc.completion_date = _l_date)
          and coalesce(
                (select p.push_enabled from user_notification_pref p
                  where p.user_id = m.user_id), true)
          and exists (
            select 1 from device_push_token t
             where t.user_id = m.user_id and t.retired_at is null)
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;

      elsif _p.kind = 'return' then
        /* ======================= RETURN ================================= */
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'return', _p.channel,
          c.title,
          replace(c.body, '{family}', coalesce(fam.family, 'Today''s training')),
          '/today?opened_via=return',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('Return: last completion %s — %s missed scheduled day(s), %s calendar day(s) since; cadence due.',
                 s.last_completed_on,
                 scheduled_days_since(m.user_id, s.last_completed_on, _l_date) - 1,
                 _l_date - s.last_completed_on),
          format('return:%s:%s', m.id, _l_date)
        from membership m
        join swell s on s.user_id = m.user_id
        cross join lateral (select * from push_copy('return')) c
        left join lateral (
          select aff.family
            from advisor_focus_family aff
           where aff.user_id = m.user_id and aff.ended_on is null
             and aff.family is not null
           order by aff.assigned_on desc
           limit 1
        ) fam on true
        where m.rooftop_id = _r.rooftop_id
          and m.active and m.role = 'advisor'
          /* mapped AND entitled — never an unmapped or unentitled account */
          and m.op_code_id is not null
          and rooftop_has_product(_r.rooftop_id, 'advisor_base')
          /* scheduled workday; is_scheduled_day excludes closures and Island Time */
          and is_scheduled_day(m.user_id, _l_date)
          /* completed before, and the last scheduled day was MISSED — this is
             what makes it disjoint from Protect and independent of current_len */
          and s.last_completed_on is not null
          and s.last_completed_on < previous_scheduled_day(m.user_id, _l_date)
          /* the 30-day hard stop, in calendar days since the last completion */
          and (_l_date - s.last_completed_on)
                < coalesce((_p.cadence->>'stop_after_days')::int, 30)
          /* today is a send day in the decaying cadence, COUNTED IN MISSES.
             scheduled_days_since counts through today; today is a scheduled
             morning (the gate above guarantees it) and is not itself a miss,
             so the miss index is that count minus one — which makes the first
             send land on the scheduled morning after the first missed day
             (index 1), exactly as the ruling states. */
          and return_send_due(
                scheduled_days_since(m.user_id, s.last_completed_on, _l_date) - 1,
                _p.cadence)
          /* not already done today */
          and not exists (
            select 1 from daily_completion dc
             where dc.user_id = m.user_id and dc.completion_date = _l_date)
          /* they want push, and there is somewhere to send it */
          and coalesce(
                (select p.push_enabled from user_notification_pref p
                  where p.user_id = m.user_id), true)
          and exists (
            select 1 from device_push_token t
             where t.user_id = m.user_id and t.retired_at is null)
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;

      elsif _p.kind = 'start' then
        /* ======================= START ================================= */
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'start', _p.channel,
          c.title, c.body,
          '/today?opened_via=start',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('Start: membership created %s — scheduled workday %s, no completion yet.',
                 m.created_at::date,
                 scheduled_days_since(m.user_id, m.created_at::date, _l_date)),
          format('start:%s:%s', m.id, _l_date)
        from membership m
        cross join lateral (select * from push_copy('start')) c
        where m.rooftop_id = _r.rooftop_id
          and m.active and m.role = 'advisor'
          and rooftop_has_product(_r.rooftop_id, 'advisor_base')
          and is_scheduled_day(m.user_id, _l_date)
          /* never completed a morning — the whole definition of Start, and what
             makes it disjoint from Protect and Return */
          and not exists (
            select 1 from daily_completion dc where dc.user_id = m.user_id)
          /* on one of the start send workdays (1, then 3) */
          and scheduled_days_since(m.user_id, m.created_at::date, _l_date)
                in (select (jsonb_array_elements_text(_p.cadence->'sends'))::int)
          and coalesce(
                (select p.push_enabled from user_notification_pref p
                  where p.user_id = m.user_id), true)
          and exists (
            select 1 from device_push_token t
             where t.user_id = m.user_id and t.retired_at is null)
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
end $function$;
