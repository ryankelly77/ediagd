-- ============================================================================
-- EDIAGD — 0068 Somewhere to put the Fact, and a record of where a row came from
--
-- Phase 1 of the knowledge re-import. Three additive nullable columns and no
-- backfill: the importer in scripts/import-knowledge.ts is what fills them.
--
-- The alias table the Phase 0 report asked for here already exists — 0066 built
-- `mapping_alias` when the op-code map landed, including the three A/C codes.
-- So this migration is smaller than the report predicted.
-- ============================================================================


alter table content
  /*
   * THE UNTRUNCATED FACT.
   *
   * The 450 arrived as 60-character stumps because the original import kept
   * only the title and dropped every other column of a five-column record. The
   * servable one-liner goes in `body`, as it always has — but the whole Fact is
   * lesson material the LMS will need for service-knowledge lessons, and there
   * is nowhere on `content` to put a paragraph today.
   *
   * NOT `best_used_for`, which was the tempting shortcut. That is a phrase
   * field the quote screens render inline; putting a paragraph in it would put
   * lesson material on a quote card. Separate meanings get separate columns.
   */
  add column if not exists detail text,

  /*
   * WHERE THE ROW CAME FROM, AS A PAIR.
   *
   * `source` already holds a label ('Mitch import — Product Knowledge — Belts')
   * and is kept, because it is what the existing draft rows match on. But a
   * label cannot answer "which row of which tab", which is the question every
   * re-run of the importer has to answer to avoid inserting a second copy of a
   * row it already imported.
   *
   * This is the idempotency key. Without it, the only way to recognise a row is
   * by its text, and the text is exactly what a re-import changes.
   */
  add column if not exists source_tab text,
  add column if not exists source_row int;

comment on column content.detail is
  'The full untruncated Fact from the knowledge workbook. Lesson material for '
  'the LMS; `body` stays the servable one-liner.';
comment on column content.source_tab is
  'Worksheet name in data/Ediagd_master_2026_08_17_v2.xlsx. With source_row, '
  'the importer''s idempotency key.';

/*
 * ONE CONTENT ROW PER SOURCE ROW, and the lookup index in the same object.
 *
 * The importer is meant to be re-runnable — Mitch will revise the workbook and
 * a re-run is how a revision lands — and the failure mode of a re-runnable
 * importer is a second copy of everything. A unique index makes that a database
 * error rather than a silently doubled library, which is the lesson the quote
 * dedupe in 0065 already cost us once.
 *
 * It serves the importer's per-row lookup too, so there is no second plain
 * index on the same pair. Partial: only imported rows carry it, and the quotes
 * and videos never will.
 */
create unique index if not exists content_source_row_unique_idx
  on content(source_tab, source_row)
  where source_tab is not null;
