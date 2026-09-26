/* ===========================================================================
   0130 — THE TWO SUPERSEDED TAKES 0129 COULD NOT SEE
   ===========================================================================

   0129 retired nine superseded takes and reported "nine of nine". That was true
   and it was the wrong question. Its candidate query read:

       where op_code is not null

   and CRAFT films have no op code, so two superseded pairs were never in the
   result set to be missing from:

       CRAFT — Sing It — v1                        206s  ->  v2   72s
       CRAFT — The Big Ticket Visit, Part 2 — v1    210s  ->  v2  139s

   Both live, both published, both a reshoot that created a row instead of
   replacing in place — the same defect as the nine.

   A TOTAL COMPUTED INSIDE THE FILTER CANNOT SEE WHAT THE FILTER REMOVED. The
   scope of the work also set the scope of the check, and it produced a right
   answer to a question nobody asked, which stays self-consistent forever. And
   the exclusion cost the highest-value cases first: CRAFT content reaches every
   advisor by construction, where a service film only reaches advisors on that
   line.

   So this migration counts the universe with NO SCOPING, reports the breakdown,
   and only then acts.

   ---------------------------------------------------------------------------
   THE VOICE IS STRIPPED; THE SOURCE NUMBER IS NOT
   ---------------------------------------------------------------------------

   Matching on "same title ignoring parentheses" would be wrong here. A
   parenthesis in that position means two different things:

       (Mitch Hardt)   the voice — noise for identity
       (2748)          the SOURCE NUMBER, which exists precisely because two
                       films claimed the same title during the rename and Ryan
                       ruled that both be kept and disambiguated

   Stripping both would collapse four MENU pairs that were deliberately
   distinguished. So the pattern below strips only a parenthesis containing at
   least one NON-DIGIT — a voice — and leaves an all-digit disambiguator in the
   key where it belongs.

   ---------------------------------------------------------------------------
   WHAT IS DELIBERATELY NOT TOUCHED
   ---------------------------------------------------------------------------

   Four films share op code, stage and part at the SAME version with very
   different durations — ACR-047 After-MPI (319s vs 123s), ACR-047 At the Kiosk
   (318s vs 63s), CLH-042 On the Drive (248s vs 110s), ACR-047 "Part 2" (295s vs
   168s). They are the incomplete ACR-047 restructure: a re-cut that never
   retired its original. Which take is current is a fact about what Mitch
   decided, not a fact in the data, so ALL FOUR STAY LIVE and the question goes
   to him. They do not appear below because their versions are equal, and no
   predicate here is tuned to exclude them.

   The accepted risk, stated so a later reader does not mistake it for an
   oversight: an advisor may occasionally be served the longer older take. That
   is better than deleting four minutes of teaching five days from launch.

   SRP-038 — On the Drive (320s) also stays live: its only v2 part is 88s and
   Parts 2 and 3 do not exist. Retiring it would remove 232 seconds nothing
   covers. It is a shoot, not a retire.
   =========================================================================== */

do $$
declare
  _universe   int;
  _with_op    int;
  _without_op int;
  _retired    int;
begin
  /* ---- 1. THE UNIVERSE, WITH NO SCOPING WHATSOEVER ----------------------- */
  create temporary table _superseded on commit drop as
  with live as (
    select id, collection, op_code, stage, version, canonical_filename, duration_sec,
           lower(regexp_replace(
                   regexp_replace(coalesce(title,''), '\s*\([^)]*[^0-9)][^)]*\)', '', 'g'),
                   '\s+', ' ', 'g')) as k
      from content
     where type = 'advisor_video'
       and status = 'published'
       and retired_at is null
  )
  select a.id, a.op_code, a.collection, a.canonical_filename, a.duration_sec,
         b.duration_sec as newer_secs
    from live a
    join live b
      on b.collection is not distinct from a.collection
     and b.op_code    is not distinct from a.op_code
     and b.stage      is not distinct from a.stage
     and b.k = a.k
     and b.version > a.version;

  select count(*) into _universe   from _superseded;
  select count(*) into _with_op    from _superseded where op_code is not null;
  select count(*) into _without_op from _superseded where op_code is null;

  /* The breakdown is REPORTED, not assumed — so a future reader sees what any
     scope would have hidden, which is the whole point of this migration. */
  raise notice '0130 universe: % superseded live take(s) — % with an op code, % without',
    _universe, _with_op, _without_op;

  if _universe = 0 then
    raise notice '0130: nothing superseded and live — already applied, or 0129 covered everything';
    return;
  end if;

  /* ---- 2. RETIRE ALL OF THEM. No op_code predicate. ---------------------- */
  update content c
     set retired_at = now(),
         updated_at = now()
    from _superseded s
   where c.id = s.id;
  get diagnostics _retired = row_count;

  raise notice '0130: retired % take(s)', _retired;

  /*
   * Measured against production before this was written: 2, both CRAFT, both
   * without an op code. 0129 had already taken the nine op-coded ones, so
   * `_with_op` is expected to be 0 here — and if it is not, 0129's assertion
   * was also wrong and this should stop rather than quietly clean up after it.
   */
  if _retired <> 2 then
    raise exception '0130 expected to retire 2 superseded takes, found %', _retired;
  end if;
  if _with_op <> 0 then
    raise exception
      '0130 found % superseded take(s) WITH an op code — 0129 should have retired those; stopping',
      _with_op;
  end if;
end
$$;
