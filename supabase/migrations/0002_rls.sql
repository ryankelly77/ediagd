-- ============================================================================
-- EDIAGD — Row Level Security
-- Two ideas do all the work:
--   1. tenant isolation — you only see rooftops you're a member of
--   2. entitlement gate — you only see add-on content if (a) your role consumes
--      it AND (b) your rooftop owns the product that unlocks it
-- ============================================================================

alter table org               enable row level security;
alter table rooftop           enable row level security;
alter table app_user          enable row level security;
alter table membership        enable row level security;
alter table rooftop_product   enable row level security;
alter table content_item      enable row level security;
alter table content_progress  enable row level security;

-- ---- Helpers ---------------------------------------------------------------
-- Rooftops the current user belongs to (active memberships).
create or replace function my_rooftops()
returns setof uuid language sql stable security definer set search_path = public as $$
  select rooftop_id from membership
  where user_id = auth.uid() and active
$$;

-- Does the current user hold a given role at a given rooftop?
create or replace function has_role(_rooftop uuid, _role member_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership
    where user_id = auth.uid() and active
      and rooftop_id = _rooftop and role = _role
  )
$$;

-- Is a product active for a rooftop?
create or replace function rooftop_has_product(_rooftop uuid, _product product_key)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rooftop_product
    where rooftop_id = _rooftop and product = _product and status in ('active','trialing')
  )
$$;

-- ---- Tenancy read policies -------------------------------------------------
create policy rooftop_read on rooftop
  for select using (id in (select my_rooftops()));

create policy org_read on org
  for select using (id in (select org_id from rooftop where id in (select my_rooftops())));

create policy membership_read on membership
  for select using (
    user_id = auth.uid()                                   -- my own memberships
    or has_role(rooftop_id, 'manager')                     -- managers see their team
    or has_role(rooftop_id, 'admin')
  );

create policy app_user_self on app_user
  for select using (id = auth.uid());
create policy app_user_upsert on app_user
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy rooftop_product_read on rooftop_product
  for select using (rooftop_id in (select my_rooftops()));

-- ---- The entitlement gate on content --------------------------------------
-- A published item is visible when the viewer's rooftop owns the product that
-- unlocks the item's library AND the viewer holds the role that product serves.
create policy content_entitled_read on content_item
  for select using (
    published
    and exists (
      select 1
      from membership m
      join product_catalog pc
        on pc.product = product_for_library(content_item.library)
      where m.user_id = auth.uid()
        and m.active
        and m.role = pc.serves_role
        and rooftop_has_product(m.rooftop_id, pc.product)
    )
  );

-- ---- Progress: you write your own; managers/admins can read their rooftop --
create policy progress_self_write on content_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy progress_team_read on content_progress
  for select using (
    user_id = auth.uid()
    or has_role(rooftop_id, 'manager')
    or has_role(rooftop_id, 'admin')
  );

-- op_code and product_catalog are non-sensitive reference data.
alter table op_code enable row level security;
create policy op_code_read on op_code for select using (true);
alter table product_catalog enable row level security;
create policy catalog_read on product_catalog for select using (true);

-- ============================================================================
-- Writes (content authoring, provisioning rooftops/products, enrolling members)
-- run through the service role from the server / admin app, which bypasses RLS.
-- Keep the anon/auth client on reads + own-progress writes only.
-- ============================================================================
