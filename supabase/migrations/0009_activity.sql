-- ============================================================================
-- 0009_activity.sql — daily activity for engagement scoring
-- Engagement = 55% login-rate + 45% video-watch-rate over the working window.
-- We record ONE row per user per rooftop per day they were active; a nightly
-- job (or the app on login) upserts today's row. Watches also live in
-- content_progress; this table captures the login side and a daily rollup.
-- ============================================================================

create table daily_activity (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app_user(id) on delete cascade,
  rooftop_id   uuid not null references rooftop(id) on delete cascade,
  activity_date date not null,
  logged_in    boolean not null default false,
  videos_watched int not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, activity_date)
);
create index on daily_activity(rooftop_id, activity_date);
create index on daily_activity(user_id);

alter table daily_activity enable row level security;

-- A user writes their own activity; managers/admins read their rooftop's.
create policy daily_activity_self_write on daily_activity
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy daily_activity_team_read on daily_activity
  for select using (
    user_id = auth.uid()
    or has_role(rooftop_id, 'manager')
    or has_role(rooftop_id, 'admin')
  );

-- ---- Engagement rollup per user over a date window, derived -----------------
-- Returns login-rate and watch-rate as fractions of working days, and the
-- blended engagement score (0-100). Working days = distinct dates present in
-- the window for that rooftop (approximation until a real calendar exists).
create or replace view user_engagement as
with wd as (   -- working days per rooftop in the data
  select rooftop_id, count(distinct activity_date) as working_days
  from daily_activity group by rooftop_id
)
select
  a.user_id,
  a.rooftop_id,
  wd.working_days,
  sum(case when a.logged_in then 1 else 0 end)              as days_logged_in,
  sum(a.videos_watched)                                     as videos_watched,
  round(100.0 * sum(case when a.logged_in then 1 else 0 end) / nullif(wd.working_days,0)) as login_rate_pct,
  round(100.0 * least(sum(a.videos_watched), wd.working_days) / nullif(wd.working_days,0)) as watch_rate_pct,
  round(
    0.55 * (100.0 * sum(case when a.logged_in then 1 else 0 end) / nullif(wd.working_days,0))
  + 0.45 * (100.0 * least(sum(a.videos_watched), wd.working_days) / nullif(wd.working_days,0))
  )                                                          as engagement_score
from daily_activity a
join wd using (rooftop_id)
group by a.user_id, a.rooftop_id, wd.working_days;
-- Views run with owner rights by default; force RLS to apply to the querying user.
alter view user_engagement set (security_invoker = on);
