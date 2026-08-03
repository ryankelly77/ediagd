-- ============================================================================
-- EDIAGD — 0003 Performance layer
-- Models the monthly DMS op-code export (source: Doggett CDJR, June 2026).
-- Design: store RAW per-advisor-per-op-code metrics exactly as the report gives
-- them; DERIVE attach rates, store averages, and store-best in VIEWS so numbers
-- always tie back to source and never drift.
-- ============================================================================

-- ---- Reporting period (one per monthly export) -----------------------------
create table perf_period (
  id          uuid primary key default gen_random_uuid(),
  rooftop_id  uuid not null references rooftop(id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  label       text,                         -- e.g. 'June 2026'
  source_file text,
  created_at  timestamptz not null default now(),
  unique (rooftop_id, starts_on, ends_on)
);
create index on perf_period(rooftop_id);

-- ---- Service line catalog (op codes grouped by category) -------------------
-- Category ∈ LOF, Maintenance, Miscellaneous, Repair (from the report).
create table service_line (
  op_code     text primary key,             -- e.g. '13D', 'QL20D', '25D'
  category    text not null,
  description text,
  -- coarse family for coaching/status grouping (brakes, alignment, etc.)
  family      text
);
create index on service_line(category);
create index on service_line(family);

-- ---- Raw op-code metrics: one row per advisor × op code × period -----------
-- Columns mirror the export 1:1. advisor_op_id is the DMS operator id that also
-- lives on membership.op_code_id, tying performance to a person.
create table advisor_op_metric (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references perf_period(id) on delete cascade,
  rooftop_id    uuid not null references rooftop(id) on delete cascade,
  advisor_op_id text not null,              -- '35122' etc. (null-safe join to membership)
  op_code       text not null references service_line(op_code),
  ros           numeric,                    -- # ROs
  elr           numeric,                    -- effective labor rate
  frhs          numeric,                    -- flat rate hours
  frhs_per_ro   numeric,
  labor_sales   numeric,
  labor_per_ro  numeric,
  labor_gp_pct  numeric,
  ro_lines      numeric,                    -- Tot RO Lines
  created_at    timestamptz not null default now(),
  unique (period_id, advisor_op_id, op_code)
);
create index on advisor_op_metric(period_id);
create index on advisor_op_metric(rooftop_id);
create index on advisor_op_metric(advisor_op_id);
create index on advisor_op_metric(op_code);

-- ---- Advisor totals for a period (the headline stats), derived -------------
-- Sums each advisor's raw lines; no stored rollup, so it can't drift.
create or replace view advisor_period_totals as
select
  m.period_id,
  m.rooftop_id,
  m.advisor_op_id,
  sum(m.ros)                                   as total_ros,
  sum(m.labor_sales)                           as total_labor_sales,
  case when sum(m.frhs) > 0
       then round(sum(m.labor_sales)/sum(m.frhs), 2) end as blended_elr,
  case when sum(m.labor_sales) > 0
       then round(sum(m.labor_gp_pct * m.labor_sales)/sum(m.labor_sales), 4) end as gp_pct_weighted,
  sum(m.ro_lines)                              as total_ro_lines
from advisor_op_metric m
group by m.period_id, m.rooftop_id, m.advisor_op_id;

-- ---- Attach rate per advisor × service family × period, derived ------------
-- Attach rate = share of an advisor's ROs that included a given family.
-- (The report has no attach column; this is the honest derivation.)
create or replace view advisor_family_attach as
with fam as (
  select m.period_id, m.rooftop_id, m.advisor_op_id,
         coalesce(sl.family, sl.category) as family,
         sum(m.ros) as fam_ros
  from advisor_op_metric m
  join service_line sl on sl.op_code = m.op_code
  group by 1,2,3,4
),
tot as (
  select period_id, rooftop_id, advisor_op_id, sum(ros) as advisor_ros
  from advisor_op_metric group by 1,2,3
)
select f.period_id, f.rooftop_id, f.advisor_op_id, f.family,
       f.fam_ros,
       t.advisor_ros,
       case when t.advisor_ros > 0
            then round(100.0 * f.fam_ros / t.advisor_ros, 1) end as attach_rate_pct
from fam f join tot t using (period_id, rooftop_id, advisor_op_id);

-- ---- Store average & best per family (the comparison bar), derived ---------
create or replace view family_store_benchmark as
select period_id, rooftop_id, family,
       round(avg(attach_rate_pct), 1) as store_avg_pct,
       max(attach_rate_pct)           as store_best_pct
from advisor_family_attach
group by period_id, rooftop_id, family;

-- ---- RLS -------------------------------------------------------------------
alter table perf_period        enable row level security;
alter table advisor_op_metric  enable row level security;
alter table service_line       enable row level security;

-- Metrics are readable to members of the rooftop (managers/admins see the team;
-- an advisor's own membership.op_code_id links them to their rows in the app).
create policy perf_period_read on perf_period
  for select using (rooftop_id in (select my_rooftops()));

create policy advisor_op_metric_read on advisor_op_metric
  for select using (rooftop_id in (select my_rooftops()));

-- service_line is non-sensitive reference data.
create policy service_line_read on service_line for select using (true);

-- Writes (importing a monthly export) run server-side via the service role.
