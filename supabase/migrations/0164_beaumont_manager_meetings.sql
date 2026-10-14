/* ===========================================================================
   0164 — MANAGER MEETINGS FOR DOGGETT FORD OF BEAUMONT
   ===========================================================================

   Ryan, 12 October: "turn manager_meetings on for Doggett Ford of Beaumont so
   Patterson and Reck see it once the series is published."

   ---------------------------------------------------------------------------
   THIS REVERSES 0148, ON PURPOSE, AND THE REASON IT GAVE IS WHY
   ---------------------------------------------------------------------------
   0148 granted advisor_base and deliberately withheld this one:

       manager_meetings   the managers' own track, not filmed yet — granting it
                          now would only surface an empty tile to Patterson
                          and Reck

   That was correct on the day it was written and it is a fact about the
   CATALOGUE, not about the store. The catalogue changed: Mitch delivered the
   Manager Bank Account series — seventeen films, an introduction, eight
   deposits, seven withdrawals and an outro — and they are ingested as
   `manager_video` in the same change as this migration.

   ---------------------------------------------------------------------------
   THE EMPTY TILE IS REAL, AND IT IS A WINDOW RATHER THAN A STATE
   ---------------------------------------------------------------------------
   The ingest lands films as DRAFT; publishing is Ryan and Mitch's step in
   admin and never the pipeline's. So between this migration and that step,
   Patterson and Reck can open Manager Meetings and find nothing in it — the
   exact thing 0148 was avoiding.

   Said out loud rather than discovered: Ryan ruled with that window in view
   ("so Patterson and Reck see it ONCE THE SERIES IS PUBLISHED"), and the
   screen degrades honestly — /meetings renders its coming-soon state rather
   than an error or a blank. The alternative, gating this migration on a
   published film, would make an entitlement depend on content and put the
   grant somewhere nobody would look for it.

   ---------------------------------------------------------------------------
   WHAT THIS DOES NOT DO
   ---------------------------------------------------------------------------
   It grants no other product and no other rooftop. `joe_the_pro` stays
   unbought. The ten other Doggett rooftops are not touched — the staggered
   launch is one store at a time, and a grant that quietly spread to the group
   would be a decision nobody took.

   It also writes no memberships. Patterson and Reck reach this through their
   MANAGER membership, which `provision:roster` writes from the confirmed
   roster; checkEntitlement(['manager'], 'manager_meetings') needs both, and
   this migration supplies exactly one of them.

   On a fresh local the rooftop does not exist and this is a quiet no-op.
   =========================================================================== */

do $$
declare
  _rooftop constant uuid := '84bef302-ebd2-4536-ba9f-693c535f10d4';
  _name text;
  _others int;
begin
  select name into _name from rooftop where id = _rooftop;
  if _name is null then
    raise notice '0164: rooftop % not on this database — nothing to do', _rooftop;
    return;
  end if;
  /* The same refusal 0148 carries: an id that resolves to another store is a
     grant to the wrong dealer, and a name check is the only thing standing
     between a typo'd uuid and that. */
  if _name <> 'Doggett Ford of Beaumont' then
    raise exception
      '0164: rooftop % is named "%" — not the store this migration is about; refusing',
      _rooftop, _name;
  end if;

  insert into rooftop_product (rooftop_id, product, status)
  values (_rooftop, 'manager_meetings', 'active')
  on conflict (rooftop_id, product) do update set status = 'active';

  /* ASSERTED FROM THE TABLE, not from the fact that the insert did not throw. */
  if not exists (
    select 1 from rooftop_product
     where rooftop_id = _rooftop and product = 'manager_meetings' and status = 'active'
  ) then
    raise exception '0164: manager_meetings row missing after the grant';
  end if;

  /* advisor_base must still be there. This migration adds a product; it must
     not have replaced one, and `on conflict do update` on the wrong key is how
     that would happen silently. */
  if not exists (
    select 1 from rooftop_product
     where rooftop_id = _rooftop and product = 'advisor_base' and status = 'active'
  ) then
    raise exception '0164: advisor_base is no longer active at Beaumont — this migration should have added, not replaced';
  end if;

  /* And nothing beyond the two. 0148 made this assertion about one product;
     the same assertion about two is what keeps the next grant deliberate. */
  select count(*) into _others
    from rooftop_product
   where rooftop_id = _rooftop
     and product not in ('advisor_base', 'manager_meetings');
  if _others > 0 then
    raise exception
      '0164: % other product(s) exist at Beaumont Ford — not this migration''s doing, refusing to mask it',
      _others;
  end if;

  /* No other rooftop gained it in this change. */
  if exists (
    select 1 from rooftop_product
     where product = 'manager_meetings' and rooftop_id <> _rooftop
       and rooftop_id in (select id from rooftop where org_id = (select org_id from rooftop where id = _rooftop))
  ) then
    raise notice '0164: another Doggett rooftop already holds manager_meetings — not granted here, and not removed';
  end if;

  raise notice '0164: Doggett Ford of Beaumont holds advisor_base and manager_meetings';
end
$$;
