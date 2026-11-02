-- ============================================================================
-- EDIAGD — 0171 a film carries a short name, and the full one stays put
--
-- ---------------------------------------------------------------------------
-- WHAT THE ITEM SCREEN SHOWED, AND WHAT RYAN RULED
-- ---------------------------------------------------------------------------
-- The morning's item slot printed the track, then a fifteen-word title that
-- repeated the module, then the module name again with its number:
--
--     WALK AROUND
--     30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone
--     6. Steps 1 and 2 — Are You Here to See Anyone? · 29 of 48
--
-- Ryan, 30 October: "these titles are way too long, don't need all of that."
-- The ruling is that the screen becomes
--
--     WALK AROUND · 29 OF 48
--     Are You Here to See Anyone?
--
-- ---------------------------------------------------------------------------
-- A COLUMN, NOT A DERIVATION AT RENDER TIME
-- ---------------------------------------------------------------------------
-- The short name is written down because it is an EDITORIAL fact, not an
-- arithmetic one. Every rule below gets some films wrong and 97 films fit no
-- rule at all; those need a person, and a person cannot edit a regular
-- expression's output. Deriving it on every render would also mean the admin
-- screen, the Slack post and the morning could each derive it slightly
-- differently — the second-definition defect this codebase keeps paying for.
--
-- THE FULL TITLE IS NOT TOUCHED. `title` stays exactly as it is, and it is what
-- admin, search, the trim scripts and the sync scripts read. A slate names the
-- shoot: the film keeps the name Mitch gave it, and the short name is a separate
-- editorial decision recorded beside it rather than written over it. That is the
-- same rule INGEST.md states for routing — nobody reslates a film.
--
-- NULL IS MEANINGFUL AND IS THE DEFAULT. Null means "no short name has been
-- decided", and every reader falls back to `title`. So this migration changes
-- nothing on screen on its own; the backfill script fills what it can and lists
-- what it cannot, and a film nobody has ruled on keeps showing its full title
-- rather than a guess. An exclusion-by-value is only as strong as the guarantee
-- that the value is written (0128), so no rule here depends on short_title being
-- present.
-- ============================================================================

alter table content
  add column if not exists short_title text;

comment on column content.short_title is
  'The name an advisor or a manager reads on screen — the morning''s slots, the '
  'library rows, Certs, the Rollcall screen and the 17:30 Slack post. NULL means '
  'nobody has decided one yet and every reader falls back to `title`. The full '
  '`title` is the slate and stays untouched: admin, search and the trim and sync '
  'scripts read it, and reslating a film to match a curriculum destroys the only '
  'record of what was shot. Filled by `npm run backfill:short-titles`, editable '
  'in admin.';

-- A short name is a name, not an essay: the longest the rules produce today is
-- "Miles, Shut It Off and Tires" at 28 characters. 80 leaves room for a person
-- to disagree with the rules and refuses a pasted paragraph.
alter table content
  drop constraint if exists content_short_title_is_short;
alter table content
  add constraint content_short_title_is_short
  check (short_title is null or char_length(btrim(short_title)) between 1 and 80);

-- ---------------------------------------------------------------------------
-- NO VIEW NEEDS CHANGING, AND THAT IS WORTH STATING RATHER THAN ASSUMING.
-- ---------------------------------------------------------------------------
-- `service_family_content` exposes family, content_id, via and coachable — it
-- is a MAPPING arm, not a projection of content — and every caller joins back
-- to `content` for the name. `my_module_progress` carries module.name, which is
-- a different string and the SOURCE of most short names rather than a consumer
-- of them. So this column reaches every surface through the content row the
-- surface already reads, and nothing else in the schema has to learn about it.

-- ---------------------------------------------------------------------------
-- THE MANAGER'S DRILL-IN NAMES FILMS TOO, AND IT GETS BOTH NAMES
-- ---------------------------------------------------------------------------
-- team_videos_completed (0166) aggregates the titles a manager reads on the
-- Rollcall drill-in. It now returns the SHORT names alongside them, in the same
-- completion order, rather than resolving the fallback here.
--
-- WHY BOTH AND NOT `coalesce(short_title, title)` IN THE AGGREGATE. Because
-- "which name do you print" is one rule, and the TypeScript side already owns it
-- (lib/film-name.ts): a short name counts when it is present AND has ink in it,
-- so an admin who clears the field to "" gets the full title rather than a
-- blank. Writing `coalesce` here would be a SECOND definition that disagrees on
-- exactly that input — the defect this schema keeps paying for. The aggregate
-- reports the two facts; one function decides.
--
-- DROPPED AND RECREATED, NOT REPLACED, AND THE FIRST DRAFT GOT THIS WRONG.
--
-- `create or replace function` CANNOT change a `returns table` signature:
-- Postgres refuses with 42P13, "cannot change return type of existing function —
-- row type defined by OUT parameters is different". The draft called the change
-- "additive" and said a caller selecting by position would not shift, which was
-- a confident wrong statement about a thing the database simply forbids. The
-- replayed chain refused it on the first try, which is what the replay is for.
--
-- So the old signature goes first. Nothing depends on it structurally — it is
-- called from lib/team-today.ts over RPC, never from another database object —
-- and the grant is re-issued below because dropping a function drops its
-- privileges with it. THAT is the part a drop-and-recreate loses silently, and
-- a Team screen that reads zero rows with no error is this file's own named
-- failure.
drop function if exists team_videos_completed(uuid, date);

create function team_videos_completed(_rooftop uuid, _day date)
returns table (
  user_id      uuid,
  video_count  int,
  titles       text[],
  short_titles text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.user_id,
    count(*)::int as video_count,
    /* Ordered by WHEN THEY FINISHED IT, so the drill-in reads as the morning
       happened rather than alphabetically. array_remove guards a null title
       rather than letting it become a hole in the list. */
    array_remove(array_agg(c.title order by cp.completed_at), null) as titles,
    /*
     * THE SAME ORDER, AND NULLS KEPT ON PURPOSE.
     *
     * array_remove is NOT applied here, and that is the whole reason this works:
     * the two arrays are read in parallel, index by index, so dropping the nulls
     * from one of them would shift every name after the first film that has no
     * short title onto the wrong row. A null here means "no short name" and the
     * caller falls back for that one entry.
     */
    array_agg(c.short_title order by cp.completed_at) as short_titles
  from content_progress cp
  join content c on c.id = cp.content_id
 where cp.rooftop_id = _rooftop
   and cp.completed_at is not null
   and cp.completed_at >= rooftop_local_at(_rooftop, _day, '00:00')
   and cp.completed_at <  rooftop_local_at(_rooftop, (_day + 1), '00:00')
   /* A video is something you can play. See 0166's header. */
   and c.mux_playback_id is not null
   /* ---- THE GATE, COPIED VERBATIM FROM 0166 -----------------------------
      Not paraphrased, and this is not fussiness: the first draft of this
      replacement rewrote it to two arms and dropped the explicit service_role
      one — which is the exact regression 0166's own comment says that arm
      exists to prevent, because a definer gets nothing from BYPASSRLS and
      auth.uid() is null for a cron, so a server-side caller would read zero
      rows and no error. Replacing a function means re-stating every condition
      it had, and the safe way to do that is to copy them.

      platform owner  sees every store, as everywhere else
      admin / manager  via managed_rooftops() — the Team screen's caller
      group owner/mgr  also via managed_rooftops() (0045 unions org roles in)
      advisor          NOT a caller; managed_rooftops() returns nothing for
                       them, so zero rows rather than a leak
      technician       same as advisor
      service_role     named EXPLICITLY — see above */
   and (
         is_platform_owner()
      or _rooftop in (select managed_rooftops())
      or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
         = 'service_role'
       )
 group by cp.user_id;
$$;

comment on function team_videos_completed(uuid, date) is
  'Videos each advisor finished on the store''s day, with the count and the '
  'titles in completion order, plus short_titles (0171) in the SAME order with '
  'nulls kept so the two arrays can be read index by index. SECURITY DEFINER '
  'because counting videos must not depend on the viewer''s content entitlement; '
  'the rooftop gate is inside. Which of the two names to print is decided once, '
  'in lib/film-name.ts — not here.';

-- THE GRANT, RE-ISSUED. `drop function` takes its privileges with it, so
-- without this the Team screen's RPC call would fail for exactly the roles 0166
-- granted it to — and it would fail as "function not found", which reads like a
-- missing migration rather than a missing grant.
grant execute on function team_videos_completed(uuid, date) to authenticated;
grant execute on function team_videos_completed(uuid, date) to service_role;
