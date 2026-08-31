-- ============================================================================
-- EDIAGD — 0062 The content model: five tags, versions, and a retire that is
--               not a delete
--
-- The taxonomy predates quotes, mindset, onboarding and certifications. One
-- column (`type`) carried format AND collection AND entitlement at once, and
-- everything added since — `series`, `placement`, `tier`, `module_id` — landed
-- beside it rather than under a model. This is the model.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT TOUCHED
-- ---------------------------------------------------------------------------
--   `type`         stays exactly as it is. It is the paywall: the RLS policy
--                  content_entitled_read runs role × product through
--                  roles_for_content_type() and product_for_content_type().
--                  Nothing here goes near it.
--   `tier`         stays the content_tier enum. Converting 1,707 cue rows to
--                  text for a check constraint buys nothing.
--   `duration_sec`, `vertical_asset_id`, `vertical_playback_id`
--                  keep their names. The spec called them duration_seconds and
--                  mux_vertical_*; renaming would touch lib/daily.ts, both Mux
--                  libraries, the webhook, two scripts and the derive queue
--                  view to change nothing about behaviour.
--   `archived_at`  keeps its 0058 meaning — "a trim replaced the master, and
--                  the superseded asset is traceable". The soft delete added
--                  here is `retired_at`, a different word for a different
--                  thing, so the two can never be confused in a query.
--   `placement`    STAYS. It is structure, not a shelf: lib/daily.ts says so at
--                  the point of use — "content_type says who may see a thing;
--                  placement says where the app surfaces it. Both videos in the
--                  library are advisor_video — one belongs in the daily loop and
--                  one in onboarding, and only placement can tell them apart."
--                  `series` is the shelf and it is the one that goes.
-- ============================================================================


-- ---- 1. The canonical service op-code catalog ------------------------------
/*
 * A NEW TABLE, NOT THE EXISTING `op_code`.
 *
 * `op_code` looks free — it is empty — but it is not the same thing. 0001
 * defines it with `id text primary key -- e.g. '35122'` and
 * `membership.op_code_id text references op_code(id)` points at it. Those ids
 * are DMS OPERATOR IDS: 35122 is David Esparza, 671 is Erin Helton. Seeding 73
 * service codes (EAF-001, WTR-021) into that table would leave every advisor
 * membership foreign-keyed to a catalog of engine air filters.
 *
 * The two share a name and nothing else. This is the service catalog; `op_code`
 * stays the operator registry.
 */
create table if not exists op_code_catalog (
  code                  text primary key,          -- 'EAF-001'
  sort_order            int  not null,
  category              text not null,             -- 'Filters', 'Brakes', …
  name                  text not null,             -- 'Engine Air Filter'
  -- Codes that ride along with this one on the same RO. Text, not an array of
  -- foreign keys: see the note on unresolved refs below.
  piggyback_partners    text,
  /*
   * REFS MITCH WROTE THAT DO NOT EXIST — WTR-022, WTR-023, WBF-019, WBF-020,
   * TIR-022, TRO-024. Kept as text precisely so they are visible and can be
   * handed back to him. A foreign key would have forced us to either invent the
   * six codes or drop the information, and both lose the question.
   */
  piggyback_unresolved  text,
  piggyback_note        text,
  notes                 text,
  updated_at            timestamptz not null default now()
);

comment on table op_code_catalog is
  'Service op codes (EAF-001 …). NOT op_code, which is the DMS operator-id '
  'registry that membership.op_code_id points at. Seeded from op_code_seed.csv '
  'by scripts/seed-op-codes.ts; re-running the seed is how Mitch''s revisions land.';

alter table op_code_catalog enable row level security;

-- Reference data: readable by any signed-in user, writable by admins only.
drop policy if exists op_code_catalog_read on op_code_catalog;
create policy op_code_catalog_read on op_code_catalog
  for select using ((select auth.uid()) is not null);

drop policy if exists op_code_catalog_admin on op_code_catalog;
create policy op_code_catalog_admin on op_code_catalog
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));


-- ---- 2. The five tags on content -------------------------------------------
alter table content
  /*
   * WHICH SHELF. Six collections, and 'Daily Series' is deliberately not one of
   * them — that is a structure (where a thing is served), which `placement`
   * already models. Drive's 02 — Published gains Mindset and Craft folders to
   * match; the model is the source of truth and the folders follow it.
   */
  add column if not exists collection text,
  -- WHAT KIND OF ARTIFACT. Separate from `type`, which is the entitlement gate.
  -- One idea can exist as a quote and a video; that is two formats, one idea.
  add column if not exists format text,
  -- Which take is live. History lives in content_version.
  add column if not exists version int not null default 1,
  -- Where in the conversation a pitch belongs. Only meaningful with an op code.
  add column if not exists stage text,
  -- What Mitch named the file, and what ingest normalised it to. The second is
  -- how a re-drop of the same working name is matched to this artifact.
  add column if not exists source_filename text,
  add column if not exists canonical_filename text,
  /*
   * SOFT DELETE. Not `archived_at` — see the header. Retiring withdraws an
   * artifact from the library while every foreign key survives: lesson credit,
   * saves, view history and completed-day records must never break because
   * somebody tidied the CMS.
   */
  add column if not exists retired_at timestamptz,
  -- Read back from Mux, for the detail screen's Mux card.
  add column if not exists width int,
  add column if not exists height int;

create index if not exists content_collection_idx on content(collection);
create index if not exists content_format_idx on content(format);
create index if not exists content_op_code_idx on content(op_code);
-- The library and every daily draw want live rows only.
create index if not exists content_live_idx on content(status) where retired_at is null;


-- ---- 3. Version history ----------------------------------------------------
/*
 * The content row points at the ACTIVE take; this keeps the old ones.
 *
 * The Mux ids are copied in rather than referenced, because the point is to
 * survive the content row moving on: when a re-shoot lands, the new asset ids
 * go on `content` and the previous ones stay here. Nothing deletes a Mux asset
 * — a rollback needs the old one to still exist, and Mux storage is cheap
 * against re-shooting a video.
 */
create table if not exists content_version (
  id                    uuid primary key default gen_random_uuid(),
  content_id            uuid not null references content(id) on delete cascade,
  version               int  not null,
  mux_asset_id          text,
  mux_playback_id       text,
  vertical_playback_id  text,
  source_filename       text,
  created_at            timestamptz not null default now(),
  -- Null on the active version; set when a newer take replaces it.
  superseded_at         timestamptz,
  unique (content_id, version)
);
create index if not exists content_version_content_idx on content_version(content_id);

alter table content_version enable row level security;

-- Same power as editing the content itself. Advisors never see this.
drop policy if exists content_version_admin on content_version;
create policy content_version_admin on content_version
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
         or is_platform_owner())
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
         or is_platform_owner());


-- ---- 4. The checks that tolerate a null ------------------------------------
/*
 * These go in NOW because they permit null, so they hold against un-backfilled
 * rows. The three that require clean data — Pitches ⇒ op_code, op_code null ⇒
 * stage null, video ⇒ playable — land in 0063, after the backfill has run and
 * been read. A constraint added before the data can satisfy it is a migration
 * that fails on somebody else's machine.
 */
alter table content drop constraint if exists content_collection_valid;
alter table content add constraint content_collection_valid
  check (collection is null or collection in (
    'Mindset', 'Pitches by Op Code', 'Craft',
    'Onboarding', 'Manager Meetings', 'Joe the Pro'
  ));

alter table content drop constraint if exists content_format_valid;
alter table content add constraint content_format_valid
  check (format is null or format in ('cue', 'quote', 'video', 'quiz'));

alter table content drop constraint if exists content_stage_valid;
alter table content add constraint content_stage_valid
  check (stage is null or stage in (
    'Pre-Write', 'On the Drive', 'At the Kiosk',
    'MPI Setup', 'After-MPI', 'Objections'
  ));

/*
 * content.op_code -> op_code_catalog.code.
 *
 * Safe to add now: the column exists from 0059 and is null on all 2,190 rows,
 * so nothing can violate it. NOT VALID is unnecessary here for that reason.
 */
alter table content drop constraint if exists content_op_code_fk;
alter table content add constraint content_op_code_fk
  foreign key (op_code) references op_code_catalog(code)
  on update cascade on delete set null;
