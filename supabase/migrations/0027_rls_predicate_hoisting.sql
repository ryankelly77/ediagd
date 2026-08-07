-- ============================================================================
-- EDIAGD — 0027 RLS predicate hoisting
--
-- WHAT WAS WRONG
-- Every row of daily_activity was running two function calls. The policy read
--
--     user_id = auth.uid()
--     or has_role(rooftop_id, 'manager')
--     or has_role(rooftop_id, 'admin')
--
-- and because has_role() takes the ROW's rooftop_id it is correlated: Postgres
-- cannot hoist it, so it executes per row, twice, on every scan. The separate
-- is_platform_owner() policy was ORed on the end and evaluated per row too,
-- even though its answer cannot change within a query.
--
-- At 500 rooftops (40k activity rows) that made /admin's summary take 3.6s —
-- and a 20-rooftop dealer admin paid 3.5s of it, because the cost tracked the
-- SIZE OF THE TABLE rather than the size of their scope.
--
-- WHAT THIS DOES
-- Three mechanical changes, no change to who can read what:
--
--   1. (select is_platform_owner()) instead of is_platform_owner(). The scalar
--      subquery makes it an InitPlan — evaluated ONCE per query — and being
--      first in the OR lets it short-circuit the rest for a platform owner.
--   2. (select auth.uid()) for the same reason.
--   3. has_role(rooftop_id, ...) becomes rooftop_id in (select managed_rooftops()).
--      A set-returning stable function in an IN becomes a hashed SubPlan: built
--      once, then a hash probe per row instead of a function call per row.
--
-- The membership self-join inside swell / work_schedule / island_time gets the
-- same treatment via managed_users(). That one was the worst of the lot — a
-- two-table join executed for every row.
--
-- EQUIVALENCE. managed_rooftops() is has_role(_, 'manager') OR has_role(_,
-- 'admin') written as a set: same table, same active flag, same two roles.
-- managed_users() mirrors the EXISTS it replaces, including the detail that it
-- does NOT require the OTHER person's membership to be active — only the
-- caller's. Both are security definer for the same reason my_rooftops() is:
-- they read membership from inside membership's own policy, and definer rights
-- are what stops that recursing.
-- ============================================================================

-- ---- Helpers ---------------------------------------------------------------

-- Rooftops where the caller is a manager or an admin. Deliberately NOT
-- my_rooftops() (any membership, including plain advisor) and not
-- admin_rooftops() (admin only, plus platform owner): this is exactly the set
-- the team-read policies were already describing with two has_role() calls.
create or replace function managed_rooftops()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.rooftop_id
    from membership m
   where m.user_id = auth.uid()
     and m.active
     and m.role in ('manager', 'admin')
$$;

-- The people at those rooftops. For tables keyed by user_id alone (swell,
-- work_schedule, island_time) where the rooftop isn't on the row.
create or replace function managed_users()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct them.user_id
    from membership them
   where them.rooftop_id in (select managed_rooftops())
$$;

grant execute on function managed_rooftops() to authenticated;
grant execute on function managed_users() to authenticated;


-- ---- The hot path: tables that grow with rooftops x advisors x days --------

drop policy if exists daily_activity_team_read on daily_activity;
create policy daily_activity_team_read on daily_activity
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or rooftop_id in (select managed_rooftops())
  );

-- Folded into the policy above. Two permissive policies are ORed anyway, and
-- one expression lets the planner see the cheap test first.
drop policy if exists daily_activity_platform_read on daily_activity;

drop policy if exists completion_team_read on daily_completion;
create policy completion_team_read on daily_completion
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or rooftop_id in (select managed_rooftops())
  );
drop policy if exists completion_platform_read on daily_completion;

drop policy if exists progress_team_read on content_progress;
create policy progress_team_read on content_progress
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or rooftop_id in (select managed_rooftops())
  );
drop policy if exists progress_platform_read on content_progress;

drop policy if exists membership_read on membership;
create policy membership_read on membership
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or rooftop_id in (select managed_rooftops())
  );
drop policy if exists membership_platform_read on membership;


-- ---- Keyed by user_id only: the membership self-join goes ------------------

drop policy if exists swell_team_read on swell;
drop policy if exists swell_self_read on swell;
create policy swell_team_read on swell
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or user_id in (select managed_users())
  );
drop policy if exists swell_platform_read on swell;

drop policy if exists work_schedule_team_read on work_schedule;
create policy work_schedule_team_read on work_schedule
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or user_id in (select managed_users())
  );

drop policy if exists island_time_team_read on island_time;
create policy island_time_team_read on island_time
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or user_id in (select managed_users())
  );


-- ---- app_user: joined by every admin view for the names -------------------

drop policy if exists app_user_team_read on app_user;
drop policy if exists app_user_self on app_user;
create policy app_user_team_read on app_user
  for select using (
    (select is_platform_owner())
    or id = (select auth.uid())
    or id in (select managed_users())
  );
drop policy if exists app_user_platform_read on app_user;


-- ---- Self-only tables: hoist auth.uid(), nothing else to do ---------------

drop policy if exists sand_self_read on sand_dollar_entry;
create policy sand_self_read on sand_dollar_entry
  for select using (
    (select is_platform_owner()) or user_id = (select auth.uid())
  );
drop policy if exists sand_platform_read on sand_dollar_entry;

drop policy if exists user_badge_self_read on user_badge;
create policy user_badge_self_read on user_badge
  for select using (
    (select is_platform_owner()) or user_id = (select auth.uid())
  );
drop policy if exists user_badge_platform_read on user_badge;

drop policy if exists paddle_out_self_read on paddle_out_entry;
create policy paddle_out_self_read on paddle_out_entry
  for select using (user_id = (select auth.uid()));


-- ---- Performance tables: rows per rooftop, so they scale with the group ---
-- advisor_op_metric is ~100 rows PER ROOFTOP per period, which is the fastest
-- growing table in the schema. The my_rooftops() IN was already a hashed
-- SubPlan and stays; only the platform-owner call needed hoisting.

drop policy if exists advisor_op_metric_read on advisor_op_metric;
drop policy if exists advisor_op_metric_platform_read on advisor_op_metric;
create policy advisor_op_metric_read on advisor_op_metric
  for select using (
    (select is_platform_owner()) or rooftop_id in (select my_rooftops())
  );

drop policy if exists advisor_total_read on advisor_period_total_src;
drop policy if exists advisor_total_platform_read on advisor_period_total_src;
create policy advisor_total_read on advisor_period_total_src
  for select using (
    (select is_platform_owner()) or rooftop_id in (select my_rooftops())
  );

drop policy if exists perf_period_read on perf_period;
drop policy if exists perf_period_platform_read on perf_period;
create policy perf_period_read on perf_period
  for select using (
    (select is_platform_owner()) or rooftop_id in (select my_rooftops())
  );

drop policy if exists rooftop_read on rooftop;
drop policy if exists rooftop_platform_read on rooftop;
create policy rooftop_read on rooftop
  for select using (
    (select is_platform_owner()) or id in (select my_rooftops())
  );

drop policy if exists rooftop_product_read on rooftop_product;
drop policy if exists rooftop_product_platform_read on rooftop_product;
create policy rooftop_product_read on rooftop_product
  for select using (
    (select is_platform_owner()) or rooftop_id in (select my_rooftops())
  );

drop policy if exists org_read on org;
drop policy if exists org_platform_read on org;
create policy org_read on org
  for select using (
    (select is_platform_owner())
    or id in (select r.org_id from rooftop r where r.id in (select my_rooftops()))
  );

-- LEFT ALONE ON PURPOSE:
--   badge_read, op_code_read, catalog_read, service_line_read — `true`.
--   game_settings_read — one row.
--   content_entitled_read — content is a catalog of dozens of rows; its EXISTS
--     runs per content row, not per advisor-day, so hoisting buys nothing real.
--   swag_redemption — per-user, and its admin EXISTS is not correlated to the
--     row, so the planner already lifts it.
