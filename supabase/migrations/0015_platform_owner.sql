-- ============================================================================
-- EDIAGD — 0015 Platform owner (super admin)
--
-- Platform ownership is a USER property, not a per-rooftop membership role: a
-- platform owner (Ryan, Mitch) sees every rooftop and edits global content and
-- the gamification economy. A dealer 'admin' stays scoped to my_rooftops().
--
-- ---------------------------------------------------------------------------
-- ESCALATION GUARD — the security-critical part of this migration.
-- ---------------------------------------------------------------------------
-- is_platform_owner is the highest privilege in the system, so a normal
-- authenticated user must not be able to grant it to themselves. They hold the
-- public anon key and can PATCH /rest/v1/app_user directly, and the existing
-- app_user_upsert policy (0002) is `FOR ALL using (id = auth.uid())` — which
-- permits updating ANY column of their own row, including this new one.
--
-- A `with check` clause comparing the new value to a sub-select of the current
-- value is NOT used here, for two reasons:
--   1. Referencing app_user inside a policy ON app_user risks
--      "42P17 infinite recursion detected in policy for relation app_user".
--   2. Policy expressions are evaluated as the invoking user, so the sub-select
--      is itself RLS-filtered — if a row is invisible the subquery yields NULL
--      and the comparison goes NULL (not TRUE, but the failure mode is opaque
--      and easy to get wrong).
--
-- Instead a BEFORE INSERT OR UPDATE trigger compares OLD/NEW directly. It runs
-- regardless of which policy allowed the write, sees the true prior value, and
-- cannot be bypassed by a crafted PATCH. Writes that don't touch the flag are
-- unaffected, so users can still edit full_name.
--
-- The service role and the SQL editor (both have a NULL auth.uid()) are allowed
-- through — that is how initial owners get set.
-- ============================================================================

-- ---- The flag --------------------------------------------------------------
alter table app_user
  add column if not exists is_platform_owner boolean not null default false;

-- ---- Helper: is the caller a platform owner? -------------------------------
-- security definer so it bypasses RLS on app_user; without that, calling it
-- from app_user's own policies would recurse.
create or replace function is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select u.is_platform_owner from app_user u where u.id = auth.uid()),
    false
  )
$$;

-- ---- The guard -------------------------------------------------------------
create or replace function guard_platform_owner_flag()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := coalesce(new.is_platform_owner, false);
  else
    changed := new.is_platform_owner is distinct from old.is_platform_owner;
  end if;

  if changed then
    -- auth.uid() is NULL for the service role and for direct SQL (dashboard):
    -- those are trusted paths and may set the flag. Anyone else must already
    -- be a platform owner to grant or revoke it.
    if auth.uid() is not null and not is_platform_owner() then
      raise exception
        'is_platform_owner may only be changed by a platform owner'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists app_user_guard_platform_owner on app_user;
create trigger app_user_guard_platform_owner
  before insert or update on app_user
  for each row execute function guard_platform_owner_flag();

-- ============================================================================
-- ACCESS — additive policies only.
--
-- Postgres ORs permissive policies together, so granting platform owners a
-- parallel read is safer than rewriting each existing policy: no existing
-- expression is restated (and so cannot be mistyped into something weaker),
-- and dropping these policies cleanly reverts to today's behaviour.
-- ============================================================================

-- ---- Tenancy ---------------------------------------------------------------
drop policy if exists app_user_platform_read on app_user;
create policy app_user_platform_read on app_user
  for select using (is_platform_owner());

drop policy if exists rooftop_platform_read on rooftop;
create policy rooftop_platform_read on rooftop
  for select using (is_platform_owner());

drop policy if exists org_platform_read on org;
create policy org_platform_read on org
  for select using (is_platform_owner());

drop policy if exists membership_platform_read on membership;
create policy membership_platform_read on membership
  for select using (is_platform_owner());

drop policy if exists rooftop_product_platform_read on rooftop_product;
create policy rooftop_product_platform_read on rooftop_product
  for select using (is_platform_owner());

-- ---- Performance (the views are security_invoker, so base tables suffice) ---
drop policy if exists perf_period_platform_read on perf_period;
create policy perf_period_platform_read on perf_period
  for select using (is_platform_owner());

drop policy if exists advisor_op_metric_platform_read on advisor_op_metric;
create policy advisor_op_metric_platform_read on advisor_op_metric
  for select using (is_platform_owner());

drop policy if exists advisor_total_platform_read on advisor_period_total_src;
create policy advisor_total_platform_read on advisor_period_total_src
  for select using (is_platform_owner());

-- ---- Engagement ------------------------------------------------------------
drop policy if exists daily_activity_platform_read on daily_activity;
create policy daily_activity_platform_read on daily_activity
  for select using (is_platform_owner());

-- ---- Content (including drafts) + progress ---------------------------------
drop policy if exists content_platform_all on content;
create policy content_platform_all on content
  for all using (is_platform_owner()) with check (is_platform_owner());

drop policy if exists progress_platform_read on content_progress;
create policy progress_platform_read on content_progress
  for select using (is_platform_owner());

-- ---- Gamification ----------------------------------------------------------
-- Read-only for platform owners: the economy stays service-role-write-only
-- (0012), so nobody can mint currency through the API regardless of privilege.
drop policy if exists completion_platform_read on daily_completion;
create policy completion_platform_read on daily_completion
  for select using (is_platform_owner());

drop policy if exists swell_platform_read on swell;
create policy swell_platform_read on swell
  for select using (is_platform_owner());

drop policy if exists sand_platform_read on sand_dollar_entry;
create policy sand_platform_read on sand_dollar_entry
  for select using (is_platform_owner());

drop policy if exists user_badge_platform_read on user_badge;
create policy user_badge_platform_read on user_badge
  for select using (is_platform_owner());

-- ---- Game settings: dealer-admin (existing) OR platform owner --------------
drop policy if exists game_settings_platform_write on game_settings;
create policy game_settings_platform_write on game_settings
  for all using (is_platform_owner()) with check (is_platform_owner());

-- ============================================================================
-- Initial owners are NOT set here — that is environment data, not schema.
-- Set them from the SQL editor (auth.uid() is NULL there, so the guard allows
-- it):
--   update app_user set is_platform_owner = true where id = '<uuid>';
-- ============================================================================
