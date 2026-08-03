-- ============================================================================
-- EDIAGD — Stage 2A foundation schema
-- Multi-tenant (org -> rooftop -> member), role-based, product-entitlement gated.
-- Designed around: base Advisor product + flat-per-rooftop add-ons
-- (Manager Meetings, Joe the Pro), where Joe the Pro introduces a real
-- technician role with its own logins.
--
-- The whole app leans on ONE access rule:  role  x  rooftop owns product.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---- Enums -----------------------------------------------------------------
-- Roles a person can hold at a rooftop. `technician` is first-class (Joe the Pro).
create type member_role as enum ('advisor','manager','technician','admin');

-- Products a rooftop can subscribe to. Base is always present; the rest are add-ons.
create type product_key as enum ('advisor_base','manager_meetings','joe_the_pro');

-- Which content library a piece of content belongs to.
create type library_key as enum (
  'coaching_cues',        -- one-liners at top of advisor profile
  'op_code_videos',       -- service-specific selling videos (base)
  'general_sales',        -- lifestyle / craft coaching (base)
  'stats',                -- daily stat library (base)
  'manager_meetings',     -- add-on: manager-only
  'joe_the_pro'           -- add-on: technician library
);

-- ---- Tenancy ---------------------------------------------------------------
create table org (              -- a dealer group (or a single-store owner)
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table rooftop (          -- an individual dealership location = the billing unit
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  name        text not null,
  dms_kind    text,             -- e.g. 'cdk','reynolds','tekion' (fee-free ingestion first)
  created_at  timestamptz not null default now()
);
create index on rooftop(org_id);

-- A person. Mirrors auth.users (Supabase Auth owns credentials).
create table app_user (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Membership = a person's role AT a rooftop. One person can hold several
-- (e.g. a manager who also advises), and can belong to multiple rooftops.
create table membership (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  rooftop_id  uuid not null references rooftop(id) on delete cascade,
  role        member_role not null,
  op_code_id  text,             -- advisor/tech's DMS operator id, for data mapping
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, rooftop_id, role)
);
create index on membership(rooftop_id);
create index on membership(user_id);

-- ---- Entitlements ----------------------------------------------------------
-- What each rooftop is subscribed to. Flat per-rooftop; presence of a row = access.
create table rooftop_product (
  rooftop_id  uuid not null references rooftop(id) on delete cascade,
  product     product_key not null,
  status      text not null default 'active',   -- active | trialing | paused | canceled
  started_at  timestamptz not null default now(),
  primary key (rooftop_id, product)
);

-- Which role a product serves, and who is allowed to purchase it.
-- Static reference data — seeded below.
create table product_catalog (
  product        product_key primary key,
  display_name   text not null,
  serves_role    member_role not null,   -- who consumes it
  purchasable_by member_role not null,   -- who can switch it on
  is_addon       boolean not null
);

insert into product_catalog (product, display_name, serves_role, purchasable_by, is_addon) values
  ('advisor_base',     'Advisor Coaching',  'advisor',    'admin',   false),
  ('manager_meetings', 'Manager Meetings',  'manager',    'manager', true),
  ('joe_the_pro',      'Joe the Pro',       'technician', 'admin',   true);
-- note: 'admin' here = dealer/GM-level buyer; managers may self-serve Manager Meetings.

-- ---- Content ---------------------------------------------------------------
-- Op codes (service families) a rooftop actually runs, mapped from DMS ingestion.
create table op_code (
  id          text primary key,          -- e.g. '35122'
  family      text not null,             -- e.g. 'Brake Service'
  description text
);

-- The content libraries. Every asset knows which library (and thus which
-- product) gates it, and optionally which op code / make / model it targets.
create table content_item (
  id            uuid primary key default gen_random_uuid(),
  library       library_key not null,
  title         text not null,
  video_url     text,                    -- signed-playback source (Stage 2A pipeline)
  duration_sec  int,
  op_code_id    text references op_code(id),
  make          text,
  model         text,
  body          text,                    -- for coaching_cues / stats text
  published     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on content_item(library);
create index on content_item(op_code_id);

-- Per-person consumption — drives streaks, gamification, and the admin
-- engagement score (55% login-rate + 45% watch-rate).
create table content_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id) on delete cascade,
  rooftop_id    uuid not null references rooftop(id) on delete cascade,
  content_id    uuid not null references content_item(id) on delete cascade,
  watched_pct   int not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, content_id)
);
create index on content_progress(user_id);
create index on content_progress(rooftop_id);

-- Maps a library to the product that unlocks it (base libraries have no add-on).
create or replace function product_for_library(lib library_key)
returns product_key language sql immutable as $$
  select case lib
    when 'manager_meetings' then 'manager_meetings'::product_key
    when 'joe_the_pro'      then 'joe_the_pro'::product_key
    else 'advisor_base'::product_key
  end
$$;
