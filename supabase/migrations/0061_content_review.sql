-- ============================================================================
-- EDIAGD — 0061 The questions only Mitch can answer, in the app
--
-- WHAT THIS REPLACES: a spreadsheet round trip. Twenty-two cues are currently
-- waiting on an .xlsx in someone's Downloads folder with two tabs and a
-- "PASTE THE FULL VERSION HERE" column. That file has to be emailed, filled in,
-- emailed back, and re-imported by hand — and while it is out there, nobody can
-- see which items are still open, the answers are not attached to the rows they
-- belong to, and a second export written a week later silently disagrees with
-- the first.
--
-- The queue belongs next to the content. Mitch opens the admin area, sees what
-- needs him, fixes it in the editor he already uses, and it is live.
--
-- ---------------------------------------------------------------------------
-- WHY A TABLE AND NOT A COMPUTED VIEW
-- ---------------------------------------------------------------------------
-- Most of these flags could be derived on the fly — a body ending mid-clause is
-- visible in the row itself. Two things cannot be:
--
--   * THE CANDIDATE ANSWERS. When a cue exists twice with two different
--     endings, the choice is between two passages found in a WORKBOOK. That
--     evidence is not in the database and cannot be recomputed from it.
--   * "I LOOKED AT THIS AND IT IS FINE." A derived list has no way to record a
--     decision, so anything Mitch deliberately left alone comes straight back
--     the next time the page loads. A queue that cannot be emptied is a queue
--     people stop opening.
-- ============================================================================

-- ---- Why an item is waiting on a person ------------------------------------
create type content_review_reason as enum (
  -- The text stops mid-thought and no fuller version exists in any file we
  -- hold. Only the author can supply the rest.
  'truncated',
  -- Two versions exist, identical up to a point and then different. Not data
  -- recovery — somebody wrote two endings and only they know which is meant.
  'pick_ending',
  -- A quote with nothing explaining what it is FOR. It will still serve; the
  -- advisor just gets no coaching with it.
  'missing_nugget',
  -- Two rows carrying the same words disagreed about who said them.
  'attribution',
  -- Imported with no op code. Round two.
  'needs_op_code'
);

create type content_review_status as enum ('open', 'resolved', 'dismissed');

create table content_review (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references content(id) on delete cascade,
  reason       content_review_reason not null,
  -- Written FOR MITCH, not for a log. This is the sentence he reads.
  detail       text,
  -- Candidate answers where there are any: the shared opening and the two
  -- endings, the two voices in conflict. Shapes vary by reason, hence jsonb.
  options      jsonb,
  status       content_review_status not null default 'open',
  resolved_by  uuid references app_user(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- One open question of each kind per item. A re-run of the flagging sweep
  -- updates the detail rather than stacking a second copy of the same ask.
  unique (content_id, reason)
);

create index on content_review(status);
create index on content_review(reason);

alter table content_review enable row level security;

-- Same power as editing the content itself. Anyone who can change a cue can
-- say a cue is fine; nobody else sees this at all.
create policy content_review_admin_all on content_review
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));

-- ---- Editing the item answers the question ---------------------------------
--
-- THE QUEUE CLEARS ITSELF FOR THE TWO REASONS THAT ARE ABOUT WORDS. If Mitch
-- pastes the missing ending into a cue body, the "truncated" flag on that cue
-- is answered — by the edit, not by a second action. Making him fix the text
-- and then separately tick a box is how a queue ends up permanently showing
-- work that is already done.
--
-- Only 'truncated', 'pick_ending' and 'missing_nugget' auto-close, and only
-- when the field they are about actually changes. 'attribution' does not: an
-- attribution conflict is settled by choosing a voice, and the voice may
-- legitimately already be correct, so silence there means nothing.
create or replace function content_review_autoclose()
returns trigger language plpgsql as $$
begin
  update content_review r
     set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
   where r.content_id = new.id
     and r.status = 'open'
     and (
       (r.reason in ('truncated', 'pick_ending')
         and new.body is distinct from old.body)
       or
       (r.reason = 'missing_nugget'
         and new.coaching_nugget is distinct from old.coaching_nugget
         and coalesce(new.coaching_nugget, '') <> '')
       or
       (r.reason = 'needs_op_code'
         and new.op_code is distinct from old.op_code
         and coalesce(new.op_code, '') <> '')
     );
  return new;
end $$;

create trigger content_answers_its_review
  after update on content
  for each row execute function content_review_autoclose();
