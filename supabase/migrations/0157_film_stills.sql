/* ===========================================================================
   0157 — a still for every film, for the site's post engine
   ===========================================================================

   The blog corpus (0155) gives the site's post engine the text of the library —
   cues, quotes, transcripts. This adds a still image per film, so a post can show
   the film it is written from.

   ---------------------------------------------------------------------------
   PRIVATE BUCKET, SIGNED URL IN THE VIEW — AND WHY IT IS BAKED, NOT PER-READ
   ---------------------------------------------------------------------------
   The still frames live in a PRIVATE bucket (film-stills): a frame of a gated
   coaching film should not be public with a guessable, non-expiring URL. But the
   corpus is read by `blog_reader`, a SQL-only Postgres role that holds no storage
   credential and so cannot mint a signed URL per read. A Postgres VIEW cannot
   sign one either — signing is the storage API's job, not SQL's.

   So the signed URL is BAKED by the backfill: scripts/stills-backfill.ts uploads
   the still with the service role, signs a time-limited URL, and writes it into
   content_still.still_url, which this view exposes. The URL expires; the script
   is re-runnable and refreshes every one before it does (see STILL_URL_TTL_DAYS
   there). Private at rest, time-limited in flight, and usable by a consumer with
   no credentials — which is the whole point of the corpus.
   ========================================================================== */

-- ---- the private bucket ---------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('film-stills', 'film-stills', false)
  on conflict (id) do nothing;

-- No storage.objects policy is added: the backfill writes with the service role
-- (which bypasses storage RLS), and reads happen through the baked signed URL, so
-- no app role — advisor, anon or blog_reader — needs direct object access.

-- ---- the still, 1:1 with content ------------------------------------------
create table if not exists content_still (
  content_id uuid primary key references content(id) on delete cascade,
  /** The object path in film-stills, e.g. '<content_id>.jpg'. */
  object_path text not null,
  /** A signed URL to that object, refreshed by the backfill before it expires. */
  still_url text not null,
  signed_until timestamptz not null,
  source text not null default 'mux_thumbnail',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table content_still is
  'A still frame per film (Mux thumbnail), in the private film-stills bucket, with '
  'a baked time-limited signed URL. Written by scripts/stills-backfill.ts (service '
  'role); read by the blog_corpus_films view (definer). Re-run to refresh URLs.';

-- Locked by default: RLS on, no policy. Service role writes; the definer view
-- reads as owner. No app role touches it directly.
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
         -- so still_url follows 0155's final column rather than slotting beside
         -- the transcript.
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
  'to the certification for track/module names, plus the transcript and a baked '
  'signed still_url. Parked films (library_reason set) are included. transcript '
  'and still_url are null until backfilled.';
