-- ============================================================================
-- EDIAGD — 0119 Founding Class
--
-- The first cohort to certify, marked permanently. 0115 shipped the column and
-- said "Phase 2 sets it"; this is that, and it sets it the same way every other
-- credential state is set — DERIVED, never by hand.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS NO "MARK AS FOUNDING CLASS" BUTTON
-- ---------------------------------------------------------------------------
-- Design law 6, the same one that keeps an admin from awarding a credential. A
-- button here would make Founding Class a favour rather than a fact, and the
-- first argument about who got one would be unanswerable. It is a date and a
-- comparison: earned on or before the date, or not.
--
-- ---------------------------------------------------------------------------
-- NULL UNTIL RYAN PICKS A DATE, WHICH MARKS NOBODY
-- ---------------------------------------------------------------------------
-- Deliberately not seeded with a guess. Marking too many devalues it, and a
-- default that quietly included everybody who ever certifies would be the worst
-- possible answer. Nobody has certified yet, so nothing is lost by waiting —
-- but the first advisor certifies at some point, and the date wants choosing
-- before then rather than after.
--
-- Setting it LATER still works: the recompute compares against earned_at, which
-- does not move, so a date chosen in June correctly marks people who certified
-- in March. That is what makes this a data fix rather than a migration.
-- ============================================================================

alter table game_settings
  add column if not exists founding_class_through date;

comment on column game_settings.founding_class_through is
  'Credentials earned on or before this date are Founding Class. NULL marks '
  'nobody. Takes effect on recompute_founding_class() — see 0119.';

/**
 * THE RULE, AS ONE CALLABLE THING — the shape 0116 settled on.
 *
 * earned_at is a timestamptz and the setting is a date, so the comparison is
 * made on the DATE of earning: somebody who certified at 9pm on the cutoff is
 * in, which is what a human reading "on or before the 31st" expects. Comparing
 * the raw timestamp against midnight would silently exclude the whole last day.
 *
 * SECURITY DEFINER because it writes advisor_credential, which has no write
 * policy for any session role — see 0115. The admin screen calls it through the
 * service role; this is belt and braces for the case where it does not.
 *
 * The WHERE clause is not decoration: pg_safeupdate rejects a bare UPDATE for
 * the API roles, so a WHERE-less version applies in the migration and throws
 * for every PostgREST caller. That is the 0116 lesson, applied.
 */
create or replace function recompute_founding_class()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _through date;
begin
  select founding_class_through into _through from game_settings limit 1;

  update advisor_credential c
     set founding_class = (
           _through is not null and (c.earned_at at time zone 'UTC')::date <= _through
         )
   where c.id is not null;
end $$;

revoke all on function recompute_founding_class() from public, anon, authenticated;

-- Apply it once, so the column is consistent with the (currently null) setting.
select recompute_founding_class();

notify pgrst, 'reload schema';
