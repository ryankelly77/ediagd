-- ============================================================================
-- EDIAGD — 0008 Team profile reads
-- app_user was self-only (app_user_self: id = auth.uid()), so a manager could
-- read their team's `membership` rows but not the people's names — the roster
-- fell back to "Advisor 35122".
--
-- This ADDS a permissive policy. Postgres ORs permissive policies together, so
-- app_user_self and app_user_upsert are untouched; this only widens SELECT for
-- viewers who hold manager/admin at the rooftop in question.
--
-- The role test is on the VIEWER: has_role() checks auth.uid()'s role at
-- m.rooftop_id, so a plain advisor gets an empty subquery and no extra access.
-- Uses the my_rooftops() and has_role() helpers from 0002.
-- ============================================================================

-- managers/admins can read the profiles of people at their rooftop(s)
-- (dropped first so the file is replay-safe, as in 0005)
drop policy if exists app_user_team_read on app_user;
create policy app_user_team_read on app_user
  for select using (
    id in (
      select m.user_id
      from membership m
      where m.rooftop_id in (select my_rooftops())
        and (has_role(m.rooftop_id, 'manager') or has_role(m.rooftop_id, 'admin'))
    )
  );
