/* ===========================================================================
   0142 — LASTING IMPRESSIONS (12, core) AND PHONES AND TONES (12, Master)
   ===========================================================================

   Purely additive. Both certifications exist, both are inactive, and both were
   verified to hold no course, no module, no film and no cue before this ran — so
   nothing is displaced and no cascade is possible.

   ---------------------------------------------------------------------------
   THE SPAN QUESTION, ANSWERED BEFORE IT WAS USED
   ---------------------------------------------------------------------------

   Ryan's cap is six modules per Basic track with Master taking the overflow,
   which for a twelve-part series means one series across two tracks — something
   this schema has never done. Three questions had to be answered from the schema
   and the loop rather than assumed:

   1  WHAT IS A MODULE KEYED TO?  Its COURSE. `module.course_id` is the only link
      it has, and a module reaches a certification only through
      `certification_course`. There is no module-to-track column. So the course is
      the series-shaped object and the module is its part.

   2  MUST PART NUMBERS BE UNIQUE?  Not within a track, and not within a series.
      `module_course_name_key` is UNIQUE (course_id, name) — per course only — and
      `sort_order` carries NO uniqueness constraint at all; the loop tie-breaks on
      `id.localeCompare`. The binding constraint is elsewhere:
      `course_track_name_key` is UNIQUE (track, name), so two courses in track
      'Craft' CANNOT share a name.

   3  DOES THE LOOP SURVIVE MODULES NUMBERED 7-12?  Yes. `pickItem` sorts
      `orderedModules` by `sort_order` ascending within each course and orders
      courses by `certification_course.sort`. It is a relative sort throughout and
      never assumes the first module is 1. A course whose modules are 7..12 walks
      correctly.

   SO THE SPAN IS POSSIBLE, AND THE ANSWER IS NOT A FLAT YES. Two mechanisms
   exist and only one implements a cap:

     one course, two certifications   `certification_course` is a many-to-many and
                                      a course may legitimately belong to both
                                      ladders. But then BOTH tracks receive ALL
                                      twelve modules. It does not cap anything.
                                      (Zero courses do this today.)

     two courses, different names     Parts 1-6 in one, 7-12 in the other, each on
                                      its own certification. This works — but
                                      `course_track_name_key` FORCES the second
                                      course to carry a different name, and
                                      inventing "Lasting Impressions — Advanced"
                                      is naming. Naming is not mine.

   So the cap is not blocked by the schema; it is blocked by needing a name. All
   twelve land on one track here and the split stays available as an UPDATE of
   `module.course_id` — no film is re-ingested, re-uploaded or renamed by it. This
   is the same shape as Name Tag in 0141, which put ten on one track for the same
   reason.

   ---------------------------------------------------------------------------
   WHAT THIS DOES NOT TOUCH
   ---------------------------------------------------------------------------

   `contentComplete` is still unmeasured, and it is why NO cue is repointed here.
   Both of these tracks have zero cues, which is exactly why they are safe to do
   first: if it turns out `contentComplete` counts cues, a track with 12 films and
   0 cues is unaffected either way. Success Cycle (55 cues) and Four Step Close
   (13) are not touched until that is measured.
   =========================================================================== */

do $$
declare
  _spec record;
  _cert uuid;
  _course uuid;
  _m uuid;
  _f uuid;
  _n int;
  _attached int;
  _total int := 0;
begin
  for _spec in
    select * from (values
      ('Lasting Impressions', 'lasting-impressions', 920,
       'What happens after the work is approved. Twelve lessons, from write-up to asking for the family.'),
      ('Phones and Tones',    'phones-and-tones',    930,
       'The phone as the first impression, and the voice that answers it. Twelve lessons.')
    ) as t(series, course_slug, sort_order, descr)
  loop
    select id into _cert from certification where name = _spec.series;
    if _cert is null then
      raise notice '0142: no certification named % — skipping', _spec.series;
      continue;
    end if;

    select count(*) into _n from content
     where type='advisor_video' and status='published' and retired_at is null
       and title ~ ('^' || _spec.series || ', Part [0-9]+$');
    if _n = 0 then
      raise notice '0142: no % films present — skipping', _spec.series;
      continue;
    end if;
    if _n <> 12 then
      raise exception '0142: expected 12 % films, found % — refusing to attach a subset',
        _spec.series, _n;
    end if;

    /*
     * ALREADY DONE IS NOT OCCUPIED. 0141's first version could not tell those
     * apart and raised on its own second run, which breaks `db reset --local`
     * replaying the chain. So: if the twelve are already attached under this
     * course, return quietly; if something ELSE is on the track, refuse, because
     * a cascade delete is not a retire.
     */
    select count(distinct m.id) into _n
      from certification_course cc
      join course co on co.id = cc.course_id
      join module m on m.course_id = co.id
     where cc.certification_id = _cert;
    if _n > 0 then
      select count(*) into _n
        from certification_course cc
        join course co on co.id = cc.course_id
        join module m on m.course_id = co.id
        join content ct on ct.module_id = m.id
       where cc.certification_id = _cert
         and co.slug = _spec.course_slug
         and ct.title ~ ('^' || _spec.series || ', Part [0-9]+$');
      if _n = 12 then
        raise notice '0142: % is already built — nothing to do', _spec.series;
        continue;
      end if;
      raise exception
        '0142: % holds modules that are not this migration''s twelve — refusing to build onto occupied ground',
        _spec.series;
    end if;

    insert into course (name, slug, track, description, sort_order)
    values (_spec.series, _spec.course_slug, 'Craft', _spec.descr, _spec.sort_order)
    on conflict (slug) do nothing;
    select id into _course from course where slug = _spec.course_slug;

    insert into certification_course (certification_id, course_id, sort)
    values (_cert, _course, 1)
    on conflict do nothing;

    _attached := 0;
    for _n in 1..12 loop
      select id into _m from module where course_id = _course and sort_order = _n;
      if _m is null then
        insert into module (course_id, name, sort_order)
        values (_course, 'Part ' || _n, _n) returning id into _m;
      end if;

      select id into _f from content
       where type='advisor_video' and status='published' and retired_at is null
         and title = _spec.series || ', Part ' || _n;
      if _f is null then
        raise exception '0142: no published film titled %, Part %', _spec.series, _n;
      end if;

      /* module_order 1 — the film leads its module; cues reinforce. */
      update content set module_id = _m, module_order = 1,
                         placement = 'daily_craft', updated_at = now()
       where id = _f;
      _attached := _attached + 1;
    end loop;

    if _attached <> 12 then
      raise exception '0142: attached % films for %, expected 12', _attached, _spec.series;
    end if;
    _total := _total + _attached;
    raise notice '0142: % — 12 modules, 12 films attached', _spec.series;
  end loop;

  /* ================= ASSERT, BOTH DIRECTIONS ============================ */

  if _total = 0 then
    raise notice '0142: nothing to build on this database';
    return;
  end if;

  for _spec in select unnest(array['Lasting Impressions','Phones and Tones']) as series loop
    select count(*) into _n from content
     where type='advisor_video' and retired_at is null
       and title ~ ('^' || _spec.series || ', Part [0-9]+$')
       and module_id is not null and placement = 'daily_craft';
    if _n <> 12 then
      raise exception '0142: % has % of 12 films attached as daily_craft', _spec.series, _n;
    end if;

    /*
     * AND THE PARTS ARE IN ORDER 1..12 WITH NO GAP AND NO DUPLICATE. sort_order
     * has no uniqueness constraint, so two modules sharing a number would sort by
     * id and serve the series in an arbitrary order — reachable, correct-looking,
     * and wrong. Asserted rather than trusted.
     */
    select count(*) into _n from (
      select m.sort_order
        from certification c
        join certification_course cc on cc.certification_id = c.id
        join course co on co.id = cc.course_id
        join module m on m.course_id = co.id
       where c.name = _spec.series
       group by m.sort_order
      having count(*) > 1
    ) dup;
    if _n <> 0 then
      raise exception '0142: % has % duplicated module sort_order(s)', _spec.series, _n;
    end if;

    select count(distinct m.sort_order) into _n
      from certification c
      join certification_course cc on cc.certification_id = c.id
      join course co on co.id = cc.course_id
      join module m on m.course_id = co.id
     where c.name = _spec.series and m.sort_order between 1 and 12;
    if _n <> 12 then
      raise exception '0142: % covers % of parts 1-12', _spec.series, _n;
    end if;
  end loop;

  /* No cue was repointed — contentComplete is still unmeasured. */
  select count(*) into _n from content ct
    join module m on m.id = ct.module_id
    join course co on co.id = m.course_id
   where co.slug in ('lasting-impressions','phones-and-tones') and ct.type <> 'advisor_video';
  if _n <> 0 then
    raise exception '0142: % non-video item(s) landed in these courses', _n;
  end if;

  raise notice '0142: 24 films attached across two tracks; no cue moved';
end
$$;

select recompute_certification_content();
