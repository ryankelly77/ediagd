/* ===========================================================================
   0131 — `daily_craft`, THE SLOT-3 PLACEMENT
   ===========================================================================

   `daily_lifestyle` is slot 1, `daily_pitch` is slot 2, and slot 3 has never had
   a placement because until now nothing module-attached was a video. The thirteen
   craft lesson films attached in 0132 are the first, and calling them
   `daily_lifestyle` would be false about every one of them — a column whose value
   stopped describing the row, which is the defect this file's own rules are
   mostly about.

   NOT `daily_item`. TWO_LADDERS is explicit that nothing in the schema is named
   for the slot's internal name, and Ryan's ruling is that *item* is not a word we
   use — it is a video, a cue or a quiz. `daily_craft` parallels the two that
   exist and says what the content is rather than which slot serves it.

   ---------------------------------------------------------------------------
   THIS MIGRATION DOES NOTHING ELSE, AND THAT IS THE POINT
   ---------------------------------------------------------------------------

   A new enum value cannot be USED as a literal in the transaction that added it.
   0128 worked around that with a text comparison and an assertion that the value
   existed. 0132 has to write the value into rows, which a text comparison cannot
   do — so the value is added here, alone, and Supabase commits this file before
   it begins the next.

   ---------------------------------------------------------------------------
   WHAT READS placement, CHECKED BEFORE THIS LANDED
   ---------------------------------------------------------------------------

   Nothing breaks at runtime: no picker serves a placement it does not name, which
   is what made `reference` safe in 0128.

     lib/loop.ts:181          daily_lifestyle AND collection='Mindset' — excludes
     lib/daily.ts:899         daily_lifestyle — DEAD CODE, no callers
     lib/content-detail.ts    admin display; prints "Placement is daily_craft"
     lib/mileage.ts           reference — excludes
     0057                     a partial index, `where placement is not null`
     0128                     two exclusions of 'reference'

   Three sites ENUMERATE placements in TypeScript and are already stale by two —
   neither `technician_daily` (0090) nor `reference` (0128) was ever added to any
   of them: lib/mux/upload.ts, lib/video/ingest-routing.ts,
   components/admin/content/VideoUploader.tsx. A fifth value inherits that gap
   rather than creating it. Deriving them from one constant with an exhaustiveness
   test is agreed and is a separate change — a hand-maintained list of a database
   enum's values has now silently missed two migrations, which is documentation
   wearing a contract's clothes.
   =========================================================================== */

alter type content_placement add value if not exists 'daily_craft';

/*
 * ASSERT IT LANDED. 0132 writes this value into rows and will fail loudly if it
 * is absent, but failing here says why, and a migration that silently adds
 * nothing is the shape this project keeps finding.
 */
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'content_placement' and e.enumlabel = 'daily_craft'
  ) then
    raise exception '0131 failed to add ''daily_craft'' to content_placement';
  end if;
  raise notice '0131: content_placement now has daily_craft';
end
$$;
