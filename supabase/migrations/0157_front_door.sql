/* ===========================================================================
   0157 — the front door: a signed-out preview of a morning
   ===========================================================================

   The app's root, signed out, shows a preview for someone with no account: four
   films, all Mitch — an intro, then one sample from each beat of a morning (a
   mindset film, the selling skill for a real repair, and the lesson that follows)
   — then how certification works, then Sign in and Book a call.

   ---------------------------------------------------------------------------
   WHY THE FILMS NEED PUBLIC PLAYBACK
   ---------------------------------------------------------------------------
   Every film in the library is SIGNED: a playback id is useless without a short-
   lived token minted server-side after the viewer is known to be entitled
   (lib/mux/playback.ts). A signed-out visitor has no session and no entitlement,
   so a signed id cannot play for them. The four assets below were each given a
   SECOND, PUBLIC playback id through the Mux API — the signed id each already had
   is untouched, so the same film stays gated everywhere else. Exactly four films
   are public, and all four were chosen by name.

   The public ids are not secret (a public id is playable by anyone who has it —
   that is the point), so they live in the migration rather than in an env var.

   ---------------------------------------------------------------------------
   front_door_film IS READ BY anon, SO IT IS A DEFINER VIEW
   ---------------------------------------------------------------------------
   The signed-out page reads this with the anon role (no session). The view runs
   with the owner's privileges (security_invoker off, the default), so anon can be
   granted the view and NOTHING on content. It returns content_id, title,
   duration_sec, public_playback_id, slot and caption — and nothing else; the
   caption is the slot's own words, carried here rather than scraped off content.
   ========================================================================== */

-- ---- the curated slots ----------------------------------------------------
create table if not exists front_door_slot (
  slot text primary key check (slot in ('intro', 'mindset', 'pitch', 'item')),
  content_id uuid not null references content(id) on delete cascade,
  public_playback_id text not null,
  /* The slot's line on the front door. Carried here, not derived from content. */
  caption text not null,
  sort int not null default 0
);

comment on table front_door_slot is
  'The four films shown on the signed-out front door, each with its PUBLIC Mux '
  'playback id and its caption. Curated by hand — a shop window, not a feed.';

insert into front_door_slot (slot, content_id, public_playback_id, caption, sort) values
  ('intro',
   '66bfaa74-9941-403d-924c-0f93c80d9e72',
   'FNoqvFm1JHPWE4YVO4FVGQ7541CgEzba02oqrTBeOHGg',
   'Start here. Mitch on what EDIAGD is, and who it is for.', 1),
  ('mindset',
   'fee52ad8-6e22-4a4e-94a8-fff710859299',
   'mp7TC402Xkzo97lyC00Er2c6N7tCFMbBWrkGfTHAvhNgE',
   'Every morning opens with a mindset. Here is one.', 2),
  ('pitch',
   'd9bc3dee-7984-455a-b4b2-ecbefcbb79e5',
   'j02Re6Uy02EuGQSAcF4x6njukybm7Zna112T02fORAm1aw',
   'Then the selling skill, filmed on a real repair — on the drive.', 3),
  ('item',
   '123cfea7-62e6-467e-836f-27c7f0bc3e66',
   'LDlNDOX3w5JL53p9kG6j2hsnAgIwQCGlC01b56o5YZKo',
   'And a lesson it builds toward — the success cycle.', 4)
on conflict (slot) do update
  set content_id = excluded.content_id,
      public_playback_id = excluded.public_playback_id,
      caption = excluded.caption,
      sort = excluded.sort;

-- ---- the view anon reads --------------------------------------------------
create or replace view front_door_film as
  select s.slot,
         s.sort,
         s.public_playback_id,
         s.caption,
         c.id as content_id,
         c.title,
         c.duration_sec
    from front_door_slot s
    join content c on c.id = s.content_id
   where c.status = 'published'
     and c.retired_at is null
   order by s.sort;

comment on view front_door_film is
  'Destination for the signed-out front door. Four curated rows, published and '
  'unretired. Returns content_id, title, duration_sec, public_playback_id, slot '
  'and caption only. Definer (security_invoker off) so anon reads it without any '
  'grant on content.';

grant select on front_door_film to anon, authenticated;
