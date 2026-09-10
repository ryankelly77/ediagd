-- ============================================================================
-- EDIAGD — 0113 The last call is a kind an advisor may receive
--
-- ---------------------------------------------------------------------------
-- A BUG 0112 SHIPPED, CAUGHT BEFORE IT FIRED
-- ---------------------------------------------------------------------------
-- 0056 guards the audience with a trigger: an advisor may only be sent a kind
-- on an allowlist, because 0030 rule 2 says advisors receive wins and
-- invitations and never an inspection. The list was written when there were
-- five kinds and it names them literally.
--
-- 0112 added a sixth and did not add it to the list. The generator would have
-- raised at the first insert — and because that insert is inside
-- generate_push_outbox, the exception takes the WHOLE RUN down, not just the
-- one message. The 17:00 cron would have failed outright: no last call, and no
-- anything else either.
--
-- It was caught by `npm run preview:push`, which rolls back, and it was caught
-- on the same afternoon it would have fired. That script exists for this and
-- has now earned itself twice.
--
-- ---------------------------------------------------------------------------
-- THE RULE IS UNCHANGED; THE LIST WAS INCOMPLETE
-- ---------------------------------------------------------------------------
-- streak_last_call belongs on the allowlist for exactly the reason
-- streak_keeper does: it fires only while the Swell is ALIVE, and it names the
-- day the advisor is about to earn rather than the one they are about to lose.
-- It is an invitation with a deadline, which is still an invitation.
--
-- Adding it is not a relaxation of rule 2. A kind that reported a broken
-- streak would still be refused, and should be.
-- ============================================================================

create or replace function notification_outbox_enforce_audience()
returns trigger
language plpgsql
as $$
declare
  _role member_role;
  /*
   * Every kind an advisor may receive. Additive only, and each one has to
   * survive the same question: is this a win, or an invitation?
   *
   *   daily_numbers     the numbers are in. neutral, no verdict attached.
   *   eddies_pick       an opportunity and a word track. never a deficit.
   *   personal_best     unambiguously a win.
   *   streak_keeper     the lunchtime invitation to keep something going.
   *   streak_last_call  the same invitation, last thing before the drive
   *                     closes, naming the day they gain rather than the one
   *                     they lose. Both fire only while the streak is alive.
   */
  advisor_safe constant outbox_kind[] :=
    array[
      'daily_numbers',
      'eddies_pick',
      'personal_best',
      'streak_keeper',
      'streak_last_call'
    ]::outbox_kind[];
begin
  select m.role into _role from membership m where m.id = new.membership_id;

  if _role = 'advisor' and not (new.kind = any (advisor_safe)) then
    raise exception
      'notification_outbox: % may not be sent to an advisor. Advisors receive wins and invitations only (0030 rule 2).',
      new.kind;
  end if;

  if new.kind = 'manager_digest' and _role not in ('manager', 'admin') then
    raise exception
      'notification_outbox: manager_digest is for coaches only — a team summary sent to an advisor is a comparison.';
  end if;

  return new;
end $$;

notify pgrst, 'reload schema';
