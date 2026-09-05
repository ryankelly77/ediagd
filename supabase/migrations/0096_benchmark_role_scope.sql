-- ============================================================================
-- EDIAGD — 0096 The store benchmark is for roles that have a performance screen
--
-- family_store_benchmark was scoped by MEMBERSHIP and not by ROLE. Its tenant
-- filter comes from advisor_family_attach_all, which narrows on my_rooftops() —
-- and a technician has an active membership at the rooftop, so a technician
-- session read all 348 rows of store attach averages. Measured, not assumed.
--
-- Flagged when the technician track was stubbed and deliberately left alone
-- then: narrowing a definer view is the change that nearly blanked every
-- advisor screen in Round B, and it deserved its own task with its own
-- verification rather than being tacked onto a taxonomy commit.
--
-- ---------------------------------------------------------------------------
-- WHAT IS AND IS NOT EXPOSED
-- ---------------------------------------------------------------------------
-- The rows are store-level averages by family, not per-advisor figures — so
-- this was never a leak of one person's numbers. It is still performance data
-- shown to a role the product says has no performance tracking, which is the
-- kind of gap that is small until somebody builds a screen on top of it.
--
-- ---------------------------------------------------------------------------
-- ZERO ROWS, NOT AN ERROR
-- ---------------------------------------------------------------------------
-- A technician's query returns an empty set. The screens that read this already
-- handle "no benchmark" — a store with one advisor has no average to compare
-- against — so an empty result renders the same honest state rather than a
-- crash.
-- ============================================================================

/**
 * Does the caller have a role that is measured on performance?
 *
 * SECURITY INVOKER, deliberately and emphatically. bypasses_rls() was written
 * as SECURITY DEFINER in 0081 and current_user became the OWNER inside it, so
 * it returned true for everybody and handed all eleven rooftops to an advisor
 * whose base-table reads had correctly narrowed to twelve rows. That bug is the
 * reason this function is invoker and the reason the verification below reads
 * as four roles rather than as an argument.
 */
create or replace function has_performance_surface()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select is_platform_owner()),
    false
  ) or exists (
    select 1 from membership m
     where m.user_id = (select auth.uid())
       and m.active
       and m.role in ('advisor', 'manager', 'admin')
  )
$$;

comment on function has_performance_surface() is
  'True when the caller holds a role with a performance screen. Technicians do '
  'not: there is no technician measurement by design, so there is nothing for '
  'them to be compared against. See 0096.';

/*
 * The view body is 0081's, unchanged, with one predicate added. Everything else
 * — the min-ROs floor, the departed-advisor exclusion, the grouping — is
 * reproduced exactly rather than edited in place, because a view is replaced
 * whole and a silent difference here moves numbers.
 */
create or replace view family_store_benchmark as
  select fa.period_id,
         fa.rooftop_id,
         fa.family,
         round(avg(fa.attach_rate_pct), 1) as store_avg_pct,
         max(fa.attach_rate_pct)           as store_best_pct,
         count(*)::integer                 as advisors_counted
    from advisor_family_attach_all fa
    join advisor_period_total_src t
      on t.period_id = fa.period_id
     and t.rooftop_id = fa.rooftop_id
     and t.advisor_op_id = fa.advisor_op_id
    left join dms_advisor d
      on d.rooftop_id = fa.rooftop_id
     and d.advisor_op_id = fa.advisor_op_id
    join perf_period p on p.id = fa.period_id
   where t.total_ros >= min_ros_for_coaching()::numeric
     and (d.departed_on is null or d.departed_on >= p.starts_on)
     -- 0096: role, not just tenancy.
     and (select has_performance_surface())
   group by fa.period_id, fa.rooftop_id, fa.family;

comment on view family_store_benchmark is
  'Store-level attach averages by family. Scoped by TENANCY through '
  'advisor_family_attach_all and by ROLE through has_performance_surface() — a '
  'technician gets zero rows rather than an error. See 0096.';
