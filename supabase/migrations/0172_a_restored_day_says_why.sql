-- ============================================================================
-- EDIAGD — 0172 a restored day says why, in the row
--
-- ---------------------------------------------------------------------------
-- THE RULE THIS OBEYS
-- ---------------------------------------------------------------------------
-- "A hold that leaves no trace when it is overridden is not a hold." 0134 added
-- content.retired_reason for exactly this: fourteen retires had happened and
-- eleven of their reasons lived only in migration comments, so afterwards a
-- considered retire and an accidental one were indistinguishable.
--
-- A RESTORED DAY IS THE SAME SHAPE, pointing the other way. It is a completion
-- that no advisor's own act produced — the loop refused their morning over our
-- defect and an operator put the day back. Without a column, that row is
-- indistinguishable from a day somebody actually finished in the app: the
-- streak counts it, the Rollcall counts it, the credential accrues from it, and
-- nothing anywhere says a person decided it.
--
-- So the sentence goes in the row, not in the script's console output and not in
-- the commit that ran it. `restored_reason` is NOT NULL-able-and-ignored: a
-- restore with no reason is refused by the script, because a reason nobody
-- recorded is the thing that survives.
-- ============================================================================

alter table daily_completion add column if not exists restored_reason text;
alter table daily_completion add column if not exists restored_at timestamptz;

comment on column daily_completion.restored_reason is
  'Why an operator put this day back, in their words. NULL for every day an '
  'advisor finished in the app — which is almost all of them — so `is not null` '
  'is how a reader tells a restored day from a lived one. Written only by '
  '`npm run restore:day`, which refuses without a reason.';

comment on column daily_completion.restored_at is
  'When the restore ran. Distinct from created_at, which is also the restore''s '
  'own insert time: these two agree on a restored row and created_at alone '
  'cannot tell you the day was not lived. Keeping both means a restore is '
  'legible from the row rather than by comparing it to completion_date.';

-- A reason without a time, or a time without a reason, is half a record.
alter table daily_completion
  drop constraint if exists daily_completion_restore_is_whole;
alter table daily_completion
  add constraint daily_completion_restore_is_whole
  check (
    (restored_reason is null and restored_at is null)
    or (restored_reason is not null and restored_at is not null
        and char_length(btrim(restored_reason)) >= 10)
  );

-- The index a reader actually wants: show me every day somebody put back.
-- PARTIAL, because the column is null for every ordinary completion and an
-- index over 3,000 nulls to find a handful of rows is a page nobody reads.
create index if not exists daily_completion_restored_idx
  on daily_completion (restored_at desc)
  where restored_reason is not null;
