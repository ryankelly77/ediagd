-- ============================================================================
-- 0162 — two takes that were never finished leave publication, with the reason
--        on the row
-- ============================================================================
--
-- `25,000 Mile Dealer Upsell Menu (2748)` ends mid-sentence — "and build off" —
-- and `70,000 Mile Dealer Upsell Menu, Part 2 (2821)` ends on an outtake with
-- no audio decodable at all. Neither is dead air and neither is a trim: there
-- is no Mahalo to cut after, because the take was never taken to the end.
--
-- Both came back "no sign-off" from the 8 October measure pass, and
-- scripts/trim-apply.ts has excluded them BY ID ever since, with this note:
--
--     Ryan is unpublishing these and Mitch reshoots.
--
-- That exclusion lived in one script. This puts it on the row, where the next
-- reader of the row will find it — the same reason 0134 moved eleven retire
-- reasons out of migration comments and into `retired_reason`.
--
-- ---------------------------------------------------------------------------
-- UNPUBLISHED, NOT RETIRED, AND THE DIFFERENCE IS THE RESHOOT
-- ---------------------------------------------------------------------------
-- A retire says the film is gone for good. These two are waiting for a reshoot,
-- and a reshoot REPLACES IN PLACE — INGEST.md is explicit about it — so the row
-- has to survive to receive the new master, keep its op code, its mileage rung
-- and its placement, and go back to `published` when the film arrives. Setting
-- `retired_at` would say the opposite of what is true.
--
-- So: `status = 'draft'`, everything else untouched.
--
-- ---------------------------------------------------------------------------
-- "published = false" IS `status = 'draft'` IN THIS SCHEMA, AND ONLY THAT
-- ---------------------------------------------------------------------------
-- The brief asked for `published = false`. `content` has no such column: the
-- boolean `published` in 0001 is on `content_item`, the legacy table, which
-- nothing in the app reads. `content.status` is an enum of exactly two values —
-- measured on production, `archived`, `review`, `retired` and `library` are all
-- rejected by the type — so `draft` is the only thing "not published" can mean
-- here, and it is what 420 other rows already use.
--
-- 0141 added a `status = 'library'` value to `quiz_question` and NOT to
-- `content`; `content` got the `library_reason` column alone. Worth knowing
-- before somebody writes `status = 'library'` on a film and watches it fail.
--
-- ---------------------------------------------------------------------------
-- THE COLUMN COMMENT WAS TRUE ONLY WHILE ONE KIND OF ROW CARRIED THE COLUMN
-- ---------------------------------------------------------------------------
-- 0141 wrote this, and it was correct the day it was typed:
--
--     'Non-null means this row is deliberately in the skill library: named,
--      published, and attached to no module…'
--
-- It was a fact about WHO WAS SETTING IT — at that moment, only a hand parking
-- a published film that had nowhere to go. Ten rows carry it, all published.
-- This migration adds the eleventh and twelfth, and they are NOT published, so
-- the word "published" in that comment becomes false the moment this runs.
--
-- AGENTS.md has a rule for exactly this and it is the reason the comment is
-- rewritten here rather than left to be discovered: an assumption wearing a
-- definition's clothes instructs the reader not to look. Write the condition,
-- not the claim.
--
-- ---------------------------------------------------------------------------
-- WHAT THE SHELF AND THE SURFACES DO WITH THIS, CHECKED RATHER THAN ASSUMED
-- ---------------------------------------------------------------------------
--   lib/mileage.ts      filters `status = 'published'` on BOTH the rung list and
--                       the film list, so these drop off the shelf and no rung
--                       disappears: rung 25000 keeps 5 published films, rung
--                       70000 keeps 1. Counted on production before writing this.
--   blog_corpus_films   filters `status = 'published'` — an unfinished take will
--                       not reach the blog corpus. Correct.
--   film_stills         same filter, same outcome.
--   skill_library       does NOT filter status. These two therefore appear in it,
--                       which is right — "everything deliberately parked, with
--                       the question that would release it", and the question
--                       here is "has Mitch reshot it" — but the view could not
--                       tell a published parked film from an unpublished one.
--                       So `status` is appended to both arms. CREATE OR REPLACE
--                       VIEW can only add columns at the END, which is why it
--                       goes last; see 0156, which had to learn the same thing.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENT, AND IT ASSERTS ITS OWN EFFECT
-- ---------------------------------------------------------------------------
-- The two rows were written through the service role during the 9 October trim
-- batch so the published count could be proved to move in that run. This
-- migration is therefore a no-op on production and the real thing on a fresh
-- database — and it refuses to be vacuous: if a row is present it must end up
-- draft with a reason, and the migration raises if it does not. A row that is
-- absent entirely (a local database that never ingested the Menu films) is
-- skipped and said so, rather than failing the chain.
-- ============================================================================

do $$
declare
  _n        int;
  _expected int := 2;
  _found    int := 0;
  _r        record;
begin
  for _r in
    select * from (values
      ('d0b1084d-db49-4c5e-b608-9fb594355861'::uuid,
       '25,000 Mile Dealer Upsell Menu (2748)',
       'Unpublished 9 October 2026: the take was never finished — it ends '
       'mid-sentence on "and build off", so there is no sign-off to trim to. '
       'Mitch reshoots; the reshoot replaces this row in place and it returns '
       'to published then. Not retired — the film is coming, not gone.'),
      ('fe35f2ea-2fa7-4b07-acca-ea16e2e2c8c7'::uuid,
       '70,000 Mile Dealer Upsell Menu, Part 2 (2821)',
       'Unpublished 9 October 2026: the take was never finished — it ends on an '
       'outtake and the last ten seconds decode no words at all. Its vertical '
       'was already stale because the crop disagreed with the master by 2.889s. '
       'Mitch reshoots; the reshoot replaces this row in place.')
    ) as v(id, title, reason)
  loop
    select count(*) into _n from content where id = _r.id;
    if _n = 0 then
      raise notice '0162: no row %, skipped (this database never ingested it)', _r.title;
      continue;
    end if;
    _found := _found + 1;

    update content
       set status         = 'draft',
           library_reason = _r.reason,
           updated_at     = now()
     where id = _r.id;

    /* The assertion, read back from the row rather than from the UPDATE's own
       say-so. A migration that applies cleanly is not evidence that it did
       anything — AGENTS.md's first standing rule, and this is the cheap half. */
    select count(*) into _n
      from content
     where id = _r.id
       and status = 'draft'
       and library_reason is not null
       and retired_at is null;
    if _n <> 1 then
      raise exception '0162: % did not end up draft with a reason and no retired_at', _r.title;
    end if;
    raise notice '0162: % is unpublished, reason on the row', _r.title;
  end loop;

  if _found = 0 then
    raise notice '0162: neither film is in this database; nothing to do';
  elsif _found <> _expected then
    raise notice '0162: % of % films present and handled', _found, _expected;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The comment that was only true while one kind of row carried the column.
-- ---------------------------------------------------------------------------
comment on column content.library_reason is
  'Non-null means this row is deliberately PARKED, and holds the question that '
  'would release it. It says nothing about whether the row is published: a '
  'parked film may be published and attached to no module (0141''s ten CSI and '
  'Master-track films), or unpublished and waiting on a reshoot (0162''s two '
  'unfinished Menu takes). Read `status` for that. The earlier wording said '
  '"named, published" and was a fact about who happened to be setting the '
  'column rather than a property of the data.';

-- ---------------------------------------------------------------------------
-- So a reader of skill_library can tell a parked film that is serving from one
-- that is not. Appended last: CREATE OR REPLACE VIEW can only add columns at
-- the end, after 0155's library_reason and 0156's still_url ordering lesson.
-- ---------------------------------------------------------------------------
create or replace view skill_library
with (security_invoker = on) as
  select 'film'::text as kind, c.id, c.title, c.collection,
         c.duration_sec, c.library_reason as reason,
         c.status::text as status
    from content c
   where c.library_reason is not null and c.retired_at is null
  union all
  select 'quiz'::text, q.id, coalesce(q.film, q.deck), q.deck,
         null::int, q.library_reason,
         q.status::text
    from quiz_question q
   where q.status = 'library';

comment on view skill_library is
  'Destination 3. Everything deliberately parked, with the question that would '
  'release it, and the status it is parked in — a film parked while published '
  'is reachable and one parked as draft is not, and the two must not read '
  'alike. An empty result means nothing is waiting on a ruling — not that '
  'nothing is unplaced; see module_id for that.';
