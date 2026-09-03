-- ============================================================================
-- EDIAGD — 0087 Mitch's quiz bank, and the rules that govern it
--
-- 485 questions arrive keyed to DECKS and FILMS. quiz_question was built in
-- 0035 for the LMS's course/module world, so everything below widens it to
-- accept them without disturbing the 28 rows already there or the views that
-- read them.
--
-- Additive only. No column is dropped, no constraint is tightened, and every
-- new column is nullable or defaulted — the existing rows stay valid exactly as
-- they are.
-- ============================================================================

-- ---- 1. A question does not have to belong to a module ---------------------
/*
 * module_id was NOT NULL because in 0035 a question could only exist inside a
 * module. Mitch's bank is organised by deck, and the decks are not modules yet:
 * `Deck Inventory` describes an LMS that has not been built, and inventing 26
 * modules from a spreadsheet to satisfy a foreign key would be letting the
 * import decide the shape of a thing nobody has designed.
 *
 * So a question may now stand on its own. When the LMS build turns decks into
 * modules it can fill this in; until then `deck` below is what organises them,
 * and a null module is an honest "not filed yet" rather than a fabricated
 * parent.
 *
 * The comprehension views join through module, so these questions simply do not
 * appear in them — which is correct. They are not in a module.
 */
alter table quiz_question alter column module_id drop not null;

-- ---- 2. Two options is a legitimate question -------------------------------
/*
 * 167 of the 485 are True/False and carry only A and B. Empty strings would
 * satisfy NOT NULL and would be a lie: a quiz renderer cannot tell "" from an
 * option somebody forgot to type, and it would draw two blank radio buttons.
 * Null means there is no option C.
 */
alter table quiz_question alter column option_c drop not null;
alter table quiz_question alter column option_d drop not null;

-- ---- 3. Mitch's own id, which is the whole basis of re-import --------------
/*
 * THE ID COLUMN DISCIPLINE, AND MITCH BUILT IT HIMSELF.
 *
 * Every row carries EQ0001..EQ0485. The importer matches on this and never on
 * row position, so re-ordering the sheet, inserting a question in the middle,
 * or deleting one cannot silently rewrite a different question — the failure
 * mode that made the knowledge import dangerous before it had an id column.
 *
 * Unique, so a second row claiming the same id is a hard error rather than a
 * quiet overwrite.
 */
alter table quiz_question add column if not exists source_id text;

create unique index if not exists quiz_question_source_id_key
  on quiz_question (source_id) where source_id is not null;

comment on column quiz_question.source_id is
  'Mitch''s Question ID (EQ####) from the Master Quiz Bank. The re-import key: '
  'matched on this, never on row position. Null for questions authored in-app.';

-- ---- 4. Where the question sits in Mitch's structure -----------------------
alter table quiz_question
  add column if not exists deck        text,
  add column if not exists film        text,
  add column if not exists stage       text,
  add column if not exists op_code     text,
  add column if not exists op_codes    text[],
  add column if not exists shared_pool boolean not null default false,
  add column if not exists hint        text,
  add column if not exists volume      text;

comment on column quiz_question.deck is
  'Mitch''s "Deck / Category". For a shared-pool row this is the pool category '
  '(Vocabulary, The close, ...) rather than a product deck.';

comment on column quiz_question.film is
  'Mitch''s "Film / Stage" verbatim, unresolved. Kept alongside `stage` because '
  'his film names are finer-grained than the six stages — "On the Drive, Part 2" '
  'resolves to the stage "On the Drive" and loses the part number doing it.';

comment on column quiz_question.stage is
  'One of the six canonical stages, resolved from `film` through mapping_alias '
  'kind=stage. NULL means no confirmed alias matched — a review item, never a '
  'guess.';

comment on column quiz_question.op_code is
  'The PRIMARY op code for this question''s deck: the first that resolves '
  'against op_code_catalog. NULL is legitimate and common — foundational decks '
  '(Pre-Write, Sing It, Wrap-Up, Overcoming Objections) teach the craft rather '
  'than a product, and shared-pool rows belong to no deck at all.';

comment on column quiz_question.op_codes is
  'Every op code the deck covers, in the order the deck map lists them, '
  'including the primary. The same ruling the knowledge import used: a deck '
  'that covers four codes is not four decks, and the extra codes are recorded '
  'rather than discarded.';

comment on column quiz_question.shared_pool is
  'True for the 46 rows Mitch marks Source = "Shared Pool". The quiz rules draw '
  'Setup and Selling films as 3-from-pool + 2-deck-specific, so this flag has '
  'to survive the import even though the LMS that reads it is not built.';

-- The importer's lookups, and the LMS's.
create index if not exists quiz_question_deck_idx on quiz_question (deck);
create index if not exists quiz_question_pool_idx on quiz_question (shared_pool)
  where shared_pool;
create index if not exists quiz_question_op_code_idx on quiz_question (op_code)
  where op_code is not null;

-- ---- 5. All eight question types -------------------------------------------
/*
 * There was no type column at all: 0035 assumed four options and one right
 * answer. Mitch writes eight kinds, and coercing "Put In Order" or "Which
 * Voice" into "Multiple Choice" would throw away the only thing that tells a
 * renderer how to draw them.
 *
 * Text with a check rather than an enum, for the reason mapping_alias.kind
 * gives: ALTER TYPE ... ADD VALUE cannot run in the same transaction as an
 * insert using the new value, which makes a ninth type a two-deploy change.
 *
 * Default 'Multiple Choice' so the 28 pre-existing rows — which are all
 * four-option multiple choice — get the right answer without a backfill.
 */
alter table quiz_question
  add column if not exists question_type text not null default 'Multiple Choice';

alter table quiz_question drop constraint if exists quiz_question_type_check;
alter table quiz_question add constraint quiz_question_type_check
  check (question_type in (
    'Multiple Choice',
    'True/False',
    'Piggyback',
    'What Do You Say Next',
    'Finish the Track',
    'Spot the Mistake',
    'Which Voice',
    'Put In Order'
  ));

-- ---- 6. Film names are translated in the table, not in code ----------------
/*
 * mapping_alias already is the place for "old name -> canonical thing", and its
 * `kind` was left as text-with-a-check precisely so new kinds could be added.
 * 'stage' is one: Mitch's film names drift from the six stages, and the drift
 * is data that Mitch can fix from the Aliases screen rather than a lookup
 * buried in a script only a developer can edit.
 */
alter table mapping_alias drop constraint if exists mapping_alias_kind_check;
alter table mapping_alias add constraint mapping_alias_kind_check
  check (kind in ('op_code', 'collection', 'voice', 'service_family', 'stage'));

-- ---- 7. Evidence for a proposal --------------------------------------------
/*
 * Mitch's deck-map proposals arrive with the numbers that justify them: how
 * many ROs the sub-category did in August, the labor behind them, how many of
 * the eleven stores see it. A confirmation screen that shows "Air Filter ->
 * EAF-001, confirm?" is asking Mitch to remember; one that shows "548 ROs,
 * $17,025 labor, 11 stores" is showing him the reason.
 *
 * Nullable, because most aliases have no volume behind them and never will.
 */
alter table mapping_alias
  add column if not exists evidence_ros    int,
  add column if not exists evidence_labor  numeric(12,2),
  add column if not exists evidence_stores int,
  add column if not exists evidence_period text;

comment on column mapping_alias.evidence_period is
  'Which period the evidence numbers describe, e.g. "Aug 2026". Without it the '
  'counts are unfalsifiable a year from now.';

-- ---- 8. The quiz rules, out of the spreadsheet -----------------------------
/*
 * From the Master's Summary tab. They live in config because the LMS build has
 * to read them from somewhere, and "somewhere" must not be a tab in a workbook
 * in a folder — the rules and the code that applies them drift apart the first
 * time one of them is edited without the other.
 *
 * quiz_pass_pct already existed and already reads 80, which is Mitch's rule
 * exactly; it is left alone rather than re-asserted.
 */
alter table game_settings
  add column if not exists quiz_questions_per_film   int not null default 5,
  add column if not exists quiz_pool_draw            int not null default 3,
  add column if not exists quiz_deck_specific_draw   int not null default 2,
  add column if not exists quiz_repeat_film_on_fail  boolean not null default true,
  add column if not exists cert_certified_pct        int not null default 50,
  add column if not exists cert_master_pct           int not null default 80,
  add column if not exists cert_hall_of_fame_pct     int not null default 100;

comment on column game_settings.quiz_questions_per_film is
  'Five per film. Master Quiz Bank -> Summary -> QUIZ RULES.';
comment on column game_settings.quiz_pool_draw is
  'Setup and Selling films draw this many from the shared pool; Drive and Kiosk '
  'films draw none and take all five deck-specific.';
comment on column game_settings.quiz_deck_specific_draw is
  'The deck-specific half of a Setup/Selling film''s five.';
comment on column game_settings.quiz_repeat_film_on_fail is
  'Below quiz_pass_pct the advisor repeats the film and retakes the quiz.';
comment on column game_settings.cert_certified_pct is
  'Certified 50%, Master Certified 80%, Hall of Fame 100% — the three tiers.';
