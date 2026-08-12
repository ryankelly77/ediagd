-- ============================================================================
-- EDIAGD — import the curriculum map
--
--   python3 scripts/build-curriculum-tsv.py        # csv -> tsv
--   psql "$DATABASE_URL" -f supabase/curriculum/import.sql
--
-- Run both from the repo root: the \copy path is relative to the working
-- directory, not to this file. Requires migration 0037.
--
-- THE JOIN. curriculum_map.csv ships a 16-character match_key built from the
-- lowercased, whitespace-collapsed first 120 characters of title and body.
-- content_match_key() (0035) produces the identical string from the content
-- table, so the join is an equality rather than a fuzzy match. Measured on the
-- real export: 1,664 of 1,683 distinct keys hit a content row — 98.9%.
--
-- IDEMPOTENT, AND NOW ACTUALLY SO. Courses and modules are UPSERTED on their
-- natural keys, so re-running after Mitch reshapes the curriculum corrects
-- order and names in place instead of duplicating rows. This only works because
-- 0037 added unique (course_id, name) to `module`; before it, the `on conflict`
-- clause here had no target and a second run inserted a whole second set of
-- modules.
--
-- TWO THINGS THIS SCRIPT DECIDES, both deliberately here rather than in the CSV:
--
--   1. MODULE ORDER COMES FROM THE NAME when the name carries one. "3. Reading
--      the Customer" sorts third no matter what module_order says. The two
--      agree in the current CSV; deriving it means they cannot silently drift
--      apart later, which is exactly what shipped Walk-Around modules 3 and 4
--      in the wrong order.
--
--   2. A MODULE WITH NO MATCHED CUES IS NOT CREATED. A 0-of-0 module can never
--      complete, and it is almost always debris from a cue that failed to
--      match rather than an intentional placeholder. Every skip is reported by
--      name and course, because an unexpected one means cues went missing.
--
-- NOTHING IS DROPPED SILENTLY. Both directions of the unmatched set are
-- reported at the end, because a quiet 80% would orphan 300 cues outside any
-- module and look exactly like success.
-- ============================================================================

begin;

create temp table _map (
  match_key   text,
  track       text,
  course      text,
  module      text,
  name_status text,
  module_order int,
  lesson_order int
) on commit drop;

-- \copy takes no variables, so the path is fixed and lives beside this file.
\copy _map from 'supabase/curriculum/curriculum.tsv'

-- ---- What actually matched ---------------------------------------------------
-- Resolved BEFORE anything is created, which is what makes "skip empty modules"
-- possible: a module is only built from rows that reached a real content row.
--
-- module_sort is settled here too, once, so the course's own order and the
-- module's order cannot disagree about what a leading "3." means.

create temp table _matched on commit drop as
select
  m.match_key,
  m.track,
  m.course,
  m.module,
  m.name_status,
  m.lesson_order,
  coalesce(
    -- "3. Reading the Customer" -> 3. The separator is required, so a module
    -- named "2024 Warranty Updates" is not read as position 2024.
    nullif(substring(m.module from '^[[:space:]]*([0-9]+)[[:space:]]*[.):-][[:space:]]+'), '')::int,
    m.module_order
  ) as module_sort,
  ct.id as content_id
from _map m
join content ct on content_match_key(ct.title, ct.body) = m.match_key;

-- ---- Refuse to build anything nameless ---------------------------------------
-- The current CSV carries 18 Product Knowledge rows with an EMPTY course field.
-- They are harmless today only by accident: those same 18 cues are 18 of the 19
-- keys that match no content row, so nothing reaches the insert below. If any
-- of them ever lands in `content`, this would quietly create a course named ''
-- with the slug 'product-knowledge-' — an unreachable card, and a slug that
-- collides with the next nameless course in that track.
--
-- Failing the whole import is the right response: a blank name is a defect in
-- the map, and it is cheaper to fix the CSV than to find an invisible course.

do $$
declare n int;
begin
  select count(*) into n
    from _matched
   where coalesce(btrim(track), '')  = ''
      or coalesce(btrim(course), '') = ''
      or coalesce(btrim(module), '') = '';
  if n > 0 then
    raise exception
      'curriculum: % matched row(s) carry a blank track, course, or module name. '
      'Fix curriculum_map.csv and re-run — refusing to create a nameless course.', n;
  end if;
end $$;

-- ---- Courses -----------------------------------------------------------------
-- sort_order comes from the lowest module position seen in the course, so the
-- taught sequence survives the import instead of being alphabetised.

insert into course (track, name, slug, sort_order)
select
  m.track,
  m.course,
  -- Slug has to be unique across tracks: two tracks both have a "General".
  lower(regexp_replace(m.track || '-' || m.course, '[^a-zA-Z0-9]+', '-', 'g')),
  min(m.module_sort)
from _matched m
group by m.track, m.course
on conflict (track, name) do update
  set sort_order = excluded.sort_order;

-- ---- Modules -----------------------------------------------------------------
-- 224 of 253 arrive carrying a placeholder name. name_status is what makes that
-- a work queue an admin can find rather than a defect buried in the data.

insert into module (course_id, name, sort_order, name_status)
select
  c.id,
  m.module,
  min(m.module_sort),
  -- If ANY row for a module says the name is a placeholder, it is one.
  case when bool_or(m.name_status = 'needs_name') then 'needs_name' else 'ok' end
from _matched m
join course c on c.track = m.track and c.name = m.course
group by c.id, m.module
on conflict (course_id, name) do update
  set sort_order  = excluded.sort_order,
      name_status = excluded.name_status;

-- ---- Place the cues ----------------------------------------------------------
-- Joined on the key resolved above, so a cue whose title or body drifted since
-- the export simply does not move — it is reported below rather than mis-filed.

update content ct
   set module_id    = mo.id,
       module_order = m.lesson_order
  from _matched m
  join course c on c.track = m.track and c.name = m.course
  join module mo on mo.course_id = c.id and mo.name = m.module
 where ct.id = m.content_id;

-- ---- Sweep up modules left empty ---------------------------------------------
-- Skipping creation only helps a first run. A module that already exists —
-- because a previous import built it, or because a rename moved its cues
-- elsewhere — has to be removed too, or the 0-of-0 card stays on the course.
--
-- GUARDED. A module holding a quiz, an attempt, or a completion is somebody's
-- work; it is reported instead of deleted even when it has no cues, because a
-- cascade here would silently destroy records that cost an advisor something.

create temp table _emptied on commit drop as
select mo.id, c.track, c.name as course, mo.name as module,
       exists (select 1 from quiz_question    q  where q.module_id  = mo.id) as has_quiz,
       exists (select 1 from quiz_attempt     a  where a.module_id  = mo.id) as has_attempt,
       exists (select 1 from module_completion mc where mc.module_id = mo.id) as has_completion
from module mo
join course c on c.id = mo.course_id
where not exists (select 1 from content ct where ct.module_id = mo.id);

delete from module
 where id in (
   select id from _emptied
    where not has_quiz and not has_attempt and not has_completion
 );

-- A course whose every module just went away is debris by the same argument.
create temp table _empty_courses on commit drop as
select c.id, c.track, c.name
from course c
where not exists (select 1 from module mo where mo.course_id = c.id);

delete from course where id in (select id from _empty_courses);


-- ============================ IMPORT REPORT ==================================

\echo ''
\echo '================ IMPORT REPORT ================'

select
  (select count(*) from _map)                                  as csv_rows,
  (select count(distinct match_key) from _map)                 as csv_keys,
  (select count(distinct match_key) from _matched)             as matched_keys,
  (select count(*) from course)                                as courses,
  (select count(*) from module)                                as modules,
  (select count(*) from module where name_status='needs_name') as modules_needing_names,
  (select count(*) from content where module_id is not null)   as cues_placed;

\echo ''
\echo '-- Modules NOT created: zero cues matched (each one is a cue that went missing) --'
select m.track, m.course, m.module, count(*) as csv_cues_expected
from _map m
where not exists (
  select 1 from _matched x
   where x.track = m.track and x.course = m.course and x.module = m.module
)
group by m.track, m.course, m.module
order by m.track, m.course, m.module;

\echo ''
\echo '-- Modules DELETED: previously created, now hold no cues --'
select track, course, module
from _emptied
where not has_quiz and not has_attempt and not has_completion
order by track, course, module;

\echo ''
\echo '-- Modules KEPT despite having no cues: they hold a quiz, an attempt, or a completion --'
select track, course, module, has_quiz, has_attempt, has_completion
from _emptied
where has_quiz or has_attempt or has_completion
order by track, course, module;

\echo ''
\echo '-- Courses DELETED: no modules left --'
select track, name from _empty_courses order by track, name;

\echo ''
\echo '-- CSV keys with no matching content row (these cues are NOT in the app) --'
select count(*) as unmatched_csv_keys
from (select distinct match_key from _map) k
where not exists (select 1 from _matched x where x.match_key = k.match_key);

select m.track, m.course, m.module, left(m.match_key, 12) as key
from _map m
where not exists (select 1 from _matched x where x.match_key = m.match_key)
group by m.track, m.course, m.module, m.match_key
order by m.track, m.course
limit 25;

\echo ''
\echo '-- Published content with no curriculum row (orphans, outside every module) --'
select count(*) as orphaned_published
from content ct
where ct.status = 'published'
  and ct.module_id is null;

select ct.status, ct.type, left(ct.title, 62) as title
from content ct
where ct.module_id is null
order by ct.status, ct.title
limit 15;

\echo ''
\echo '-- Modules that exist but show 0 of 0 to an advisor (cues present, none published) --'
select c.track, c.name as course, mo.name as module,
       count(ct.id) as cues, count(*) filter (where ct.status = 'published') as published
from module mo
join course c on c.id = mo.course_id
join content ct on ct.module_id = mo.id
group by c.track, c.name, mo.name
having count(*) filter (where ct.status = 'published') = 0
order by c.track, c.name, mo.name;

\echo ''
\echo '-- CSV keys matching MORE THAN ONE content row (near-duplicate cues) --'
select left(x.match_key, 12) as key, count(distinct x.content_id) as content_rows
from _matched x
group by x.match_key
having count(distinct x.content_id) > 1
order by count(distinct x.content_id) desc
limit 10;

commit;
