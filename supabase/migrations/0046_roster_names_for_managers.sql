-- ============================================================================
-- EDIAGD — 0046 A manager may read their own team's names
--
-- The team roster rendered "Advisor 671" for a real person. app_user's RLS is
-- self-only by design — a manager cannot read teammates' names — so lib/manager
-- fell back to the operator id, and every advisor without an app account showed
-- as a number.
--
-- The DMS roster already holds the name the dealership itself uses: dms_advisor
-- carries "Helton, Erin (671)" straight from the report. It was readable only
-- to admins, which is why the manager screen could not use it.
--
-- Widened to managed_rooftops(): a manager sees the roster of the stores they
-- run, and nothing else. This is strictly narrower than it sounds — the roster
-- is a name, an operator id and the dates that person appears in the feed. It
-- carries no performance, no contact details and no account.
-- ============================================================================

drop policy if exists dms_advisor_read on dms_advisor;
create policy dms_advisor_read on dms_advisor
  for select using (
    (select is_platform_owner())
    or rooftop_id in (select admin_rooftops())
    or rooftop_id in (select managed_rooftops())
  );

notify pgrst, 'reload schema';
