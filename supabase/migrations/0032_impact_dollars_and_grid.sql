-- ============================================================================
-- EDIAGD — 0032 Dollars, decomposition, and the 2x2
--
-- Attach points make a GM nod politely. Dollars get a renewal signed. This
-- migration turns the same within-advisor comparison into money, splits it by
-- what the advisor actually did, and sorts every advisor into the four boxes an
-- admin actually acts on.
--
-- ---------------------------------------------------------------------------
-- HOW THE DOLLAR NUMBER IS BUILT, because a number this important has to be
-- auditable rather than magic. Every step is a stored column, so the screen can
-- show its own working.
--
--   1. BASELINE. For one advisor in one month, take the average movement of the
--      services they were NOT coached on. That is everything happening anyway —
--      seasonality, staffing, a new pay plan, the weather.
--   2. EXCESS. For each coached service: its movement minus that baseline.
--      Negative excess is kept. A coached service that moved less than the
--      advisor's own baseline SUBTRACTS from the total, which is what stops
--      this being a cherry-pick.
--   3. INCREMENTAL ROs. excess_pts / 100 x the advisor's total ROs that month.
--      Attach rate is a share of that advisor's own repair orders, so this is
--      "how many more times did this service get sold than the baseline
--      predicts".
--   4. DOLLARS. incremental ROs x the labor sold per RO on that service, taken
--      from the same month's op-code rows. No assumed price, no list rate.
--
-- WHAT IT IS NOT. It is not proof of causation — which services get coached is
-- not randomly assigned. It is not margin; it is labor sales. It is not a
-- forecast. An advisor with no uncoached services that month has no baseline
-- and is excluded entirely rather than being compared to zero.
-- ============================================================================

-- ---- Thresholds, editable without a deploy --------------------------------
-- The 2x2 is only as honest as its cut-offs, so they are visible on screen and
-- changeable here rather than buried in a query.

create table if not exists impact_settings (
  id                boolean primary key default true,
  -- What counts as "engaged": the engagement score, same 0-100 scale the
  -- engagement screen shows. 75 matches ENGAGEMENT_TARGET.
  engaged_score_min int not null default 75,
  -- What counts as "improving": average movement on coached services, in
  -- percentage points per month.
  improving_pts_min numeric not null default 0.5,
  -- Advisors below this many ROs in a month are too small a sample for the
  -- dollar maths to mean anything.
  min_ros_for_dollars int not null default 20,
  updated_at        timestamptz not null default now(),
  constraint impact_settings_single check (id)
);

insert into impact_settings (id) values (true) on conflict (id) do nothing;

alter table impact_settings enable row level security;

create policy impact_settings_read on impact_settings
  for select using ((select auth.uid()) is not null);
create policy impact_settings_write on impact_settings
  for update using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  )
  with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );


-- ---- The fact table gains its money columns -------------------------------

alter table impact_rollup
  add column if not exists total_ros           numeric,
  add column if not exists labor_per_ro        numeric,
  add column if not exists coached_cue         boolean not null default false,
  add column if not exists coached_video       boolean not null default false,
  add column if not exists coached_lesson      boolean not null default false,
  add column if not exists baseline_delta_pts  numeric,
  add column if not exists excess_pts          numeric,
  add column if not exists incremental_ros     numeric,
  add column if not exists incremental_labor   numeric;


-- ---- What the advisor actually did ----------------------------------------
-- THREE INTERVENTIONS, ONE OF WHICH IS REAL.
--
--   cue    — daily_completion.cue_content_id. This is the only one with data.
--   video  — daily_completion.video_content_id. The column has existed since
--            0011 and has never held a value: there are no advisor videos.
--   lesson — modelled as a COMPLETED content_progress row, because there is no
--            lesson content type and the library was never built. When lessons
--            ship, this branch is the one line that changes.
--
-- The view is written for all three so the shape is settled. The screen above
-- it must say, in as many words, that two of the three have no real data.

create or replace view impact_coaching as
with touches as (
  select dc.user_id, dc.rooftop_id, dc.completion_date as on_date,
         c.service_family as family, 'cue' as via
    from daily_completion dc
    join content c on c.id = dc.cue_content_id and c.service_family is not null
  union all
  select dc.user_id, dc.rooftop_id, dc.completion_date,
         c.service_family, 'video'
    from daily_completion dc
    join content c on c.id = dc.video_content_id and c.service_family is not null
  union all
  select cp.user_id, cp.rooftop_id, cp.completed_at::date,
         c.service_family, 'lesson'
    from content_progress cp
    join content c on c.id = cp.content_id and c.service_family is not null
   where cp.completed_at is not null
)
select
  t.user_id,
  t.rooftop_id,
  pp.id as period_id,
  t.family,
  bool_or(t.via = 'cue')    as via_cue,
  bool_or(t.via = 'video')  as via_video,
  bool_or(t.via = 'lesson') as via_lesson
from touches t
join perf_period pp
  on pp.rooftop_id = t.rooftop_id
 and t.on_date between pp.starts_on and pp.ends_on
group by t.user_id, t.rooftop_id, pp.id, t.family;

alter view impact_coaching set (security_invoker = on);


-- ---- The refresh, now doing the money -------------------------------------

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

  -- Step 1: the facts, plus the two inputs the dollar maths needs.
  insert into impact_rollup (
    user_id, rooftop_id, period_id, family, period_label, starts_on,
    attach_rate_pct, prev_attach_rate_pct, delta_pts,
    coached, coached_cue, coached_video, coached_lesson,
    total_ros, labor_per_ro, is_demo, computed_at
  )
  select
    user_id, rooftop_id, period_id, family, period_label, starts_on,
    attach_rate_pct,
    lag(attach_rate_pct) over w,
    attach_rate_pct - lag(attach_rate_pct) over w,
    coached, coached_cue, coached_video, coached_lesson,
    total_ros, labor_per_ro, is_demo,
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
      coalesce(ic.via_cue, false)    as coached_cue,
      coalesce(ic.via_video, false)  as coached_video,
      coalesce(ic.via_lesson, false) as coached_lesson,
      tot.total_ros,
      -- What one repair order of this service is worth, from THIS month's
      -- rows. Summed across the family's op codes rather than averaged, so a
      -- rarely-used code cannot swing the rate.
      fam.labor_per_ro,
      (pp.source_file = 'demo-seed') as is_demo
    from advisor_family_attach afa
    join perf_period pp on pp.id = afa.period_id
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
    left join advisor_period_total_src tot
      on tot.period_id = afa.period_id
     and tot.advisor_op_id = afa.advisor_op_id
    left join lateral (
      select case when sum(aom.ros) > 0
                  then round(sum(aom.labor_sales) / sum(aom.ros), 2) end as labor_per_ro
        from advisor_op_metric aom
        join service_line sl on sl.op_code = aom.op_code
       where aom.period_id = afa.period_id
         and aom.advisor_op_id = afa.advisor_op_id
         and coalesce(sl.family, sl.category) = afa.family
    ) fam on true
  ) src
  window w as (partition by user_id, rooftop_id, family order by starts_on);

  get diagnostics _got = row_count;

  if _got <> _expected then
    raise exception
      'refresh_impact_rollup(): wrote % rows, expected % — refusing a partial rollup',
      _got, _expected;
  end if;

  -- Step 2: the baseline. One number per advisor per month — the average
  -- movement of the services nobody coached them on. Done as its own pass
  -- because it is an aggregate over the rows just written.
  with baseline as (
    select user_id, rooftop_id, period_id, avg(delta_pts) as base
      from impact_rollup
     where not coached and delta_pts is not null
     group by user_id, rooftop_id, period_id
  )
  update impact_rollup ir
     set baseline_delta_pts = b.base
    from baseline b
   where ir.user_id = b.user_id
     and ir.rooftop_id = b.rooftop_id
     and ir.period_id = b.period_id;

  -- Step 3: excess, incremental ROs, dollars. Coached rows only, and only
  -- where a baseline actually exists — an advisor whose every service was
  -- coached has nothing to compare against and is left null rather than
  -- silently compared to zero.
  update impact_rollup
     set excess_pts        = delta_pts - baseline_delta_pts,
         incremental_ros   = (delta_pts - baseline_delta_pts) / 100.0 * total_ros,
         incremental_labor = round(
           ((delta_pts - baseline_delta_pts) / 100.0 * total_ros) * labor_per_ro, 2)
   where coached
     and delta_pts is not null
     and baseline_delta_pts is not null
     and total_ros is not null
     and labor_per_ro is not null;

  return now();
end
$$;

select refresh_impact_rollup();


-- ---- The headline, now in money -------------------------------------------

drop view if exists admin_impact_summary;

create view admin_impact_summary as
select
  -- The money.
  round(sum(incremental_labor) filter (where coached), 0)     as incremental_labor,
  count(*) filter (where incremental_labor is not null)       as dollar_rows,
  count(distinct user_id) filter (where incremental_labor is not null) as dollar_advisors,
  round(sum(incremental_ros) filter (where coached), 1)       as incremental_ros,
  -- The points, kept as supporting detail.
  count(*) filter (where coached)::int                        as coached_n,
  round(avg(delta_pts) filter (where coached), 2)             as coached_delta,
  count(*) filter (where not coached)::int                    as uncoached_n,
  round(avg(delta_pts) filter (where not coached), 2)         as uncoached_delta,
  round(avg(delta_pts) filter (where coached)
        - avg(delta_pts) filter (where not coached), 2)       as gap_pts,
  count(distinct user_id)::int                                as advisors,
  count(distinct rooftop_id)::int                             as rooftops,
  count(distinct starts_on)::int                              as months_compared,
  min(starts_on)                                              as first_month,
  max(starts_on)                                              as last_month,
  (select count(distinct pp.starts_on) from perf_period pp
    where pp.rooftop_id in (select admin_rooftops()))::int     as months_available,
  bool_or(is_demo)                                            as has_demo,
  coalesce(bool_and(is_demo), false)                          as all_demo,
  min(computed_at)                                            as computed_at
from impact_rollup
where delta_pts is not null
  and rooftop_id in (select admin_rooftops());

alter view admin_impact_summary set (security_invoker = on);


-- ---- Decomposition by intervention ----------------------------------------
-- has_data is the column the screen keys its warning off. It is computed, not
-- asserted, so the day real videos land the label stops saying "illustrative"
-- without anybody remembering to change it.

create or replace view admin_impact_intervention as
select
  v.intervention,
  count(*) filter (where v.applied)::int                          as n,
  round(avg(v.delta_pts) filter (where v.applied), 2)             as mean_delta,
  round(sum(v.incremental_labor) filter (where v.applied), 0)     as incremental_labor,
  count(distinct v.user_id) filter (where v.applied)::int         as advisors,
  -- Real if ANY of it comes from a non-demo rooftop.
  coalesce(bool_or(v.applied and not v.is_demo), false)           as has_real_data
from (
  select 'cue' as intervention, coached_cue as applied,
         delta_pts, incremental_labor, user_id, is_demo
    from impact_rollup
   where delta_pts is not null and rooftop_id in (select admin_rooftops())
  union all
  select 'video', coached_video, delta_pts, incremental_labor, user_id, is_demo
    from impact_rollup
   where delta_pts is not null and rooftop_id in (select admin_rooftops())
  union all
  select 'lesson', coached_lesson, delta_pts, incremental_labor, user_id, is_demo
    from impact_rollup
   where delta_pts is not null and rooftop_id in (select admin_rooftops())
) v
group by v.intervention;

alter view admin_impact_intervention set (security_invoker = on);


-- ---- Engagement x improvement ---------------------------------------------
-- One row per advisor, with the quadrant already decided, so both the counts
-- and the drill-down read the same definition. Thresholds come from
-- impact_settings, so changing them moves every screen at once.

create or replace view admin_impact_advisor_grid as
select
  ir.user_id,
  ir.rooftop_id,
  r.name                                                as rooftop_name,
  coalesce(nullif(btrim(u.full_name), ''), 'Advisor')   as advisor_name,
  er.engagement_score,
  coalesce(er.engagement_score, 0) >= s.engaged_score_min          as engaged,
  round(avg(ir.delta_pts) filter (where ir.coached), 2)            as coached_delta,
  coalesce(avg(ir.delta_pts) filter (where ir.coached), 0)
    >= s.improving_pts_min                                          as improving,
  round(sum(ir.incremental_labor) filter (where ir.coached), 0)    as incremental_labor,
  count(*) filter (where ir.coached)::int                          as coached_n,
  case
    when coalesce(er.engagement_score, 0) >= s.engaged_score_min
     and coalesce(avg(ir.delta_pts) filter (where ir.coached), 0) >= s.improving_pts_min
      then 'engaged_improving'
    when coalesce(er.engagement_score, 0) >= s.engaged_score_min
      then 'engaged_flat'
    when coalesce(avg(ir.delta_pts) filter (where ir.coached), 0) >= s.improving_pts_min
      then 'quiet_improving'
    else 'quiet_flat'
  end                                                              as quadrant,
  bool_or(ir.is_demo)                                              as is_demo
from impact_rollup ir
join rooftop r on r.id = ir.rooftop_id
left join app_user u on u.id = ir.user_id
left join engagement_rollup er
  on er.user_id = ir.user_id and er.rooftop_id = ir.rooftop_id
cross join impact_settings s
where ir.delta_pts is not null
  and ir.rooftop_id in (select admin_rooftops())
group by ir.user_id, ir.rooftop_id, r.name, u.full_name, er.engagement_score,
         s.engaged_score_min, s.improving_pts_min;

alter view admin_impact_advisor_grid set (security_invoker = on);

create or replace view admin_impact_grid as
select
  quadrant,
  count(*)::int                              as advisors,
  round(avg(coached_delta), 2)               as mean_coached_delta,
  round(sum(incremental_labor), 0)           as incremental_labor
from admin_impact_advisor_grid
group by quadrant;

alter view admin_impact_grid set (security_invoker = on);


-- ---- The funnel Ryan asked for --------------------------------------------
-- Engagement, sitting next to the outcome data so the correlation is visible
-- rather than inferred. Deliberately NOT joined to it: showing them side by
-- side is a comparison the reader makes; joining them would be a claim.

create or replace view admin_engagement_funnel as
with advisors as (
  select m.user_id, m.rooftop_id
    from membership m
   where m.role = 'advisor' and m.active
     and m.rooftop_id in (select admin_rooftops())
)
select
  count(*)::int                                                     as advisors,
  -- Tried it at all. A generous bar on purpose: it is the top of the funnel.
  count(*) filter (where c.days > 0)::int                           as doing_daily_loop,
  -- Doing it as a habit. Without this step the funnel reads 96% and says
  -- nothing — almost everyone completes the loop ONCE.
  count(*) filter (where c.days >= 10)::int                         as loop_consistently,
  count(*) filter (where exists (
    select 1 from content_progress cp
     where cp.user_id = a.user_id and cp.completed_at is not null
       and cp.completed_at > current_date - 30
  ))::int                                                           as into_lessons
from advisors a
cross join lateral (
  select count(*) as days from daily_completion dc
   where dc.user_id = a.user_id and dc.completion_date > current_date - 30
) c;

alter view admin_engagement_funnel set (security_invoker = on);
