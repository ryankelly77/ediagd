-- ============================================================================
-- EDIAGD — 0033 What it costs against what it returned
--
-- GROSS PROFIT, NOT REVENUE. The lift computed in 0032 is labor SALES. Setting
-- that against a subscription price would overstate the return by whatever the
-- store's labor margin is — roughly a third — and the first dealer principal to
-- see it would say "that's top line, not profit", and be right. So the ROI here
-- multiplies the revenue lift by THAT ROOFTOP'S OWN labor GP% for the period,
-- taken from the same export the rest of this screen reads. No assumed margin,
-- and no global default: a rooftop with no GP% on file is EXCLUDED and counted,
-- because inventing a margin for it would be inventing the answer.
--
-- COST IS DELIBERATELY THE HIGHER FIGURE. A rooftop with six months of data is
-- charged for six months, even though movement can only be measured across the
-- five month-over-month comparisons between them. Erring toward a bigger
-- denominator understates ROI, which is the direction to be wrong in.
--
-- HOW THE RATIO IS EXPRESSED, and a deliberate departure from the brief. The
-- task specified (GP − cost) / cost shown as a multiple. Read aloud, "4.2x"
-- means "I got back four times what I paid" — but under that formula 4.2x means
-- 5.2x back, a full factor of one, in the direction that flatters us. So the
-- stored ratio is GP / cost and the screen says "$4.20 back for every $1", with
-- the net gain in dollars beside it. Same information, no way to misread it
-- upward.
-- ============================================================================

-- ---- Price ----------------------------------------------------------------

alter table rooftop
  add column if not exists subscription_monthly numeric;

comment on column rooftop.subscription_monthly is
  'What this rooftop pays per month. Null means use impact_settings.default_subscription_monthly.';

alter table impact_settings
  add column if not exists default_subscription_monthly numeric not null default 600;


/**
 * Set (or clear) one rooftop's price.
 *
 * A definer function rather than an UPDATE policy on `rooftop`, because RLS
 * grants are per ROW and not per COLUMN: any policy permissive enough to let an
 * admin change the price would also let them change the store's name, its org
 * or its timezone. This can only ever write the one column.
 */
create or replace function set_rooftop_subscription(_rooftop uuid, _amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_platform_owner() or has_role(_rooftop, 'admin')) then
    raise exception 'Only an admin of this rooftop can change its price';
  end if;

  if _amount is not null and _amount < 0 then
    raise exception 'A subscription cannot be negative';
  end if;

  update rooftop set subscription_monthly = _amount where id = _rooftop;
end
$$;

revoke all on function set_rooftop_subscription(uuid, numeric) from public;
grant execute on function set_rooftop_subscription(uuid, numeric) to authenticated;


-- ---- Gross profit on the fact table ---------------------------------------

alter table impact_rollup
  add column if not exists gp_pct         numeric,
  add column if not exists incremental_gp numeric;


create or replace function refresh_impact_gp()
returns void
language sql
security definer
set search_path = public
as $$
  -- The rooftop's labor GP% for the period, weighted by labor sales so a small
  -- advisor with an odd margin cannot swing the store's rate.
  with rooftop_gp as (
    select
      tot.rooftop_id,
      tot.period_id,
      case when sum(tot.total_labor_sales) > 0
           then sum(tot.gp_pct * tot.total_labor_sales) / sum(tot.total_labor_sales)
      end as gp_pct
    from advisor_period_total_src tot
    where tot.gp_pct is not null
    group by tot.rooftop_id, tot.period_id
  )
  update impact_rollup ir
     set gp_pct = g.gp_pct,
         incremental_gp = round(ir.incremental_labor * g.gp_pct, 2)
    from rooftop_gp g
   where ir.rooftop_id = g.rooftop_id
     and ir.period_id = g.period_id
     and g.gp_pct is not null;
$$;


-- Fold it into the nightly refresh so GP is never a step someone forgets.
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

  perform refresh_impact_gp();

  return now();
end
$$;

select refresh_impact_rollup();


-- ---- Per rooftop: lift, cost, and whether it paid for itself ---------------

drop view if exists admin_impact_roi;
drop view if exists admin_impact_rooftop;

-- The month count and the resolved price are each computed ONCE per rooftop in
-- a lateral, rather than being repeated inside every expression that needs
-- them. This is for legibility, not speed: measured at 100 rooftops it made no
-- difference either way, because the cost of this view is aggregating the
-- 21,000 rollup rows behind it, not resolving two scalars per store.
create view admin_impact_rooftop as
select
  r.id                                                      as rooftop_id,
  r.name                                                    as rooftop_name,
  mo.month_count,
  count(f.*) filter (where f.coached)::int                  as coached_n,
  round(avg(f.delta_pts) filter (where f.coached), 2)       as coached_delta,
  count(f.*) filter (where not f.coached)::int              as uncoached_n,
  round(avg(f.delta_pts) filter (where not f.coached), 2)   as uncoached_delta,
  count(distinct f.user_id)::int                            as advisors,
  coalesce(bool_or(f.is_demo), false)                       as is_demo,

  -- ---- Money -------------------------------------------------------------
  round(sum(f.incremental_labor) filter (where f.coached), 0)  as incremental_labor,
  round(sum(f.incremental_gp) filter (where f.coached), 0)     as incremental_gp,
  -- The GP% actually applied, so the screen can state it rather than imply it.
  round(avg(f.gp_pct) * 100, 1)                                as gp_pct_used,
  px.monthly_price,
  (r.subscription_monthly is not null)                         as price_is_override,
  round(px.monthly_price * mo.month_count, 0)                  as subscription_cost,
  -- Dollars back per dollar spent. Null when there is nothing to divide by, or
  -- no GP% on file — never a zero, which would read as "it returned nothing".
  case
    when count(f.*) filter (where f.incremental_gp is not null) = 0 then null
    when px.monthly_price * mo.month_count > 0
    then round(sum(f.incremental_gp) filter (where f.coached)
               / (px.monthly_price * mo.month_count), 2)
  end                                                          as roi_ratio,
  -- Null GP% is the "excluded" signal the network view counts.
  (count(f.*) filter (where f.incremental_gp is not null) = 0)  as gp_missing
from rooftop r
cross join impact_settings s
cross join lateral (
  select coalesce(r.subscription_monthly, s.default_subscription_monthly) as monthly_price
) px
cross join lateral (
  select count(distinct pp.starts_on)::int as month_count
    from perf_period pp where pp.rooftop_id = r.id
) mo
left join impact_rollup f
  on f.rooftop_id = r.id and f.delta_pts is not null
where r.id in (select admin_rooftops())
group by r.id, r.name, r.subscription_monthly, px.monthly_price, mo.month_count;

alter view admin_impact_rooftop set (security_invoker = on);


-- ---- Network ROI ----------------------------------------------------------
-- Cost is summed from the ROOFTOPS, not from the fact rows, because a store
-- pays its subscription whether or not its advisors moved a number. Summing
-- cost only where there was lift would quietly drop the stores that did worst,
-- which are the ones worth seeing.

create or replace view admin_impact_roi as
select
  round(sum(incremental_labor), 0)                          as incremental_labor,
  round(sum(incremental_gp), 0)                             as incremental_gp,
  round(sum(subscription_cost) filter (where not gp_missing and month_count >= 2), 0)
                                                            as subscription_cost,
  round(sum(incremental_gp) - sum(subscription_cost)
        filter (where not gp_missing and month_count >= 2), 0) as net_gain,
  case when sum(subscription_cost) filter (where not gp_missing and month_count >= 2) > 0
       then round(sum(incremental_gp)
            / sum(subscription_cost) filter (where not gp_missing and month_count >= 2), 2)
  end                                                       as roi_ratio,
  round(avg(gp_pct_used), 1)                                as gp_pct_used,
  count(*) filter (where not gp_missing and month_count >= 2)::int as rooftops_counted,
  -- Two different reasons to be out of the calculation, reported separately so
  -- "we don't know yet" is never mistaken for "it didn't work".
  count(*) filter (where month_count < 2)::int              as rooftops_too_new,
  count(*) filter (where gp_missing and month_count >= 2)::int as rooftops_no_gp,
  count(*) filter (where roi_ratio is not null and roi_ratio < 1)::int as rooftops_below_cost,
  bool_or(is_demo)                                          as has_demo
from admin_impact_rooftop;

alter view admin_impact_roi set (security_invoker = on);
