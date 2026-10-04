/* ===========================================================================
   0156 — a still for every film, for the site's post engine
   ===========================================================================

   The blog corpus (0155) gives the site's post engine the text of the library —
   cues, quotes, transcripts. This adds a still image per film, so a post can show
   the film it is written from.

   ---------------------------------------------------------------------------
   PUBLIC BUCKET, PERMANENT URL — BECAUSE A BLOG FRAME IS PUBLIC ALREADY
   ---------------------------------------------------------------------------
   The still frames live in a PUBLIC bucket (film-stills) and still_url is the
   permanent public object URL. The blog bakes these URLs into static pages and
   share cards, which cannot refresh a token, so the URL must not expire — and a
   frame on a public blog page is public the moment it is published anyway. The
   films themselves stay SIGNED and gated everywhere else; only a single frame per
   film is exposed, which is the point of a preview.
   ========================================================================== */

-- ---- the public bucket ----------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('film-stills', 'film-stills', true)
  on conflict (id) do update set public = true;

-- No storage.objects policy is added: the backfill writes with the service role
-- (which bypasses storage RLS), and a public bucket serves reads without one.

-- ---- the still, 1:1 with content ------------------------------------------
create table if not exists content_still (
  content_id uuid primary key references content(id) on delete cascade,
  /** The object path in film-stills, e.g. '<content_id>.jpg'. */
  object_path text not null,
  /** The PERMANENT public URL of that object. */
  still_url text not null,
  source text not null default 'mux_thumbnail',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table content_still is
  'A still frame per film (Mux thumbnail, a third of the way in) in the public '
  'film-stills bucket, with its permanent public URL. Written by '
  'scripts/stills-backfill.ts (service role); read by the blog_corpus_films view.';

-- Locked by default: RLS on, no policy. Service role writes; the definer view
-- reads as owner. No app role touches the table directly (the image itself is
-- public in the bucket; the row that points to it is not).
alter table content_still enable row level security;

-- ---- blog_corpus_films gains still_url ------------------------------------
-- Restated whole on 0155's definition (a view cannot be altered column-wise),
-- adding only the content_still LEFT JOIN and still_url. Everything else is
-- verbatim: published, unretired advisor_video, LEFT JOIN through the module
-- chain and the transcript, parked films included, each course -> one cert.
create or replace view blog_corpus_films as
  select c.id,
         c.title,
         c.collection,
         ct.name       as track,
         m.name        as module,
         m.sort_order  as module_position,
         c.duration_sec,
         t.transcript,
         c.library_reason,
         -- Appended last: CREATE OR REPLACE VIEW can only ADD columns at the end,
         -- so still_url follows 0155's final column.
         st.still_url
    from content c
    left join module m              on m.id = c.module_id
    left join course co             on co.id = m.course_id
    left join certification_course cc on cc.course_id = co.id
    left join certification ct       on ct.id = cc.certification_id
    left join content_transcript t   on t.content_id = c.id
    left join content_still st       on st.content_id = c.id
   where c.type = 'advisor_video'
     and c.status = 'published'
     and c.retired_at is null;

comment on view blog_corpus_films is
  'Published, unretired advisor_video films, LEFT JOIN through module and course '
  'to the certification for track/module names, plus the transcript and a public '
  'still_url. Parked films (library_reason set) are included. transcript and '
  'still_url are null until backfilled.';
