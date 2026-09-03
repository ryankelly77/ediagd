-- ============================================================================
-- EDIAGD — 0092 Technician Training is a real shelf
--
-- 0091 gave the technician track its content type, its placement and its ingest
-- alias, and missed the one thing that makes the shelf exist: `collection` is
-- not free text. content_collection_valid enumerates the six collections, so
-- inserting a row with collection = 'Technician Training' failed 23514 — found
-- by the acceptance test that publishes a fixture video, not by reading.
--
-- Additive: the six stay, a seventh joins them. The constraint is the reason
-- the admin library's collection dropdown and the shelf a video lands on cannot
-- drift apart, which is worth keeping.
-- ============================================================================

alter table content drop constraint if exists content_collection_valid;
alter table content add constraint content_collection_valid
  check (
    collection is null
    or collection = any (array[
      'Mindset',
      'Pitches by Op Code',
      'Craft',
      'Onboarding',
      'Manager Meetings',
      'Joe the Pro',
      -- 0091's technician track. The SHELF; the access rule is the content
      -- type, which is deliberately a different question.
      'Technician Training'
    ])
  );
