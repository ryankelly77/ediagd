-- ============================================================================
-- EDIAGD — 0052 The unmapped queue, as one row per decision
--
-- 46 sub-categories carrying 17,000 rows are waiting on a judgement only Mitch
-- can make. He is not going to make it in a database, and a list of 46 names
-- with no context is not a decision sheet — "Belts & Cooling" means nothing
-- until you see that the op codes underneath it say SERPENTINE BELT
-- REPLACEMENT and COOLANT FLUSH.
--
-- So each row carries what it takes to decide: the money, the reach across
-- stores, and the raw op-code text the dealership itself writes. Sorted by
-- labor dollars, because that is the order in which being wrong costs most.
--
-- AGGREGATED HERE for the reason that keeps recurring: the examples come from
-- dms_daily_metric, which holds 27,000 rows. One row per sub-category cannot
-- approach any API limit; a client-side group-by would have been truncated at
-- 1,000 and produced a sheet that looked complete.
--
-- NO PERSON APPEARS IN THIS OUTPUT. Not advisors, not customers — sub-category,
-- money, store count, and service descriptions. It is a document about work,
-- and it is going to leave the building.
-- ============================================================================

create or replace function unmapped_decision_sheet()
returns table (
  sub_category  text,
  total_rows    bigint,
  labor_sales   numeric,
  ro_lines      numeric,
  rooftops      int,
  first_seen    date,
  last_seen     date,
  examples      text
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select m.rooftop_id, m.sub_category, m.op_code, m.op_description,
           m.cp_ros, m.labor_sales, m.report_date
      from dms_daily_metric m
      left join sub_category_map sc
        on sc.rooftop_id = m.rooftop_id
       and sc.sub_category = m.sub_category
     where (
             -- admin_rooftops() reads auth.uid(), which is null for the service
             -- role the export script runs as — without this the sheet comes
             -- back empty and looks like "nothing to decide".
             coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
               = 'service_role'
             or m.rooftop_id in (select admin_rooftops())
           )
       -- Unmapped only. A sub-category somebody has already ruled not coachable
       -- is a decision already made, and re-asking is how a queue never ends.
       and sc.family is null
       and coalesce(sc.status, 'unmapped') <> 'not_coachable'
  ),
  agg as (
    select s.sub_category,
           count(*)                        as total_rows,
           sum(s.labor_sales)              as labor_sales,
           sum(s.cp_ros)                   as ro_lines,
           count(distinct s.rooftop_id)::int as rooftops,
           min(s.report_date)              as first_seen,
           max(s.report_date)              as last_seen
      from scope s
     group by s.sub_category
  ),
  -- The three op codes that carry the most labor under each sub-category. Most
  -- money, not most rows: a hundred $12 lines describe the label less well than
  -- three $4,000 ones.
  ranked as (
    select s.sub_category, s.op_code, s.op_description,
           sum(s.labor_sales) as sales,
           row_number() over (
             partition by s.sub_category
             order by sum(s.labor_sales) desc nulls last
           ) as rn
      from scope s
     where coalesce(btrim(s.op_description), '') <> ''
     group by s.sub_category, s.op_code, s.op_description
  ),
  ex as (
    select r.sub_category,
           string_agg(r.op_code || ' — ' || r.op_description, E'\n' order by r.rn) as examples
      from ranked r
     where r.rn <= 3
     group by r.sub_category
  )
  select a.sub_category, a.total_rows, a.labor_sales, a.ro_lines, a.rooftops,
         a.first_seen, a.last_seen, coalesce(e.examples, '')
    from agg a
    left join ex e on e.sub_category = a.sub_category
   order by a.labor_sales desc nulls last
$$;

revoke all on function unmapped_decision_sheet() from public, anon;
grant execute on function unmapped_decision_sheet() to authenticated;

notify pgrst, 'reload schema';
