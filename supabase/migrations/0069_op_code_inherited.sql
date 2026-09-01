-- ============================================================================
-- EDIAGD — 0069 Whether a row's op code was declared on it or inherited
--
-- The knowledge workbook's `Op Code / Pairs With` cell is prose on 117 rows —
-- "All EV op codes", "Tesla 8yr/100-150K", "Ford EV POE CRITICAL". The tab
-- itself declares real codes in its `Op Codes:` header, and a row inside the EV
-- Hybrid tab IS an EV Hybrid row whatever its own cell says. So the importer
-- falls back to the tab's first resolvable header code.
--
-- THAT IS AN INFERENCE, AND IT HAS TO BE VISIBLE AS ONE. A row routed by its
-- own declared code and a row routed by the tab it happened to sit in are not
-- equally trustworthy, and the difference is invisible once both just carry
-- `op_code`. When Mitch reviews routing — or when a family's numbers look
-- wrong — this is the column that says which rows were guessed at.
-- ============================================================================

alter table content
  add column if not exists op_code_inherited boolean not null default false;

comment on column content.op_code_inherited is
  'True when op_code came from the source tab''s `Op Codes:` header rather than '
  'from the row''s own cell. An inference, kept visible as one.';

-- The review screen's question is "show me everything that was inferred", so
-- the index only covers the true rows.
create index if not exists content_op_code_inherited_idx
  on content(op_code) where op_code_inherited;
