-- ============================================================================
-- EDIAGD — 0175 the restored completions get their event
--
-- 0174 put seven refused completions back into `content_progress`. This gives
-- each of them the `app_event` row it never got, because ONE READER COUNTS
-- COMPLETIONS FROM THE EVENT AND NOT FROM THE PROGRESS ROW.
--
-- ---------------------------------------------------------------------------
-- THE SWEEP, STATED BEFORE THE FIX — "who else reads this value"
-- ---------------------------------------------------------------------------
-- The question 0174's defect was an answer to is: WHAT COUNTS A COMPLETION,
-- AND DOES IT COUNT THE ROW OR THE ACT? Asked of every object in the database
-- that mentions either table, and of every screen that reports a number:
--
--   FROM content_progress — restored, and therefore already correct
--     my_module_progress              track and module progress
--     my_certification_progress       certification progress
--     advisor_family_film_progress    the "what you're working" card
--     advance_focus_family            the pitch cursor
--     derive_focus_family             which family comes next
--     team_videos_completed           the manager's roster number
--     admin_engagement_funnel         the admin funnel
--     impact_coaching                 the coaching surface
--     lib/service-family.ts           the service shelf's own tick
--
--   FROM app_event — NOT restored, which is what this migration is for
--     app_event_rollcall              the Rollcall's lessonsOutsideLoop
--
--   FROM NEITHER, BY DESIGN — and this is stated so it is not mistaken for a
--   gap. The Swell reads `daily_completion` and `swell`, and a library or
--   shelf completion is deliberately not a day's work: "THE SWELL IS NOT
--   TOUCHED" in lib/library-actions.ts, which has been the rule since 0012.
--   Nothing here extends a streak and nothing should.
--     first_return_after              reads signed_in / daily_activity /
--                                     daily_completion — never lesson_completed
--
-- So exactly one reader was short, and it is the one Ryan reads on a Monday.
-- Without this, the Rollcall says these seven films were never finished while
-- every other surface in the product says they were — two documents disagreeing
-- about the same fact, which this project's standing rules call the bug itself.
--
-- ---------------------------------------------------------------------------
-- THE POPULATION IS A PROPERTY, NOT A LIST
-- ---------------------------------------------------------------------------
-- 0174 listed its nine pairs by hand so it could not reach a row nobody had
-- looked at. The right construction here is the opposite one, because the
-- population already has a column that defines it: `restored_reason is not
-- null` IS the set of restores, as 0174's own comment on that column says. A
-- second hand-written list would be a second definition of the same set, and
-- the two could disagree.
--
-- It is asserted to be seven — the number measured in production after 0174
-- applied — so a set that has grown or shrunk stops this rather than quietly
-- doing something else. Meeting something the list does not mention is the
-- moment to be loudest.
--
-- ---------------------------------------------------------------------------
-- WHICH TIMESTAMP, AND WHY `at` IS THE WATCH AND NOT NOW()
-- ---------------------------------------------------------------------------
-- `app_event_rollcall` buckets on min(at) and max(at), and the Rollcall is read
-- over a window. An event stamped now() would move seven completions from the
-- days they happened into today, inflating this week and emptying late October.
-- So `at` is the completion's own `completed_at` — which 0174 took from the
-- watch, and which therefore carries 0174's own limitation: a film watched
-- twice is dated at the later watch. Inherited deliberately rather than
-- re-derived, so the event and the row it describes agree by construction.
--
-- `meta.source` is the progress row's own `source`, which is 'card' for all
-- seven. It is read from the row rather than written as a literal because the
-- Rollcall's fold keys on it: 'loop' goes in one column, 'library'/'card' in
-- the other, and ANYTHING ELSE goes in `lessonsUnattributed`, a counter whose
-- comment says a number in it "means a third writer appeared and nobody updated
-- this file". This migration is that third writer. It therefore writes the
-- vocabulary the fold already knows, and says so here.
--
-- `meta.restored_from` is the new key, and it is additive: the Rollcall reads
-- only `meta->>'platform'` and `meta->>'source'`, so an extra key is invisible
-- to it and legible to a person. 0172 and 0174 both put the sentence in the row;
-- this puts the provenance in the event for the same reason — a restored record
-- and an earned one must not be indistinguishable afterwards.
--
-- WHAT THIS DOES NOT DO. It awards no Sand Dollars. 0176 does that, separately,
-- because an event is a record and money is a claim.
-- ============================================================================

-- ---- 1. The event each restored completion never got ------------------------
/*
 * `on conflict (dedup_key) where dedup_key is not null` — the index predicate
 * is required for inference against a PARTIAL unique index, and omitting it is
 * not a style question: Postgres cannot infer the index without it and the
 * statement errors. app_event_dedup_idx is unique on dedup_key WHERE dedup_key
 * IS NOT NULL, so this is the arbiter the table already has for "say this once".
 *
 * The key is derived from the progress row's own id, so a second application
 * cannot write a second event for the same completion.
 */
insert into app_event (user_id, rooftop_id, kind, target_id, meta, at, dedup_key)
select cp.user_id,
       cp.rooftop_id,
       'lesson_completed',
       /* The module, which is what the Rollcall names. NULL for all seven —
          every one is a daily_pitch film carrying a family and no module — and
          0163 already requires the reader to count an event with no target. */
       c.module_id,
       jsonb_build_object(
         'source',        cp.source,
         'content_id',    cp.content_id,
         'type',          c.type,
         'restored_from', '0174'
       ),
       cp.completed_at,
       '0175:restored:' || cp.id
  from content_progress cp
  join content c on c.id = cp.content_id
 where cp.restored_reason is not null
   and cp.completed_at is not null
on conflict (dedup_key) where dedup_key is not null do nothing;

do $$
declare
  _restored int;
  _short    int;
  _unattrib int;
begin
  /*
   * ---- THE SKIP PATH, so the chain can replay ------------------------------
   *
   * 0157's lesson, and the construction is 0158's. A database with NO restored
   * completion at all is a fresh local — `content_progress` is empty there and
   * 0174 stamped nothing — not a broken restore. The assertions below are about
   * seven specific rows, which cannot be tested where none of them exists.
   *
   * Stated as "no restore present" rather than "fewer than seven", so a
   * database holding SOME of them still fails loudly instead of skipping. A
   * guard that skips on a partial population is how a real shortfall gets
   * waved through, and the whole point of this file is that a silent miss is
   * worse than a crash.
   */
  if not exists (select 1 from content_progress where restored_reason is not null) then
    raise notice
      '0175: no restored completions on this database — a fresh local, not a '
      'broken restore. Nothing to give an event to; assertions skipped.';
    return;
  end if;

  select count(*) into _restored
    from content_progress where restored_reason is not null;

  if _restored <> 7 then
    raise exception
      '0175: % restored completions, expected the 7 that 0174 stamped. The set '
      'this migration is about has changed — refusing rather than guessing which '
      'rows it now means', _restored;
  end if;

  /*
   * ---- THE ACCEPTANCE HALF, AND IT IS A POST-CONDITION -------------------
   *
   * Not "how many rows did the insert write" — legitimately zero on a re-run,
   * which is the whole point of the dedup key. The assertion is the state this
   * migration exists to produce: EVERY restored completion has an event, at its
   * own completed_at. A no-op cannot satisfy that unless the work was already
   * done, and the LEFT JOIN means a missing event counts as short rather than
   * passing silently.
   */
  select count(*) into _short
    from content_progress cp
    left join app_event e
      on e.dedup_key = '0175:restored:' || cp.id
     and e.kind      = 'lesson_completed'
     and e.at        = cp.completed_at
   where cp.restored_reason is not null
     and e.id is null;

  if _short > 0 then
    raise exception
      '0175: % of % restored completions still have no event at their watch '
      'timestamp — refusing rather than reporting a success it did not achieve',
      _short, _restored;
  end if;

  /*
   * AND THE REFUSAL HALF, WHICH IS A DIFFERENT QUESTION: did we write anything
   * the Rollcall cannot file? A source outside its vocabulary lands in
   * `lessonsUnattributed`, where it is counted as nothing and printed as a
   * remainder. Better to fail here than to add to that number.
   */
  select count(*) into _unattrib
    from app_event
   where meta->>'restored_from' = '0174'
     and coalesce(meta->>'source', '') not in ('loop', 'library', 'card');

  if _unattrib > 0 then
    raise exception
      '0175: % restored events carry a source the Rollcall fold cannot file, '
      'which would land them in lessonsUnattributed', _unattrib;
  end if;

  raise notice
    '0175: all % restored completions now carry a lesson_completed event at '
    'their own watch timestamp', _restored;
end $$;

notify pgrst, 'reload schema';
