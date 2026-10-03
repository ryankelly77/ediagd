/* ===========================================================================
   0156 — the front door: a signed-out preview of a morning
   ===========================================================================

   The app's root, signed out, shows a preview for someone with no account: an
   intro, one sample from each part of a morning (a mindset film, a pitch film,
   and the lesson that follows), how certification works, then Sign in and Book a
   call. The marketing is the thing a non-account visitor can actually watch.

   ---------------------------------------------------------------------------
   WHY THE SAMPLE FILMS NEED PUBLIC PLAYBACK, AND WHY ONLY THESE TWO
   ---------------------------------------------------------------------------
   Every film in the library is SIGNED: a playback id is useless without a
   short-lived token minted server-side after the viewer is known to be entitled
   (lib/mux/playback.ts). A signed-out visitor has no session and no entitlement,
   so a signed id cannot play for them. Two sample assets were therefore given a
   SECOND, PUBLIC playback id through the Mux API — the signed id each already had
   is untouched, so the same film stays gated everywhere else. Exactly two films
   are public, by deliberate choice: a shop window, not the library.

   The public ids are not secret (a public id is playable by anyone who has it —
   that is the point), so they live in the migration rather than in an env var.

   ---------------------------------------------------------------------------
   front_door_film IS READ BY anon, SO IT IS A DEFINER VIEW
   ---------------------------------------------------------------------------
   The signed-out page reads this with the anon role (no session). The view runs
   with the owner's privileges (security_invoker off, the default), so anon can be
   granted the view and NOTHING on content — same boundary as the blog corpus. The
   WHERE clause is the only thing that lets a row out: published, not retired, and
   only the three curated slots. No advisor, rooftop, membership or number is
   reachable through it.
   ========================================================================== */

-- ---- the curated slots ----------------------------------------------------
create table if not exists front_door_slot (
  slot text primary key check (slot in ('mindset', 'pitch', 'item')),
  content_id uuid not null references content(id) on delete cascade,
  /* The PUBLIC Mux playback id for a film slot; null for the text item. */
  public_playback_id text,
  sort int not null default 0
);

comment on table front_door_slot is
  'The three films/cues shown on the signed-out front door, and the PUBLIC Mux '
  'playback id for each playable one. Curated by hand — a shop window, not a feed.';

insert into front_door_slot (slot, content_id, public_playback_id, sort) values
  -- A mindset sample: "20 Years to Build a Reputation" (Buffett), 0:27.
  ('mindset', 'e4d40ca9-0587-48f6-ba40-95a55251ce0c',
   'UD02GyGL5uyfUsFw00E4NjCRNyRt6Py65aNUiKUIc8rfw', 1),
  -- A pitch sample: Battery, On the Drive (BAT-033), 3:06.
  ('pitch', '4a579f12-d22a-4b28-81a1-959409891b10',
   'HD6fIf4ufU9bJ4crq9xM1AnYSndBWDGRYbBnca300202g', 2),
  -- The lesson that follows the films: a cue, text only, no public playback.
  ('item', 'b87dd4b3-9114-4a1e-aa15-59c03947c695', null, 3)
on conflict (slot) do update
  set content_id = excluded.content_id,
      public_playback_id = excluded.public_playback_id,
      sort = excluded.sort;

-- ---- the view anon reads --------------------------------------------------
create or replace view front_door_film as
  select s.slot,
         s.sort,
         s.public_playback_id,
         c.id as content_id,
         c.title,
         c.collection,
         c.op_code,
         c.stage,
         c.duration_sec,
         c.body
    from front_door_slot s
    join content c on c.id = s.content_id
   where c.status = 'published'
     and c.retired_at is null
   order by s.sort;

comment on view front_door_film is
  'Destination for the signed-out front door. Three curated rows, published and '
  'unretired, content only. Definer (security_invoker off) so anon reads it '
  'without any grant on content.';

-- anon is the signed-out page's role; authenticated gets it too so a logged-in
-- preview renders the same thing. Nothing else is granted.
grant select on front_door_film to anon, authenticated;
