/* ===========================================================================
   0128 — REFERENCE CONTENT, AND THE MILEAGE RUNG
   ===========================================================================

   The 51 mileage-rung films are a LOOKUP CHART, not a course. An advisor reads
   the rung matching the car in front of them. Nothing about them is sequential,
   nothing completes, and — the only requirement that actually matters here —
   none of them may ever appear in slot 1, 2 or 3 of a morning.

   ---------------------------------------------------------------------------
   WHY A PLACEMENT AND NOT A COLLECTION
   ---------------------------------------------------------------------------

   `placement` is the column every slot picker already filters on:

     pickMindset          placement = 'daily_lifestyle' AND collection = 'Mindset'
     pickTechnicianVideo  placement = 'technician_daily'
     pickItem             content.module_id  (a reference film has none)

   A new enum value is therefore excluded from all three BY CONSTRUCTION — not
   by a new condition somebody has to remember to write. That is the whole
   argument for putting it here: the safe behaviour is the default, and adding
   the value cannot change what an existing query returns.

   0090 added 'technician_daily' the same way, so this is the established shape.

   ---------------------------------------------------------------------------
   THE ONE PLACE THAT IS *NOT* SAFE BY CONSTRUCTION, AND IS FIXED BELOW
   ---------------------------------------------------------------------------

   `service_family_content` — which feeds slot 2 through loadFamilyContent —
   filters NEITHER placement nor status. Its first arm reads:

       select c.service_family as family, ..., true as coachable
         from content c
        where c.service_family is not null

   with the comment "A DIRECTLY TAGGED ROW IS COACHABLE BY DEFINITION ...
   Saying `true` here is that statement, not a default."

   That statement was true when the only tagged rows were tagged by hand for
   coaching. It stops being true the moment a REFERENCE row carries a family —
   and the eleven MNU-* bundles map to Oil Change, Tires & Rotation, Fuel
   System, Belts & Cooling, HVAC, Fluids and Maintenance, so a menu film tagged
   with its family would arrive in slot 2 declaring itself coachable, past a
   `coachable` filter that is looking in the other direction.

   This is the AGENTS.md rule about removing an impossibility: the view was
   correct only because no reference content existed. Creating the state removes
   the guarantee, so the gate goes in the view itself — one place, both arms —
   rather than in each of the view's readers.

   ---------------------------------------------------------------------------
   THE RUNG IS STORED, NOT PARSED
   ---------------------------------------------------------------------------

   `mileage_rung` is an integer on the row. The filenames carry it cleanly after
   the rename ("MENU — 25,000 Mile Dealer Upsell Menu, Part 3 — ..."), and that
   is where the backfill reads it from — ONCE, at ingest. Parsing a title at read
   time would make the shelf's grouping depend on a string nobody thinks of as a
   key, and a retitle would silently move a film to another rung.

   Fourteen rungs exist today: 5075, then 10000 through 70000 in 5000s. The
   check below is deliberately wider than that list — Mitch adding an 80,000
   film should not need a migration — but narrow enough to catch a magnitude
   typo, which is the error that would actually happen.
   =========================================================================== */

/* ---- 1. The placement ---------------------------------------------------- */

alter type content_placement add value if not exists 'reference';

/*
 * ASSERT THE VALUE LANDED, BECAUSE THE VIEW BELOW COMPARES IT AS TEXT.
 *
 * A new enum value cannot be used as a literal in the same transaction that
 * added it, so the view predicate is written `c.placement::text <> 'reference'`.
 * That form would also be perfectly happy with a typo — 'referance' would
 * exclude nothing and leak everything, silently, which is this file's own
 * recurring defect. So the string is checked against the enum here, and the
 * migration refuses rather than shipping a gate that cannot fire.
 */
do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'content_placement'
       and e.enumlabel = 'reference'
  ) then
    raise exception
      'content_placement has no value ''reference'' — the view gate below would match nothing';
  end if;
end
$$;

/* ---- 2. The rung --------------------------------------------------------- */

alter table content
  add column if not exists mileage_rung int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_mileage_rung_sane'
  ) then
    alter table content
      add constraint content_mileage_rung_sane
      check (mileage_rung is null or (mileage_rung between 1000 and 200000));
  end if;
end
$$;

comment on column content.mileage_rung is
  'Service-interval rung in miles for reference/menu films — 5075, then 10000..70000 '
  'by 5000 today. Written at ingest from the filename, never parsed at read time. '
  'Null for everything that is not a mileage-rung film.';

/* The shelf''s only query: one rung, its films, in a stable order. */
create index if not exists content_mileage_rung_idx
  on content (mileage_rung, title)
  where mileage_rung is not null;

/* ---- 3. The leak, closed in the view ------------------------------------- */

create or replace view service_family_content as

/* ---- the row carries the family itself ---------------------------------- */
select
  c.service_family                              as family,
  c.id                                          as content_id,
  'family_tag'::text                            as via,
  /*
   * A DIRECTLY TAGGED ROW IS COACHABLE BY DEFINITION — unless it is reference
   * material, which is tagged so the SHELF can group it and not so the loop can
   * serve it. 0066 set `coachable` false for the eleven MNU-* bundles because
   * there is no menu attach rate to be below benchmark on; the same reasoning
   * applies to a directly tagged menu film, and this arm has no op code to
   * learn it from. Hence the placement test rather than a coachable one.
   */
  true                                          as coachable
from content c
where c.service_family is not null
  and coalesce(c.placement::text, '') <> 'reference'

union

/* ---- the row's op code resolves to a family ----------------------------- */
select
  f.family,
  c.id,
  'op_code'::text,
  f.coachable
from content c
join op_code_family f
  on upper(btrim(f.code)) = upper(btrim(c.op_code))
where c.op_code is not null
  and f.retired_at is null
  and coalesce(c.placement::text, '') <> 'reference';

alter view service_family_content set (security_invoker = off);

comment on view service_family_content is
  'One resolution of content to a service family, by direct tag or by op code. '
  'Reference material (placement = ''reference'') is excluded from BOTH arms: it '
  'exists in the library and is never served by the loop. 0128.';

grant select on service_family_content to authenticated;

/* ---- 4. The collection --------------------------------------------------- */

/*
 * 'Menu' HAS TO BE ADDED TO THE CHECK, OR NOTHING CAN BE INGESTED.
 *
 * `collection` is a checked set, not free text — 0092 hit exactly this when
 * adding 'Technician Training' and recorded that the failure was a 23514 at
 * insert time. The alias in section 5 resolves MENU to 'Menu', so without this
 * the ingest would resolve the prefix correctly and then fail on every row.
 *
 * Found by the acceptance suite refusing to seed its own fixture, which is the
 * argument for writing the suite before the surface.
 */
alter table content drop constraint if exists content_collection_valid;
alter table content add constraint content_collection_valid
  check (
    collection is null
    or collection = any (array[
      'Mindset',
      'Pitches by Op Code',
      'Craft',
      'Onboarding',
      'Manager Meetings',
      'Joe the Pro',
      'Technician Training',
      -- 0128's mileage shelf. A shelf of its own so the collection name never
      -- has to be safe; `placement = 'reference'` is what keeps it out of a
      -- morning.
      'Menu'
    ])
  );

/* ---- 5. The prefix ------------------------------------------------------- */

/*
 * MENU -> 'Menu', NOT MENU -> 'Craft'.
 *
 * Aliasing MENU onto Craft was considered and refused: Craft rows are reachable
 * by a lifestyle-placed picker, so the alias alone would have put reference
 * films one `placement` mistake away from a morning. A collection of its own
 * costs nothing and means the collection name never has to be safe — the
 * placement is what makes it safe.
 *
 * CONFIRMED = TRUE, EXPLICITLY.
 *
 * `mapping_alias.confirmed` defaults to FALSE, and 0066's comment says why: "the
 * importer resolves only confirmed ones, so a guess cannot quietly reroute
 * content while it waits for an answer." Taking the default here would leave the
 * alias visible and inert, and the ingest would route 51 films to the review
 * queue instead of to the shelf — a silent no-op that looks like a working
 * migration. This alias is not a guess: Ryan has ruled the shelf ships.
 */
insert into mapping_alias (kind, alias, canonical, confirmed, note)
values ('collection', 'MENU', 'Menu', true,
        'Mileage-rung reference films. 0128 — reference placement keeps them out of the loop.')
on conflict (kind, alias) do update
   set canonical = excluded.canonical,
       confirmed = true,
       note      = excluded.note,
       updated_at = now();
