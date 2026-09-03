-- ============================================================================
-- EDIAGD — 0088 A quiz question's words survive being replaced
--
-- 0083 gave `content` a text history and stated the reason in one line: the
-- obvious fix is "make the writers save a version first", and that is the fix
-- that works until the third writer. quiz_question just got its second — the
-- Master Quiz Bank importer in 0087 — and it has no history at all.
--
-- The exposure is concrete rather than theoretical. import-quiz-bank.ts matches
-- on Mitch's EQ id and updates in place, so a re-run whose workbook has edited
-- wording overwrites the previous wording with nothing kept. That is exactly
-- the shape of the incident that truncated 15 cue bodies during the knowledge
-- import — and those were recoverable ONLY because 0083's trigger had landed an
-- hour earlier. This table is the same insurance for the same failure.
--
-- A third writer is already visible: quiz questions have no admin surface yet,
-- and when one is built it will edit these rows in place like every other
-- screen in the app.
--
-- ---------------------------------------------------------------------------
-- SAME SHAPE AS 0083, WITH ONE DELIBERATE DIFFERENCE
-- ---------------------------------------------------------------------------
-- BEFORE UPDATE trigger, IS DISTINCT FROM on the text columns only, per-row
-- seq assigned from what is already stored, SECURITY DEFINER so no role can
-- write around it. All of that is 0083 verbatim.
--
-- What differs: 0083 has one boolean per column because it guards three
-- columns. This guards seven, and seven booleans is a column list that has to
-- grow every time a question gains a field. `changed_fields text[]` answers the
-- same question — which of them actually moved, so a reader can tell an option
-- fix from a rewritten stem without diffing — and keeps answering it when an
-- eighth field arrives.
--
-- NOT VERSIONED, ON PURPOSE: correct, question_type, deck, film, stage,
-- op_code, shared_pool, status, volume. Those are classification and workflow.
-- Publishing a question, re-filing it under a stage, or resolving its op code
-- must not manufacture a text version — the same reason 0083 ignores tagging
-- and Mux ids. `correct` is the sharpest call of these: it is the answer key,
-- not the words, and a changed key with unchanged text is a correction to
-- record elsewhere rather than a lost draft to recover.
-- ============================================================================

create table if not exists quiz_question_text_version (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_question(id) on delete cascade,
  /* Per question, 1-based, oldest first. Assigned by the trigger from the count
     already stored, so the numbers a person reads are stable. */
  seq         int  not null,
  /* The values as they were BEFORE the update that displaced them. */
  question    text,
  option_a    text,
  option_b    text,
  option_c    text,
  option_d    text,
  hint        text,
  explanation text,
  /* Which of the seven actually moved. See the note above on why this is an
     array here and seven booleans in 0083. */
  changed_fields text[] not null default '{}',
  changed_at  timestamptz not null default now(),
  /* NULL for the importer and anything else running as the service role —
     auth.uid() is null there, and recording a fabricated author would be worse
     than recording none. Same call as 0083. */
  changed_by  uuid references app_user(id),
  unique (question_id, seq)
);

create index if not exists quiz_question_text_version_q_idx
  on quiz_question_text_version(question_id, seq desc);

alter table quiz_question_text_version enable row level security;

/*
 * ADMINS ONLY, MIRRORING quiz_question ITSELF (0035).
 *
 * This table holds previous `question` and previous options, which is most of
 * what the live row holds. A read policy looser than the base table's would
 * hand an advisor the question bank through the back door — and while it does
 * NOT carry `correct`, serving the stem and all four options to somebody about
 * to be tested on them is its own leak.
 */
drop policy if exists quiz_question_text_version_admin on quiz_question_text_version;
create policy quiz_question_text_version_admin on quiz_question_text_version
  for all
  using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  )
  with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );

comment on table quiz_question_text_version is
  'The previous wording of a quiz question. Written by a BEFORE UPDATE trigger '
  'on quiz_question whenever the stem, an option, the hint or the explanation '
  'actually change, so no writer can skip it. See 0088.';


create or replace function quiz_question_keep_previous_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _changed text[] := '{}';
begin
  if new.question    is distinct from old.question    then _changed := _changed || 'question';    end if;
  if new.option_a    is distinct from old.option_a    then _changed := _changed || 'option_a';    end if;
  if new.option_b    is distinct from old.option_b    then _changed := _changed || 'option_b';    end if;
  if new.option_c    is distinct from old.option_c    then _changed := _changed || 'option_c';    end if;
  if new.option_d    is distinct from old.option_d    then _changed := _changed || 'option_d';    end if;
  if new.hint        is distinct from old.hint        then _changed := _changed || 'hint';        end if;
  if new.explanation is distinct from old.explanation then _changed := _changed || 'explanation'; end if;

  if array_length(_changed, 1) is null then
    return new;
  end if;

  insert into quiz_question_text_version (
    question_id, seq, question, option_a, option_b, option_c, option_d,
    hint, explanation, changed_fields, changed_by)
  values (
    old.id,
    coalesce((select max(v.seq) from quiz_question_text_version v
               where v.question_id = old.id), 0) + 1,
    old.question, old.option_a, old.option_b, old.option_c, old.option_d,
    old.hint, old.explanation,
    _changed,
    auth.uid()
  );

  return new;
end $$;

drop trigger if exists quiz_question_keeps_its_words on quiz_question;
create trigger quiz_question_keeps_its_words
  before update on quiz_question
  for each row execute function quiz_question_keep_previous_text();

comment on function quiz_question_keep_previous_text() is
  'SECURITY DEFINER so a write by any role — an admin''s session, the service '
  'role running the importer, a repair script — lands a version row. The '
  'trigger is the backstop; a writer that could bypass it would defeat the '
  'point. Same reasoning as content_keep_previous_text() in 0083.';
