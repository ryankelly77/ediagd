-- 0148_site_lead.sql
--
-- REFERENCE COPY. This file lives in the ediagd-site repo so the site's
-- /api/lead function ships next to the schema it depends on. It is NOT applied
-- from here. Copy it into the app repo's supabase/migrations/ chain (it is the
-- same Supabase project) and apply it there, keeping the numbering.
--
-- Book a Call submissions from ediagd.ai. Written only by the marketing site's
-- serverless function, which holds the service role key. RLS is on and no
-- policy exists, so anon and authenticated can read nothing and write nothing;
-- the service role bypasses RLS by design and is the only way in.

create table if not exists public.site_lead (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  name         text not null,
  dealership   text not null,
  role         text not null,
  email        text not null,
  phone        text not null,
  note         text,

  -- Provenance. ip_hash is sha256(ip + LEAD_IP_SALT), never the raw address:
  -- enough to rate-limit a repeat submitter, not enough to be a stored
  -- identifier for anyone who turns up in this table.
  ip_hash      text,
  user_agent   text,
  source       text not null default 'ediagd.ai/#book',

  -- Sales workflow, so a lead can be worked without a second system.
  handled_at   timestamptz,
  handled_note text,

  constraint site_lead_email_shape check (position('@' in email) > 1),
  constraint site_lead_name_len       check (char_length(name)       between 1 and 120),
  constraint site_lead_dealership_len check (char_length(dealership) between 1 and 160),
  constraint site_lead_role_len       check (char_length(role)       between 1 and 80),
  constraint site_lead_email_len      check (char_length(email)      between 3 and 200),
  constraint site_lead_phone_len      check (char_length(phone)      between 1 and 40),
  constraint site_lead_note_len       check (note is null or char_length(note) <= 600)
);

comment on table public.site_lead is
  'Book a Call submissions from the ediagd.ai marketing site. Written only by the site''s /api/lead function via the service role key. No client role can read or write this table.';
comment on column public.site_lead.ip_hash is
  'sha256(client ip + LEAD_IP_SALT). Backs the per-IP rate limit without retaining the address itself.';

-- Newest-first is how this is always read.
create index if not exists site_lead_created_at_idx
  on public.site_lead (created_at desc);

-- Backs the rate-limit lookup in /api/lead: ip_hash = $1 and created_at >= $2.
create index if not exists site_lead_ip_hash_created_at_idx
  on public.site_lead (ip_hash, created_at desc);

-- Locked by default: RLS on, zero policies. Nothing reaches this table except
-- the service role, which bypasses RLS.
alter table public.site_lead enable row level security;
alter table public.site_lead force row level security;

-- PostgREST exposes whatever the anon/authenticated roles are granted, so pull
-- the grants too. RLS alone would already deny, but this keeps the table out of
-- the public API surface entirely rather than relying on a single mechanism.
revoke all on public.site_lead from anon, authenticated;

-- Future-proof: if the project's default privileges ever hand anon/authenticated
-- something on new tables, this table is already explicitly stripped above.
