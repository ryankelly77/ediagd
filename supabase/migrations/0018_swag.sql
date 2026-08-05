-- ============================================================================
-- EDIAGD — 0018 The Swag Shack
-- Catalog + redemption requests. No payments, no inventory, no shipping
-- integration: an advisor spends Sand Dollars, an admin sees a queue, a human
-- ships the thing.
--
-- "The gear can't be bought — only earned." Sand Dollars are the only currency,
-- and they come from showing up.
--
-- SPENDING IS SERVER-AUTHORITATIVE, exactly like earning (0012). There is NO
-- user INSERT policy on swag_redemption: the redemption action runs with the
-- service role, reads the price from this table, and checks the balance
-- server-side. A user-insert policy would let anyone POST a redemption row
-- straight to PostgREST and land in the fulfillment queue without a matching
-- ledger debit — a free order. Users may only READ their own rows.
-- ============================================================================

-- ---- Catalog ---------------------------------------------------------------
create table swag_item (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null unique,          -- stable slug
  name                text not null,
  description         text,
  price_sand_dollars  int  not null check (price_sand_dollars >= 0),
  variants            text,                          -- e.g. 'S,M,L,XL' or colourways
  image_url           text,                          -- /brand/swag/<key>.jpg
  sort_order          int  not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on swag_item(active, sort_order);

-- ---- Redemptions -----------------------------------------------------------
create type redemption_status as enum ('requested','fulfilled','cancelled');

create table swag_redemption (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id) on delete cascade,
  swag_item_id  uuid not null references swag_item(id),
  -- Snapshot: the catalog price can change later; what they paid cannot.
  price_paid    int  not null check (price_paid >= 0),
  variant       text,
  shipping_note text,
  status        redemption_status not null default 'requested',
  created_at    timestamptz not null default now(),
  fulfilled_at  timestamptz
);
create index on swag_redemption(user_id, created_at desc);
create index on swag_redemption(status, created_at desc);

-- ---- Buying a grace day ----------------------------------------------------
alter table game_settings
  add column if not exists sand_paddle_out_price int not null default 500;

-- ---- Seed the catalog ------------------------------------------------------
insert into swag_item (key, name, description, price_sand_dollars, variants, image_url, sort_order) values
  ('sticker_pack', 'Sticker Pack',              'The EDIAGD sunrise, for your toolbox and your water bottle.', 250,  null,             '/brand/swag/sticker_pack.jpg', 10),
  ('dad_cap',      'Dad Cap & Trucker',         'Low profile, embroidered mark. Pick your style.',             1000, 'Dad cap,Trucker', '/brand/swag/dad_cap.jpg',      20),
  ('team_tee',     'Team Tee',                  'Soft cotton, wordmark across the chest.',                     1500, 'S,M,L,XL,2XL',    '/brand/swag/team_tee.jpg',     30),
  ('water_bottle', 'Water Bottle & Travel Mug', 'Keeps coffee hot through the morning huddle.',                2000, 'Bottle,Mug',      '/brand/swag/water_bottle.jpg', 40),
  ('beach_tote',   'Beach Tote',                'Canvas tote, big enough for the whole weekend.',              2500, null,              '/brand/swag/beach_tote.jpg',   50),
  ('duffel_bag',   'Duffel Bag',                'Weekender with the sunrise on the side.',                     3000, null,              '/brand/swag/duffel_bag.jpg',   60),
  ('cooler_bag',   'Cooler Bag',                'Holds a day at the beach. The top of the board.',             4000, null,              '/brand/swag/cooler_bag.jpg',   70)
on conflict (key) do nothing;

-- ---- RLS -------------------------------------------------------------------
alter table swag_item       enable row level security;
alter table swag_redemption enable row level security;

-- Catalog: any signed-in user sees what's on the shelf.
create policy swag_item_read on swag_item
  for select using (auth.uid() is not null and active);

-- Admins and platform owners see everything, including retired items.
create policy swag_item_admin_read on swag_item
  for select using (
    exists (select 1 from membership m
            where m.user_id = auth.uid() and m.active and m.role = 'admin')
    or is_platform_owner()
  );

-- Catalog writes: admin / platform owner only.
create policy swag_item_admin_write on swag_item
  for all
  using (
    exists (select 1 from membership m
            where m.user_id = auth.uid() and m.active and m.role = 'admin')
    or is_platform_owner()
  )
  with check (
    exists (select 1 from membership m
            where m.user_id = auth.uid() and m.active and m.role = 'admin')
    or is_platform_owner()
  );

-- Redemptions: you may READ your own. No user INSERT/UPDATE/DELETE at all —
-- creating one spends currency, so it runs server-side with the service role,
-- and status/price_paid are therefore untouchable from the client by design.
create policy swag_redemption_self_read on swag_redemption
  for select using (user_id = auth.uid());

-- Admins and platform owners read the whole queue and mark items fulfilled.
create policy swag_redemption_admin_read on swag_redemption
  for select using (
    exists (select 1 from membership m
            where m.user_id = auth.uid() and m.active and m.role = 'admin')
    or is_platform_owner()
  );

create policy swag_redemption_admin_update on swag_redemption
  for update
  using (
    exists (select 1 from membership m
            where m.user_id = auth.uid() and m.active and m.role = 'admin')
    or is_platform_owner()
  )
  with check (
    exists (select 1 from membership m
            where m.user_id = auth.uid() and m.active and m.role = 'admin')
    or is_platform_owner()
  );

-- keep updated_at fresh on the catalog
create trigger swag_item_touch before update on swag_item
  for each row execute function touch_updated_at();
