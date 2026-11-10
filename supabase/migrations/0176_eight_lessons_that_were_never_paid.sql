-- ============================================================================
-- EDIAGD — 0176 eight lessons that were never paid
--
-- NOT APPLIED. Written for Ryan to read and apply. 0174 put the completions
-- back and deliberately paid nothing, because "minting nine awards
-- retroactively is a second claim with its own rules — it is Ryan's call, not a
-- side effect of putting the completions back." This is that call, taken on
-- 6 November 2026: award what the original completions would have paid, on the
-- days they were watched, under a correction reason.
--
-- ---------------------------------------------------------------------------
-- EIGHT, NOT NINE, AND NOT SEVEN — THE POPULATION BEFORE THE CLAIM
-- ---------------------------------------------------------------------------
-- 0174 listed nine lost completions. This migration pays eight of them, and the
-- arithmetic is worth writing down because three different numbers are all
-- correct about different questions:
--
--   9  completions 0174 listed
--   7  completions 0174 actually STAMPED. Two had been completed legitimately
--      in the morning loop before the migration ran — 6 November, 12:27 and
--      12:35 UTC — and its `completed_at is null` filter correctly skipped
--      them. They are not restores and they carry no restore note.
--   8  completions that were never PAID. Measured, not assumed: no
--      `lesson_complete` entry has ever pointed at any of the nine progress
--      rows. The loop pays `daily_loop` once for the morning and nothing per
--      lesson, so the two films finished in the loop were credited and still
--      unpaid. One of the nine is Ryan's own and he excluded it by ruling.
--
-- So the set here is NEITHER "the restores" nor "0174's list". Keying it on
-- `restored_reason is not null` — the property 0175 correctly uses — would have
-- missed the two the loop completed, and each of those is a sand dollar an
-- advisor earned on the shelf and did not receive. The list is written out
-- because no column expresses "watched, refused, and never paid for".
--
-- ---------------------------------------------------------------------------
-- WHICH DAY, AND IT IS NOT THE DAY 0174 CHOSE
-- ---------------------------------------------------------------------------
-- 0174 dated each completion from `updated_at` — the last watch — and that is
-- right for a completion: never claim somebody finished a film earlier than
-- your last evidence that they were watching it.
--
-- THIS IS A DIFFERENT QUANTITY. An award pays for a loss, and the loss happened
-- the FIRST time the film was watched to the end and refused. So the entry is
-- dated from `created_at`, which `record_watch_progress` writes on the first
-- watch ping and nothing moves afterwards.
--
-- The difference is not academic and it is why one definition had to cover all
-- eight. For the three Tires & Rotation films that were rewatched, `updated_at`
-- says 3 November and `created_at` says the 2nd. For the two the loop completed
-- this morning, `updated_at` was overwritten TODAY — so dating from it would
-- pay a 2 November loss on 6 November, and the only surviving evidence of the
-- refused watch is `created_at`. One observed value, correct for every row:
--
--   3 entries   28 October    Fuel System Cleaner
--   5 entries   2 November    Tires & Rotation (4) and HVAC (1)
--
-- One award per film, ever, even for a film refused on two separate days: the
-- original completion would have paid once, because `content_progress` is
-- unique on (user_id, content_id) and that index is what made the payment
-- pay-once in the first place.
--
-- ---------------------------------------------------------------------------
-- WHY `adjustment` AND WHY ref_id IS NULL — BOTH ARE FORCED, NOT CHOSEN
-- ---------------------------------------------------------------------------
-- `adjustment` is already this project's correction channel. The admin economy
-- screen states the convention in its own words: "The repair is an adjustment
-- entry carrying the old reason and ref in its note — never a deleted row."
-- Paying these as `lesson_complete` would make a correction indistinguishable
-- from an earn, which is the defect 0172 and 0174 both exist to avoid.
--
-- AND THE REF HAS TO LIVE IN THE NOTE, which looks like a weaker record until
-- you read the audit. `lib/economy/ledger-refs.ts` holds one map, read by both
-- the economy screen and `npm run checkmap`:
--
--   NO_REF_EXPECTED  includes 'adjustment' — a null ref is the correct state
--   REF_TARGET       has NO entry for 'adjustment'
--
-- and `auditLedger` resolves a NON-null ref by looking the reason up in
-- REF_TARGET. An adjustment carrying a ref_id would therefore fall through to
-- `unknownReasons`, which that file calls "a hole in the audit, not a pass" —
-- so a well-meant pointer would break the ledger check for every adjustment
-- ever written. The progress id goes in the note instead, where the convention
-- already puts it and where the audit is content.
--
-- The note is ALSO the advisor's own ledger headline: `lib/sand-dollars.ts`
-- maps `adjustment` to `note: "title"`, so whatever is written here is the line
-- Valerie reads in the app. It is therefore a sentence a service advisor would
-- recognise, with the bookkeeping after it rather than instead of it.
--
-- ---------------------------------------------------------------------------
-- WHAT IS NOT PAID HERE, EACH CHECKED RATHER THAN ASSUMED
-- ---------------------------------------------------------------------------
--   MODULE BONUS   none. `completeModuleIfReady` works from `content.module_id`
--                  and all nine films carry NULL — they are daily_pitch films
--                  with a family and no module. No module was finishable by any
--                  of these completions, so `sand_module` is not owed.
--
--   CERTIFICATION  none, and this is the one that looked owed. Valerie now
--                  reads 12 of 12 on the Tires & Rotation card, and 0174 ran no
--                  accrual — so a credential looked overdue. It is not:
--                  `accrueFromCompletion`'s service-family arm counts EVERY
--                  published content row on the family's op codes, cues
--                  included, which is 14 and not 12. She has 12 of those 14.
--                  The card counts films and the credential counts content, a
--                  discrepancy 0160 already records. Two cues short, so nothing
--                  is owed and nothing is granted.
--
--   THE SWELL      untouched, as in 0175. A shelf completion is not a day's
--                  work and must not extend a streak.
-- ============================================================================

-- ---- 1. The eight, by id ----------------------------------------------------
/*
 * Statement level, like 0174's, for the same reason: the list and the checks
 * that read it must be ONE definition, not a VALUES block written twice.
 *
 * IDS ONLY. Two of these three accounts share a rooftop and the titles repeat
 * across families; a name is for printing and never for matching.
 */
create temporary table _unpaid_0176 (user_id uuid not null, content_id uuid not null);

insert into _unpaid_0176 (user_id, content_id) values
    -- Valerie Patterson · Fuel System Cleaner · first watched 28 October
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', 'bfce4b81-4c82-4c7a-905c-da3e6db72b4e'),  -- At the Kiosk
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '56b90a62-eb24-46dc-bc5c-0b238fd342b4'),  -- MPI Setup
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', 'ca77cdaf-0605-4c16-acc4-455153d48feb'),  -- After-MPI
    -- Valerie Patterson · Tire Rotation · first watched 2 November
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', 'faa74440-38d8-4bf9-9c3c-2c5ce2e76438'),  -- At the Kiosk
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '6b67c002-acb3-4906-840f-cd8888609164'),  -- MPI Setup
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '0791e6ee-cbfe-45db-8119-c9c904c4699a'),  -- After-MPI
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '00633e44-964a-4a19-a349-71e5a72405a4'),  -- On the Drive — loop-completed 6 Nov, never paid
    -- Austin Abate · AC Recharge · first watched 2 November
    ('55b2615b-9ac9-48b4-ae8e-69e4e46350ec', '11a5d2ac-7a08-442a-8525-50fcc5825ed2');  -- After-MPI Part 2 — loop-completed 6 Nov, never paid

-- Ryan Kelly's On the Drive — Serpentine Belt (78929620… / f8354df8…) is the
-- ninth and is deliberately absent: "Not my account", ruled 6 November.

-- ---- 2. Refuse before paying -----------------------------------------------
do $$
declare
  _listed  int;
  _rows    int;
  _already int;
  _paid    int;
  _amount  int;
  _cap     int;
  _breach  text;
begin
  select count(*) into _listed from _unpaid_0176;
  if _listed <> 8 then
    raise exception '0176: the list holds % pairs, expected 8', _listed;
  end if;

  /*
   * ---- THE SKIP PATH, so the chain can replay — 0157's lesson, 0158's shape
   *
   * A database where NONE of the eight resolves to a progress row is a fresh
   * local, not a lost ledger. The list itself is still checked above, because
   * that is a fact about this file and not about the data.
   *
   * "None of them" rather than "fewer than eight", so a database holding SOME
   * of these completions still fails loudly. An advisor who is owed three of
   * eight must not be quietly paid nothing.
   */
  if not exists (
    select 1 from _unpaid_0176 o
     join content_progress cp
       on cp.user_id = o.user_id and cp.content_id = o.content_id
  ) then
    raise notice
      '0176: none of the eight completions exist on this database — a fresh '
      'local, not an unpaid ledger. Nothing awarded; assertions skipped.';
    return;
  end if;

  /* Every pair must resolve to a real progress row, or an entry would be
     silently dropped and the summary would still read like a success. */
  select count(*) into _rows
    from _unpaid_0176 o
    join content_progress cp
      on cp.user_id = o.user_id and cp.content_id = o.content_id;
  if _rows <> _listed then
    raise exception
      '0176: % of % pairs resolve to a content_progress row', _rows, _listed;
  end if;

  /* All eight must still be COMPLETE. If a row has lost its completion between
     writing this and applying it, the completion is the thing to fix first and
     paying for it now would be paying for something that is not there. */
  select count(*) into _rows
    from _unpaid_0176 o
    join content_progress cp
      on cp.user_id = o.user_id and cp.content_id = o.content_id
   where cp.completed_at is null;
  if _rows > 0 then
    raise exception
      '0176: % of the eight have no completed_at — fix the completion before '
      'paying for it', _rows;
  end if;

  /*
   * ---- NOT TWICE -----------------------------------------------------------
   *
   * sand_dollar_entry has no dedup column and `adjustment` may carry no ref, so
   * there is no index to make this idempotent. The guard is therefore explicit
   * and it REFUSES rather than skipping: a second application would double-pay,
   * and a silent skip would be indistinguishable from a first run that wrote
   * nothing.
   */
  select count(*) into _already
    from sand_dollar_entry
   where reason = 'adjustment' and note like '%(0176)%';
  if _already > 0 then
    raise exception
      '0176: % correction entries from this migration already exist — refusing '
      'rather than paying a second time', _already;
  end if;

  /* And none of the eight may already have been paid as a lesson. Measured in
     production on 6 November: zero of the nine had ever been. */
  select count(*) into _paid
    from _unpaid_0176 o
    join content_progress cp
      on cp.user_id = o.user_id and cp.content_id = o.content_id
    join sand_dollar_entry e
      on e.ref_id = cp.id and e.reason = 'lesson_complete';
  if _paid > 0 then
    raise exception
      '0176: % of the eight already carry a lesson_complete entry — they were '
      'paid after all', _paid;
  end if;

  /*
   * ---- THE AMOUNT COMES FROM game_settings, NOT FROM HERE -----------------
   *
   * "NO AMOUNT PARAMETER. What a lesson pays comes from game_settings at
   * runtime." The same rule applies to a migration writing the same money.
   *
   * THE LIMITATION, SAID OUT LOUD: game_settings holds no history, so this is
   * today's figure applied to October's completions. It has been 1 for the
   * whole life of the ledger — every lesson_complete entry in production is
   * amount 1 — so today's value and those days' value are the same number. If
   * that ever stops being true, this comment is where the assumption is.
   */
  select coalesce(sand_lesson, 0), coalesce(sand_lesson_daily_cap, 0)
    into _amount, _cap
    from game_settings limit 1;

  if _amount is null or _amount <= 0 then
    raise exception
      '0176: game_settings.sand_lesson is %, so there is nothing to award and '
      'this migration would be a no-op wearing a success message', _amount;
  end if;

  /*
   * ---- THE CAP IS PART OF "WHAT IT WOULD HAVE PAID" ------------------------
   *
   * completeLibraryItem pays nothing once `lesson_complete` has already reached
   * sand_lesson_daily_cap for the UTC day, and the completion still stands. So
   * an award that ignores the cap pays MORE than the original completion would
   * have — and Valerie reached exactly 30 of 30 on 5 November, so the ceiling
   * is not hypothetical for this account.
   *
   * It does not bind on either day in hand: 28 October had 1 of 30 before these
   * 3, and 2 November had 10 of 30 before these 4 (and Austin 2 of 30 before
   * his 1). Computed rather than asserted from memory, and a breach REFUSES —
   * silently paying fewer than eight, or paying eight over the cap, are both
   * confident wrong answers and the choice between them is Ryan's.
   */
  /*
   * The day is resolved in `mine` BEFORE the grouping, so `per_day` can group
   * on a plain column and the ledger subquery can correlate to it. Written the
   * other way round first — grouping on `(created_at at time zone 'UTC')::date`
   * and correlating to `cp.created_at` — which Postgres refuses as an ungrouped
   * reference. Caught by rehearsing this migration against production inside a
   * transaction that was rolled back.
   */
  with mine as (
    select cp.user_id,
           (cp.created_at at time zone 'UTC')::date as utc_day
      from _unpaid_0176 o
      join content_progress cp
        on cp.user_id = o.user_id and cp.content_id = o.content_id
  ), per_day as (
    select m.user_id,
           m.utc_day,
           count(*) as new_entries,
           coalesce((
             select sum(e.amount)
               from sand_dollar_entry e
              where e.user_id = m.user_id
                and e.reason  = 'lesson_complete'
                and (e.created_at at time zone 'UTC')::date = m.utc_day
           ), 0) as existing
      from mine m
     group by m.user_id, m.utc_day
  )
  select string_agg(format('%s on %s: %s already + %s new > cap %s',
                           d.user_id, d.utc_day, d.existing, d.new_entries, _cap),
                    '; ')
    into _breach
    from per_day d
   where d.existing + (d.new_entries * _amount) > _cap;

  if _breach is not null then
    raise exception
      '0176: the daily lesson cap would have refused some of these on the day '
      'they were watched — %. Refusing rather than deciding which ones to drop',
      _breach;
  end if;
end $$;

-- ---- 3. Pay ----------------------------------------------------------------
insert into sand_dollar_entry (user_id, amount, reason, ref_id, note, created_at)
select cp.user_id,
       (select sand_lesson from game_settings limit 1),
       'adjustment',
       /* NULL BY NECESSITY, not by omission — see the header. An adjustment
          carrying a ref_id falls through auditLedger's REF_TARGET lookup into
          `unknownReasons`, breaking the ledger check for every adjustment in
          the table. The pointer is in the note. */
       null,
       'Correction: ' || c.title || ' — you watched it to the end and the app '
         || 'refused to save it. Replaces lesson_complete ref ' || cp.id
         || ' (0176).',
       /* The first watch ping: the day the film was watched and the save was
          refused. See the header on why this is created_at and not the
          updated_at 0174 used. */
       cp.created_at
  from _unpaid_0176 o
  join content_progress cp
    on cp.user_id = o.user_id and cp.content_id = o.content_id
  join content c on c.id = cp.content_id;

-- ---- 4. Confirm from the ledger, not from the insert -----------------------
do $$
declare
  _written int;
  _total   int;
  _users   int;
begin
  /* The same skip, for the same reason, stated the same way. Section 2 returned
     early on a fresh local and section 3's join wrote nothing, so this block
     must not then assert eight entries that were correctly never written. */
  if not exists (
    select 1 from _unpaid_0176 o
     join content_progress cp
       on cp.user_id = o.user_id and cp.content_id = o.content_id
  ) then
    raise notice '0176: nothing to confirm on this database — see the skip above.';
    return;
  end if;

  select count(*), coalesce(sum(amount), 0), count(distinct user_id)
    into _written, _total, _users
    from sand_dollar_entry
   where reason = 'adjustment' and note like '%(0176)%';

  if _written <> 8 then
    raise exception
      '0176 wrote % correction entries, expected 8 — refusing rather than '
      'reporting a success it did not achieve', _written;
  end if;

  /* Two advisors, and never three: Ryan's row is excluded by ruling and a third
     account appearing here would mean the list is not the list that was read. */
  if _users <> 2 then
    raise exception '0176 paid % accounts, expected 2', _users;
  end if;

  raise notice
    '0176: % correction entries, % Sand Dollars, % accounts, dated at the '
    'watch', _written, _total, _users;
end $$;

drop table if exists _unpaid_0176;
