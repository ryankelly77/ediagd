-- ============================================================================
-- EDIAGD — 0058 Two formats for every video
--
-- POLICY, RECORDED HERE BECAUSE IT IS NOW STRUCTURAL: Mitch shoots 4K landscape
-- masters, centre-framed. Every upload yields TWO assets — the landscape master
-- and a 9:16 vertical crop derived from it. The app plays vertical; landscape is
-- the master for YouTube, marketing, and the rare wide-frame demo.
--
-- ---------------------------------------------------------------------------
-- WHY DERIVE RATHER THAN SHOOT VERTICAL
-- ---------------------------------------------------------------------------
-- A landscape master can always become vertical. A vertical master can never
-- become landscape — the pixels are not there. Shooting wide and centre-framed
-- keeps both options open forever, at the cost of one ffmpeg pass per video.
--
-- Mux cannot do this. It transcodes to many resolutions at the SAME aspect
-- ratio; there is no content-aware reframing anywhere in its pipeline. The crop
-- is ours to make, which is why this migration has a status column: derivation
-- happens outside the request/response cycle and can fail.
--
-- ---------------------------------------------------------------------------
-- ONE CONTENT ROW, TWO PLAYBACK IDS
-- ---------------------------------------------------------------------------
-- Not two content rows. A video is one piece of content that happens to exist
-- in two shapes; splitting it in the library would double every count, every
-- progress row and every completion, and force every reader to know which twin
-- it was holding.
--
-- So mux_playback_id stays the LANDSCAPE master — it is what 0057 wrote and
-- what marketing exports from — and vertical_playback_id is added beside it.
-- The player picks by surface, not by row.
--
-- ---------------------------------------------------------------------------
-- TRIM BEFORE DERIVE
-- ---------------------------------------------------------------------------
-- Both formats must share a cut, or the vertical and the landscape drift a
-- second apart and every caption timing, every "watched 90%", and every clip
-- anybody makes from the master disagrees. So a trim replaces the master and
-- INVALIDATES the vertical, which is what vertical_status = 'stale' is for.
-- ============================================================================


-- ---- 1. Orientation vocabulary -------------------------------------------------

do $$ begin
  create type video_orientation as enum ('landscape', 'vertical');
exception when duplicate_object then null; end $$;

/**
 * Where a derived vertical is in its life.
 *
 *   none    — not attempted. The default, and the honest state for the seven
 *             hundred videos that have not been through the pipeline.
 *   pending — queued. The webhook sets this; a worker picks it up.
 *   ready   — vertical_playback_id is playable.
 *   stale   — the master was trimmed or replaced and the vertical no longer
 *             matches it. Playable, but wrong, so the player falls back rather
 *             than showing a video a second out of step with its captions.
 *   failed  — derivation was attempted and did not work. error recorded.
 */
do $$ begin
  create type vertical_status as enum ('none', 'pending', 'ready', 'stale', 'failed');
exception when duplicate_object then null; end $$;


-- ---- 2. The second rendition ---------------------------------------------------

alter table content
  add column if not exists vertical_asset_id     text,
  add column if not exists vertical_playback_id  text,
  add column if not exists vertical_status       vertical_status not null default 'none',
  add column if not exists vertical_error        text,
  add column if not exists vertical_derived_at   timestamptz,
  /* Which shape the ORIGINAL was shot in. A vertical-native upload needs no
     derivation and must not be queued for one. */
  add column if not exists orientation           video_orientation not null default 'landscape',
  /* Set when a trim replaces the master, so the superseded asset is traceable
     rather than orphaned in the Mux account. */
  add column if not exists archived_asset_id     text,
  add column if not exists archived_at           timestamptz;

comment on column content.mux_playback_id is
  'The LANDSCAPE master. Marketing and wide-frame demos play this. The app '
  'plays vertical_playback_id — see 0058.';

comment on column content.vertical_playback_id is
  'The 9:16 crop derived from the master. What the daily loop and Eddie''s Pick '
  'actually play.';

comment on column content.vertical_status is
  'stale means the master changed after derivation: playable but out of step, '
  'so the player must fall back rather than show it.';

/* A vertical id and a status that denies it is a contradiction somebody will
   otherwise debug for an hour.

   BOTH 'ready' AND 'stale' HOLD AN ID. Stale means the crop exists and plays —
   it is simply cut from a master that has since been trimmed, so it is a second
   out of step. The id has to survive that state, or re-deriving after a trim
   would have nothing to replace and the player would lose its fallback. */
alter table content drop constraint if exists content_vertical_consistent;
alter table content add constraint content_vertical_consistent
  check (
    (vertical_playback_id is not null) = (vertical_status in ('ready', 'stale'))
  );

create index if not exists content_vertical_pending
  on content (vertical_status)
  where vertical_status in ('pending', 'stale', 'failed');


-- ---- 3. What the worker claims -------------------------------------------------
/**
 * Rows waiting for a vertical, oldest first.
 *
 * A VIEW RATHER THAN A QUEUE TABLE. The work is idempotent and cheap to
 * recompute — derive, upload, write back — so the state of the content row IS
 * the queue. A second table would need reconciling with this one, and the
 * failure mode of that drift is a video that silently never gets derived.
 */
create or replace view vertical_derivation_queue as
select
  c.id            as content_id,
  c.title,
  c.mux_asset_id,
  c.mux_playback_id,
  c.vertical_status,
  c.vertical_error,
  c.duration_sec,
  c.created_at
from content c
where c.orientation = 'landscape'
  and c.mux_asset_id is not null
  and c.vertical_status in ('pending', 'stale', 'failed')
order by c.created_at;

alter view vertical_derivation_queue set (security_invoker = on);
grant select on vertical_derivation_queue to authenticated;


-- ---- 4. Writing a derivation back ----------------------------------------------
/**
 * Record a finished vertical.
 *
 * SECURITY DEFINER, service-role only. The worker runs outside a user session —
 * it is a script on somebody's machine or a container, not a browser — and it
 * must not need an admin's credentials to write back.
 */
create or replace function set_vertical_rendition(
  _content_id  uuid,
  _asset_id    text,
  _playback_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     <> 'service_role'
     and not is_platform_owner() then
    raise exception 'set_vertical_rendition: service role or platform owner only';
  end if;

  update content
     set vertical_asset_id    = _asset_id,
         vertical_playback_id = _playback_id,
         vertical_status      = 'ready',
         vertical_error       = null,
         vertical_derived_at  = now()
   where id = _content_id;

  return jsonb_build_object('content_id', _content_id, 'status', 'ready');
end $$;

revoke all on function set_vertical_rendition(uuid, text, text) from public, anon;

create or replace function fail_vertical_rendition(_content_id uuid, _error text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     <> 'service_role'
     and not is_platform_owner() then
    raise exception 'fail_vertical_rendition: service role or platform owner only';
  end if;

  update content
     set vertical_status = 'failed',
         vertical_error  = left(_error, 500)
   where id = _content_id;

  return jsonb_build_object('content_id', _content_id, 'status', 'failed');
end $$;

revoke all on function fail_vertical_rendition(uuid, text) from public, anon;


-- ---- 5. A trim invalidates the vertical ----------------------------------------
/**
 * Swap in a trimmed master and mark the vertical stale in one statement.
 *
 * ONE FUNCTION SO THE TWO CANNOT DRIFT. Updating the master without
 * invalidating the vertical leaves the app playing a video a second out of step
 * with the master everything else is measured against — and nothing would
 * report an error, which is the worst kind of wrong.
 */
create or replace function replace_master_asset(
  _content_id      uuid,
  _new_asset_id    text,
  _new_playback_id text,
  _new_duration    int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare _old text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     <> 'service_role'
     and not is_platform_owner() then
    raise exception 'replace_master_asset: service role or platform owner only';
  end if;

  select mux_asset_id into _old from content where id = _content_id;

  update content
     set archived_asset_id  = _old,
         archived_at        = now(),
         mux_asset_id       = _new_asset_id,
         mux_playback_id    = _new_playback_id,
         duration_sec       = coalesce(_new_duration, duration_sec),
         -- The vertical was cut from the OLD master. It is now wrong.
         vertical_status    = case
                                when vertical_playback_id is not null then 'stale'::vertical_status
                                else vertical_status
                              end
   where id = _content_id;

  return jsonb_build_object(
    'content_id', _content_id,
    'archived', _old,
    'vertical', 'marked stale'
  );
end $$;

revoke all on function replace_master_asset(uuid, text, text, int) from public, anon;

notify pgrst, 'reload schema';
