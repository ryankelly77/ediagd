-- ============================================================================
-- EDIAGD — 0072 An op code can be withdrawn without being destroyed
--
-- Screen 1 of the Admin Mapping work edits the op-code catalog, and the one
-- thing it must never offer is Delete.
--
-- `op_code_catalog.code` is referenced by content.op_code (`on delete set
-- null`), by op_code_family.code, and by the dealer translation table when it
-- lands. Deleting a code would therefore untag every cue and video filed under
-- it — silently, because `set null` is not an error — and the loss would
-- surface months later as a content gap nobody could explain. The 73 codes are
-- also 73 editorial rulings; the cost of getting one wrong should be reversible.
--
-- So the screen retires. Same word and same mechanism as content.retired_at
-- (0062), for the same reason: withdraw from the pickers, keep every key.
-- ============================================================================

alter table op_code_catalog
  add column if not exists retired_at timestamptz;

comment on column op_code_catalog.retired_at is
  'Withdrawn from the pickers; every foreign key survives. Content already '
  'tagged with a retired code stays tagged — untagging somebody''s work is not '
  'what "retire" should mean.';

/*
 * Live codes are what every picker, seeder and family map wants, and they are
 * the overwhelming majority — so the index covers the live ones rather than
 * the retired ones.
 */
create index if not exists op_code_catalog_live_idx
  on op_code_catalog(code) where retired_at is null;
