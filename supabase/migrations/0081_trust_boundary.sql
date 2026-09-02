-- ============================================================================
-- EDIAGD — 0081 The trust boundary
--
-- Every table in `public` grants ALL to `anon` and `authenticated`. There is no
-- GRANT layer underneath: RLS is the entire security model, and an over-wide
-- policy is not a latent risk, it is a URL. Six of them were.
--
--   daily_activity     FOR ALL with only `user_id = auth.uid()`, so a client
--                      could post rows carrying ANOTHER rooftop's id — and
--                      user_engagement divides by
--                      `count(distinct activity_date)` per rooftop, so 365
--                      fabricated dates collapse every advisor's score at a
--                      store the attacker does not work at.
--   daily_completion   an INSERT policy alongside completeDay()'s verified,
--                      service-role write: a second door with no watch check,
--                      no server-derived block, and no schedule stamp.
--   app_user           FOR ALL includes DELETE, and 23 foreign keys cascade
--                      from it. One HTTP DELETE erases an advisor's entire
--                      coaching and economy history, irreversibly, from a phone.
--   content_progress   FOR ALL with an unconstrained rooftop_id — the same
--                      shape as daily_activity. saved_content already had the
--                      right WITH CHECK; this copies it.
--   peer metrics       advisor_op_metric / advisor_period_total_src were
--                      readable by any member of the rooftop, so every advisor
--                      could read every colleague's ROs, labor sales, ELR and
--                      GP%.
--   mapping + refs     four tables readable by any session, four more readable
--                      with the bare anon key and no session at all.
--
-- ---------------------------------------------------------------------------
-- ONE THING FOUND WHILE MEASURING THE BASELINE, AND FIXED HERE BECAUSE THIS
-- MIGRATION WOULD OTHERWISE CEMENT IT
-- ---------------------------------------------------------------------------
-- advisor_family_attach is `security_invoker = on` and joins sub_category_map,
-- which is admin-only. So an advisor-only account never resolves a family
-- through the sub-category map: the COALESCE falls through to service_line and
-- the WHERE drops everything else.
--
-- Measured against production, for a real advisor at Doggett CDJR:
--
--                              rows   families
--   what the data supports     1012         19
--   what an advisor sees        101          3
--
-- Nobody has seen this because the only two accounts that exist are also admin
-- and group_owner, so they read it as owners. The first genuinely
-- advisor-scoped account would have opened /advisor to three of nineteen
-- services and had Eddie's Pick chosen from them.
--
-- It matters HERE because the fix for the peer-metric leak and the fix for this
-- are the same mechanism, and doing one without the other makes it worse: if
-- the store benchmark keeps aggregating what the advisor can read, the advisor's
-- own rate would come from three families while the store average it is compared
-- against comes from nineteen.
--
-- So the perf views stop inheriting their scope from RLS and state it. Each is
-- SECURITY DEFINER with an explicit tenant filter, which is the same posture
-- quiz_question_public has always had and for the same reason: a view that
-- aggregates a table its caller cannot read row-by-row has to be the sanctioned
-- reader, or it is not a view, it is an empty set.
-- ============================================================================


-- ---- 0. Two predicates the rest of the file leans on ------------------------

/**
 * True when the caller already bypasses RLS: service_role, postgres,
 * supabase_admin.
 *
 * WHY A VIEW NEEDS THIS AND A POLICY DOES NOT. service_role carries
 * `rolbypassrls`, so RLS is simply not consulted for it — but a WHERE clause
 * inside a view is ordinary SQL and applies to everybody. Moving the perf
 * views' scoping out of RLS and into their own bodies would therefore have
 * hidden every row from the service role: `npm run checkmap`, day-preview, the
 * brakes acceptance test and every server action that reads through the
 * service client.
 *
 * Asking the role catalogue rather than sniffing the JWT means this says what
 * it means — "if you are already trusted, this view does not second-guess you"
 * — and cannot drift from what Postgres actually enforces.
 */
create or replace function bypasses_rls()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((select r.rolbypassrls from pg_roles r where r.rolname = current_user), false)
$$;

/**
 * The (rooftop, operator id) pairs that are THIS person's own book.
 *
 * TWO SOURCES, BECAUSE ONLY ONE OF THEM IS POPULATED. `dms_advisor.linked_user_id`
 * is the intended link and is NULL for every user in production today;
 * `membership.op_code_id` is the one the app actually keys on — advisor/page.tsx
 * reads it and passes it as advisor_op_id. Scoping on linked_user_id alone, as
 * the obvious reading suggests, would return zero rows for every advisor and
 * blank the performance screens.
 *
 * SECURITY DEFINER because it reads dms_advisor, which advisors cannot see.
 */
create or replace function my_advisor_op_ids()
returns table (rooftop_id uuid, advisor_op_id text)
language sql
stable
security definer
set search_path = public
as $$
  select m.rooftop_id, m.op_code_id
    from membership m
   where m.user_id = auth.uid() and m.active and m.op_code_id is not null
  union
  select d.rooftop_id, d.advisor_op_id
    from dms_advisor d
   where d.linked_user_id = auth.uid()
$$;

revoke all on function bypasses_rls() from public, anon;
revoke all on function my_advisor_op_ids() from public, anon;
grant execute on function bypasses_rls() to authenticated;
grant execute on function my_advisor_op_ids() to authenticated;


-- ---- 1. daily_activity: the engagement score stops being self-declared ------
/*
 * Service-role write, like swell / user_badge / sand_dollar_entry in 0012.
 *
 * VERIFIED FIRST: nothing in the app writes this table. The only writers are
 * supabase/seed.sql and the rooftop-migration scripts, all service role; the
 * app only ever reads it, in lib/admin-advisor-detail.ts. So there is no
 * client write to move server-side, and the 0009 header's "the app on login
 * upserts today's row" describes something that was never built.
 *
 * daily_activity_team_read is left in place and is the self-SELECT policy: its
 * first branch is `user_id = auth.uid()`, with manager and platform-owner
 * branches after it.
 */
drop policy if exists daily_activity_self_write on daily_activity;


-- ---- 2. daily_completion: one door, and it is the verified one --------------
/*
 * completeDay() derives the block server-side, checks the watch tickets against
 * wall clock, stamps was_scheduled, and writes with the service role. This
 * policy was a second entrance that did none of that: a phone could POST a
 * finished six-day coaching block, because readOpenBlock() counts completions
 * against block_id to find the stage cursor.
 *
 * Nothing legitimate used it — the RLS insert path has never been reachable
 * from the app, which has always gone through the server action.
 */
drop policy if exists completion_self_insert on daily_completion;


-- ---- 3. app_user: no user may delete themselves ----------------------------
/*
 * 0002's `for all using (id = auth.uid())` was written when the row held a name
 * and nothing else. 0015 noticed the UPDATE half — "permits updating ANY column
 * of their own row" — and closed the is_platform_owner column with a trigger.
 * The DELETE half was never closed, and 23 foreign keys cascade from this table:
 * membership, daily_completion, daily_activity, content_progress, coaching_block,
 * sand_dollar_entry, swell, paddle_out_entry, user_badge, quiz_attempt,
 * module_completion, work_schedule, engagement_rollup, impact_rollup,
 * saved_content, swag_redemption, notification, notification_outbox,
 * notification_pref, device_push_token, island_time, org_membership.
 *
 * NO INSERT POLICY, DELIBERATELY. There is no self-service signup: login is
 * signInWithPassword only, and every app_user row is created by
 * scripts/provision-owner.ts or supabase/seed.sql with the service role.
 * Nothing in app/ or lib/ inserts into this table. If self-serve signup is ever
 * turned on, `for insert with check (id = auth.uid())` is the line to add — but
 * adding it now would be a door held open for a room nobody has built.
 *
 * SELECT is unchanged: app_user_team_read already covers self, managed users
 * and the platform owner.
 */
drop policy if exists app_user_upsert on app_user;

create policy app_user_self_update on app_user
  for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));


-- ---- 4. content_progress: the rooftop has to be one of yours ---------------
/*
 * Same defect as daily_activity: the WITH CHECK constrained user_id and left
 * rooftop_id free, so a client could file its progress against another store.
 * saved_content has had the right shape since 0059 — this is that clause,
 * copied.
 *
 * SPLIT INTO INSERT AND UPDATE rather than FOR ALL, which drops the user's
 * DELETE. The only delete is lib/library-actions.ts compensating a failed
 * payout, and it runs as the service role.
 *
 * record_watch_progress() (the browser's write path from MuxVideo) is NOT
 * security definer, so it writes under these policies — and it derives
 * rooftop_id from the caller's own active membership, so it satisfies the check
 * it is now held to.
 */
drop policy if exists progress_self_write on content_progress;

create policy content_progress_self_insert on content_progress
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from membership m
       where m.user_id = (select auth.uid())
         and m.rooftop_id = content_progress.rooftop_id
         and m.active
    )
  );

create policy content_progress_self_update on content_progress
  for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from membership m
       where m.user_id = (select auth.uid())
         and m.rooftop_id = content_progress.rooftop_id
         and m.active
    )
  );


-- ---- 5. An advisor's numbers are their own ---------------------------------
/*
 * `my_rooftops()` is any active membership at the rooftop, of any role — so
 * these two tables were readable, in full, by every colleague. At Doggett Honda
 * Med Center that is 40 operators' labor sales, effective labor rate and GP%
 * behind one advisor's login.
 *
 * perf_period KEEPS my_rooftops() and is not listed here. It carries no
 * per-advisor data — starts_on, ends_on, label, is_partial, source_file — and
 * the advisor screens read it directly for the period label. Narrowing it would
 * take the label off the screen and buy nothing.
 */
drop policy if exists advisor_op_metric_read on advisor_op_metric;
create policy advisor_op_metric_read on advisor_op_metric
  for select using (
    (select is_platform_owner())
    or rooftop_id in (select managed_rooftops())
    or (rooftop_id, advisor_op_id) in (select o.rooftop_id, o.advisor_op_id from my_advisor_op_ids() o)
  );

drop policy if exists advisor_total_read on advisor_period_total_src;
create policy advisor_total_read on advisor_period_total_src
  for select using (
    (select is_platform_owner())
    or rooftop_id in (select managed_rooftops())
    or (rooftop_id, advisor_op_id) in (select o.rooftop_id, o.advisor_op_id from my_advisor_op_ids() o)
  );


-- ---- 6. The mapping is not public, and neither is anything else ------------
/*
 * op_text_rule, op_code_catalog, op_code_family and mapping_alias hold the
 * op-code-to-family classification the whole measurement product is built on,
 * and were readable by any authenticated session — including, once a second
 * dealer arrives, a competitor's advisors. sub_category_map already gets this
 * right (admin_rooftops), which is the shape being copied.
 *
 * VERIFIED, NOT ASSUMED: the daily loop reads op_code_family through
 * op_code_family_live from ensureBlockForToday(), which is handed the SERVICE
 * client (0067 gives coaching_block no user-facing insert policy, so that whole
 * path is already service-role). The importer and remap run as the service
 * role too. Both bypass RLS, so narrowing the read policy reaches neither.
 *
 * service_line, op_code, product_catalog and badge were `using (true)` — the
 * bare anon key, no session, no dealer. service_line is 1,805 rows of the
 * op-code-to-family reference table. They now require a session. Checked: no
 * app code reads service_line, op_code or product_catalog at runtime at all
 * (every hit is a comment), and `badge` is read on /today and /badges, both
 * behind auth. advisor_family_attach joins service_line, and is definer from
 * section 7 below, so it reads it as the owner.
 */
drop policy if exists op_text_rule_read on op_text_rule;
create policy op_text_rule_read on op_text_rule
  for select using (
    (select is_platform_owner()) or exists (select 1 from admin_rooftops())
  );

drop policy if exists op_code_catalog_read on op_code_catalog;
create policy op_code_catalog_read on op_code_catalog
  for select using (
    (select is_platform_owner()) or exists (select 1 from admin_rooftops())
  );

drop policy if exists op_code_family_read on op_code_family;
create policy op_code_family_read on op_code_family
  for select using (
    (select is_platform_owner()) or exists (select 1 from admin_rooftops())
  );

drop policy if exists mapping_alias_read on mapping_alias;
create policy mapping_alias_read on mapping_alias
  for select using (
    (select is_platform_owner()) or exists (select 1 from admin_rooftops())
  );

drop policy if exists service_line_read on service_line;
create policy service_line_read on service_line
  for select using ((select auth.uid()) is not null);

drop policy if exists op_code_read on op_code;
create policy op_code_read on op_code
  for select using ((select auth.uid()) is not null);

drop policy if exists catalog_read on product_catalog;
create policy catalog_read on product_catalog
  for select using ((select auth.uid()) is not null);

drop policy if exists badge_read on badge;
create policy badge_read on badge
  for select using ((select auth.uid()) is not null);


-- ---- 7. The perf views say what they are scoped to -------------------------
/*
 * advisor_family_attach_all is the family resolution, complete, for the
 * rooftops the caller belongs to. It is the SANCTIONED READER of
 * sub_category_map: definer, so the map resolves for everybody rather than only
 * for admins, and filtered to my_rooftops() so it cannot cross a tenant.
 *
 * NOT GRANTED TO anon OR authenticated. It is the aggregation source for
 * family_store_benchmark and the base of the scoped view below; reading it
 * directly would be reading colleagues' rows, which is the thing being closed.
 */
create or replace view advisor_family_attach_all as
with fam as (
  select
    m.period_id,
    m.rooftop_id,
    m.advisor_op_id,
    coalesce(m.resolved_family, scm.family, sl.family, sl.category) as family,
    sum(m.ros) as fam_ros
  from advisor_op_metric m
  join perf_period p on p.id = m.period_id
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
   and scm.effective_from <= p.starts_on
   and (scm.retired_at is null or p.starts_on < scm.retired_at)
  where
    (m.sub_category is null or scm.family is not null or m.resolved_family is not null)
    and (scm.status is null or scm.status <> 'not_coachable')
    and (bypasses_rls() or m.rooftop_id in (select my_rooftops()))
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

revoke all on advisor_family_attach_all from anon, authenticated;

comment on view advisor_family_attach_all is
  'SECURITY DEFINER on purpose: the sanctioned reader of sub_category_map, so '
  'the family resolution is the same for an advisor as for an admin. Scoped to '
  'my_rooftops(). Not granted to anon or authenticated — read '
  'advisor_family_attach instead, which adds the per-advisor scoping.';

/*
 * The same rows, narrowed to what the caller is entitled to see: their own book
 * if they are an advisor, the whole rooftop if they manage it.
 *
 * The scoping is in the WHERE rather than inherited from RLS because the view
 * beneath it is definer — which is what makes the family resolution complete.
 * That is the trade: state the rule here, in one place a reader can check,
 * instead of getting it as a side effect of which tables happen to be readable.
 */
create or replace view advisor_family_attach as
  select a.*
    from advisor_family_attach_all a
   where bypasses_rls()
      or (select is_platform_owner())
      or a.rooftop_id in (select managed_rooftops())
      or (a.rooftop_id, a.advisor_op_id) in (select o.rooftop_id, o.advisor_op_id from my_advisor_op_ids() o);

alter view advisor_family_attach set (security_invoker = off);
grant select on advisor_family_attach to authenticated;

comment on view advisor_family_attach is
  'Per-advisor attach rates. Definer, and scoped in its own WHERE: own book for '
  'an advisor, the rooftop for a manager or admin. See 0081.';

/* Same treatment, same reasons. Nothing aggregates this one across a store, so
   it needs no _all twin — the scoping goes straight into the body. */
create or replace view advisor_family_labor as
with fam as (
  select
    m.period_id,
    m.rooftop_id,
    m.advisor_op_id,
    coalesce(m.resolved_family, scm.family, sl.family, sl.category) as family,
    sum(m.ros)         as fam_ros,
    sum(m.labor_sales) as labor_sales
  from advisor_op_metric m
  join perf_period p on p.id = m.period_id
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
   and scm.effective_from <= p.starts_on
   and (scm.retired_at is null or p.starts_on < scm.retired_at)
  where
    (m.sub_category is null or scm.family is not null or m.resolved_family is not null)
    and (scm.status is null or scm.status <> 'not_coachable')
    and (
      bypasses_rls()
      or (select is_platform_owner())
      or m.rooftop_id in (select managed_rooftops())
      or (m.rooftop_id, m.advisor_op_id) in (select o.rooftop_id, o.advisor_op_id from my_advisor_op_ids() o)
    )
  group by 1, 2, 3, 4
)
select
  f.period_id,
  f.rooftop_id,
  f.advisor_op_id,
  f.family,
  least(f.fam_ros, t.total_ros)                        as fam_ros,
  f.labor_sales,
  case when least(f.fam_ros, t.total_ros) > 0
       then round(f.labor_sales / least(f.fam_ros, t.total_ros), 2)
  end                                                  as labor_per_ro,
  f.fam_ros                                            as fam_ros_raw,
  greatest(f.fam_ros - t.total_ros, 0)                 as ros_overflow
from fam f
join advisor_period_total_src t using (period_id, rooftop_id, advisor_op_id)
where f.family is not null;

alter view advisor_family_labor set (security_invoker = off);
grant select on advisor_family_labor to authenticated;

/*
 * THE STORE COMPARISON, WHICH IS THE WHOLE POINT OF THE SCREEN.
 *
 * It has to average across every advisor at the rooftop. If it read the scoped
 * view it would average one row — the advisor's own — and report it as the
 * store average, which is worse than an error because it looks like a number.
 * So it reads advisor_family_attach_all and stays definer, with the tenant
 * filter inherited from that view.
 *
 * This is the one place 0081 does the opposite of what a security pass usually
 * does, so it is worth being explicit: making this view security_invoker would
 * not tighten anything. It would silently turn every advisor's benchmark into a
 * comparison with themselves.
 */
drop view if exists family_store_benchmark;
create view family_store_benchmark as
  select
    fa.period_id,
    fa.rooftop_id,
    fa.family,
    round(avg(fa.attach_rate_pct), 1)  as store_avg_pct,
    max(fa.attach_rate_pct)            as store_best_pct,
    count(*)::integer                  as advisors_counted
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
  group by fa.period_id, fa.rooftop_id, fa.family;

grant select on family_store_benchmark to authenticated;

comment on view family_store_benchmark is
  'SECURITY DEFINER on purpose. It aggregates every advisor at the rooftop, '
  'which is what a store average IS — making it security_invoker would average '
  'the caller''s own row and call the result the store. Tenant-scoped through '
  'advisor_family_attach_all. See 0081.';

/*
 * THE OTHER TWO DEFINER VIEWS STAY DEFINER, AND HERE IS WHY IN WRITING.
 *
 * Both aggregate quiz_attempt, and quiz_attempt's only read policy is
 * `user_id = auth.uid()`. There is no policy anywhere that lets a manager or an
 * admin read another person's attempt row — the views ARE that permission,
 * granted narrowly and in aggregate. Switching either to security_invoker would
 * not restrict them; it would reduce them to the caller's own attempts and then
 * fail the `>= 3 respondents` floor, returning nothing, on a screen whose empty
 * state reads as "nobody has taken a quiz yet".
 *
 * Each already carries its own tenant filter — admin_rooftops() and
 * managed_users() respectively — which is the property that makes definer safe.
 */
comment on view admin_module_comprehension is
  'SECURITY DEFINER on purpose: the sanctioned aggregate reader of quiz_attempt, '
  'which has no cross-user read policy. Tenant-scoped by admin_rooftops() in its '
  'own body. See 0081.';

comment on view team_quiz_difficulty is
  'SECURITY DEFINER on purpose: the sanctioned aggregate reader of quiz_attempt, '
  'which has no cross-user read policy. Tenant-scoped by managed_users() in its '
  'own body. See 0081.';

comment on view quiz_question_public is
  'SECURITY DEFINER on purpose: quiz_question has no non-admin read policy, so '
  'this view is how an advisor sees a question at all. It exists to expose the '
  'prompt and the four options WITHOUT the `correct` column — making it '
  'security_invoker would return nothing and take the quiz down. See 0081.';
