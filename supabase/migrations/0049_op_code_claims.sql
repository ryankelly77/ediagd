-- ============================================================================
-- EDIAGD — 0049 An operator id belongs to one person
--
-- membership.op_code_id is the join from a person to their performance. Nothing
-- has ever enforced that two people cannot claim the same one, and the app has
-- been running with a live example: the platform owner's advisor membership
-- carries 35122, which is David Esparza's operator id at Doggett CDJR. It was
-- harmless while Esparza had no account. He is expected to have one shortly.
--
-- WHAT A COLLISION DOES. advisor_period_totals, advisor_family_attach, Eddie's
-- Pick and every trend key on advisor_op_id alone, so two claimants both see
-- the SAME book as their own — and the manager roster builds a name map keyed
-- by op code, so one person's name silently overwrites the other's. Nothing
-- errors. Two people are simply told the same numbers are theirs.
--
-- Three things here:
--
--   1. A partial unique index makes the collision impossible.
--   2. advisor_op_code_claims shows who holds what, and what is unclaimed.
--   3. claim_advisor_op_code() hands an id over atomically — because doing it
--      by hand is a DELETE and an INSERT, and the gap between them is exactly
--      where somebody creates the duplicate this migration exists to prevent.
--
-- Verified before writing: 541 active op-coded memberships across the network,
-- zero collisions, so the index applies cleanly.
-- ============================================================================


-- ---- 1. The guard -----------------------------------------------------------
/**
 * One active claimant per (rooftop, operator id).
 *
 * PARTIAL, on two counts. `op_code_id is not null` because managers and admins
 * legitimately hold memberships with no operator id and would otherwise all
 * collide on null. `active` because a departed advisor's row is history — when
 * somebody inherits their operator id, the old membership is deactivated rather
 * than deleted, and history must not block the handover.
 */
create unique index if not exists membership_op_code_one_claimant
  on membership (rooftop_id, op_code_id)
  where op_code_id is not null and active;

comment on index membership_op_code_one_claimant is
  'An operator id identifies one advisor at one store. Two active claimants '
  'would both be shown the same book as their own, silently.';


-- ---- 2. Who holds what ------------------------------------------------------
/**
 * Every operator id the DMS has seen at a rooftop, and who — if anyone — holds
 * it in the app.
 *
 * The point is the unclaimed rows: an advisor with months of performance and no
 * account is invisible to every screen that starts from a login, and there has
 * been no way to see that list.
 */
create or replace view advisor_op_code_claims as
select
  a.rooftop_id,
  r.name                       as rooftop_name,
  a.advisor_op_id,
  a.display_name               as roster_name,
  a.first_seen,
  a.last_seen,
  m.user_id                    as claimed_by,
  u.full_name                  as claimed_by_name,
  case
    when m.user_id is null then 'unclaimed'
    -- The roster writes "Last, First (op)"; a rough match is enough to flag
    -- "this id is held by somebody who is not the person the DMS names".
    when position(lower(split_part(u.full_name, ' ', 2)) in lower(a.display_name)) = 0
      then 'mismatched'
    else 'claimed'
  end                          as status
from dms_advisor a
join rooftop r on r.id = a.rooftop_id
left join membership m
  on m.rooftop_id = a.rooftop_id
 and m.op_code_id = a.advisor_op_id
 and m.active
left join app_user u on u.id = m.user_id;

alter view advisor_op_code_claims set (security_invoker = on);
grant select on advisor_op_code_claims to authenticated;


-- ---- 3. Handing one over ----------------------------------------------------
/**
 * Give an operator id to a user, taking it off whoever holds it.
 *
 * ONE TRANSACTION, so the id is never held by nobody and never by two people.
 * Doing this by hand means clearing one membership and setting another, and an
 * interruption between them either strands the advisor's history or trips the
 * unique index halfway.
 *
 * The previous holder keeps their membership and simply loses the operator id —
 * they are still a manager, or an admin, or an advisor awaiting their own id.
 * Nothing is deleted, because deleting a membership takes its activity with it.
 */
create or replace function claim_advisor_op_code(
  _user_id    uuid,
  _rooftop_id uuid,
  _op_code    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _released uuid;
  _known    boolean;
  _updated  int := 0;
begin
  if not (
    is_platform_owner()
    or _rooftop_id in (select admin_rooftops())
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'claim_advisor_op_code: admin of that rooftop only';
  end if;

  -- Refuse an operator id the DMS has never reported at this store. A typo here
  -- attaches somebody to a book that will never arrive, and looks like working
  -- software until the month ends.
  select exists (
    select 1 from dms_advisor
     where rooftop_id = _rooftop_id and advisor_op_id = _op_code
  ) into _known;
  if not _known then
    raise exception
      'claim_advisor_op_code: % is not an operator id seen at this rooftop', _op_code;
  end if;

  -- Take it off the current holder, if that is somebody else.
  update membership
     set op_code_id = null
   where rooftop_id = _rooftop_id
     and op_code_id = _op_code
     and active
     and user_id <> _user_id
  returning user_id into _released;

  -- Give it to the target's advisor membership, creating one if they have none.
  update membership
     set op_code_id = _op_code
   where user_id = _user_id
     and rooftop_id = _rooftop_id
     and role = 'advisor'
     and active;
  get diagnostics _updated = row_count;

  if _updated = 0 then
    insert into membership (user_id, rooftop_id, role, op_code_id, active)
    values (_user_id, _rooftop_id, 'advisor', _op_code, true);
    _updated := 1;
  end if;

  return jsonb_build_object(
    'op_code', _op_code,
    'claimed_by', _user_id,
    'released_from', _released,
    'memberships_written', _updated
  );
end $$;

revoke all on function claim_advisor_op_code(uuid, uuid, text) from public, anon;
grant execute on function claim_advisor_op_code(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
