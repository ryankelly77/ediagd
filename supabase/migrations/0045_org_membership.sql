-- ============================================================================
-- EDIAGD — 0045 A level above the rooftop
--
-- Every scoping helper in the app keys on membership.rooftop_id, so authority
-- has only ever existed one store at a time. Doggett Automotive Group has
-- eleven, and their group principal would hold eleven memberships to see them —
-- or, today, one membership and a view of one store.
--
-- The only reason this has not bitten yet is that the single admin account in
-- the system also carries is_platform_owner, which short-circuits
-- admin_rooftops() to "every rooftop that exists". That flag means "runs
-- EDIAGD", not "owns this dealer group", and using it to stand in for a group
-- owner would give every future dealer principal the keys to every other
-- dealer's numbers.
--
-- ---------------------------------------------------------------------------
-- WHY A SEPARATE TABLE AND NOT A ROLE ON membership
-- ---------------------------------------------------------------------------
-- membership.rooftop_id is NOT NULL and its primary key includes it, so a
-- group-level row would have to invent a rooftop to point at. Worse, every
-- existing policy reads membership expecting a store — a row that meant "all
-- stores" would be silently ignored by all of them, which is the most dangerous
-- kind of permission bug: the one that grants nothing while looking granted.
--
-- org_membership is a separate grant, and the three helper functions UNION it
-- in. A policy that has not been taught about org membership keeps working
-- exactly as before rather than half-working.
-- ============================================================================


-- ---- 1. What somebody can be at group level ---------------------------------
/**
 * group_owner   — the dealer principal. Everything an admin can do, at every
 *                 rooftop in the group.
 * group_manager — runs several stores but does not administer the account.
 *                 Sees teams and performance across the group; no settings.
 *
 * Deliberately NOT a mirror of member_role: 'advisor' and 'technician' have no
 * group-level meaning, and offering them would invite somebody to grant one.
 */
do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type org_role as enum ('group_owner', 'group_manager');
  end if;
end $$;

create table if not exists org_membership (
  user_id    uuid not null references app_user(id) on delete cascade,
  org_id     uuid not null references org(id) on delete cascade,
  role       org_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index if not exists org_membership_org_idx on org_membership (org_id, active);

alter table org_membership enable row level security;

-- A person may see their own group grants; platform owners see all. No write
-- policy: granting group authority is an owner-level act, done by the service
-- role, never by a client.
drop policy if exists org_membership_read on org_membership;
create policy org_membership_read on org_membership
  for select using (
    user_id = (select auth.uid()) or (select is_platform_owner())
  );


-- ---- 2. The rooftops a group grant covers -----------------------------------
/**
 * Every rooftop in every org where the caller holds an active group role of one
 * of the given kinds.
 *
 * SECURITY DEFINER and stable, matching the other helpers, so it can be used
 * inside a policy without recursing through RLS on org_membership.
 */
create or replace function org_rooftops(_roles org_role[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
    from org_membership om
    join rooftop r on r.org_id = om.org_id
   where om.user_id = auth.uid()
     and om.active
     and om.role = any(_roles)
$$;

grant execute on function org_rooftops(org_role[]) to authenticated;


-- ---- 3. Teach the three existing helpers about it ---------------------------
-- Each keeps its original clause verbatim and UNIONs the group grant on. A
-- group owner gains exactly what a per-rooftop admin at each store would have
-- had, and nothing else changes for anybody who has no org membership.

create or replace function my_rooftops()
returns setof uuid language sql stable security definer set search_path = public as $$
  select rooftop_id from membership
   where user_id = auth.uid() and active
  union
  select org_rooftops(array['group_owner','group_manager']::org_role[])
$$;

create or replace function managed_rooftops()
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.rooftop_id
    from membership m
   where m.user_id = auth.uid()
     and m.active
     and m.role in ('manager', 'admin')
  union
  select org_rooftops(array['group_owner','group_manager']::org_role[])
$$;

/**
 * Admin scope. group_manager is deliberately ABSENT: running several stores is
 * not the same as administering the account, and the admin surfaces carry
 * pricing, gamification settings and the DMS importer.
 */
create or replace function admin_rooftops()
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.id from rooftop r where is_platform_owner()
  union
  select m.rooftop_id
    from membership m
   where m.user_id = auth.uid() and m.active and m.role = 'admin'
  union
  select org_rooftops(array['group_owner']::org_role[])
$$;

grant execute on function my_rooftops() to authenticated;
grant execute on function managed_rooftops() to authenticated;
grant execute on function admin_rooftops() to authenticated;


-- ---- 4. Give the Doggett group its owner ------------------------------------
-- The one existing admin account becomes group_owner of the group it already
-- administers a single store of. Idempotent.

insert into org_membership (user_id, org_id, role)
select m.user_id, r.org_id, 'group_owner'::org_role
  from membership m
  join rooftop r on r.id = m.rooftop_id
  join org o on o.id = r.org_id
 where m.role = 'admin'
   and m.active
   and o.name = 'Doggett Automotive Group'
on conflict (user_id, org_id) do nothing;

notify pgrst, 'reload schema';
