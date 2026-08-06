-- ============================================================================
-- EDIAGD — 0022 "Initial credit" as its own kind
--
-- Everyone effectively starts with a Paddle Back Out day, but not by design:
-- the monthly accrual fires on the FIRST completion because
-- paddle_out_last_granted is null, so the welcome credit was indistinguishable
-- from a monthly allowance — and it didn't arrive until the user completed a
-- day, not when they signed up.
--
-- 0023 makes it an explicit grant at signup. This file only adds the enum
-- value, because Postgres refuses to use a newly added enum value inside the
-- transaction that added it and migrations run in a transaction — same split
-- as 0019/0020. Run this one first.
-- ============================================================================

alter type paddle_out_kind add value if not exists 'initial_credit';
