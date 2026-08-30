-- ============================================================================
-- EDIAGD — 0059 Quotes become a kind of content, and an advisor can keep one
--
-- WHAT THE QUOTE SLOT ACTUALLY SHOWS TODAY. pickQuoteOfDay() draws from
-- `type='cue' AND tier='generic' AND service_family IS NULL` — 404 rows, all of
-- them full coaching passages: "The Money Objection — Sunbit Before They Finish
-- the Sentence", 600 characters of teaching. That is a cue with no service
-- attached, not a quote. Step 1 of the daily loop has never had a quote pool to
-- draw from; it has been borrowing the cue pool and rendering it as a pull
-- quote, which is why the first screen of the day reads like a lesson.
--
-- 503 real quotes now exist (Mitch's Quote Master). They are a different KIND
-- of thing from a cue — attributed to a voice, short, carrying a nugget that
-- explains the coaching use — so they get their own content_type rather than
-- another flavour of 'cue'. That also makes the two pools separable: the quote
-- slot stops eating cues, and the cue fallback stops eating quotes.
--
-- ---------------------------------------------------------------------------
-- WHY NOTHING HERE REFERENCES 'quote'
-- ---------------------------------------------------------------------------
-- A value added by ALTER TYPE ... ADD VALUE cannot be USED until the
-- transaction commits, and Supabase runs each migration file in one. Same
-- constraint 0034 hit and documented. So: the enum gains the value here, and
-- every literal use of it lives in the import script and the app, which run
-- afterwards. Two consequences worth naming rather than discovering later:
--
--   * There is no CHECK tying the quote columns to type='quote'. It would need
--     the literal. The unique key on quote_key is what actually keeps the
--     import honest, and it works without one.
--   * The entitlement policy needs NO change. roles_for_content_type() and
--     product_for_content_type() both fall through to `else` — advisor,
--     advisor_base — which is exactly the gate a quote should sit behind, the
--     same one cues already sit behind. Verified by reading both functions
--     rather than assuming: 0010 for the product, 0034 for the roles.
-- ============================================================================

-- ---- 1. A quote is its own kind of content ---------------------------------
alter type content_type add value if not exists 'quote';

-- ---- 2. Which of the day's two quote slots a quote can fill ----------------
--
-- Slot 1 (the sales tip for the advisor's op code) is NOT a quote — it is the
-- coaching cue on step 2, already op-code mapped. The two quote slots are:
--
--   slot2  a quote that carries a SELLING lesson
--   slot3  a mindset / character / life quote — no sales ask
--   both   works in either, depending on the day
--
-- 'both' is a majority of the file (263 of 503), so it is a real third state
-- and not a shrug: those quotes are eligible for either draw.
do $$ begin
  create type quote_slot as enum ('slot2', 'slot3', 'both');
exception when duplicate_object then null;
end $$;

-- ---- 3. The quote columns --------------------------------------------------
--
-- On `content` rather than a side table, matching how this table already
-- carries per-kind column clusters: mux_* for video, module_* for lessons,
-- tier for cues. A quote row reuses body (the quote), title (its context
-- label) and subcategory (its section) and adds only what has no home.
alter table content
  -- Q0001…Q0503. The workbook's own key, so a re-import updates rather than
  -- duplicates and Mitch and the database can talk about the same row.
  add column if not exists quote_key         text,
  -- Who said it. NOT an author/created_by — "Kobe Bryant" is attribution shown
  -- on screen, and 39 distinct voices carry the diversity rule in the daily draw.
  add column if not exists voice             text,
  add column if not exists quote_slot        quote_slot,
  -- The coaching use: what this quote is FOR, shown under it as the kicker.
  add column if not exists coaching_nugget   text,
  add column if not exists best_used_for     text,
  -- Flags a quote whose selling lesson still needs writing out in plain terms.
  -- An ADMIN FILTER, NOT A GATE: these serve normally today. Gating them would
  -- silently drop 216 of 503 quotes out of the app.
  add column if not exists needs_translation boolean not null default false,
  -- Round two: nobody has mapped a quote to an op code yet. Column E of every
  -- quote tab is empty. Importable now so the mapping pass is data, not schema.
  add column if not exists op_code           text;

-- One row per workbook quote. Partial, because 1,734 existing rows have no key
-- and must not collide with each other on null.
create unique index if not exists content_quote_key_uniq
  on content(quote_key) where quote_key is not null;

-- The daily draw filters on slot and orders by id; these are the two it needs.
create index if not exists content_quote_slot_idx on content(quote_slot)
  where quote_slot is not null;
create index if not exists content_voice_idx on content(voice)
  where voice is not null;

-- ---- 4. Keeping one -------------------------------------------------------
--
-- SEPARATE FROM content_progress, DELIBERATELY. Progress answers "did you get
-- through it" and is written by the app on the advisor's behalf; a save answers
-- "I want this again" and is only ever the advisor's own act. Folding a heart
-- into a watched_pct row would mean an advisor's private keep is created as a
-- side effect of finishing a day, and would be visible to their manager through
-- progress_team_read.
--
-- A save is not coaching data. Nobody reads it but its owner.
create table if not exists saved_content (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  rooftop_id  uuid not null references rooftop(id) on delete cascade,
  content_id  uuid not null references content(id) on delete cascade,
  saved_at    timestamptz not null default now(),
  unique (user_id, content_id)
);
create index if not exists saved_content_user_idx on saved_content(user_id);
create index if not exists saved_content_content_idx on saved_content(content_id);

alter table saved_content enable row level security;

-- Yours, and only ever yours. No manager read, no admin read — see above.
drop policy if exists saved_self_all on saved_content;
create policy saved_self_all on saved_content
  for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    -- The rooftop has to be one you actually belong to, so a save cannot be
    -- filed against a store you have no membership at.
    and exists (
      select 1 from membership m
      where m.user_id = (select auth.uid())
        and m.rooftop_id = saved_content.rooftop_id
        and m.active
    )
  );
