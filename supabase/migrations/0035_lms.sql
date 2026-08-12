-- ============================================================================
-- EDIAGD — 0035 The library becomes a course
--
-- COURSES AND MODULES ARE FIRST-CLASS HERE, not derived at read time. An
-- earlier draft of this migration grouped cues into modules on the fly, by
-- subcategory with a fallback that chopped long services into "Part 1, Part 2".
-- That was the right shape for the data as it stood — measured on production,
-- 1,281 published items and NOT ONE with a subcategory — but a real curriculum
-- map exists, so derived structure is now the wrong answer. Curation belongs in
-- rows an admin can edit, not in a window function.
--
-- WHAT THE CURRICULUM CARRIES: 1,693 cues mapped to Track / Course / Module,
-- and 253 modules of which 224 hold placeholder names ("Closing Strategies 2").
-- Those placeholders are the point of module.name_status: they are a work queue
-- for Mitch, not a defect to hide. An admin screen has to be able to find them.
--
-- WHAT COMPLETES A MODULE. Every cue in it done, AND — where a published quiz
-- exists — that quiz passed. Modules with no published quiz complete on content
-- alone, so importing the curriculum before authoring quizzes doesn't make the
-- whole library uncompletable.
-- ============================================================================

-- ---- 1. Courses and modules -------------------------------------------------

create table if not exists course (
  id          uuid primary key default gen_random_uuid(),
  -- 'Foundations' | 'Service' | 'Product Knowledge'. Free text rather than an
  -- enum: the curriculum is Mitch's to reshape and a new track shouldn't need a
  -- migration.
  track       text not null,
  name        text not null,
  slug        text not null unique,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (track, name)
);

create table if not exists module (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references course(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  /**
   * 'needs_name' marks a module carrying an auto-generated placeholder.
   * Surfaced prominently in the CMS: 224 of 253 arrive this way, and a course
   * of "Closing Strategies 2, Closing Strategies 3" teaches nobody anything.
   */
  name_status text not null default 'ok'
    check (name_status in ('ok', 'needs_name')),
  created_at timestamptz not null default now()
);

create index if not exists module_course_idx on module (course_id, sort_order);
create index if not exists module_needs_name_idx on module (name_status)
  where name_status = 'needs_name';

-- A cue's placement in the curriculum. Nullable: content can exist before it is
-- mapped, and the importer fills these in.
alter table content
  add column if not exists module_id    uuid references module(id) on delete set null,
  add column if not exists module_order int;

create index if not exists content_module_idx on content (module_id, module_order);

alter table course enable row level security;
alter table module enable row level security;

-- The curriculum's SHAPE is not secret; the cues inside it are still gated by
-- content_entitled_read. Anyone signed in may see that a course exists.
drop policy if exists course_read on course;
create policy course_read on course
  for select using ((select auth.uid()) is not null);
drop policy if exists module_read on module;
create policy module_read on module
  for select using ((select auth.uid()) is not null);

drop policy if exists course_write on course;
create policy course_write on course
  for all using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  ) with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );
drop policy if exists module_write on module;
create policy module_write on module
  for all using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  ) with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );


-- ---- 2. Quizzes -------------------------------------------------------------

create table if not exists quiz_question (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references module(id) on delete cascade,
  question    text not null,
  option_a    text not null,
  option_b    text not null,
  option_c    text not null,
  option_d    text not null,
  /**
   * THE ANSWER KEY. Never selected by any query that serves a quiz — see
   * quiz_question_public below, which is the only thing an advisor's client is
   * allowed to read.
   */
  correct     char(1) not null check (correct in ('a', 'b', 'c', 'd')),
  explanation text,
  sort_order  int not null default 0,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  source      text not null default 'authored' check (source in ('authored', 'ai_generated')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists quiz_question_module_idx
  on quiz_question (module_id, status, sort_order);

alter table quiz_question enable row level security;

/**
 * ADVISORS NEVER READ THIS TABLE. Not the answer, not even the row.
 *
 * A policy that returned published questions to advisors would hand the client
 * `correct` along with them — RLS filters rows, not columns, so "select the
 * columns you need" is a convention the client can simply ignore. So only
 * admins may read the table at all, and the advisor path goes through the
 * security-definer view below, which cannot return the key because it does not
 * select it.
 */
drop policy if exists quiz_question_admin on quiz_question;
create policy quiz_question_admin on quiz_question
  for all using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  ) with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );

/**
 * What an advisor is served: published questions, no answer, no explanation.
 *
 * security_invoker = OFF deliberately. This is the one place in the schema where
 * a definer view is the correct tool: the caller must NOT be able to read the
 * underlying table, and the view's job is to expose a strict subset of columns.
 * Explanations arrive after grading, from the server, never with the question.
 */
create or replace view quiz_question_public as
select
  q.id,
  q.module_id,
  q.question,
  q.option_a,
  q.option_b,
  q.option_c,
  q.option_d,
  q.sort_order
from quiz_question q
where q.status = 'published';

alter view quiz_question_public set (security_invoker = off);
grant select on quiz_question_public to authenticated;

create table if not exists quiz_attempt (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user(id) on delete cascade,
  module_id  uuid not null references module(id) on delete cascade,
  score_pct  int  not null check (score_pct between 0 and 100),
  passed     boolean not null,
  -- {questionId: chosenOption}. Kept so a retry can show what changed, and so a
  -- question everybody misses can be found later.
  answers    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempt_user_idx
  on quiz_attempt (user_id, module_id, created_at desc);

alter table quiz_attempt enable row level security;

drop policy if exists quiz_attempt_own_read on quiz_attempt;
create policy quiz_attempt_own_read on quiz_attempt
  for select using (user_id = (select auth.uid()));
-- No write policy: attempts are graded and written by the server. A client that
-- could insert its own attempt could insert passed = true.


-- ---- 3. Module completion ---------------------------------------------------

create table if not exists module_completion (
  user_id      uuid not null references app_user(id) on delete cascade,
  module_id    uuid not null references module(id) on delete cascade,
  rooftop_id   uuid references rooftop(id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table module_completion enable row level security;

drop policy if exists module_completion_own on module_completion;
create policy module_completion_own on module_completion
  for select using (user_id = (select auth.uid()));
-- No write policy: the service role writes here, and the primary key is the
-- pay-once guard.


-- ---- 4. Progress, grouped in Postgres ---------------------------------------
-- One row per module for the CALLER, so no screen ever issues a query per
-- module. At 253 modules that is the difference between one round trip and 253.

create or replace view my_module_progress as
select
  m.id                                        as module_id,
  m.course_id,
  m.name                                      as module_name,
  m.name_status,
  m.sort_order,
  count(c.id)::int                            as total_items,
  count(cp.content_id)::int                   as completed_items,
  (count(c.id) > 0 and count(c.id) = count(cp.content_id)) as items_done,
  -- Does a published quiz stand between them and completion?
  exists (
    select 1 from quiz_question q
     where q.module_id = m.id and q.status = 'published'
  )                                           as has_quiz,
  exists (
    select 1 from quiz_attempt a
     where a.module_id = m.id
       and a.user_id = (select auth.uid())
       and a.passed
  )                                           as quiz_passed,
  (select mc.completed_at from module_completion mc
    where mc.module_id = m.id and mc.user_id = (select auth.uid())) as completed_at,
  max(cp.completed_at)                        as last_activity
from module m
left join content c
  on c.module_id = m.id and c.status = 'published'
left join content_progress cp
  on cp.content_id = c.id
 and cp.user_id = (select auth.uid())
 and cp.completed_at is not null
group by m.id, m.course_id, m.name, m.name_status, m.sort_order;

alter view my_module_progress set (security_invoker = on);

create or replace view my_course_progress as
select
  c.id                                          as course_id,
  c.track,
  c.name,
  c.slug,
  c.sort_order,
  count(mp.module_id)::int                      as total_modules,
  count(*) filter (where mp.completed_at is not null)::int as completed_modules,
  coalesce(sum(mp.total_items), 0)::int         as total_items,
  coalesce(sum(mp.completed_items), 0)::int     as completed_items,
  count(*) filter (where mp.name_status = 'needs_name')::int as modules_needing_names,
  max(mp.last_activity)                         as last_activity
from course c
left join my_module_progress mp on mp.course_id = c.id
group by c.id, c.track, c.name, c.slug, c.sort_order;

alter view my_course_progress set (security_invoker = on);


-- ---- 5. Settings -------------------------------------------------------------

alter table game_settings
  add column if not exists sand_module int not null default 15,
  -- The grind stop. 1,693 cues at 1 each is 1,693 Sand Dollars — 169 days of
  -- daily-loop earnings available by reading. The cap keeps the habit primary.
  add column if not exists sand_lesson_daily_cap int not null default 30,
  add column if not exists quiz_pass_pct int not null default 80;

alter table game_settings
  add constraint game_settings_quiz_pass_range
  check (quiz_pass_pct between 1 and 100);

-- 3 was calibrated against a 36-item local database, not a 1,693-cue library.
alter table game_settings alter column sand_lesson set default 1;
update game_settings set sand_lesson = 1 where sand_lesson = 3;

alter type sand_reason add value if not exists 'module_complete';


-- ---- 6. The join key the importer uses --------------------------------------
/**
 * How a curriculum CSV row is matched to a content row.
 *
 * Defined HERE rather than only in the import script so both sides compute it
 * the same way by construction. If the two ever drift, the match rate silently
 * collapses and every cue looks unmapped — which is indistinguishable from a
 * bad CSV.
 *
 * Lowercased, whitespace collapsed, trimmed, first 120 characters of title and
 * body — then the FIRST 16 HEX CHARACTERS of the md5.
 *
 * Truncating the text is deliberate: 519 of the cues are themselves truncated
 * in the source, so a key over the full body would fail on exactly those rows.
 * Truncating the HASH is not a choice — curriculum_map.csv ships 16-character
 * keys, and this has to produce the identical string or the join silently
 * returns nothing. Measured against the real export: 1,664 of 1,683 distinct
 * keys match, 98.9%.
 */
create or replace function content_match_key(_title text, _body text)
returns text
language sql
immutable
as $$
  select left(md5(
    left(btrim(regexp_replace(lower(coalesce(_title, '')), '\s+', ' ', 'g')), 120)
    || '||' ||
    left(btrim(regexp_replace(lower(coalesce(_body,  '')), '\s+', ' ', 'g')), 120)
  ), 16)
$$;

create index if not exists content_match_key_idx
  on content (content_match_key(title, body));


-- ---- 7. Tell the API ---------------------------------------------------------
-- Same reason as 0034: an enum value the API hasn't seen is rejected on first
-- use, which looks exactly like a code bug and isn't one.
notify pgrst, 'reload schema';
