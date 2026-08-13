-- ============================================================================
-- EDIAGD — 0038 Daily op-code data from the DMS
--
-- Doggett sends a workbook once a month containing ONE TAB PER BUSINESS DAY.
-- 34 tabs, 21,671 rows, 11 dealers. This is the ingest for it, and the
-- structure it lands in.
--
-- ---------------------------------------------------------------------------
-- THE ROLLUP TRAP, AND WHY THIS SCHEMA HAS TWO FACT TABLES
-- ---------------------------------------------------------------------------
-- 11,142 of those 21,671 rows are the report's own subtotals — rows where
-- Advisor is 'All Advisors', Sub Category is 'All Sub Categories', Op Code is
-- 'All Op Codes', or Dealer is 'All Dealers'. Ingesting them alongside the
-- detail rows and then summing anything double-counts everything.
--
-- But they cannot simply be thrown away either, and this is the part that is
-- easy to get wrong. Measured on Jul 01, one advisor's three op-code lines
-- carry 1 + 1 + 1 = 3 ROs, while that advisor's own rollup row says 2. Both
-- are correct: ONE repair order carried op codes in two different
-- sub-categories. RO counts CANNOT be summed across op-code lines, so the
-- unique count is not derivable from the detail at all — the rollup row is the
-- only place it exists.
--
-- 0005 already settled this for the monthly format, storing the report's own
-- 'All Categories' rollup as the authoritative per-advisor total. This follows
-- that precedent at day grain:
--
--   dms_daily_metric        one row per (rooftop, date, advisor, sub cat, op
--                           code). Detail only. Safe to sum MONEY and HOURS
--                           across. NEVER sum cp_ros across these rows.
--   dms_daily_advisor_total one row per (rooftop, date, advisor), holding the
--                           unique RO count lifted from the advisor's own
--                           'All Sub Categories / All Op Codes' row. THE
--                           authoritative denominator for attach rates.
--
-- Every other rollup row — per-sub-category, per-dealer, all-advisors — is
-- discarded, because each is re-derivable from one of the two tables above.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCY IS BY REPORT DATE, NOT BY FILE
-- ---------------------------------------------------------------------------
-- Next month's workbook starts where this one stops, but a corrected re-send
-- will overlap. So committing an import DELETES every row for the (rooftop,
-- report_date) pairs it contains and re-inserts them. Re-uploading the same
-- file is therefore a no-op by construction rather than by a check, and a
-- corrected file replaces exactly the days it covers and no others.
--
-- The older MONTHLY format is the other half of this. June CDJR already lives
-- in perf_period / advisor_op_metric at month grain. When June arrives again as
-- daily tabs, both would be counted. perf_period.superseded_at is how that is
-- resolved: a period fully covered by committed daily data is marked, and the
-- reporting views ignore marked periods. Non-destructive, and reversible by
-- setting the column back to null.
--
-- ---------------------------------------------------------------------------
-- STAGE, THEN COMMIT
-- ---------------------------------------------------------------------------
-- The upload parses into dms_import_row / dms_import_advisor_total and stops.
-- Nothing reaches the fact tables until commit_dms_import() runs, and that
-- function does the delete and the insert in ONE statement each inside a single
-- transaction — so a failure leaves the previous data exactly as it was rather
-- than half-replaced. It also means the expensive work (parsing 21,671 rows)
-- happens once, and commit is pure SQL.
-- ============================================================================


-- ---- 1. The canonical families a sub-category can map to --------------------
/**
 * These already existed as free text in two places — service_line.family and
 * content.service_family — which is exactly why a mapping UI had nothing to
 * offer as a target list. Made explicit here so the mapping engine picks from
 * rows rather than from a hardcoded array that drifts.
 *
 * Seeded below from the union of what is actually in use.
 */
create table if not exists service_family (
  name       text primary key,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table service_family enable row level security;
drop policy if exists service_family_read on service_family;
create policy service_family_read on service_family
  for select using ((select auth.uid()) is not null);

insert into service_family (name, sort_order) values
  ('Oil Change', 10), ('Filters', 20), ('Tires & Rotation', 30),
  ('Alignment', 40), ('Brake Service', 50), ('Battery', 60),
  ('Fluids', 70), ('Fuel System', 80), ('Spark Plugs', 90),
  ('Differential', 100), ('Maintenance', 110), ('Repair', 120),
  ('Miscellaneous', 130)
on conflict (name) do nothing;


-- ---- 2. One upload ----------------------------------------------------------

create table if not exists dms_import (
  id           uuid primary key default gen_random_uuid(),
  uploaded_by  uuid references app_user(id) on delete set null,
  file_name    text not null,
  /**
   * sha256 of the bytes. NOT the idempotency key — dates are — but it lets the
   * preview say "you have already committed this exact file", which is a
   * different and more useful message than silently doing nothing.
   */
  file_hash    text not null,
  status       text not null default 'preview'
    check (status in ('preview', 'committed', 'discarded')),
  covers_from  date,
  covers_to    date,
  -- Everything the preview showed, kept so the commit report can be re-read.
  stats        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  committed_at timestamptz
);

create index if not exists dms_import_status_idx on dms_import (status, created_at desc);
create index if not exists dms_import_hash_idx on dms_import (file_hash);


-- ---- 3. Staging -------------------------------------------------------------
-- Deliberately permissive: rooftop_id and advisor rows may be unresolved here.
-- Staging's job is to hold what the file said, so the preview can report on it.

create table if not exists dms_import_row (
  id             bigserial primary key,
  import_id      uuid not null references dms_import(id) on delete cascade,
  report_date    date not null,
  dealer_name    text not null,
  rooftop_id     uuid references rooftop(id) on delete set null,
  advisor_raw    text not null,
  advisor_op_id  text not null,
  sub_category   text not null,
  op_code        text not null,
  op_description text,
  cp_ros         numeric,
  pct_of_total   numeric,
  frhs           numeric,
  frhs_per_ro    numeric,
  labor_sales    numeric,
  labor_per_ro   numeric,
  labor_gp_pct   numeric,
  tot_per_ro     numeric,
  elr            numeric,
  num_ros        numeric,
  labor_gp       numeric,
  parts_gp       numeric,
  gp             numeric,
  gp_pct         numeric
);

create index if not exists dms_import_row_import_idx on dms_import_row (import_id);
create index if not exists dms_import_row_scope_idx
  on dms_import_row (import_id, rooftop_id, report_date);

create table if not exists dms_import_advisor_total (
  id            bigserial primary key,
  import_id     uuid not null references dms_import(id) on delete cascade,
  report_date   date not null,
  dealer_name   text not null,
  rooftop_id    uuid references rooftop(id) on delete set null,
  advisor_raw   text not null,
  advisor_op_id text not null,
  unique_ros    numeric,
  frhs          numeric,
  labor_sales   numeric,
  labor_per_ro  numeric,
  elr           numeric,
  gp            numeric,
  gp_pct        numeric
);

create index if not exists dms_import_total_import_idx
  on dms_import_advisor_total (import_id);


-- ---- 4. The facts -----------------------------------------------------------

create table if not exists dms_daily_metric (
  rooftop_id     uuid not null references rooftop(id) on delete cascade,
  report_date    date not null,
  advisor_op_id  text not null,
  sub_category   text not null,
  op_code        text not null,
  op_description text,
  /**
   * The RO count ON THIS LINE. Summing this column across lines is the bug
   * this whole file exists to prevent — use dms_daily_advisor_total.unique_ros
   * for any denominator. Kept because per-line it is still true and drives
   * "which op codes did this advisor sell".
   */
  cp_ros         numeric,
  frhs           numeric,
  frhs_per_ro    numeric,
  labor_sales    numeric,
  labor_per_ro   numeric,
  labor_gp_pct   numeric,
  tot_per_ro     numeric,
  elr            numeric,
  num_ros        numeric,
  labor_gp       numeric,
  parts_gp       numeric,
  gp             numeric,
  gp_pct         numeric,
  import_id      uuid references dms_import(id) on delete set null,
  primary key (rooftop_id, report_date, advisor_op_id, sub_category, op_code)
);

create index if not exists dms_daily_metric_date_idx
  on dms_daily_metric (rooftop_id, report_date);
create index if not exists dms_daily_metric_advisor_idx
  on dms_daily_metric (rooftop_id, advisor_op_id, report_date);
create index if not exists dms_daily_metric_subcat_idx
  on dms_daily_metric (rooftop_id, sub_category);

create table if not exists dms_daily_advisor_total (
  rooftop_id    uuid not null references rooftop(id) on delete cascade,
  report_date   date not null,
  advisor_op_id text not null,
  /** Lifted from the report's own advisor rollup. Never computed from lines. */
  unique_ros    numeric,
  frhs          numeric,
  labor_sales   numeric,
  labor_per_ro  numeric,
  elr           numeric,
  gp            numeric,
  gp_pct        numeric,
  import_id     uuid references dms_import(id) on delete set null,
  primary key (rooftop_id, report_date, advisor_op_id)
);

create index if not exists dms_daily_total_date_idx
  on dms_daily_advisor_total (rooftop_id, report_date);


-- ---- 4b. The advisor roster -------------------------------------------------
/**
 * An advisor as the DMS knows them: a rooftop, an operator id, and a name.
 *
 * NOT an app_user. "Create advisors that don't exist" must not mean creating
 * auth accounts — 72 operator ids arrived in the first file and none of those
 * people have signed up. Inventing auth.users rows for them would mint 72
 * accounts nobody can log into and 72 invitations nobody sent.
 *
 * The facts key on advisor_op_id (text) exactly as advisor_op_metric already
 * does, so data stands on its own and links to a person the moment somebody
 * signs up with a membership carrying the same op_code_id. linked_user_id
 * caches that join once it exists.
 */
create table if not exists dms_advisor (
  rooftop_id     uuid not null references rooftop(id) on delete cascade,
  advisor_op_id  text not null,
  display_name   text not null,
  linked_user_id uuid references app_user(id) on delete set null,
  first_seen     date,
  last_seen      date,
  created_at     timestamptz not null default now(),
  primary key (rooftop_id, advisor_op_id)
);

alter table dms_advisor enable row level security;
drop policy if exists dms_advisor_read on dms_advisor;
create policy dms_advisor_read on dms_advisor
  for select using (
    (select is_platform_owner()) or rooftop_id in (select admin_rooftops())
  );


-- ---- 5. Sub-category → family mapping ---------------------------------------
/**
 * 82 distinct sub-categories arrived in the first file against 13 canonical
 * families. PER ROOFTOP, because "Tune Up" at a Honda store and at a BMW store
 * are not obliged to mean the same thing, and a group-wide mapping would make
 * one store's correction silently change another store's numbers.
 *
 * family IS NULL means UNMAPPED, and unmapped is a first-class state rather
 * than an error: the instruction is to leave what isn't confident alone. An
 * auto-match that guesses puts an advisor's brake work under Fluids and
 * nobody ever finds out.
 */
create table if not exists sub_category_map (
  rooftop_id   uuid not null references rooftop(id) on delete cascade,
  sub_category text not null,
  family       text references service_family(name) on delete set null,
  status       text not null default 'unmapped'
    check (status in ('auto', 'confirmed', 'unmapped')),
  confirmed_by uuid references app_user(id) on delete set null,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (rooftop_id, sub_category)
);

create index if not exists sub_category_map_status_idx
  on sub_category_map (rooftop_id, status);


-- ---- 6. Superseding the monthly format --------------------------------------

alter table perf_period
  add column if not exists superseded_at timestamptz;

comment on column perf_period.superseded_at is
  'Set when committed daily DMS data fully covers this period. Reporting must '
  'ignore superseded periods or the month is counted twice — once at month '
  'grain here, once at day grain in dms_daily_metric.';


-- ---- 7. RLS -----------------------------------------------------------------
-- Reads follow the same scoping as every other admin surface. There are no
-- write policies anywhere in this section: everything is written by the service
-- role through the import path, which is the only thing that has the file.

alter table dms_import               enable row level security;
alter table dms_import_row           enable row level security;
alter table dms_import_advisor_total enable row level security;
alter table dms_daily_metric         enable row level security;
alter table dms_daily_advisor_total  enable row level security;
alter table sub_category_map         enable row level security;

drop policy if exists dms_import_read on dms_import;
create policy dms_import_read on dms_import
  for select using ((select is_platform_owner()));

drop policy if exists dms_import_row_read on dms_import_row;
create policy dms_import_row_read on dms_import_row
  for select using ((select is_platform_owner()));

drop policy if exists dms_import_total_read on dms_import_advisor_total;
create policy dms_import_total_read on dms_import_advisor_total
  for select using ((select is_platform_owner()));

drop policy if exists dms_daily_metric_read on dms_daily_metric;
create policy dms_daily_metric_read on dms_daily_metric
  for select using (
    (select is_platform_owner()) or rooftop_id in (select admin_rooftops())
  );

drop policy if exists dms_daily_total_read on dms_daily_advisor_total;
create policy dms_daily_total_read on dms_daily_advisor_total
  for select using (
    (select is_platform_owner()) or rooftop_id in (select admin_rooftops())
  );

drop policy if exists sub_category_map_read on sub_category_map;
create policy sub_category_map_read on sub_category_map
  for select using (
    (select is_platform_owner()) or rooftop_id in (select admin_rooftops())
  );


-- ---- 8. Reading it back -----------------------------------------------------

/**
 * Period rollups DERIVED from the daily grain, per the instruction to store
 * daily and roll up for display rather than aggregating on import.
 *
 * Money and hours sum. RO COUNTS DO NOT — unique_ros comes from the totals
 * table, summed across DAYS (which is legitimate: an RO belongs to one day)
 * and never across op-code lines.
 */
create or replace view dms_advisor_period as
select
  t.rooftop_id,
  t.advisor_op_id,
  min(t.report_date)                          as first_day,
  max(t.report_date)                          as last_day,
  count(distinct t.report_date)::int          as days,
  sum(t.unique_ros)                           as total_ros,
  sum(t.labor_sales)                          as total_labor_sales,
  sum(t.frhs)                                 as total_frhs,
  case when sum(t.frhs) > 0
       then round(sum(t.labor_sales) / sum(t.frhs), 2) end as blended_elr,
  sum(t.gp)                                   as total_gp
from dms_daily_advisor_total t
group by t.rooftop_id, t.advisor_op_id;

alter view dms_advisor_period set (security_invoker = on);

/**
 * Attach rate by family: how many of an advisor's ROs carried work in each
 * family. The numerator sums cp_ros WITHIN a family — legitimate, because a
 * single RO appearing under two op codes in the SAME family is the thing an
 * attach rate is trying to measure — while the denominator comes from the
 * authoritative unique count. Unmapped sub-categories are excluded from the
 * numerator and reported separately rather than silently folded into a family.
 */
create or replace view dms_family_attach as
with fam as (
  select m.rooftop_id, m.advisor_op_id, sc.family,
         sum(m.cp_ros) as family_ros,
         min(m.report_date) as first_day, max(m.report_date) as last_day
  from dms_daily_metric m
  join sub_category_map sc
    on sc.rooftop_id = m.rooftop_id
   and sc.sub_category = m.sub_category
  where sc.family is not null
  group by m.rooftop_id, m.advisor_op_id, sc.family
)
select f.rooftop_id, f.advisor_op_id, f.family, f.family_ros,
       p.total_ros,
       case when p.total_ros > 0
            then round(100.0 * f.family_ros / p.total_ros, 1) end as attach_rate_pct
from fam f
join dms_advisor_period p
  on p.rooftop_id = f.rooftop_id and p.advisor_op_id = f.advisor_op_id;

alter view dms_family_attach set (security_invoker = on);

/** The mapping work queue: what is unmapped, biggest gap first. */
create or replace view dms_unmapped_sub_category as
select
  m.rooftop_id,
  r.name                        as rooftop_name,
  m.sub_category,
  count(*)::int                 as rows,
  sum(m.cp_ros)                 as ro_lines,
  sum(m.labor_sales)            as labor_sales,
  min(m.report_date)            as first_seen,
  max(m.report_date)            as last_seen
from dms_daily_metric m
join rooftop r on r.id = m.rooftop_id
left join sub_category_map sc
  on sc.rooftop_id = m.rooftop_id and sc.sub_category = m.sub_category
where sc.family is null
group by m.rooftop_id, r.name, m.sub_category;

alter view dms_unmapped_sub_category set (security_invoker = on);

grant select on service_family, dms_advisor_period, dms_family_attach,
                dms_unmapped_sub_category to authenticated;


-- ---- 9. The commit ----------------------------------------------------------
/**
 * Promote a staged import into the fact tables. Atomic by virtue of being one
 * function: every statement below succeeds together or the whole call rolls
 * back, so a failure can never leave a day half-replaced.
 *
 * SECURITY DEFINER and platform-owner gated. It writes across every rooftop in
 * the file, which is precisely the authority a group-wide upload needs and
 * precisely why it must not be reachable by anyone else.
 *
 * DELETE-THEN-INSERT BY (rooftop, report_date) is the idempotency. Not an
 * upsert: an upsert would leave behind rows for an op code that appeared in the
 * first upload and was removed from a correction, which is the quiet half of
 * getting a re-send wrong.
 */
-- An earlier revision of this file took only the import id. Postgres would
-- keep both as overloads and PostgREST would then have to guess which one an
-- RPC call meant.
drop function if exists commit_dms_import(uuid);

create or replace function commit_dms_import(
  _import_id uuid,
  _org_name  text default 'Doggett Automotive Group'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _org_id           uuid;
  _rooftops_created int := 0;
  _advisors_touched int := 0;
  _rows_deleted   int := 0;
  _rows_inserted  int := 0;
  _tot_deleted    int := 0;
  _tot_inserted   int := 0;
  _superseded     int := 0;
  _status         text;
begin
  -- Platform owner, OR the service role.
  --
  -- is_platform_owner() reads auth.uid(), which is NULL for the service role —
  -- so checking it alone would reject the very path the importer uses, while
  -- letting nobody else through either. The upload action has already
  -- established that the human driving this is a platform owner, using THEIR
  -- client; this is the second lock, and it still shuts out any ordinary
  -- authenticated caller who finds the RPC.
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'commit_dms_import: platform owner only';
  end if;

  select status into _status from dms_import where id = _import_id;
  if _status is null then
    raise exception 'commit_dms_import: no such import %', _import_id;
  end if;
  if _status = 'committed' then
    raise exception 'commit_dms_import: % is already committed', _import_id;
  end if;

  -- ---- create the rooftops this file introduced ----------------------------
  -- Done HERE rather than at preview so that looking at a file changes nothing.
  -- Inside this function it is also inside the commit's transaction, so a
  -- failure further down cannot leave a half-built group of empty rooftops.
  select id into _org_id from org where name = _org_name;
  if _org_id is null then
    insert into org (name) values (_org_name) returning id into _org_id;
  end if;

  insert into rooftop (org_id, name)
  select distinct _org_id, s.dealer_name
    from dms_import_row s
   where s.import_id = _import_id
     and s.rooftop_id is null
     and not exists (select 1 from rooftop r where lower(btrim(r.name)) = lower(btrim(s.dealer_name)));
  get diagnostics _rooftops_created = row_count;

  -- Backfill staging now that they exist. Matched case-insensitively on the
  -- trimmed name, the same rule the preview used, so preview and commit cannot
  -- disagree about which dealer is which store.
  update dms_import_row s
     set rooftop_id = r.id
    from rooftop r
   where s.import_id = _import_id
     and s.rooftop_id is null
     and lower(btrim(r.name)) = lower(btrim(s.dealer_name));

  update dms_import_advisor_total s
     set rooftop_id = r.id
    from rooftop r
   where s.import_id = _import_id
     and s.rooftop_id is null
     and lower(btrim(r.name)) = lower(btrim(s.dealer_name));

  -- Every row must have found a rooftop before anything is written. A staged
  -- row with a null rooftop here means a dealer name that could neither be
  -- matched nor created, and importing it would silently drop a whole store.
  if exists (select 1 from dms_import_row where import_id = _import_id and rooftop_id is null) then
    raise exception 'commit_dms_import: staged rows still have no rooftop';
  end if;

  -- ---- the advisor roster --------------------------------------------------
  insert into dms_advisor (rooftop_id, advisor_op_id, display_name, first_seen, last_seen)
  select s.rooftop_id, s.advisor_op_id,
         min(s.advisor_raw), min(s.report_date), max(s.report_date)
    from dms_import_row s
   where s.import_id = _import_id
   group by s.rooftop_id, s.advisor_op_id
  on conflict (rooftop_id, advisor_op_id) do update
     set display_name = excluded.display_name,
         first_seen   = least(dms_advisor.first_seen, excluded.first_seen),
         last_seen    = greatest(dms_advisor.last_seen, excluded.last_seen);
  get diagnostics _advisors_touched = row_count;

  -- ---- every imported sub-category gets a mapping row ----------------------
  -- Placeholder rows, unmapped, so the queue is COMPLETE by construction. The
  -- auto-matcher's rules live in TypeScript and are applied by a second call;
  -- if that call never happens — a direct RPC, a backfill job, a script — the
  -- sub-categories must still show up as work to do rather than not exist. An
  -- absent row and a mapped row look identical to a left join, which is how a
  -- whole store's biggest service line quietly stops counting.
  insert into sub_category_map (rooftop_id, sub_category, family, status)
  select distinct s.rooftop_id, s.sub_category, null, 'unmapped'
    from dms_import_row s
   where s.import_id = _import_id
  on conflict (rooftop_id, sub_category) do nothing;

  -- ---- the days this import owns ----
  create temp table _days on commit drop as
  select distinct rooftop_id, report_date
    from dms_import_row where import_id = _import_id;

  delete from dms_daily_metric d
   using _days a
   where d.rooftop_id = a.rooftop_id and d.report_date = a.report_date;
  get diagnostics _rows_deleted = row_count;

  insert into dms_daily_metric (
    rooftop_id, report_date, advisor_op_id, sub_category, op_code, op_description,
    cp_ros, frhs, frhs_per_ro, labor_sales, labor_per_ro, labor_gp_pct,
    tot_per_ro, elr, num_ros, labor_gp, parts_gp, gp, gp_pct, import_id)
  select rooftop_id, report_date, advisor_op_id, sub_category, op_code, op_description,
         cp_ros, frhs, frhs_per_ro, labor_sales, labor_per_ro, labor_gp_pct,
         tot_per_ro, elr, num_ros, labor_gp, parts_gp, gp, gp_pct, _import_id
    from dms_import_row
   where import_id = _import_id;
  get diagnostics _rows_inserted = row_count;

  delete from dms_daily_advisor_total d
   using _days a
   where d.rooftop_id = a.rooftop_id and d.report_date = a.report_date;
  get diagnostics _tot_deleted = row_count;

  insert into dms_daily_advisor_total (
    rooftop_id, report_date, advisor_op_id, unique_ros, frhs, labor_sales,
    labor_per_ro, elr, gp, gp_pct, import_id)
  select rooftop_id, report_date, advisor_op_id, unique_ros, frhs, labor_sales,
         labor_per_ro, elr, gp, gp_pct, _import_id
    from dms_import_advisor_total
   where import_id = _import_id
     and rooftop_id is not null;
  get diagnostics _tot_inserted = row_count;

  -- ---- retire any monthly period this daily data now covers ----
  -- Fully covered only. A month with daily data for half its days is left
  -- alone, because dropping it would lose the other half entirely.
  with covered as (
    select p.id
      from perf_period p
     where p.superseded_at is null
       and exists (select 1 from _days d where d.rooftop_id = p.rooftop_id)
       and not exists (
         select 1
           from generate_series(p.starts_on, p.ends_on, interval '1 day') g(day)
          where extract(isodow from g.day) < 6      -- business days only
            and not exists (
              select 1 from dms_daily_metric m
               where m.rooftop_id = p.rooftop_id
                 and m.report_date = g.day::date
            )
       )
  )
  update perf_period set superseded_at = now()
   where id in (select id from covered);
  get diagnostics _superseded = row_count;

  update dms_import
     set status = 'committed', committed_at = now()
   where id = _import_id;

  return jsonb_build_object(
    'import_id', _import_id,
    'rooftops_created', _rooftops_created,
    'advisors_upserted', _advisors_touched,
    'metric_rows_deleted', _rows_deleted,
    'metric_rows_inserted', _rows_inserted,
    'advisor_totals_deleted', _tot_deleted,
    'advisor_totals_inserted', _tot_inserted,
    'monthly_periods_superseded', _superseded
  );
end $$;

revoke all on function commit_dms_import(uuid, text) from public, anon;
grant execute on function commit_dms_import(uuid, text) to authenticated;


/**
 * Apply the auto-matcher's verdicts to the rows commit_dms_import created.
 *
 * THE RULES ARRIVE AS DATA, they are not reimplemented here. lib/dms/mapping.ts
 * owns them — it is where a person can read why "Brake Fluid Service" is brake
 * work and not a fluid service — and it passes {sub_category, family} pairs
 * keyed on the RAW string straight from the file. Nothing is normalised twice.
 *
 * That matters: the curriculum importer had exactly this bug shape, where a key
 * computed in two places drifted and the join silently matched nothing. Joining
 * on the raw string makes drift impossible rather than unlikely.
 *
 * Only 'unmapped' rows are touched, so a confirmed mapping is never reverted by
 * a later upload.
 */
create or replace function apply_sub_category_automap(
  _import_id uuid,
  _rules     jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _n int := 0;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'apply_sub_category_automap: platform owner only';
  end if;

  update sub_category_map m
     set family = r.family,
         status = 'auto'
    from jsonb_to_recordset(_rules) as r(sub_category text, family text)
   where m.sub_category = r.sub_category
     and r.family is not null
     and m.status = 'unmapped'
     and m.rooftop_id in (
       select distinct rooftop_id from dms_import_row where import_id = _import_id
     );
  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function apply_sub_category_automap(uuid, jsonb) from public, anon;
grant execute on function apply_sub_category_automap(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
