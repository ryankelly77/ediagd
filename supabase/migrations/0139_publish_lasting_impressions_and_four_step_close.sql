/* ===========================================================================
   0139 — LASTING IMPRESSIONS (12) AND FOUR STEP CLOSE (10)
   ===========================================================================

   Mitch shot the two emptiest tracks in the credential, and he shot them the day
   after the report naming them went out.

     Lasting Impressions   core, inactive, 0 videos   ->  12 films
     Four Step Close       core, inactive, 0 videos   ->  10 films

   Published and attached to nothing, per the standing ruling that naming is not
   routing. **Attaching them to those tracks is Mitch's confirmation, not an
   inference from the title** — the slates say "Lasting Impressions Part 1" and
   the tracks happen to be called that, which is strong evidence and not a
   decision this migration is entitled to make.

   ---------------------------------------------------------------------------
   WHAT "0 VIDEOS" MEANS, AND THE CORRECTION BEHIND IT
   ---------------------------------------------------------------------------

   An earlier report gave these tracks film counts taken from
   `certification.item_count`, which counts ITEMS — and almost every item in this
   catalog is a cue. Counted by type:

     Menus                   7 videos    0 cues
     Walk Around             3 videos   56 cues
     Overcoming Objections   2 videos   29 cues
     Success Cycle           0 videos   55 cues
     Power of Positive Lang. 0 videos   51 cues
     everything else         0 videos

   Three tracks contain any video at all; twelve videos across the whole
   credential. The report had said 59, 55 and 51 "films" for the top three. A
   column headed "films it can serve" was counting something else, which is this
   codebase's oldest rule turned on its author.

   ---------------------------------------------------------------------------
   ONE FILM CAME BACK THROUGH THE RECONCILER
   ---------------------------------------------------------------------------

   `Four Step Close, Part 4` uploaded cleanly and its Mux asset reached `ready`
   with a playback id and a duration — and the `video.asset.ready` webhook never
   arrived. The upload sat at `asset_created` for 112 minutes while the other 22
   completed in seconds. Nothing errored; the row simply did not exist.

   It was rebuilt with `npm run reconcile:uploads -- --apply`, which exists for
   exactly this and mirrors the webhook rather than reinventing it. Asking Mux
   directly is what distinguished "still transcoding" from "webhook lost" — the
   database could not tell the difference, and waiting longer would never have
   resolved it.

   Seven older uploads still sit at `waiting` with no content row. They are not
   this batch and are not touched here.
   =========================================================================== */

do $$
declare
  _want text[] := array[
    'CRAFT — Four Step Close, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 10 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 3 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 4 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 5 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 6 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 7 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 8 (Mitch Hardt) — v1.mov',
    'CRAFT — Four Step Close, Part 9 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 10 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 11 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 12 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 3 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 4 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 5 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 6 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 7 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 8 (Mitch Hardt) — v1.mov',
    'CRAFT — Lasting Impressions, Part 9 (Mitch Hardt) — v1.mov'
  ];
  _n int;
  _ready int;
begin
  select count(*) into _n from content
   where type = 'advisor_video' and canonical_filename = any(_want);
  if _n = 0 then
    raise notice '0139: none of the 22 films are present — nothing to publish';
    return;
  end if;
  if _n <> 22 then
    raise exception '0139: expected 22 films, found % — refusing to publish a subset', _n;
  end if;

  select count(*) into _ready from content
   where canonical_filename = any(_want)
     and mux_playback_id is not null and duration_sec is not null;
  if _ready <> 22 then
    raise exception
      '0139: only % of 22 have a playback id and a duration — one may be an unreconciled upload', _ready;
  end if;

  update content set status = 'published', updated_at = now()
   where canonical_filename = any(_want) and status = 'draft' and retired_at is null;
  get diagnostics _n = row_count;
  raise notice '0139: published % row(s)', _n;

  select count(*) into _n from content
   where canonical_filename = any(_want) and status = 'published' and retired_at is null;
  if _n <> 22 then
    raise exception '0139: % of 22 are live, expected 22', _n;
  end if;

  /*
   * ATTACHED TO NOTHING, AND THAT IS ASSERTED RATHER THAN ASSUMED. If a later
   * change attaches them before Mitch rules, this migration stops being a true
   * description of what it did.
   */
  select count(*) into _n from content
   where canonical_filename = any(_want) and module_id is not null;
  if _n <> 0 then
    raise exception '0139: % film(s) are attached to a module — routing is not this migration''s call', _n;
  end if;

  raise notice '0139: 22 live and unattached — Lasting Impressions 1-12, Four Step Close 1-10';
end
$$;
