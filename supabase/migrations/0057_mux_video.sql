-- ============================================================================
-- EDIAGD — 0057 Real video, and where each one belongs
--
-- Until now `content.video_url` was a text column holding a path, and it held
-- one value in the whole library: the nine-second beach clip from the login
-- background, attached by hand so the player could be walked end to end. Every
-- other video row was a placeholder with a gold "Not uploaded yet" chip.
--
-- This is the schema for actual video, delivered by Mux.
--
-- ---------------------------------------------------------------------------
-- 1. WHY NOT JUST PUT THE PLAYBACK ID IN video_url
-- ---------------------------------------------------------------------------
-- Because a Mux playback id is not a URL and must never be treated as one. A
-- SIGNED playback id is useless on its own — it needs a short-lived JWT minted
-- server-side per view — so anything that reads video_url and drops it into a
-- src attribute would render a broken player and, worse, would look like it was
-- meant to work.
--
-- Separate columns make the two cases impossible to confuse: video_url still
-- means "a file we host and can link to", mux_playback_id means "ask the server
-- for a token first". A check constraint below refuses rows that claim both.
--
-- ---------------------------------------------------------------------------
-- 2. SIGNED ONLY, AND THE POLICY IS RECORDED PER ROW
-- ---------------------------------------------------------------------------
-- Both assets uploaded so far use the signed playback policy. mux_playback_policy
-- records which policy an id was created under, because a public id and a signed
-- id look identical and the failure mode is silent: a public id works without a
-- token, so a bug that skips signing would go unnoticed until someone shared a
-- URL that never expires.
--
-- The default is 'signed'. A row has to say 'public' out loud.
--
-- ---------------------------------------------------------------------------
-- 3. WHERE A VIDEO SURFACES IS DATA, NOT A GUESS
-- ---------------------------------------------------------------------------
-- content_type covers WHO may see a thing (advisor_video, manager_video,
-- joe_the_pro) and RLS is built on it. It says nothing about WHERE a video
-- appears, and the daily loop needs exactly that: the Buffett video belongs in
-- the lifestyle slot, "Why EDIAGD" belongs in onboarding, and both are
-- advisor_video as far as entitlement is concerned.
--
-- The old library_key enum tried to carry this and was orphaned in 0010 — its
-- 'general_sales' value ("lifestyle / craft coaching") is the concept being
-- restored here, as a nullable placement rather than a required taxonomy.
--
-- ---------------------------------------------------------------------------
-- 4. PROGRESS GAINS A POSITION
-- ---------------------------------------------------------------------------
-- content_progress was a single terminal INSERT written once at completion, so
-- there was nothing to resume from and no way to see a half-watched video. A
-- real player emits progress continuously; position_sec and updated_at let that
-- be recorded without inventing a second table.
--
-- watched_pct keeps its meaning — FURTHEST point reached, never current — so
-- scrubbing backwards cannot take away credit already earned. That rule lives
-- in CueDeck today and is now written down where the column is.
-- ============================================================================


-- ---- 1. Mux on content --------------------------------------------------------

alter table content
  add column if not exists mux_asset_id        text,
  add column if not exists mux_playback_id     text,
  add column if not exists mux_playback_policy text
    check (mux_playback_policy in ('signed', 'public')),
  add column if not exists aspect_ratio        text,
  add column if not exists captions_ready      boolean not null default false;

comment on column content.mux_playback_id is
  'Mux playback id. NOT a URL: a signed id needs a short-lived JWT minted '
  'server-side per authenticated view. See lib/mux/playback.ts.';

comment on column content.mux_playback_policy is
  'Which policy the playback id was created under. Signed by default because a '
  'public id works without a token, so a signing bug would fail silently.';

/* A row is hosted-file OR Mux, never both — otherwise which one plays is
   whichever branch the reader happened to check first. */
alter table content drop constraint if exists content_one_video_source;
alter table content add constraint content_one_video_source
  check (video_url is null or mux_playback_id is null);

/* A Mux row needs its policy stated. */
alter table content drop constraint if exists content_mux_policy_required;
alter table content add constraint content_mux_policy_required
  check (mux_playback_id is null or mux_playback_policy is not null);

create index if not exists content_mux_asset on content (mux_asset_id)
  where mux_asset_id is not null;


-- ---- 2. Series and placement ---------------------------------------------------
/**
 * SERIES is editorial grouping — "Buffett Series", "Walk-Around". Free text on
 * purpose: Mitch will invent these faster than an enum can be migrated, and
 * nothing branches on the value.
 *
 * PLACEMENT is where the app surfaces it, and IS branched on, so it is
 * constrained. Null means library-only, which is the honest default for the
 * seven hundred videos that will land with no特 special home.
 */
do $$ begin
  create type content_placement as enum (
    'daily_lifestyle',   -- the daily loop's lifestyle / sales-skill slot
    'daily_pitch',       -- the daily loop's service pitch slot
    'onboarding_intro'   -- first-run, before the daily loop is ever seen
  );
exception when duplicate_object then null; end $$;

alter table content
  add column if not exists series    text,
  add column if not exists placement content_placement;

create index if not exists content_placement_idx on content (placement)
  where placement is not null;

comment on column content.placement is
  'Where the app surfaces this, as opposed to who may see it (content_type). '
  'Null means library-only.';


-- ---- 3. Progress gains a position ----------------------------------------------

alter table content_progress
  add column if not exists position_sec int,
  add column if not exists updated_at   timestamptz not null default now();

comment on column content_progress.watched_pct is
  'FURTHEST point reached, never the current position. Scrubbing backwards must '
  'not remove credit already earned.';

drop trigger if exists content_progress_touch on content_progress;
create trigger content_progress_touch
  before update on content_progress
  for each row execute function touch_updated_at();

/**
 * Record a watch without needing a second round trip to decide insert vs update.
 *
 * MONOTONIC BY CONSTRUCTION: watched_pct only ever increases, because greatest()
 * is applied in the upsert rather than trusted from the caller. A client
 * replaying an old event, or lying, cannot walk somebody's progress backwards.
 *
 * COMPLETION IS NOT SET HERE. Crossing the threshold is a transaction — Sand
 * Dollars, badges, possibly a streak — and that stays in the server actions
 * where it can be rolled back. This only remembers where they got to.
 */
create or replace function record_watch_progress(
  _content_id uuid,
  _pct        int,
  _position   int default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _rooftop uuid;
  _row content_progress;
begin
  if _uid is null then
    raise exception 'record_watch_progress: not signed in';
  end if;

  select m.rooftop_id into _rooftop
    from membership m
   where m.user_id = _uid and m.active
   order by m.created_at
   limit 1;

  if _rooftop is null then
    raise exception 'record_watch_progress: no active membership';
  end if;

  insert into content_progress (user_id, rooftop_id, content_id, watched_pct, position_sec)
  values (_uid, _rooftop, _content_id, greatest(0, least(100, _pct)), _position)
  on conflict (user_id, content_id) do update
    set watched_pct  = greatest(content_progress.watched_pct,
                                greatest(0, least(100, excluded.watched_pct))),
        position_sec = excluded.position_sec
  returning * into _row;

  return jsonb_build_object(
    'watched_pct', _row.watched_pct,
    'position_sec', _row.position_sec,
    'completed', _row.completed_at is not null
  );
end $$;

revoke all on function record_watch_progress(uuid, int, int) from public, anon;
grant execute on function record_watch_progress(uuid, int, int) to authenticated;


-- ---- 4. Direct uploads ---------------------------------------------------------
/**
 * One row per direct upload, so the admin screen can show what is still
 * transcoding and the webhook has somewhere to land.
 *
 * WHY A TABLE AND NOT JUST content. An upload exists before an asset does, and
 * an asset exists before it is playable. Writing a half-formed content row and
 * patching it later means the library briefly contains videos that cannot play
 * — which is exactly the "fake player is worse than no player" failure the rest
 * of this codebase avoids. The content row is created when the asset is READY.
 */
create table if not exists mux_upload (
  id            uuid primary key default gen_random_uuid(),
  upload_id     text not null unique,          -- Mux direct-upload id
  asset_id      text,                          -- arrives with the webhook
  playback_id   text,
  status        text not null default 'waiting'
                  check (status in ('waiting','asset_created','ready','errored','cancelled')),
  error_message text,
  -- What the admin typed on the upload screen, held until the asset is ready.
  draft         jsonb not null default '{}'::jsonb,
  content_id    uuid references content(id) on delete set null,
  created_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists mux_upload_status on mux_upload (status, created_at desc);
create index if not exists mux_upload_asset on mux_upload (asset_id) where asset_id is not null;

drop trigger if exists mux_upload_touch on mux_upload;
create trigger mux_upload_touch
  before update on mux_upload
  for each row execute function touch_updated_at();

alter table mux_upload enable row level security;

/* Admins and the platform owner. Same audience as content itself. */
drop policy if exists mux_upload_admin_all on mux_upload;
create policy mux_upload_admin_all on mux_upload
  for all
  using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  )
  with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );

grant select, insert, update, delete on mux_upload to authenticated;


-- ---- 5. The two videos that exist ----------------------------------------------
/**
 * Both were uploaded to Mux by hand before this pipeline existed. They are
 * seeded here rather than through the admin screen so the daily loop and
 * onboarding have something real to play the moment this migration lands.
 *
 * These are the last two asset ids anybody types by hand.
 */
insert into content (
  type, title, body, series, placement,
  mux_asset_id, mux_playback_id, mux_playback_policy,
  aspect_ratio, captions_ready, status, source
) values
  (
    'advisor_video',
    'Warren Buffett Quote',
    'The lifestyle and sales-skill half of the daily loop.',
    'Buffett Series',
    'daily_lifestyle',
    'Z1iotEMVDaLnjMG7UCeW4eAw00MyfLn5LkP37s7p7HtU',
    '5rOISHrtPQNJOLPV017EmhgaAiaX7WCnyv2JnME00yL7M',
    'signed', '16:9', true, 'published',
    'Mux — first real video, seeded in 0057'
  ),
  (
    'advisor_video',
    'Why EDIAGD',
    'What a new advisor sees first: why this exists and what the daily habit is for.',
    'Onboarding',
    'onboarding_intro',
    'b4z5Pia9cs6Wo2lCiS1rPtrNxx5RB3TBHzxUfijRdV8',
    'IvpJc02ZVqL4yzI13PywTRggRLNVFxpPxjugZ7hCqFWw',
    'signed', '16:9', true, 'published',
    'Mux — onboarding intro, seeded in 0057'
  )
on conflict do nothing;

notify pgrst, 'reload schema';
