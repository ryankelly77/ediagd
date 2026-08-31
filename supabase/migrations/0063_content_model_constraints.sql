-- ============================================================================
-- EDIAGD — 0063 The rules the model actually depends on, and the end of `series`
--
-- 0062 added the columns and the checks that tolerate a null, because a
-- constraint added before the data can satisfy it is a migration that fails on
-- somebody else's machine. The backfill has run; these are the three that need
-- clean data, plus the column the model replaces.
--
-- Verified against prod before writing, not after:
--   Pitches without an op code            0
--   stage set with no op code             0
--   format='video' with no playable asset 0   (the one placeholder is retired)
-- ============================================================================


-- ---- 1. A pitch is about something -----------------------------------------
/*
 * The whole point of the Pitches collection is that a video answers "how do I
 * sell THIS". Without an op code it is a video about nothing, filed on a shelf
 * organised by op code — and the detail screen would offer it in a rotation
 * keyed on a column it has no value for.
 */
alter table content drop constraint if exists content_pitch_needs_op_code;
alter table content add constraint content_pitch_needs_op_code
  check (collection is distinct from 'Pitches by Op Code' or op_code is not null);


-- ---- 2. A stage is a position within a pitch -------------------------------
/*
 * 'At the Kiosk' means nothing on a mindset video — there is no conversation to
 * be at a point in. Stage is only meaningful once an op code says which pitch
 * we are staging, so the two travel together or neither is set.
 */
alter table content drop constraint if exists content_stage_needs_op_code;
alter table content add constraint content_stage_needs_op_code
  check (op_code is not null or stage is null);


-- ---- 3. A video plays, or it is retired ------------------------------------
/*
 * THE ONE THAT PROTECTS THE ADVISOR. A published video row with no playback id
 * renders a player pointing at nothing on somebody's phone, mid-shift. There
 * are exactly two honest states: it plays, or it has been withdrawn.
 *
 * `retired_at`, not `archived_at` — 0058 already owns that word for "a trim
 * replaced the master". Two different events, two different columns, so a query
 * for one can never accidentally catch the other.
 */
alter table content drop constraint if exists content_video_playable;
alter table content add constraint content_video_playable
  check (
    format is distinct from 'video'
    or mux_playback_id is not null
    or video_url is not null
    or retired_at is not null
  );


-- ---- 4. `series` goes ------------------------------------------------------
/*
 * `collection` replaces it. Two columns meaning "which shelf" is exactly the
 * drift this model exists to end, and leaving the old one for a later release
 * is how it survives — the next person writes to whichever they find first.
 *
 * Nothing READS it: the daily loop selects on `placement` (where a thing is
 * served) and never on `series` (what shelf it came off). The only writers were
 * the upload draft and the Mux webhook, both switched to `collection` in the
 * same change as this migration.
 *
 * 58 rows carried a value; all 58 were backfilled into `collection` first.
 */
alter table content drop column if exists series;
