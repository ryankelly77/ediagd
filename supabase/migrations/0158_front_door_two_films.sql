/* ===========================================================================
   0158 — the front door shows two films, and nothing else
   ===========================================================================

   Ryan's final ruling. The signed-out front door plays exactly two films:

     mindset  The One Thing You Can Control Every Day Is Your Attitude
     item     The Four Minute Walk-Around, Part 1

   No intro card, no pitch card, no stills, no fallback branch. Each plays on
   the PUBLIC playback id the website already uses, so this migration mints
   nothing: exactly two public playback ids exist in the Mux account and that
   number does not change.

   0157 is applied and is therefore never edited; this is its next number.

   ---------------------------------------------------------------------------
   WHY THIS IS NOT JUST A DELETE OF TWO ROWS
   ---------------------------------------------------------------------------
   0157 seeded four slots against four public ids that were minted for it. Those
   four ids have since been DELETED from Mux, so the two rows 0157 wrote for
   intro and pitch now name playback ids that 404. Production was then hand-
   edited: intro and pitch were removed, public_playback_id was made nullable,
   and the two surviving rows were pointed at the website's public ids —
   but their content_id was left on 0157's films. The result is live right now:

     slot     label the page prints        film the player streams
     mindset  If You Want Average   (81s)  Attitude            (64s)
     item     Success Cycle, Part 12(229s) Walk-Around, Part 1 (212s)

   The title, the duration and the caption all describe a film the visitor never
   sees. A label is not evidence of what is behind it, so the content_id is
   corrected here rather than left to agree by accident.

   This migration is idempotent and lands correctly whether or not those hand
   edits were made: it deletes by exclusion, upserts by key, and asserts the
   shape it claims at the end instead of trusting that the statements above ran.

   ---------------------------------------------------------------------------
   anon COULD REWRITE THE SHOP WINDOW
   ---------------------------------------------------------------------------
   front_door_slot was created in `public`, so it inherited Supabase's default
   privileges: anon and authenticated each hold INSERT, UPDATE, DELETE and
   TRUNCATE on it, and RLS was never enabled. Anyone holding the anon key — it
   ships in the browser bundle, that is its job — could rewrite or empty the
   front door. 0157 granted the view and never revoked the table.

   Asked the other way round, as a class rather than an instance: of 85 tables in
   `public`, 84 have RLS on, and front_door_slot is the ONLY one with RLS off and
   the only one exposing a write to anon. The sweep is the evidence that this is
   a hole of exactly one, and it is closed below.
   ========================================================================== */

-- ---- 1. only the two ruled slots survive ----------------------------------
-- By exclusion, so a hand-added slot of any name goes too.
delete from front_door_slot where slot not in ('mindset', 'item');

-- ---- 2. the two films, by content_id and public playback id ---------------
/* Durations cross-check the pairing from the other side: the Mux census returns
   exactly two public ids, 64s on asset dmlC02… and 212s on asset iRiRLW…, and
   content.duration_sec for these two rows is 64 and 212. Two systems, same
   quantity, reconciled — rather than a title match. */
/* ---------------------------------------------------------------------------
   AMENDED 5 OCTOBER 2026 — the same existence guard 0157 now carries.

   Ryan's ruling named 0157. THE SAME DEFECT WAS HERE, one migration later, and
   fixing only the instance named would have moved the failure from 0157 to
   0158 and left the chain exactly as unreplayable — which is this codebase's
   own rule that a defect you find is a class, not an instance.

   The question the bug is an answer to: WHICH MIGRATIONS INSERT A HARDCODED
   content_id THROUGH A FOREIGN KEY WITH NO GUARD? Swept across all 160
   migrations: exactly two, 0157 and 0158, both of them front_door_slot. Both
   are guarded now, and the sweep is the evidence the class is closed rather
   than the instance.

   No-op on production, where both films exist. On a fresh local it inserts
   nothing, and section 8's assertions take the skip path instead of failing on
   an empty shop window.
   --------------------------------------------------------------------------- */
insert into front_door_slot (slot, content_id, public_playback_id, caption, sort)
select v.slot, v.content_id::uuid, v.public_playback_id, v.caption, v.sort
  from (values
    ('mindset',
     'ee3148e1-5659-4f57-9ad8-f1b73e7c18aa',  -- The One Thing You Can Control…
     'XWT1R1T6nP00hwQbRsfibS7KPQ6wt3iGrTler7KsCjjw',
     'Every morning opens with a mindset. Here is one.', 1),
    ('item',
     '42aadd23-5e6f-4fcf-b4b5-c2d8d4f85d05',  -- The Four Minute Walk-Around, Part 1
     '5Qn021M01ITgHm023WIq00ccx8dRwSQFAyrKrG7eXX00EO3U',
     'And a lesson it builds toward. This one is the Four Minute Walk-Around, lesson one of track one.', 2)
  ) as v(slot, content_id, public_playback_id, caption, sort)
 where exists (select 1 from content c where c.id = v.content_id::uuid)
on conflict (slot) do update
  set content_id = excluded.content_id,
      public_playback_id = excluded.public_playback_id,
      caption = excluded.caption,
      sort = excluded.sort;

-- ---- 3. two slots is now the only representable state ---------------------
/* The ruling is enforced by the constraint rather than by the seed above, so a
   third slot cannot be added later without a migration that says so. */
alter table front_door_slot drop constraint if exists front_door_slot_slot_check;
alter table front_door_slot
  add constraint front_door_slot_slot_check check (slot in ('mindset', 'item'));

-- ---- 4. a slot without a public id cannot exist ---------------------------
/* Put back the NOT NULL that the prod hand-edit dropped. With no nullable
   column there is no "film with no way to play it" row for the page to have to
   branch on — which is why the page has no fallback branch to get wrong. */
alter table front_door_slot alter column public_playback_id set not null;

-- ---- 5. anon reads the window and cannot touch it -------------------------
alter table front_door_slot enable row level security;

/* No policy is added deliberately. front_door_film is a DEFINER view owned by
   postgres (security_invoker off), and a table's owner is exempt from its own
   RLS — so the view keeps returning both rows to anon while a direct request to
   front_door_slot returns nothing to anybody but the service role. Curation is
   a migration's job; there is no application path that writes this table. */

revoke all on front_door_slot from anon, authenticated;

-- ---- 6. the view is unchanged; its grant is narrowed to anon --------------
/* The view definition from 0157 stands as it is — same columns, same join, same
   published/unretired filter, still definer so anon needs no grant on content.
   Only the grant moves.

   Naming every role that really calls it, which is the step this project keeps
   paying for skipping:
     anon          the signed-out front door                     — needs SELECT
     authenticated nothing reads it; the admin screen now reads
                   it as the service role                        — revoked
     service_role  /admin/front-door                             — already has it
   Revoking authenticated without moving the admin screen first would have left
   the one screen that exists to show an admin what a visitor sees unable to
   read it. */
revoke all on front_door_film from authenticated;
grant select on front_door_film to anon;

-- ---- 7. comments that describe what is actually there ---------------------
comment on table front_door_slot is
  'The TWO films on the signed-out front door — a mindset and the lesson it '
  'builds toward — each with its PUBLIC Mux playback id and its caption. '
  'Curated by hand in migrations: a shop window, not a feed. RLS on with no '
  'policy and no grant to anon or authenticated, so only a migration (or the '
  'service role) changes it. Exactly two public playback ids exist in the Mux '
  'account; adding a slot means minting one, which is a decision, not a row.';

comment on view front_door_film is
  'Destination for the signed-out front door. Exactly two curated rows, '
  'published and unretired. Returns content_id, title, duration_sec, '
  'public_playback_id, slot and caption — plus sort, which is what the page '
  'orders by, so it is seven columns and not the six the comment on 0157 '
  'claimed. Definer (security_invoker off) so anon reads it with no grant on '
  'content. Granted to anon only; the admin screen reads it as service_role.';

-- ---- 8. assert the shape, do not assume the statements above ran ----------
/* A summary is not an observation. Each of these reads back the table and
   raises rather than reporting what this file intended. */
do $$
declare
  n_slots int;
  n_null int;
  n_expected int;
  v_rows int;
begin
  /* THE SKIP PATH, added 5 Oct 2026 with the insert guard above. A database
     holding neither film is a fresh local, not a broken front door — and the
     assertions below are about the PAIRING, which cannot be tested where
     neither half exists. Everything structural in this migration (the slot
     constraint, NOT NULL, RLS, the grants) has already run and is not skipped.

     Stated as "neither film present" rather than "no slots", so a database that
     has one of the two still fails loudly instead of skipping. */
  if not exists (
    select 1 from content
     where id in ('ee3148e1-5659-4f57-9ad8-f1b73e7c18aa',
                  '42aadd23-5e6f-4fcf-b4b5-c2d8d4f85d05')
  ) then
    raise notice
      '0158: neither front-door film exists on this database — pairing assertions skipped; constraint, NOT NULL, RLS and grants all applied';
    return;
  end if;

  select count(*) into n_slots from front_door_slot;
  if n_slots <> 2 then
    raise exception '0158: front_door_slot holds % rows, expected exactly 2', n_slots;
  end if;

  select count(*) into n_null from front_door_slot where public_playback_id is null;
  if n_null <> 0 then
    raise exception '0158: % slot(s) have no public playback id', n_null;
  end if;

  /* The pairing itself, both halves — the slot, the film and the id together.
     An exclusion by value is only as strong as the values actually present. */
  select count(*) into n_expected
    from front_door_slot
   where (slot, content_id::text, public_playback_id) in (
     ('mindset', 'ee3148e1-5659-4f57-9ad8-f1b73e7c18aa',
      'XWT1R1T6nP00hwQbRsfibS7KPQ6wt3iGrTler7KsCjjw'),
     ('item', '42aadd23-5e6f-4fcf-b4b5-c2d8d4f85d05',
      '5Qn021M01ITgHm023WIq00ccx8dRwSQFAyrKrG7eXX00EO3U'));
  if n_expected <> 2 then
    raise exception '0158: % of 2 slots carry the ruled film and public id', n_expected;
  end if;

  /* And the half that is easy to forget: the view must actually SERVE both.
     A row whose film is unpublished or retired is filtered out by the view, so
     the table can be right while the front door is empty. */
  select count(*) into v_rows from front_door_film;
  if v_rows <> 2 then
    raise exception
      '0158: front_door_film returns % rows, expected 2 — a slot''s film is unpublished or retired',
      v_rows;
  end if;

  raise notice '0158: 2 slots, 2 rows served, both public ids present and correct';
end $$;

-- PostgREST caches the schema; the grant change needs it reloaded.
notify pgrst, 'reload schema';
