-- ============================================================================
-- EDIAGD — 0099 Island Time gets a budget
--
-- WHAT IT WAS BEFORE THIS
-- Unlimited. 0025 caps a single range at 60 days and how far ahead you can plan
-- at a year, and that is the whole of it — nothing capped how MANY ranges an
-- advisor booked. Days inside a range are invisible to the Swell: they are not
-- missed days and they cost no Paddle Back Out. So an advisor could book every
-- week they did not feel like turning up and hold a 365-Day Swell without ever
-- completing a day. Not a loophole somebody found; one nobody had closed.
--
-- WHY THE CAP IS IN game_settings AND NOT A CONSTANT
-- Every other number the engine reads lives here and Mitch edits it without a
-- deploy. This one is a policy about time off at a dealership, which is exactly
-- the kind of number he will want to change once and never think about again.
--
-- 15 IS A PLACEHOLDER, PENDING HIS RULING. It is roughly three working weeks,
-- which is a plausible amount of planned absence for a service advisor and is
-- not defended beyond that. The field is on the Gamification Settings screen in
-- the same commit so changing it is a text box, not a migration.
--
-- WORKING DAYS, NOT CALENDAR DAYS. The count is done in the app, over the days
-- of a range that fall on the advisor's own scheduled work days — a Saturday
-- inside a booked fortnight costs a Mon–Fri advisor nothing, because it was
-- never a day they owed us. See lib/island-budget.ts. It cannot be done in SQL
-- against this column alone, which is why the column is only the number.
--
-- EXISTING RANGES ARE NOT TOUCHED. They were booked under no rule at all and
-- retroactively refusing them would be changing the terms after the fact. They
-- do count against the year's budget for anything booked NEXT, which is the
-- honest middle: what is already on the books stands, and the budget starts
-- being enforced from here.
-- ============================================================================

alter table game_settings
  add column if not exists island_time_days_per_year int not null default 15;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_settings_island_days_sane'
  ) then
    alter table game_settings
      add constraint game_settings_island_days_sane
      check (island_time_days_per_year between 0 and 365);
  end if;
end $$;

comment on column game_settings.island_time_days_per_year is
  'Scheduled WORK days of Island Time an advisor may book per calendar year. Counted in lib/island-budget.ts against their own work schedule — a day off inside a range does not spend the budget. 0 disables Island Time entirely.';
