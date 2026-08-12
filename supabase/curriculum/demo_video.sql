-- ============================================================================
-- EDIAGD — attach the sample video to The Walk-Around, for the demo
--
--   psql "$DATABASE_URL" -f supabase/curriculum/demo_video.sql   (from repo root)
--
-- WHY THIS EXISTS. Every module in the deck now has a video slot, and every one
-- of them is currently a placeholder — which means the player, the 90%
-- completion threshold, and video progress have never been exercised against a
-- real file. This attaches the one video the repo actually ships to a single
-- module so that path can be walked end to end.
--
-- IT IS THE LOGIN BACKGROUND CLIP: nine seconds of ambient beach footage, not
-- coaching material. It is therefore tagged in `source` with the word "sample",
-- which is the convention the deck reads to stamp a SAMPLE chip on the card.
-- Nobody should be able to look at this in a demo and mistake it for content.
-- Nine seconds is also convenient: the 90% bar arrives after about eight, so
-- the completion path can be tested without sitting through anything.
--
-- WHAT IT CHANGES. It adds ONE published content row to "1. The Walk-Around
-- Routine", so that module goes from 3 items to 4 and now requires the video to
-- be watched before the quiz opens. That is the correct behaviour — a video is
-- real work — but it does mean anyone mid-way through that module gains an item.
--
-- TO REMOVE IT: the delete at the bottom of this file, commented out.
--
-- Idempotent: re-running does nothing once the row exists.
-- ============================================================================

begin;

insert into content
  (type, title, body, video_url, duration_sec, status, source,
   module_id, module_order)
select
  'advisor_video',
  'Watch First — The Walk-Around',
  'A sample clip standing in for the module video. The real walkthrough lands '
  || 'with the video pipeline; this one is here so the player works.',
  '/video/ediagd-login.mp4',
  9,
  'published',
  'Sample — login background clip, stand-in for the module video',
  m.id,
  0                                  -- ahead of the cues, though the deck also
                                     -- sorts videos first regardless
from module m
join course c on c.id = m.course_id
where c.name = 'The Walk-Around'
  and m.name = '1. The Walk-Around Routine'
  -- One video per module, and never a second copy of this one.
  and not exists (
    select 1 from content ct
     where ct.module_id = m.id
       and ct.type = 'advisor_video'
  );

\echo ''
\echo '================ DEMO VIDEO ================'
select c.name as course, m.name as module, ct.title, ct.video_url,
       ct.duration_sec, ct.status, ct.source
from content ct
join module m on m.id = ct.module_id
join course c on c.id = m.course_id
where ct.type = 'advisor_video'
order by c.name, m.sort_order;

\echo ''
\echo '-- the module the video landed in, item count now --'
select m.name as module,
       count(*) filter (where ct.status = 'published') as published_items,
       count(*) filter (where ct.type = 'advisor_video') as videos
from module m
join course c on c.id = m.course_id
left join content ct on ct.module_id = m.id
where c.name = 'The Walk-Around'
group by m.name, m.sort_order
order by m.sort_order;

commit;

-- To take it back out again:
--
--   delete from content
--    where type = 'advisor_video'
--      and source like 'Sample —%';
--
-- content_progress rows referencing it cascade, so anyone who "watched" the
-- sample loses that completion — which is right, because the item is gone.
-- Sand Dollars already paid are NOT clawed back: the ledger is append-only by
-- design, and un-paying someone for a demo would be a worse bug than the one
-- being fixed.
