-- =============================================================================
-- entitlement parity — the two copies of the rule must still agree
-- =============================================================================
--
-- 0177 put the entitlement predicate in one place and pointed both the RLS
-- policy and advisor_family_film_progress at it. That construction was correct
-- and it cost 5x on every read of `content`: inside an RLS qual the inline
-- EXISTS is compiled into the plan's InitPlan/hashed-SubPlan machinery and
-- evaluated once, while any function wrapper is executed per row. Measured on
-- production: the shelf's content read 4.56 ms -> 20.44 ms, the whole catalog
-- as an advisor 237.6 ms -> 1245.0 ms, with a flat control and identical row
-- counts. A second remedy that hoisted it to one call per query measured WORSE
-- (1522 ms), so the inline form is not merely faster, it is the only fast form.
--
-- So 0178 puts the policy back inline and keeps the function for the card. Two
-- copies of one rule, which is a thing this codebase has been burned by often
-- enough to know that a comment on each is not a safeguard:
--
--     "a check that is silent by default is not a check"
--     "a defect you find is a class, not an instance"
--
-- THIS IS THE CHECK. It does not read either copy's source. It compares what
-- the POLICY actually lets an advisor read against what content_entitled_for
-- actually returns, for every advisor on the database and every value of the
-- content_type enum, and exits non-zero on any difference.
--
-- -----------------------------------------------------------------------------
-- WHY IT SWITCHES ROLE, AND WHY THAT PUTS IT HERE RATHER THAN IN A MIGRATION
-- -----------------------------------------------------------------------------
-- The observed side cannot be measured as `postgres`, which has BYPASSRLS: the
-- policy would never run and every count would come back complete. Setting
-- `request.jwt.claims` alone is not enough either — it moves auth.uid() and
-- leaves the bypass in place. The only way to observe a policy is to be a role
-- it applies to, so this does `set local role authenticated` per advisor with
-- that advisor's own claims, which is a session-level act and not a schema
-- change. Putting a copy of this logic in the migration as well would create
-- precisely the second definition the whole exercise is about.
--
-- Everything runs inside ONE transaction that always rolls back. It writes
-- nothing, ever, and `set local` is reverted with the transaction.
--
-- -----------------------------------------------------------------------------
-- THE EXPECTED SIDE NAMES EVERY ARM, INCLUDING THE ONES THAT ARE NOT THE POINT
-- -----------------------------------------------------------------------------
-- A read is the OR of all three permissive policies on `content`, so comparing
-- the entitled arm against a raw read would flag every admin as a mismatch —
-- and the fix for that must not be "exclude admins", because excluding the
-- inconvenient rows is how a check ends up measuring a population it does not
-- name. All three arms are computed instead:
--
--   content_platform_all   is_platform_owner      -> every row, any status
--   content_admin_all      active admin membership -> every row, any status
--   content_entitled_read  published AND content_entitled_for(uid, type)
--
-- so an admin who is also an advisor is checked rather than skipped, against
-- the wider answer the policy is correct to give them.
--
-- -----------------------------------------------------------------------------
-- AND IT CANNOT PASS BY CHECKING NOTHING
-- -----------------------------------------------------------------------------
-- Two ways this would otherwise be green while measuring nothing, both of which
-- have happened in this repo:
--
--   an empty population    no advisors -> nothing compared -> "parity holds".
--                          Refused: zero advisors is a failure, not a pass.
--   a policy that refuses  if `content` returned nothing for everybody, every
--     everything           expected-0 row would match. Refused: at least one
--                          advisor must observe a non-zero count.
--
-- The type list is read from `enum_range(null::content_type)` rather than
-- written out, so a seventh content type is included the day it is added
-- instead of being silently outside the check's watched set.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off
\pset pager off

begin;

/* \ir, not \i: include-relative resolves against THIS file's directory, so the
   check works whatever the caller's working directory is. db:migrate runs from
   the repo root and the npm wrapper from wherever the user happens to be. */
\ir entitlement-parity.body.sql

rollback;
