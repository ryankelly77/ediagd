-- ============================================================================
-- EDIAGD — 0089 The 0088 trigger could not actually run
--
-- `_changed := _changed || 'question'` looks like appending a string to a text
-- array and is not. With an untyped literal on the right, Postgres resolves the
-- || operator to array || array and tries to parse 'question' AS AN ARRAY:
--
--   ERROR: 22P02 malformed array literal: "question"
--   DETAIL: Array value must start with "{" or dimension information.
--
-- So every UPDATE to quiz_question that touched the stem, an option, the hint
-- or the explanation raised an error instead of versioning it. Not a silent
-- fault — the update fails outright, which is the better of the two failure
-- modes — but the table 0088 exists to protect was, for the length of this fix,
-- a table you could not edit at all.
--
-- Caught by the acceptance test rather than by review, in a rolled-back
-- transaction, before any real edit hit it. The lesson worth writing down: 0088
-- was applied to production BEFORE its trigger was exercised. Migrations that
-- install behaviour should have that behaviour run against them in a
-- transaction first; a schema that parses is not a schema that works.
--
-- 0088 is left exactly as applied. An applied migration is a record of what the
-- database did, not a draft, and editing one makes every environment's history
-- a guess. The correction is additive, like everything else.
--
-- array_append() rather than a cast, because it cannot be misread: `|| 'x'::text`
-- also works and still looks like the thing that just broke.
-- ============================================================================

create or replace function quiz_question_keep_previous_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _changed text[] := '{}';
begin
  if new.question    is distinct from old.question    then _changed := array_append(_changed, 'question');    end if;
  if new.option_a    is distinct from old.option_a    then _changed := array_append(_changed, 'option_a');    end if;
  if new.option_b    is distinct from old.option_b    then _changed := array_append(_changed, 'option_b');    end if;
  if new.option_c    is distinct from old.option_c    then _changed := array_append(_changed, 'option_c');    end if;
  if new.option_d    is distinct from old.option_d    then _changed := array_append(_changed, 'option_d');    end if;
  if new.hint        is distinct from old.hint        then _changed := array_append(_changed, 'hint');        end if;
  if new.explanation is distinct from old.explanation then _changed := array_append(_changed, 'explanation'); end if;

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

comment on function quiz_question_keep_previous_text() is
  'SECURITY DEFINER so a write by any role — an admin''s session, the service '
  'role running the importer, a repair script — lands a version row. The '
  'trigger is the backstop; a writer that could bypass it would defeat the '
  'point. Same reasoning as content_keep_previous_text() in 0083. Fixed in 0089 '
  '— see there for why || on an untyped literal could not work.';
