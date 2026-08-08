-- ============================================================================
-- EDIAGD — 0029 Does the coaching move the numbers?
--
-- THE ONLY COMPARISON WORTH MAKING IS WITHIN ONE ADVISOR.
--
-- "Engaged advisors sell more" is not evidence. Better advisors engage more,
-- better stores hire better advisors, and busy months lift everything — so a
-- comparison between people, or between stores, or between this month and last,
-- is confounded before it starts.
--
-- What EDIAGD can do that generic training cannot is say WHICH service a person
-- was coached on and on WHICH day: daily_completion.cue_content_id ->
-- content.service_family. That allows the comparison these views are built on:
--
--     for one advisor, in one month, did the services they were COACHED on
--     move differently from the services they were NOT coached on?
--
-- Same person, same store, same customers, same weather, same pay plan, same
-- OEM incentives. Everything that would confound a between-people comparison
-- applies equally to both sides of this one and cancels.
--
-- IT IS STILL NOT PROOF, and the screen above these views must not pretend
-- otherwise. Which services get coached is not randomly assigned — an advisor
-- is likelier to be coached on something they were already working on, and that
-- selection is invisible here. So every number ships with its sample size and
-- the language stays at "moved", never "caused".
--
-- WHY A ROLLUP TABLE. Computing this live took 5.7 SECONDS at 100 rooftops: it
-- joins six months of op-code metrics to the coaching history and then windows
-- over the result. Performance data arrives once a month, so recomputing it per
-- page load is pure waste. Same shape as 0028: a real table with RLS, not a
-- materialized view, because an MV cannot enforce row-level security and this
-- data is every advisor's numbers.
-- ============================================================================

-- ---- 1. What was coached, where, when -------------------------------------
-- A completion carrying a cue IS the record of coaching on that cue's service.
-- Joined to the period whose month contains it, per rooftop, so the range join
-- stays inside one store rather than crossing all of them.

create or replace view impact_coaching as
select distinct
  dc.user_id,
  dc.rooftop_id,
  pp.id             as period_id,
  c.service_family  as family
from daily_completion dc
join content c
  on c.id = dc.cue_content_id
 and c.service_family is not null
join perf_period pp
  on pp.rooftop_id = dc.rooftop_id
 and dc.completion_date between pp.starts_on and pp.ends_on;

alter view impact_coaching set (security_invoker = on);


-- ---- 2. The fact table ----------------------------------------------------
-- One row per advisor x service x period: what their attach rate was, whether
-- they were coached on it that month, and how it moved from the month before.

create table if not exists impact_rollup (
  user_id              uuid not null references app_user(id) on delete cascade,
  rooftop_id           uuid not null references rooftop(id) on delete cascade,
  period_id            uuid not null references perf_period(id) on delete cascade,
  family               text not null,
  period_label         text,
  starts_on            date not null,
  attach_rate_pct      numeric,
  prev_attach_rate_pct numeric,
  delta_pts            numeric,
  coached              boolean not null default false,
  -- Marks fabricated periods all the way up to the screen, so nobody can
  -- mistake a designed result for evidence.
  is_demo              boolean not null default false,
  computed_at          timestamptz not null default now(),
  primary key (user_id, rooftop_id, period_id, family)
);

create index if not exists impact_rollup_rooftop_idx on impact_rollup (rooftop_id, starts_on);
create index if not exists impact_rollup_delta_idx on impact_rollup (rooftop_id, coached) where delta_pts is not null;

alter table impact_rollup enable row level security;

-- The same policy daily_activity and engagement_rollup carry. If these three
-- ever drift apart, one of them is showing somebody else's store.
drop policy if exists impact_rollup_read on impact_rollup;
create policy impact_rollup_read on impact_rollup
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or rooftop_id in (select managed_rooftops())
  );

-- No write policy: only the definer function below writes here.


-- ---- 3. The refresh -------------------------------------------------------

/**
 * Recompute the whole impact fact table.
 *
 * SECURITY DEFINER so it computes across every rooftop regardless of caller —
 * scoping happens on READ, through the policy above. Same guard and same
 * completeness assertion as refresh_engagement_rollup(): a short read here
 * would look exactly like "the coaching stopped working".
 */
create or replace function refresh_impact_rollup()
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
    raise exception 'refresh_impact_rollup() is for the platform owner or the service role';
  end if;

  select count(*) into _expected
  from advisor_family_attach afa
  join perf_period pp on pp.id = afa.period_id
  join membership m
    on m.rooftop_id = afa.rooftop_id
   and m.op_code_id = afa.advisor_op_id
   and m.role = 'advisor'
   and m.active;

  delete from impact_rollup;

  insert into impact_rollup (
    user_id, rooftop_id, period_id, family, period_label, starts_on,
    attach_rate_pct, prev_attach_rate_pct, delta_pts, coached, is_demo, computed_at
  )
  select
    user_id, rooftop_id, period_id, family, period_label, starts_on,
    attach_rate_pct,
    lag(attach_rate_pct) over w,
    attach_rate_pct - lag(attach_rate_pct) over w,
    coached,
    is_demo,
    now()
  from (
    select
      m.user_id,
      afa.rooftop_id,
      pp.id                          as period_id,
      afa.family,
      pp.label                       as period_label,
      pp.starts_on,
      afa.attach_rate_pct,
      (ic.user_id is not null)       as coached,
      (pp.source_file = 'demo-seed') as is_demo
    from advisor_family_attach afa
    join perf_period pp on pp.id = afa.period_id
    -- op_code_id is what ties a DMS operator to a person. An advisor without
    -- one has no performance history and simply does not appear.
    join membership m
      on m.rooftop_id = afa.rooftop_id
     and m.op_code_id = afa.advisor_op_id
     and m.role = 'advisor'
     and m.active
    left join impact_coaching ic
      on ic.user_id = m.user_id
     and ic.rooftop_id = afa.rooftop_id
     and ic.period_id = pp.id
     and ic.family = afa.family
  ) src
  window w as (partition by user_id, rooftop_id, family order by starts_on);

  get diagnostics _got = row_count;

  if _got <> _expected then
    raise exception
      'refresh_impact_rollup(): wrote % rows, expected % — refusing a partial rollup',
      _got, _expected;
  end if;

  return now();
end
$$;

revoke all on function refresh_impact_rollup() from public;
grant execute on function refresh_impact_rollup() to authenticated;

select refresh_impact_rollup();


-- ---- 4. The headline ------------------------------------------------------
-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot rename a column,
-- and these are being repointed at the rollup with different column names.
drop view if exists admin_impact_by_band;
drop view if exists admin_impact_rooftop;
drop view if exists admin_impact_trend;
drop view if exists admin_impact_summary;
drop view if exists impact_advisor_service;

-- One row. Both sides of the comparison with their own N — never a bare
-- percentage — plus the period counts the screen needs in order to decide
-- whether it is allowed to say anything at all.

create or replace view admin_impact_summary as
select
  count(*) filter (where coached)::int                   as coached_n,
  round(avg(delta_pts) filter (where coached), 2)        as coached_delta,
  count(*) filter (where not coached)::int               as uncoached_n,
  round(avg(delta_pts) filter (where not coached), 2)    as uncoached_delta,
  count(distinct user_id)::int                           as advisors,
  count(distinct rooftop_id)::int                        as rooftops,
  -- Movement needs a before and an after, so N months of data give N-1
  -- comparisons. The screen reports the months, not the comparisons.
  count(distinct starts_on)::int                         as months_compared,
  (select count(distinct pp.starts_on) from perf_period pp
    where pp.rooftop_id in (select admin_rooftops()))::int as months_available,
  bool_or(is_demo)                                       as has_demo,
  coalesce(bool_and(is_demo), false)                     as all_demo,
  min(computed_at)                                       as computed_at
from impact_rollup
where delta_pts is not null
  and rooftop_id in (select admin_rooftops());

alter view admin_impact_summary set (security_invoker = on);


-- ---- 5. The trend ---------------------------------------------------------
-- Grouped by MONTH, not by period_id: every rooftop has its own perf_period row
-- for the same month, so grouping on the id would print "Apr 2026" once per
-- store instead of once.

create or replace view admin_impact_trend as
select
  starts_on,
  min(period_label)                                     as period_label,
  count(*) filter (where coached)::int                  as coached_n,
  round(avg(delta_pts) filter (where coached), 2)       as coached_delta,
  count(*) filter (where not coached)::int              as uncoached_n,
  round(avg(delta_pts) filter (where not coached), 2)   as uncoached_delta,
  count(distinct rooftop_id)::int                       as rooftops,
  bool_or(is_demo)                                      as is_demo
from impact_rollup
where delta_pts is not null
  and rooftop_id in (select admin_rooftops())
group by starts_on;

alter view admin_impact_trend set (security_invoker = on);


-- ---- 6. Per rooftop, for the drill-down list ------------------------------
-- month_count is carried so the list can tell a store with one month of history
-- apart from a store with no movement. Those look identical in a delta column
-- and mean entirely different things.

create or replace view admin_impact_rooftop as
select
  r.id                                                      as rooftop_id,
  r.name                                                    as rooftop_name,
  (select count(distinct pp.starts_on) from perf_period pp
    where pp.rooftop_id = r.id)::int                        as month_count,
  count(f.*) filter (where f.coached)::int                  as coached_n,
  round(avg(f.delta_pts) filter (where f.coached), 2)       as coached_delta,
  count(f.*) filter (where not f.coached)::int              as uncoached_n,
  round(avg(f.delta_pts) filter (where not f.coached), 2)   as uncoached_delta,
  count(distinct f.user_id)::int                            as advisors,
  coalesce(bool_or(f.is_demo), false)                       as is_demo
from rooftop r
left join impact_rollup f
  on f.rooftop_id = r.id and f.delta_pts is not null
where r.id in (select admin_rooftops())
group by r.id, r.name;

alter view admin_impact_rooftop set (security_invoker = on);


-- ---- 7. Supporting context — correlational, and labelled as such ----------
-- Engagement band against coached movement. This one CANNOT separate "coaching
-- worked" from "people who were going to improve anyway also engage more". It
-- is here because it is the first thing anyone asks, and the screen carries the
-- caveat next to it rather than underneath it.

create or replace view admin_impact_by_band as
select
  coalesce(er.band, 'nudge')                                as band,
  count(*) filter (where f.coached)::int                    as coached_n,
  round(avg(f.delta_pts) filter (where f.coached), 2)       as coached_delta,
  count(*) filter (where not f.coached)::int                as uncoached_n,
  round(avg(f.delta_pts) filter (where not f.coached), 2)   as uncoached_delta,
  count(distinct f.user_id)::int                            as advisors
from impact_rollup f
left join engagement_rollup er
  on er.user_id = f.user_id and er.rooftop_id = f.rooftop_id
where f.delta_pts is not null
  and f.rooftop_id in (select admin_rooftops())
group by coalesce(er.band, 'nudge');

alter view admin_impact_by_band set (security_invoker = on);


-- ---- 8. Both rollups on the same schedule ---------------------------------

do $cron$
begin
  perform cron.unschedule('impact-rollup-nightly')
   where exists (select 1 from cron.job where jobname = 'impact-rollup-nightly');

  -- Half an hour after the engagement rollup, so the two never contend.
  perform cron.schedule(
    'impact-rollup-nightly',
    '30 8 * * *',
    $job$ select refresh_impact_rollup() $job$
  );

  raise notice 'impact-rollup-nightly scheduled for 08:30 UTC.';
exception
  when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$cron$;
