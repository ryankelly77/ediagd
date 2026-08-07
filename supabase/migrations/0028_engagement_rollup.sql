-- ============================================================================
-- EDIAGD — 0028 Engagement rollup, computed on a schedule
--
-- Engagement is a DAILY metric. Nothing about a 20-working-day login rate needs
-- to be recomputed on every page load, and at 500 rooftops recomputing it means
-- aggregating 40,000 activity rows for every admin who opens the screen.
-- This stores the answer once and lets /admin read it.
--
-- A TABLE, NOT A MATERIALIZED VIEW — and that is the whole design decision.
--
-- A materialized view cannot enforce row-level security. It has no
-- security_invoker, its contents are computed once as the owner, and anyone
-- granted select on it reads ALL of it. Every admin view in this schema is
-- scoped by RLS on the tables underneath (that is what 0006 had to fix after
-- the performance views leaked), so materialising the summary would have moved
-- the security boundary out of RLS and into a WHERE clause — one edit away from
-- showing a dealer admin somebody else's group.
--
-- A plain table takes policies. So engagement_rollup carries the SAME policy
-- daily_activity carries, and the admin views stay security_invoker on top of
-- it. Scoping is enforced exactly where it was before; only the arithmetic
-- moved. A dealer admin still sees their rooftops because RLS says so, not
-- because a view remembered to filter.
--
-- WHAT READS WHAT NOW
--   daily_activity            (raw, unchanged)
--     -> user_engagement      (the formula, unchanged, still the only place it lives)
--       -> engagement_rollup  (this table — recomputed nightly, RLS-protected)
--         -> admin_advisor_engagement / admin_rooftop_engagement / _summary
--
-- The scores keep coming from user_engagement, so 0009's formula stays the one
-- definition of what engagement means.
-- ============================================================================

create table if not exists engagement_rollup (
  user_id          uuid not null references app_user(id) on delete cascade,
  rooftop_id       uuid not null references rooftop(id) on delete cascade,
  working_days     int  not null default 0,
  days_logged_in   int  not null default 0,
  videos_watched   int  not null default 0,
  login_rate_pct   int,
  watch_rate_pct   int,
  engagement_score int,
  band             text not null,
  -- Stamped per row so a partial refresh can never look complete.
  computed_at      timestamptz not null default now(),
  primary key (user_id, rooftop_id)
);

create index if not exists engagement_rollup_rooftop_idx
  on engagement_rollup (rooftop_id, engagement_score);

alter table engagement_rollup enable row level security;

-- Character for character the policy daily_activity carries after 0027. If the
-- two ever drift, the rollup becomes more visible than the rows it was built
-- from, which is the only way this design can go wrong.
drop policy if exists engagement_rollup_read on engagement_rollup;
create policy engagement_rollup_read on engagement_rollup
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or rooftop_id in (select managed_rooftops())
  );

-- No insert/update/delete policy on purpose: with RLS on and no policy, writes
-- are refused outright. Only refresh_engagement_rollup() (definer) writes here,
-- which is the same discipline 0012 applied to the Sand Dollar economy.


-- ---- The refresh ----------------------------------------------------------

/**
 * Recompute the whole rollup. Returns when it finished.
 *
 * SECURITY DEFINER so it can read every advisor's engagement regardless of who
 * asked — that is the point of a global rollup, and it is why the guard below
 * exists. Callable by the platform owner (so the demo can be refreshed on
 * demand from the app) and by the service role, which has no auth.uid() at all.
 *
 * Whole-table, not incremental: user_engagement's denominator is the rooftop's
 * distinct activity dates, so one new row can change every score in that store.
 * It is a few thousand rows; correctness is worth more than the milliseconds.
 */
create or replace function refresh_engagement_rollup()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  _expected bigint;
  _got      bigint;
begin
  if auth.uid() is not null and not is_platform_owner() then
    raise exception 'refresh_engagement_rollup() is for the platform owner or the service role';
  end if;

  -- What a complete refresh must produce. Checked below, because a silent
  -- short read here would look exactly like "engagement dropped overnight".
  select count(distinct (user_id, rooftop_id)) into _expected from daily_activity;

  delete from engagement_rollup;

  insert into engagement_rollup (
    user_id, rooftop_id, working_days, days_logged_in, videos_watched,
    login_rate_pct, watch_rate_pct, engagement_score, band, computed_at
  )
  select
    ue.user_id,
    ue.rooftop_id,
    ue.working_days::int,
    ue.days_logged_in::int,
    ue.videos_watched::int,
    ue.login_rate_pct::int,
    ue.watch_rate_pct::int,
    ue.engagement_score::int,
    engagement_band(ue.engagement_score),
    now()
  from user_engagement ue;

  get diagnostics _got = row_count;

  -- user_engagement is security_invoker, and inside a definer function the
  -- current user is this function's owner, so RLS does not filter it. If that
  -- ever stops being true the rollup would quietly shrink — so assert it.
  if _got <> _expected then
    raise exception
      'refresh_engagement_rollup(): wrote % rows, expected % — refusing a partial rollup',
      _got, _expected;
  end if;

  return now();
end
$$;

revoke all on function refresh_engagement_rollup() from public;
grant execute on function refresh_engagement_rollup() to authenticated;

-- Populate it now, so the screen works the moment this migration lands rather
-- than after the first overnight run.
select refresh_engagement_rollup();


-- ---- The admin views, repointed -------------------------------------------
-- Same columns, same meanings, same security_invoker. The only change is that
-- the numbers are read instead of derived.

create or replace view admin_advisor_engagement as
select
  er.user_id,
  er.rooftop_id,
  r.name                                              as rooftop_name,
  coalesce(nullif(btrim(u.full_name), ''), 'Advisor') as advisor_name,
  er.working_days::bigint,
  er.days_logged_in::bigint,
  er.videos_watched::bigint,
  er.login_rate_pct::numeric,
  er.watch_rate_pct::numeric,
  er.engagement_score::numeric,
  er.band,
  -- Appended, so CREATE OR REPLACE accepts it and every existing select by
  -- name keeps working. The summary reads it from here rather than joining
  -- back to the rollup, which would collide on every shared column name.
  er.computed_at
from engagement_rollup er
join membership m
  on m.user_id = er.user_id
 and m.rooftop_id = er.rooftop_id
 and m.role = 'advisor'
 and m.active
join rooftop r on r.id = er.rooftop_id
left join app_user u on u.id = er.user_id
where er.rooftop_id in (select admin_rooftops());

alter view admin_advisor_engagement set (security_invoker = on);

-- admin_rooftop_engagement is unchanged in shape and still builds on the
-- advisor view, so it inherits the rollup without knowing about it.

-- The summary gains computed_at. Added at the END so CREATE OR REPLACE accepts
-- it without dropping the dependent objects.
-- AS MATERIALIZED is load-bearing. Without it Postgres inlines the CTE and
-- builds the whole advisor join — rollup -> membership -> rooftop -> app_user —
-- twice, once for the advisor counts and again for the rooftop bands. Computing
-- it once and reading it twice halves the work at any scale.
--
-- The rooftop bands are derived here rather than read from
-- admin_rooftop_engagement so that second build never happens; the grouping is
-- the same one that view applies — engagement_band(avg(engagement_score)) per
-- rooftop over the same scoped advisors — so the counts are identical.
create or replace view admin_engagement_summary as
with adv as materialized (
  select rooftop_id, engagement_score, band, working_days, computed_at
  from admin_advisor_engagement
),
per_advisor as (
  select
    count(*)::int                                   as advisor_count,
    round(avg(engagement_score))::int               as avg_score,
    coalesce(max(working_days), 0)::int             as working_days,
    count(distinct rooftop_id)::int                 as reporting_rooftops,
    count(*) filter (where band = 'engaged')::int   as adv_on_track,
    count(*) filter (where band = 'building')::int  as adv_close,
    count(*) filter (where band = 'nudge')::int     as adv_attention,
    -- The OLDEST row in scope: if a refresh ever half-finished, the screen
    -- reports the stale end of it rather than the flattering one.
    min(computed_at)                                as computed_at
  from adv
),
per_rooftop as (
  select
    count(*) filter (where band = 'engaged')::int   as rt_on_track,
    count(*) filter (where band = 'building')::int  as rt_close,
    count(*) filter (where band = 'nudge')::int     as rt_attention
  from (
    select engagement_band(avg(engagement_score)) as band
    from adv group by rooftop_id
  ) rooftops
)
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
  r.rt_attention,
  a.computed_at
from per_advisor a cross join per_rooftop r;

alter view admin_engagement_summary set (security_invoker = on);


-- ---- Scheduling -----------------------------------------------------------
-- 08:00 UTC — about 3am Central, which is the timezone 0013 defaults rooftops
-- to and the middle of the night for every US store. Guarded: pg_cron needs
-- superuser to install and is not present on every environment (it is absent
-- from the local CLI stack), and a seed or a local reset must not fail over a
-- scheduler. If this notice appears in production, enable the extension in the
-- dashboard and re-run the schedule block.

do $cron$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('engagement-rollup-nightly')
   where exists (select 1 from cron.job where jobname = 'engagement-rollup-nightly');

  perform cron.schedule(
    'engagement-rollup-nightly',
    '0 8 * * *',
    $job$ select refresh_engagement_rollup() $job$
  );

  raise notice 'engagement-rollup-nightly scheduled for 08:00 UTC.';
exception
  when insufficient_privilege or undefined_file or feature_not_supported then
    raise notice 'pg_cron unavailable here — rollup will need refresh_engagement_rollup() called another way.';
  when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$cron$;
