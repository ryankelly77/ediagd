-- ============================================================================
-- EDIAGD — 0064 One idea, one item, however many formats
--
-- The content model's centre: a quote Mitch wrote and the video of him saying it
-- are the SAME ARTIFACT in two formats, not two items. The Drive audit proved
-- it — 20 of the 35 ready videos matched a quote already in the library, and
-- six of those matched quotes nobody had written coaching for, because the
-- coaching had been filmed instead.
--
-- Without a link they drift: the quote gets edited, the video keeps the old
-- words, and an advisor gets one on Tuesday and the other on Friday.
--
-- ---------------------------------------------------------------------------
-- A SELF-REFERENCE, NOT A SEPARATE `artifact` TABLE
-- ---------------------------------------------------------------------------
-- An artifact table would be one row per idea and a foreign key from each
-- format — cleaner on paper, and a migration that has to invent an artifact for
-- all 2,190 existing rows before anything can reference one.
--
-- Instead: every row may point at the row that is the "primary" format of its
-- idea, and a row with no pointer is its own artifact. Nothing needs creating,
-- linking is a single update, and unlinking is setting it back to null. The
-- cost is that "all formats of this idea" is two queries rather than one, which
-- is a price worth paying on a screen that loads one item at a time.
-- ============================================================================

alter table content
  add column if not exists artifact_id uuid references content(id) on delete set null;

comment on column content.artifact_id is
  'The row that is the primary format of this idea. Null means this row IS the '
  'primary. A quote and the video of it share one artifact_id so editing either '
  'can surface the other.';

create index if not exists content_artifact_idx on content(artifact_id)
  where artifact_id is not null;

-- A row cannot be its own twin: that reads as "linked" everywhere while
-- pointing nowhere, which is worse than being unlinked.
alter table content drop constraint if exists content_artifact_not_self;
alter table content add constraint content_artifact_not_self
  check (artifact_id is null or artifact_id <> id);
