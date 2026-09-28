/* ===========================================================================
   0135 — TMB-039 MPI SETUP: THE RESHOOT REPLACES THE MUFFLED TAKE
   ===========================================================================

   IMG_2576 is Mitch's reshoot of `TMB-039 — MPI Setup`, and it was ruled by
   measurement rather than by opinion. Both takes profiled with the same method
   (HF ratio on voiced frames, 2.5-second medians — scripts/muffle-profile.py):

     v1   108.0s   median -34.1 dB   worst -54.4 dB at 0:20.5   10.1s muffled (9.4%)
                   five passages below -48 dB: 0:10.7, 0:19.9, 0:25.7, 0:27.7, 1:11.6
     v2    79.7s   median -35.4 dB   worst -42.7 dB at 0:44.0    0.0s muffled (0.0%)

   THE MEDIAN IS NOT THE STATISTIC THAT DECIDES THIS, and saying so is the point.
   v2's median is marginally LOWER — a shade less bright overall. But "muffled" is
   not average brightness; it is sustained passages below the audible threshold,
   and v2 has none while v1 has five. Picking the median here would have retired
   the wrong film. Naming which summary was used, and what it discards, is the
   tenth standing rule.

   ---------------------------------------------------------------------------
   THE INGEST COULD NOT SEE THIS AS A RESHOOT, AND THAT IS THE REAL FINDING
   ---------------------------------------------------------------------------

   The dry run said `0 would REPLACE an existing take, 67 would ingest fresh` —
   including this one. `identityOf()` strips only the version suffix, so:

     live v1   'TMB-039 — MPI Setup — v1.mov'                -> 'tmb-039 — mpi setup'
     new  v2   'TMB-039 — MPI Setup — Mitch Hardt — v2.mov'  -> 'tmb-039 — mpi setup — mitch hardt'

   Different strings, so no match, so no replace — and without this migration the
   catalog would hold TWO live films at one stage. That is exactly the defect 0129
   was written to clean up, arriving again by a different door.

   IT IS A CLASS, NOT THIS FILE. 84 of 321 live films carry no parenthesised
   voice, and 43 of those have an op code — ABT-054, ACO-055, ACR-047, BFF-012,
   CAF-002, CLF-010, CLH-042, DFF-014, EAF-001, PSF-013, SRP-038, TMB-039,
   TRF-011. Every one is a silent duplicate waiting on its reshoot, and three
   ACO-055 reshoots are sitting in the Drop Zone now. The fix is a change to the
   identity key with its own tests, and it is on the 2 October list rather than
   bolted on here — but this migration is the evidence that the exposure is real
   and not theoretical.

   ---------------------------------------------------------------------------
   RETIRED, NOT DELETED, AND THE MASTER STAYS WHERE IT IS
   ---------------------------------------------------------------------------

   `04 - Archive` holds the byte-identical Drop Zone copy of the WINNER, not the
   loser. `TMB-039 — MPI Setup — v1.mov` is a published master and stays in
   `02 - Published`; only its row is retired. An advisor who watched it did watch
   it, and the four `watch_gate` rows and any completions stay exactly as they
   are.
   =========================================================================== */

do $$
declare
  _v1 uuid;
  _v2 uuid;
  _n int;
begin
  select id into _v2 from content
   where type = 'advisor_video'
     /*
      * THE NAME THE INGEST INVENTS, NOT THE NAME ON DISK.
      *
      * The file staged as `TMB-039 — MPI Setup — Mitch Hardt — v2.mov`; the
      * ingest's canonicalName() moves the voice into parentheses, so the row
      * reads `TMB-039 — MPI Setup (Mitch Hardt) — v2.mov`. The first version of
      * this predicate used the on-disk spelling and would have matched NOTHING —
      * returning the quiet "reshoot not present" notice and leaving both takes
      * live, which is the one outcome this migration exists to prevent.
      *
      * source_filename records what was on disk; canonical_filename records what
      * the ingest made. Join on whichever the other system actually observed —
      * and here the other system is the ingest, so it is the canonical.
      */
     and canonical_filename = 'TMB-039 — MPI Setup (Mitch Hardt) — v2.mov'
     and retired_at is null;

  /*
   * ORDER MATTERS AND THE GUARD IS THE WHOLE SAFETY.
   *
   * This runs AFTER the ingest, so on a fresh local database — and on production
   * before the upload finished — v2 does not exist. Retiring v1 then would leave
   * TMB-039 with NO MPI Setup film at all, which is worse than the duplicate this
   * migration exists to prevent. Return quietly instead: 0129's first version
   * could not tell "nothing to do" from "the wrong number of things to do", and
   * this is the same distinction.
   */
  if _v2 is null then
    raise notice '0135: the v2 reshoot is not present — leaving v1 live, nothing to do';
    return;
  end if;

  if (select status from content where id = _v2) <> 'published' then
    raise notice '0135: v2 exists but is not published yet — leaving v1 live';
    return;
  end if;

  select id into _v1 from content
   where type = 'advisor_video'
     and canonical_filename = 'TMB-039 — MPI Setup — v1.mov'
     and retired_at is null;

  if _v1 is null then
    raise notice '0135: v1 is already retired or absent — nothing to do';
    return;
  end if;

  update content
     set retired_at = now(),
         retired_reason =
           'Superseded by TMB-039 — MPI Setup — Mitch Hardt — v2 (IMG_2576), Mitch''s '
           'reshoot. Decided on the audio profile, not on preference: this take has '
           '10.1s muffled across five passages, worst -54.4 dB at 0:20.5; the v2 has '
           '0.0s muffled, worst -42.7 dB. The v2''s HF median is marginally lower '
           '(-35.4 vs -34.1 dB), which is why the median was not the deciding '
           'statistic. The ingest did NOT see this as a replacement — identityOf() '
           'includes the voice and v1''s filename carries none — so this retire is '
           'manual by necessity. Retired by 0135; master stays in 02 - Published.',
         updated_at = now()
   where id = _v1;

  get diagnostics _n = row_count;
  if _n <> 1 then
    raise exception '0135 expected to retire exactly 1 row, updated %', _n;
  end if;

  /* ---- BOTH HALVES. A retire looks identical whether or not it was right ---- */

  select count(*) into _n from content
   where type = 'advisor_video' and op_code = 'TMB-039' and stage = 'MPI Setup'
     and status = 'published' and retired_at is null;
  if _n <> 1 then
    raise exception
      '0135: TMB-039 MPI Setup has % live published film(s), expected exactly 1', _n;
  end if;

  /*
   * AND IT MUST BE THE v2. The failure this catches is a predicate that retired
   * the reshoot and left the muffled take — which would satisfy the count above
   * and be precisely backwards.
   */
  select count(*) into _n from content
   where id = _v2 and status = 'published' and retired_at is null;
  if _n <> 1 then
    raise exception '0135: the surviving film is not the v2 reshoot';
  end if;

  raise notice '0135: retired v1 (%); v2 (%) is the only live TMB-039 MPI Setup', _v1, _v2;
end
$$;
