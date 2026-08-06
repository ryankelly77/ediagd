-- ============================================================================
-- EDIAGD — 0019 A reason of its own for Paddle Back Out purchases
--
-- 'adjustment' was doing two unrelated jobs: buying a Paddle Back Out day, and
-- a manual admin correction. The ledger showed both as "Adjustment", which
-- tells an advisor nothing about where 500 Sand Dollars went. Splitting them
-- makes BOTH labels honest — 'adjustment' now means only what it says.
--
-- Nothing else needs changing: no policy or view in 0011/0012/0017 enumerates
-- sand_reason, and sand_dollar_earned filters on amount > 0, so a new spend
-- reason cannot affect the balance or lifetime-earned numbers.
--
-- >>> This file adds the enum value and NOTHING ELSE, on purpose. Postgres
-- >>> refuses to use a newly added enum value inside the same transaction that
-- >>> added it ("unsafe use of new value of enum type"), and migrations run in
-- >>> a transaction. The backfill that writes the new value therefore has to
-- >>> land in a separate transaction — see 0020. Run this one first.
-- ============================================================================

alter type sand_reason add value if not exists 'paddle_out_purchase';
