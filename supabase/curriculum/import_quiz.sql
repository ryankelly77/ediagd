-- ============================================================================
-- EDIAGD — import the authored quiz questions
--
--   python3 scripts/build-quiz-tsv.py
--   psql "$DATABASE_URL" -f supabase/curriculum/import_quiz.sql   (from repo root)
--
-- These are the hand-authored Walk-Around questions — the quality standard the
-- AI generator is measured against. They import as status = 'published' and
-- source = 'authored': authored questions are trusted, generated ones are not
-- and land as drafts.
--
-- WHERE A MISSED QUESTION SENDS YOU. quiz_seed.csv names the cue each question
-- was drawn from, and this resolves that title to a content id in
-- quiz_question.content_id. That column is what turns the fail screen's "have
-- another look through this module's cues" from a sentence into a link to the
-- exact card.
--
-- THE TITLE IS RESOLVED HERE, NOT CARRIED AS TEXT. A stored title would drift
-- the moment Mitch edits a cue, and would then point at nothing while still
-- looking correct. A foreign key either resolves or is reported below.
--
-- Idempotent on (module, question text): re-running edits nothing and
-- duplicates nothing — and it BACK-FILLS content_id on questions that were
-- imported before this column was populated, which is the whole point of
-- running it again.
-- ============================================================================

begin;

create temp table _quiz (
  course text, module text, question text,
  option_a text, option_b text, option_c text, option_d text,
  answer text, explanation text, sort_order int,
  source_cue_title text
) on commit drop;

\copy _quiz from 'supabase/curriculum/quiz.tsv'

-- ---- Resolve the module, and the cue within it -------------------------------
-- The cue lookup is a scalar subquery rather than a join so that two cues
-- sharing a title cannot silently multiply the question set. Ambiguity is
-- counted separately and reported.
--
-- TWO STAGES, because the authored titles are shortened by hand. Measured on
-- the real seed, exact matching resolved 24 of 28; every one of the four
-- misses was a PREFIX of the real cue — "Print a Tire Quote for Every
-- Customer" against "Print a Tire Quote for Every Customer — Even Green
-- Tires". So an exact match is tried first and a prefix match second.
--
-- Prefix matching is anchored at the START and never reversed: a cue title is
-- allowed to be longer than what the author wrote down, but the author's text
-- must be the opening of it. A contains-match would let "Balance" land on
-- "Road Force Balance", which is a different cue and a wrong destination —
-- and a wrong link here is worse than no link, because the advisor re-reads
-- the wrong material and still fails.
--
-- Which stage matched is recorded, so an approximate hit is visible in the
-- report rather than passing as an exact one.

create temp table _resolved on commit drop as
select
  q.*,
  m.id as module_id,
  coalesce(
    (select ct.id from content ct
      where ct.module_id = m.id
        and lower(btrim(ct.title)) = lower(btrim(q.source_cue_title))
      order by ct.module_order nulls last, ct.created_at
      limit 1),
    (select ct.id from content ct
      where ct.module_id = m.id
        and lower(btrim(ct.title)) like lower(btrim(q.source_cue_title)) || '%'
      order by ct.module_order nulls last, ct.created_at
      limit 1)
  ) as source_content_id,
  case
    when exists (select 1 from content ct
                  where ct.module_id = m.id
                    and lower(btrim(ct.title)) = lower(btrim(q.source_cue_title)))
      then 'exact'
    when exists (select 1 from content ct
                  where ct.module_id = m.id
                    and lower(btrim(ct.title)) like lower(btrim(q.source_cue_title)) || '%')
      then 'prefix'
    else 'none'
  end as match_kind,
  (select count(*) from content ct
    where ct.module_id = m.id
      and lower(btrim(ct.title)) like lower(btrim(q.source_cue_title)) || '%') as title_matches
from _quiz q
join course c on c.name = q.course
join module m on m.course_id = c.id and m.name = q.module;

-- ---- New questions -----------------------------------------------------------

insert into quiz_question
  (module_id, question, option_a, option_b, option_c, option_d, correct,
   explanation, sort_order, status, source, content_id)
select r.module_id, r.question, r.option_a, r.option_b, r.option_c, r.option_d,
       r.answer, r.explanation, r.sort_order, 'published', 'authored',
       r.source_content_id
from _resolved r
where not exists (
  select 1 from quiz_question x
   where x.module_id = r.module_id and x.question = r.question
);

-- ---- Back-fill the ones already there ----------------------------------------
-- Only writes where the resolved value actually differs, so a re-run reports an
-- honest zero rather than touching every row every time.

update quiz_question x
   set content_id = r.source_content_id
  from _resolved r
 where x.module_id = r.module_id
   and x.question  = r.question
   and r.source_content_id is not null
   and x.content_id is distinct from r.source_content_id;


-- ============================ QUIZ IMPORT REPORT =============================

\echo ''
\echo '================ QUIZ IMPORT ================'
select
  (select count(*) from _quiz)                                   as csv_questions,
  (select count(*) from quiz_question)                           as total_in_db,
  (select count(*) from quiz_question where status='published')  as published,
  (select count(distinct module_id) from quiz_question)          as modules_with_a_quiz,
  (select count(*) from quiz_question where content_id is not null) as with_source_cue,
  (select count(*) from quiz_question where content_id is null)     as without_source_cue;

\echo ''
\echo '-- source-cue resolution rate for THIS import --'
select
  count(*)                                              as rows_in_csv,
  count(*) filter (where match_kind = 'exact')          as resolved_exact,
  count(*) filter (where match_kind = 'prefix')         as resolved_by_prefix,
  count(*) filter (where source_content_id is null)     as unresolved,
  round(100.0 * count(*) filter (where source_content_id is not null)
        / nullif(count(*), 0))::int                     as resolved_pct
from _resolved;

\echo ''
\echo '-- resolved by PREFIX, not exactly: check these point at the intended cue --'
select r.module, left(r.source_cue_title, 44) as csv_title, left(ct.title, 56) as cue_title
from _resolved r
join content ct on ct.id = r.source_content_id
where r.match_kind = 'prefix'
order by r.module;

\echo ''
\echo '-- questions whose source cue did NOT resolve (these fall back to the deck start) --'
select r.course, r.module, left(r.question, 50) as question,
       left(r.source_cue_title, 50) as source_cue_title
from _resolved r
where r.source_content_id is null
order by r.course, r.module;

\echo ''
\echo '-- source cue titles matching MORE THAN ONE cue in the module (first one wins) --'
select r.module, left(r.source_cue_title, 60) as source_cue_title, r.title_matches
from _resolved r
where r.title_matches > 1
group by r.module, r.source_cue_title, r.title_matches
order by r.title_matches desc;

\echo ''
\echo '-- questions whose MODULE could not be matched (not imported at all) --'
select q.course, q.module, left(q.question, 60) as question
from _quiz q
where not exists (
  select 1 from course c join module m on m.course_id = c.id
   where c.name = q.course and m.name = q.module
);

commit;
