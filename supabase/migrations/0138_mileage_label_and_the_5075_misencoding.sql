/* ===========================================================================
   0138 — "5,075 MILES" IS A TRANSCRIPTION OF "5,000–7,500"
   ===========================================================================

   Two films on the mileage shelf sit at rung 5075. There is no 5,075 mile
   service. The film says so in its own first sentence:

     "The Ladder — 5,075-hundred mile services. Aloha! First rung on the ladder
      — 5,000-7500 mile service."

   Whisper collapsed "5,000–7,500" into "5,075", the ingest read the number out
   of the title, and the shelf has been offering an interval no manufacturer
   publishes. Confirmed by transcribing both masters rather than by trusting the
   report of it.

   The second film names the first, which also fixes their order:
   "part one of the 5,075 Mile Service video said offer nothing" — so (2714) is
   part one and (2716) is part two.

   ---------------------------------------------------------------------------
   WHY THE TITLE ALONE WOULD NOT HAVE FIXED THIS
   ---------------------------------------------------------------------------

   The obvious repair is to edit the two titles. It would have changed nothing an
   advisor sees on the shelf, because the shelf heading is DERIVED:

     lib/mileage.ts   formatMiles(miles) => miles.toLocaleString("en-US")

   The rung heading is computed from `mileage_rung`, not read from the title. Fix
   the title and the shelf still says "5,075 miles" — a correct-looking change
   that leaves the defect exactly where it was. The label an advisor reads and the
   field a human would edit were two different things.

   ---------------------------------------------------------------------------
   AND A SINGLE INTEGER CANNOT HOLD "5,000/7,500"
   ---------------------------------------------------------------------------

   `mileage_rung` is an int. The real interval is a PAIR, and the factory treats
   it as one service. So there are three candidate repairs:

     rung = 5000 alone         the shelf reads "5,000 miles" and the 7,500
                               interval silently has no film
     two rows                  duplicates a film to fill two rungs, which is the
                               thing 0128's one-film-one-row shape exists to avoid
     rung = 5000 + a label     ordering and the URL keep working on the integer,
                               and the heading says what the film says

   The third. `mileage_label` is added here: nullable, and every existing rung
   keeps rendering from the integer exactly as before, because `formatMiles` stays
   the fallback. One row gains a label; twenty-three rungs are untouched.

   THIS IS THE SHELF'S SECOND AXIS ARRIVING EARLY, IN MINIATURE. The 2 October
   list already carries it, because fifteen Seasonal/EV/Diesel MENU films have no
   mileage at all and are published with a NULL rung. This migration does not
   solve that — it adds the one field that makes a rung able to describe itself,
   which is the smaller half of the same problem.

   ---------------------------------------------------------------------------
   THE FILENAMES ARE LEFT ALONE, DELIBERATELY
   ---------------------------------------------------------------------------

   `canonical_filename` and `source_filename` still read "5,075", and they stay
   that way: they record what the file on disk is actually called, and a database
   that renames a file it has not renamed is the canonical-versus-source confusion
   from the other direction. Renaming the two masters in `02 - Published/Menu` is
   a separate act that needs Ryan to confirm the exact proposal, as every rename
   does. Until then the row says the true thing about the film and the true thing
   about the file, which are different things.
   =========================================================================== */

alter table content add column if not exists mileage_label text;

comment on column content.mileage_label is
  'What the shelf heading should read for this rung, when the integer cannot say '
  'it — e.g. "5,000/7,500" for a paired interval. NULL means render from '
  'mileage_rung, which is the case for every ordinary rung.';

do $$
declare
  _n int;
  _ids uuid[];
begin
  select array_agg(id) into _ids from content
   where mileage_rung = 5075 and placement = 'reference' and retired_at is null;

  if _ids is null then
    raise notice '0138: no rung-5075 films present — nothing to correct';
    return;
  end if;
  if array_length(_ids, 1) <> 2 then
    raise exception '0138: expected exactly 2 films at rung 5075, found % — refusing',
      array_length(_ids, 1);
  end if;

  /*
   * REFUSE IF 5,000 IS ALREADY OCCUPIED. Moving these onto a rung that already
   * has films would merge two intervals into one shelf entry silently, and the
   * count would still look plausible.
   */
  select count(*) into _n from content
   where mileage_rung = 5000 and placement = 'reference' and retired_at is null;
  if _n <> 0 then
    raise exception '0138: rung 5000 already holds % film(s) — refusing to merge', _n;
  end if;

  update content
     set mileage_rung  = 5000,
         mileage_label = '5,000/7,500',
         title = replace(title, '5,075 Mile', '5,000/7,500 Mile'),
         updated_at = now()
   where id = any(_ids);

  get diagnostics _n = row_count;
  if _n <> 2 then
    raise exception '0138: expected to correct 2 rows, updated %', _n;
  end if;

  /* ---- ASSERT BOTH HALVES ------------------------------------------------ */

  select count(*) into _n from content where mileage_rung = 5075;
  if _n <> 0 then
    raise exception '0138: % row(s) still sit at rung 5075', _n;
  end if;

  select count(*) into _n from content
   where mileage_rung = 5000 and mileage_label = '5,000/7,500'
     and title like '5,000/7,500 Mile%' and placement = 'reference'
     and status = 'published' and retired_at is null;
  if _n <> 2 then
    raise exception '0138: only % of 2 films carry the corrected rung, label and title', _n;
  end if;

  /*
   * AND THE SHELF MUST STILL BE ABLE TO SERVE THEM — lib/mileage.ts's own
   * predicate, not a proxy. A correction that made the rung unreachable would
   * satisfy every count above.
   */
  select count(*) into _n from content
   where placement = 'reference' and status = 'published' and retired_at is null
     and mileage_rung = 5000 and mux_playback_id is not null;
  if _n <> 2 then
    raise exception '0138: only % of 2 films are playable on the corrected rung', _n;
  end if;

  /*
   * NO OTHER RUNG CHANGED. The whole shelf was checked before this ran and 5075
   * was the only value that is not a multiple of 2500 — a class of one. This
   * asserts the repair did not quietly touch the other twenty-three.
   */
  select count(distinct mileage_rung) into _n from content
   where placement = 'reference' and retired_at is null and mileage_rung is not null;
  if _n <> 24 then
    raise exception '0138: the shelf now has % distinct rungs, expected 24', _n;
  end if;

  raise notice '0138: rung 5075 -> 5000 with label "5,000/7,500" on 2 film(s); 24 rungs intact';
end
$$;
