-- ============================================================================
-- EDIAGD — 0031 Generating the notifications
--
-- ONE FUNCTION, RUN ONCE A DAY, WRITING AT MOST A FEW HUNDRED ROWS.
--
-- The naive version of this feature emits one row per advisor per condition per
-- night: at 100 rooftops that is 500 advisors x several conditions x 365 days,
-- and a manager opening the app to eight notices about eight people. So nothing
-- here is per-advisor. Every recipient gets AT MOST ONE ROW PER KIND PER DAY,
-- with the people it concerns listed inside the payload.
--
-- VOLUME, stated plainly, at 100 rooftops:
--   * recipients are managers and admins, not advisors — roughly 250 of them
--   * each can receive at most one row per kind per day, capped further by
--     notification_settings.max_per_recipient_per_day (default 4)
--   * so the daily ceiling is ~1,000 rows and the realistic figure is far
--     lower, because most kinds do not fire on most days
--   * the platform owner receives NETWORK rows only — one per kind, never one
--     per store
--
-- WINS ARE GENERATED FIRST and carry severity 'win', which the inbox sorts
-- above everything else. That ordering is not cosmetic: it is the difference
-- between a tool that celebrates and a tool that polices.
-- ============================================================================

/**
 * Everyone who coaches a given rooftop. Managers and admins, never advisors —
 * advisors are recipients of wins only, and those are addressed individually.
 */
create or replace function rooftop_coaches(_rooftop uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.user_id
    from membership m
   where m.rooftop_id = _rooftop
     and m.active
     and m.role in ('manager', 'admin')
$$;


/**
 * Generate the day's notifications. Idempotent: run it twice and the unique
 * dedup index refuses every duplicate, so a retry after a failure is safe.
 *
 * SECURITY DEFINER because it reads across every rooftop. Callable by the
 * platform owner and by the service role — never by a browser, which is why
 * `notification` has no insert policy at all.
 */
create or replace function generate_notifications(_today date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s          notification_settings%rowtype;
  _d         date;
  _week      text;
  _written   int := 0;
  _trimmed   int;
begin
  if auth.uid() is not null and not is_platform_owner() then
    raise exception 'generate_notifications() is for the platform owner or the service role';
  end if;

  select * into s from notification_settings where id;
  _d := coalesce(_today, current_date);
  -- Recurring conditions key on the ISO week, so "still quiet" cannot re-fire
  -- night after night. It becomes news again next week.
  _week := to_char(_d, 'IYYY-IW');

  -- =========================================================================
  -- WINS FIRST
  -- =========================================================================

  -- ---- A milestone Swell: to the advisor, and to their coaches ------------
  -- Once per milestone per person, ever. The key carries the length, so
  -- reaching 30 after previously reaching 7 is genuinely new.
  with milestones as (
    select sw.user_id, sw.current_len, m.rooftop_id
      from swell sw
      join lateral (
        select rooftop_id from membership
         where user_id = sw.user_id and active and role = 'advisor'
         limit 1
      ) m on true
     where sw.current_len in (7, 30, 90, 365)
  ),
  -- The advisor's own copy. This is the ONLY notification an advisor receives,
  -- and it is unambiguously good news.
  to_advisor as (
    insert into notification (recipient_id, kind, severity, rooftop_id, subject_user_id,
                              title, body, payload, dedup_key)
    select
      ms.user_id, 'swell_milestone', 'win', ms.rooftop_id, ms.user_id,
      ms.current_len || '-day Swell',
      'That is ' || ms.current_len || ' days running. Enjoy it.',
      jsonb_build_object('length', ms.current_len),
      'swell_milestone:' || ms.user_id::text || ':' || ms.current_len
    from milestones ms
    on conflict (recipient_id, dedup_key) do nothing
    returning 1
  ),
  to_coach as (
    insert into notification (recipient_id, kind, severity, rooftop_id, subject_user_id,
                              title, body, payload, dedup_key)
    select
      c.coach, 'swell_milestone', 'win', ms.rooftop_id, ms.user_id,
      coalesce(nullif(btrim(u.full_name), ''), 'An advisor') || ' hit a '
        || ms.current_len || '-day Swell',
      'Worth saying out loud on the drive today.',
      jsonb_build_object('length', ms.current_len),
      'swell_milestone:' || ms.user_id::text || ':' || ms.current_len
    from milestones ms
    cross join lateral rooftop_coaches(ms.rooftop_id) as c(coach)
    left join app_user u on u.id = ms.user_id
    where c.coach <> ms.user_id
    on conflict (recipient_id, dedup_key) do nothing
    returning 1
  )
  select (select count(*) from to_advisor) + (select count(*) from to_coach) into _trimmed;
  _written := _written + coalesce(_trimmed, 0);

  -- ---- The whole team completed today ------------------------------------
  with full_house as (
    select r.id as rooftop_id, count(*) as team
      from rooftop r
      join membership m on m.rooftop_id = r.id and m.active and m.role = 'advisor'
     group by r.id
    having count(*) > 1
       and count(*) = count(*) filter (
             where exists (select 1 from daily_completion dc
                            where dc.user_id = m.user_id and dc.completion_date = _d))
  )
  insert into notification (recipient_id, kind, severity, rooftop_id, title, body, payload, dedup_key)
  select
    c.coach, 'team_all_completed', 'win', fh.rooftop_id,
    'Everyone completed today',
    'All ' || fh.team || ' advisors finished the loop. That is rare — name it.',
    jsonb_build_object('team', fh.team),
    'team_all_completed:' || fh.rooftop_id::text || ':' || _d::text
  from full_house fh
  cross join lateral rooftop_coaches(fh.rooftop_id) as c(coach)
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- ---- Coached services that moved, rolled up per coach ------------------
  -- Fires when performance data lands, keyed on the period, so it announces
  -- itself once per import rather than once per night.
  with wins as (
    select ir.rooftop_id, ir.period_id, ir.user_id, ir.family, ir.delta_pts,
           coalesce(nullif(btrim(u.full_name), ''), 'An advisor') as who
      from impact_rollup ir
      left join app_user u on u.id = ir.user_id
     where ir.coached
       and ir.delta_pts >= s.attach_win_pts
       and ir.starts_on >= _d - interval '70 days'
  ),
  rolled as (
    select w.rooftop_id, w.period_id, c.coach,
           count(*) as n,
           round(avg(w.delta_pts), 2) as avg_delta,
           jsonb_agg(jsonb_build_object('name', w.who, 'detail',
             w.family || ' +' || round(w.delta_pts, 1)) order by w.delta_pts desc) as items
      from wins w
      cross join lateral rooftop_coaches(w.rooftop_id) as c(coach)
     group by w.rooftop_id, w.period_id, c.coach
  )
  insert into notification (recipient_id, kind, severity, rooftop_id, title, body, payload, dedup_key)
  select
    r.coach, 'coached_service_up', 'win', r.rooftop_id,
    r.n || (case when r.n = 1 then ' coached service moved up' else ' coached services moved up' end),
    'Average +' || r.avg_delta || ' points on services these advisors were coached on.',
    jsonb_build_object('count', r.n, 'avg_delta', r.avg_delta, 'items', r.items),
    'coached_up:' || r.rooftop_id::text || ':' || r.period_id::text
  from rolled r
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- ---- A badge was earned -------------------------------------------------
  -- Keyed on the badge, so it is announced once and never again.
  with earned as (
    select ub.user_id, ub.badge_key, b.name as badge_name, m.rooftop_id,
           coalesce(nullif(btrim(u.full_name), ''), 'An advisor') as who
      from user_badge ub
      join badge b on b.key = ub.badge_key
      join lateral (
        select rooftop_id from membership
         where user_id = ub.user_id and active and role = 'advisor' limit 1
      ) m on true
      left join app_user u on u.id = ub.user_id
     where ub.earned_on >= _d - 7
  ),
  to_advisor as (
    insert into notification (recipient_id, kind, severity, rooftop_id, subject_user_id,
                              title, body, payload, dedup_key)
    select e.user_id, 'badge_earned', 'win', e.rooftop_id, e.user_id,
           e.badge_name || ' earned',
           'That one is yours now.',
           jsonb_build_object('badge', e.badge_key),
           'badge:' || e.user_id::text || ':' || e.badge_key
    from earned e
    on conflict (recipient_id, dedup_key) do nothing
    returning 1
  ),
  to_coach as (
    insert into notification (recipient_id, kind, severity, rooftop_id, subject_user_id,
                              title, body, payload, dedup_key)
    select c.coach, 'badge_earned', 'win', e.rooftop_id, e.user_id,
           e.who || ' earned ' || e.badge_name,
           'A good thing to notice out loud.',
           jsonb_build_object('badge', e.badge_key),
           'badge:' || e.user_id::text || ':' || e.badge_key
    from earned e
    cross join lateral rooftop_coaches(e.rooftop_id) as c(coach)
    where c.coach <> e.user_id
    on conflict (recipient_id, dedup_key) do nothing
    returning 1
  )
  select (select count(*) from to_advisor) + (select count(*) from to_coach) into _trimmed;
  _written := _written + coalesce(_trimmed, 0);

  -- ---- The store as a whole moved ----------------------------------------
  -- Rooftop-level attach movement, both directions. Up is a win; down is a
  -- concern phrased as something to look at together, and both are keyed on
  -- the period so they arrive once per import.
  with store_move as (
    select ir.rooftop_id, ir.period_id, ir.period_label,
           round(avg(ir.delta_pts), 2) as avg_delta,
           count(*) as n
      from impact_rollup ir
     where ir.delta_pts is not null
       and ir.starts_on >= _d - interval '70 days'
     group by ir.rooftop_id, ir.period_id, ir.period_label
  )
  insert into notification (recipient_id, kind, severity, rooftop_id, title, body, payload, dedup_key)
  select
    c.coach,
    case when sm.avg_delta > 0 then 'store_moved_up' else 'store_moved_down' end::notification_kind,
    case when sm.avg_delta > 0 then 'win' else 'concern' end::notification_severity,
    sm.rooftop_id,
    case when sm.avg_delta > 0
         then 'The store moved up in ' || sm.period_label
         else 'The store slipped in ' || sm.period_label end,
    case when sm.avg_delta > 0
         then 'Attach rate across every service averaged +' || sm.avg_delta
              || ' points. Somebody did that.'
         else 'Attach rate across every service averaged ' || sm.avg_delta
              || ' points. Worth looking at together before it settles.' end,
    jsonb_build_object('avg_delta', sm.avg_delta, 'services', sm.n),
    'store_move:' || sm.rooftop_id::text || ':' || sm.period_id::text
  from store_move sm
  cross join lateral rooftop_coaches(sm.rooftop_id) as c(coach)
  where abs(sm.avg_delta) >= s.store_move_pts
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- =========================================================================
  -- CONCERNS — every one addressed to a coach, never to the advisor
  -- =========================================================================

  -- ---- A meaningful Swell ended ------------------------------------------
  -- Keyed on the day it ended, so it is reported once and never again. The
  -- copy is the point: this is a moment to ask what happened, and the advisor
  -- is not told that their manager was told.
  with breaks as (
    select sw.user_id, sw.longest_len, sw.last_completed_on, m.rooftop_id,
           coalesce(nullif(btrim(u.full_name), ''), 'An advisor') as who
      from swell sw
      join lateral (
        select rooftop_id from membership
         where user_id = sw.user_id and active and role = 'advisor' limit 1
      ) m on true
      left join app_user u on u.id = sw.user_id
     where sw.current_len = 0
       and sw.longest_len >= s.swell_break_min_days
       and sw.last_completed_on is not null
       and sw.last_completed_on >= _d - interval '14 days'
  )
  insert into notification (recipient_id, kind, severity, rooftop_id, subject_user_id,
                            title, body, payload, dedup_key)
  select
    c.coach, 'swell_broken', 'concern', b.rooftop_id, b.user_id,
    b.who || '''s Swell ended',
    'A ' || b.longest_len || '-day run stopped. Worth asking what changed — '
      || 'people usually know.',
    jsonb_build_object('longest', b.longest_len, 'last_completed', b.last_completed_on),
    'swell_broken:' || b.user_id::text || ':' || b.last_completed_on::text
  from breaks b
  cross join lateral rooftop_coaches(b.rooftop_id) as c(coach)
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- ---- Advisors who have been quiet, ROLLED UP ---------------------------
  -- The eight-advisors-one-notification rule. Keyed per coach per week.
  with quiet as (
    select m.user_id, m.rooftop_id,
           coalesce(nullif(btrim(u.full_name), ''), 'An advisor') as who,
           (select count(*) from generate_series(_d - 20, _d, interval '1 day') g(day)
             where is_scheduled_day(m.user_id, g.day::date)
               and not exists (select 1 from daily_completion dc
                                where dc.user_id = m.user_id
                                  and dc.completion_date = g.day::date)) as missed
      from membership m
      left join app_user u on u.id = m.user_id
     where m.active and m.role = 'advisor'
  ),
  rolled as (
    select q.rooftop_id, c.coach, count(*) as n,
           jsonb_agg(jsonb_build_object('name', q.who,
             'detail', q.missed || ' scheduled days') order by q.missed desc) as items
      from quiet q
      cross join lateral rooftop_coaches(q.rooftop_id) as c(coach)
     where q.missed >= s.quiet_advisor_days
     group by q.rooftop_id, c.coach
  )
  insert into notification (recipient_id, kind, severity, rooftop_id, title, body, payload, dedup_key)
  select
    r.coach, 'advisor_quiet', 'concern', r.rooftop_id,
    case when r.n = 1 then 'One advisor has gone quiet'
         else r.n || ' advisors have gone quiet' end,
    'No completed loop in ' || s.quiet_advisor_days || '+ scheduled days. '
      || 'A question, not a warning — something is usually in the way.',
    jsonb_build_object('count', r.n, 'items', r.items),
    'advisor_quiet:' || r.rooftop_id::text || ':' || _week
  from rolled r
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- ---- A whole store has stopped -----------------------------------------
  with silent as (
    select r.id as rooftop_id, r.name
      from rooftop r
     where exists (select 1 from membership m
                    where m.rooftop_id = r.id and m.active and m.role = 'advisor')
       and not exists (
         select 1 from daily_completion dc
          where dc.rooftop_id = r.id
            and dc.completion_date > _d - s.quiet_team_days)
  )
  insert into notification (recipient_id, kind, severity, rooftop_id, title, body, payload, dedup_key)
  select
    c.coach, 'team_quiet', 'concern', sl.rooftop_id,
    'The team has been quiet',
    'Nobody at this store has completed the loop in ' || s.quiet_team_days
      || ' days. When a whole team stops at once it is usually the store, not the people.',
    jsonb_build_object('days', s.quiet_team_days),
    'team_quiet:' || sl.rooftop_id::text || ':' || _week
  from silent sl
  cross join lateral rooftop_coaches(sl.rooftop_id) as c(coach)
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- ---- Attach rate slipping, rolled up per coach -------------------------
  with drops as (
    select ir.rooftop_id, ir.period_id, ir.family, ir.delta_pts,
           coalesce(nullif(btrim(u.full_name), ''), 'An advisor') as who
      from impact_rollup ir
      left join app_user u on u.id = ir.user_id
     where ir.delta_pts <= -s.attach_concern_pts
       and ir.starts_on >= _d - interval '70 days'
  ),
  rolled as (
    select d.rooftop_id, d.period_id, c.coach, count(*) as n,
           jsonb_agg(jsonb_build_object('name', d.who,
             'detail', d.family || ' ' || round(d.delta_pts, 1)) order by d.delta_pts) as items
      from drops d
      cross join lateral rooftop_coaches(d.rooftop_id) as c(coach)
     group by d.rooftop_id, d.period_id, c.coach
  )
  insert into notification (recipient_id, kind, severity, rooftop_id, title, body, payload, dedup_key)
  select
    r.coach, 'attach_dropped', 'concern', r.rooftop_id,
    r.n || (case when r.n = 1 then ' service slipped' else ' services slipped' end),
    'Worth a conversation before next month''s numbers land.',
    jsonb_build_object('count', r.n, 'items', r.items),
    'attach_down:' || r.rooftop_id::text || ':' || r.period_id::text
  from rolled r
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- =========================================================================
  -- THE PLATFORM OWNER — patterns, never individuals
  -- =========================================================================
  -- At 100+ rooftops a per-advisor feed is unreadable, so the owner's copy is
  -- one row describing the shape of the network. Below the threshold they hear
  -- nothing at all, which is the point.

  insert into notification (recipient_id, kind, severity, rooftop_id, title, body, payload, dedup_key)
  select
    o.id, 'team_quiet', 'info', null,
    q.n || ' stores have gone quiet',
    'Across the network this week. Individual stores are in each admin''s own list.',
    jsonb_build_object('rooftops', q.n),
    'network_quiet:' || _week
  from app_user o
  cross join lateral (
    select count(*) as n from rooftop r
     where exists (select 1 from membership m
                    where m.rooftop_id = r.id and m.active and m.role = 'advisor')
       and not exists (select 1 from daily_completion dc
                        where dc.rooftop_id = r.id
                          and dc.completion_date > _d - s.quiet_team_days)
  ) q
  where o.is_platform_owner
    and q.n >= s.network_quiet_rooftops
  on conflict (recipient_id, dedup_key) do nothing;
  get diagnostics _trimmed = row_count;  _written := _written + _trimmed;

  -- =========================================================================
  -- THE CEILING
  -- =========================================================================
  -- Rollup already collapses the per-advisor floods, so this only bites when
  -- many DIFFERENT kinds fire on one day. Concerns are dropped before wins —
  -- if something has to go unsaid today, it is not the good news.

  with ranked as (
    select id,
           row_number() over (
             partition by recipient_id
             order by case severity when 'win' then 0 when 'info' then 1 else 2 end,
                      created_at desc
           ) as rn
      from notification
     where created_at >= _d::timestamptz
  )
  delete from notification n
   using ranked
   where n.id = ranked.id
     and ranked.rn > s.max_per_recipient_per_day;
  get diagnostics _trimmed = row_count;
  _written := _written - _trimmed;

  return _written;
end
$$;

revoke all on function generate_notifications(date) from public;
grant execute on function generate_notifications(date) to authenticated;


-- ---- Nightly ---------------------------------------------------------------
-- After both rollups, so KPI notifications see fresh numbers.

do $cron$
begin
  perform cron.unschedule('notifications-nightly')
   where exists (select 1 from cron.job where jobname = 'notifications-nightly');

  perform cron.schedule(
    'notifications-nightly',
    '0 9 * * *',
    $job$ select generate_notifications() $job$
  );

  raise notice 'notifications-nightly scheduled for 09:00 UTC.';
exception
  when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$cron$;
