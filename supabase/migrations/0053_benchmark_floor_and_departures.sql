-- ============================================================================
-- EDIAGD — 0053 Who counts toward a store average, and who has left
--
-- Ryan asked for a way to switch off advisors who have gone, so they stop
-- throwing off the data. Deactivating a membership would not have done it:
-- every performance view keys on advisor_op_id and never looks at membership,
-- so a departed advisor's numbers stay in the store average whatever their
-- account says.
--
-- Measuring first found the bigger problem underneath, and it is not about
-- departures at all.
--
-- ---------------------------------------------------------------------------
-- 1. A TWO-RO ADVISOR MOVED THE STORE AVERAGE AS MUCH AS A TWO-HUNDRED-RO ONE
-- ---------------------------------------------------------------------------
-- family_store_benchmark was avg(attach_rate_pct) across every advisor with any
-- data in the period. An advisor with two ROs who sold one filter has a 50%
-- filter attach rate — arithmetically true, meaningless as a benchmark, and
-- weighted identically to somebody with a real book.
--
-- Measured on July 2026:
--
--   Doggett Ford of Beaumont   22.2% -> 14.6%   (3 of 7 advisors under 20 ROs)
--   Doggett Honda of Beaumont  16.0% -> 12.2%
--   Doggett Nissan of Beaumont 22.1% -> 19.4%
--
-- Seven and a half points at one store. Every advisor there was being measured
-- against a bar inflated by colleagues who had barely worked, and Eddie's Pick
-- was picking gaps against that inflated bar — so the coaching was aimed wrong,
-- not just the number.
--
-- The floor is the same 20 ROs the UI already uses to decide whether an
-- advisor's own rates are stable enough to show. It was applied to what a
-- person is TOLD and not to what everyone is MEASURED AGAINST, which is the
-- half that matters more.
--
-- KEPT IN THE NUMERATOR, REMOVED FROM THE BENCHMARK. A thin advisor still sees
-- their own attach rates; they simply stop setting the bar for everybody else.
--
-- ---------------------------------------------------------------------------
-- 2. DEPARTURES
-- ---------------------------------------------------------------------------
-- dms_advisor.departed_on records that somebody has left. It does NOT delete or
-- rewrite their history: their past months are real and belong in past periods.
-- It takes them off the current roster and releases their operator id so a new
-- hire can inherit it — which the unique index in 0049 otherwise blocks while
-- the old membership is active.
--
-- Three advisors are sitting in this state today: Royel Guillen (last worked
-- February), Lisa Ortiz (April) and Taylor Johnson (June), all still holding
-- active memberships.
-- ============================================================================


-- ---- 1. The volume floor, named once -----------------------------------------
/**
 * Below this many ROs in a period, an advisor's attach rates are noise.
 *
 * COUPLED, DELIBERATELY AND VISIBLY, to MIN_ROS_FOR_COACHING in lib/advisor.ts.
 * Two copies of a number is a drift risk; the alternative here was making a
 * pure, synchronous scoring function into an async one that reads settings, and
 * the coupling is cheaper than that. If one moves, move the other.
 */
create or replace function min_ros_for_coaching()
returns int language sql immutable as $$ select 20 $$;

grant execute on function min_ros_for_coaching() to authenticated;


-- ---- 3. Departures -----------------------------------------------------------

alter table dms_advisor
  add column if not exists departed_on date,
  add column if not exists departed_by uuid references app_user(id) on delete set null,
  add column if not exists departed_note text;

comment on column dms_advisor.departed_on is
  'Last day this advisor worked at this rooftop. History is untouched; they '
  'leave the current roster and their operator id becomes available.';

create index if not exists dms_advisor_active_idx
  on dms_advisor (rooftop_id) where departed_on is null;

-- ---- 2. The benchmark, with the floor applied --------------------------------

create or replace view family_store_benchmark as
select
  fa.period_id,
  fa.rooftop_id,
  fa.family,
  round(avg(fa.attach_rate_pct), 1) as store_avg_pct,
  max(fa.attach_rate_pct)           as store_best_pct,
  count(*)::int                     as advisors_counted
from advisor_family_attach fa
join advisor_period_total_src t
  on t.period_id = fa.period_id
 and t.rooftop_id = fa.rooftop_id
 and t.advisor_op_id = fa.advisor_op_id
left join dms_advisor d
  on d.rooftop_id = fa.rooftop_id
 and d.advisor_op_id = fa.advisor_op_id
join perf_period p on p.id = fa.period_id
where t.total_ros >= min_ros_for_coaching()
  -- A departed advisor still counts in the months they actually worked. They
  -- stop counting from the period after they left, so a store average does not
  -- keep being set by somebody who is not there.
  and (d.departed_on is null or d.departed_on >= p.starts_on)
group by fa.period_id, fa.rooftop_id, fa.family;


/**
 * Mark an advisor as gone, and release what they were holding.
 *
 * ONE TRANSACTION covering both halves: the roster row and the membership. Done
 * by hand these drift — somebody marks the roster and forgets the membership,
 * and then the operator id stays locked by 0049's unique index and the next
 * hire cannot be given it. The failure appears weeks later, at the worst
 * moment, and looks like a bug in the guard rather than an unfinished job.
 *
 * Reversible: pass null to bring somebody back.
 */
create or replace function set_advisor_departed(
  _rooftop_id uuid,
  _op_code    text,
  _departed   date default current_date,
  _note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid       uuid := auth.uid();
  _memberships int := 0;
  _roster      int := 0;
begin
  if not (
    _rooftop_id in (select managed_rooftops())
    or is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'set_advisor_departed: you do not manage that rooftop';
  end if;

  update dms_advisor
     set departed_on   = _departed,
         departed_by   = case when _departed is null then null else _uid end,
         departed_note = case when _departed is null then null else _note end
   where rooftop_id = _rooftop_id
     and advisor_op_id = _op_code;
  get diagnostics _roster = row_count;

  if _roster = 0 then
    raise exception 'set_advisor_departed: % is not on this rooftop''s roster', _op_code;
  end if;

  -- Deactivating the membership is what frees the operator id. Reactivating on
  -- an un-depart is deliberately NOT done: giving somebody back their login is
  -- a decision, not a side effect of correcting a date.
  if _departed is not null then
    update membership
       set active = false
     where rooftop_id = _rooftop_id
       and op_code_id = _op_code
       and active;
    get diagnostics _memberships = row_count;
  end if;

  return jsonb_build_object(
    'op_code', _op_code,
    'departed_on', _departed,
    'memberships_deactivated', _memberships
  );
end $$;

revoke all on function set_advisor_departed(uuid, text, date, text) from public, anon;
grant execute on function set_advisor_departed(uuid, text, date, text) to authenticated;


-- ---- 4. Who looks gone --------------------------------------------------------
/**
 * Advisors with no recent activity who are still on the roster.
 *
 * A prompt, never an action: somebody on leave looks identical to somebody who
 * has resigned, and only the store knows which. 30 days is long enough that a
 * holiday does not trigger it.
 */
create or replace view dms_advisor_dormant as
select
  a.rooftop_id,
  r.name              as rooftop_name,
  a.advisor_op_id,
  a.display_name,
  a.last_seen,
  (current_date - a.last_seen)::int as days_since,
  exists (
    select 1 from membership m
     where m.rooftop_id = a.rooftop_id
       and m.op_code_id = a.advisor_op_id
       and m.active
  ) as still_has_membership
from dms_advisor a
join rooftop r on r.id = a.rooftop_id
where a.departed_on is null
  and a.last_seen is not null
  and a.last_seen < current_date - 30;

alter view dms_advisor_dormant set (security_invoker = on);
grant select on dms_advisor_dormant to authenticated;

notify pgrst, 'reload schema';
