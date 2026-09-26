/* ===========================================================================
   0129 — NINE SUPERSEDED TAKES ARE STILL LIVE. RETIRE THEM.
   ===========================================================================

   `INGEST.md` says a reshoot REPLACES IN PLACE rather than creating a row. For
   ten films it created a row and nobody retired the old one, so both takes are
   published and an advisor can be served the superseded one. TMB-039 — At the
   Kiosk v1 is 63.7% muffled and its clean v2 sits beside it, live.

   ---------------------------------------------------------------------------
   THE MECHANISM, BECAUSE TEN INSTANCES IS NOT AN ACCIDENT
   ---------------------------------------------------------------------------

   `identityOf()` in scripts/ingest-videos.ts strips only the version suffix
   from the CANONICAL filename:

       canonical.replace(/\s*—\s*v\d+\.[a-z0-9]+$/i, "").trim().toLowerCase()

   So the VOICE is part of the identity. The v1 films were named without one and
   the v2 reshoots with one:

       v1   clh-042 — after-mpi
       v2   clh-042 — after-mpi (mitch hardt)

   Different strings, so `byIdentity.get()` missed, so the film was treated as
   new and `pending.push(p)` created a row. All ten pairs differ by exactly that
   — verified against production, and the document has been describing behaviour
   the code does not have for as long as those ten have been live.

   THE DOCUMENT IS NOT THE THING THAT IS WRONG HERE — the intent it states is
   right and the key is too strict. Fixing the key is a separate change from
   fixing the data, and this migration is only the data. The key is dangerous to
   loosen in the same breath: a looser identity could collapse two genuinely
   different films, which is worse than the problem it solves.

   ---------------------------------------------------------------------------
   NINE, NOT TEN. SRP-038 — ON THE DRIVE IS HELD.
   ---------------------------------------------------------------------------

   The tenth pair is not a like-for-like replacement:

       SRP-038 — On the Drive — v1                 320s
       SRP-038 — On the Drive, Part 1 (Mitch Hardt) — v2   88s

   A 320-second film re-cut into parts, and Part 2 and Part 3 DO NOT EXIST —
   there is one v2 row, 88 seconds of it. Retiring v1 would remove 232 seconds
   of content nothing else covers. It stays live and goes to Mitch as two films
   owed. This is why "newer" is not the same question as "replacement".

   ---------------------------------------------------------------------------
   RETIRED, NEVER DELETED
   ---------------------------------------------------------------------------

   Same rule as files being moved rather than deleted. `retired_at` is set;
   the row, its Mux asset and any content_progress against it survive. The
   inverse is `set retired_at = null` over the same predicate.
   =========================================================================== */

do $$
declare
  _retired    int;
  _held       int;
  _candidates int;
begin
  /*
   * ---- IS THERE ANYTHING HERE AT ALL? ------------------------------------
   *
   * The assertions below are about production, where nine superseded takes were
   * measured before this was written. A fresh local database has none of these
   * films — `supabase db reset --local` seeds neither SRP-038 nor CLH-042 — so
   * the first version of this migration refused on an empty table and the whole
   * chain failed to replay.
   *
   * "Nothing to do" and "the wrong number of things to do" are different
   * answers and only the second is a fault. So: count the candidates first, and
   * return quietly when there are none.
   */
  select count(*) into _candidates
    from content a
   where a.type='advisor_video' and a.status='published' and a.retired_at is null
     and a.op_code is not null and a.stage is not null
     and exists (
           select 1 from content b
            where b.type='advisor_video' and b.status='published' and b.retired_at is null
              and b.op_code = a.op_code and b.stage = a.stage and b.version > a.version
         );

  if _candidates = 0 then
    raise notice '0129: no superseded live takes present — nothing to retire';
    return;
  end if;

  /* ---- the nine ---------------------------------------------------------- */
  with live as (
    select id, op_code, stage, version, canonical_filename
      from content
     where type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and op_code is not null
       and stage is not null
  ),
  superseded as (
    select a.id
      from live a
     where exists (
             select 1 from live b
              where b.op_code = a.op_code
                and b.stage   = a.stage
                and b.version > a.version
           )
       /*
        * THE EXCLUSION IS NAMED, NOT INFERRED. A predicate like "only when the
        * durations are similar" would be a rule nobody could audit later; this
        * says which film is held and the comment above says why.
        */
       and not (a.op_code = 'SRP-038' and a.stage = 'On the Drive')
  )
  update content c
     set retired_at = now(),
         updated_at = now()
    from superseded s
   where c.id = s.id;

  get diagnostics _retired = row_count;

  select count(*) into _held
    from content
   where type='advisor_video' and status='published' and retired_at is null
     and op_code='SRP-038' and stage='On the Drive' and version=1;

  raise notice '0129: retired % superseded take(s); held % SRP-038 original', _retired, _held;

  /*
   * REFUSE IF THE COUNT IS NOT WHAT WAS MEASURED.
   *
   * Nine was established by reading production before this was written. If the
   * migration finds a different number, the world moved underneath it and the
   * right response is to stop rather than to apply whatever happens to match —
   * a data fix that silently adjusts its own scope is not a fix.
   *
   * Idempotent: a second run finds 0 because the rows are already retired, so 0
   * is accepted as "already applied".
   */
  if _retired not in (0, 9) then
    raise exception '0129 expected to retire 9 superseded takes (or 0 if already applied), found %', _retired;
  end if;

  /* Only meaningful where that film exists — see the candidate check above. */
  if _retired = 9 and _held <> 1 then
    raise exception '0129 expected SRP-038 — On the Drive v1 to remain live, found % row(s)', _held;
  end if;
end
$$;
