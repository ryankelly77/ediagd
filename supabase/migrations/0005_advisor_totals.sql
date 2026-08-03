-- 0005_advisor_totals_authoritative.sql
-- FIX: RO counts cannot be summed across op-code lines (one RO has many lines).
-- Store the report's own 'All Categories' rollup as the authoritative per-advisor
-- total, and repoint the totals + attach views at it.

create table if not exists advisor_period_total_src (
  period_id     uuid not null references perf_period(id) on delete cascade,
  rooftop_id    uuid not null references rooftop(id) on delete cascade,
  advisor_op_id text not null,
  total_ros     numeric,
  blended_elr   numeric,
  total_labor_sales numeric,
  gp_pct        numeric,
  total_ro_lines numeric,
  primary key (period_id, advisor_op_id)
);
alter table advisor_period_total_src enable row level security;
drop policy if exists advisor_total_read on advisor_period_total_src;
create policy advisor_total_read on advisor_period_total_src
  for select using (rooftop_id in (select my_rooftops()));

-- The authoritative per-advisor rows that used to be inserted here are TEST
-- DATA and now live in supabase/seed.sql (SECTION 2). This migration keeps only
-- the structure: the table, its RLS policy, and the two views below.

create or replace view advisor_period_totals as
select period_id, rooftop_id, advisor_op_id,
       total_ros, total_labor_sales, blended_elr,
       gp_pct as gp_pct_weighted, total_ro_lines
from advisor_period_total_src;

create or replace view advisor_family_attach as
with fam as (
  select m.period_id, m.rooftop_id, m.advisor_op_id,
         coalesce(sl.family, sl.category) as family,
         sum(m.ros) as fam_ros
  from advisor_op_metric m
  join service_line sl on sl.op_code = m.op_code
  group by 1,2,3,4
)
select f.period_id, f.rooftop_id, f.advisor_op_id, f.family,
       f.fam_ros, t.total_ros as advisor_ros,
       case when t.total_ros > 0
            then round(100.0 * f.fam_ros / t.total_ros, 1) end as attach_rate_pct
from fam f
join advisor_period_total_src t using (period_id, rooftop_id, advisor_op_id);
