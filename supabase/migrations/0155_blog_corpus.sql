/* ===========================================================================
   0155 — the blog corpus: a read-only window for the site's post engine
   ===========================================================================

   The marketing site is getting a daily post engine that writes in Mitch's
   voice from EDIAGD's own material. Two rules shape this window:

     1. It must never invent a fact, so it reads the real cues, quotes and film
        transcripts — nothing summarised, nothing derived.
     2. It must never hold the service role key, so it reads through a Postgres
        role that can see four views and NOTHING else.

   ---------------------------------------------------------------------------
   WHY THE VIEWS ARE SECURITY DEFINER (security_invoker = OFF, the default)
   ---------------------------------------------------------------------------
   The whole boundary rests on this. A view created here is owned by the
   migration role (postgres) and, left at the default security_invoker = off,
   runs with the OWNER's privileges. So `blog_reader` can be granted SELECT on
   the four views and NOTHING on any base table: the view reaches content on the
   owner's behalf, the role never can. Flip these to security_invoker = on and
   the boundary inverts — the role would then need SELECT on content, quote,
   module and the rest, which is exactly what this window exists to deny. Do not
   add security_invoker = on to these four.

   Each view's WHERE clause is the only thing that lets a row out: published,
   not retired, and content only. No advisor, rooftop, membership, book or DMS
   number is reachable through any of them.

   ---------------------------------------------------------------------------
   content_transcript IS A SEPARATE TABLE, NOT A COLUMN ON content
   ---------------------------------------------------------------------------
   A transcript is large text wanted by one consumer (this corpus and the
   caption backfill). content is read on hot paths that select explicit columns,
   but it is also read with select * in admin and tooling, and a multi-kilobyte
   transcript on every content row would ride along every one of those reads for
   no reason. A 1:1 side table keeps content narrow and isolates the backfill's
   writes. The films view LEFT JOINs it, so a film with no transcript yet simply
   reads null — which is most of them until the October captions job runs.
   ========================================================================== */

-- ---- 1. transcripts, kept out of content ---------------------------------
create table if not exists content_transcript (
  content_id uuid primary key references content(id) on delete cascade,
  transcript text not null,
  /* where the text came from, so a re-run can prefer a better source and a
     reader can weigh a machine caption against a Whisper pass. */
  source text not null check (source in ('whisper', 'mux_caption')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table content_transcript is
  'Film transcript text, 1:1 with content, kept off content so a large column '
  'does not ride every select *. Written by scripts/transcripts-backfill.ts '
  '(service role); read by the blog_corpus_films view (definer).';

/* Locked by default: RLS on, no policy. The service role (backfill) bypasses
   RLS to write, and the definer view reads it as owner. No app role — advisor,
   manager, admin or blog_reader — touches this table directly. */
alter table content_transcript enable row level security;

-- ---- 2. the four views ----------------------------------------------------
-- All content-only, all published-and-unretired, all definer (see header).

create or replace view blog_corpus_cues as
  select c.id, c.title, c.body, c.service_family, c.subcategory,
         c.best_used_for, c.tier
    from content c
   where c.type = 'cue'
     and c.status = 'published'
     and c.retired_at is null;

comment on view blog_corpus_cues is
  'Published, unretired cues. Population: type=cue, status=published, '
  'retired_at is null.';

create or replace view blog_corpus_quotes as
  select c.id, c.body, c.voice, c.quote_key
    from content c
   where c.type = 'quote'
     and c.status = 'published'
     and c.retired_at is null;

comment on view blog_corpus_quotes is
  'Published, unretired quotes. Population: type=quote, status=published, '
  'retired_at is null.';

/* Films, with their place in the curriculum where they have one. The module
   chain is LEFT JOINed on purpose: a film parked in the skill library has no
   module_id, and it still belongs in the corpus — it comes through with a null
   track/module and its library_reason, so the engine can prefer attached films
   and still reach the parked ones. transcript is the film's text where one
   exists and null otherwise. Each course belongs to exactly one certification
   (verified), so the join does not multiply rows. */
create or replace view blog_corpus_films as
  select c.id,
         c.title,
         c.collection,
         ct.name       as track,
         m.name        as module,
         m.sort_order  as module_position,
         c.duration_sec,
         t.transcript,
         c.library_reason
    from content c
    left join module m              on m.id = c.module_id
    left join course co             on co.id = m.course_id
    left join certification_course cc on cc.course_id = co.id
    left join certification ct       on ct.id = cc.certification_id
    left join content_transcript t   on t.content_id = c.id
   where c.type = 'advisor_video'
     and c.status = 'published'
     and c.retired_at is null;

comment on view blog_corpus_films is
  'Published, unretired advisor_video films, LEFT JOINed through module and '
  'course to the certification for track/module names. Parked films (library_'
  'reason set, no module) are included. transcript is null until backfilled.';

/* The curriculum spine, in two shapes under one view, told apart by `kind`:
     - kind=certification: the nine core certifications, one row per module, in
       module order (item/item_position), cue_count null.
     - kind=service_family: each service family that actually has published
       cues, with that count (item/item_position null).
   Families with zero published cues are excluded deliberately: the post engine
   writes FROM cues, and a family with none is a heading it could only invent
   under. See the report for the count — it is not twelve. */
create or replace view blog_corpus_tracks as
  select 'certification'::text as kind,
         ct.name              as name,
         ct.sort              as sort,
         m.name               as item,
         m.sort_order         as item_position,
         null::bigint         as cue_count
    from certification ct
    join certification_course cc on cc.certification_id = ct.id
    join course co               on co.id = cc.course_id
    join module m                on m.course_id = co.id
   where ct.is_core and ct.active
  union all
  select 'service_family'::text,
         sf.name,
         sf.sort_order,
         null::text,
         null::integer,
         cnt.published_cues::bigint
    from service_family sf
    join service_family_cue_count cnt on cnt.family = sf.name
   where cnt.published_cues > 0;

comment on view blog_corpus_tracks is
  'The curriculum spine: the nine core certifications with their modules in '
  'order (kind=certification), and the service families that have published '
  'cues with their counts (kind=service_family).';

-- ---- 3. the role: four views and nothing else -----------------------------
/*
 * blog_reader: login, NO inherit (so it can never pick up privileges from a
 * group), SELECT on the four views only, USAGE on public, a ten-second
 * statement timeout, and a pinned search_path. It is NOT given a password here
 * — a credential must never be committed. Ryan sets the password when he applies
 * this (see the report), and the site holds it as a GitHub secret.
 */
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'blog_reader') then
    create role blog_reader login noinherit;
  end if;
end
$$;

-- Idempotent re-assertion of every attribute, so a re-applied migration or a
-- role that pre-existed with different settings converges to this.
alter role blog_reader with login noinherit;
alter role blog_reader set statement_timeout = '10s';
alter role blog_reader set search_path = 'public';

grant usage on schema public to blog_reader;

/* Start from nothing: strip any base-table privilege this role might have
   picked up from a stray PUBLIC grant or a `grant ... on all tables` default,
   THEN grant exactly the four views. (REVOKE ON ALL TABLES covers views too, so
   the grant must come after it.) It ends with SELECT on the four views and
   USAGE on the schema — nothing else. */
revoke all on all tables in schema public from blog_reader;
grant select on
  blog_corpus_cues,
  blog_corpus_quotes,
  blog_corpus_films,
  blog_corpus_tracks
  to blog_reader;
