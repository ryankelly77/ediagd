/* ===========================================================================
   0148 — DOGGETT FORD OF BEAUMONT GOES FIRST: advisor_base, NOTHING ELSE
   ===========================================================================

   The staggered launch's first store. Rooftop 84bef302 (Doggett Ford of
   Beaumont, org Doggett Automotive Group, America/Chicago) had no
   rooftop_product row of any kind — every content read for its advisors
   would come back empty and the gate would fail closed.

   ONLY advisor_base:
     manager_meetings   the managers' own track, not filmed yet — granting it
                        now would only surface an empty tile to Patterson
                        and Reck
     joe_the_pro        an add-on nobody has bought

   The product model: managers and advisors share the nine core tracks;
   managers additionally get Manager Meetings when it exists.

   F2 NOTE — provisioning and mapping are ONE act. This grant alone changes
   nothing anybody sees: the rooftop has no memberships, and Ryan's runbook
   creates each one against the roster he confirmed on 30 September (the F4
   baseline). The entitlement lands first only because membership rows need
   auth users, and provisioning scripts never mint users.

   On a fresh local the rooftop does not exist and this is a quiet no-op.
   =========================================================================== */

do $$
declare
  _rooftop constant uuid := '84bef302-ebd2-4536-ba9f-693c535f10d4';
  _name text;
begin
  select name into _name from rooftop where id = _rooftop;
  if _name is null then
    raise notice '0148: rooftop % not on this database — nothing to do', _rooftop;
    return;
  end if;
  if _name <> 'Doggett Ford of Beaumont' then
    raise exception
      '0148: rooftop % is named "%" — not the store this migration is about; refusing',
      _rooftop, _name;
  end if;

  insert into rooftop_product (rooftop_id, product, status)
  values (_rooftop, 'advisor_base', 'active')
  on conflict (rooftop_id, product) do update set status = 'active';

  /* THE ROW EXISTS AFTER, asserted from the table rather than from intent. */
  if not exists (
    select 1 from rooftop_product
     where rooftop_id = _rooftop and product = 'advisor_base' and status = 'active'
  ) then
    raise exception '0148: advisor_base row missing after the grant';
  end if;

  /* And nothing else was granted. */
  if exists (
    select 1 from rooftop_product
     where rooftop_id = _rooftop and product <> 'advisor_base'
  ) then
    raise exception '0148: a product other than advisor_base exists at Beaumont Ford — not this migration''s doing, refusing to mask it';
  end if;

  raise notice '0148: Doggett Ford of Beaumont holds advisor_base and nothing else';
end
$$;
