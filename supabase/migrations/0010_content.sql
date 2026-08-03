-- ============================================================================
-- 0010_content.sql — unified GLOBAL content model
-- One table for every kind of coaching content: cues, advisor videos, manager
-- videos, Joe the Pro videos. Content is GLOBAL (authored once, not owned by a
-- rooftop). Access is gated by role x product; editing is admin-only.
--
-- Replaces the empty content_item table from 0001.
-- ============================================================================

-- ---- Retire the old placeholder table --------------------------------------
drop table if exists content_progress cascade;   -- fk'd to content_item; rebuilt below
drop table if exists content_item cascade;

-- ---- Enums -----------------------------------------------------------------
create type content_type as enum ('cue','advisor_video','manager_video','joe_the_pro');
create type content_tier as enum ('zero','low','generic');   -- cues; null for videos
create type content_status as enum ('draft','published');

-- ---- The one content table (global) ----------------------------------------
create table content (
  id             uuid primary key default gen_random_uuid(),
  type           content_type not null,
  service_family text,                      -- free text for now (e.g. 'Brake Service')
  subcategory    text,                      -- optional finer grouping under a service
  tier           content_tier,             -- cues use this; videos leave null
  -- vehicle axis (mostly Joe the Pro); all optional
  make           text,
  model          text,
  year_range     text,
  -- payload: cues use title/body; videos use video_url/duration
  title          text not null,
  body           text,
  video_url      text,
  duration_sec   int,
  -- lifecycle
  status         content_status not null default 'draft',
  source         text,                      -- provenance, e.g. 'Mitch import — Zero Tier'
  created_by     uuid references app_user(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on content(type);
create index on content(service_family);
create index on content(tier);
create index on content(status);
create index on content(make, model);

-- Which product entitles each content type (mirrors product_catalog).
create or replace function product_for_content_type(t content_type)
returns product_key language sql immutable as $$
  select case t
    when 'manager_video' then 'manager_meetings'::product_key
    when 'joe_the_pro'   then 'joe_the_pro'::product_key
    else 'advisor_base'::product_key           -- cue + advisor_video
  end
$$;

-- Which role consumes each content type.
create or replace function role_for_content_type(t content_type)
returns member_role language sql immutable as $$
  select case t
    when 'manager_video' then 'manager'::member_role
    when 'joe_the_pro'   then 'technician'::member_role
    else 'advisor'::member_role                -- cue + advisor_video
  end
$$;

-- ---- Rebuild content_progress against the new table ------------------------
create table content_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id) on delete cascade,
  rooftop_id    uuid not null references rooftop(id) on delete cascade,
  content_id    uuid not null references content(id) on delete cascade,
  watched_pct   int not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, content_id)
);
create index on content_progress(user_id);
create index on content_progress(rooftop_id);

-- ---- RLS -------------------------------------------------------------------
alter table content          enable row level security;
alter table content_progress enable row level security;

-- READ: any authenticated user may read a PUBLISHED item IF, at one of their
-- rooftops, they hold the role that consumes it AND that rooftop owns the
-- product that unlocks it. (Global content, entitlement-gated.)
create policy content_entitled_read on content
  for select using (
    status = 'published'
    and exists (
      select 1 from membership m
      where m.user_id = auth.uid()
        and m.active
        and m.role = role_for_content_type(content.type)
        and rooftop_has_product(m.rooftop_id, product_for_content_type(content.type))
    )
  );

-- WRITE: admins only. NOTE: "admin" here means admin at ANY rooftop. Global
-- content editing is really a PLATFORM power; tighten to a dedicated
-- platform/content-editor role later. (Tracked.)
create policy content_admin_all on content
  for all
  using (exists (select 1 from membership m
                 where m.user_id = auth.uid() and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = auth.uid() and m.active and m.role = 'admin'));

-- Progress: users write their own; managers/admins read their rooftop's.
create policy progress_self_write on content_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_team_read on content_progress
  for select using (
    user_id = auth.uid()
    or has_role(rooftop_id, 'manager')
    or has_role(rooftop_id, 'admin')
  );

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger content_touch before update on content
  for each row execute function touch_updated_at();
