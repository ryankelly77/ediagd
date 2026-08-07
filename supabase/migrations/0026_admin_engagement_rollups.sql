-- ============================================================================
-- EDIAGD — 0026 Admin engagement rollups
--
-- WHY THIS EXISTS
-- /admin computed everything in JavaScript: it fetched every rooftop, every
-- user_engagement row and every advisor membership, then grouped them. That
-- breaks twice before it gets slow:
--
--   * PostgREST caps responses at 1000 rows. At ~300 rooftops x 5 advisors the
--     engagement fetch silently truncates and the group average is quietly
--     computed from a subset — wrong numbers, no error.
--   * The query filtered with .in("rooftop_id", [...300 uuids]), and PostgREST
--     puts filter values in the QUERY STRING. Past roughly 200 ids that URL is
--     rejected as a network error, so the screen returns nothing at all.
--
-- These views do the aggregation in Postgres, so the page transfers a handful
-- of rows no matter how many rooftops exist.
--
-- SCOPING
-- Two gates, deliberately. admin_rooftops() restricts to rooftops the caller
-- ADMINISTERS — not my_rooftops(), which would also include stores where they
-- are merely an advisor — and every view is security_invoker so the underlying
-- RLS (0009's daily_activity_team_read, 0015's platform-owner reads) still
-- applies on top. A view that skipped invoker rights would leak every
-- rooftop's engagement to anyone who could name the view, which is exactly how
-- the performance views leaked before 0006.
-- ============================================================================

-- Rooftops this person administers: everything if they're the platform owner,
-- otherwise the rooftops where they hold 'admin' specifically.
create or replace function admin_rooftops()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id from rooftop r where is_platform_owner()
  union
  select m.rooftop_id
    from membership m
   where m.user_id = auth.uid() and m.active and m.role = 'admin'
$$;

-- The band thresholds live here so every rollup buckets identically.
-- MIRRORS lib/admin.ts engagementBand() and lib/brand.ts ENGAGEMENT_TARGET (75).
-- Positive framing: the bottom band is a nudge, never a failure, and never red.
create or replace function engagement_band(_score numeric)
returns text
language sql
immutable
as $$
  select case
    when _score is null   then 'nudge'
    when _score >= 75     then 'engaged'
    when _score >= 50     then 'building'
    else                       'nudge'
  end
$$;

-- ---- 1. Per advisor, scoped, named, banded --------------------------------
create or replace view admin_advisor_engagement as
select
  ue.user_id,
  ue.rooftop_id,
  r.name                                    as rooftop_name,
  coalesce(nullif(btrim(u.full_name), ''), 'Advisor') as advisor_name,
  ue.working_days,
  ue.days_logged_in,
  ue.videos_watched,
  ue.login_rate_pct,
  ue.watch_rate_pct,
  ue.engagement_score,
  engagement_band(ue.engagement_score)      as band
from user_engagement ue
join membership m
  on m.user_id = ue.user_id
 and m.rooftop_id = ue.rooftop_id
 and m.role = 'advisor'
 and m.active
join rooftop r on r.id = ue.rooftop_id
left join app_user u on u.id = ue.user_id
where ue.rooftop_id in (select admin_rooftops());

alter view admin_advisor_engagement set (security_invoker = on);

-- ---- 2. Per rooftop ------------------------------------------------------
create or replace view admin_rooftop_engagement as
select
  rooftop_id,
  rooftop_name,
  count(*)::int                                  as advisor_count,
  round(avg(engagement_score))::int              as avg_score,
  engagement_band(avg(engagement_score))         as band,
  count(*) filter (where band = 'engaged')::int  as engaged_count,
  count(*) filter (where band = 'building')::int as building_count,
  count(*) filter (where band = 'nudge')::int    as nudge_count,
  coalesce(max(working_days), 0)::int            as working_days
from admin_advisor_engagement
group by rooftop_id, rooftop_name;

alter view admin_rooftop_engagement set (security_invoker = on);

-- ---- 3. One row: everything the hero and the donut need -------------------
-- avg_score is the mean across every ADVISOR, not a mean of rooftop means, so
-- a two-advisor store doesn't outweigh a twenty-advisor store. That matches
-- what summarizeGroup() did in JS.
create or replace view admin_engagement_summary as
select
  a.advisor_count,
  a.avg_score,
  a.working_days,
  a.reporting_rooftops,
  a.adv_on_track,
  a.adv_close,
  a.adv_attention,
  r.rt_on_track,
  r.rt_close,
  r.rt_attention
from (
  select
    count(*)::int                                   as advisor_count,
    round(avg(engagement_score))::int               as avg_score,
    coalesce(max(working_days), 0)::int             as working_days,
    count(distinct rooftop_id)::int                 as reporting_rooftops,
    count(*) filter (where band = 'engaged')::int   as adv_on_track,
    count(*) filter (where band = 'building')::int  as adv_close,
    count(*) filter (where band = 'nudge')::int     as adv_attention
  from admin_advisor_engagement
) a
cross join (
  select
    count(*) filter (where band = 'engaged')::int   as rt_on_track,
    count(*) filter (where band = 'building')::int  as rt_close,
    count(*) filter (where band = 'nudge')::int     as rt_attention
  from admin_rooftop_engagement
) r;

alter view admin_engagement_summary set (security_invoker = on);

-- ---- 4. How many rooftops are in scope at all -----------------------------
-- Distinct from reporting_rooftops above: this counts rooftops the admin owns,
-- including ones with no activity yet, so the scope line can say "240 rooftops"
-- rather than "the 198 that happen to have data".
create or replace view admin_scope as
select count(*)::int as rooftop_count
  from rooftop
 where id in (select admin_rooftops());

alter view admin_scope set (security_invoker = on);
