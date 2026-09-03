-- ============================================================================
-- EDIAGD — 0095 Volume is aggregated in the database, not in the page
--
-- The Dealer Codes screen summed dms_daily_metric in TypeScript behind a
-- .limit(50000). That table holds 156,918 rows, so the screen saw 270 of the
-- dealer's 1,805 op codes and reported "270 DMS op codes" as though that were
-- the number. Nothing errored; the count was simply wrong, and a person ruling
-- a table would have ruled the part of it the limit happened to include.
--
-- Same family as the lifestyle pool's `.limit(24)` fixed in an earlier round: a
-- cap is only safe when it is larger than the set can get, and this one was an
-- eighth of it.
--
-- Two views, so the aggregate is computed where the rows are. A page that pulls
-- 157,000 rows to add them up is also a page that gets slower every month.
-- ============================================================================

create or replace view dealer_sub_category_volume as
select
  r.org_id                                   as dealer_id,
  m.sub_category,
  sum(coalesce(m.cp_ros, 0))::numeric        as ros,
  sum(coalesce(m.labor_sales, 0))::numeric   as labor,
  count(distinct m.rooftop_id)::int          as store_count
from dms_daily_metric m
join rooftop r on r.id = m.rooftop_id
where m.sub_category is not null
  -- Demo rooftops carry fabricated data and would sort to the top of a list
  -- ordered by money. Excluded here so every reader gets the same answer.
  and r.name not like '[DEMO]%'
group by r.org_id, m.sub_category;

comment on view dealer_sub_category_volume is
  'Per dealer, per sub-category: ROs, labor and how many stores send it. Feeds '
  'the Dealer Codes screen. Aggregated here because the page used to sum '
  '156,918 rows behind a limit and saw a fraction of them. See 0095.';

create or replace view dealer_op_code_volume as
select
  r.org_id                                   as dealer_id,
  m.op_code,
  sum(coalesce(m.cp_ros, 0))::numeric        as ros,
  sum(coalesce(m.labor_sales, 0))::numeric   as labor,
  count(distinct m.rooftop_id)::int          as store_count,
  -- The longest description seen for this code. DMS lines vary per RO and the
  -- longest is the most descriptive, which is what a person needs to rule it.
  (array_agg(m.op_description order by length(coalesce(m.op_description, '')) desc)
     filter (where m.op_description is not null))[1] as description
from dms_daily_metric m
join rooftop r on r.id = m.rooftop_id
where m.op_code is not null and m.op_code <> ''
  and r.name not like '[DEMO]%'
group by r.org_id, m.op_code;

comment on view dealer_op_code_volume is
  'Per dealer, per raw DMS op code: volume and the most descriptive line seen. '
  'Feeds section 2 of the Dealer Codes screen. See 0095.';
