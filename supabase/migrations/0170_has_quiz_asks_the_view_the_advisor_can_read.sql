-- ============================================================================
-- EDIAGD — 0170 has_quiz asks the object the advisor is allowed to read
--
-- ---------------------------------------------------------------------------
-- THE DEFECT, AND IT IS THIS FILE'S OWN NAMED PATTERN
-- ---------------------------------------------------------------------------
-- `my_module_progress` is security_invoker = on, so every subquery in it runs
-- as the signed-in advisor. `has_quiz` asked `quiz_question` — which 0035 made
-- ADMIN-ONLY ON PURPOSE, because RLS filters rows and not columns and a read
-- policy there would hand the client `correct` along with the question.
--
-- The policy is right. The reader was wrong. For every advisor, on every
-- module, `has_quiz` has always been FALSE:
--
--     as the service role : 112 published questions across 33 modules
--     as an advisor       : 0 rows from quiz_question,
--                           0 rows from my_module_progress where has_quiz
--
-- 0035 already built the object an advisor IS meant to read — the definer view
-- `quiz_question_public`, granted to `authenticated`, which cannot leak the key
-- because it does not select it. Measured as an advisor: 112 rows, 33 modules.
-- Exactly the service role's answer. Nothing read it.
--
-- ---------------------------------------------------------------------------
-- WHAT A FALSE has_quiz COST, AND IT IS NOT COSMETIC
-- ---------------------------------------------------------------------------
-- Four surfaces branch on it, and all four were wrong in the same direction —
-- the direction that looks like nothing is wrong:
--
--   THE TRACK ROW          `items_done && has_quiz && !quiz_passed` is the
--                          quiz_waiting state. It never fired. A lesson whose
--                          film was watched read "Lesson", which is the
--                          not-started copy.
--   THE CERTS TILE         pendingQuizzes() filters `has_quiz = true`, so it
--                          returned [] for every advisor, always. The tile said
--                          "Next: <lesson name>" over a finished lesson.
--   THE MORNING LOOP       the same empty list, so the quiz link on the
--                          celebration screen has never once appeared.
--   THE QUIZ ROUTE         `if (!mod.hasQuiz) notFound()`. Every quiz 404'd for
--                          every advisor. The two accounts in production that
--                          have ever passed one are both ADMINS.
--
-- So a module with a quiz was unfinishable, and nothing said why.
-- moduleRequirementsMet() runs as the service role, sees the quiz, and refuses
-- to write module_completion — correctly. A correct refusal with no visible
-- reason, which this file's standing rules call worse than a crash.
--
-- Valerie Patterson's Walk Around is six of these: film done, four published
-- questions, no attempt possible. Nine of fourteen advisors hold 22 between
-- them.
--
-- ---------------------------------------------------------------------------
-- WHAT IS NOT CHANGED
-- ---------------------------------------------------------------------------
-- NOT what completes a lesson. The authority is moduleRequirementsMet() on the
-- service role (lib/lms.ts) — films done, and the quiz passed where one exists
-- — and it is untouched. No module becomes completable on easier terms and
-- nothing already complete is revoked. What changes is that the advisor can now
-- SEE the quiz and REACH it, which is the rule as it was always written.
--
-- NOT the admin-only policy on quiz_question. It stays exactly as 0035 left it.
-- ============================================================================

-- CREATE OR REPLACE, not drop-and-create: `my_course_progress` and
-- `my_certification_progress` are built on this view, and a drop would cascade
-- them away. The column list, order and types are identical to 0160's, which is
-- what lets replace work at all.
create or replace view my_module_progress as
  select m.id                                   as module_id,
         m.course_id,
         m.name                                 as module_name,
         co.name                                as course_name,
         co.track                               as course_track,
         m.name_status,
         m.sort_order,
         /* THE GATING COUNTS — what "0 of N" means. Unchanged from 0160. */
         count(c.id) filter (where c.type = any (gating_content_types()))::integer
           as total_items,
         count(cp.content_id) filter (where c.type = any (gating_content_types()))::integer
           as completed_items,
         /* THE POPULATION COUNTS — what the screen may list. Unchanged. */
         count(c.id)::integer                   as all_items,
         count(c.id) filter (where not (c.type = any (gating_content_types())))::integer
           as cue_items,
         /* Unchanged from 0143, and still the one definition of the gate. */
         count(c.id) filter (where c.type = any (gating_content_types())) > 0
           and count(c.id) filter (where c.type = any (gating_content_types()))
             = count(cp.content_id) filter (where c.type = any (gating_content_types()))
           as items_done,
         /*
          * ---- THE ONE CHANGE IN THIS MIGRATION ----------------------------
          *
          * quiz_question_public, not quiz_question. This view is
          * security_invoker = on, so this subquery runs as the ADVISOR, and an
          * advisor has no read policy on quiz_question by design — so the old
          * EXISTS was false for every one of them, forever.
          *
          * NO status FILTER, and that is not an omission: quiz_question_public
          * already selects only `status = 'published'`. Carrying a second copy
          * of the predicate here is how the two come to disagree on the day one
          * of them is edited — and the column is not exposed to filter on.
          */
         (exists (select 1 from quiz_question_public q
                   where q.module_id = m.id))                  as has_quiz,
         (exists (select 1 from quiz_attempt a
                   where a.module_id = m.id and a.user_id = (select auth.uid()) and a.passed)) as quiz_passed,
         (select mc.completed_at from module_completion mc
           where mc.module_id = m.id and mc.user_id = (select auth.uid())) as completed_at,
         max(cp.completed_at)                   as last_activity
    from module m
    join course co on co.id = m.course_id
    left join content c
      on c.module_id = m.id and c.status = 'published'::public.content_status
    left join content_progress cp
      on cp.content_id = c.id and cp.user_id = (select auth.uid())
     and cp.completed_at is not null
   group by m.id, m.course_id, m.name, co.name, co.track, m.name_status, m.sort_order;

alter view my_module_progress set (security_invoker = on);

comment on view my_module_progress is
  'Per-module progress for the signed-in advisor. total_items/completed_items '
  'count GATING items only (0160). has_quiz reads quiz_question_public (0170) '
  'because this view is security_invoker and quiz_question is admin-only by '
  'design — asking the table made has_quiz false for every advisor and 404''d '
  'every quiz. The completion rule itself lives in moduleRequirementsMet() on '
  'the service role and is not expressed here.';
