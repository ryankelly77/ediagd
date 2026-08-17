-- ============================================================================
-- EDIAGD — 0055 An attach rate that cannot exceed 100%, and one definition of
--               opportunity
--
-- Two problems, both of which made a coaching number untrustworthy.
--
-- ---------------------------------------------------------------------------
-- 1. THE NUMERATOR AND THE DENOMINATOR WERE COUNTING DIFFERENT THINGS
-- ---------------------------------------------------------------------------
-- advisor_family_attach divides fam_ros by advisor_ros. Those two numbers come
-- from different tables and different grains:
--
--   fam_ros     = sum(advisor_op_metric.ros), which is sum(dms_daily_metric
--                 .cp_ros) — an RO count PER OP CODE.
--   advisor_ros = sum(dms_daily_advisor_total.unique_ros) — a DISTINCT RO
--                 count for the advisor's whole day.
--
-- So one repair order carrying two oil op codes contributes 2 to the numerator
-- and 1 to the denominator. Measured on Doggett CDJR, July 2026: across 48
-- advisor-days, sum(cp_ros) exceeded unique_ros on 44 of them — median ratio
-- 1.83x, max 4.00x. An RO is counted once per op code it carries, always has
-- been.
--
-- That inflates EVERY family's attach rate wherever multi-line ROs are common.
-- The rates above 100% are not a separate bug; they are the cases where the
-- inflation crossed a threshold visible to the naked eye.
--
-- WHAT CANNOT BE FIXED HERE, AND WHY. The honest repair is to count distinct
-- ROs per family. dms_daily_metric cannot support it: it arrives already
-- aggregated to (rooftop, date, advisor, sub_category, op_code) with counts and
-- no repair-order identifiers. There is nothing to deduplicate BY. Recovering a
-- true family attach rate needs RO-level detail this feed does not carry, and
-- that is a conversation with the DMS, not a migration.
--
-- WHAT IS FIXED HERE. The rate is clamped so it can never render above 100%,
-- and the amount clamped away is exposed rather than hidden — fam_ros_raw and
-- ros_overflow are new columns, so the inflation is measurable instead of
-- silently absorbed. checkmap fails loudly on any rate above 100 and reports
-- the overflow as a data-quality number.
--
-- A clamp is a floor under the damage, not a repair. Stated plainly so nobody
-- later reads "no rates over 100%" as "attach rates are now correct".
--
-- ---------------------------------------------------------------------------
-- 2. TWO RANKING PATHS, TWO DIFFERENT "BIGGEST OPPORTUNITY"
-- ---------------------------------------------------------------------------
-- rank() in lib/advisor.ts is `opportunity ?? missedRos`, and opportunity is
-- non-null only when buildServiceFamilies is handed a per-family labor-per-RO
-- map. Only the advisor page built one. lib/advisor-data.ts and lib/manager.ts
-- passed undefined, so the manager's team view ranked by missed ROs while the
-- advisor's own screen ranked by dollars — different top priority for the same
-- person on the same day.
--
-- The map the advisor page built was also wrong in a second way: it keyed on
-- the embedded service_line.family, the legacy op_code lookup. Everything that
-- became a family through DMS mapping — sub_category_map, and the
-- resolved_family 0054 added — had no dollars there and fell back to missed ROs
-- anyway. So even on the one screen that ranked by revenue, the seven families
-- from Mitch's triage were ranked on a different basis from the other thirteen.
--
-- advisor_family_labor below resolves family the SAME way advisor_family_attach
-- does — resolved_family, then sub_category_map, then the legacy service_line —
-- so every family that has dollars gets dollar weighting. One view, read by all
-- three callers, so the definition cannot drift apart again.
-- ============================================================================


-- ---- 1. The attach ceiling ----------------------------------------------------
/**
 * Unchanged from 0054 except that the rate is computed from a CLAMPED numerator
 * and the raw numerator is kept alongside it.
 *
 * COLUMN ORDER IS LOAD-BEARING. family_store_benchmark selects from this view,
 * so `create or replace view` only succeeds while the first seven output
 * columns keep their names, types and positions. fam_ros_raw and ros_overflow
 * are APPENDED for that reason — do not reorder them into the middle.
 *
 * fam_ros stays the name the app already reads, and is now the clamped value:
 * every caller that renders "12 of 30 ROs" gets a numerator that cannot exceed
 * the denominator. The unclamped figure is still there under fam_ros_raw for
 * anybody measuring the damage.
 */
create or replace view advisor_family_attach as
with fam as (
  select
    m.period_id,
    m.rooftop_id,
    m.advisor_op_id,
    coalesce(m.resolved_family, scm.family, sl.family, sl.category) as family,
    sum(m.ros) as fam_ros
  from advisor_op_metric m
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
  where
    (m.sub_category is null or scm.family is not null or m.resolved_family is not null)
    and (scm.status is null or scm.status <> 'not_coachable')
  group by 1, 2, 3, 4
)
select
  f.period_id,
  f.rooftop_id,
  f.advisor_op_id,
  f.family,
  least(f.fam_ros, t.total_ros)                       as fam_ros,
  t.total_ros                                         as advisor_ros,
  case when t.total_ros > 0
       then round(100.0 * least(f.fam_ros, t.total_ros) / t.total_ros, 1)
  end                                                 as attach_rate_pct,
  f.fam_ros                                           as fam_ros_raw,
  greatest(f.fam_ros - t.total_ros, 0)                as ros_overflow
from fam f
join advisor_period_total_src t using (period_id, rooftop_id, advisor_op_id)
where f.family is not null;

alter view advisor_family_attach set (security_invoker = on);


-- ---- 2. One source of per-family dollars ---------------------------------------
/**
 * Labor dollars and labor-per-RO by family, resolved through the SAME chain as
 * advisor_family_attach: resolved_family first, then the whole-label mapping,
 * then the legacy service_line join.
 *
 * WHY A VIEW AND NOT THREE COPIES IN TYPESCRIPT. The resolution chain is four
 * coalesced sources and two exclusion rules. Reimplemented per caller it drifts,
 * and the way it drifts is invisible: a family quietly loses its dollars and
 * silently falls back to missed ROs, which still renders a plausible screen.
 * One view means the advisor page, the advisor data loader and the manager view
 * cannot disagree about what a family earned.
 *
 * SECURITY INVOKER, deliberately. advisor_op_metric is RLS-gated, and the
 * existing behaviour — rank by revenue when the raw table is readable, fall
 * back to missed ROs when it is not — depends on the caller's own grants
 * applying. A security-definer view would hand every caller dollars they may
 * not be entitled to.
 *
 * fam_ros here is the RAW per-op-code sum, not the clamped attach numerator:
 * this view answers "what did this family earn per RO booked against it", which
 * is a dollars-per-unit question and wants the same denominator the dollars
 * were accumulated over.
 */
create or replace view advisor_family_labor as
select
  period_id,
  rooftop_id,
  advisor_op_id,
  family,
  fam_ros,
  labor_sales,
  case when fam_ros > 0 then round(labor_sales / fam_ros, 2) end as labor_per_ro
from (
  select
    m.period_id,
    m.rooftop_id,
    m.advisor_op_id,
    coalesce(m.resolved_family, scm.family, sl.family, sl.category) as family,
    sum(m.ros)                                                     as fam_ros,
    sum(m.labor_sales)                                             as labor_sales
  from advisor_op_metric m
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
  where
    (m.sub_category is null or scm.family is not null or m.resolved_family is not null)
    and (scm.status is null or scm.status <> 'not_coachable')
  group by 1, 2, 3, 4
) g
where g.family is not null;

alter view advisor_family_labor set (security_invoker = on);
grant select on advisor_family_labor to authenticated;


-- ---- 3. What the guard reads ---------------------------------------------------
/**
 * Every attach row whose raw numerator outran the denominator, worst first.
 *
 * checkmap reads this and treats a non-empty result as a data-quality report,
 * not a failure — the overflow is expected while the feed lacks RO identifiers.
 * What IS a failure is any rendered attach_rate_pct above 100, which the clamp
 * in section 1 makes impossible; the guard exists so that if somebody removes
 * the clamp, or a future view forgets it, the number fails loudly in a script
 * instead of quietly appearing on an advisor's screen.
 */
create or replace view attach_rate_overflow as
select
  a.period_id,
  a.rooftop_id,
  r.name as rooftop_name,
  a.advisor_op_id,
  a.family,
  a.fam_ros_raw,
  a.advisor_ros,
  a.ros_overflow,
  round(100.0 * a.fam_ros_raw / nullif(a.advisor_ros, 0), 1) as uncapped_pct
from advisor_family_attach a
join rooftop r on r.id = a.rooftop_id
where a.ros_overflow > 0;

alter view attach_rate_overflow set (security_invoker = on);
grant select on attach_rate_overflow to authenticated;

notify pgrst, 'reload schema';
