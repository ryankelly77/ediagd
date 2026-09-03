-- ============================================================================
-- EDIAGD — 0090 Two enum values, and nothing that uses them
--
-- The technician add-on needs a content type and a placement. Both are enums,
-- and a value added to an enum cannot be USED until the transaction that added
-- it commits — 0034 hit this and wrote it down when it added 'lesson_complete'
-- to sand_reason.
--
-- So this migration adds the values and stops. 0091 is everything that reads
-- them. Splitting is not tidiness: putting them together produces
-- "unsafe use of new value of enum type" and the whole migration fails.
-- ============================================================================

alter type content_type      add value if not exists 'technician_video';
alter type content_placement add value if not exists 'technician_daily';
