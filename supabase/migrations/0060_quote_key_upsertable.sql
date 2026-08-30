-- ============================================================================
-- EDIAGD — 0060 Make quote_key usable as an upsert target
--
-- 0059 made the unique index PARTIAL (`where quote_key is not null`) on the
-- reasoning that 1,734 existing rows share a null key and would collide. That
-- reasoning was wrong: a Postgres unique index already treats nulls as
-- DISTINCT, so a plain unique index permits any number of null keys. The
-- predicate bought nothing and cost the thing the index exists for.
--
-- ON CONFLICT can only use a partial index if the statement repeats the
-- predicate — `on conflict (quote_key) where quote_key is not null` — and
-- PostgREST's `on_conflict` parameter sends a column list with no room for one.
-- So the import could not upsert at all: "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- Re-importing an edited workbook is the normal case here, not the exception.
-- ============================================================================

drop index if exists content_quote_key_uniq;

create unique index if not exists content_quote_key_uniq on content(quote_key);
