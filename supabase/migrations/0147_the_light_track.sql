/* ===========================================================================
   0147 — THE LIGHT TRACK: NO PITCH UNTIL THE NUMBERS CAN CARRY ONE
   ===========================================================================

   Ryan's ruling, 30 September. An advisor whose repair-order data is too thin
   to derive a focus family from gets the light morning — mindset plus craft
   item, no pitch — automatically, until their ROs cross a floor. Then the
   pitch turns on by itself. The advisor never chooses this and never sees a
   setting.

   ---------------------------------------------------------------------------
   THE FLOOR, MEASURED BEFORE CHOSEN (production dump, 29 September)
   ---------------------------------------------------------------------------

   Two conditions, both required, measured in the ROOFTOP'S latest complete
   period (not partial, not superseded):

     1  total ROs            >= min_ros_for_coaching()      (20 — 0053 owns it)
     2  best fam_ros among   >= min_fam_ros_for_pitch()     (5 — new, below)
        stocked families        (family_pitch_supply)

   73 operators had rows in the latest complete period across the eleven
   Doggett rooftops: 54 clear the floor, 19 do not, and the RO distribution
   breaks naturally at exactly this line — 21 above, 19 below, nobody at 20.
   Condition 2's number is TWO_LADDERS' own measurement (2026-09-23): fam_ros
   volatility has median CV 0.65 at 0-2 ROs against 0.10 at 50+, and 5 is
   where the document already drew the stops-being-noise line.

   Known cases: Abate 902050 (140 ROs, best stocked 47) PITCH · Patterson
   500570 (41/16) PITCH · Booker 274 (136/61) PITCH · Upshaw 710 (24/13)
   PITCH — the measurement disagrees with the roster's "thin" grouping and
   the measurement wins · Martin 747 (6/2) LIGHT · Anthony 623 (4/1) LIGHT ·
   Tiner/Pinder 500573 (no rows in any complete period since May, 1 RO there)
   LIGHT · app accounts 671/35122/400025/500242/500032 all PITCH.

   ---------------------------------------------------------------------------
   WHY THE ROOFTOP'S LATEST PERIOD, NOT THE OPERATOR'S
   ---------------------------------------------------------------------------

   derive_focus_family ranks in the operator's newest attach period, which for
   a DORMANT book is months old: op 626 (last traded January) would derive a
   confident pitch from an eight-month-old period today, and that operator is
   exactly the one a mis-mapped account reads (F2). Measuring the floor in the
   rooftop's latest complete period makes an absent book read as what it is —
   0 ROs, light — instead of as January's numbers.

   ---------------------------------------------------------------------------
   NEVER A SILENT NULL
   ---------------------------------------------------------------------------

   Below the floor the derivation used to `return null`, indistinguishable
   from "no op code" and from a bug — both of which already exist. It now
   writes a row: source = 'light', family NULL, period_id = the period it
   measured, `note` naming both measurements against both floors. The loop
   reads the row (a null family assembles the same two-slot morning), the
   surfaces read the row, and the history keeps every crossing.

     no op code          -> null, exactly as today (missing mapping, not thin data)
     source = 'manager'  -> exempt; a manager who assigns a family has ruled
     light -> pitch      -> advance_focus_family re-checks when the rooftop's
                            latest complete period CHANGES — the first period
                            that clears the floor, never sooner, never by hand
   =========================================================================== */

/* ---- 1 · the per-family floor gets one owner, like min_ros_for_coaching -- */

alter table game_settings
  add column if not exists min_fam_ros_for_pitch integer not null default 5;

comment on column game_settings.min_fam_ros_for_pitch is
  'The fam_ros at which a family''s attach rate stops being noise — '
  'TWO_LADDERS measured 5 (2026-09-23, CV 0.65 at 0-2 ROs vs 0.10 at 50+). '
  'Condition 2 of the light-track floor. 0147.';

create or replace function min_fam_ros_for_pitch()
  returns integer
  language sql
  stable
  security definer
  set search_path = public
as $$ select coalesce((select min_fam_ros_for_pitch from game_settings limit 1), 5) $$;

revoke all on function min_fam_ros_for_pitch() from public, anon;

/* ---- 2 · a light row is representable ------------------------------------ */

alter table advisor_focus_family alter column family drop not null;

alter table advisor_focus_family drop constraint if exists advisor_focus_family_source_check;
alter table advisor_focus_family
  add constraint advisor_focus_family_source_check
  check (source = any (array['derived'::text, 'manager'::text, 'default'::text, 'light'::text]));

/* A family is only absent on a light row, and a light row never carries one —
   two constraints so neither half can be half-true. */
alter table advisor_focus_family drop constraint if exists advisor_focus_family_family_presence;
alter table advisor_focus_family
  add constraint advisor_focus_family_family_presence
  check ((source = 'light') = (family is null));

/* A light row must say why. The note is the reason a later reader gets. */
alter table advisor_focus_family drop constraint if exists advisor_focus_family_light_notes;
alter table advisor_focus_family
  add constraint advisor_focus_family_light_notes
  check (source <> 'light' or note is not null);

/* ---- 3 · the rooftop's latest complete period, in one place -------------- */

create or replace function latest_complete_period(_rooftop uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p.id
    from perf_period p
   where p.rooftop_id = _rooftop
     and not p.is_partial
     and p.superseded_at is null
   order by p.ends_on desc
   limit 1
$$;

revoke all on function latest_complete_period(uuid) from public, anon;

comment on function latest_complete_period is
  'The period the light-track floor is measured in. The operator''s own newest '
  'attach period is NOT this for a dormant book, which is the point — 0147.';

/* ---- 4 · the derivation records light instead of returning silence ------- */

create or replace function derive_focus_family(_user uuid, _rooftop uuid, _period uuid default null)
  returns advisor_focus_family
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  _op_id   text;
  _period_id uuid;
  _floor_period uuid;
  _total_ros numeric;
  _best_stocked numeric;
  _top     record;
  _existing advisor_focus_family;
  _had_existing boolean := false;
  _out     advisor_focus_family;
begin
  select m.op_code_id into _op_id
    from membership m
   where m.user_id = _user
     and m.rooftop_id = _rooftop
     and m.active
     and m.role = 'advisor'
     and m.op_code_id is not null
   limit 1;

  /* No op code stays exactly as today: the rule is about thin data, not
     missing mapping. Missing mapping already has its own honest state. */
  if _op_id is null then
    return null;
  end if;

  select * into _existing
    from advisor_focus_family
   where user_id = _user and ended_on is null
   limit 1;
  /* `found` is clobbered by every SELECT below; capture it once. */
  _had_existing := found;

  /* A manager who assigns a family to a thin advisor has ruled. Exempt,
     before any measurement — the same precedence every other arm gives. */
  if _had_existing and _existing.source = 'manager' then
    return _existing;
  end if;

  /*
   * ---- THE FLOOR ---------------------------------------------------------
   * Measured in the rooftop's latest complete period, both conditions
   * required. Zero rows in that period reads as 0 and 0 — a dormant or
   * brand-new book is light, never January's confident pitch.
   */
  _floor_period := latest_complete_period(_rooftop);

  select max(a.advisor_ros),
         max(a.fam_ros) filter (where s.family is not null)
    into _total_ros, _best_stocked
    from advisor_family_attach a
    left join family_pitch_supply s on s.family = a.family
   where a.advisor_op_id = _op_id
     and a.rooftop_id = _rooftop
     and a.period_id = _floor_period;

  _total_ros    := coalesce(_total_ros, 0);
  _best_stocked := coalesce(_best_stocked, 0);

  if _floor_period is null
     or _total_ros < min_ros_for_coaching()::numeric
     or _best_stocked < min_fam_ros_for_pitch()::numeric then

    /* Same period, still light: the row already says so. No churn. */
    if _had_existing and _existing.source = 'light'
       and _existing.period_id is not distinct from _floor_period then
      return _existing;
    end if;

    if _had_existing then
      update advisor_focus_family
         set ended_on = current_date, updated_at = now()
       where id = _existing.id;
    end if;

    insert into advisor_focus_family
      (user_id, rooftop_id, family, source, period_id, note)
    values
      (_user, _rooftop, null, 'light', _floor_period,
       format('light: %s ROs in the latest complete period (floor %s); '
              'best stocked family %s ROs (floor %s)',
              _total_ros, min_ros_for_coaching(),
              _best_stocked, min_fam_ros_for_pitch()))
    returning * into _out;

    return _out;
  end if;

  /* ---- above the floor: the derivation exactly as 0124/0126 left it ----- */

  _period_id := _period;
  if _period_id is null then
    select a.period_id into _period_id
      from advisor_family_attach a
      join perf_period p on p.id = a.period_id
     where a.advisor_op_id = _op_id
       and a.rooftop_id = _rooftop
     order by p.starts_on desc
     limit 1;
  end if;

  if _period_id is null then
    return null;
  end if;

  select
      a.family,
      round(greatest(coalesce(b.store_avg_pct, 0) - coalesce(a.attach_rate_pct, 0), 0)
            / 100.0 * a.advisor_ros, 2)                        as missed_ros,
      case when l.labor_per_ro is not null and l.labor_per_ro > 0
           then round(greatest(coalesce(b.store_avg_pct, 0) - coalesce(a.attach_rate_pct, 0), 0)
                      / 100.0 * a.advisor_ros * l.labor_per_ro, 2)
      end                                                      as opportunity,
      s.film_count
    into _top
    from advisor_family_attach a
    join family_store_benchmark b
      on b.family = a.family and b.period_id = a.period_id and b.rooftop_id = a.rooftop_id
    join family_pitch_supply s on s.family = a.family
    left join advisor_family_labor l
      on l.family = a.family and l.period_id = a.period_id
     and l.rooftop_id = a.rooftop_id and l.advisor_op_id = a.advisor_op_id
   where a.advisor_op_id = _op_id
     and a.rooftop_id = _rooftop
     and a.period_id = _period_id
     /* The coaching floor 0124 put here survives; the light gate above is the
        louder, recorded version of the same refusal. min_ros_for_coaching(),
        never a literal — 0053 owns the number. */
     and a.advisor_ros >= min_ros_for_coaching()::numeric
     and exists (
       select 1
         from content c
         join op_code_family f on f.code = c.op_code and f.coachable
        where f.family = a.family
          and c.type = 'advisor_video'
          and c.status = 'published'
          and c.retired_at is null
          and c.mux_playback_id is not null
          and not exists (
            select 1 from content_progress cp
             where cp.user_id = _user and cp.content_id = c.id
               and cp.completed_at is not null
          )
     )
   order by missed_ros desc nulls last,
            opportunity desc nulls last,
            a.family asc
   limit 1;

  if _top is null or _top.missed_ros is null or _top.missed_ros <= 0 then
    /* Above the floor with nothing coachable — every stocked family covered
       or consumed. The same honest null as before 0147; NOT a light state,
       because the numbers can carry a pitch and there is simply none to give. */
    return null;
  end if;

  if _had_existing then
    /* _existing was loaded above; manager rows already returned. A light row
       never matches (its family is null), so crossing the floor always ends
       it here and the history keeps the transition. */
    if _existing.family = _top.family then
      return _existing;
    end if;

    update advisor_focus_family
       set ended_on = current_date,
           updated_at = now()
     where id = _existing.id;
  end if;

  insert into advisor_focus_family
    (user_id, rooftop_id, family, source, period_id, missed_ros, opportunity, film_count)
  values
    (_user, _rooftop, _top.family, 'derived', _period_id,
     _top.missed_ros, _top.opportunity, _top.film_count)
  returning * into _out;

  return _out;
end;
$function$;

/* ---- 5 · the loop's entry point knows what a light row is ----------------- */

create or replace function advance_focus_family(_user uuid, _rooftop uuid)
  returns advisor_focus_family
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  _active advisor_focus_family;
  _remaining int;
begin
  select * into _active
    from advisor_focus_family
   where user_id = _user and ended_on is null
   limit 1;

  if found then
    /*
     * A LIGHT ROW IS RE-CHECKED ON PERIOD CHANGE, NEVER ON FILM SUPPLY.
     * It has no family and no films; counting its remaining films would read
     * zero and end it every morning — churn, and a floor re-measured against
     * the same period it already failed. The row stands until the rooftop's
     * latest complete period is a NEW one, and then the derivation re-runs:
     * the advisor crosses out of the light track on the first period that
     * clears the floor, never sooner and never by hand.
     */
    if _active.source = 'light' then
      if _active.period_id is not distinct from latest_complete_period(_rooftop) then
        return _active;
      end if;

      update advisor_focus_family
         set ended_on = current_date, updated_at = now()
       where id = _active.id;

      return derive_focus_family(_user, _rooftop, null);
    end if;

    select count(*) into _remaining
      from content c
      join op_code_family f on f.code = c.op_code and f.coachable
     where f.family = _active.family
       and c.type = 'advisor_video'
       and c.status = 'published'
       and c.retired_at is null
       and c.mux_playback_id is not null
       and not exists (
         select 1 from content_progress cp
          where cp.user_id = _user and cp.content_id = c.id
            and cp.completed_at is not null
       );

    if _remaining > 0 then
      return _active;
    end if;

    /* EXHAUSTED. End it and derive the next — 0124's rule, unchanged,
       including for manager rows: the instruction was carried out. */
    update advisor_focus_family
       set ended_on = current_date,
           updated_at = now()
     where id = _active.id;
  end if;

  return derive_focus_family(_user, _rooftop, null);
end;
$function$;

/* ===========================================================================
   PROVE THE SHAPE, BOTH DIRECTIONS. Data-dependent behavior is proven by the
   acceptance suite as the advisor role; here the constraints themselves are
   exercised, so a database that would let a half-light row exist refuses now.
   =========================================================================== */

do $$
declare
  _n int;
begin
  /* the constraint accepts a well-formed light row and refuses the two
     half-states, proven against a scratch row that never survives */
  begin
    insert into advisor_focus_family (user_id, rooftop_id, family, source, note)
    values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            null, 'light', 'constraint probe');
    raise exception '0147: probe row inserted with a nonexistent user — FK should have refused';
  exception
    when foreign_key_violation then null; /* expected: FK refused, constraints passed */
    when check_violation then
      raise exception '0147: a well-formed light row failed its own check constraints';
  end;

  begin
    insert into advisor_focus_family (user_id, rooftop_id, family, source, note)
    values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            'Filters', 'light', 'constraint probe');
    raise exception '0147: a light row carrying a family was accepted';
  exception
    when check_violation then null; /* expected: light never carries a family */
  end;

  begin
    insert into advisor_focus_family (user_id, rooftop_id, family, source)
    values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            null, 'derived');
    raise exception '0147: a derived row with no family was accepted';
  exception
    when check_violation then null; /* expected: only light may omit the family */
    when foreign_key_violation then
      raise exception '0147: family-presence check did not fire before the FK';
  end;

  select count(*) into _n from pg_proc where proname in
    ('min_fam_ros_for_pitch', 'latest_complete_period');
  if _n <> 2 then
    raise exception '0147: helper functions missing (% of 2)', _n;
  end if;

  raise notice '0147: light rows representable, half-states refused, floors owned by settings';
end
$$;
