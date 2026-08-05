-- ============================================================================
-- EDIAGD — 0017 Lifetime Sand Dollars earned
--
-- sand_dollar_balance sums EVERY ledger row, so spending pulls it down — that's
-- the spendable number. This adds the companion: the sum of positive rows only,
-- which never decreases. Balance is what you can spend; total earned is what
-- you've achieved, and only ever climbs.
--
-- Derived, never stored — same discipline as the balance view, so the two can't
-- drift from the ledger or from each other.
--
-- security_invoker is set explicitly: without it a view runs with the OWNER's
-- rights and bypasses RLS entirely, which is exactly how the performance views
-- leaked before 0006 and the balance view before 0012.
-- ============================================================================

create or replace view sand_dollar_earned as
select
  user_id,
  coalesce(sum(amount), 0) as total_earned
from sand_dollar_entry
where amount > 0
group by user_id;

alter view sand_dollar_earned set (security_invoker = on);
