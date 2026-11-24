-- ============================================================================
-- EDIAGD — 0183 a manager meeting carries its run sheet
--
-- NOT APPLIED. Written for Ryan to read and apply, from the ~/ediagd main
-- checkout. This branch never applies a migration: `.env.local` here points at
-- production, and `db:migrate` run from this worktree would put a branch
-- migration straight onto the live database.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS FOR
-- ---------------------------------------------------------------------------
-- Mitch's Manager Meetings library is a workbook of meetings, each with a
-- length, a format, a set of situation tags, a "when to use it" line and a run
-- sheet the manager reads off the screen while running the meeting. Four of
-- those already have a home on `content`; three do not, and `series` does not
-- exist at all. This adds five columns, one CHECK and one unique index — the
-- fifth column, `classification_line`, is the meeting's identity and is
-- explained at length below.
--
-- Nothing here is manager-meetings-only by type. They are columns on `content`,
-- and a later craft or advisor film is free to use them — which is why none of
-- them is named `manager_*`.
--
-- ---------------------------------------------------------------------------
-- THE LIBRARY IS NOT FINAL, AND NOTHING HERE ASSERTS A COUNT
-- ---------------------------------------------------------------------------
-- About 100 films are shot and about 115 are still to come, and more manager
-- mindset films will follow after that. So there is no `check (count = 213)`
-- anywhere, no backfill that assumes a fixed population, and no assertion that
-- a particular meeting exists. The one list this migration does pin down is the
-- 24 situation tags, and that is a deliberate exception explained below.
--
-- ---------------------------------------------------------------------------
-- WHY THE TAG LIST IS A CONSTRAINT AND NOT A CONVENTION
-- ---------------------------------------------------------------------------
-- `situation_tags` is what a manager will eventually filter the library by —
-- "show me something for a slow week", "something for a new hire". A free-text
-- array accepts a typo and then reads as a tag nobody filters on: the row is
-- present, the filter misses it, and nothing raises. That is the silent
-- by-default failure this codebase has met repeatedly, and 0163 already settled
-- the remedy for exactly this shape with `app_event.kind` — a CHECK makes the
-- typo a 23514 at the moment it is written, which is the only moment anybody is
-- looking.
--
-- So adding a 25th tag is a migration. That friction is the feature, the same
-- way 0163's is: a tag is a claim that the library can be filtered a new way,
-- and a tag that appears without one is a facet nothing surfaces.
--
-- MEASURED, not assumed: all 213 meetings in the 18 November workbook carry
-- between one and three tags, and all 24 tags in its Tag Guide are in use. The
-- list below is that Tag Guide, in its order.
--
-- ---------------------------------------------------------------------------
-- THE CHECK IS INERT ON NULL, AND THAT IS STATED RATHER THAN DISCOVERED
-- ---------------------------------------------------------------------------
-- `situation_tags <@ array[...]` evaluates to NULL when `situation_tags` is
-- NULL, and a CHECK constraint PASSES on NULL. So this constraint says nothing
-- whatsoever about an untagged row.
--
-- That is 0128's lesson, and it is being written down here instead of being
-- found later: "an exclusion by value is not an exclusion unless the value is
-- mandatory." The menu films arrived with `placement = NULL` and were both
-- invisible to the surface that selects the value and not excluded by the gate
-- that excludes it.
--
-- The column is nevertheless left NULLABLE, on purpose:
--
--   · the 17 Bank Account films already exist, carry no tags, and must not be
--     touched by this migration — a NOT NULL would require inventing tags for
--     them or defaulting them into a facet they do not belong to;
--   · a future manager mindset film may genuinely have no situation;
--   · NULL and '{}' would otherwise both mean "untagged", which is two
--     representations of one state.
--
-- WHERE THE HOLE IS ACTUALLY CLOSED: at the writer. `scripts/load-manager-meetings.ts`
-- always writes an array for every row it manages, and refuses the whole run on
-- a tag outside this list before it writes anything. A backfill is a promise; a
-- writer that cannot emit the bad state is a property. The constraint is the
-- second guard behind it, not the only one.
--
-- ---------------------------------------------------------------------------
-- WHAT IS NOT STORED
-- ---------------------------------------------------------------------------
-- `Status` (New / Merged) and `Academy course` are read by the extractor and
-- dropped, per Ryan's ruling. Status is editorial state in Mitch's workbook —
-- it says which meetings were added in the November pass — and the app has no
-- question it answers. Academy course is curriculum scheduling that belongs to
-- the Academy, not to a film row.
--
-- No column is added for the meeting's topic. `listManagerTopics` already
-- buckets the browse page on `content.service_family`, and introducing a second
-- column that also means "which topic" would be two definitions of one fact
-- with nothing keeping them in step. The loader writes the workbook's Topic to
-- `service_family` for that reason.
-- ============================================================================

-- ---- 1. The five columns --------------------------------------------------
/*
 * `if not exists` on every one, so a re-run is a no-op rather than an error —
 * this file may be replayed against a local stack several times while the
 * loader is being worked on.
 */
alter table content
  /* Mitch's "Series or set": the named arc a meeting belongs to, where it
     belongs to one — "Coaching Investment", "Menu (1 of 4)", "Find the Few".
     14 of the 213 November meetings carry one. Text and not an FK: a set is
     editorial grouping Mitch invents while writing, and a table would make
     naming a new one a migration. */
  add column if not exists series text,

  /* "5–15 minutes", "Under 5 minutes", "10 minutes", "15+ minutes". Kept as the
     workbook's own words rather than parsed into an int range, because the
     thing shown to a manager is the phrase and a range would have to be
     rendered back into one. */
  add column if not exists meeting_length text,

  /* "Solo (manager)", "Team", and the handful of other shapes Mitch uses. */
  add column if not exists meeting_format text,

  /* Which situations this meeting is for. See the long note above on why the
     list is constrained and why the constraint is inert on NULL. */
  add column if not exists situation_tags text[],

  /* THE MEETING'S IDENTITY. Stored verbatim, and the reason is the whole of
     "join on what was observed, not on what was derived".
     See the long note below. */
  add column if not exists classification_line text;

/*
 * ---------------------------------------------------------------------------
 * WHY THE CLASSIFICATION LINE IS A STORED COLUMN AND NOT RECONSTRUCTED
 * ---------------------------------------------------------------------------
 * A meeting's identity is its Classification line — "Manager Meetings/<Topic>/
 * <length>/<Title>" — which is also the slate Mitch reads on camera. The loader
 * keys on it, and `identify-videos.ts` will match a clip to its content row by
 * it.
 *
 * It LOOKS reconstructible from columns this migration already adds, and it is
 * not. Two reasons, both measured on the 18 November workbook:
 *
 *   · THE LENGTH TOKEN IS A DIFFERENT STRING. The line says "10 mins" and
 *     "5-15 mins"; `Meeting length` says "10 minutes" and "5–15 minutes" —
 *     different words, and an en dash against a hyphen. Rebuilding the line
 *     from `meeting_length` produces a string that matches nothing.
 *   · FOUR TITLES CONTAIN A LITERAL '/'. "A/C Recharge Boost Meeting" and its
 *     three neighbours split into FIVE parts, not four. Any code that round
 *     trips through split('/') mangles them, and three of the four keep their
 *     slash even after Ryan's ruling 5 renames the fourth to "AC Performance".
 *
 * So the line is OBSERVED — Mitch wrote it, Mitch says it — and every one of
 * its apparent components is DERIVED. `scripts/trim-slates.ts` already paid for
 * this exact lesson in this exact repo: it joined on `canonical_filename`, a
 * form the ingest invents, and matched 0 of 73 where `source_filename` matched
 * 73 of 73. Then it skipped all 73 silently and reported success.
 *
 * UNIQUE, so a duplicate is impossible rather than merely reported. The loader
 * reports a repeated line too, but a report is a convention and an index is a
 * construction. PARTIAL, because the 17 Bank Account films have no
 * classification line and the nulls must not collide — the same shape as
 * app_event_dedup_idx in 0163.
 */
create unique index if not exists content_classification_line_idx
  on content (classification_line)
  where classification_line is not null;

comment on column content.classification_line is
  'The meeting''s identity: "Manager Meetings/<Topic>/<length>/<Title>", which '
  'is also the slate Mitch reads on camera. STORED VERBATIM AND NEVER '
  'RECONSTRUCTED — the line''s length token ("10 mins") is not the same string '
  'as meeting_length ("10 minutes"), and four A/C titles contain a literal '
  '"/" so the line does not split into four parts. Joining on a rebuilt form '
  'is what made trim-slates.ts match 0 of 73 and report success. UNIQUE where '
  'not null (content_classification_line_idx), so the loader cannot create a '
  'second row for one meeting and a retitle updates in place. NULL for films '
  'that have no slate, including the 17 Bank Account films. 0183.';

comment on column content.series is
  'The named arc a film belongs to, where it belongs to one — Mitch''s "Series '
  'or set" column. Editorial grouping, so text rather than an FK: naming a new '
  'set must not be a migration. 0183.';

comment on column content.meeting_length is
  'How long the meeting runs, in the workbook''s own words ("5–15 minutes", '
  '"Under 5 minutes"). Not parsed into a range, because the phrase is what is '
  'shown and a range would have to be rendered back into one. 0183.';

comment on column content.meeting_format is
  'How the meeting is run — "Solo (manager)", "Team". 0183.';

comment on column content.situation_tags is
  'Which situations this meeting is for, from the 24 in Mitch''s Tag Guide. '
  'CONSTRAINED by content_situation_tags_known so a typo is a 23514 rather '
  'than a tag nobody filters on; adding a 25th tag is a migration, the same '
  'deliberate friction as app_event.kind in 0163. THE CONSTRAINT IS INERT ON '
  'NULL — a CHECK passes on NULL — so the guarantee that a managed row is '
  'tagged comes from scripts/load-manager-meetings.ts, which always writes an '
  'array and refuses the run on an unknown tag. NULL means untagged, which the '
  '17 Bank Account films legitimately are. 0183.';

-- ---- 2. The tag list, as a constraint -------------------------------------
/*
 * `<@` is "is contained by", so this passes when every element of the array is
 * in the list and fails on the first element that is not. An empty array is
 * contained by anything, so '{}' passes — which is correct, it means untagged.
 *
 * Dropped first so the migration is re-runnable, and added NOT VALID then
 * validated in the same transaction: on a table the size of `content` that
 * costs nothing today, and it is the habit that matters when it does not.
 */
alter table content drop constraint if exists content_situation_tags_known;
alter table content add constraint content_situation_tags_known check (
  situation_tags <@ array[
    'Active delivery',
    'Attach rate or ticket flat',
    'CSI and surveys',
    'Contests',
    'Coverage Is Key',
    'End of month',
    'Language and word tracks',
    'Manager self-work',
    'Menu sales',
    'Mid-month',
    'Morale and recognition',
    'New hire or onboarding',
    'Objections and deferred work',
    'One-on-one coaching',
    'Phones and BDC',
    'Product knowledge and launches',
    'Seasonal',
    'Slow traffic or prospecting',
    'Standards and process',
    'Start of month',
    'Team culture',
    'Technicians and the shop',
    'Underperformance or accountability',
    'Upset customers'
  ]::text[]
) not valid;
alter table content validate constraint content_situation_tags_known;

-- ---- 3. Assert the structure this migration is responsible for ------------
/*
 * The catalogue half. There is no behaviour to assert over PostgREST here —
 * these are columns and a CHECK, not a policy or a definer function — but the
 * CHECK must be proved NOT VACUOUS, because a constraint that accepts anything
 * looks identical to one that is working. 0163's own "the check constraint is
 * not doing anything" assertion is the shape being copied.
 */
do $$
declare
  _cols     int;
  _tags     int;
  _accepted boolean;
  _violated text;
begin
  select count(*) into _cols
    from information_schema.columns
   where table_name = 'content'
     and column_name in ('series', 'meeting_length', 'meeting_format',
                         'situation_tags', 'classification_line');
  if _cols <> 5 then
    raise exception
      '0183: expected all five columns on content, found %. series and '
      'classification_line did not exist before this migration — check the '
      'alter above.', _cols;
  end if;

  /* The identity index, because without it the loader's "one row per meeting"
     is a promise rather than a property. */
  if not exists (
    select 1 from pg_class where relname = 'content_classification_line_idx') then
    raise exception
      '0183: content_classification_line_idx was not created, so two rows '
      'could claim the same meeting.';
  end if;
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = 'content_classification_line_idx'
       and i.indisunique and i.indpred is not null) then
    raise exception
      '0183: content_classification_line_idx must be UNIQUE and PARTIAL — '
      'unique so a meeting cannot have two rows, partial so the films with no '
      'slate do not collide on NULL.';
  end if;

  /* The array type, not just the name. A `text` column called situation_tags
     would satisfy the count above and then accept the string '{a,b}' as one
     scalar, which no tag filter would ever match. */
  perform 1 from information_schema.columns
    where table_name = 'content' and column_name = 'situation_tags'
      and data_type = 'ARRAY';
  if not found then
    raise exception '0183: content.situation_tags is not an array type';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'content'::regclass
       and conname = 'content_situation_tags_known') then
    raise exception '0183: content_situation_tags_known was not created';
  end if;

  /* All 24 named. A constraint that lost half the list would still be a
     constraint, and would reject tags Mitch is already using. */
  select count(*) into _tags
    from unnest(array[
      'Active delivery','Attach rate or ticket flat','CSI and surveys','Contests',
      'Coverage Is Key','End of month','Language and word tracks','Manager self-work',
      'Menu sales','Mid-month','Morale and recognition','New hire or onboarding',
      'Objections and deferred work','One-on-one coaching','Phones and BDC',
      'Product knowledge and launches','Seasonal','Slow traffic or prospecting',
      'Standards and process','Start of month','Team culture','Technicians and the shop',
      'Underperformance or accountability','Upset customers']) t
   where pg_get_constraintdef(
           (select oid from pg_constraint
             where conrelid = 'content'::regclass
               and conname = 'content_situation_tags_known')) like '%' || t || '%';
  if _tags <> 24 then
    raise exception
      '0183: content_situation_tags_known names % of the 24 Tag Guide tags. '
      'A short list rejects tags the workbook already uses.', _tags;
  end if;

  /* NOT VACUOUS. A known-bad tag must be refused, and a known-good one
     accepted — both halves, because a refusal is not self-verifying and
     neither is an acceptance. Done on a throwaway row inside a subtransaction
     so nothing survives.
     ------------------------------------------------------------------------
     THE FIRST VERSION OF THIS BLOCK WAS VACUOUS, AND THE ACCEPT ARM CAUGHT IT.
     ------------------------------------------------------------------------
     It inserted a `manager_video` with no `placement`, which violates
     `content_manager_placement` (0168): a manager film MUST carry
     placement = 'manager_meeting'. So BOTH probes raised check_violation from
     a constraint that has nothing to do with situation tags — the refusal arm
     "passed" without this constraint ever being consulted, and the acceptance
     arm failed and said so. Exactly the shape this file's own header warns
     about: the accept test is the one that gets skipped, and it is the one
     that catches this.
     Two fixes, both necessary: every probe now satisfies 0168's placement
     rule, and the refusal arm asserts WHICH constraint refused it. Catching
     `check_violation` alone would go green again the next time somebody adds
     an unrelated CHECK to `content`. */
  begin
    insert into content (type, status, title, placement, situation_tags)
    values ('manager_video', 'draft', '0183 constraint probe', 'manager_meeting',
            array['Seasonal', 'this is not a tag']);
    raise exception
      '0183: content_situation_tags_known accepted an unknown situation tag — '
      'the constraint is not doing anything';
  exception
    when check_violation then
      get stacked diagnostics _violated = constraint_name;
      if _violated is distinct from 'content_situation_tags_known' then
        raise exception
          '0183: the unknown-tag probe was refused by %, not by '
          'content_situation_tags_known. The tag constraint was never '
          'consulted, so this assertion proves nothing about it.',
          coalesce(_violated, '(unnamed constraint)');
      end if;
  end;

  begin
    insert into content (type, status, title, placement, situation_tags)
    values ('manager_video', 'draft', '0183 constraint probe', 'manager_meeting',
            array['Seasonal', 'Manager self-work']);
    _accepted := true;
    delete from content where title = '0183 constraint probe';
  exception
    when check_violation then
      get stacked diagnostics _violated = constraint_name;
      _accepted := false;
  end;
  if not _accepted then
    raise exception
      '0183: two tags that are both in the Tag Guide were REFUSED, by %. '
      'If that is content_situation_tags_known the constraint is wrong in the '
      'cautious direction — the half that survives review because it looks '
      'like care. If it is another constraint, this probe is not isolating '
      'the one under test.', coalesce(_violated, '(unnamed constraint)');
  end if;

  /* And a NULL passes, which is the documented behaviour rather than an
     oversight — asserted so that a later NOT NULL cannot be added without
     this failing and making somebody read the column comment. */
  begin
    insert into content (type, status, title, placement, situation_tags)
    values ('manager_video', 'draft', '0183 constraint probe', 'manager_meeting', null);
    delete from content where title = '0183 constraint probe';
  exception
    when others then
      raise exception
        '0183: an untagged row was refused. situation_tags is deliberately '
        'nullable — the 17 Bank Account films carry no tags. See the column '
        'comment.';
  end;

  raise notice
    '0183: series, meeting_length, meeting_format, situation_tags and '
    'classification_line are on content; content_classification_line_idx is '
    'unique and partial, so one meeting cannot have two rows; '
    'content_situation_tags_known names all 24 Tag Guide tags, refuses an '
    'unknown tag (asserting WHICH constraint refused, after the first version '
    'of this block was refused by 0168''s placement rule and proved nothing), '
    'accepts two known ones, and is inert on NULL by design. No count of '
    'meetings is asserted anywhere — the library is still being filmed.';
end $$;

notify pgrst, 'reload schema';
