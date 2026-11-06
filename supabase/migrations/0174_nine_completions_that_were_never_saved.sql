-- ============================================================================
-- EDIAGD — 0174 nine completions that were never saved
--
-- Valerie Patterson, 5 November 2026, 5:32 AM: she finished all twelve Tires &
-- Rotation films, the shelf read 12 of 12, and the next morning it read six.
-- She had done nothing in between, and she was right — nothing had been done
-- TO her record. The ticks were never saved in the first place.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PUTS BACK, AND WHY IT IS NINE ROWS AND NOT A SWEEP
-- ---------------------------------------------------------------------------
-- `completeLibraryItem` verified the reported watch against
-- `gateThreshold(content.duration_sec)` while the player had opened its gate at
-- `gateThreshold(el.duration)`. Two systems, one name, and the disagreement
-- lands in the fourth decimal place of a percentage: on After-MPI — Tire
-- Rotation the player credited at 98.3336 and the server demanded 98.3333,
-- which `isWatched` rounds to 98.33 and refuses. Measured across 411 published
-- films: the server's bar exceeded the player's on 196 of them.
--
-- The shelf then threw the answer away. It ticked the row first and wrapped the
-- call in `try { … } catch {}`, but the action reports failure by RETURNING
-- `{ ok: false }` rather than throwing — so the refusal was invisible and the
-- tick survived until the next server render. Both are fixed in the same PR.
--
-- THE POPULATION, stated before the claim. Rows where `watched_pct = 100` and
-- `completed_at IS NULL` number 136 platform-wide, and 127 of those are
-- `placement = 'daily_lifestyle'` — mindset films, which 0167 established are
-- watched and deliberately never stamped. Those are not lost and are not
-- touched here. The real losses are the nine `daily_pitch` rows below, across
-- three accounts, and they are listed one by one rather than selected by
-- predicate so this migration cannot reach a row nobody has looked at.
--
-- Ryan approved stamping all nine on 5 November.
--
-- ---------------------------------------------------------------------------
-- THE ENGAGEMENT RECORDS CANNOT REBUILD THESE, AND THAT IS THE POINT
-- ---------------------------------------------------------------------------
-- The brief asked for a restore built from the engagement records we already
-- save. They cannot carry it: `app_event` gets its `lesson_completed` row from
-- inside the same action that refused, so the nine films have no event. The
-- three Tires films that DID complete each have one; the four that failed have
-- none. An independent witness is exactly what does not exist here, so the
-- restore keys on the `content_progress` rows themselves and says so, rather
-- than implying a provenance it does not have.
--
-- WHICH TIMESTAMP, and it is the weaker of the two on purpose. `updated_at` is
-- the instant the row was last touched, and `record_watch_progress` writes as
-- the film plays, so the write that took it to 100 is the moment the watch
-- finished. 0167 reaches for the same value for the same reason and records the
-- same limitation: a rewatch moves it, so a film watched twice is restored at
-- the later watch. Three of these were rewatched. The alternative is not
-- restoring them, so the limitation is accepted in the open instead of being
-- discovered later.
--
-- ---------------------------------------------------------------------------
-- A RESTORED ROW SAYS SO — 0172's RULE, ONE TABLE OVER
-- ---------------------------------------------------------------------------
-- 0172 added `daily_completion.restored_reason` because a day an operator put
-- back and a day an advisor finished were otherwise indistinguishable, and the
-- streak, the Rollcall and the credential all accrue from both. A stamped
-- content_progress row is the same shape: it moves the pitch cursor, it counts
-- toward the certification, and it is the number on the shelf. So the sentence
-- goes in the row.
--
-- `source` is left at 'card' — the surface the advisor actually used, which is
-- true and is what the constraint permits — and the restore columns carry the
-- fact that we stamped it. Widening the source vocabulary would have put the
-- restore into a column eight other readers interpret as a surface.
--
-- WHAT THIS DOES NOT DO. It awards no Sand Dollars. `completeLibraryItem` pays
-- on completion, with a daily cap and a reason enum, and minting nine awards
-- retroactively is a second claim with its own rules — it is Ryan's call, not a
-- side effect of putting the completions back. Flagged in the PR.
-- ============================================================================

-- ---- 1. Somewhere for the reason to live -----------------------------------
alter table content_progress add column if not exists restored_reason text;
alter table content_progress add column if not exists restored_at timestamptz;

comment on column content_progress.restored_reason is
  'Why this completion was stamped by a migration rather than earned in the '
  'app, in our words. NULL for every row an advisor finished themselves, which '
  'is almost all of them, so `is not null` is the whole population of restores. '
  '0174, following 0172.';

comment on column content_progress.restored_at is
  'When the restore was applied. The completion itself is stamped at the watch, '
  'not at the restore, so these two deliberately disagree. 0174.';

-- ---- 2. The nine ------------------------------------------------------------
/*
 * THE LIST IS A TABLE AT STATEMENT LEVEL, not a temp table created inside the
 * DO block and not a VALUES list written twice. Creating it inside plpgsql and
 * referencing it in the same body is a planning footgun, and duplicating the
 * nine pairs between the update and its check would be two definitions of the
 * population — which is the defect this whole PR is about, in miniature.
 */
create temporary table _lost_0174 (user_id uuid not null, content_id uuid not null);

insert into _lost_0174 (user_id, content_id) values
    -- Ryan Kelly
    ('78929620-f92b-416f-80ac-41fcc3a6e3e8', 'f8354df8-a74a-4165-a6ce-a49f1a9af411'),  -- 16 Sep  On the Drive — Serpentine Belt
    -- Valerie Patterson, Fuel System Cleaner, 28 October
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', 'bfce4b81-4c82-4c7a-905c-da3e6db72b4e'),  -- At the Kiosk
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '56b90a62-eb24-46dc-bc5c-0b238fd342b4'),  -- MPI Setup
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', 'ca77cdaf-0605-4c16-acc4-455153d48feb'),  -- After-MPI
    -- Valerie Patterson, Tire Rotation, first watched 2 November, rewatched 3rd
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', 'faa74440-38d8-4bf9-9c3c-2c5ce2e76438'),  -- At the Kiosk
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '6b67c002-acb3-4906-840f-cd8888609164'),  -- MPI Setup
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '0791e6ee-cbfe-45db-8119-c9c904c4699a'),  -- After-MPI
    ('dac906c0-71d7-478d-9f2a-10f20b77a1ed', '00633e44-964a-4a19-a349-71e5a72405a4'),  -- On the Drive
    -- Austin Abate
    ('55b2615b-9ac9-48b4-ae8e-69e4e46350ec', '11a5d2ac-7a08-442a-8525-50fcc5825ed2');  -- After-MPI, Part 2 — AC Recharge

/*
 * `completed_at IS NULL` is not belt-and-braces. Between writing this and Ryan
 * applying it the fix ships, and any of these nine may be rewatched and
 * completed properly in the meantime. That row must keep the completion the
 * advisor earned, with its own timestamp and no restore note — so the filter
 * makes this skip it rather than overwrite it.
 */
update content_progress cp
   set completed_at     = coalesce(cp.updated_at, cp.created_at),
       /* All nine carry source NULL, because only record_watch_progress ever
          wrote them and it does not set one. Leaving it NULL would file them
          with the pre-0163 rows that have no surface recorded; 'card' is the
          surface these watches actually happened on. coalesce so a row that
          somehow has a source keeps it. */
       source           = coalesce(cp.source, 'card'),
       restored_at      = now(),
       restored_reason  = 'Watched to the end on the service shelf and refused '
                          'by a server gate stricter than the player''s own. '
                          'Stamped at the watch, from content_progress.updated_at. '
                          'See 0174.'
  from _lost_0174 l
 where cp.user_id = l.user_id
   and cp.content_id = l.content_id
   and cp.completed_at is null;

do $$
declare
  _listed  int;
  _stamped int;
  _short   int;
begin
  select count(*) into _listed from _lost_0174;
  if _listed <> 9 then
    raise exception '0174: the list holds % pairs, expected 9', _listed;
  end if;

  /*
   * ---- THE ACCEPTANCE HALF -------------------------------------------------
   *
   * "A refusal is not self-verifying", and neither is a summary. A migration
   * that stamped nothing would apply perfectly quietly, so the assertion is
   * NOT on how many rows were written — legitimately fewer than nine if
   * somebody rewatched one after the fix shipped — but on the POST-CONDITION
   * this exists to produce: all nine are complete. A no-op cannot satisfy that
   * unless the work was already done, and the LEFT JOIN means a pair whose row
   * has vanished counts as short rather than passing silently.
   */
  select count(*) into _short
    from _lost_0174 l
    left join content_progress cp
      on cp.user_id = l.user_id and cp.content_id = l.content_id
   where cp.completed_at is null;

  select count(*) into _stamped
    from _lost_0174 l
    join content_progress cp
      on cp.user_id = l.user_id and cp.content_id = l.content_id
   where cp.restored_at is not null;

  if _short > 0 then
    raise exception
      '0174 stamped % of 9 and % are still incomplete — refusing rather than '
      'reporting a success it did not achieve', _stamped, _short;
  end if;

  raise notice '0174: % of 9 stamped here, all 9 completions present', _stamped;
end $$;

drop table if exists _lost_0174;

notify pgrst, 'reload schema';
