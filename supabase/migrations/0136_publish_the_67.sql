/* ===========================================================================
   0136 — PUBLISH THE 67
   ===========================================================================

   Ryan's ruling, and it is the one that unblocked most of this batch:

     A film can be named and published without a track, without a stage, and
     without a part number. Naming is what the Drop Zone gate is for. Routing is
     a separate decision that happens in the database afterwards, and it does not
     need to happen first. A film waiting on a routing decision does not wait in
     a folder — it gets published and waits in the catalog.

   So thirty of these attach to nothing on purpose: Name Tag (10), Selling Skills
   (10) and Get the Hell Out of Here (9 — not in this batch, they follow) are
   whole series with no track. Fifteen MENU films publish as `reference` with a
   NULL `mileage_rung`, which means the shelf will not show them, because the
   shelf is indexed by rung and a seasonal menu has no mileage. Published and
   invisible beats sitting in a folder; the shelf needs a second axis and that is
   on the 2 October list.

   ---------------------------------------------------------------------------
   WHY THIS IS A MIGRATION AND NOT A FLAG
   ---------------------------------------------------------------------------

   `--publish-when-ready` IS NOT IMPLEMENTED. It appears in ingest-videos.ts's own
   usage block and in a comment describing publishing as "a separate deliberate
   step (--publish-when-ready, or the admin screen)" — and nothing parses it. The
   run was given that flag and silently ignored it, leaving all 66 rows draft.
   An unrecognised flag that produces no error and no effect is the silent-check
   rule in argument form; the flag is removed from the docs in the same commit so
   the file stops describing a capability it does not have.

   ---------------------------------------------------------------------------
   AN EXPLICIT LIST, NOT A TIME WINDOW
   ---------------------------------------------------------------------------

   The obvious predicate is "drafts created in the last N hours". It was wrong
   twice in one session: the database clock and the assumed window disagreed, and
   a 4-hour window over rows nine hours old returned zero while 66 rows plainly
   existed. A window is a guess about wall-clock; a list of 67 canonical names is
   a statement about these films. The list is generated from the rows themselves,
   so it carries the names the INGEST invented — voice in parentheses — rather
   than the names staged on disk. 0135's first predicate used the on-disk spelling
   and would have matched nothing.

   Every row is asserted to have a playback id AND a duration before it goes live.
   A published row whose asset is not ready renders a player pointing at nothing,
   and mid-batch that is a real advisor opening a real screen.
   =========================================================================== */

do $$
declare
  _want text[] := array[
    'CRAFT — Coverage is Key, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 10 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 3 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 4 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 5 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 6 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 7 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 8 (Mitch Hardt) — v1.mov',
    'CRAFT — Coverage is Key, Part 9 (Mitch Hardt) — v1.mov',
    'CRAFT — Menu Wrap-Up, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Menu Wrap-Up, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 10 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 3 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 4 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 5 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 6 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 7 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 8 (Mitch Hardt) — v1.mov',
    'CRAFT — Name Tag, Part 9 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 10 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 11 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 12 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 3 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 4 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 5 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 6 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 7 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 8 (Mitch Hardt) — v1.mov',
    'CRAFT — Phones and Tones, Part 9 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 10 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 3 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 4 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 6 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 7 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 8 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, Part 9 (Mitch Hardt) — v1.mov',
    'CRAFT — Selling Skills, The Steer Objection (Mitch Hardt) — v1.mov',
    'FSC-017 — MPI Setup (Mitch Hardt) — v1.mov',
    'MENU — Diesel, Part 1 (Mitch Hardt) — v1.mov',
    'MENU — Diesel, Part 2 (Mitch Hardt) — v1.mov',
    'MENU — Diesel, Part 3 (Mitch Hardt) — v1.mov',
    'MENU — Diesel, Part 4 (Mitch Hardt) — v1.mov',
    'MENU — Diesel, Part 5 (Mitch Hardt) — v1.mov',
    'MENU — Diesel, Part 6 (Mitch Hardt) — v1.mov',
    'MENU — EV Series, Part 1 (Mitch Hardt) — v1.mov',
    'MENU — EV Series, Part 2 (Mitch Hardt) — v1.mov',
    'MENU — EV Series, Part 3 (Mitch Hardt) — v1.mov',
    'MENU — EV Series, Part 4 (Mitch Hardt) — v1.mov',
    'MENU — Seasonal Menus, Part 1 (Mitch Hardt) — v1.mov',
    'MENU — Seasonal Menus, Part 2 (Mitch Hardt) — v1.mov',
    'MENU — Seasonal Menus, Part 3 (Mitch Hardt) — v1.mov',
    'MENU — Seasonal Menus, Part 4 (Mitch Hardt) — v1.mov',
    'MENU — Seasonal Menus, Part 5 (Mitch Hardt) — v1.mov',
    'SPK-043 — After-MPI (Mitch Hardt) — v1.mov',
    'SPK-043 — MPI Setup (Mitch Hardt) — v1.mov',
    'TIR-057 — A Quote on Every Vehicle (Mitch Hardt) — v1.mov',
    'TIR-057 — MPI Setup (Mitch Hardt) — v1.mov',
    'TMB-039 — MPI Setup (Mitch Hardt) — v2.mov',
    'TRO-022 — After-MPI (Mitch Hardt) — v1.mov',
    'TRO-022 — MPI Setup (Mitch Hardt) — v1.mov'
  ];
  _n int;
  _ready int;
  _published int;
begin
  /* ---- 1. IS THIS THE DATABASE THIS MIGRATION IS ABOUT? ------------------ */
  select count(*) into _n from content
   where type = 'advisor_video' and canonical_filename = any(_want);

  if _n = 0 then
    raise notice '0136: none of the 67 films are present — nothing to publish';
    return;
  end if;
  if _n <> 67 then
    raise exception
      '0136: expected 67 films from this batch, found % — refusing rather than publishing a subset', _n;
  end if;

  /* ---- 2. NOTHING GOES LIVE POINTING AT NOTHING -------------------------- */
  select count(*) into _ready from content
   where canonical_filename = any(_want)
     and mux_playback_id is not null and duration_sec is not null;

  if _ready <> 67 then
    raise exception
      '0136: only % of 67 have a playback id and a duration — Mux has not finished transcoding', _ready;
  end if;

  /* ---- 3. PUBLISH -------------------------------------------------------- */
  update content
     set status = 'published', updated_at = now()
   where canonical_filename = any(_want)
     and status = 'draft' and retired_at is null;
  get diagnostics _published = row_count;
  raise notice '0136: published % row(s)', _published;

  /* ---- 4. ASSERT THE POSITIVE HALF, so an empty catalog cannot satisfy it - */
  select count(*) into _n from content
   where canonical_filename = any(_want)
     and status = 'published' and retired_at is null;
  if _n <> 67 then
    raise exception '0136: % of 67 are published and live, expected 67', _n;
  end if;

  /*
   * ---- 5. AND THE NEGATIVE HALF ----------------------------------------
   *
   * The fifteen MENU films must be `reference`, because that placement is what
   * keeps them out of the daily loop — service_family_content excludes it. If
   * the ingest had routed them anywhere else they would now be live AND
   * loop-reachable, which is the thing 0128 exists to prevent.
   */
  select count(*) into _n from content
   where canonical_filename = any(_want) and collection = 'Menu'
     and placement = 'reference';
  if _n <> 15 then
    raise exception '0136: % of the 15 MENU films carry placement=reference', _n;
  end if;

  /*
   * And none of them may carry a mileage_rung. A rung would put a seasonal menu
   * on the mileage shelf between 75,000 and 80,000 miles, which is meaningless.
   */
  select count(*) into _n from content
   where canonical_filename = any(_want) and collection = 'Menu'
     and mileage_rung is not null;
  if _n <> 0 then
    raise exception '0136: % MENU film(s) carry a mileage_rung and would land on the shelf', _n;
  end if;

  raise notice '0136: 67 live — 44 Craft, 15 Menu (reference, no rung), 8 pitch';
end
$$;
