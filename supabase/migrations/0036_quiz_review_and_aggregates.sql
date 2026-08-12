-- ============================================================================
-- EDIAGD — 0036 Where a miss sends you, and what a manager may see
--
-- TWO POLICY DECISIONS, both enforced in the database rather than in a screen.
--
-- 1. A FAILED ANSWER SENDS YOU TO THE CUE, NOT TO THE ANSWER. quiz_question
--    gains a nullable content_id: the cue this question was written from. On a
--    fail the advisor is told WHICH questions they missed and pointed at the
--    material — "Have another look at 'Balance — The Texas Rain Safety Close'".
--    Never the correct option, never the explanation. A letter is memorisable
--    and shareable; "go re-read this cue" is neither, and it is the thing that
--    actually teaches.
--
-- 2. A MANAGER SEES PATTERNS, NEVER A REPORT CARD. team_quiz_difficulty
--    aggregates misses per QUESTION across a manager's team and deliberately
--    cannot be resolved to a person. Same line already drawn keeping Sand
--    Dollars and badges off the admin card: an advisor whose wrong answers are
--    itemised to their boss stops treating the library as a safe place to be
--    wrong, and then the quiz stops measuring comprehension and starts
--    measuring willingness to be seen failing.
--
--    The k-anonymity floor below is the part that makes that real. A manager
--    with two advisors would otherwise read "1 of 2 missed this" and know
--    exactly who — an aggregate of a small enough group IS an answer sheet.
-- ============================================================================

-- ---- 1. Which cue a question came from --------------------------------------
-- Nullable: the 28 authored Walk-Around questions were written against a module
-- as a whole, not a single cue, and pretending otherwise would send people to
-- an arbitrary one. Null means "point at the module".

alter table quiz_question
  add column if not exists content_id uuid references content(id) on delete set null;

comment on column quiz_question.content_id is
  'The cue this question was written from. Null -> the review link points at the module.';


-- ---- 2. Fewer than this many respondents and the row is withheld -----------

alter table game_settings
  add column if not exists quiz_aggregate_min_respondents int not null default 3;


-- ---- 3. What a manager may read ---------------------------------------------

/**
 * Miss rates per question, for the people a manager actually coaches.
 *
 * Scoped through managed_users() (0027), so a manager sees their own team and
 * nobody else's. Rows below the respondent floor are dropped entirely rather
 * than shown with a small number — a suppressed row and a zero row must not be
 * distinguishable, or the suppression leaks what it was hiding.
 *
 * There is no user_id anywhere in this view, and there is no companion view
 * that adds one. That is the design, not an omission.
 *
 * SECURITY DEFINER, deliberately, and for the same reason quiz_question_public
 * is: the caller must NOT be able to read the base table. quiz_attempt allows
 * a user to read only their OWN attempts, so an invoker view here returns
 * nothing at all to a manager — which is what the first version of this did.
 * The scoping that matters is inside the view: managed_users() still resolves
 * against auth.uid(), so a definer view narrows to the caller's team rather
 * than opening the table.
 */
create or replace view team_quiz_difficulty as
select
  q.module_id,
  m.name                                             as module_name,
  c.id                                               as course_id,
  c.name                                             as course_name,
  q.id                                               as question_id,
  q.question,
  count(distinct a.user_id)::int                     as respondents,
  count(*)::int                                      as attempts,
  count(*) filter (
    where coalesce(a.answers ->> q.id::text, '') <> q.correct
  )::int                                             as missed,
  round(
    100.0 * count(*) filter (
      where coalesce(a.answers ->> q.id::text, '') <> q.correct
    ) / nullif(count(*), 0)
  )::int                                             as miss_pct
from quiz_question q
join module m on m.id = q.module_id
join course c on c.id = m.course_id
join quiz_attempt a on a.module_id = q.module_id
cross join game_settings s
where q.status = 'published'
  and a.user_id in (select managed_users())
group by q.module_id, m.name, c.id, c.name, q.id, q.question,
         s.quiz_aggregate_min_respondents
having count(distinct a.user_id) >= min(s.quiz_aggregate_min_respondents);

alter view team_quiz_difficulty set (security_invoker = off);
grant select on team_quiz_difficulty to authenticated;


/**
 * The same signal, network-wide, for the impact screen.
 *
 * "Modules where comprehension is low" is content feedback: if four fifths of
 * everyone misses the same question, the likeliest explanation is the cue, not
 * four fifths of the advisors. Scoped to admin_rooftops() so a dealer admin
 * sees their group and the platform owner sees the network.
 */
create or replace view admin_module_comprehension as
select
  m.id                                               as module_id,
  m.name                                             as module_name,
  c.name                                             as course_name,
  c.track,
  count(distinct a.user_id)::int                     as advisors,
  count(*)::int                                      as attempts,
  count(*) filter (where a.passed)::int              as passes,
  round(avg(a.score_pct))::int                       as mean_score,
  round(100.0 * count(*) filter (where a.passed) / nullif(count(*), 0))::int as pass_rate
from module m
join course c on c.id = m.course_id
join quiz_attempt a on a.module_id = m.id
join membership mem
  on mem.user_id = a.user_id
 and mem.rooftop_id in (select admin_rooftops())
group by m.id, m.name, c.name, c.track
having count(distinct a.user_id) >= 3;

-- Definer for the same reason, scoped by admin_rooftops() inside the view.
alter view admin_module_comprehension set (security_invoker = off);
grant select on admin_module_comprehension to authenticated;

notify pgrst, 'reload schema';
