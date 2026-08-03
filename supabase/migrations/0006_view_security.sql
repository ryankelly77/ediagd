-- ============================================================================
-- EDIAGD — 0006 View security
-- Postgres views run with the VIEW OWNER's rights by default, so the 0003/0005
-- performance views bypassed RLS entirely: an anon request to
-- /rest/v1/advisor_period_totals returned every rooftop's advisors.
--
-- security_invoker = on makes each view evaluate the *querying* user's RLS
-- against the base tables (advisor_period_total_src, advisor_op_metric), so a
-- member sees only their own rooftop and an anon user sees nothing.
--
-- Runs after 0005, which redefined advisor_period_totals and
-- advisor_family_attach. CREATE OR REPLACE VIEW preserves these options, but a
-- DROP + CREATE does NOT — any future migration that recreates one of these
-- views must re-apply security_invoker.
--
-- Store average/best stay correct: the RLS policies scope to the whole rooftop
-- (rooftop_id in my_rooftops()), not to a single advisor, so an advisor can
-- still see their teammates' rows to compute the benchmark.
-- ============================================================================

alter view advisor_period_totals  set (security_invoker = on);
alter view advisor_family_attach  set (security_invoker = on);
alter view family_store_benchmark set (security_invoker = on);
