-- ============================================================================
-- EDIAGD — 0107 A replacement should say which take it is
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
-- replace_master_asset swaps the asset, the playback id, the duration and the
-- vertical's freshness — and leaves `version` and `canonical_filename` exactly
-- as they were. So after fifty-four reshoots landed, every one of those rows
-- claimed to be v1 of a file that is no longer on the shelf: the master is now
-- "… — v2.mov" under 02 - Published, and the name the row carries was renamed
-- "(superseded by v2)" and moved to 04 - Archive by the same script.
--
-- The video was right the whole time. The bookkeeping was not, and bookkeeping
-- that disagrees with the shelf is worse than none: scripts/ingest-videos.ts
-- decides "is this a reshoot, and of what" by comparing the version in a
-- filename against the version on the row, and a row frozen at v1 makes every
-- future drop look like a bigger jump than it is.
--
-- ---------------------------------------------------------------------------
-- THE CALLER DECIDES, BECAUSE NOT EVERY SWAP IS A NEW TAKE
-- ---------------------------------------------------------------------------
-- A trim is a replacement too — same take, cut differently — and it must NOT
-- bump anything. Only a swap that came from a new FILE is a new version. The
-- function cannot tell those apart, so it stops guessing and takes the answer
-- as arguments; replace-video passes them only when it was given a file.
--
-- Both new parameters default to null and null means "leave it alone", so
-- every existing caller keeps its current behaviour.
-- ============================================================================

create or replace function replace_master_asset(
  _content_id      uuid,
  _new_asset_id    text,
  _new_playback_id text,
  _new_duration    int default null,
  /** The take this now is. Null for a trim, which is the same take. */
  _new_version     int default null,
  /** What the master is called on the shelf now. Null to leave it. */
  _new_canonical   text default null
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
         version            = coalesce(_new_version, version),
         canonical_filename = coalesce(_new_canonical, canonical_filename),
         -- The vertical was cut from the OLD master. It is now wrong.
         vertical_status    = case
                                when vertical_playback_id is not null then 'stale'::vertical_status
                                else vertical_status
                              end
   where id = _content_id;

  return jsonb_build_object(
    'content_id', _content_id,
    'archived', _old,
    'version', coalesce(_new_version, (select version from content where id = _content_id)),
    'vertical', 'marked stale'
  );
end $$;

revoke all on function replace_master_asset(uuid, text, text, int, int, text) from public, anon;

/*
 * The four-argument form is dropped rather than left beside the new one.
 *
 * Postgres would happily keep both as an overload, and then the call that
 * forgets the version would still resolve — which is the bug, still reachable,
 * with a second way to write it. There is one caller and it is being updated in
 * the same commit.
 */
drop function if exists replace_master_asset(uuid, text, text, int);

notify pgrst, 'reload schema';
