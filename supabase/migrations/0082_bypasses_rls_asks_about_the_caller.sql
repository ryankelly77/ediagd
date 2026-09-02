-- ============================================================================
-- EDIAGD — 0082 bypasses_rls() has to ask about the CALLER
--
-- 0081 declared it SECURITY DEFINER, which is exactly backwards for a function
-- whose entire job is to report something about whoever is asking. Inside a
-- definer function `current_user` is the function's OWNER — postgres — and
-- postgres carries rolbypassrls. So it returned true for everybody, and the
-- three perf views it guards handed every rooftop's rows to every caller.
--
-- Caught by the verification rather than by reading: an advisor-only identity
-- came back with 16,379 attach rows across 197 operators, when the RLS change
-- in the same migration had correctly cut its base-table reads to 12 rows and
-- one operator. The policies were right and the views were wide open.
--
-- SECURITY INVOKER (the default) is what this needs. pg_roles is world-readable
-- — it is pg_authid with the password column removed — so an ordinary caller
-- can look itself up, and `current_user` is then the role that actually issued
-- the query. EXECUTE stays revoked from anon, which is why an unauthenticated
-- request gets a denial rather than an empty set.
-- ============================================================================

create or replace function bypasses_rls()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce((select r.rolbypassrls from pg_roles r where r.rolname = current_user), false)
$$;

comment on function bypasses_rls() is
  'True when the CALLER already bypasses RLS (service_role, postgres). Must not '
  'be SECURITY DEFINER: current_user inside a definer function is the owner, '
  'which made it answer true for everybody. See 0082.';

revoke all on function bypasses_rls() from public, anon;
grant execute on function bypasses_rls() to authenticated;
