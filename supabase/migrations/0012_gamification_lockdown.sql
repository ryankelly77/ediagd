-- ============================================================================
-- EDIAGD — 0012 Gamification lockdown
--
-- 0011 shipped the economy with user-writable policies: any authenticated user
-- could INSERT sand_dollar_entry rows with an arbitrary amount, set their own
-- swell.current_len, and self-award badges — all from the browser with the
-- public anon key. Since sand_reason includes 'swag_purchase', that is mintable
-- currency backed by real goods.
--
-- After this migration the economy tables are READ-ONLY to end users. There is
-- no INSERT/UPDATE/DELETE policy for authenticated users on sand_dollar_entry,
-- swell, or user_badge, and with RLS enabled a table with no matching policy
-- denies the write outright.
--
-- >>> Earns are granted SERVER-SIDE ONLY. The completeDay() server action must
-- >>> use the SERVICE ROLE key (which bypasses RLS) to write these tables, and
-- >>> only after it has verified the user's daily_completion row. The service
-- >>> role key is server-only and must never appear in a NEXT_PUBLIC_* var or
-- >>> reach the client bundle.
--
-- daily_completion stays user-writable but INSERT-only: recording "I did the
-- loop" is the user's action and grants no currency by itself, and dropping
-- UPDATE/DELETE means a completion cannot be rewritten after the fact.
--
-- Every statement is guarded so this file is replay-safe and applies cleanly
-- whether or not 0011's policies exist.
-- ============================================================================

-- ---- 1. Sand Dollars ledger: read your own, write nothing ------------------
drop policy if exists sand_self_write on sand_dollar_entry;   -- was: any amount, any reason
drop policy if exists sand_self_read  on sand_dollar_entry;
create policy sand_self_read on sand_dollar_entry
  for select using (user_id = auth.uid());
-- No write policy by design — see the service-role note above.

-- ---- 2. Swell (streaks): read your own; managers/admins read their team ----
drop policy if exists swell_self_all on swell;                -- was: set your own streak
drop policy if exists swell_self_read on swell;
create policy swell_self_read on swell
  for select using (user_id = auth.uid());
-- swell_team_read from 0011 is left intact (manager/admin visibility).

-- ---- 3. Badges: read your own, award nothing -------------------------------
drop policy if exists user_badge_self_write on user_badge;    -- was: self-award any badge
drop policy if exists user_badge_self_read  on user_badge;
create policy user_badge_self_read on user_badge
  for select using (user_id = auth.uid());

-- ---- 4. Daily completion: INSERT-only for the owner ------------------------
-- Replaces the FOR ALL policy so a completion can be created but never edited
-- or deleted by the user it belongs to.
drop policy if exists completion_self_write on daily_completion;
drop policy if exists completion_self_insert on daily_completion;
create policy completion_self_insert on daily_completion
  for insert with check (user_id = auth.uid());
-- completion_team_read from 0011 still covers SELECT (self + manager/admin).

-- ---- 5. Views must respect the caller's RLS --------------------------------
-- Postgres views run with the OWNER's rights by default, which is how the
-- performance views leaked before 0006. Same defect, two more views:
--   * sand_dollar_balance (0011) — every user's balance
--   * user_engagement     (0009) — every rooftop's engagement
alter view sand_dollar_balance set (security_invoker = on);
alter view user_engagement     set (security_invoker = on);
